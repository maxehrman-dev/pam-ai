const { createAccount } = require("../_lib/account-store.js");

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
    const firstName = String(body.firstName || "").trim();
    const emailAddress = String(body.emailAddress || "").trim();
    const password = String(body.password || "");
    const verificationRequestId = String(body.verificationRequestId || "").trim();
    const verificationCode = String(body.verificationCode || "").trim();

    if (!firstName || !emailAddress || password.length < 8 || !verificationRequestId || !verificationCode) {
      return sendJson(res, 400, {
        ok: false,
        error: "First name, email, password, and a valid verification code are required."
      });
    }

    const result = createAccount({
      firstName,
      emailAddress,
      password,
      verificationRequestId,
      verificationCode,
      age: body.age ?? null,
      employmentStatus: body.employmentStatus || "Not sure yet",
      stateCode: body.stateCode || "OTHER"
    });

    return sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to create account."
    });
  }
};
