// Uptime check for external monitors (UptimeRobot, Better Stack, etc.).
// Cheap on purpose: no database or upstream calls, so it can be pinged every
// minute. /api/integrations/status is the deeper check (it queries Supabase).
const { withErrorReporting } = require("./_lib/observability.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit } = require("./_lib/security.js");

const __pamRouteHandler = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendMethodNotAllowed(res);
  }
  if (!checkRateLimit(req, res, { routeKey: "health", ipLimit: { windowMs: 60 * 1000, max: 30 } })) {
    return;
  }
  return sendJson(res, 200, {
    ok: true,
    app: "PAM SI",
    version: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    time: new Date().toISOString()
  });
};

module.exports = withErrorReporting("health", __pamRouteHandler);
