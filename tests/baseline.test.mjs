import test from "node:test";
import assert from "node:assert/strict";

import {
  BASELINE_STORAGE_KEY,
  getCurrentSavings,
  getMonthlyBuffer,
  getMonthlyExpenses,
  getMonthlyObligations,
  getMockPlaidLikeData,
  getSpendableIncome,
  normalizeManualBaseline,
  normalizePlaidMockData,
  resetBaseline,
  saveBaseline,
  validateBaseline
} from "../src/utils/baseline.mjs";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test("manual baseline saves into normalized format", () => {
  const baseline = normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    age: 24,
    creditScore: 720,
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    monthlyObligations: 280,
    currentSavings: 12000,
    longTermGoal: "Move out safely",
    goalTargetAmount: 17000,
    goalTimelineMonths: 18
  });

  assert.equal(baseline.source, "manual");
  assert.equal(baseline.profile.firstName, "Jordan");
  assert.equal(baseline.profile.creditScore, 720);
  assert.equal(baseline.profile.employmentStatus, "w2");
  assert.equal(baseline.income.grossMonthlyIncome, 5600);
  assert.equal(baseline.goals.goalTargetAmount, 17000);
});

test("sandbox-style sample data saves into normalized format", () => {
  const baseline = normalizePlaidMockData(getMockPlaidLikeData());

  assert.equal(baseline.source, "plaid_mock");
  assert.equal(baseline.income.detectedMonthlyIncome, 4450);
  assert.equal(getMonthlyExpenses(baseline), 2885);
  assert.equal(getMonthlyObligations(baseline), 330);
  assert.equal(getCurrentSavings(baseline), 17400);
  assert.equal(baseline.profile.creditScore, 720);
  assert.equal(baseline.savings.connectedAccounts.length >= 4, true);
  assert.equal(baseline.savings.connectedAccounts.some((account) => account.type === "investment"), true);
});

test("Jordan-style profile produces a monthly buffer around 1270", () => {
  const baseline = normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    age: 24,
    knownTakeHomeMonthlyIncome: 4450,
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    monthlyObligations: 280,
    currentSavings: 12000,
    longTermGoal: "Move out safely",
    goalTargetAmount: 17000,
    goalTimelineMonths: 18
  });

  assert.equal(getMonthlyBuffer(baseline), 1270);
});

test("known take-home income is not taxed again", () => {
  const baseline = normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    knownTakeHomeMonthlyIncome: 4450,
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    currentSavings: 12000,
    longTermGoal: "Move out safely",
    goalTargetAmount: 17000,
    goalTimelineMonths: 18
  });

  assert.equal(getSpendableIncome(baseline), 4450);
});

test("goal target amount 0 is blocked", () => {
  const baseline = normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    currentSavings: 12000,
    longTermGoal: "Move out safely",
    goalTargetAmount: 0,
    goalTimelineMonths: 18
  });

  const errors = validateBaseline(baseline);
  assert.ok(errors.includes("Add a goal target amount or use an estimate."));
});

test("move-out estimate fills 17000 when goal target is missing", () => {
  const baseline = normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    currentSavings: 12000,
    longTermGoal: "Move out safely"
  });

  assert.equal(baseline.goals.goalTargetAmount, 17000);
});

test("reset clears pam:baseline:v2", () => {
  const storage = createStorage();
  saveBaseline(normalizeManualBaseline({
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    grossMonthlyIncome: 5600,
    employmentStatus: "W-2 employee",
    stateCode: "CA",
    monthlyExpenses: 2900,
    currentSavings: 12000,
    longTermGoal: "Move out safely",
    goalTargetAmount: 17000,
    goalTimelineMonths: 18
  }), storage);

  assert.ok(storage.getItem(BASELINE_STORAGE_KEY));
  resetBaseline(storage);
  assert.equal(storage.getItem(BASELINE_STORAGE_KEY), null);
});

test("saveBaseline does not persist Plaid tokens to storage", () => {
  const storage = createStorage();
  saveBaseline({
    ...normalizePlaidMockData(getMockPlaidLikeData()),
    access_token: "should-not-save",
    public_token: "should-not-save"
  }, storage);

  const raw = storage.getItem(BASELINE_STORAGE_KEY);
  assert.ok(raw);
  assert.equal(raw.includes("access_token"), false);
  assert.equal(raw.includes("public_token"), false);
});
