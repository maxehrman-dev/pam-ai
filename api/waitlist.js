const { hasEmailProvider, isResendTestingRestriction, sendWaitlistConfirmation, sendWaitlistNotification } = require("./_lib/email.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, validatePayload } = require("./_lib/security.js");
const { hasSupabaseConfig, upsertWaitlistEntry } = require("./_lib/supabase.js");

const waitlistSchema = {
  properties: {
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true }
  },
  required: ["emailAddress"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const body = validatePayload(req.body, waitlistSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "waitlist",
        userKey: body.emailAddress,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 20 },
        userLimit: { windowMs: 60 * 60 * 1000, max: 5 }
      })
    ) {
      return;
    }

    let deliveryMode = "saved";
    let warning = "";

    if (hasSupabaseConfig()) {
      await upsertWaitlistEntry(body.emailAddress);
    }

    if (hasEmailProvider()) {
      try {
        await sendWaitlistNotification({ emailAddress: body.emailAddress });
        await sendWaitlistConfirmation({ emailAddress: body.emailAddress });
        deliveryMode = "email";
      } catch (error) {
        if (!isResendTestingRestriction(error)) {
          throw error;
        }
        warning = "Email confirmation needs a verified sending domain.";
      }
    } else {
      warning = "Email delivery is not configured.";
    }

    return sendJson(res, 200, {
      ok: true,
      deliveryMode,
      stored: hasSupabaseConfig() ? "supabase" : "prototype",
      warning
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: error.message || "Unable to join the waitlist."
    });
  }
};
