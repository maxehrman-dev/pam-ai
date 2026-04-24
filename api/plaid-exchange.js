const { exchangePublicToken } = require("./_lib/plaid.js");

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
    if (!payload.publicToken) {
      return sendJson(res, 200, {
        ok: false,
        error: "Missing public token."
      });
    }

    const result = await exchangePublicToken(payload);
    return sendJson(res, 200, {
      ok: true,
      snapshot: result.snapshot,
      itemId: result.itemId,
      institutionName: result.institutionName
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to exchange the Plaid public token."
    });
  }
};
