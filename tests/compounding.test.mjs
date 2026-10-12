import test from "node:test";
import assert from "node:assert/strict";

import { buildCompoundingInsights, costOfWaiting, futureValueOfMonthly, yearsToDouble } from "../src/utils/compounding.js";
import { getMoneyFacts } from "../src/utils/financeKnowledge.js";
import { buildDecisionSession } from "../src/utils/scenarioEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";

test("future value matches the closed-form annuity and zero-rate case", () => {
  assert.equal(Math.round(futureValueOfMonthly(100, 12, 0)), 1200);
  const fv = futureValueOfMonthly(100, 120, 0.068);
  assert.ok(fv > 12000 && fv < 18000, `got ${fv}`);
});

test("rule of 72", () => {
  assert.equal(yearsToDouble(6.8), 10.6);
  assert.equal(yearsToDouble(24), 3);
  assert.equal(yearsToDouble(0), null);
});

test("waiting five years costs real money and needs a bigger monthly to catch up", () => {
  const result = costOfWaiting({ monthly: 300, startAge: 25, endAge: 65 });
  assert.ok(result.startNow > result.startLater);
  assert.equal(result.cost, result.startNow - result.startLater);
  assert.ok(result.catchUpMonthly > 300);
  // Catching up from the late start lands on the same total.
  const check = futureValueOfMonthly(result.catchUpMonthly, (65 - 30) * 12);
  assert.ok(Math.abs(check - result.startNow) / result.startNow < 0.01);
});

test("insights use the person's own numbers and flag high-APR debt", () => {
  const insights = buildCompoundingInsights({
    prompt: "Should I start investing now or wait?",
    age: 24,
    monthlyInvesting: 250,
    liabilities: [{ label: "Credit card", balance: 2000, rate: 24 }]
  });
  assert.equal(insights.usedExample, false);
  assert.match(insights.lines[0], /\$250\/mo started at 24/);
  assert.ok(insights.lines.some((line) => /Rule of 72/.test(line)));
  assert.ok(insights.lines.some((line) => /24% credit card would double in about 3 years/.test(line)));
  for (const line of insights.lines) assert.ok(!line.includes("—"));
});

test("unrelated questions get no compounding section", () => {
  assert.equal(buildCompoundingInsights({ prompt: "Should I adopt a cat?", age: 25 }), null);
});

test("general compound interest questions get the plain facts", () => {
  const facts = getMoneyFacts("how does compound interest work and what's the rule of 72?");
  assert.ok(facts.some((fact) => /returns earn returns/.test(fact)));
  assert.ok(facts.some((fact) => /Rule of 72/.test(fact)));
});

test("investing decisions carry compounding to the result", () => {
  const profile = { ...financialProfile, user: { ...financialProfile.user, age: 27 } };
  const session = buildDecisionSession({ prompt: "What if I invest $200 more a month?", profile, goals: defaultGoals, catalog: starterScenarios });
  assert.ok(session.result.compounding);
  assert.equal(session.result.compounding.costOfWaiting.monthly, 200);
});

test("'investing' phrasing is read as an investing decision with its amount", () => {
  const profile = { ...financialProfile, user: { ...financialProfile.user, age: 26 } };
  const session = buildDecisionSession({ prompt: "Should I start investing $250 a month now or wait a few years?", profile, goals: defaultGoals, catalog: starterScenarios });
  assert.equal(session.result.draft.type, "invest");
  assert.equal(session.result.draft.monthlyInvestingDelta, 250);
  assert.equal(session.result.compounding.costOfWaiting.monthly, 250);
});
