const { clearSession, getSessionAccount, getSessionAccountWithBaseline } = require("../_lib/account-store.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, sanitizeText, validatePayload } = require("../_lib/security.js");
const { hasSupabaseConfig, insertLegalAcceptance, insertTelemetryEvent, upsertBaseline } = require("../_lib/supabase.js");

const querySchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 64, pattern: /^sess_[a-f0-9]+$/ }
  },
  required: []
};

const legalAcceptanceSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["accept_legal"] },
    acceptedAdvisorDisclaimer: { type: "boolean" },
    acceptedTermsPrivacy: { type: "boolean" },
    termsVersion: { type: "string", minLength: 3, maxLength: 40 },
    privacyVersion: { type: "string", minLength: 3, maxLength: 40 }
  },
  required: ["sessionToken", "action", "acceptedAdvisorDisclaimer", "acceptedTermsPrivacy", "termsVersion", "privacyVersion"]
};

const saveBaselineSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["save_baseline"] },
    baseline: { type: "object", allowUnknown: true }
  },
  required: ["sessionToken", "action", "baseline"]
};

function getSessionToken(req) {
  return req.query?.sessionToken || req.body?.sessionToken || "";
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const query = validatePayload(req.query, querySchema, "query");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:session:get",
        userKey: query.sessionToken,
        ipLimit: { windowMs: 60 * 1000, max: 120 },
        userLimit: { windowMs: 60 * 1000, max: 60 }
      })
    ) {
      return;
    }
    const { account, baseline } = await getSessionAccountWithBaseline(getSessionToken(req));
    return sendJson(res, 200, {
      ok: Boolean(account),
      account,
      baseline
    });
  }

  if (req.method === "DELETE") {
    const body = validatePayload(req.body, querySchema, "request body");
    if (
      !checkRateLimit(req, res, {
        routeKey: "account:session:delete",
        userKey: body.sessionToken,
        ipLimit: { windowMs: 5 * 60 * 1000, max: 40 },
        userLimit: { windowMs: 5 * 60 * 1000, max: 20 }
      })
    ) {
      return;
    }
    await clearSession(getSessionToken(req));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST") {
    if (req.body?.action === "save_baseline") {
      const body = validatePayload(req.body, saveBaselineSchema, "request body");
      const account = await getSessionAccount(body.sessionToken);
      if (!account?.id) {
        return sendJson(res, 401, {
          ok: false,
          error: "Sign in again before saving baseline."
        });
      }
      if (
        !checkRateLimit(req, res, {
          routeKey: "account:session:baseline",
          userKey: account.emailAddress,
          ipLimit: { windowMs: 60 * 1000, max: 60 },
          userLimit: { windowMs: 60 * 1000, max: 30 }
        })
      ) {
        return;
      }

      let stored = "local_only";
      if (hasSupabaseConfig()) {
        try {
          await upsertBaseline({ accountId: account.id, baseline: body.baseline });
          stored = "supabase";
        } catch (_error) {
          stored = "schema_pending";
        }
      }

      return sendJson(res, 200, {
        ok: true,
        stored
      });
    }

    const body = validatePayload(req.body, legalAcceptanceSchema, "request body");
    const account = await getSessionAccount(body.sessionToken);

    if (!account?.id) {
      return sendJson(res, 401, {
        ok: false,
        error: "Sign in again before accepting legal terms."
      });
    }

    if (!body.acceptedAdvisorDisclaimer || !body.acceptedTermsPrivacy) {
      return sendJson(res, 400, {
        ok: false,
        error: "Both legal acknowledgements are required."
      });
    }

    if (
      !checkRateLimit(req, res, {
        routeKey: "account:session:legal",
        userKey: account.emailAddress,
        ipLimit: { windowMs: 60 * 1000, max: 30 },
        userLimit: { windowMs: 60 * 1000, max: 10 }
      })
    ) {
      return;
    }

    const acceptedAt = new Date().toISOString();
    let stored = "none";

    if (hasSupabaseConfig()) {
      try {
        let acceptanceTableStored = false;
        try {
          await insertLegalAcceptance({
            accountId: account.id,
            emailAddress: sanitizeText(account.emailAddress).slice(0, 254),
            acceptedAdvisorDisclaimer: true,
            acceptedTermsPrivacy: true,
            termsVersion: body.termsVersion,
            privacyVersion: body.privacyVersion,
            acceptedAt
          });
          acceptanceTableStored = true;
        } catch (_error) {
          // The telemetry event below is the fallback log until the latest schema is applied.
        }
        await insertTelemetryEvent({
          eventType: "security",
          eventName: "legal_terms_accepted",
          sessionId: account.id,
          page: "/legal-acceptance",
          properties: {
            accountId: account.id,
            emailAddress: sanitizeText(account.emailAddress).slice(0, 254),
            acceptedAt,
            termsVersion: body.termsVersion,
            privacyVersion: body.privacyVersion,
            acceptedAdvisorDisclaimer: true,
            acceptedTermsPrivacy: true
          }
        });
        stored = acceptanceTableStored ? "supabase" : "supabase_events";
      } catch (_error) {
        stored = "schema_pending";
      }
    }

    return sendJson(res, 200, {
      ok: true,
      acceptedAt,
      stored
    });
  }

  return sendMethodNotAllowed(res);
};
