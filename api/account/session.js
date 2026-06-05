const crypto = require("crypto");
const { changePassword, clearSession, getSessionAccount, getSessionAccountWithBaseline } = require("../_lib/account-store.js");
const { hasClerkConfig, verifyClerkToken } = require("../_lib/clerk.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, sanitizeText, validatePayload } = require("../_lib/security.js");
const { findBaselineByAccountId, findLatestLegalAcceptanceByAccountId, findSubscriptionByClerkUserId, hasSupabaseConfig, insertLegalAcceptance, insertTelemetryEvent, upsertBaseline } = require("../_lib/supabase.js");

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
  required: ["sessionToken", "action", "baseline"]
};

const demoAccessSchema = {
  properties: {
    action: { type: "string", enum: ["demo_access"] },
    code: { type: "string", minLength: 3, maxLength: 80 }
  },
  required: ["action", "code"]
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
    const account = await resolveAccount(req);
    let baseline = null;
    let legalAcceptance = null;
    let subscription = null;
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
    }
    return sendJson(res, 200, {
      ok: Boolean(account),
      account,
      baseline,
      legalAcceptance,
      subscription
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
