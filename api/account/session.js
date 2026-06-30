const crypto = require("crypto");
const { withErrorReporting } = require("../_lib/observability.js");
const { changePassword, clearSession, getSessionAccount, getSessionAccountWithBaseline } = require("../_lib/account-store.js");
const { hasClerkConfig, verifyClerkToken } = require("../_lib/clerk.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, sanitizeText, validatePayload } = require("../_lib/security.js");
const { findBaselineByAccountId, findLatestLegalAcceptanceByAccountId, findPlaidItemsByAccountId, findScenarioRunsByAccountId, findSubscriptionByClerkUserId, hasSupabaseConfig, insertLegalAcceptance, insertScenarioRun, insertTelemetryEvent, purgeFinancialDataByAccountId, upsertBaseline } = require("../_lib/supabase.js");
const { removePlaidItem } = require("../_lib/plaid.js");

async function resolveAccount(req) {
  if (hasClerkConfig()) {
    const clerkAccount = await verifyClerkToken(req.headers?.authorization);
    if (clerkAccount) return clerkAccount;
  }
  const token = req.query?.sessionToken || req.body?.sessionToken || "";
  return token ? await getSessionAccount(token) : null;
}

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
  required: ["action", "acceptedAdvisorDisclaimer", "acceptedTermsPrivacy", "termsVersion", "privacyVersion"]
};

const saveBaselineSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["save_baseline"] },
    baseline: { type: "object", allowUnknown: true }
  },
  required: ["action", "baseline"]
};

const demoAccessSchema = {
  properties: {
    action: { type: "string", enum: ["demo_access"] },
    code: { type: "string", minLength: 3, maxLength: 80 }
  },
  required: ["action", "code"]
};

const disconnectSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["disconnect_financial"] },
    clientUserId: { type: "string", maxLength: 128 }
  },
  required: ["action"]
};

const saveDecisionSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["save_decision"] },
    question: { type: "string", minLength: 1, maxLength: 500 },
    entry: { type: "object", allowUnknown: true }
  },
  required: ["action", "question", "entry"]
};

const changePasswordSchema = {
  properties: {
    sessionToken: { type: "string", minLength: 10, maxLength: 80 },
    action: { type: "string", enum: ["change_password"] },
    currentPassword: { type: "string", minLength: 1, maxLength: 128, trim: false },
    newPassword: { type: "string", minLength: 8, maxLength: 128, trim: false }
  },
  required: ["sessionToken", "action", "currentPassword", "newPassword"]
};

function getSessionToken(req) {
  return req.query?.sessionToken || req.body?.sessionToken || "";
}

function normalizeDemoCode(value) {
  return sanitizeText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function timingSafeEqualText(left, right) {
  const maxLen = Math.max(Buffer.byteLength(left), Buffer.byteLength(right), 1);
  const leftBuffer = Buffer.alloc(maxLen);
  const rightBuffer = Buffer.alloc(maxLen);
  leftBuffer.write(left);
  rightBuffer.write(right);
  const equal = crypto.timingSafeEqual(leftBuffer, rightBuffer);
  return equal && Buffer.byteLength(left) === Buffer.byteLength(right);
}

function getAllowedDemoCodes() {
  const configured = String(process.env.DEMO_ACCESS_CODE || "")
    .split(",")
    .map(normalizeDemoCode)
    .filter(Boolean);

  // Prototype fallback so the founder can still demo if the env var is not set yet.
  return configured.length ? configured : ["pamdevteam", "pam dev team", "pam demo"];
}

const __pamRouteHandler = async (req, res) => {
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
    const account = await resolveAccount(req);
    let baseline = null;
    let legalAcceptance = null;
    let subscription = null;
    let decisions = [];
    if (account?.id) {
      if (hasClerkConfig() && account.clerkUserId) {
        if (hasSupabaseConfig()) {
          baseline = await findBaselineByAccountId(account.id).catch(() => null);
          legalAcceptance = await findLatestLegalAcceptanceByAccountId(account.id).catch(() => null);
          const sub = await findSubscriptionByClerkUserId(account.clerkUserId).catch(() => null);
          if (sub) subscription = { status: sub.status, isFoundingMember: sub.is_founding_member, priceId: sub.price_id };
        }
      } else {
        const full = await getSessionAccountWithBaseline(getSessionToken(req));
        baseline = full.baseline;
        legalAcceptance = full.legalAcceptance;
      }
      // Decision memory follows the user across devices.
      if (hasSupabaseConfig()) {
        const runs = await findScenarioRunsByAccountId(account.id, 8).catch(() => []);
        decisions = runs.map((r) => r?.result).filter((entry) => entry && typeof entry === "object");
      }
    }
    return sendJson(res, 200, {
      ok: Boolean(account),
      account,
      baseline,
      legalAcceptance,
      subscription,
      decisions
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
    if (req.body?.action === "demo_access") {
      const body = validatePayload(req.body, demoAccessSchema, "request body");
      if (
        !checkRateLimit(req, res, {
          routeKey: "demo-access",
          userKey: body.code,
          ipLimit: { windowMs: 10 * 60 * 1000, max: 25 },
          userLimit: { windowMs: 10 * 60 * 1000, max: 10 }
        })
      ) {
        return;
      }

      const providedCode = normalizeDemoCode(body.code);
      const ok = getAllowedDemoCodes().some((code) => timingSafeEqualText(providedCode, code));

      if (!ok) {
        return sendJson(res, 401, {
          ok: false,
          error: "That demo code does not work yet."
        });
      }

      return sendJson(res, 200, {
        ok: true,
        message: "Demo access unlocked.",
        expiresDays: 30
      });
    }

    if (req.body?.action === "disconnect_financial") {
      const body = validatePayload(req.body, disconnectSchema, "request body");
      const account = await resolveAccount(req);
      if (!account?.id) {
        return sendJson(res, 401, { ok: false, error: "Sign in to disconnect." });
      }
      if (
        !checkRateLimit(req, res, {
          routeKey: "account:session:disconnect",
          userKey: account.emailAddress || account.id,
          ipLimit: { windowMs: 60 * 1000, max: 20 },
          userLimit: { windowMs: 60 * 1000, max: 10 }
        })
      ) {
        return;
      }
      let revoked = 0;
      if (hasSupabaseConfig()) {
        try {
          const items = await findPlaidItemsByAccountId(account.id);
          for (const item of items) {
            try {
              await removePlaidItem(item.access_token_reference, body.clientUserId || account.id);
              revoked += 1;
            } catch (_err) {
              // Best-effort: keep revoking the rest, still purge below.
            }
          }
          await purgeFinancialDataByAccountId(account.id);
        } catch (_error) {
          return sendJson(res, 200, { ok: false, error: "Could not fully disconnect. Try again." });
        }
      }
      return sendJson(res, 200, { ok: true, revoked });
    }

    if (req.body?.action === "save_decision") {
      const body = validatePayload(req.body, saveDecisionSchema, "request body");
      const account = await resolveAccount(req);
      if (!account?.id) {
        return sendJson(res, 401, { ok: false, error: "Sign in to save decisions." });
      }
      if (
        !checkRateLimit(req, res, {
          routeKey: "account:session:decision",
          userKey: account.emailAddress || account.id,
          ipLimit: { windowMs: 60 * 1000, max: 40 },
          userLimit: { windowMs: 60 * 1000, max: 20 }
        })
      ) {
        return;
      }
      let stored = "local_only";
      if (hasSupabaseConfig()) {
        try {
          await insertScenarioRun({ accountId: account.id, question: body.question, result: body.entry });
          stored = "supabase";
        } catch (_error) {
          stored = "schema_pending";
        }
      }
      return sendJson(res, 200, { ok: true, stored });
    }

    if (req.body?.action === "save_baseline") {
      const body = validatePayload(req.body, saveBaselineSchema, "request body");
      const account = await resolveAccount(req);
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

    if (req.body?.action === "change_password") {
      const body = validatePayload(req.body, changePasswordSchema, "request body");
      const account = await getSessionAccount(body.sessionToken);
      if (!account?.id) {
        return sendJson(res, 401, {
          ok: false,
          error: "Sign in again before changing your password."
        });
      }
      if (
        !checkRateLimit(req, res, {
          routeKey: "account:session:password",
          userKey: account.emailAddress,
          ipLimit: { windowMs: 15 * 60 * 1000, max: 20 },
          userLimit: { windowMs: 15 * 60 * 1000, max: 8 }
        })
      ) {
        return;
      }

      try {
        const result = await changePassword({
          sessionToken: body.sessionToken,
          currentPassword: body.currentPassword,
          newPassword: body.newPassword
        });

        return sendJson(res, 200, {
          ok: true,
          account: result.account
        });
      } catch (error) {
        return sendJson(res, 200, {
          ok: false,
          error: error.message || "Could not update password."
        });
      }
    }

    const body = validatePayload(req.body, legalAcceptanceSchema, "request body");
    const account = await resolveAccount(req);

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

module.exports = withErrorReporting("account/session", __pamRouteHandler);
