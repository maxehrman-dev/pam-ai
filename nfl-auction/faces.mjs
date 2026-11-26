// Player headshots, looked up live from ESPN's public NFL data and cached in the browser.
// Current players come from each team's roster feed; all-time legends come from ESPN's player search.
// Anything that can't be found (or fails to load) falls back to an initials avatar in team colors.
import { getTeam } from "./data.mjs";

const ESPN_TEAM_IDS = {
  ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, HOU: 34, IND: 11, JAX: 30, KC: 12,
  LV: 13, LAC: 24, LAR: 14, MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, PIT: 23, SF: 25, SEA: 26, TB: 27, TEN: 10, WAS: 28
};
const ROSTER_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`;
const SEARCH_URL = (q) => `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=6&type=player&sport=football&league=nfl`;
const HEADSHOT_URL = (id) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
const CACHE_KEY = "nflad:faces:v1";
const TTL_MS = 1000 * 60 * 60 * 24 * 7;
const UNIT_POSITIONS = new Set(["OL", "DST"]);

// name key -> { url: string ("" = known to have no face), ts }
let cache = {};
try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
} catch (_e) {
  cache = {};
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_e) {
      /* storage is optional */
    }
  }, 300);
}

export function nameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function initials(name) {
  const parts = String(name).replace(/\b(Jr\.|Sr\.|II|III|IV)$/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function fresh(entry) {
  return entry && Date.now() - entry.ts < TTL_MS;
}

// Synchronous: the headshot URL if we already know it, else null.
export function faceUrl(entry) {
  if (!entry || UNIT_POSITIONS.has(entry.pos)) return null;
  const hit = cache[nameKey(entry.name)];
  return hit && hit.url ? hit.url : null;
}

export function markBroken(url) {
  for (const k of Object.keys(cache)) if (cache[k].url === url) cache[k] = { url: "", ts: Date.now() };
  save();
}

const rosterLoads = {};
async function loadRoster(teamId) {
  const espnId = ESPN_TEAM_IDS[teamId];
  if (!espnId) return false;
  if (rosterLoads[teamId]) return rosterLoads[teamId];
  rosterLoads[teamId] = (async () => {
    const res = await fetch(ROSTER_URL(espnId));
    if (!res.ok) throw new Error(`roster ${res.status}`);
    const json = await res.json();
    let added = false;
    for (const group of json.athletes || []) {
      for (const a of group.items || []) {
        const key = nameKey(a.fullName || a.displayName);
        const url = a.headshot?.href || (a.id ? HEADSHOT_URL(a.id) : "");
        if (key && url && /^https:\/\/a\.espncdn\.com\//.test(url)) {
          if (!cache[key] || cache[key].url !== url) added = true;
          cache[key] = { url, ts: Date.now() };
        }
      }
    }
    save();
    return added;
  })().catch(() => false); // remembered for the session, so an outage isn't retried on every render
  return rosterLoads[teamId];
}

const searches = {};
async function searchPlayer(name) {
  const key = nameKey(name);
  if (searches[key]) return searches[key];
  searches[key] = (async () => {
    const res = await fetch(SEARCH_URL(name));
    if (!res.ok) throw new Error(`search ${res.status}`);
    const json = await res.json();
    const items = (json.items || json.results?.flatMap((r) => r.contents || []) || []).filter(Boolean);
    // Only accept an exact name match, so a namesake never gets the wrong face.
    const hit = items.find((it) => nameKey(it.displayName || it.name || it.fullName) === key);
    const id = hit && (String(hit.id || "").match(/^\d+$/) ? hit.id : String(hit.uid || "").match(/a:(\d+)/)?.[1]);
    const url = hit?.headshot?.href || (id ? HEADSHOT_URL(id) : "");
    cache[key] = { url: /^https:\/\/a\.espncdn\.com\//.test(url) ? url : "", ts: Date.now() };
    save();
    return Boolean(cache[key].url);
  })().catch(() => false);
  return searches[key];
}

// Ask for faces for these players. Calls onUpdate once if any new face became available.
let queue = Promise.resolve();
export function wantFaces(mode, entries, onUpdate) {
  if (typeof fetch !== "function") return;
  const people = entries.filter((e) => e && !UNIT_POSITIONS.has(e.pos) && !fresh(cache[nameKey(e.name)]));
  if (!people.length) return;
  const teams = mode === "current" ? [...new Set(people.map((e) => e.team))] : [];
  const legends = mode === "current" ? [] : people.map((e) => e.name);
  queue = queue.then(async () => {
    let added = false;
    for (const t of teams) added = (await loadRoster(t)) || added;
    for (let i = 0; i < legends.length; i += 3) {
      const batch = await Promise.all(legends.slice(i, i + 3).map(searchPlayer));
      added = batch.some(Boolean) || added;
    }
    // Current players missing from a roster feed (trades, injured reserve) get one search each.
    if (mode === "current") {
      const missing = people.filter((e) => !fresh(cache[nameKey(e.name)])).map((e) => e.name);
      for (const n of missing) added = (await searchPlayer(n)) || added;
    }
    if (added && onUpdate) onUpdate();
  });
}

export function teamColor(teamId) {
  const t = getTeam(teamId);
  return t ? (t.colors[0] === "#000000" ? "#2a2f3a" : t.colors[0]) : "#334155";
}
