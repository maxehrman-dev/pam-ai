import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const securityModulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/_lib/security.js";
const accountStoreModulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/_lib/account-store.js";

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

test("account passwords are hashed at rest and never persisted in plaintext", async () => {
  await withFreshAccountStore(async (store, tempDir) => {
    const verification = store.createVerificationRequest({
      emailAddress: "maya@example.com",
      purpose: "signup"
    });

    store.createAccount({
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
