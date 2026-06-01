import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const securityModulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/_lib/security.js";
const accountStoreModulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/_lib/account-store.js";
const accountSessionModulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/account/session.js";

function freshSecurity() {
  global.__PAM_RATE_LIMIT_STORE__ = new Map();
  delete require.cache[require.resolve(securityModulePath)];
  return require(securityModulePath);
}

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

async function withFreshAccountStore(run) {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pam-security-"));

  try {
    process.chdir(tempDir);
    delete global.__PAM_ACCOUNT_STORE__;
    delete require.cache[require.resolve(accountStoreModulePath)];
    const store = require(accountStoreModulePath);
    await run(store, tempDir);
  } finally {
    process.chdir(originalCwd);
    delete global.__PAM_ACCOUNT_STORE__;
    delete require.cache[require.resolve(accountStoreModulePath)];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("validatePayload rejects unexpected fields", () => {
  const { validatePayload } = freshSecurity();

  assert.throws(() => {
    validatePayload(
      {
        emailAddress: "maya@example.com",
        admin: true
      },
      {
        properties: {
          emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254 }
        },
        required: ["emailAddress"]
      },
      "request body"
    );
  }, /Unexpected field "admin"/i);
});

test("register payload accepts email verification without a browser verification token", () => {
  const { validatePayload } = freshSecurity();

  const payload = validatePayload(
    {
      firstName: "Maya",
      emailAddress: "maya@example.com",
      password: "VeryStrongPass123",
      verificationRequestId: "verify_abcdef1234567890",
      verificationCode: "123456",
      verificationToken: "",
      age: 24,
      employmentStatus: "W-2 employee",
      stateCode: "CA"
    },
    {
      properties: {
        firstName: { type: "string", minLength: 1, maxLength: 60 },
        emailAddress: { type: "string", format: "email", minLength: 5, maxLength: 254, lowercase: true },
        password: { type: "string", minLength: 8, maxLength: 128, trim: false },
        verificationRequestId: { type: "string", minLength: 10, maxLength: 64, pattern: /^verify_[a-f0-9]+$/ },
        verificationCode: { type: "string", minLength: 6, maxLength: 6, pattern: /^\d{6}$/ },
        verificationToken: { type: "string", maxLength: 512 },
        age: { type: "integer", minimum: 13, maximum: 120, allowNull: true },
        employmentStatus: { type: "string", minLength: 2, maxLength: 40 },
        stateCode: { type: "string", minLength: 2, maxLength: 5, uppercase: true }
      },
      required: ["firstName", "emailAddress", "password", "verificationRequestId", "verificationCode"]
    },
    "request body"
  );

  assert.equal(payload.verificationToken, "");
});

test("checkRateLimit returns a graceful 429 after the configured threshold", () => {
  const { checkRateLimit } = freshSecurity();
  const req = { clientIp: "127.0.0.1" };
  const firstRes = createMockResponse();
  const secondRes = createMockResponse();

  assert.equal(
    checkRateLimit(req, firstRes, {
      routeKey: "test",
      ipLimit: { windowMs: 60_000, max: 1 }
    }),
    true
  );

  assert.equal(
    checkRateLimit(req, secondRes, {
      routeKey: "test",
      ipLimit: { windowMs: 60_000, max: 1 }
    }),
    false
  );

  assert.equal(secondRes.statusCode, 429);
  assert.match(secondRes.body, /Too many requests/i);
  assert.ok(secondRes.getHeader("retry-after"));
});

test("checkDailyUsageBudget returns a graceful 429 after the configured threshold", () => {
  const { checkDailyUsageBudget } = freshSecurity();
  const req = { clientIp: "127.0.0.1" };
  const firstRes = createMockResponse();
  const secondRes = createMockResponse();

  assert.equal(
    checkDailyUsageBudget(req, firstRes, {
      routeKey: "budget-test",
      ipDailyLimit: 1
    }),
    true
  );

  assert.equal(
    checkDailyUsageBudget(req, secondRes, {
      routeKey: "budget-test",
      ipDailyLimit: 1
    }),
    false
  );

  assert.equal(secondRes.statusCode, 429);
  assert.match(secondRes.body, /Daily request limit reached/i);
  assert.ok(secondRes.getHeader("retry-after"));
});

test("assertServiceEnabled returns a cost-protection 503 when a kill switch is active", () => {
  const originalValue = process.env.PAM_DISABLE_AI;
  process.env.PAM_DISABLE_AI = "true";
  const { assertServiceEnabled } = freshSecurity();
  const res = createMockResponse();

  try {
    assert.equal(
      assertServiceEnabled(res, {
        serviceName: "AI guidance",
        envKeys: ["PAM_DISABLE_AI"]
      }),
      false
    );
    assert.equal(res.statusCode, 503);
    assert.match(res.body, /temporarily paused/i);
  } finally {
    if (originalValue === undefined) {
      delete process.env.PAM_DISABLE_AI;
    } else {
      process.env.PAM_DISABLE_AI = originalValue;
    }
  }
});

test("demo access accepts the fallback tester code without exposing app access by default", async () => {
  const originalCode = process.env.DEMO_ACCESS_CODE;
  delete process.env.DEMO_ACCESS_CODE;
  global.__PAM_RATE_LIMIT_STORE__ = new Map();
  delete require.cache[require.resolve(accountSessionModulePath)];
  const handler = require(accountSessionModulePath);
  const req = {
    method: "POST",
    clientIp: "127.0.0.1",
    body: { action: "demo_access", code: "PAMDEVTEAM" }
  };
  const res = createMockResponse();

  try {
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Demo access unlocked/i);
  } finally {
    if (originalCode === undefined) {
      delete process.env.DEMO_ACCESS_CODE;
    } else {
      process.env.DEMO_ACCESS_CODE = originalCode;
    }
    delete require.cache[require.resolve(accountSessionModulePath)];
  }
});

test("account passwords are hashed at rest and never persisted in plaintext", async () => {
  await withFreshAccountStore(async (store, tempDir) => {
    const verification = await store.createVerificationRequest({
      emailAddress: "maya@example.com",
      purpose: "signup"
    });

    await store.createAccount({
      firstName: "Maya",
      emailAddress: "maya@example.com",
      password: "VeryStrongPass123",
      employmentStatus: "W-2 employee",
      stateCode: "CA",
      verificationRequestId: verification.requestId,
      verificationCode: verification.previewCode
    });

    const raw = fs.readFileSync(path.join(tempDir, ".data", "accounts.json"), "utf8");
    assert.match(raw, /"passwordAlgorithm":\s*"scrypt"/);
    assert.equal(raw.includes("VeryStrongPass123"), false);
  });
});
