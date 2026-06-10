import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = "/Users/iwillfixthis/Documents/New project/pam-ai";
const accountSessionModulePath = `${root}/api/account/session.js`;
const clerkModulePath = `${root}/api/_lib/clerk.js`;
const supabaseModulePath = `${root}/api/_lib/supabase.js`;
const stripeWebhookModulePath = `${root}/api/integrations/stripe-webhook.js`;

function createMockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    hasHeader(name) {
      return headers.has(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value) {
      this.body = value;
    }
  };
}

function clearModules(...paths) {
  for (const modulePath of paths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

test("Clerk session restore returns stored legal acceptance", async () => {
  clearModules(accountSessionModulePath, clerkModulePath, supabaseModulePath);
  require.cache[require.resolve(clerkModulePath)] = {
    exports: {
      hasClerkConfig: () => true,
      verifyClerkToken: async () => ({
        id: "user_clerk_123",
        clerkUserId: "user_clerk_123",
        firstName: "Maya",
        emailAddress: "maya@example.com"
      })
    }
  };
  const realSupabaseExports = require(supabaseModulePath);
  require.cache[require.resolve(supabaseModulePath)] = {
    exports: {
      ...realSupabaseExports,
      findBaselineByAccountId: async () => null,
      findLatestLegalAcceptanceByAccountId: async () => ({
        acceptedAdvisorDisclaimer: true,
        acceptedTermsPrivacy: true,
        termsVersion: "2026-05-18",
        privacyVersion: "2026-05-18",
        acceptedAt: "2026-06-04T00:00:00.000Z",
        stored: "supabase"
      }),
      findSubscriptionByClerkUserId: async () => null,
      hasSupabaseConfig: () => true,
      insertLegalAcceptance: async () => null,
      insertTelemetryEvent: async () => null,
      upsertBaseline: async () => null
    }
  };
  global.__PAM_RATE_LIMIT_STORE__ = new Map();
  const handler = require(accountSessionModulePath);
  const res = createMockResponse();

  try {
    await handler({
      method: "GET",
      clientIp: "127.0.0.1",
      query: {},
      headers: { authorization: "Bearer test" }
    }, res);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.legalAcceptance.acceptedAdvisorDisclaimer, true);
    assert.equal(payload.legalAcceptance.acceptedTermsPrivacy, true);
  } finally {
    clearModules(accountSessionModulePath, clerkModulePath, supabaseModulePath);
  }
});

test("Clerk users can save a baseline without a legacy session token", async () => {
  clearModules(accountSessionModulePath, clerkModulePath, supabaseModulePath);
  let savedBaseline = null;
  require.cache[require.resolve(clerkModulePath)] = {
    exports: {
      hasClerkConfig: () => true,
      verifyClerkToken: async () => ({
        id: "user_clerk_123",
        clerkUserId: "user_clerk_123",
        firstName: "Maya",
        emailAddress: "maya@example.com"
      })
    }
  };
  const realSupabaseExports = require(supabaseModulePath);
  require.cache[require.resolve(supabaseModulePath)] = {
    exports: {
      ...realSupabaseExports,
      hasSupabaseConfig: () => true,
      upsertBaseline: async ({ accountId, baseline }) => {
        savedBaseline = { accountId, baseline };
      }
    }
  };
  global.__PAM_RATE_LIMIT_STORE__ = new Map();
  const handler = require(accountSessionModulePath);
  const res = createMockResponse();

  try {
    await handler({
      method: "POST",
      clientIp: "127.0.0.1",
      query: {},
      headers: { authorization: "Bearer test" },
      body: {
        action: "save_baseline",
        baseline: { source: "plaid_sandbox", userValues: { completed: true } }
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).stored, "supabase");
    assert.equal(savedBaseline.accountId, "user_clerk_123");
    assert.equal(savedBaseline.baseline.userValues.completed, true);
  } finally {
    clearModules(accountSessionModulePath, clerkModulePath, supabaseModulePath);
  }
});

test("Stripe webhook verifies the exact raw request body", async () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  clearModules(stripeWebhookModulePath);
  const handler = require(stripeWebhookModulePath);
  const rawBody = JSON.stringify({
    id: "evt_test",
    type: "invoice.payment_succeeded",
    data: { object: { id: "in_test" } }
  }, null, 2);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const req = Readable.from([rawBody]);
  req.method = "POST";
  req.headers = {
    "stripe-signature": `t=${timestamp},v1=${signature}`
  };
  const res = createMockResponse();

  try {
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /received/i);
  } finally {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
    clearModules(stripeWebhookModulePath);
  }
});
