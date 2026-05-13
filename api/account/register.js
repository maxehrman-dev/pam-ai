const { createAccount } = require("../_lib/account-store.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { STATE_PATTERN, checkRateLimit, validatePayload } = require("../_lib/security.js");

const registerSchema = {
  properties: {
    firstName: { type: "string", minLength: 1, maxLength: 60 },
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    password: { type: "string", minLength: 8, maxLength: 128, trim: false },
    verificationRequestId: { type: "string", minLength: 10, maxLength: 64, pattern: /^verify_[a-f0-9]+$/ },
    verificationCode: { type: "string", minLength: 6, maxLength: 6, pattern: /^\d{6}$/ },
    verificationToken: { type: "string", minLength: 20, maxLength: 512 },
    age: { type: "integer", minimum: 13, maximum: 120, allowNull: true },
    employmentStatus: { type: "string", minLength: 2, maxLength: 40 },
    stateCode: { type: "string", minLength: 2, maxLength: 5, uppercase: true, pattern: STATE_PATTERN }
  },
  required: ["firstName", "emailAddress", "password", "verificationRequestId", "verificationCode"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const body = validatePayload(req.body, registerSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:register",
        userKey: body.emailAddress,
        ipLimit: { windowMs: 60 * 60 * 1000, max: 12 },
        userLimit: { windowMs: 60 * 60 * 1000, max: 5 }
      })
    ) {
      return;
    }

    const result = await createAccount({
      firstName: body.firstName,
      emailAddress: body.emailAddress,
      password: body.password,
      verificationRequestId: body.verificationRequestId,
      verificationCode: body.verificationCode,
      verificationToken: body.verificationToken || "",
      age: body.age ?? null,
      employmentStatus: body.employmentStatus || "Not sure yet",
      stateCode: body.stateCode || "OTHER"
    });

    return sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to create account."
    });
  }
};
