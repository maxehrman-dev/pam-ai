const { hasEmailProvider, hasNewsletterAudience } = require("../_lib/email.js");
const { getClerkPublishableKey, hasClerkConfig } = require("../_lib/clerk.js");
const { hasPlaidConfig } = require("../_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit } = require("../_lib/security.js");
const { checkSupabaseConnection } = require("../_lib/supabase.js");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return sendMethodNotAllowed(res);
  }

  if (
    !checkRateLimit(req, res, {
      routeKey: "integrations:status",
      ipLimit: { windowMs: 60 * 1000, max: 30 }
    })
  ) {
    return;
  }

  const supabase = await checkSupabaseConnection();

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
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "default"
    },
    clerk: {
      configured: hasClerkConfig()
    },
    clientConfig: {
      sentryDsn: process.env.SENTRY_DSN || "",
      posthogKey: process.env.POSTHOG_KEY || "phc_qex4UsyDAYzV2YhWodw9ePHBLfA8pTJ7pSaWZdip3pfr",
      posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      clerkPublishableKey: getClerkPublishableKey()
    }
  });
};
