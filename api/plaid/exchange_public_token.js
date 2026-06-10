const { exchangePublicToken, hasPlaidConfig, storeAccessTokenForSession } = require("../_lib/plaid.js");
const { withErrorReporting } = require("../_lib/observability.js");
const { hasClerkConfig, verifyClerkToken } = require("../_lib/clerk.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { STATE_PATTERN, assertServiceEnabled, checkDailyUsageBudget, checkRateLimit, validatePayload } = require("../_lib/security.js");
const { hasSupabaseConfig, upsertPlaidItem } = require("../_lib/supabase.js");

const exchangeSchema = {
  properties: {
    clientUserId: { type: "string", minLength: 3, maxLength: 128 },
    accountId: { type: "string", minLength: 3, maxLength: 128 },
    public_token: { type: "string", minLength: 10, maxLength: 256 },
    institution: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 }
      }
    },
    profile: {
      type: "object",
      properties: {
        firstName: { type: "string", minLength: 1, maxLength: 60 },
        emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
        age: { type: "integer", minimum: 13, maximum: 120, allowNull: true },
        state: { type: "string", minLength: 2, maxLength: 5, uppercase: true, pattern: STATE_PATTERN },
        employmentStatus: { type: "string", minLength: 2, maxLength: 40 }
      }
    }
  },
  required: ["clientUserId", "public_token"]
};

const __pamRouteHandler = async (req, res) => {
  if (req.method !== "POST") {
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
    const body = validatePayload(req.body, exchangeSchema, "request body");
    const clerkAccount = hasClerkConfig() ? await verifyClerkToken(req.headers?.authorization) : null;
    if (hasClerkConfig() && !clerkAccount?.id) {
      return sendJson(res, 401, { ok: false, error: "Sign in before connecting a Sandbox account." });
    }
    const clientUserId = clerkAccount?.id || body.clientUserId;
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
        routeKey: "plaid:exchange-public-token",
        userKey: clientUserId,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 10 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 5 }
      })
    ) {
      return;
    }

    if (
      !checkDailyUsageBudget(req, res, {
        routeKey: "plaid:exchange-public-token",
        userKey: clientUserId,
        ipDailyLimit: 40,
        userDailyLimit: 12,
        envLimitKey: "PAM_PLAID"
      })
    ) {
      return;
    }

    const exchange = await exchangePublicToken({
      publicToken: body.public_token,
      institution: body.institution || null
    });

    // Data-ownership ID must come from a verified Clerk session only. A browser-supplied
    // accountId could attach this institution's token to another user's account (IDOR),
    // so we ignore body.accountId entirely and only persist when Clerk verified the owner.
    const accountId = clerkAccount?.id || "";

    storeAccessTokenForSession({
      clientUserId,
      accessToken: exchange.accessToken,
      itemId: exchange.itemId,
      institutionName: exchange.institutionName,
      profile: body.profile || {}
    });

    if (accountId && hasSupabaseConfig()) {
      await upsertPlaidItem({
        accountId,
        plaidItemId: exchange.itemId,
        institutionName: exchange.institutionName,
        accessTokenReference: exchange.accessToken
      });
    }

    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      item_id: exchange.itemId,
      institution_name: exchange.institutionName
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to exchange Plaid Sandbox public token."
    });
  }
};

module.exports = withErrorReporting("plaid/exchange_public_token", __pamRouteHandler);
