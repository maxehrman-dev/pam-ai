const { createLinkToken, hasPlaidConfig } = require("../_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

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
      !checkRateLimit(req, res, {
        routeKey: "plaid:create-link-token",
        userKey: body.clientUserId,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 20 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 10 }
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
