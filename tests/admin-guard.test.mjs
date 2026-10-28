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
