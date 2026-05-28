const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { getSessionAccount } = require("./_lib/account-store.js");
const { checkRateLimit, sanitizeText, validatePayload } = require("./_lib/security.js");
const { hasSupabaseConfig, insertFeedback, insertTelemetryEvent } = require("./_lib/supabase.js");

const POSTHOG_PROJECT_API_KEY = process.env.POSTHOG_PROJECT_API_KEY || "";
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

const telemetrySchema = {
  properties: {
    eventType: { type: "string", enum: ["product", "error", "security"] },
    eventName: { type: "string", minLength: 2, maxLength: 80, pattern: /^[a-z0-9_:-]+$/i },
    sessionId: { type: "string", maxLength: 120 },
    page: { type: "string", maxLength: 200 },
    properties: {
      type: "object",
      allowUnknown: true,
      properties: {
        feedbackMessage: { type: "string", maxLength: 1200 },
        rating: { type: "integer", minimum: 0, maximum: 5 },
        sessionToken: { type: "string", maxLength: 160 }
      }
    }
  },
  required: ["eventType", "eventName"]
};

function cleanProperties(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value)
    .slice(0, 30)
    .reduce((next, [key, rawValue]) => {
      const cleanKey = sanitizeText(key).slice(0, 80);
      if (!cleanKey) return next;

      if (typeof rawValue === "string") {
        next[cleanKey] = sanitizeText(rawValue).slice(0, 300);
        return next;
      }

      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        next[cleanKey] = rawValue;
        return next;
      }

      if (typeof rawValue === "boolean") {
        next[cleanKey] = rawValue;
      }

      return next;
    }, {});
}

function getFeedbackPayload(properties) {
  if (!properties || typeof properties !== "object") return null;
  const message = sanitizeText(properties.feedbackMessage || "").slice(0, 1200);
  if (message.length < 4) return null;
  const rating = Number(properties.rating || 0);
  return {
    message,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    sessionToken: sanitizeText(properties.sessionToken || "").slice(0, 160)
  };
}

async function forwardToPostHog({ eventName, sessionId, page, properties }) {
  if (!POSTHOG_PROJECT_API_KEY) return false;

  try {
    const response = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_API_KEY,
        event: eventName,
        distinct_id: sessionId || "anonymous",
        properties: {
          ...properties,
          page
        }
      })
    });

    return response.ok;
  } catch (_error) {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const body = validatePayload(req.body, telemetrySchema, "request body");
    const userKey = body.sessionId || req.headers["x-forwarded-for"] || "";

    if (
      !checkRateLimit(req, res, {
        routeKey: "telemetry",
        userKey,
        ipLimit: { windowMs: 60 * 1000, max: 120 },
        userLimit: { windowMs: 60 * 1000, max: 60 }
      })
    ) {
      return;
    }

    const event = {
      eventType: body.eventType,
      eventName: body.eventName,
      sessionId: body.sessionId || "",
      page: body.page || "",
      properties: cleanProperties(body.properties)
    };
    delete event.properties.sessionToken;
    const feedback = body.eventName === "feedback_submitted" ? getFeedbackPayload(body.properties) : null;

    let stored = hasSupabaseConfig() ? "pending" : "not_configured";
    let feedbackStored = "none";
    let forwarded = false;

    if (hasSupabaseConfig()) {
      try {
        if (feedback) {
          let account = null;
          if (feedback.sessionToken) {
            account = await getSessionAccount(feedback.sessionToken);
          }
          await insertFeedback({
            accountId: account?.id || "",
            emailAddress: account?.emailAddress || "",
            page: event.page,
            rating: feedback.rating,
            message: feedback.message
          });
          feedbackStored = "supabase";
        }
        await insertTelemetryEvent(event);
        stored = "supabase";
      } catch (_error) {
        stored = "schema_pending";
        feedbackStored = feedback ? "schema_pending" : "none";
      }
    }

    forwarded = await forwardToPostHog(event);

    return sendJson(res, 200, {
      ok: true,
      stored,
      feedbackStored,
      forwarded,
      supabaseConfigured: hasSupabaseConfig()
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      ok: false,
      error: error.message || "Unable to record telemetry."
    });
  }
};
