const { applySecurityHeaders, sendJson } = require("./_lib/http.js");
const { checkRateLimit } = require("./_lib/security.js");

module.exports = (req, res) => {
  if (req.method !== "GET") {
    applySecurityHeaders(res);
    res.writeHead(405);
    res.end();
    return;
  }

  if (!checkRateLimit(req, res, {
    routeKey: "config",
    ipLimit: { windowMs: 60 * 1000, max: 60 }
  })) {
    return;
  }

  return sendJson(res, 200, {
    sentryDsn: process.env.SENTRY_DSN || "",
    posthogKey: process.env.POSTHOG_KEY || "phc_qex4UsyDAYzV2YhWodw9ePHBLfA8pTJ7pSaWZdip3pfr",
    posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com"
  });
};
