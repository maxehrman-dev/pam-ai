const { buildNormalizedBaseline, getStoredSession, hasPlaidConfig } = require("../_lib/plaid.js");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
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
    const clientUserId = req.query?.clientUserId || "prototype";
    const session = getStoredSession(clientUserId);
    if (!session?.accessToken) {
      return sendJson(res, 200, {
        ok: false,
        mode: "mock",
        fallback: true,
        error: "No sandbox session was found for this browser yet."
      });
    }

    const baseline = await buildNormalizedBaseline({ clientUserId });
    return sendJson(res, 200, {
      ok: true,
      mode: "sandbox",
      baseline
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      mode: "mock",
      fallback: true,
      error: error.message || "Unable to build a baseline from Plaid Sandbox."
    });
  }
};
