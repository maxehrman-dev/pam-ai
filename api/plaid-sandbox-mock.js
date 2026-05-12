const { createSandboxPublicToken, exchangePublicToken } = require("./_lib/plaid.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, validatePayload } = require("./_lib/security.js");

const sandboxMockSchema = {
  properties: {
    institutionId: { type: "string", minLength: 3, maxLength: 64 },
    institutionName: { type: "string", minLength: 1, maxLength: 120 },
    username: { type: "string", minLength: 3, maxLength: 64 },
    password: { type: "string", minLength: 3, maxLength: 64, trim: false }
  },
  required: []
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const payload = validatePayload(req.body, sandboxMockSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "plaid:sandbox-mock",
        userKey: payload.institutionId || payload.username,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 10 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 6 }
      })
    ) {
      return;
    }
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
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to create Plaid sandbox mock data."
    });
  }
};
