const { hasEmailProvider, hasNewsletterAudience } = require("../_lib/email.js");
const { withErrorReporting } = require("../_lib/observability.js");
const { getClerkPublishableKey, hasClerkConfig } = require("../_lib/clerk.js");
const { hasPlaidConfig } = require("../_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, envFlagEnabled } = require("../_lib/security.js");
const { checkSupabaseConnection } = require("../_lib/supabase.js");
const { loadRuntimeSettings } = require("../_lib/runtimeSettings.js");

const __pamRouteHandler = async (req, res) => {
  if (req.method !== "GET") {
    return sendMethodNotAllowed(res);
  }
  const runtime = await loadRuntimeSettings();

  if (
    !checkRateLimit(req, res, {
      routeKey: "integrations:status",
      ipLimit: { windowMs: 60 * 1000, max: 30 }
    })
  ) {
    return;
  }

  const supabase = await checkSupabaseConnection();

  // Every page load asks for this and nothing in it is per-user, so let the
  // CDN answer repeats for 30s. Admin setting changes still land within ~1 min.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=30");
  return sendJson(res, 200, {
    ok: true,
    domain: process.env.PAM_SITE_URL || "https://pamadvisor.com",
    supabase,
    plaid: {
      configured: hasPlaidConfig(),
      mode: process.env.PLAID_ENV || "sandbox"
    },
    email: {
      configured: hasEmailProvider(),
      newsletterAudienceConfigured: hasNewsletterAudience()
    },
    ai: {
      provider: "anthropic",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5"
    },
    clerk: {
      configured: hasClerkConfig()
    },
    clientConfig: {
      requireSubscription: envFlagEnabled("PAM_REQUIRE_SUBSCRIPTION"),
      launchGate: typeof runtime.launchGate === "boolean" ? runtime.launchGate : envFlagEnabled("PAM_LAUNCH_GATE"),
      announcement: runtime.announcement || "",
      foundingClaimed: Number.parseInt(process.env.PAM_FOUNDING_CLAIMED || "0", 10) || 0,
      sentryDsn: process.env.SENTRY_DSN || "",
      posthogKey: process.env.POSTHOG_KEY || "phc_qex4UsyDAYzV2YhWodw9ePHBLfA8pTJ7pSaWZdip3pfr",
      posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      clerkPublishableKey: getClerkPublishableKey()
    }
  });
};

module.exports = withErrorReporting("integrations/status", __pamRouteHandler);
