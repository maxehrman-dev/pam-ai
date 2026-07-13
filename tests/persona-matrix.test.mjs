import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionSession, computePaycheckSplit } from "../src/utils/scenarioEngine.js";
import { defaultGoals, starterScenarios } from "../src/data/mockData.js";
import { PERSONA_FIXTURES, fixtureProfile } from "./fixtures/personas.mjs";

// Layer 3 (BRAIN.md): the same engines must hold their invariants for every
// persona in the matrix — this is "every possible user" as a permanent test,
// not an aspiration. New engines add their assertion here.

test("paycheck split invariants hold across all 10 persona fixtures", () => {
  for (const fixture of PERSONA_FIXTURES) {
    const profile = fixtureProfile(fixture);
    const plan = computePaycheckSplit(profile, { payFrequency: fixture.payFrequency || "biweekly" });
    const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);

    if (fixture.expectOverCommitted) {
      // Essentials exceed income: the split must say so, never invent room.
      assert.equal(plan.warnings.length > 0, true, `${fixture.id}: expected over-committed warning`);
      assert.equal(plan.guiltFree, 0, `${fixture.id}: guilt-free should be zero when essentials exceed income`);
    } else {
      assert.equal(bucketSum, plan.income, `${fixture.id}: buckets must sum to income exactly (got ${bucketSum} vs ${plan.income})`);
    }

    if (fixture.expectTaxBucket) {
      const tax = plan.buckets.find((bucket) => bucket.id === "tax");
      assert.equal(Boolean(tax && tax.monthly > 0), true, `${fixture.id}: self-employed fixture must get a tax set-aside bucket`);
    }
  }
});

test("decision sessions produce complete, persona-tailored results for every fixture", () => {
  for (const fixture of PERSONA_FIXTURES) {
    const profile = fixtureProfile(fixture);
    const session = buildDecisionSession({
      prompt: "Can I afford a $250/month car payment?",
      profile,
      goals: defaultGoals,
      catalog: starterScenarios
    });

    assert.equal(["Low", "Medium", "High"].includes(session.result.risk.label), true, `${fixture.id}: risk label missing`);
    assert.equal(typeof session.result.ahaMoment === "string" && session.result.ahaMoment.length > 0, true, `${fixture.id}: ahaMoment missing`);
    assert.equal(Boolean(session.result.goalFunding), true, `${fixture.id}: goal funding check missing`);
    assert.equal(Boolean(session.result.affordability), true, `${fixture.id}: affordability ceilings missing on a car question`);
    assert.equal(session.result.affordability.carAllInMonthly > 0, true, `${fixture.id}: car ceiling must be positive`);
  }
});

test("debt-heavy fixture gets the snowball quick-win recommendation", () => {
  const dev = PERSONA_FIXTURES.find((fixture) => fixture.id === "DEV");
  const session = buildDecisionSession({
    prompt: "Should I pay off my debt faster?",
    profile: fixtureProfile(dev),
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(Boolean(session.result.debtPlan), true);
  assert.equal(session.result.debtPlan.recommendation, "snowball");
});

test("early-retirement fixtures get bridge math; conventional ones do not", () => {
  const priya = PERSONA_FIXTURES.find((fixture) => fixture.id === "PRIYA");
  const priyaSession = buildDecisionSession({
    prompt: "Should I invest more for retirement?",
    profile: fixtureProfile(priya),
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(Boolean(priyaSession.result.retirementBridge), true);
  assert.equal(priyaSession.result.retirementBridge.targetAge, 45);
  assert.equal(priyaSession.result.retirementBridge.taxableSharePct, 60);

  const sam = PERSONA_FIXTURES.find((fixture) => fixture.id === "SAM");
  const samSession = buildDecisionSession({
    prompt: "Should I invest more for retirement?",
    profile: fixtureProfile(sam),
    goals: defaultGoals,
    catalog: starterScenarios
  });
  // No stated early target — no bridge invented.
  assert.equal(samSession.result.retirementBridge, undefined);
});

test("freelancer income deltas are counted net of the tax set-aside (P1-b)", () => {
  const marcus = PERSONA_FIXTURES.find((fixture) => fixture.id === "MARCUS");
  const session = buildDecisionSession({
    prompt: "What if I add $1,500/mo of freelance income?",
    profile: fixtureProfile(marcus),
    goals: defaultGoals,
    catalog: starterScenarios
  });

  const bufferLift = session.result.scenarioPath.monthlyFreeCash - session.result.currentPath.monthlyFreeCash;
  // 25% set-aside: $1,500 gross becomes $1,125 usable.
  assert.equal(bufferLift, 1125);
  assert.equal(session.result.scenario.assumptions.some((line) => /net of a 25% tax set-aside/.test(line)), true);
});

test("salaried income deltas stay gross — no set-aside applied (P1-b control)", () => {
  const rosa = PERSONA_FIXTURES.find((fixture) => fixture.id === "ROSA");
  const session = buildDecisionSession({
    prompt: "What if I get a raise of $1,500/mo?",
    profile: fixtureProfile(rosa),
    goals: defaultGoals,
    catalog: starterScenarios
  });
  const bufferLift = session.result.scenarioPath.monthlyFreeCash - session.result.currentPath.monthlyFreeCash;
  assert.equal(bufferLift, 1500);
});

test("'when can I' questions get milestone dates from the goal engine (P2-c)", () => {
  const rosa = PERSONA_FIXTURES.find((fixture) => fixture.id === "ROSA");
  const session = buildDecisionSession({
    prompt: "When can I hit my savings goals?",
    profile: fixtureProfile(rosa),
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(Boolean(session.result.milestones), true);
  assert.equal(session.result.milestones.goals.length > 0, true);
  for (const goal of session.result.milestones.goals) {
    assert.equal(typeof goal.dateLabel === "string" && goal.dateLabel.length > 0, true);
  }
});
