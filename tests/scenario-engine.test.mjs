import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionSession } from "../src/utils/scenarioEngine.js";
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
