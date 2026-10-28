// Runtime switches the founder flips from /admin, no deploy needed. Stored as
// append-only "settings_updated" rows in pam_events (no extra table), so every
// change is also an audit log. Cached briefly per serverless instance. Env
// kill switches still win: if Vercel says off, it's off.

const { hasSupabaseConfig, insertTelemetryEvent, supabaseRequest } = require("./supabase.js");

const DEFAULTS = Object.freeze({
  launchGate: null,
  disableAi: false,
  disablePlaid: false,
  disableEmail: false,
  announcement: "",
  inviteCodes: []
});

// Invite codes the founder creates from /admin, on top of DEMO_ACCESS_CODE.
// Same normalization as the invite check: lowercase, single spaces.
const MAX_INVITE_CODES = 25;
function normalizeInviteCode(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function sanitizeInviteCodes(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const codes = [];
  for (const raw of list) {
    const code = normalizeInviteCode(raw);
    if (!/^[a-z0-9][a-z0-9 -]{2,38}[a-z0-9]$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= MAX_INVITE_CODES) break;
  }
  return codes;
}
const CACHE_MS = 30 * 1000;
let cache = { value: null, loadedAt: 0 };

function sanitizeSettings(raw = {}) {
  const next = {};
  if (raw.launchGate === true || raw.launchGate === false || raw.launchGate === null) next.launchGate = raw.launchGate;
  for (const key of ["disableAi", "disablePlaid", "disableEmail"]) {
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  }
  if (typeof raw.announcement === "string") next.announcement = raw.announcement.replace(/\s+/g, " ").trim().slice(0, 160);
  const inviteCodes = sanitizeInviteCodes(raw.inviteCodes);
  if (inviteCodes) next.inviteCodes = inviteCodes;
  return next;
}

async function loadRuntimeSettings({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.loadedAt < CACHE_MS) return cache.value;
  if (!hasSupabaseConfig()) return { ...DEFAULTS };
  try {
    const rows = await supabaseRequest("pam_events?select=properties,created_at&event_type=eq.admin&event_name=eq.settings_updated&order=created_at.desc&limit=1");
    const latest = Array.isArray(rows) && rows[0] ? sanitizeSettings(rows[0].properties || {}) : {};
    cache = { value: { ...DEFAULTS, ...latest }, loadedAt: Date.now() };
  } catch (_error) {
    // Settings must never take the app down; fall back to defaults/env.
    cache = { value: cache.value || { ...DEFAULTS }, loadedAt: Date.now() };
  }
  return cache.value;
}

function getCachedRuntimeSettings() {
  return cache.value || { ...DEFAULTS };
}

async function saveRuntimeSettings(patch) {
  const current = await loadRuntimeSettings({ force: true });
  const next = { ...current, ...sanitizeSettings(patch) };
  await insertTelemetryEvent({ eventType: "admin", eventName: "settings_updated", page: "/admin", properties: next });
  cache = { value: next, loadedAt: Date.now() };
  return next;
}

async function listSettingsHistory(limit = 10) {
  if (!hasSupabaseConfig()) return [];
  try {
    const rows = await supabaseRequest(`pam_events?select=properties,created_at&event_type=eq.admin&event_name=eq.settings_updated&order=created_at.desc&limit=${Math.min(Math.max(Number(limit) || 10, 1), 50)}`);
    return (rows || []).map((row) => ({ settings: sanitizeSettings(row.properties || {}), when: row.created_at }));
  } catch (_error) {
    return [];
  }
}

module.exports = { DEFAULTS, MAX_INVITE_CODES, getCachedRuntimeSettings, listSettingsHistory, loadRuntimeSettings, normalizeInviteCode, sanitizeSettings, saveRuntimeSettings };
