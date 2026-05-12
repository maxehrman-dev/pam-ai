const { createLinkToken } = require("./_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, validatePayload } = require("./_lib/security.js");

const legacyCreateLinkSchema = {
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

  try {
    const payload = validatePayload(req.body, legacyCreateLinkSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "plaid:legacy-link-token",
        userKey: payload.clientUserId,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 20 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 10 }
      })
    ) {
      return;
    }
    const result = await createLinkToken(payload);
    return sendJson(res, 200, {
      ok: true,
      linkToken: result.link_token,
      expiration: result.expiration
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to create a Plaid link token."
    });
  }
};
