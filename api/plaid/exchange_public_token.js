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

  // Placeholder for future Plaid /item/public_token/exchange.
  // Do not store real Plaid access tokens in localStorage or frontend code.
  return sendJson(res, 200, {
    ok: true,
    mode: "mock",
    item_id: "item-sandbox-placeholder",
    message: "Mock public_token exchange succeeded. No real token was stored."
  });
};
