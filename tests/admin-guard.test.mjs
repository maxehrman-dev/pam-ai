import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("wrong admin secrets are rate limited per IP before they're checked", async () => {
  process.env.PAM_ADMIN_SECRET = "test-admin-secret";
  const handler = require("../api/admin/send_waitlist_update.js");
  const codes = [];
  for (let i = 0; i < 45; i += 1) {
    const res = { statusCode: 200, setHeader() {}, hasHeader: () => false, end(body) { this.body = body; } };
    await handler({ method: "GET", url: "/api/admin/send_waitlist_update", query: {}, headers: { "x-forwarded-for": "203.0.113.77", "x-pam-admin-secret": `guess-${i}` } }, res);
    codes.push(res.statusCode);
  }
  assert.equal(codes.filter((code) => code === 401).length, 40);
  assert.ok(codes.slice(40).every((code) => code === 429));
  delete process.env.PAM_ADMIN_SECRET;
});

test("the stored admin secret is read without stray whitespace", async () => {
  process.env.PAM_ADMIN_SECRET = "  test-admin-secret\n";
  const handler = require("../api/admin/send_waitlist_update.js");
  const res = { statusCode: 200, setHeader() {}, hasHeader: () => false, end(body) { this.body = body; } };
  await handler({ method: "GET", url: "/api/admin/send_waitlist_update", query: {}, headers: { "x-forwarded-for": "203.0.113.88", "x-pam-admin-secret": "test-admin-secret" } }, res);
  assert.notEqual(res.statusCode, 401);
  delete process.env.PAM_ADMIN_SECRET;
});

test("a missing admin secret says so instead of 'wrong secret'", async () => {
  delete process.env.PAM_ADMIN_SECRET;
  const handler = require("../api/admin/send_waitlist_update.js");
  const res = { statusCode: 200, setHeader() {}, hasHeader: () => false, end(body) { this.body = body; } };
  const warn = console.warn;
  console.warn = () => {};
  await handler({ method: "GET", url: "/api/admin/send_waitlist_update", query: {}, headers: { "x-forwarded-for": "203.0.113.99", "x-pam-admin-secret": "anything" } }, res);
  console.warn = warn;
  assert.equal(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /PAM_ADMIN_SECRET/);
});
