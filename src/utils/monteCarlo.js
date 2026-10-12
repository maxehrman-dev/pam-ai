// Seeded Monte Carlo for market-exposed money. The seed is derived from the
// inputs, so the same question always produces the same range. Results stay
// testable, cacheable, and safe for the AI integrity check. Educational
// estimate only: historical-style volatility, not a forecast.

import { clamp } from "./formatters.js";

export const MARKET_ASSUMPTIONS = Object.freeze({
  annualReturn: 0.068,
  annualVolatility: 0.15,
  runs: 1000
});

function hashSeed(parts) {
  const text = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNormal(rand) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const radius = Math.sqrt(-2 * Math.log(u1));
    spare = radius * Math.sin(2 * Math.PI * u2);
    return radius * Math.cos(2 * Math.PI * u2);
  };
}

function percentile(sorted, q) {
  return sorted[Math.floor(q * (sorted.length - 1))];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Monthly log-normal returns whose mean growth matches annualReturn; the
// median path lands below the fixed-rate line, which is the honest part.
export function simulateMarketRange({
  startBalance = 0,
  monthlyContribution = 0,
  months = 120,
  goalAmount = null,
  annualReturn = MARKET_ASSUMPTIONS.annualReturn,
  annualVolatility = MARKET_ASSUMPTIONS.annualVolatility,
  runs = MARKET_ASSUMPTIONS.runs,
  seedKey = null,
  includeSeries = false
} = {}) {
  const start = Math.max(safeNumber(startBalance), 0);
  const contribution = Math.max(safeNumber(monthlyContribution), 0);
  const horizon = Math.round(clamp(safeNumber(months, 120), 1, 540));
  const runCount = Math.round(clamp(safeNumber(runs, 1000), 100, 5000));
  const goal = goalAmount !== null && safeNumber(goalAmount) > 0 ? safeNumber(goalAmount) : null;

  const monthlySigma = annualVolatility / Math.sqrt(12);
  const monthlyMu = Math.log(1 + annualReturn) / 12 - (monthlySigma * monthlySigma) / 2;
  // seedKey pins the random stream so callers can compare variants (e.g. tax
  // treatments) against identical market paths.
  const seed = seedKey !== null
    ? hashSeed([seedKey, runCount])
    : hashSeed([start, contribution, horizon, goal, annualReturn, annualVolatility, runCount]);
  const normal = createNormal(mulberry32(seed));

  // Yearly checkpoints (plus the final month) feed the range chart.
  const checkpoints = [];
  if (includeSeries) {
    for (let month = 12; month < horizon; month += 12) checkpoints.push(month);
    checkpoints.push(horizon);
  }
  const checkpointValues = checkpoints.map(() => new Float64Array(runCount));

  const finals = new Array(runCount);
  let goalHits = 0;
  for (let run = 0; run < runCount; run += 1) {
    let balance = start;
    let checkpointIndex = 0;
    for (let month = 0; month < horizon; month += 1) {
      balance = balance * Math.exp(monthlyMu + monthlySigma * normal()) + contribution;
      if (checkpointIndex < checkpoints.length && month + 1 === checkpoints[checkpointIndex]) {
        checkpointValues[checkpointIndex][run] = balance;
        checkpointIndex += 1;
      }
    }
    finals[run] = balance;
    if (goal !== null && balance >= goal) goalHits += 1;
  }
  finals.sort((left, right) => left - right);

  const series = includeSeries
    ? [{ month: 0, low: Math.round(start), typical: Math.round(start), high: Math.round(start) }].concat(
        checkpoints.map((month, index) => {
          const sorted = Array.from(checkpointValues[index]).sort((left, right) => left - right);
          return {
            month,
            low: Math.round(percentile(sorted, 0.1)),
            typical: Math.round(percentile(sorted, 0.5)),
            high: Math.round(percentile(sorted, 0.9))
          };
        })
      )
    : null;

  const monthlyFixedRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let fixedRateBalance = start;
  for (let month = 0; month < horizon; month += 1) {
    fixedRateBalance = fixedRateBalance * (1 + monthlyFixedRate) + contribution;
  }

  const totalContributed = start + contribution * horizon;
  const belowContributed = finals.filter((value) => value < totalContributed).length;

  return {
    runs: runCount,
    months: horizon,
    startBalance: Math.round(start),
    monthlyContribution: Math.round(contribution),
    totalContributed: Math.round(totalContributed),
    low: Math.round(percentile(finals, 0.1)),
    typical: Math.round(percentile(finals, 0.5)),
    high: Math.round(percentile(finals, 0.9)),
    fixedRate: Math.round(fixedRateBalance),
    goalAmount: goal === null ? null : Math.round(goal),
    goalProbabilityPct: goal === null ? null : Math.round((goalHits / runCount) * 100),
    belowContributedPct: Math.round((belowContributed / runCount) * 100),
    annualReturnPct: Math.round(annualReturn * 1000) / 10,
    annualVolatilityPct: Math.round(annualVolatility * 1000) / 10,
    ...(series ? { series } : {})
  };
}
