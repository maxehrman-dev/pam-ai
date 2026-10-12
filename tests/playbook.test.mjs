import test from "node:test";
import assert from "node:assert/strict";

import { getPlaybook, PLAYBOOK_IDS } from "../src/utils/playbook.js";
import { compareTaxStrategies } from "../src/utils/taxStrategies.js";
import { buildDecisionSession } from "../src/utils/scenarioEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";

const ids = (plays) => plays.map((play) => play.id);

test("car questions surface the new car loan interest deduction", () => {
  assert.ok(ids(getPlaybook({ prompt: "Can I afford a $450/mo car payment?", type: "car" })).includes("car-interest-deduction"));
});

test("hourly workers get the overtime play without asking about it", () => {
  const plays = getPlaybook({ prompt: "Can I afford to move out?", persona: { tags: ["Hourly pay"] } });
  assert.ok(ids(plays).includes("overtime-deduction"));
});

test("job switches flag vesting and negotiation", () => {
  const found = ids(getPlaybook({ prompt: "I got a new job offer in Austin, should I take it?" }));
  assert.ok(found.includes("vesting-before-switch"));
  assert.ok(found.includes("negotiate-offer"));
});

test("plays only appear when they fit, and never more than three", () => {
  assert.deepEqual(getPlaybook({ prompt: "Should I get a dog?" }), []);
  const many = getPlaybook({
    prompt: "new job offer, car loan, student loans, emergency fund, move out, 529, overtime, tips, mortgage",
    type: "car",
    persona: { tags: ["Hourly pay"] }
  });
  assert.equal(many.length, 3);
});

test("short buffers get the emergency-parking play", () => {
  assert.ok(ids(getPlaybook({ prompt: "Can I take a trip?", liquidAssets: 500, bufferTarget: 6000 })).includes("emergency-parking"));
});

test("playbook and tax-strategy copy contain no em dashes", () => {
  const allPlays = getPlaybook({
    prompt: "tips overtime car new job offer salary invest roth 529 student loans emergency credit score buy a house espp hsa move out",
    type: "car",
    persona: { tags: ["Hourly pay"] }
  });
  assert.ok(PLAYBOOK_IDS.length >= 10);
  for (const play of allPlays) assert.ok(!/—/.test(play.title + play.text), `${play.id} has an em dash`);
  const tax = compareTaxStrategies({ monthlyBudget: 300, months: 120, age: 22, tax: { federalMarginal: 0.12, stateRate: 0.05, taxableIncome: 30000, grossAnnual: 38000, employmentStatus: "w2" } });
  for (const note of tax.strategyNotes) assert.ok(!/—/.test(note.text), `${note.id} has an em dash`);
});

test("decision sessions carry the playbook to the result", () => {
  const session = buildDecisionSession({ prompt: "Can I afford a $400/month car payment?", profile: financialProfile, goals: defaultGoals, catalog: starterScenarios });
  assert.ok(Array.isArray(session.result.playbook));
  assert.ok(ids(session.result.playbook).includes("car-interest-deduction"));
});
