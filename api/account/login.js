const { loginAccount } = require("../_lib/account-store.js");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const emailAddress = String(body.emailAddress || "").trim();
    const password = String(body.password || "");

    if (!emailAddress || !password) {
      return sendJson(res, 400, {
        ok: false,
        error: "Email and password are required."
      });
    }

    const result = loginAccount({ emailAddress, password });
    return sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to sign in."
    });
  }
};
