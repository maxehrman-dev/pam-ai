const { hasEmailProvider, isResendTestingRestriction, sendWaitlistConfirmation, sendWaitlistNotification, syncWaitlistContact } = require("./_lib/email.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, validatePayload } = require("./_lib/security.js");
const { hasSupabaseConfig, isRecoverableSupabaseStorageError, upsertWaitlistEntry, upsertWaitlistEntryLegacy } = require("./_lib/supabase.js");

const waitlistSchema = {
  properties: {
    emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
    fullName: { type: "string", maxLength: 120 },
    age: { type: "integer", minimum: 13, maximum: 120, allowNull: true },
    stage: { type: "string", maxLength: 80 },
    goal: { type: "string", maxLength: 220 }
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
    let stored = hasSupabaseConfig() ? "supabase" : "prototype";
    let newsletter = "not_configured";

    if (hasSupabaseConfig()) {
      try {
        await upsertWaitlistEntry({
          emailAddress: body.emailAddress,
          fullName: body.fullName || "",
          age: body.age ?? null,
          stage: body.stage || "",
          goal: body.goal || ""
        });
      } catch (error) {
        if (!isRecoverableSupabaseStorageError(error)) {
          throw error;
        }
        try {
          await upsertWaitlistEntryLegacy(body.emailAddress);
          stored = "supabase_legacy";
          warning = "Joined waitlist. Optional details will sync after the database schema updates.";
        } catch (_legacyError) {
          stored = "email_only";
          warning = "Joined waitlist. Storage is syncing.";
        }
      }
    }

    if (hasEmailProvider()) {
      try {
        newsletter = await syncWaitlistContact({
          emailAddress: body.emailAddress,
          fullName: body.fullName || "",
          age: body.age ?? null,
          stage: body.stage || "",
          goal: body.goal || ""
        });
        await sendWaitlistNotification({
          emailAddress: body.emailAddress,
          fullName: body.fullName || "",
          age: body.age ?? null,
          stage: body.stage || "",
          goal: body.goal || ""
        });
        await sendWaitlistConfirmation({
          emailAddress: body.emailAddress,
          fullName: body.fullName || ""
        });
        deliveryMode = "email";
      } catch (error) {
        if (!isResendTestingRestriction(error)) {
          throw error;
        }
        warning = warning || "Email confirmation needs a verified sending domain.";
      }
    } else {
      warning = warning || "Email delivery is not configured.";
    }

    return sendJson(res, 200, {
      ok: true,
      deliveryMode,
      stored,
      newsletter,
      warning
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 200, {
      ok: false,
      error: "Unable to join the waitlist right now. Please try again."
    });
  }
};
