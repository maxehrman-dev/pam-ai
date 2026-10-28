import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionSession, parseAgeSpan } from "../src/utils/scenarioEngine.js";
import { defaultGoals, financialProfile, starterScenarios } from "../src/data/mockData.js";

const ask = (prompt, profile = financialProfile) =>
  buildDecisionSession({ prompt, profile, goals: defaultGoals, catalog: starterScenarios }).result;

test("ages in the question are read, and amounts, rates and durations are not", () => {
  assert.deepEqual(parseAgeSpan("If I invest $400 a month starting at 24, where could I be at 45?"), { startAge: 24, endAge: 45 });
  assert.deepEqual(parseAgeSpan("from 22 to 60 how much if I save 300/mo"), { startAge: 22, endAge: 60 });
  assert.deepEqual(parseAgeSpan("I'm 26, can I retire at 50 if I max my Roth?"), { startAge: 26, endAge: 50 });
  assert.deepEqual(parseAgeSpan("invest $500 a month at 6.8% for 10 years"), { startAge: null, endAge: null });
  assert.deepEqual(parseAgeSpan("Should I put $45 a month into an index fund?"), { startAge: null, endAge: null });
});

test("investing range, compounding and taxes all use the ages the user stated", () => {
  const result = ask("If I invest $400 a month starting at 24, where could I be at 45?");
  assert.equal(result.marketRange.startAge, 24);
  assert.equal(result.marketRange.endAge, 45);
  assert.equal(result.marketRange.months, 252);
  assert.equal(result.taxStrategies.months, 252);
  assert.equal(result.compounding.costOfWaiting.startAge, 24);
  assert.equal(result.compounding.costOfWaiting.endAge, 45);
  assert.match(result.marketRange.assumptions[0], /from age 24 to 45, as you asked/);
});

test("a stated end age alone starts from the user's real age", () => {
  const profile = { ...financialProfile, user: { ...financialProfile.user, age: 26 } };
  const result = ask("If I invest $400 a month, where could I be at 45?", profile);
  assert.equal(result.marketRange.startAge, 26);
  assert.equal(result.marketRange.endAge, 45);
});

test("an apartment price is the new total rent, compared with what they pay today", () => {
  // Mock profile pays $2,450 today: an $1,800 place saves $650 a month.
  const cheaper = buildDecisionSession({ prompt: "Can I afford a $1,800 apartment?", profile: financialProfile, goals: defaultGoals, catalog: starterScenarios });
  assert.equal(cheaper.draft.monthlyExpenseDelta, -650);
  assert.ok(cheaper.result.scenarioPath.monthlyFreeCash > cheaper.result.currentPath.monthlyFreeCash);

  const increase = buildDecisionSession({ prompt: "My rent goes up $200 more a month", profile: financialProfile, goals: defaultGoals, catalog: starterScenarios });
  assert.equal(increase.draft.monthlyExpenseDelta, 200);
});

test("living with family means the whole new rent is new cost", () => {
  const atHome = {
    ...financialProfile,
    monthly: { ...financialProfile.monthly, fixed: financialProfile.monthly.fixed.filter((entry) => !/rent|housing|mortgage/i.test(entry.label)) }
  };
  const session = buildDecisionSession({ prompt: "Can I afford a $1,500 apartment?", profile: atHome, goals: defaultGoals, catalog: starterScenarios });
  assert.equal(session.draft.monthlyExpenseDelta, 1500);
});

test("a cheaper option that still delays a goal explains the up-front cost", () => {
  const session = buildDecisionSession({ prompt: "Can I afford a $1,800 apartment?", profile: financialProfile, goals: defaultGoals, catalog: starterScenarios });
  const { ahaMoment, goalsSummary } = session.result;
  if (goalsSummary?.mostImpactedGoal?.deltaMonths > 0) {
    assert.match(ahaMoment, /saves \$650\/mo, but about .* up front/);
  } else {
    assert.doesNotMatch(ahaMoment, /delays/);
  }
});

test("pay off debt or invest gets a side-by-side answer, not a plain investing plan", () => {
  const result = ask("Should I pay off debt or start investing?");
  // Mock card is 18.9%: pay it first, keep the cheap loans on minimums.
  assert.equal(result.comparison.call, "debt");
  assert.match(result.comparison.headline, /credit card first, then invest/i);
  const pick = result.comparison.options.find((option) => option.recommended);
  assert.equal(pick.key, "plan");
  for (const option of result.comparison.options) assert.ok(pick.net >= option.net, `${pick.label} should beat ${option.label}`);
});

test("asking about one cheap debt weighs only that debt", () => {
  const result = ask("Should I invest or pay down my student loans?");
  assert.equal(result.comparison.call, "invest");
  assert.equal(result.comparison.topLabel, "Student loans");
});

test("debt vs invest questions are never modeled as a car purchase", () => {
  const session = buildDecisionSession({ prompt: "Should I pay off my car loan or invest?", profile: financialProfile, goals: defaultGoals, catalog: starterScenarios });
  assert.equal(session.draft.type, "invest");
  assert.equal(session.result.comparison.topLabel, "Auto loan");
});

test("plain investing questions don't trigger the comparison", () => {
  assert.equal(ask("Should I invest $400 a month?").comparison, undefined);
  assert.equal(ask("Can I afford a car loan or should I lease?").comparison, undefined);
});

test("no debt means invest, with a nudge to add debt PAM can't see", () => {
  const debtFree = { ...financialProfile, liabilities: [] };
  const result = ask("Should I pay off debt or invest?", debtFree);
  assert.equal(result.comparison.call, "invest");
  assert.deepEqual(result.comparison.options, []);
});
