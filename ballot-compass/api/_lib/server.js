// Shared plumbing for the Ballot Compass API routes: JSON I/O, origin checks,
// rate limits, kill switch and Supabase REST calls. No secrets reach the browser.
import { createHash } from 'node:crypto';

const MAX_BODY_BYTES = 16 * 1024;
const DAY_SECONDS = 24 * 60 * 60;
const memoryHits = new Map();
let sharedLimitsDownUntil = 0;

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload === undefined ? '' : JSON.stringify(payload));
}

export function collectionEnabled() {
  return String(process.env.BC_COLLECTION || 'on').toLowerCase() !== 'off';
}

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Accepts same-origin browser requests only (no third-party sites posting on a visitor's behalf). */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients; still rate limited and validated
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export async function readJson(req) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'Request is too large.', status: 413 };
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return { error: 'Send JSON.', status: 415 };
  }
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return { body: req.body };
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (text.length > MAX_BODY_BYTES) return { error: 'Request is too large.', status: 413 };
    try { return { body: JSON.parse(text) }; } catch { return { error: 'Invalid JSON.', status: 400 }; }
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { error: 'Request is too large.', status: 413 };
    chunks.push(chunk);
  }
  try { return { body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }; } catch { return { error: 'Invalid JSON.', status: 400 }; }
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  return fwd || String(req.headers['x-real-ip'] || '').trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** Salted, day-rotating hash so rate-limit keys never contain a raw IP address. */
function ipKey(req) {
  const salt = process.env.BC_RATE_LIMIT_SALT || 'ballot-compass';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${salt}:${day}:${clientIp(req)}`).digest('hex').slice(0, 32);
}

function memoryLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + windowMs });
    if (memoryHits.size > 5000) for (const [k, v] of memoryHits) if (v.resetAt <= now) memoryHits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function readLimit(name, fallback) {
  const n = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function sharedLimit(key, windowSeconds, limit) {
  if (Date.now() < sharedLimitsDownUntil) return true;
  try {
    const allowed = await supabase('rpc/bc_hit_limit', { method: 'POST', body: { p_key: key, p_window_seconds: windowSeconds, p_limit: limit } });
    return allowed !== false;
  } catch (err) {
    sharedLimitsDownUntil = Date.now() + 60 * 1000;
    console.warn(`[ballot-compass] shared limits unavailable, using in-memory only: ${err.message}`);
    return true;
  }
}

/**
 * Per-visitor burst limit (in memory), per-visitor daily limit and a global daily cap (shared in Supabase).
 * Returns null when allowed, or { status, error } when blocked.
 */
export async function checkLimits(req, route, { perMinute, perDay, globalPerDay }) {
  const who = ipKey(req);
  if (!memoryLimit(`${route}:${who}`, perMinute, 60 * 1000)) return { status: 429, error: 'Too many requests. Wait a minute and try again.' };
  const [mine, everyone] = await Promise.all([
    sharedLimit(`${route}:ip:${who}`, DAY_SECONDS, readLimit(`BC_${route.toUpperCase()}_IP_DAILY`, perDay)),
    sharedLimit(`${route}:global`, DAY_SECONDS, readLimit(`BC_${route.toUpperCase()}_GLOBAL_DAILY`, globalPerDay)),
  ]);
  if (!mine) return { status: 429, error: 'Daily limit reached. Try again tomorrow.' };
  if (!everyone) return { status: 503, error: 'Sharing is paused for today. Try again tomorrow.' };
  return null;
}

export async function supabase(path, { method = 'GET', body, prefer } = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Common gatekeeping for both routes. Returns true if the request may proceed. */
export async function guard(req, res, route, methods, limits) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    send(res, 405, { error: 'Method not allowed.' });
    return false;
  }
  if (!sameOrigin(req)) { send(res, 403, { error: 'Cross-site requests are not accepted.' }); return false; }
  if (!collectionEnabled()) { send(res, 503, { error: 'Sharing is turned off right now.', code: 'disabled' }); return false; }
  if (!supabaseConfigured()) { send(res, 503, { error: 'Sharing is not set up yet.', code: 'not_configured' }); return false; }
  const blocked = await checkLimits(req, route, limits);
  if (blocked) { send(res, blocked.status, { error: blocked.error }); return false; }
  return true;
}
