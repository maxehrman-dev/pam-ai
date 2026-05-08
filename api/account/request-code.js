const { createVerificationRequest } = require("../_lib/account-store.js");

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
    const result = createVerificationRequest({
      emailAddress,
      purpose: "signup"
    });

    return sendJson(res, 200, {
      ok: true,
      requestId: result.requestId,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      previewCode: result.previewCode,
      deliveryMode: "prototype_preview"
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to send a verification code."
    });
  }
};
