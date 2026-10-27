// Cross-instance limits backed by Supabase (public.pam_hit_limit). The
// in-memory limits in security.js reset per serverless instance, so under load
// they multiply; these counters are shared by every instance. The global daily
// caps are the hard ceiling on what one day of traffic can cost.
// If the table isn't installed or Supabase is down, this steps aside for a
// minute and the in-memory limits keep working.

const { sendJson } = require("./http.js");
const { getClientIp } = require("./security.js");
const { hasSupabaseConfig, supabaseRequest } = require("./supabase.js");

const DAY_SECONDS = 24 * 60 * 60;
let unavailableUntil = 0;

function readLimit(envKey, fallback) {
  const parsed = Number.parseInt(String(process.env[envKey] || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function hitSharedLimit(key, windowSeconds, limit) {
  if (!hasSupabaseConfig() || Date.now() < unavailableUntil) return true;
  try {
    const allowed = await supabaseRequest("rpc/pam_hit_limit", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_limit: limit })
    });
    return allowed !== false;
  } catch (error) {
    unavailableUntil = Date.now() + 60 * 1000;
    console.warn(`[sharedLimits] falling back to in-memory limits: ${error.message}`);
    return true;
  }
}

// limits: { ipDaily, userDaily, globalDaily } with optional env overrides via
// envPrefix (e.g. PAM_AI -> PAM_AI_GLOBAL_DAILY_LIMIT).
async function checkSharedLimits(req, res, { routeKey, userKey = "", envPrefix = "", limits = {} }) {
  const env = (name) => (envPrefix ? `${envPrefix}_${name}` : "");
  const checks = [];
  if (limits.ipDaily) {
    checks.push({ key: `${routeKey}:ip:${getClientIp(req)}`, limit: readLimit(env("SHARED_IP_DAILY_LIMIT"), limits.ipDaily), status: 429, error: "Daily request limit reached. Please try again tomorrow." });
  }
  const user = String(userKey || "").trim().toLowerCase();
  if (limits.userDaily && user) {
    checks.push({ key: `${routeKey}:user:${user}`, limit: readLimit(env("SHARED_USER_DAILY_LIMIT"), limits.userDaily), status: 429, error: "Daily limit reached for this account. Please try again tomorrow." });
  }
  if (limits.globalDaily) {
    checks.push({ key: `${routeKey}:global`, limit: readLimit(env("GLOBAL_DAILY_LIMIT"), limits.globalDaily), status: 503, error: "PAM has hit today's limit for this feature. Please try again tomorrow." });
  }
  const results = await Promise.all(checks.map((check) => hitSharedLimit(check.key, DAY_SECONDS, check.limit)));
  const blocked = checks.find((_check, index) => !results[index]);
  if (blocked) {
    sendJson(res, blocked.status, { ok: false, error: blocked.error }, { "Retry-After": "3600" });
    return false;
  }
  return true;
}

module.exports = { checkSharedLimits, hitSharedLimit };
