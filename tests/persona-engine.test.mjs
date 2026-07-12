import test from "node:test";
import assert from "node:assert/strict";

import { getPersonaCoefficients } from "../src/utils/personaEngine.js";
import { computePaycheckSplit } from "../src/utils/scenarioEngine.js";
import { financialProfile } from "../src/data/mockData.js";

test("salaried defaults: no persona signals means base coefficients", () => {
  const persona = getPersonaCoefficients({ worker_type: "salaried", pay_frequency: "biweekly" }, {});
  assert.equal(persona.bufferTargetMonths, 3);
  assert.equal(persona.guiltFreeFloorPct, 10);
  assert.equal(persona.taxSetAsidePct, 0);
  assert.equal(persona.incomeReliability, 1);
  assert.deepEqual(persona.tags, []);
});

test("freelancer gets a tax set-aside and a bigger buffer", () => {
  const persona = getPersonaCoefficients({ worker_type: "freelance" }, { combinedTaxRate: 22 });
  assert.equal(persona.bufferTargetMonths, 5);
  assert.equal(persona.taxSetAsidePct, 25); // floor of 25 beats the 22% estimate
  assert.equal(persona.notes.length > 0, true);

  const highRate = getPersonaCoefficients({ worker_type: "freelance" }, { combinedTaxRate: 31 });
  assert.equal(highRate.taxSetAsidePct, 31);
});

test("modifiers compose: irregular-pay freelancer supporting family, no backstop", () => {
  // MARCUS from BRAIN.md: every dimension contributes; nothing branches per combo.
  const persona = getPersonaCoefficients(
    { worker_type: "freelance", pay_frequency: "irregular", household: "support_family", risk_backing: "none" },
    { combinedTaxRate: 20 }
  );
  assert.equal(persona.bufferTargetMonths, 8); // 3 +2 +1 +1 +1
  assert.equal(persona.guiltFreeFloorPct, 8);
  assert.equal(persona.incomeReliability, 0.85);
  assert.equal(persona.taxSetAsidePct, 25);
  assert.equal(persona.tags.length, 4);
});

test("buffer target clamps at 9 months no matter how many risk signals stack", () => {
  const persona = getPersonaCoefficients(
    { worker_type: "freelance", pay_frequency: "irregular", household: "support_family", risk_backing: "dependents", housing: "own", career_stage: "between" },
    {}
  );
  assert.equal(persona.bufferTargetMonths, 9);
});

test("family backstop lowers the buffer target", () => {
  const persona = getPersonaCoefficients({ risk_backing: "family" }, {});
  assert.equal(persona.bufferTargetMonths, 2);
});

test("split with a freelancer persona adds a tax bucket and still sums to income", () => {
  const freelancerProfile = {
    ...financialProfile,
    persona: getPersonaCoefficients({ worker_type: "freelance" }, { combinedTaxRate: 28 })
  };
  const plan = computePaycheckSplit(freelancerProfile, { payFrequency: "monthly" });

  const taxBucket = plan.buckets.find((bucket) => bucket.id === "tax");
  assert.equal(Boolean(taxBucket), true);
  assert.equal(taxBucket.monthly, Math.round(plan.income * 0.28));
  const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);
  assert.equal(bucketSum, plan.income);
});

test("split with irregular pay keeps a volatility cushion and still sums to income", () => {
  const irregularProfile = {
    ...financialProfile,
    persona: getPersonaCoefficients({ pay_frequency: "irregular" }, {})
  };
  const plan = computePaycheckSplit(irregularProfile, { payFrequency: "monthly" });

  const cushion = plan.buckets.find((bucket) => bucket.id === "cushion");
  assert.equal(Boolean(cushion), true);
  assert.equal(cushion.monthly, plan.income - plan.planningIncome);
  const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);
  assert.equal(bucketSum, plan.income);
});

test("buckets still sum to income when essentials overflow the discounted planning income", () => {
  // Freelancer with irregular pay whose essentials + tax exceed 85% of income
  // but not full income: the volatility cushion must shrink to absorb the
  // overflow instead of double-counting dollars.
  const tightProfile = {
    ...financialProfile,
    monthly: {
      ...financialProfile.monthly,
      income: [{ label: "Freelance income", amount: 7000 }]
    },
    persona: getPersonaCoefficients(
      { worker_type: "freelance", pay_frequency: "irregular", household: "support_family", risk_backing: "none" },
      { combinedTaxRate: 25 }
    )
  };
  const plan = computePaycheckSplit(tightProfile, { payFrequency: "biweekly" });

  const bucketSum = plan.buckets.reduce((total, bucket) => total + bucket.monthly, 0);
  assert.equal(bucketSum, plan.income);
  assert.equal(plan.warnings.length > 0, true);
});

test("same paycheck, different people, different plans — the tailoring is deterministic", () => {
  const salaried = computePaycheckSplit(
    { ...financialProfile, persona: getPersonaCoefficients({ worker_type: "salaried" }, {}) },
    { payFrequency: "biweekly" }
  );
  const marcus = computePaycheckSplit(
    {
      ...financialProfile,
      persona: getPersonaCoefficients(
        { worker_type: "freelance", household: "support_family", risk_backing: "none" },
        { combinedTaxRate: 25 }
      )
    },
    { payFrequency: "biweekly" }
  );

  // Same income, same baseline — but Marcus sets aside taxes and gets less
  // guilt-free money, because his persona carries more obligation.
  assert.equal(salaried.income, marcus.income);
  assert.equal(salaried.taxSetAside, 0);
  assert.equal(marcus.taxSetAside > 0, true);
  assert.equal(marcus.guiltFree < salaried.guiltFree, true);
  assert.equal(marcus.personaTags.length > 0, true);
});
