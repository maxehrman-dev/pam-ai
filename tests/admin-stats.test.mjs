import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildAdminStats, topicForQuestion } = require("../api/_lib/adminStats.js");

const now = Date.parse("2026-10-12T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

test("admin stats aggregate without exposing emails", () => {
  const stats = buildAdminStats({
    now,
    waitlist: [
      { email_address: "a@x.com", age: 22, stage: "Student", goal: "Moving out", created_at: new Date(now - 2 * day).toISOString() },
      { email_address: "b@x.com", age: 27, stage: "Working full-time", goal: "", created_at: new Date(now - 9 * day).toISOString() },
      { email_address: "c@x.com", age: null, stage: "School or employer partner", goal: "State U career center", created_at: new Date(now - day).toISOString() }
    ],
    events: [
      { id: "1", event_name: "signup_started", session_id: "s1", created_at: new Date(now - day).toISOString() },
      { id: "2", event_name: "signup_started", session_id: "s1", created_at: new Date(now - day).toISOString() },
      { id: "3", event_name: "signup_started", session_id: "s2", created_at: new Date(now - day).toISOString() },
      { id: "4", event_name: "values_onboarding_completed", session_id: "s1", created_at: new Date(now - day).toISOString() },
      { id: "5", event_name: "signup_started", session_id: "old", created_at: new Date(now - 45 * day).toISOString() }
    ],
    runs: [{ question: "Can I afford a $400 car?" }, { question: "Should I invest $200 a month?" }, { question: "Should I get a dog?" }],
    feedback: [{ rating: 5, message: "Love it", page: "/", created_at: new Date(now).toISOString() }],
    accountCount: 4
  });

  assert.equal(stats.totals.waitlist, 2);
  assert.equal(stats.totals.partnerRequests, 1);
  assert.equal(stats.totals.accounts, 4);
  assert.equal(stats.funnel[0].sessions, 2, "unique sessions in the last 30 days");
  assert.equal(stats.funnel[1].sessions, 1);
  assert.deepEqual(stats.partnerRequests.map((row) => row.organization), ["State U career center"]);
  assert.ok(!JSON.stringify(stats).includes("@x.com"), "no emails in admin output");
  assert.deepEqual(stats.questionTopics.map((row) => row.label).sort(), ["Car", "Investing & retirement", "Other"]);
});

test("question topics", () => {
  assert.equal(topicForQuestion("Should I max my Roth IRA?"), "Investing & retirement");
  assert.equal(topicForQuestion("Can I afford rent at $1,800?"), "Rent & moving");
  assert.equal(topicForQuestion("Should I take the job offer in Denver?"), "Job & income");
});

const { sanitizeSettings } = require("../api/_lib/runtimeSettings.js");
const { assertServiceEnabled } = require("../api/_lib/security.js");

test("runtime settings accept only known keys and trim the banner", () => {
  const clean = sanitizeSettings({ launchGate: "yes", disableAi: true, disablePlaid: "true", evil: 1, announcement: `  Beta opens   Nov 1 ${"x".repeat(300)}` });
  assert.equal(clean.launchGate, undefined);
  assert.equal(clean.disableAi, true);
  assert.equal(clean.disablePlaid, undefined);
  assert.equal(clean.evil, undefined);
  assert.ok(clean.announcement.startsWith("Beta opens Nov 1"));
  assert.equal(clean.announcement.length, 160);
  assert.deepEqual(sanitizeSettings({ launchGate: null }), { launchGate: null });
});

test("services stay on when no switch is set", () => {
  const res = { statusCode: 200, setHeader() {}, end() {} };
  assert.equal(assertServiceEnabled(res, { serviceName: "AI", envKeys: ["PAM_TEST_NEVER_SET"], runtimeFlag: "disableAi" }), true);
});

test("the public telemetry endpoint can't write admin settings rows", async () => {
  const path = require.resolve("../api/telemetry.js");
  delete require.cache[path];
  global.__PAM_RATE_LIMIT_STORE__ = new Map();
  let statusCode = 0;
  const headers = {};
  const res = { statusCode: 200, setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; }, hasHeader(k) { return k.toLowerCase() in headers; }, writeHead(code) { this.statusCode = code; }, end() { statusCode = this.statusCode; } };
  await require(path)({ method: "POST", clientIp: "127.0.0.1", headers: {}, body: { eventType: "admin", eventName: "settings_updated", properties: { disableAi: true } } }, res);
  assert.equal(statusCode, 400);
});

test("admin stats include daily sessions, conversion, and AI health", () => {
  const stats = buildAdminStats({
    now,
    events: [
      { id: "1", event_name: "signup_started", session_id: "a", created_at: new Date(now - day).toISOString() },
      { id: "2", event_name: "signup_started", session_id: "b", created_at: new Date(now - day).toISOString() },
      { id: "3", event_name: "values_onboarding_completed", session_id: "a", created_at: new Date(now - day).toISOString() },
      { id: "4", event_name: "ai_guidance_received", session_id: "a", created_at: new Date(now - day).toISOString() },
      { id: "5", event_name: "ai_guidance_unavailable", session_id: "b", created_at: new Date(now - 2 * day).toISOString() }
    ]
  });
  assert.equal(stats.funnel[1].conversionPct, 50);
  assert.equal(stats.aiHealth.successPct, 50);
  assert.equal(stats.dailySessions.length, 2);
});
