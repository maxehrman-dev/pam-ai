const { buildNormalizedBaseline, getStoredSession, hasPlaidConfig } = require("../_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const baselineQuerySchema = {
  properties: {
    clientUserId: { type: "string", minLength: 3, maxLength: 128 }
  },
  required: ["clientUserId"]
};

module.exports = async (req, res) => {
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
    if (
      !checkRateLimit(req, res, {
        routeKey: "plaid:baseline",
        userKey: query.clientUserId,
        ipLimit: { windowMs: 5 * 60 * 1000, max: 30 },
        userLimit: { windowMs: 5 * 60 * 1000, max: 20 }
      })
    ) {
      return;
    }

    const clientUserId = query.clientUserId;
    const session = getStoredSession(clientUserId);
    if (!session?.accessToken) {
      return sendJson(res, 200, {
        ok: false,
        mode: "mock",
        fallback: true,
        error: "No sandbox session was found for this browser yet."
      });
    }

    const baseline = await buildNormalizedBaseline({ clientUserId });
    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      baseline
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to build a baseline from Plaid Sandbox."
    });
  }
};
