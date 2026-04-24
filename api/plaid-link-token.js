const { createLinkToken } = require("./_lib/plaid.js");

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
    const payload = typeof req.body === "object" && req.body ? req.body : {};
    const result = await createLinkToken(payload);
    return sendJson(res, 200, {
      ok: true,
      linkToken: result.link_token,
      expiration: result.expiration
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to create a Plaid link token."
    });
  }
};
