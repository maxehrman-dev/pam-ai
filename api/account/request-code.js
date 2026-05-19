const { checkVerificationRequest, createVerificationRequest } = require("../_lib/account-store.js");
const { hasEmailProvider, isResendTestingRestriction, sendVerificationEmail } = require("../_lib/email.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const requestCodeSchema = {
  properties: {
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    firstName: { type: "string", minLength: 1, maxLength: 60 }
  },
  required: ["emailAddress", "firstName"]
};

const checkCodeSchema = {
  properties: {
    action: { type: "string", enum: ["check_code"] },
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    verificationRequestId: { type: "string", minLength: 10, maxLength: 80 },
    verificationCode: { type: "string", minLength: 6, maxLength: 6, pattern: /^\d{6}$/ },
    verificationToken: { type: "string", maxLength: 512 }
  },
  required: ["action", "emailAddress", "verificationRequestId", "verificationCode"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    if (req.body?.action === "check_code") {
      const body = validatePayload(req.body, checkCodeSchema, "request body");
      if (
        !checkRateLimit(req, res, {
          routeKey: "account:check-code",
          userKey: body.emailAddress,
          ipLimit: { windowMs: 10 * 60 * 1000, max: 40 },
          userLimit: { windowMs: 10 * 60 * 1000, max: 20 }
        })
      ) {
        return;
      }

      await checkVerificationRequest({
        emailAddress: body.emailAddress,
        requestId: body.verificationRequestId,
        verificationCode: body.verificationCode,
        verificationToken: body.verificationToken || "",
        purpose: "signup"
      });

      return sendJson(res, 200, {
        ok: true,
        verified: true,
        message: "Code confirmed."
      });
    }

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
    const result = await createVerificationRequest({
      emailAddress,
      purpose: "signup"
    });

    let deliveryMode = "prototype_preview";
    let previewCode = result.previewCode;
    let warning = "";

    if (hasEmailProvider()) {
      try {
        await sendVerificationEmail({
          emailAddress,
          firstName,
          verificationCode: result.previewCode
        });
        deliveryMode = "email";
        previewCode = "";
        result.verificationToken = "";
      } catch (error) {
        if (!isResendTestingRestriction(error)) {
          throw error;
        }
      }
    }

    return sendJson(res, 200, {
      ok: true,
      requestId: result.requestId,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      previewCode,
      verificationToken: result.verificationToken,
      deliveryMode,
      warning
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to send a verification code."
    });
  }
};
