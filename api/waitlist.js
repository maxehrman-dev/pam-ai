const { hitSharedLimit } = require("./_lib/sharedLimits.js");
const { hasEmailProvider, isResendTestingRestriction, sendWaitlistConfirmation, sendWaitlistNotification, syncWaitlistContact } = require("./_lib/email.js");
const { reportServerError, withErrorReporting } = require("./_lib/observability.js");
const { getCachedRuntimeSettings, loadRuntimeSettings } = require("./_lib/runtimeSettings.js");
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkDailyUsageBudget, checkRateLimit, validatePayload } = require("./_lib/security.js");
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

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "").trim() || "";
}

function isEmailPaused() {
  if (getCachedRuntimeSettings().disableEmail === true) return true;
  return ["1", "true", "yes", "on"].includes(String(process.env.PAM_DISABLE_EMAIL || process.env.DISABLE_EMAIL || "").trim().toLowerCase());
}

async function syncWaitlistToSheet(entry, req) {
  const webhookUrl = String(process.env.GOOGLE_SHEETS_WAITLIST_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return "not_configured";

  const signedUpAt = new Date().toISOString();
  const webhookSecret = String(process.env.GOOGLE_SHEETS_WAITLIST_SECRET || "").trim();
  const payload = {
    signedUpAt,
    emailAddress: entry.emailAddress,
    fullName: entry.fullName || "",
    age: entry.age ?? "",
    stage: entry.stage || "",
    purposeIntention: entry.goal || "",
    source: "pamadvisor.com",
    page: "/waitlist",
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
    ipHint: getRequestIp(req).slice(0, 80),
    ...(webhookSecret ? { secret: webhookSecret } : {})
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      ...(webhookSecret ? { "x-pam-sheets-secret": webhookSecret } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Google Sheets waitlist sync failed.");
  }
  return "synced";
}

function readEmailDailyLimit() {
  const parsed = Number.parseInt(String(process.env.PAM_EMAIL_GLOBAL_DAILY_LIMIT || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

const __pamRouteHandler = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    await loadRuntimeSettings();
    const body = validatePayload(req.body, waitlistSchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "waitlist",
        userKey: body.emailAddress,
        ipLimit: { windowMs: 10 * 60 * 1000, max: 8 },
        userLimit: { windowMs: 60 * 60 * 1000, max: 3 }
      })
    ) {
      return;
    }

    if (
      !checkDailyUsageBudget(req, res, {
        routeKey: "waitlist",
        userKey: body.emailAddress,
        ipDailyLimit: 25,
        userDailyLimit: 5,
        envLimitKey: "PAM_EMAIL"
      })
    ) {
      return;
    }

    let deliveryMode = "saved";
    let warning = "";
    let stored = hasSupabaseConfig() ? "supabase" : "prototype";
    let newsletter = "not_configured";
    let googleSheet = "not_configured";

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

    // One email batch per address per day (repeat signups don't re-send) and a
    // daily ceiling on waitlist emails overall. The signup is saved either way.
    const emailBudgetOk = !hasEmailProvider() || isEmailPaused()
      ? false
      : (await hitSharedLimit(`waitlist-email:user:${String(body.emailAddress).toLowerCase()}`, 24 * 60 * 60, 1)) &&
        (await hitSharedLimit("waitlist-email:global", 24 * 60 * 60, readEmailDailyLimit()));
    if (emailBudgetOk) {
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
    } else if (!hasEmailProvider() || isEmailPaused()) {
      warning = warning || (isEmailPaused() ? "Email delivery is temporarily paused." : "Email delivery is not configured.");
    }

    try {
      googleSheet = await syncWaitlistToSheet({
        emailAddress: body.emailAddress,
        fullName: body.fullName || "",
        age: body.age ?? null,
        stage: body.stage || "",
        goal: body.goal || ""
      }, req);
    } catch (_error) {
      googleSheet = "sync_failed";
    }

    return sendJson(res, 200, {
      ok: true,
      deliveryMode,
      stored,
      newsletter,
      googleSheet,
      warning
    });
  } catch (error) {
    if (!error?.statusCode || error.statusCode >= 500) {
      await reportServerError(error, { route: "waitlist", method: "POST", statusCode: 500 });
    }
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: "Unable to join the waitlist right now. Please try again."
    });
  }
};

module.exports = withErrorReporting("waitlist", __pamRouteHandler);
