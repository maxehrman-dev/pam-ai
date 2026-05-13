const { loginAccount } = require("../_lib/account-store.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const loginSchema = {
  properties: {
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    password: { type: "string", minLength: 1, maxLength: 128, trim: false }
  },
  required: ["emailAddress", "password"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const body = validatePayload(req.body, loginSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:login",
        userKey: body.emailAddress,
        ipLimit: { windowMs: 15 * 60 * 1000, max: 20 },
        userLimit: { windowMs: 15 * 60 * 1000, max: 10 }
      })
    ) {
      return;
    }

    const result = await loginAccount({ emailAddress: body.emailAddress, password: body.password });
    return sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to sign in."
    });
  }
};
