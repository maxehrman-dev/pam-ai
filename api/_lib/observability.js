// Shared server-side error capture for all API routes.
//
// Goals:
//  - Make every serverless failure VISIBLE (Vercel runtime logs always; Sentry
//    aggregation when SENTRY_DSN is configured).
//  - Never let observability throw or leak sensitive data.
//  - Provide a uniform error boundary so validation errors return their intended
//    status code and unexpected errors return a safe generic 500 (no stack/PII to
//    the client) while still being captured server-side.

const { sendJson } = require("./http.js");

const SENTRY_DSN = process.env.SENTRY_DSN || "";
let sentryClient = null;
let sentryInitTried = false;

// Lazily initialize Sentry only once, only if a DSN is present. Loading the SDK
// is deferred so the happy path never pays the cold-start cost.
function getSentry() {
  if (!SENTRY_DSN) return null;
  if (sentryInitTried) return sentryClient;
  sentryInitTried = true;
  try {
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
      tracesSampleRate: 0,
      // Defense in depth: strip anything that could carry financial data before send.
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }
        return event;
      }
    });
    sentryClient = Sentry;
  } catch (_error) {
    sentryClient = null;
  }
  return sentryClient;
}

// Report a server-side error. Always logs a structured line (captured by Vercel
// runtime logs); also sends to Sentry when configured. Never throws.
function reportServerError(error, context = {}) {
  const safeContext = {
    route: context.route || "unknown",
    method: context.method || "",
    statusCode: context.statusCode || 500
  };
  try {
    // Structured, PII-free log line — guaranteed visibility even without Sentry.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "api_route_error",
        ...safeContext,
        error: String(error?.message || error || "unknown error")
      })
    );
  } catch (_logError) {
    // console.error must never break the request.
  }

  const Sentry = getSentry();
  if (Sentry && error instanceof Error) {
    try {
      Sentry.captureException(error, { tags: safeContext });
    } catch (_captureError) {
      // Capture is best-effort.
    }
  }
}

// Wrap a route handler in a uniform error boundary. Validation errors (which set
// error.statusCode, typically 400) are returned with their status and message;
// any other error is captured and returned as a safe generic 500.
function withErrorReporting(routeName, handler) {
  return async function wrappedHandler(req, res) {
    try {
      return await handler(req, res);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      reportServerError(error, {
        route: routeName,
        method: req?.method || "",
        statusCode
      });
      // If a response was already partially sent, do not try to send again.
      if (res.headersSent || res.writableEnded) return undefined;
      if (statusCode >= 400 && statusCode < 500) {
        // Client/validation error — safe to surface the message.
        return sendJson(res, statusCode, {
          ok: false,
          error: error?.message || "Request could not be processed."
        });
      }
      // Unexpected server error — never leak internals to the client.
      return sendJson(res, 500, {
        ok: false,
        error: "Something went wrong on our end. Please try again."
      });
    }
  };
}

module.exports = { reportServerError, withErrorReporting };
