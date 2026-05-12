const { clearSession, getSessionAccount } = require("../_lib/account-store.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const querySchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 64, pattern: /^sess_[a-f0-9]+$/ }
  },
  required: []
};

function getSessionToken(req) {
  return req.query?.sessionToken || req.body?.sessionToken || "";
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const query = validatePayload(req.query, querySchema, "query");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:session:get",
        userKey: query.sessionToken,
        ipLimit: { windowMs: 60 * 1000, max: 120 },
        userLimit: { windowMs: 60 * 1000, max: 60 }
      })
    ) {
      return;
    }
    const account = getSessionAccount(getSessionToken(req));
    return sendJson(res, 200, {
      ok: Boolean(account),
      account
    });
  }

  if (req.method === "DELETE") {
    const body = validatePayload(req.body, querySchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:session:delete",
        userKey: body.sessionToken,
        ipLimit: { windowMs: 5 * 60 * 1000, max: 40 },
        userLimit: { windowMs: 5 * 60 * 1000, max: 20 }
      })
    ) {
      return;
    }
    clearSession(getSessionToken(req));
    return sendJson(res, 200, { ok: true });
  }

  return sendMethodNotAllowed(res);
};
