import test from "node:test";
import assert from "node:assert/strict";

import { simulateMarketRange } from "../src/utils/monteCarlo.js";
import { compareTaxStrategies, getRothIraEligibleShare } from "../src/utils/taxStrategies.js";
import { buildDecisionSession } from "../src/utils/scenarioEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";
import { PERSONA_FIXTURES, fixtureProfile } from "./fixtures/personas.mjs";

const W2_TAX = { federalMarginal: 0.22, stateRate: 0.05, taxableIncome: 70000, grossAnnual: 85000, employmentStatus: "w2" };

test("monte carlo is reproducible: same inputs give the exact same range", () => {
  const inputs = { startBalance: 5000, monthlyContribution: 400, months: 120, goalAmount: 80000 };
  assert.deepEqual(simulateMarketRange(inputs), simulateMarketRange(inputs));
});

test("monte carlo range is ordered and collapses to the fixed-rate line with zero volatility", () => {
  const range = simulateMarketRange({ startBalance: 10000, monthlyContribution: 300, months: 240 });
  assert.ok(range.low <= range.typical && range.typical <= range.high);
  assert.ok(range.low < range.high, "volatility must produce a spread");

  const flat = simulateMarketRange({ startBalance: 10000, monthlyContribution: 300, months: 240, annualVolatility: 0 });
  assert.ok(Math.abs(flat.typical - flat.fixedRate) <= 1);
  assert.equal(flat.low, flat.high);
});

test("goal odds rise with contributions and stay within 0-100", () => {
  const low = simulateMarketRange({ monthlyContribution: 200, months: 120, goalAmount: 40000 });
  const high = simulateMarketRange({ monthlyContribution: 400, months: 120, goalAmount: 40000 });
  assert.ok(high.goalProbabilityPct >= low.goalProbabilityPct);
  for (const run of [low, high]) assert.ok(run.goalProbabilityPct >= 0 && run.goalProbabilityPct <= 100);
});

test("amount parsing does not read the m in 'more' as million", () => {
  const parse = (prompt) => buildDecisionSession({ prompt, profile: financialProfile, goals: defaultGoals, catalog: starterScenarios }).result.draft.monthlyInvestingDelta;
  assert.equal(parse("What if I invest $300 more a month?"), 300);
  assert.equal(parse("What if I invest $300 a month?"), 300);
});

test("with zero taxes every account lands on the same after-tax value (identical markets)", () => {
  const result = compareTaxStrategies({
    monthlyBudget: 300,
    months: 120,
    tax: { federalMarginal: 0, stateRate: 0, taxableIncome: 0, grossAnnual: 20000, employmentStatus: "w2" }
  });
  const taxable = result.strategies.find((strategy) => strategy.id === "taxable");
  const roth = result.strategies.find((strategy) => strategy.id === "roth-ira");
  const traditional = result.strategies.find((strategy) => strategy.id === "traditional-401k");
  assert.equal(roth.afterTax.typical, taxable.afterTax.typical);
  assert.equal(traditional.afterTax.typical, taxable.afterTax.typical);
});

test("traditional beats roth when today's bracket is above the retirement estimate", () => {
  const result = compareTaxStrategies({
    monthlyBudget: 500,
    months: 240,
    tax: { federalMarginal: 0.32, stateRate: 0.06, taxableIncome: 200000, grossAnnual: 160000, employmentStatus: "w2" }
  });
  const roth401k = result.strategies.find((strategy) => strategy.id === "roth-401k");
  const traditional = result.strategies.find((strategy) => strategy.id === "traditional-401k");
  assert.ok(traditional.afterTax.typical > roth401k.afterTax.typical);
  assert.equal(result.bestId, "traditional-401k");
});

test("roth matches or beats traditional when today's bracket is at the retirement estimate", () => {
  const result = compareTaxStrategies({
    monthlyBudget: 400,
    months: 240,
    tax: { federalMarginal: 0.12, stateRate: 0.03, taxableIncome: 40000, grossAnnual: 52000, employmentStatus: "w2" }
  });
  const roth = result.strategies.find((strategy) => strategy.id === "roth-ira");
  const traditional = result.strategies.find((strategy) => strategy.id === "traditional-401k");
  assert.ok(roth.afterTax.typical >= traditional.afterTax.typical - 1);
});

test("high earners lose direct Roth IRA eligibility and get the backdoor note", () => {
  assert.equal(getRothIraEligibleShare(200000), 0);
  assert.equal(getRothIraEligibleShare(50000), 1);
  const result = compareTaxStrategies({
    monthlyBudget: 1500,
    months: 120,
    tax: { federalMarginal: 0.32, stateRate: 0.05, taxableIncome: 190000, grossAnnual: 210000, employmentStatus: "w2" }
  });
  assert.equal(result.strategies.find((strategy) => strategy.id === "roth-ira").eligible, false);
  assert.ok(result.strategyNotes.some((note) => note.id === "backdoor-roth"));
  assert.notEqual(result.bestId, "roth-ira");
});

test("contribution limits are respected and overflow goes to taxable", () => {
  const result = compareTaxStrategies({ monthlyBudget: 5000, months: 120, tax: W2_TAX });
  const roth = result.strategies.find((strategy) => strategy.id === "roth-ira");
  const traditional = result.strategies.find((strategy) => strategy.id === "traditional-401k");
  const hsa = result.strategies.find((strategy) => strategy.id === "hsa");
  assert.equal(roth.monthlyIntoAccount, 625);
  assert.equal(roth.overflowToTaxable, 4375);
  assert.ok(traditional.monthlyIntoAccount <= Math.round(24500 / 12));
  assert.ok(hsa.monthlyIntoAccount <= Math.round(4400 / 12));
});

test("tax analytics: totals add up and missing tax data is named, not hidden", () => {
  const result = compareTaxStrategies({ monthlyBudget: 300, months: 120, tax: {} });
  for (const strategy of result.strategies) {
    const { upfront, duringGrowth, atWithdrawal, total } = strategy.taxes;
    assert.equal(total, upfront + duringGrowth + atWithdrawal);
    assert.ok(strategy.effectiveTaxRatePct >= 0 && strategy.effectiveTaxRatePct < 60);
  }
  assert.ok(result.assumptions.some((line) => line.includes("assumed a 22% federal bracket")));
});

test("investing asks carry a market range and tax comparison for every persona fixture", () => {
  for (const fixture of PERSONA_FIXTURES) {
    const profile = fixtureProfile(fixture);
    const session = buildDecisionSession({
      prompt: "What if I invest $250 more a month?",
      profile: { ...profile, tax: W2_TAX },
      goals: defaultGoals,
      catalog: starterScenarios
    });
    const { marketRange, taxStrategies } = session.result;
    assert.ok(marketRange, `${fixture.id}: expected a market range`);
    assert.ok(Number.isFinite(marketRange.scenario.typical), `${fixture.id}: range must be finite`);
    assert.ok(marketRange.scenario.typical >= marketRange.current.typical, `${fixture.id}: investing more cannot lower the typical outcome`);
    assert.ok(taxStrategies && taxStrategies.monthlyBudget === 250, `${fixture.id}: tax comparison should use the new $250`);
  }
});

test("cash-flow asks without market exposure skip the market range", () => {
  const session = buildDecisionSession({
    prompt: "Can I afford a $1,800/month apartment?",
    profile: financialProfile,
    goals: defaultGoals,
    catalog: starterScenarios
  });
  assert.equal(session.result.marketRange, undefined);
  assert.equal(session.result.taxStrategies, undefined);
});
