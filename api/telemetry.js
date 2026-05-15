const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { checkRateLimit, sanitizeText, validatePayload } = require("./_lib/security.js");
const { hasSupabaseConfig, insertTelemetryEvent } = require("./_lib/supabase.js");

const POSTHOG_PROJECT_API_KEY = process.env.POSTHOG_PROJECT_API_KEY || "";
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

const telemetrySchema = {
  properties: {
    eventType: { type: "string", enum: ["product", "error", "security"] },
    eventName: { type: "string", minLength: 2, maxLength: 80, pattern: /^[a-z0-9_:-]+$/i },
    sessionId: { type: "string", maxLength: 120 },
    page: { type: "string", maxLength: 200 },
    properties: { type: "object", allowUnknown: true }
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

    let stored = "none";
    let forwarded = false;

    if (hasSupabaseConfig()) {
      try {
        await insertTelemetryEvent(event);
        stored = "supabase";
      } catch (_error) {
        stored = "schema_pending";
      }
    }

    forwarded = await forwardToPostHog(event);

    return sendJson(res, 200, {
      ok: true,
      stored,
      forwarded
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      ok: false,
      error: error.message || "Unable to record telemetry."
    });
  }
};
