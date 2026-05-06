const { clearSession, getSessionAccount } = require("../_lib/account-store.js");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function getSessionToken(req) {
  return req.query?.sessionToken || req.body?.sessionToken || "";
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const account = getSessionAccount(getSessionToken(req));
    return sendJson(res, 200, {
      ok: Boolean(account),
      account
    });
  }

  if (req.method === "DELETE") {
    clearSession(getSessionToken(req));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};
