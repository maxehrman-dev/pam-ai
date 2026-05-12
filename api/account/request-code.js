const { createVerificationRequest } = require("../_lib/account-store.js");
const { hasEmailProvider, sendVerificationEmail } = require("../_lib/email.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const requestCodeSchema = {
  properties: {
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    firstName: { type: "string", minLength: 1, maxLength: 60 }
  },
  required: ["emailAddress", "firstName"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const body = validatePayload(req.body, requestCodeSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:request-code",
        userKey: body.emailAddress,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 10 },
        userLimit: { windowMs: 10 * 60 * 1000, max: 4 }
      })
    ) {
      return;
    }

    const { emailAddress, firstName } = body;
    const result = createVerificationRequest({
      emailAddress,
      purpose: "signup"
    });

    let deliveryMode = "prototype_preview";
    let previewCode = result.previewCode;

    if (hasEmailProvider()) {
      await sendVerificationEmail({
        emailAddress,
        firstName,
        verificationCode: result.previewCode
      });
      deliveryMode = "email";
      previewCode = "";
    }

    return sendJson(res, 200, {
      ok: true,
      requestId: result.requestId,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      previewCode,
      deliveryMode
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to send a verification code."
    });
  }
};
