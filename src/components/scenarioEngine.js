import { clamp, formatCurrency, formatMonths, formatPercent, formatSignedCurrency } from "./formatters.js";

const INVEST_RETURN = 0.068;
const CASH_RETURN = 0.024;
const OPPORTUNITY_RETURN = 0.055;
const DEFAULT_HORIZON_YEARS = 5;

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

function parseAmount(prompt) {
  const matches = [
    ...prompt.matchAll(/(?:\$)\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?|(\d[\d,]*(?:\.\d+)?)\s*([kK])\b/g)
  ];
  if (!matches.length) return null;

  const raw = matches[0][1] || matches[0][3] || "0";
  const hasK = matches[0][2] || matches[0][4];
  const value = Number(raw.replace(/,/g, ""));
  return hasK ? value * 1000 : value;
}

function parseMonths(prompt) {
  const monthMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(month|months|mo)\b/i);
  if (monthMatch) return Math.round(Number(monthMatch[1]));

  const yearMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)\b/i);
  if (yearMatch) return Math.round(Number(yearMatch[1]) * 12);

  return null;
}

function titleCase(sentence) {
  return sentence
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function buildCarScenario(amount) {
  const oneTimeCost = amount || 20000;
  const monthlyExpenseDelta = Math.round(oneTimeCost * 0.013);
  return {
    id: "custom-car",
    type: "purchase",
    title: `Buy a ${formatCurrency(oneTimeCost)} car`,
    prompt: `What if I buy a ${formatCurrency(oneTimeCost)} car?`,
    oneTimeCost,
    monthlyExpenseDelta,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: Math.round(oneTimeCost * 0.45),
    confidenceBase: 75,
    assumptions: [
      `Assumes a cash purchase funded from liquid savings at ${formatCurrency(oneTimeCost)}.`,
      `Adds about ${formatCurrency(monthlyExpenseDelta)} per month for ownership costs.`,
      "Assumes the vehicle retains roughly 45% of value after five years."
    ]
  };
}

function buildHousingScenario(amount) {
  const monthlyExpenseDelta = amount || 650;
  const moveCost = Math.max(1800, Math.round(monthlyExpenseDelta * 3.25));
  return {
    id: "custom-housing",
    type: "housing",
    title: `Move into a place that costs ${formatCurrency(monthlyExpenseDelta)} more each month`,
    prompt: `What if I move to an apartment that costs ${formatCurrency(monthlyExpenseDelta)} more each month?`,
    oneTimeCost: moveCost,
    monthlyExpenseDelta,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 78,
    assumptions: [
      `Assumes rent rises by ${formatCurrency(monthlyExpenseDelta)} per month.`,
      `Includes about ${formatCurrency(moveCost)} in deposits, movers, and setup costs.`,
      "Assumes no roommate or income offset."
    ]
  };
}

function buildIncomeShockScenario(months) {
  const durationMonths = months || 3;
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
    assumptions: [
      "Assumes roughly 25% income replacement during the gap.",
      "Assumes essential spending is held flat instead of aggressively cut.",
      "Assumes brokerage investing pauses while income is disrupted."
    ]
  };
}

function buildInvestmentScenario(amount, months) {
  const monthlyInvestmentDelta = amount || 500;
  const durationMonths = months || 60;
  const years = durationMonths / 12;
  return {
    id: "custom-investment",
    type: "investment",
    title: `Invest ${formatCurrency(monthlyInvestmentDelta)} per month for ${years.toFixed(years % 1 ? 1 : 0)} years`,
    prompt: `What if I invest ${formatCurrency(monthlyInvestmentDelta)} per month for ${years.toFixed(years % 1 ? 1 : 0)} years?`,
    oneTimeCost: 0,
    monthlyInvestmentDelta,
    durationMonths,
    horizonYears: Math.max(DEFAULT_HORIZON_YEARS, years),
    residualValueAtHorizon: 0,
    confidenceBase: 86,
    assumptions: [
      `Assumes ${formatCurrency(monthlyInvestmentDelta)} is invested every month without interruption.`,
      "Uses a 6.8% annualized return assumption.",
      "Assumes the added contribution comes from current flex cash."
    ]
  };
}

function buildVacationScenario(amount) {
  const oneTimeCost = amount || 3000;
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
    assumptions: [
      `Assumes the trip is paid in cash at ${formatCurrency(oneTimeCost)}.`,
      "Assumes no offsetting cut to other discretionary spending.",
      "Assumes the main tradeoff is lost compounding on the cash outlay."
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

  if (runwayMonths < 6) {
    return `Preserve a six-month runway first. Reduce the spend, phase the decision, or wait until cash is at least ${formatCurrency(6 * 4760)}.`;
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
  const shortTermLiquidityDelta = -oneTimeCost + monthlyCashDelta * shortTermMonths;
  const scenarioMonthlyFreeCash = baseline.monthlyFreeCash + monthlyCashDelta;
  const scenarioLiquidAssets = Math.max(baseline.liquidAssets + shortTermLiquidityDelta, 0);
  const scenarioRunwayMonths = scenarioLiquidAssets / baseline.essentialBurn;

  const oneTimeDeltaAtHorizon = -futureValueLump(oneTimeCost, OPPORTUNITY_RETURN, horizonYears) + residualValueAtHorizon;
  const recurringNetDeltaAtHorizon = futureValueRecurring(
    monthlyIncomeDelta - monthlyExpenseDelta,
    OPPORTUNITY_RETURN,
    activeMonths
  );
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
    shortTermNarrative: buildShortTermNarrative(result),
    longTermNarrative: buildLongTermNarrative(result)
  };
}

export function createScenarioFromPrompt(prompt, catalog) {
  if (!prompt || !prompt.trim()) return null;

  const normalized = prompt.toLowerCase();
  const parsedAmount = parseAmount(prompt);
  const parsedMonths = parseMonths(prompt);

  if (normalized.includes("car") || normalized.includes("vehicle")) {
    return buildCarScenario(parsedAmount);
  }

  if (normalized.includes("apartment") || normalized.includes("rent") || normalized.includes("move")) {
    return buildHousingScenario(parsedAmount);
  }

  if (normalized.includes("lose my job") || normalized.includes("laid off") || normalized.includes("unemployed")) {
    return buildIncomeShockScenario(parsedMonths);
  }

  if (normalized.includes("invest")) {
    return buildInvestmentScenario(parsedAmount, parsedMonths);
  }

  if (normalized.includes("vacation") || normalized.includes("trip") || normalized.includes("travel")) {
    return buildVacationScenario(parsedAmount);
  }

  if (parsedAmount) {
    return {
      id: "generic-decision",
      type: "discretionary",
      title: titleCase(prompt),
      prompt,
      oneTimeCost: parsedAmount,
      durationMonths: 12,
      horizonYears: 5,
      residualValueAtHorizon: 0,
      confidenceBase: 72,
      assumptions: [
        `Assumes a one-time outlay of ${formatCurrency(parsedAmount)} funded from cash.`,
        "Assumes no financing or offsetting income change.",
        "Treat this as a directional estimate until the decision is more specific."
      ]
    };
  }

  const preset = catalog.find((item) => normalized.includes(item.type) || normalized.includes(item.id));
  return preset || null;
}

export function createScenarioFromPreset(preset) {
  return { ...preset };
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
  return `${scenarioResult.shortTermNarrative} ${scenarioResult.longTermNarrative} Risk is ${scenarioResult.risk.label.toLowerCase()} with ${scenarioResult.confidenceLabel.toLowerCase()}. Recommended next step: ${scenarioResult.nextStep}`;
}

export function buildFallbackChatReply(prompt) {
  return `I can model that, but I need a bit more structure. Try adding a dollar amount or timeframe, like “${prompt} for 12 months” or “${prompt} that costs $3,000.”`;
}

export function buildNarrativeBullets(result) {
  return [
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
