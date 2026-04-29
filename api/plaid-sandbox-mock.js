const { createSandboxPublicToken, exchangePublicToken } = require("./_lib/plaid.js");

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
    const institutionId = payload.institutionId || "ins_109508";
    const username = payload.username || "user_good";
    const password = payload.password || "pass_good";

    const sandbox = await createSandboxPublicToken({
      institutionId,
      username,
      password
    });

    const result = await exchangePublicToken({
      publicToken: sandbox.public_token,
      institution: {
        institution_id: institutionId,
        name: payload.institutionName || "First Platypus Bank"
      }
    });

    return sendJson(res, 200, {
      ok: true,
      snapshot: result.snapshot,
      itemId: result.itemId,
      institutionName: result.institutionName,
      sandbox: {
        institutionId,
        username
      }
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: error.message || "Unable to create Plaid sandbox mock data."
    });
  }
};
