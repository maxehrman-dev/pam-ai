import { clamp, formatCurrency, formatMonths, formatPercent, formatSignedCurrency } from "./formatters.js";

const INVEST_RETURN = 0.068;
const CASH_RETURN = 0.024;
const OPPORTUNITY_RETURN = 0.055;
const DEFAULT_HORIZON_YEARS = 5;
const DEFAULT_ESSENTIAL_TARGET = 4760;

const INTENT_KEYWORDS = {
  purchase: ["car", "vehicle", "auto", "truck", "suv", "tesla", "lease", "finance", "buy a car"],
  housing: ["rent", "apartment", "lease", "move", "housing", "studio", "one-bedroom", "bedroom", "place"],
  incomeShock: ["lose my job", "job loss", "laid off", "layoff", "unemployed", "out of work", "without work"],
  investment: ["invest", "brokerage", "401k", "401(k)", "roth", "index fund", "save more", "put away", "contribute"],
  vacation: ["vacation", "trip", "travel", "honeymoon", "getaway", "holiday"],
  incomeUp: ["raise", "promotion", "earn more", "salary increase", "income increase", "bonus", "more income"],
  incomeDown: ["pay cut", "salary cut", "income drop", "earn less", "income falls", "salary drops", "cut my pay"]
};

function sumAmounts(entries, key) {
  return entries.reduce((total, entry) => total + Number(entry[key] || 0), 0);
}

function futureValueLump(value, annualRate, years) {
  return value * Math.pow(1 + annualRate, years);
}

function futureValueRecurring(payment, annualRate, months) {
  if (!payment) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return payment * months;
  return payment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
}

function normalizePrompt(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^\w$%./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amountFromMatch(raw, suffix = "") {
  const value = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  if (/m/i.test(suffix)) return value * 1000000;
  if (/k/i.test(suffix)) return value * 1000;
  return value;
}

function collectMoneyCandidates(prompt) {
  const candidates = [];
  const patterns = [
    /(?:\$|usd\s*)(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/gi,
    /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])\b/g,
    /(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|bucks|usd)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) {
      const raw = match[1];
      const suffix = match[2] || "";
      const value = amountFromMatch(raw, suffix);
      if (!value) continue;
      if (candidates.some((candidate) => Math.abs(candidate.value - value) < 0.01)) continue;
      candidates.push({ value, index: match.index || 0 });
    }
  }

  return candidates.sort((left, right) => left.index - right.index);
}

function parseRecurringAmount(prompt) {
  const recurringPatterns = [
    /(?:\$|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i,
    /(?:\$|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:monthly|each month|every month)\b/i
  ];

  for (const pattern of recurringPatterns) {
    const match = prompt.match(pattern);
    if (match) return amountFromMatch(match[1], match[2]);
  }

  return null;
}

function parsePercent(prompt) {
  const percentMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\b/i);
  return percentMatch ? Number(percentMatch[1]) / 100 : null;
}

function parseMonths(prompt) {
  if (/\bquarter\b|\bqtr\b/i.test(prompt)) return 3;
  if (/\bhalf[-\s]?year\b/i.test(prompt)) return 6;

  const monthMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(month|months|mo)\b/i);
  if (monthMatch) return Math.round(Number(monthMatch[1]));

  const yearMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)\b/i);
  if (yearMatch) return Math.round(Number(yearMatch[1]) * 12);

  return null;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function scoreMatches(text, keywords) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function titleCase(sentence) {
  return sentence
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function findCurrentRent(profile) {
  return profile?.monthly?.fixed?.find((entry) => /rent|housing|mortgage/i.test(entry.label))?.amount || 2450;
}

function inferIntent(normalized) {
  const scored = [
    { intent: "incomeShock", score: scoreMatches(normalized, INTENT_KEYWORDS.incomeShock) * 2 },
    { intent: "purchase", score: scoreMatches(normalized, INTENT_KEYWORDS.purchase) },
    { intent: "housing", score: scoreMatches(normalized, INTENT_KEYWORDS.housing) },
    { intent: "investment", score: scoreMatches(normalized, INTENT_KEYWORDS.investment) },
    { intent: "vacation", score: scoreMatches(normalized, INTENT_KEYWORDS.vacation) },
    { intent: "incomeChangePositive", score: scoreMatches(normalized, INTENT_KEYWORDS.incomeUp) },
    { intent: "incomeChangeNegative", score: scoreMatches(normalized, INTENT_KEYWORDS.incomeDown) }
  ];

  const best = scored.sort((left, right) => right.score - left.score)[0];
  return best && best.score > 0 ? best.intent : null;
}

function buildInterpretation(intentLabel, normalized, details = []) {
  const questions = [];
  if (normalized.includes("can i afford") || normalized.includes("can i swing")) questions.push("affordability framing");
  if (normalized.includes("should i") || normalized.includes("would it be smart")) questions.push("decision framing");
  if (normalized.includes("what happens if")) questions.push("what-if framing");
  const article = /^[aeiou]/i.test(intentLabel) ? "an" : "a";

  return {
    label: intentLabel,
    cues: [...questions, ...details].filter(Boolean),
    summary:
      details.length > 0
        ? `I treated this as ${article} ${intentLabel} scenario because the question points to ${details.join(", ")}.`
        : `I treated this as ${article} ${intentLabel} scenario based on the phrasing in the question.`
  };
}

function buildCarScenario(options = {}) {
  const purchaseAmount = options.purchaseAmount || 20000;
  const financed = Boolean(options.financed);
  const oneTimeCost = financed ? options.downPayment || Math.round(purchaseAmount * 0.12) : purchaseAmount;
  const monthlyExpenseDelta = options.monthlyExpenseDelta || Math.round(purchaseAmount * 0.013);

  return {
    id: "custom-car",
    type: "purchase",
    title: financed
      ? `Finance a ${formatCurrency(purchaseAmount)} car`
      : `Buy a ${formatCurrency(purchaseAmount)} car`,
    prompt: financed
      ? `What if I finance a ${formatCurrency(purchaseAmount)} car?`
      : `What if I buy a ${formatCurrency(purchaseAmount)} car?`,
    oneTimeCost,
    monthlyExpenseDelta,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: Math.round(purchaseAmount * 0.45),
    confidenceBase: financed ? 80 : 75,
    interpretation: buildInterpretation("vehicle purchase", options.normalized || "", [
      financed ? "car financing language" : "car purchase language",
      `a ${formatCurrency(purchaseAmount)} price point`
    ]),
    assumptions: financed
      ? [
          `Assumes about ${formatCurrency(oneTimeCost)} down and ${formatCurrency(monthlyExpenseDelta)} per month in payment plus carrying costs.`,
          "Includes insurance, maintenance, and parking in the monthly estimate.",
          "Assumes the vehicle retains roughly 45% of value after five years."
        ]
      : [
          `Assumes a cash purchase funded from liquid savings at ${formatCurrency(purchaseAmount)}.`,
          `Adds about ${formatCurrency(monthlyExpenseDelta)} per month for ownership costs.`,
          "Assumes the vehicle retains roughly 45% of value after five years."
        ]
  };
}

function buildHousingScenario(profile, options = {}) {
  const currentRent = findCurrentRent(profile);
  const targetRent = options.targetRent || null;
  const explicitDelta = options.monthlyExpenseDelta;
  const monthlyExpenseDelta =
    typeof explicitDelta === "number"
      ? explicitDelta
      : targetRent
        ? Math.round(targetRent - currentRent)
        : 650;
  const moveCost = Math.max(1800, Math.round(Math.abs(monthlyExpenseDelta) * 3.25));
  const directionLabel = monthlyExpenseDelta >= 0 ? "more" : "less";
  const title =
    targetRent && targetRent !== currentRent
      ? `Move to a ${formatCurrency(targetRent)} apartment`
      : `Move to a place that costs ${formatCurrency(Math.abs(monthlyExpenseDelta))} ${directionLabel} each month`;

  return {
    id: "custom-housing",
    type: "housing",
    title,
    prompt:
      targetRent && targetRent !== currentRent
        ? `What if I move to a ${formatCurrency(targetRent)} apartment?`
        : `What if I move to an apartment that costs ${formatCurrency(Math.abs(monthlyExpenseDelta))} ${directionLabel} each month?`,
    oneTimeCost: moveCost,
    monthlyExpenseDelta,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: targetRent ? 83 : 78,
    interpretation: buildInterpretation("housing", options.normalized || "", [
      targetRent ? "a target rent amount" : "rent or move language",
      monthlyExpenseDelta >= 0 ? "higher housing spend" : "lower housing spend"
    ]),
    assumptions: [
      `Assumes housing changes by ${formatSignedCurrency(monthlyExpenseDelta)} per month from the current ${formatCurrency(currentRent)} baseline.`,
      `Includes about ${formatCurrency(moveCost)} in deposits, movers, and setup costs.`,
      "Assumes no roommate, commute, or income offset unless stated otherwise."
    ]
  };
}

function buildIncomeShockScenario(options = {}) {
  const durationMonths = options.durationMonths || 3;
  return {
    id: "custom-income-shock",
    type: "incomeShock",
    title: `Lose my job for ${durationMonths} months`,
    prompt: `What if I lose my job for ${durationMonths} months?`,
    oneTimeCost: 0,
    monthlyIncomeDelta: -7350,
    monthlyInvestmentDelta: -700,
    durationMonths,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 67,
    interpretation: buildInterpretation("income shock", options.normalized || "", [
      "job loss language",
      `${durationMonths}-month duration`
    ]),
    assumptions: [
      "Assumes roughly 25% income replacement during the gap.",
      "Assumes essential spending is held flat instead of aggressively cut.",
      "Assumes brokerage investing pauses while income is disrupted."
    ]
  };
}

function buildInvestmentScenario(options = {}) {
  const durationMonths = options.durationMonths || 60;
  const monthlyInvestmentDelta = options.monthlyInvestmentDelta || 500;
  const years = durationMonths / 12;
  const directionLabel = monthlyInvestmentDelta >= 0 ? "Invest" : "Reduce investing by";
  const amountLabel = formatCurrency(Math.abs(monthlyInvestmentDelta));

  return {
    id: "custom-investment",
    type: "investment",
    title: `${directionLabel} ${amountLabel} per month for ${years.toFixed(years % 1 ? 1 : 0)} years`,
    prompt: `What if I invest ${amountLabel} per month for ${years.toFixed(years % 1 ? 1 : 0)} years?`,
    oneTimeCost: 0,
    monthlyInvestmentDelta,
    durationMonths,
    horizonYears: Math.max(DEFAULT_HORIZON_YEARS, years),
    residualValueAtHorizon: 0,
    confidenceBase: 86,
    interpretation: buildInterpretation("investment contribution", options.normalized || "", [
      "investing language",
      `${amountLabel} monthly cadence`
    ]),
    assumptions: [
      `Assumes ${amountLabel} is ${monthlyInvestmentDelta >= 0 ? "added to" : "removed from"} automated investing every month.`,
      "Uses a 6.8% annualized market return assumption.",
      "Assumes the contribution change comes from current flex cash instead of new debt."
    ]
  };
}

function buildVacationScenario(options = {}) {
  const oneTimeCost = options.oneTimeCost || 3000;
  return {
    id: "custom-vacation",
    type: "discretionary",
    title: `Take a ${formatCurrency(oneTimeCost)} vacation`,
    prompt: `What if I take a vacation that costs ${formatCurrency(oneTimeCost)}?`,
    oneTimeCost,
    durationMonths: 12,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 92,
    interpretation: buildInterpretation("travel spend", options.normalized || "", [
      "trip or vacation language",
      `a ${formatCurrency(oneTimeCost)} cash outlay`
    ]),
    assumptions: [
      `Assumes the trip is paid in cash at ${formatCurrency(oneTimeCost)}.`,
      "Assumes no offsetting cut to other discretionary spending.",
      "Assumes the main tradeoff is lost compounding on the cash outlay."
    ]
  };
}

function buildIncomeChangeScenario(profile, options = {}) {
  const baseline = profile ? getProfileMetrics(profile) : { monthlyIncome: 9800 };
  const durationMonths = options.durationMonths || 60;
  const direction = options.direction || "positive";
  const inferredAmount =
    options.monthlyIncomeDelta ||
    (options.percentChange ? Math.round(baseline.monthlyIncome * options.percentChange) : Math.round(baseline.monthlyIncome * 0.1));
  const monthlyIncomeDelta = direction === "negative" ? -Math.abs(inferredAmount) : Math.abs(inferredAmount);
  const label = monthlyIncomeDelta >= 0 ? "Increase income" : "Take a pay cut";

  return {
    id: "custom-income-change",
    type: "incomeChange",
    title: `${label} by ${formatCurrency(Math.abs(monthlyIncomeDelta))} per month`,
    prompt:
      monthlyIncomeDelta >= 0
        ? `What if my income increases by ${formatCurrency(Math.abs(monthlyIncomeDelta))} per month?`
        : `What if my income drops by ${formatCurrency(Math.abs(monthlyIncomeDelta))} per month?`,
    oneTimeCost: 0,
    monthlyIncomeDelta,
    durationMonths,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: options.percentChange ? 84 : 78,
    interpretation: buildInterpretation("income change", options.normalized || "", [
      monthlyIncomeDelta >= 0 ? "raise or promotion language" : "pay cut language",
      options.percentChange ? `${(options.percentChange * 100).toFixed(0)}% change` : `${formatCurrency(Math.abs(monthlyIncomeDelta))} per month`
    ]),
    assumptions: [
      `Assumes monthly take-home changes by ${formatSignedCurrency(monthlyIncomeDelta)} for ${durationMonths} months.`,
      "Assumes spending is unchanged unless you intentionally reallocate the extra or reduced cash flow.",
      "Assumes the change starts immediately and persists through the modeled period."
    ]
  };
}

function buildIncomeAllocationScenario(profile, options = {}) {
  const baseline = profile ? getProfileMetrics(profile) : { monthlyIncome: 9800 };
  const durationMonths = options.durationMonths || 60;
  const monthlyIncomeDelta =
    options.monthlyIncomeDelta ||
    (options.percentChange ? Math.round(baseline.monthlyIncome * options.percentChange) : Math.round(baseline.monthlyIncome * 0.1));
  const monthlyInvestmentDelta = options.monthlyInvestmentDelta || monthlyIncomeDelta;

  return {
    id: "custom-income-allocation",
    type: "incomeAllocation",
    title: `Get a raise and invest ${formatCurrency(Math.abs(monthlyInvestmentDelta))} per month`,
    prompt: `What if I get a raise and invest ${formatCurrency(Math.abs(monthlyInvestmentDelta))} per month?`,
    oneTimeCost: 0,
    monthlyIncomeDelta,
    monthlyInvestmentDelta,
    monthlyWealthDelta: 0,
    durationMonths,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: options.percentChange ? 86 : 82,
    interpretation: buildInterpretation("income allocation", options.normalized || "", [
      options.percentChange ? `${(options.percentChange * 100).toFixed(0)}% raise language` : "raise language",
      "invest-the-difference language"
    ]),
    assumptions: [
      `Assumes take-home income rises by ${formatCurrency(Math.abs(monthlyIncomeDelta))} per month.`,
      `Assumes the same amount is redirected straight into investing each month instead of lifestyle spend.`,
      "Assumes the raise starts immediately and the contribution is automated for the full modeled period."
    ]
  };
}

export function getProfileMetrics(profile) {
  const monthlyIncome = sumAmounts(profile.monthly.income, "amount");
  const fixedCosts = sumAmounts(profile.monthly.fixed, "amount");
  const variableCosts = sumAmounts(profile.monthly.variable, "amount");
  const contributions = sumAmounts(profile.monthly.contributions, "amount");
  const essentialBurn =
    sumAmounts(profile.monthly.fixed.filter((entry) => entry.essential), "amount") +
    sumAmounts(profile.monthly.variable.filter((entry) => entry.essential), "amount");
  const liquidAssets = sumAmounts(profile.assets.filter((asset) => asset.liquid), "value");
  const investableAssets = sumAmounts(profile.assets.filter((asset) => asset.bucket !== "cash"), "value");
  const totalAssets = sumAmounts(profile.assets, "value");
  const totalLiabilities = sumAmounts(profile.liabilities, "balance");
  const principalReduction = sumAmounts(profile.liabilities, "principalShare");
  const debtPayment = sumAmounts(profile.liabilities, "monthlyPayment");
  const monthlyFreeCash = monthlyIncome - fixedCosts - variableCosts - contributions;
  const investContribution = sumAmounts(
    profile.monthly.contributions.filter((entry) => entry.bucket === "invest"),
    "amount"
  );
  const cashContribution = sumAmounts(
    profile.monthly.contributions.filter((entry) => entry.bucket === "cash"),
    "amount"
  );
  const currentNetWorth = totalAssets - totalLiabilities;
  const runwayMonths = liquidAssets / essentialBurn;

  const projectionMonths = DEFAULT_HORIZON_YEARS * 12;
  const projectedLiquid =
    futureValueLump(liquidAssets, CASH_RETURN, DEFAULT_HORIZON_YEARS) +
    futureValueRecurring(cashContribution + Math.max(monthlyFreeCash, 0) * 0.35, CASH_RETURN, projectionMonths);
  const projectedInvestments =
    futureValueLump(investableAssets, INVEST_RETURN, DEFAULT_HORIZON_YEARS) +
    futureValueRecurring(investContribution + Math.max(monthlyFreeCash, 0) * 0.65, INVEST_RETURN, projectionMonths);
  const projectedLiabilities = profile.liabilities.reduce((total, liability) => {
    return total + Math.max(liability.balance - liability.principalShare * projectionMonths, 0);
  }, 0);
  const fiveYearProjectedNetWorth = projectedLiquid + projectedInvestments - projectedLiabilities;

  const bufferScore = clamp((runwayMonths / 12) * 100, 0, 100);
  const surplusScore = clamp((monthlyFreeCash / monthlyIncome) * 250, 0, 100);
  const leverageScore = clamp((1 - totalLiabilities / totalAssets) * 100, 0, 100);
  const investScore = clamp(((investContribution + cashContribution) / monthlyIncome) * 350, 0, 100);
  const healthScore = Math.round(bufferScore * 0.34 + surplusScore * 0.22 + leverageScore * 0.2 + investScore * 0.24);

  return {
    monthlyIncome,
    fixedCosts,
    variableCosts,
    contributions,
    essentialBurn,
    liquidAssets,
    investableAssets,
    totalAssets,
    totalLiabilities,
    principalReduction,
    debtPayment,
    monthlyFreeCash,
    investContribution,
    cashContribution,
    currentNetWorth,
    runwayMonths,
    fiveYearProjectedNetWorth,
    healthScore,
    leverageRatio: totalLiabilities / totalAssets,
    savingsRate: (investContribution + cashContribution) / monthlyIncome
  };
}

function getScenarioRisk(runwayMonths, monthlyFreeCash, fiveYearDelta) {
  if (runwayMonths < 4.5 || monthlyFreeCash < 500 || fiveYearDelta < -40000) {
    return {
      label: "High",
      detail: "This move materially compresses flexibility and creates a narrower recovery path."
    };
  }

  if (runwayMonths < 6.5 || monthlyFreeCash < 1000 || fiveYearDelta < -18000) {
    return {
      label: "Medium",
      detail: "The scenario is manageable, but it reduces optionality enough that the timing and assumptions matter."
    };
  }

  return {
    label: "Low",
    detail: "The baseline can likely absorb this choice without materially changing the long-term path."
  };
}

function getConfidenceSummary(score) {
  if (score >= 86) return "High confidence";
  if (score >= 74) return "Medium confidence";
  return "Directional confidence";
}

function buildNextStep(scenario, runwayMonths, monthlyFreeCash, fiveYearDelta) {
  if (scenario.type === "investment" && monthlyFreeCash > 900) {
    return "Automate the new contribution now and review in 90 days instead of waiting for a perfect market entry point.";
  }

  if (scenario.type === "incomeShock") {
    return "Build a job-gap playbook now: cut discretionary spend, define pause rules for investing, and keep at least six months of essentials in cash.";
  }

  if (scenario.type === "incomeChange" && scenario.monthlyIncomeDelta > 0) {
    return "Route part of the new income toward cash reserves first, then automate the remainder into investing so the upside compounds on purpose.";
  }

  if (scenario.type === "incomeChange" && scenario.monthlyIncomeDelta < 0) {
    return "Decide now which lower-priority expenses and contribution levels get trimmed first so a pay cut does not force reactive debt later.";
  }

  if (scenario.type === "incomeAllocation") {
    return "Lock the new contribution to the raise immediately so lifestyle creep does not absorb the upside before it compounds.";
  }

  if (runwayMonths < 6) {
    return `Preserve a six-month runway first. Reduce the spend, phase the decision, or wait until cash is at least ${formatCurrency(6 * DEFAULT_ESSENTIAL_TARGET)}.`;
  }

  if (fiveYearDelta < -20000) {
    return "Set a hard affordability cap before moving forward so the decision does not quietly erode long-term compounding.";
  }

  if (monthlyFreeCash < 1200) {
    return "Proceed only if you offset part of the new cost with a recurring cut elsewhere in the plan.";
  }

  return "The move looks workable. Lock the assumption set, then sanity-check the downside case before you commit.";
}

function buildShortTermNarrative(result) {
  return `${result.scenario.title} changes first-year liquidity by ${formatSignedCurrency(
    result.shortTermLiquidityDelta
  )} and moves monthly flex cash to ${formatCurrency(result.scenarioPath.monthlyFreeCash)}.`;
}

function buildLongTermNarrative(result) {
  const delta = result.longTermNetWorthDelta;
  const direction = delta >= 0 ? "ahead of" : "behind";
  return `On the current assumptions, your five-year net worth lands ${formatCurrency(
    Math.abs(delta)
  )} ${direction} the current path.`;
}

export function evaluateScenario(profile, scenario) {
  const baseline = getProfileMetrics(profile);
  const horizonYears = scenario.horizonYears || DEFAULT_HORIZON_YEARS;
  const horizonMonths = Math.round(horizonYears * 12);
  const activeMonths = Math.min(scenario.durationMonths || horizonMonths, horizonMonths);
  const shortTermMonths = Math.min(activeMonths, 12);
  const monthlyIncomeDelta = Number(scenario.monthlyIncomeDelta || 0);
  const monthlyExpenseDelta = Number(scenario.monthlyExpenseDelta || 0);
  const monthlyInvestmentDelta = Number(scenario.monthlyInvestmentDelta || 0);
  const oneTimeCost = Number(scenario.oneTimeCost || 0);
  const residualValueAtHorizon = Number(scenario.residualValueAtHorizon || 0);
  const monthlyCashDelta = monthlyIncomeDelta - monthlyExpenseDelta - monthlyInvestmentDelta;
  const monthlyWealthDelta =
    typeof scenario.monthlyWealthDelta === "number"
      ? scenario.monthlyWealthDelta
      : monthlyIncomeDelta - monthlyExpenseDelta;
  const shortTermLiquidityDelta = -oneTimeCost + monthlyCashDelta * shortTermMonths;
  const scenarioMonthlyFreeCash = baseline.monthlyFreeCash + monthlyCashDelta;
  const scenarioLiquidAssets = Math.max(baseline.liquidAssets + shortTermLiquidityDelta, 0);
  const scenarioRunwayMonths = scenarioLiquidAssets / baseline.essentialBurn;

  const oneTimeDeltaAtHorizon = -futureValueLump(oneTimeCost, OPPORTUNITY_RETURN, horizonYears) + residualValueAtHorizon;
  const recurringNetDeltaAtHorizon = futureValueRecurring(monthlyWealthDelta, OPPORTUNITY_RETURN, activeMonths);
  const investmentDeltaAtHorizon = futureValueRecurring(monthlyInvestmentDelta, INVEST_RETURN, activeMonths);
  const longTermNetWorthDelta = oneTimeDeltaAtHorizon + recurringNetDeltaAtHorizon + investmentDeltaAtHorizon;
  const scenarioProjectedNetWorth = baseline.fiveYearProjectedNetWorth + longTermNetWorthDelta;

  const risk = getScenarioRisk(scenarioRunwayMonths, scenarioMonthlyFreeCash, longTermNetWorthDelta);
  const confidenceScore = clamp(
    scenario.confidenceBase - (scenario.assumptions?.length || 0) * 1.5 + (scenario.prompt.includes("$") ? 3 : 0),
    58,
    94
  );
  const financialHealthAfter = clamp(
    baseline.healthScore + (scenarioMonthlyFreeCash - baseline.monthlyFreeCash) / 45 + longTermNetWorthDelta / 3000,
    40,
    96
  );

  return {
    scenario,
    baseline,
    currentPath: {
      monthlyFreeCash: baseline.monthlyFreeCash,
      runwayMonths: baseline.runwayMonths,
      projectedNetWorth: baseline.fiveYearProjectedNetWorth,
      healthScore: baseline.healthScore,
      liquidAssets: baseline.liquidAssets
    },
    scenarioPath: {
      monthlyFreeCash: scenarioMonthlyFreeCash,
      runwayMonths: scenarioRunwayMonths,
      projectedNetWorth: scenarioProjectedNetWorth,
      healthScore: Math.round(financialHealthAfter),
      liquidAssets: scenarioLiquidAssets
    },
    shortTermLiquidityDelta,
    longTermNetWorthDelta,
    risk,
    confidenceScore,
    confidenceLabel: getConfidenceSummary(confidenceScore),
    nextStep: buildNextStep(scenario, scenarioRunwayMonths, scenarioMonthlyFreeCash, longTermNetWorthDelta),
    shortTermNarrative: "",
    longTermNarrative: "",
    impactCards: [
      {
        label: "Short-term impact",
        value: formatSignedCurrency(shortTermLiquidityDelta),
        detail: "Change to first-year liquidity versus your current path."
      },
      {
        label: "Long-term impact",
        value: formatSignedCurrency(longTermNetWorthDelta),
        detail: "Estimated five-year net worth difference."
      },
      {
        label: "Risk level",
        value: risk.label,
        detail: risk.detail
      },
      {
        label: "Confidence",
        value: `${confidenceScore}/100`,
        detail: "Strength of the assumptions and clarity of the input."
      }
    ]
  };
}

export function finalizeScenarioResult(result) {
  return {
    ...result,
    interpretationNarrative:
      result.scenario.interpretation?.summary || `I mapped this question to a ${result.scenario.type} scenario.`,
    shortTermNarrative: buildShortTermNarrative(result),
    longTermNarrative: buildLongTermNarrative(result)
  };
}

export function createScenarioFromPrompt(prompt, catalog, profile) {
  if (!prompt || !prompt.trim()) return null;

  const normalized = normalizePrompt(prompt);
  const moneyCandidates = collectMoneyCandidates(prompt);
  const primaryAmount = moneyCandidates[0]?.value || null;
  const recurringAmount = parseRecurringAmount(prompt);
  const percentChange = parsePercent(prompt);
  const parsedMonths = parseMonths(prompt);
  const intent = inferIntent(normalized);
  const financed = hasAny(normalized, ["finance", "loan", "lease", "monthly payment"]);
  const currentRent = findCurrentRent(profile);
  const hasIncomeCue = hasAny(normalized, [...INTENT_KEYWORDS.incomeUp, ...INTENT_KEYWORDS.incomeDown]);
  const hasInvestCue = hasAny(normalized, INTENT_KEYWORDS.investment);

  if (hasIncomeCue && hasInvestCue && intent !== "incomeChangeNegative") {
    return buildIncomeAllocationScenario(profile, {
      normalized,
      percentChange,
      monthlyIncomeDelta: recurringAmount || primaryAmount || null,
      monthlyInvestmentDelta: recurringAmount || null,
      durationMonths: parsedMonths || 60
    });
  }

  if (intent === "purchase") {
    return buildCarScenario({
      normalized,
      purchaseAmount: primaryAmount || 20000,
      monthlyExpenseDelta: recurringAmount,
      financed
    });
  }

  if (intent === "housing") {
    const targetRent =
      primaryAmount && !normalized.includes("more") && !normalized.includes("increase") && primaryAmount > currentRent * 0.75
        ? primaryAmount
        : null;
    const monthlyExpenseDelta =
      recurringAmount ||
      (targetRent ? targetRent - currentRent : primaryAmount && normalized.includes("more") ? primaryAmount : null);

    return buildHousingScenario(profile, {
      normalized,
      targetRent,
      monthlyExpenseDelta
    });
  }

  if (intent === "incomeShock") {
    return buildIncomeShockScenario({
      normalized,
      durationMonths: parsedMonths || 3
    });
  }

  if (intent === "investment") {
    const monthlyInvestmentDelta =
      recurringAmount ||
      (parsedMonths && primaryAmount ? Math.round(primaryAmount / parsedMonths) : primaryAmount || 500);
    return buildInvestmentScenario({
      normalized,
      monthlyInvestmentDelta,
      durationMonths: parsedMonths || 60
    });
  }

  if (intent === "vacation") {
    return buildVacationScenario({
      normalized,
      oneTimeCost: primaryAmount || 3000
    });
  }

  if (intent === "incomeChangePositive" || intent === "incomeChangeNegative") {
    return buildIncomeChangeScenario(profile, {
      normalized,
      direction: intent === "incomeChangeNegative" ? "negative" : "positive",
      monthlyIncomeDelta: recurringAmount || primaryAmount || null,
      percentChange,
      durationMonths: parsedMonths || 60
    });
  }

  if (primaryAmount) {
    return {
      id: "generic-decision",
      type: "discretionary",
      title: titleCase(prompt),
      prompt,
      oneTimeCost: primaryAmount,
      durationMonths: 12,
      horizonYears: 5,
      residualValueAtHorizon: 0,
      confidenceBase: 72,
      interpretation: buildInterpretation("general cash outlay", normalized, [
        `a ${formatCurrency(primaryAmount)} decision amount`
      ]),
      assumptions: [
        `Assumes a one-time outlay of ${formatCurrency(primaryAmount)} funded from cash.`,
        "Assumes no financing or offsetting income change.",
        "Treat this as a directional estimate until the decision is more specific."
      ]
    };
  }

  const preset = catalog.find((item) => normalized.includes(item.type) || normalized.includes(item.id));
  return preset ? { ...preset } : null;
}

export function createScenarioFromPreset(preset) {
  return {
    ...preset,
    interpretation:
      preset.interpretation ||
      buildInterpretation("preset decision", normalizePrompt(preset.prompt || preset.title || ""), ["a saved scenario preset"])
  };
}

export function generateInsights(profile, scenarioResult) {
  const metrics = scenarioResult.baseline;
  const deltaRunway = scenarioResult.scenarioPath.runwayMonths - metrics.runwayMonths;
  const improvementSpend = 250;
  const recoveredFiveYear = futureValueRecurring(improvementSpend, OPPORTUNITY_RETURN, 60);

  return [
    {
      kind: "takeaway",
      title: "Your baseline is decision-ready",
      body: `You currently carry ${formatMonths(metrics.runwayMonths)} of essential runway and ${formatCurrency(
        metrics.monthlyFreeCash
      )} of monthly flex cash. That is enough cushion to model tradeoffs instead of reacting to them.`
    },
    {
      kind: "warning",
      title: `${scenarioResult.scenario.title} changes your margin for error`,
      body: `The scenario shifts runway by ${deltaRunway >= 0 ? "+" : ""}${deltaRunway.toFixed(
        1
      )} months and moves financial health to ${scenarioResult.scenarioPath.healthScore}/100. ${scenarioResult.risk.detail}`
    },
    {
      kind: "opportunity",
      title: "One lever meaningfully improves the outcome",
      body: `If you free up ${formatCurrency(improvementSpend)} per month elsewhere, you recover roughly ${formatCurrency(
        recoveredFiveYear
      )} of five-year net worth without touching your core lifestyle.`
    },
    {
      kind: "guidance",
      title: "Confidence depends on the assumption set",
      body: `${scenarioResult.confidenceLabel} means the estimate is useful for planning, but you should lock in price, timing, and duration details before treating it like a commitment decision.`
    }
  ];
}

export function buildChatReply(scenarioResult) {
  return [
    `Interpretation: ${scenarioResult.interpretationNarrative}`,
    `Short-term: ${scenarioResult.shortTermNarrative}`,
    `Long-term: ${scenarioResult.longTermNarrative}`,
    `Tradeoff to watch: ${scenarioResult.risk.detail}`,
    `Confidence: ${scenarioResult.confidenceLabel} (${scenarioResult.confidenceScore}/100).`,
    `Recommended next step: ${scenarioResult.nextStep}`
  ].join("\n\n");
}

export function buildFallbackChatReply(prompt) {
  return [
    "I can model that, but I need a clearer financial shape before I should pretend to know the answer.",
    'Try questions like "Can I afford a $20,000 car right now?", "What happens if my rent jumps by $400?", "How bad is a three month layoff?", or "Would investing $600 a month be smart?"',
    `You asked: "${prompt.trim()}". Add a dollar amount, monthly change, percent, or timeframe and I can turn it into a scenario.`
  ].join("\n\n");
}

export function buildNarrativeBullets(result) {
  return [
    `Interpretation: ${result.interpretationNarrative}`,
    `Short-term: ${result.shortTermNarrative}`,
    `Long-term: ${result.longTermNarrative}`,
    `Assumptions: ${result.scenario.assumptions.join(" ")}`
  ];
}

export function summarizeHealth(profile) {
  const metrics = getProfileMetrics(profile);
  return [
    { label: "Net worth", value: formatCurrency(metrics.currentNetWorth) },
    { label: "Liquid assets", value: formatCurrency(metrics.liquidAssets) },
    { label: "Monthly flex cash", value: formatCurrency(metrics.monthlyFreeCash) },
    { label: "Savings rate", value: formatPercent(metrics.savingsRate, 0) }
  ];
}
