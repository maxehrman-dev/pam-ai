import test from "node:test";
import assert from "node:assert/strict";

import { buildDebtPayoffPlan, computeAffordabilityCeilings, getMoneyFacts } from "../src/utils/financeKnowledge.js";
import { buildDecisionSession } from "../src/utils/scenarioEngine.js";
import { getPersonaCoefficients } from "../src/utils/personaEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";

// ─── Debt payoff planner ─────────────────────────────────────────────────────

test("avalanche never pays more interest than snowball, and rollover finishes in finite time", () => {
  const plan = buildDebtPayoffPlan(financialProfile.liabilities, 500);
  assert.equal(plan.stalled, false);
  assert.equal(Number.isFinite(plan.avalanche.months), true);
  assert.equal(Number.isFinite(plan.snowball.months), true);
  assert.equal(plan.avalanche.totalInterest <= plan.snowball.totalInterest, true);
  // Avalanche on this book targets the 18.9% credit card first.
  assert.equal(plan.avalanche.order[0], "Credit card");
});

test("snowball is recommended only for 3+ debts with a small quick win", () => {
  const manySmall = buildDebtPayoffPlan(
    [
      { label: "Store card", balance: 800, rate: 5, monthlyPayment: 25 },
      { label: "Card", balance: 2000, rate: 15, monthlyPayment: 60 },
      { label: "Loan", balance: 5000, rate: 22, monthlyPayment: 150 }
    ],
    200
  );
  assert.equal(manySmall.recommendation, "snowball");

  const twoDebts = buildDebtPayoffPlan(
    [
      { label: "Card", balance: 900, rate: 20, monthlyPayment: 40 },
      { label: "Loan", balance: 6000, rate: 8, monthlyPayment: 120 }
    ],
    200
  );
  assert.equal(twoDebts.recommendation, "avalanche");
});

test("payments below interest are reported as stalled, not simulated forever", () => {
  const plan = buildDebtPayoffPlan([{ label: "Card", balance: 10000, rate: 30, monthlyPayment: 100 }], 0);
  assert.equal(plan.stalled, true);
  assert.equal(plan.avalanche.months, null);
  assert.match(plan.reason, /don't cover the interest/i);
});

// ─── Affordability ceilings ──────────────────────────────────────────────────

test("riskier personas get tighter ceilings on the same income", () => {
  const base = computeAffordabilityCeilings({ monthlyTakeHome: 5000, persona: {}, debtToIncome: 0.1 });
  const risky = computeAffordabilityCeilings({
    monthlyTakeHome: 5000,
    persona: getPersonaCoefficients({ worker_type: "freelance", pay_frequency: "irregular", household: "support_family", risk_backing: "none" }, {}),
    debtToIncome: 0.1
  });

  assert.equal(risky.rentMonthly < base.rentMonthly, true);
  assert.equal(risky.carAllInMonthly < base.carAllInMonthly, true);
  assert.equal(risky.homePriceMax < base.homePriceMax, true);
});

test("heavy existing debt cuts the car ceiling", () => {
  const light = computeAffordabilityCeilings({ monthlyTakeHome: 5000, persona: {}, debtToIncome: 0.1 });
  const heavy = computeAffordabilityCeilings({ monthlyTakeHome: 5000, persona: {}, debtToIncome: 0.45 });
  assert.equal(heavy.carAllInMonthly < light.carAllInMonthly, true);
});

// ─── Money facts ─────────────────────────────────────────────────────────────

test("retirement prompts surface the matching deterministic facts", () => {
  const roth = getMoneyFacts("should I max my Roth IRA?");
  assert.equal(roth.length > 0, true);
  assert.equal(roth.some((fact) => fact.includes("59½")), true);

  const k401 = getMoneyFacts("how much should I put in my 401k?");
  assert.equal(k401.some((fact) => fact.includes("$24,500")), true);

  assert.deepEqual(getMoneyFacts("can I afford a $2,500 trip?"), []);
});

// ─── Integration: knowledge rides on decision results ────────────────────────

test("car questions carry persona-adjusted affordability ceilings into the result", () => {
  const session = buildDecisionSession({
    prompt: "Can I afford a $400/month car payment?",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(Boolean(session.result.affordability), true);
  assert.equal(session.result.affordability.carAllInMonthly > 0, true);
});

test("debt questions carry the payoff plan; every result carries the goal funding check", () => {
  const session = buildDecisionSession({
    prompt: "Should I pay off my credit card debt or invest?",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(Boolean(session.result.debtPlan), true);
  assert.equal(session.result.debtPlan.debtCount, 3);

  assert.equal(Boolean(session.result.goalFunding), true);
  assert.equal(session.result.goalFunding.goals.length > 0, true);
  for (const goal of session.result.goalFunding.goals) {
    assert.equal(goal.requiredMonthly >= 0, true);
    assert.equal(typeof goal.funded, "boolean");
  }
});

test("same emergency, different personas, different risk verdicts (P1-a)", () => {
  const lowCashProfile = {
    ...financialProfile,
    assets: [{ label: "Checking", value: 30000, bucket: "cash", liquid: true, note: "" }]
  };
  const run = (persona) => buildDecisionSession({
    prompt: "What if I get hit with a $3,000 emergency bill?",
    profile: { ...lowCashProfile, persona },
    goals: defaultGoals,
    catalog: starterScenarios
  }).result.risk.label;

  const dependents = run(getPersonaCoefficients({ risk_backing: "dependents", household: "support_family", worker_type: "freelance" }, {}));
  const familyBackstop = run(getPersonaCoefficients({ risk_backing: "family" }, {}));

  assert.equal(dependents, "High");
  assert.notEqual(familyBackstop, "High");
});
