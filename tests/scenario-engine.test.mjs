import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionSession, computePaycheckSplit } from "../src/utils/scenarioEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";

test("car decisions include credit and approval readiness when credit score is available", () => {
  const session = buildDecisionSession({
    prompt: "Can I buy a car with a $400/month payment?",
    profile: {
      ...financialProfile,
      user: {
        ...financialProfile.user,
        creditScore: 735
      }
    },
    goals: defaultGoals,
    catalog: starterScenarios
  });

  assert.equal(Boolean(session.result.creditReadiness), true);
  assert.equal(session.result.creditReadiness.score, 735);
  assert.match(session.result.creditReadiness.approvalStrength, /Strong|Workable|Possible|Low/);
  assert.equal(session.result.impactCards.some((card) => card.label === "Loan / approval"), true);
});

test("loan-style decisions ask for credit score instead of inventing approval odds", () => {
  const session = buildDecisionSession({
    prompt: "Could I qualify for a personal loan for $5,000?",
    profile: {
      ...financialProfile,
      user: {
        ...financialProfile.user,
        creditScore: null
      }
    },
    goals: defaultGoals,
    catalog: starterScenarios
  });

  assert.equal(Boolean(session.result.creditReadiness), true);
  assert.equal(session.result.creditReadiness.score, null);
  assert.equal(session.result.creditReadiness.approvalStrength, "Needs more info");
});

test("paycheck split prompts route to a deterministic split whose buckets cover every dollar", () => {
  const session = buildDecisionSession({
    prompt: "How should I split my paycheck?",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });

  assert.equal(session.draft.type, "paycheckSplit");
  const plan = session.result.splitPlan;
  assert.equal(Boolean(plan), true);
  const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);
  assert.equal(bucketSum, plan.income);
  assert.equal(plan.income > 0, true);
  assert.equal(Array.isArray(plan.setupSteps) && plan.setupSteps.length > 0, true);
});

test("paycheck split is reproducible: same inputs give the exact same plan", () => {
  const first = computePaycheckSplit(financialProfile, { payFrequency: "biweekly" });
  const second = computePaycheckSplit(financialProfile, { payFrequency: "biweekly" });
  assert.deepEqual(first, second);
});

test("split asks one follow-up for pay cadence when it is unknown", () => {
  const session = buildDecisionSession({
    prompt: "How should I split my paycheck?",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });

  assert.equal(Boolean(session.followUp), true);
  assert.match(session.followUp.prompt, /paycheck land/i);

  const knownFrequency = buildDecisionSession({
    prompt: "Split my paycheck — paid every two weeks",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(knownFrequency.draft.payFrequency, "biweekly");
  assert.equal(knownFrequency.followUp, null);
});

test("split pays down high-APR debt before investing and caps the extra at the balance", () => {
  const plan = computePaycheckSplit(financialProfile, { payFrequency: "biweekly" });
  // Mock profile carries an 18.9% APR credit card with a $1,850 balance.
  assert.equal(plan.topHighAprDebt.rate, 18.9);
  assert.equal(plan.debtExtra > 0, true);
  assert.equal(plan.debtExtra <= 1850, true);
  assert.equal(plan.buckets.some((bucket) => bucket.id === "debt"), true);
});

test("split fills the emergency buffer first when liquid savings are short", () => {
  const lowLiquidProfile = {
    ...financialProfile,
    assets: [{ label: "Checking", value: 1000, bucket: "cash", liquid: true, note: "" }]
  };
  const plan = computePaycheckSplit(lowLiquidProfile, { payFrequency: "biweekly", bufferTargetMonths: 3 });

  assert.equal(plan.bufferContribution > 0, true);
  assert.equal(Number.isFinite(plan.bufferMonthsToTarget), true);
  assert.equal(plan.bufferTargetAmount, plan.essentials * 3);
  const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);
  assert.equal(bucketSum, plan.income);
});

test("split assumptions are editable and change the plan deterministically", () => {
  const threeMonths = computePaycheckSplit(financialProfile, { payFrequency: "biweekly", bufferTargetMonths: 3 });
  const sixMonths = computePaycheckSplit(financialProfile, { payFrequency: "biweekly", bufferTargetMonths: 6 });
  assert.equal(sixMonths.bufferTargetAmount, threeMonths.bufferTargetAmount * 2);

  const leanGuiltFree = computePaycheckSplit(financialProfile, { payFrequency: "biweekly", guiltFreePct: 5 });
  assert.equal(leanGuiltFree.guiltFree < threeMonths.guiltFree, true);
});

test("split degrades honestly when essentials exceed income instead of inventing room", () => {
  const strainedProfile = {
    ...financialProfile,
    monthly: {
      ...financialProfile.monthly,
      income: [{ label: "Take-home salary", amount: 3000 }]
    }
  };
  const plan = computePaycheckSplit(strainedProfile, { payFrequency: "biweekly" });

  assert.equal(plan.guiltFree, 0);
  assert.equal(plan.investing, 0);
  assert.equal(plan.warnings.length > 0, true);

  const session = buildDecisionSession({
    prompt: "Split my paycheck — paid monthly",
    profile: strainedProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(session.result.risk.label, "High");
});

test("split converts monthly buckets into per-paycheck amounts by cadence", () => {
  const weekly = computePaycheckSplit(financialProfile, { payFrequency: "weekly" });
  assert.equal(weekly.perPaycheckIncome, Math.round(weekly.income / (52 / 12)));

  const monthly = computePaycheckSplit(financialProfile, { payFrequency: "monthly" });
  assert.equal(monthly.perPaycheckIncome, monthly.income);
});

test("the aha line describes the buffer's real direction", async () => {
  const { defaultGoals, financialProfile, starterScenarios } = await import("../src/data/mockData.js");
  const ask = (prompt) => buildDecisionSession({ prompt, profile: financialProfile, goals: defaultGoals, catalog: starterScenarios }).result.ahaMoment;
  const investing = ask("What if I invest $300 more a month?");
  assert.ok(!/drops .* more room/.test(investing), investing);
  if (/buffer/.test(investing)) assert.match(investing, /drops|stays/);
});

test("new monthly costs come out of free cash before goal savings are cut", async () => {
  const { financialProfile, starterScenarios } = await import("../src/data/mockData.js");
  const goals = [{ id: "g", title: "Emergency fund", category: "Emergency", targetAmount: 20000, currentAmount: 5000, monthlyContribution: 400, priority: "high", fundingSource: "cash", targetTimelineMonths: 36, annualReturn: 0.024 }];
  const session = buildDecisionSession({ prompt: "Can I afford a $200/month gym and streaming bundle?", draft: { type: "custom", monthlyExpenseDelta: 200, prompt: "gym" }, profile: financialProfile, goals, catalog: starterScenarios });
  const goal = session.result.goalsSummary.goals[0];
  assert.equal(goal.scenarioMonthlyContribution, 400, "spare cash covers $200, so the goal keeps its $400/mo");
});

test("a funded goal dipped by a one-time cost refills from spare cash instead of taking a decade", async () => {
  const { financialProfile, starterScenarios } = await import("../src/data/mockData.js");
  const goals = [{ id: "g", title: "Move out safely", category: "Move out", targetAmount: 17000, currentAmount: 17000, monthlyContribution: 0, priority: "high", fundingSource: "cash", targetTimelineMonths: 18, annualReturn: 0.024 }];
  const session = buildDecisionSession({ prompt: "Can I afford a $450/month car payment?", profile: financialProfile, goals, catalog: starterScenarios });
  const goal = session.result.goalsSummary.goals[0];
  assert.ok(Number.isFinite(goal.deltaMonths) && goal.deltaMonths <= 24, `delay should be months, not years (got ${goal.deltaMonths})`);
  assert.ok(goal.scenarioMonthlyContribution > 0);
});
