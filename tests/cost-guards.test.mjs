import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: "",
    hasHeader: (key) => key.toLowerCase() in headers,
    setHeader: (key, value) => { headers[key.toLowerCase()] = value; },
    getHeader: (key) => headers[key.toLowerCase()],
    end(body) { this.body = body || ""; }
  };
}

test("AI endpoint refuses signed-out callers when Clerk is configured", async () => {
  process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_placeholder";
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(repoRoot, "api"))) delete require.cache[key];
  }
  const handler = require(path.join(repoRoot, "api/decision.js"));
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { prompt: "Can I afford a $1,800 apartment?" } }, res);
  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).error, /Sign in/);
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_PUBLISHABLE_KEY;
});

test("shared limits step aside when Supabase isn't configured", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.PAM_SUPABASE_SUPABASE_URL;
  delete require.cache[require.resolve(path.join(repoRoot, "api/_lib/sharedLimits.js"))];
  const { checkSharedLimits, hitSharedLimit } = require(path.join(repoRoot, "api/_lib/sharedLimits.js"));
  assert.equal(await hitSharedLimit("ai:global", 86400, 1), true);
  const res = mockRes();
  const ok = await checkSharedLimits({ headers: { "x-forwarded-for": "203.0.113.9" } }, res, {
    routeKey: "ai",
    userKey: "user_123",
    limits: { ipDaily: 1, userDaily: 1, globalDaily: 1 }
  });
  assert.equal(ok, true);
  assert.equal(res.statusCode, 200);
});
