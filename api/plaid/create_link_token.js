const { createLinkToken, hasPlaidConfig } = require("../_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { assertServiceEnabled, checkDailyUsageBudget, checkRateLimit, validatePayload } = require("../_lib/security.js");

const createLinkTokenSchema = {
  properties: {
    clientUserId: { type: "string", minLength: 3, maxLength: 128 },
    legalName: { type: "string", minLength: 1, maxLength: 120 },
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true }
  },
  required: ["clientUserId"]
};

module.exports = async (req, res) => {
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
    const body = validatePayload(req.body, createLinkTokenSchema, "request body");
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
        routeKey: "plaid:create-link-token",
        userKey: body.clientUserId,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 10 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 5 }
      })
    ) {
      return;
    }

    if (
      !checkDailyUsageBudget(req, res, {
        routeKey: "plaid:create-link-token",
        userKey: body.clientUserId,
        ipDailyLimit: 40,
        userDailyLimit: 12,
        envLimitKey: "PAM_PLAID"
      })
    ) {
      return;
    }

    const payload = await createLinkToken({
      clientUserId: body.clientUserId,
      legalName: body.legalName,
      emailAddress: body.emailAddress
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      link_token: payload.link_token
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to create Plaid Sandbox link token."
    });
  }
};
