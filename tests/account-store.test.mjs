import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const modulePath = "/Users/iwillfixthis/Documents/New project/pam-ai/api/_lib/account-store.js";

async function withFreshAccountStore(run) {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pam-account-store-"));

  try {
    process.chdir(tempDir);
    delete global.__PAM_ACCOUNT_STORE__;
    delete require.cache[require.resolve(modulePath)];
    const store = require(modulePath);
    await run(store);
  } finally {
    process.chdir(originalCwd);
    delete global.__PAM_ACCOUNT_STORE__;
    delete require.cache[require.resolve(modulePath)];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("verification request is consumed and cannot be reused", async () => {
  await withFreshAccountStore(async (store) => {
    const verification = store.createVerificationRequest({
      emailAddress: "maya@example.com",
      purpose: "signup"
    });

    const created = store.createAccount({
      firstName: "Maya",
      emailAddress: "maya@example.com",
      password: "strongpass1",
      employmentStatus: "W-2 employee",
      stateCode: "CA",
      verificationRequestId: verification.requestId,
      verificationCode: verification.previewCode
    });

    assert.ok(created.sessionToken);
    assert.equal(store.getSessionAccount(created.sessionToken)?.emailAddress, "maya@example.com");

    assert.throws(() => {
      store.createAccount({
        firstName: "Maya Again",
        emailAddress: "maya2@example.com",
        password: "strongpass2",
        employmentStatus: "W-2 employee",
        stateCode: "CA",
        verificationRequestId: verification.requestId,
        verificationCode: verification.previewCode
      });
    }, /fresh verification code/i);
  });
});

test("requesting a new verification code invalidates the previous one for the same email", async () => {
  await withFreshAccountStore(async (store) => {
    const first = store.createVerificationRequest({
      emailAddress: "alex@example.com",
      purpose: "signup"
    });
    const second = store.createVerificationRequest({
      emailAddress: "alex@example.com",
      purpose: "signup"
    });

    assert.notEqual(first.requestId, second.requestId);

    assert.throws(() => {
      store.createAccount({
        firstName: "Alex",
        emailAddress: "alex@example.com",
        password: "strongpass1",
        employmentStatus: "W-2 employee",
        stateCode: "CA",
        verificationRequestId: first.requestId,
        verificationCode: first.previewCode
      });
    }, /fresh verification code/i);

    const created = store.createAccount({
      firstName: "Alex",
      emailAddress: "alex@example.com",
      password: "strongpass1",
      employmentStatus: "W-2 employee",
      stateCode: "CA",
      verificationRequestId: second.requestId,
      verificationCode: second.previewCode
    });

    assert.ok(created.sessionToken);
  });
});
