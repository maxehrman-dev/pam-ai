const { exchangePublicToken } = require("./_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, validatePayload } = require("./_lib/security.js");

const legacyExchangeSchema = {
  properties: {
    publicToken: { type: "string", minLength: 10, maxLength: 256 },
    institution: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 }
      }
    }
  },
  required: ["publicToken"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const payload = validatePayload(req.body, legacyExchangeSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "plaid:legacy-exchange",
        userKey: payload.publicToken,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 20 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 6 }
      })
    ) {
      return;
    }

    const result = await exchangePublicToken(payload);
    return sendJson(res, 200, {
      ok: true,
      snapshot: result.snapshot,
      itemId: result.itemId,
      institutionName: result.institutionName
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to exchange the Plaid public token."
    });
  }
};
