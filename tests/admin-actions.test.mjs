import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freshRequire(rel) {
  for (const key of Object.keys(require.cache)) if (key.startsWith(path.join(repoRoot, "api"))) delete require.cache[key];
  return require(path.join(repoRoot, rel));
}

function mockRes() {
  return { statusCode: 200, body: "", setHeader() {}, hasHeader: () => false, end(body) { this.body = body || ""; } };
}

// Runs the admin route against a fake Supabase that records every request.
async function callAdmin({ method = "GET", url = "/api/admin/send_waitlist_update", body, rows = {} }) {
  process.env.PAM_ADMIN_SECRET = "test-secret";
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (target, init = {}) => {
    const href = String(target);
    calls.push({ href, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    const match = Object.entries(rows).find(([prefix]) => href.includes(prefix));
    return new Response(JSON.stringify(match ? match[1] : []), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const handler = freshRequire("api/admin/send_waitlist_update.js");
    const res = mockRes();
    await handler({ method, url, query: Object.fromEntries(new URL(url, "http://x").searchParams), body, headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`, "x-pam-admin-secret": "test-secret" } }, res);
    return { res, payload: JSON.parse(res.body || "{}"), calls };
  } finally {
    global.fetch = realFetch;
  }
}

test("the People view lists waitlist rows with the latest partner status per email", async () => {
  const { payload } = await callAdmin({
    url: "/api/admin/send_waitlist_update?view=people",
    rows: {
      "pam_waitlist?": [{ email_address: "dana@stateu.edu", full_name: "Dana", stage: "School or employer partner", goal: "State U", created_at: "2026-10-25" }],
      "partner_status_set": [
        { properties: { email: "dana@stateu.edu", status: "accepted" }, created_at: "2026-10-27" },
        { properties: { email: "dana@stateu.edu", status: "contacted" }, created_at: "2026-10-26" }
      ]
    }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.people[0].email, "dana@stateu.edu");
  assert.equal(payload.partnerStatuses["dana@stateu.edu"].status, "accepted");
});

test("deleting a person removes the row and audits it without keeping the email", async () => {
  const { payload, calls } = await callAdmin({ method: "POST", body: { action: "delete_person", email: "Jordan@Gmail.com" }, rows: { "pam_waitlist?email_address": [{ email_address: "jordan@gmail.com" }] } });
  assert.equal(payload.ok, true);
  const del = calls.find((call) => call.method === "DELETE");
  assert.match(del.href, /pam_waitlist\?email_address=eq\.jordan%40gmail\.com/);
  const audit = calls.find((call) => call.method === "POST" && call.href.includes("pam_events"));
  assert.equal(audit.body.event_name, "person_deleted");
  assert.ok(!JSON.stringify(audit.body).includes("jordan"));
});

test("partner status is saved as an admin event and only known statuses are accepted", async () => {
  const ok = await callAdmin({ method: "POST", body: { action: "set_partner_status", email: "dana@stateu.edu", status: "contacted" } });
  assert.equal(ok.payload.ok, true);
  assert.equal(ok.calls.find((call) => call.href.includes("pam_events")).body.properties.status, "contacted");
  const bad = await callAdmin({ method: "POST", body: { action: "set_partner_status", email: "dana@stateu.edu", status: "vip" } });
  assert.equal(bad.payload.ok, false);
});

test("invite codes are cleaned up before they're saved", () => {
  const { sanitizeSettings } = freshRequire("api/_lib/runtimeSettings.js");
  const cleaned = sanitizeSettings({ inviteCodes: ["  State-U-Fall ", "state-u-fall", "x", "bad!code", "maple harbor 123"] });
  assert.deepEqual(cleaned.inviteCodes, ["state-u-fall", "maple harbor 123"]);
  assert.equal(sanitizeSettings({}).inviteCodes, undefined);
});

test("a code created in admin unlocks the invite dialog, alongside the Vercel codes", async () => {
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.DEMO_ACCESS_CODE = "vercel-code";
  const realFetch = global.fetch;
  global.fetch = async (target) => {
    const body = String(target).includes("settings_updated") ? [{ properties: { inviteCodes: ["state-u-fall"] }, created_at: "2026-10-28" }] : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const handler = freshRequire("api/account/session.js");
    const attempt = async (code) => {
      const res = mockRes();
      await handler({ method: "POST", url: "/api/account/session", query: {}, body: { action: "demo_access", code }, headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}` } }, res);
      return res.statusCode;
    };
    assert.equal(await attempt("State-U-Fall"), 200);
    assert.equal(await attempt("vercel-code"), 200);
    assert.equal(await attempt("pam demo"), 401);
  } finally {
    global.fetch = realFetch;
    delete process.env.DEMO_ACCESS_CODE;
  }
});
