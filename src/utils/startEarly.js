// "Start early" simulator: the same monthly amount started now, in 5 years,
// and in 10 years, grown at PAM's planning return. Deterministic; the chart
// and the AI read the same numbers. Copy rule: no em dashes.

import { PLANNING_RETURN, futureValueOfMonthly } from "./compounding.js";

export const START_EARLY_LIMITS = Object.freeze({
  monthly: { min: 25, max: 1000, step: 25, initial: 200 },
  age: { min: 16, max: 45, step: 1, initial: 18 },
  endAge: { min: 45, max: 70, step: 1, initial: 65 }
});

const DELAYS = [0, 5, 10];

function clampInt(value, { min, max }, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

export function normalizeStartEarlyInputs(raw = {}) {
  const monthly = clampInt(raw.monthly, START_EARLY_LIMITS.monthly, START_EARLY_LIMITS.monthly.initial);
  const age = clampInt(raw.age, START_EARLY_LIMITS.age, START_EARLY_LIMITS.age.initial);
  const endAge = Math.max(clampInt(raw.endAge, START_EARLY_LIMITS.endAge, START_EARLY_LIMITS.endAge.initial), age + 15);
  return { monthly, age, endAge: Math.min(endAge, 80) };
}

export function computeStartEarly(rawInputs = {}, annualReturn = PLANNING_RETURN) {
  const { monthly, age, endAge } = normalizeStartEarlyInputs(rawInputs);
  const years = endAge - age;
  const paths = DELAYS.filter((delay) => delay < years - 5).map((delay) => {
    const startAge = age + delay;
    const series = [];
    for (let year = 0; year <= years; year += 1) {
      const investedMonths = Math.max(year - delay, 0) * 12;
      series.push({ age: age + year, balance: Math.round(futureValueOfMonthly(monthly, investedMonths, annualReturn)) });
    }
    const final = series[series.length - 1].balance;
    const contributed = monthly * (years - delay) * 12;
    return { delay, startAge, final, contributed, growth: final - contributed, series };
  });
  const now = paths[0];
  for (const path of paths) {
    path.costVsNow = now.final - path.final;
    path.catchUpMonthly = path.delay === 0 ? monthly : Math.round(monthly * (now.final / path.final));
  }
  return {
    inputs: { monthly, age, endAge },
    annualReturnPct: Math.round(annualReturn * 1000) / 10,
    paths,
    growthShareNow: now.final > 0 ? Math.round((now.growth / now.final) * 100) : 0
  };
}
