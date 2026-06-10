const { buildNormalizedBaseline, getStoredSession, hasPlaidConfig } = require("../_lib/plaid.js");
const { withErrorReporting } = require("../_lib/observability.js");
const { hasClerkConfig, verifyClerkToken } = require("../_lib/clerk.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { assertServiceEnabled, checkDailyUsageBudget, checkRateLimit, validatePayload } = require("../_lib/security.js");
const { findLatestPlaidItemByAccountId, hasSupabaseConfig } = require("../_lib/supabase.js");

const baselineQuerySchema = {
  properties: {
    clientUserId: { type: "string", minLength: 3, maxLength: 128 },
    accountId: { type: "string", minLength: 3, maxLength: 128 }
  },
  required: ["clientUserId"]
};

const __pamRouteHandler = async (req, res) => {
  if (req.method !== "GET") {
    return sendMethodNotAllowed(res);
  }

  if (!hasPlaidConfig()) {
    return sendJson(res, 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: "Plaid Sandbox environment variables are not configured."
    });
  }

  try {
    const query = validatePayload(req.query, baselineQuerySchema, "query");
    const clerkAccount = hasClerkConfig() ? await verifyClerkToken(req.headers?.authorization) : null;
    if (hasClerkConfig() && !clerkAccount?.id) {
      return sendJson(res, 401, { ok: false, error: "Sign in before loading a Sandbox baseline." });
    }
    const clientUserId = clerkAccount?.id || query.clientUserId;
    // Data-ownership ID must come from a verified Clerk session only. Never trust a
    // browser-supplied accountId — doing so would let one user read another's stored
    // Plaid token/baseline (IDOR). When Clerk is not enforcing, we skip the
    // account-keyed Supabase lookup entirely and fall back to the ephemeral
    // per-browser session below (fail closed for cross-user data).
    const accountId = clerkAccount?.id || "";
    if (
      !assertServiceEnabled(res, {
        serviceName: "Plaid Sandbox",
        envKeys: ["PAM_DISABLE_PLAID", "DISABLE_PLAID"]
      })
    ) {
      return;
    }

    if (
      !checkRateLimit(req, res, {
        routeKey: "plaid:baseline",
        userKey: clientUserId,
        ipLimit: { windowMs: 5 * 60 * 1000, max: 18 },
        userLimit: { windowMs: 5 * 60 * 1000, max: 10 }
      })
    ) {
      return;
    }

    if (
      !checkDailyUsageBudget(req, res, {
        routeKey: "plaid:baseline",
        userKey: clientUserId,
        ipDailyLimit: 80,
        userDailyLimit: 30,
        envLimitKey: "PAM_PLAID"
      })
    ) {
      return;
    }

    let session = getStoredSession(clientUserId);
    if (accountId && hasSupabaseConfig()) {
      const plaidItem = await findLatestPlaidItemByAccountId(accountId);
      if (plaidItem?.access_token_reference) {
        session = {
          accessToken: plaidItem.access_token_reference,
          itemId: plaidItem.plaid_item_id,
          institutionName: plaidItem.institution_name,
          profile: {}
        };
      }
    }

    if (!session?.accessToken) {
      return sendJson(res, 200, {
        ok: false,
        mode: "mock",
        fallback: true,
        error: "No sandbox session was found for this browser yet."
      });
    }

    const baseline = await buildNormalizedBaseline({ clientUserId, session });
    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      baseline
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to build a baseline from Plaid Sandbox."
    });
  }
};

module.exports = withErrorReporting("plaid/baseline", __pamRouteHandler);
