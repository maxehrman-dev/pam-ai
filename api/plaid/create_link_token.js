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

  // Placeholder for future Plaid /link/token/create.
  // This repo intentionally does not create a real Plaid Link token yet.
  return sendJson(res, 200, {
    ok: true,
    mode: "mock",
    link_token: "link-sandbox-placeholder-token",
    message: "Mock Plaid link token generated for sandbox-style development only."
  });
};
