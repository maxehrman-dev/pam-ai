const { exchangePublicToken, hasPlaidConfig, storeAccessTokenForSession } = require("../_lib/plaid.js");

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

  if (!hasPlaidConfig()) {
    return sendJson(res, 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: "Plaid Sandbox environment variables are not configured."
    });
  }

  try {
    const exchange = await exchangePublicToken({
      publicToken: req.body?.public_token,
      institution: req.body?.institution || null
    });

    storeAccessTokenForSession({
      clientUserId: req.body?.clientUserId,
      accessToken: exchange.accessToken,
      itemId: exchange.itemId,
      institutionName: exchange.institutionName,
      profile: req.body?.profile || {}
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      item_id: exchange.itemId,
      institution_name: exchange.institutionName
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to exchange Plaid Sandbox public token."
    });
  }
};
