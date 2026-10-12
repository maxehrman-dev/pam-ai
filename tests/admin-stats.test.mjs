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
