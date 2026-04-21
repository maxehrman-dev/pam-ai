import { clamp, formatCurrency, formatMonths, formatPercent, formatSignedCurrency } from "./formatters.js";

const DEFAULT_HORIZON_MONTHS = 60;
const CASH_RETURN = 0.024;
const INVEST_RETURN = 0.068;
const OPPORTUNITY_RETURN = 0.055;
const PRIORITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

const INTENT_KEYWORDS = {
  jobLoss: ["lose my job", "laid off", "layoff", "fired", "job loss", "unemployed", "out of work"],
  legal: ["sued", "lawsuit", "legal", "attorney", "court", "settlement"],
  car: ["car", "vehicle", "truck", "suv", "auto", "tesla", "lease", "finance a car"],
  move: ["move apartments", "move", "apartment", "lease", "new place", "one-bedroom", "studio"],
  rentIncrease: ["rent increase", "rent goes up", "increase rent", "rent jumps"],
  invest: ["invest", "brokerage", "401k", "401(k)", "roth", "index fund", "monthly investing"],
  emergency: ["emergency", "repair", "medical", "travel", "vacation", "trip", "expense", "bill"],
  incomeReduction: ["reduce income", "pay cut", "income drops", "salary cut", "earn less", "income down"]
};

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function sumAmounts(entries, key) {
  return entries.reduce((total, entry) => total + Number(entry[key] || 0), 0);
}

function futureValueLump(value, annualRate, years) {
  if (!value) return 0;
  return value * Math.pow(1 + annualRate, years);
}

function futureValueRecurring(payment, annualRate, months) {
  if (!payment || !months) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return payment * months;
  return payment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
}

function normalizePrompt(prompt) {
  return String(prompt || "")
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
    for (const match of String(prompt || "").matchAll(pattern)) {
      const value = amountFromMatch(match[1], match[2] || "");
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
    const match = String(prompt || "").match(pattern);
    if (match) return amountFromMatch(match[1], match[2]);
  }

  return null;
}

function parsePercent(prompt) {
  const percentMatch = String(prompt || "").match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\b/i);
  return percentMatch ? Number(percentMatch[1]) / 100 : null;
}

function parseMonths(prompt) {
  const text = String(prompt || "");
  if (/\bquarter\b|\bqtr\b/i.test(text)) return 3;
  if (/\bhalf[-\s]?year\b/i.test(text)) return 6;

  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*(month|months|mo)\b/i);
  if (monthMatch) return Math.round(Number(monthMatch[1]));

  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)\b/i);
  if (yearMatch) return Math.round(Number(yearMatch[1]) * 12);

  return null;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatMonthDelta(value) {
  if (!Number.isFinite(value)) return "Stable";
  return value > 999 ? `${Math.round(value)}+ mo` : formatMonths(value);
}

function addMonthsLabel(monthsFromNow) {
  if (!Number.isFinite(monthsFromNow)) return "Not within modeled window";

  const date = new Date();
  date.setMonth(date.getMonth() + Math.max(0, Math.round(monthsFromNow)));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric"
  }).format(date);
}

function findStarter(catalog, id) {
  return catalog.find((item) => item.id === id);
}

function getCurrentRent(profile) {
  return profile?.monthly?.fixed?.find((entry) => /rent|housing|mortgage/i.test(entry.label))?.amount || 2450;
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
  const debtPayment = sumAmounts(profile.liabilities, "monthlyPayment");
  const currentNetWorth = totalAssets - totalLiabilities;
  const monthlyFreeCash = monthlyIncome - fixedCosts - variableCosts - contributions;
  const runwayMonths = liquidAssets / essentialBurn;
  const investContribution = sumAmounts(
    profile.monthly.contributions.filter((entry) => entry.bucket === "invest"),
    "amount"
  );
  const cashContribution = sumAmounts(
    profile.monthly.contributions.filter((entry) => entry.bucket === "cash"),
    "amount"
  );

  const projectedLiquid =
    futureValueLump(liquidAssets, CASH_RETURN, DEFAULT_HORIZON_MONTHS / 12) +
    futureValueRecurring(cashContribution + Math.max(monthlyFreeCash, 0) * 0.35, CASH_RETURN, DEFAULT_HORIZON_MONTHS);
  const projectedInvestments =
    futureValueLump(investableAssets, INVEST_RETURN, DEFAULT_HORIZON_MONTHS / 12) +
    futureValueRecurring(investContribution + Math.max(monthlyFreeCash, 0) * 0.65, INVEST_RETURN, DEFAULT_HORIZON_MONTHS);
  const projectedLiabilities = profile.liabilities.reduce((total, liability) => {
    return total + Math.max(liability.balance - liability.principalShare * DEFAULT_HORIZON_MONTHS, 0);
  }, 0);
  const projectedNetWorth = projectedLiquid + projectedInvestments - projectedLiabilities;

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
    debtPayment,
    currentNetWorth,
    monthlyFreeCash,
    runwayMonths,
    projectedNetWorth,
    savingsRate: contributions / monthlyIncome,
    leverageRatio: totalLiabilities / totalAssets,
    healthScore
  };
}

function detectScenarioId(prompt, catalog) {
  const normalized = normalizePrompt(prompt);
  const hasJobLoss = hasAny(normalized, INTENT_KEYWORDS.jobLoss);
  const hasLegal = hasAny(normalized, INTENT_KEYWORDS.legal);

  if (hasJobLoss && hasLegal) return "compound-shock";
  if (hasAny(normalized, INTENT_KEYWORDS.rentIncrease)) return "increase-rent";
  if (hasAny(normalized, INTENT_KEYWORDS.jobLoss)) return "job-loss";
  if (hasAny(normalized, INTENT_KEYWORDS.car)) return "buy-car";
  if (hasAny(normalized, INTENT_KEYWORDS.move)) return "move-apartments";
  if (hasAny(normalized, INTENT_KEYWORDS.invest)) return "start-investing";
  if (hasAny(normalized, INTENT_KEYWORDS.incomeReduction)) return "reduce-income";
  if (hasAny(normalized, INTENT_KEYWORDS.emergency)) return "emergency-expense";

  const hasMoney = collectMoneyCandidates(prompt).length > 0;
  if (hasMoney) return "emergency-expense";

  return findStarter(catalog, "job-loss") ? "job-loss" : catalog[0]?.id;
}

function buildCompoundStarter(metrics) {
  return {
    id: "compound-shock",
    label: "Compound shock",
    title: "Income loss plus legal costs",
    type: "compound",
    prompt: "What if I get fired and sued?",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: -Math.round(metrics.monthlyIncome * 0.75),
      monthlyInvestingDelta: -450,
      durationMonths: 3,
      moveCost: 0,
      legalCost: 8000,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0,
      focusMode: "both"
    }
  };
}

function buildDraftFromStarter(starter, profile, prompt) {
  const draft = {
    id: starter.id,
    starterId: starter.id,
    type: starter.type,
    title: starter.title,
    prompt: prompt || starter.prompt,
    ...cloneValue(starter.defaults || {})
  };

  if (draft.type === "move" && !draft.targetRent) {
    draft.targetRent = getCurrentRent(profile) + Number(draft.monthlyExpenseDelta || 0);
  }

  return draft;
}

function deriveCarValues(draft) {
  const purchaseAmount = Math.max(Number(draft.purchaseAmount || 20000), 1000);
  const upfrontCost = Math.max(Number(draft.upfrontCost || Math.round(purchaseAmount * 0.2)), 0);
  const monthlyExpenseDelta = Math.max(Number(draft.monthlyExpenseDelta || Math.round(purchaseAmount * 0.021)), 0);

  draft.purchaseAmount = purchaseAmount;
  draft.upfrontCost = upfrontCost;
  draft.oneTimeCost = upfrontCost;
  draft.monthlyExpenseDelta = monthlyExpenseDelta;
  draft.residualValueAtHorizon = Math.round(purchaseAmount * 0.43);
}

function deriveMoveValues(draft, profile) {
  const currentRent = getCurrentRent(profile);
  const delta = Number(draft.monthlyExpenseDelta || 0);
  draft.monthlyExpenseDelta = delta;
  draft.targetRent = currentRent + delta;
  draft.moveCost = Math.max(Number(draft.moveCost || Math.round(Math.abs(delta) * 4.1)), 1800);
  draft.oneTimeCost = draft.moveCost;
}

function deriveJobLossValues(draft) {
  draft.monthlyIncomeDelta = Math.min(Number(draft.monthlyIncomeDelta || -7200), 0);
  draft.monthlyInvestingDelta = Number.isFinite(Number(draft.monthlyInvestingDelta))
    ? Number(draft.monthlyInvestingDelta)
    : -450;
  draft.legalCost = Math.max(Number(draft.legalCost || 0), 0);
  draft.oneTimeCost = draft.legalCost;

  if (draft.focusMode === "legalOnly") {
    draft.monthlyIncomeDelta = 0;
    draft.monthlyInvestingDelta = 0;
  }

  if (draft.focusMode === "incomeOnly") {
    draft.legalCost = 0;
    draft.oneTimeCost = 0;
  }
}

function deriveInvestmentValues(draft) {
  draft.monthlyInvestingDelta = Math.max(Number(draft.monthlyInvestingDelta || 500), 0);
  draft.monthlyIncomeDelta = Number(draft.monthlyIncomeDelta || 0);
  draft.monthlyExpenseDelta = Number(draft.monthlyExpenseDelta || 0);
}

function deriveIncomeReductionValues(draft) {
  draft.monthlyIncomeDelta = Math.min(Number(draft.monthlyIncomeDelta || -1200), 0);
  draft.monthlyInvestingDelta = Number(draft.monthlyInvestingDelta || 0);
}

function deriveEmergencyValues(draft) {
  draft.oneTimeCost = Math.max(Number(draft.oneTimeCost || 3500), 0);
  draft.monthlyExpenseDelta = Number(draft.monthlyExpenseDelta || 0);
  draft.monthlyIncomeDelta = Number(draft.monthlyIncomeDelta || 0);
  draft.monthlyInvestingDelta = Number(draft.monthlyInvestingDelta || 0);
}

function deriveRentValues(draft) {
  draft.monthlyExpenseDelta = Math.max(Number(draft.monthlyExpenseDelta || 400), 0);
}

function deriveCustomValues(draft) {
  draft.oneTimeCost = Math.max(Number(draft.oneTimeCost || 0), 0);
  draft.monthlyExpenseDelta = Number(draft.monthlyExpenseDelta || 0);
  draft.monthlyIncomeDelta = Number(draft.monthlyIncomeDelta || 0);
  draft.monthlyInvestingDelta = Number(draft.monthlyInvestingDelta || 0);
}

function reconcileDraft(draft, profile) {
  const nextDraft = cloneValue(draft);
  nextDraft.durationMonths = clamp(Math.round(Number(nextDraft.durationMonths || 12)), 1, 240);

  switch (nextDraft.type) {
    case "car":
      deriveCarValues(nextDraft);
      break;
    case "move":
      deriveMoveValues(nextDraft, profile);
      break;
    case "jobLoss":
    case "compound":
      deriveJobLossValues(nextDraft);
      break;
    case "invest":
      deriveInvestmentValues(nextDraft);
      break;
    case "rentIncrease":
      deriveRentValues(nextDraft);
      break;
    case "incomeReduction":
      deriveIncomeReductionValues(nextDraft);
      break;
    case "emergency":
      deriveEmergencyValues(nextDraft);
      break;
    default:
      deriveCustomValues(nextDraft);
      break;
  }

  return nextDraft;
}

function hydrateDraftFromPrompt(draft, prompt, profile) {
  const normalized = normalizePrompt(prompt);
  const values = collectMoneyCandidates(prompt);
  const firstAmount = values[0]?.value || null;
  const recurringAmount = parseRecurringAmount(prompt);
  const parsedMonths = parseMonths(prompt);
  const percent = parsePercent(prompt);

  if (parsedMonths) draft.durationMonths = parsedMonths;

  switch (draft.type) {
    case "car":
      if (firstAmount) draft.purchaseAmount = firstAmount;
      if (recurringAmount) draft.monthlyExpenseDelta = recurringAmount;
      break;
    case "move":
      if (recurringAmount) {
        draft.monthlyExpenseDelta = recurringAmount;
      } else if (firstAmount && firstAmount > getCurrentRent(profile) * 0.75) {
        draft.targetRent = firstAmount;
        draft.monthlyExpenseDelta = firstAmount - getCurrentRent(profile);
      } else if (firstAmount) {
        draft.monthlyExpenseDelta = firstAmount;
      }
      break;
    case "rentIncrease":
      if (recurringAmount || firstAmount) draft.monthlyExpenseDelta = recurringAmount || firstAmount;
      break;
    case "invest":
      if (recurringAmount || firstAmount) draft.monthlyInvestingDelta = recurringAmount || firstAmount;
      break;
    case "incomeReduction":
      if (percent) {
        draft.monthlyIncomeDelta = -Math.round(getProfileMetrics(profile).monthlyIncome * percent);
      } else if (recurringAmount || firstAmount) {
        draft.monthlyIncomeDelta = -Math.abs(recurringAmount || firstAmount);
      }
      break;
    case "emergency":
      if (firstAmount) draft.oneTimeCost = firstAmount;
      break;
    case "jobLoss":
      if (parsedMonths) draft.durationMonths = parsedMonths;
      break;
    case "compound":
      if (firstAmount) draft.legalCost = firstAmount;
      if (normalized.includes("legal only")) draft.focusMode = "legalOnly";
      if (normalized.includes("income only")) draft.focusMode = "incomeOnly";
      break;
    default:
      if (firstAmount) draft.oneTimeCost = firstAmount;
      if (recurringAmount) draft.monthlyExpenseDelta = recurringAmount;
      break;
  }
}

function buildFollowUp(draft, starter, prompt, profile) {
  const moneyCandidates = collectMoneyCandidates(prompt);
  const recurringAmount = parseRecurringAmount(prompt);
  const parsedMonths = parseMonths(prompt);
  const normalized = normalizePrompt(prompt);

  if (draft.type === "compound") {
    return {
      prompt: "Got it. Let's break that down. What should I model first?",
      choices: [
        {
          label: "Lost income",
          patch: { focusMode: "incomeOnly", legalCost: 0, oneTimeCost: 0 }
        },
        {
          label: "Legal costs",
          patch: { focusMode: "legalOnly", monthlyIncomeDelta: 0, monthlyInvestingDelta: 0 }
        },
        {
          label: "Both",
          patch: { focusMode: "both" }
        }
      ]
    };
  }

  if (starter?.followUp) {
    if (draft.type === "jobLoss" && parsedMonths) return null;
    if (draft.type === "car" && moneyCandidates.length > 0) return null;
    if ((draft.type === "move" || draft.type === "rentIncrease") && (recurringAmount || moneyCandidates.length > 0)) return null;
    if (draft.type === "invest" && (recurringAmount || moneyCandidates.length > 0)) return null;
    if (draft.type === "emergency" && moneyCandidates.length > 0) return null;
    if (draft.type === "incomeReduction" && (recurringAmount || parsePercent(prompt) || moneyCandidates.length > 0)) return null;

    return {
      prompt: starter.followUp.prompt,
      choices: starter.followUp.choices.map((choice) => ({
        label: choice.label,
        patch: { [starter.followUp.field]: choice.value }
      }))
    };
  }

  if (!normalizePrompt(prompt)) {
    return {
      prompt: "Pick a starting shape and I'll model it right away.",
      choices: [
        { label: "One-time expense", patch: { type: "emergency", oneTimeCost: 3000 } },
        { label: "Monthly cost change", patch: { type: "rentIncrease", monthlyExpenseDelta: 400 } },
        { label: "Income shock", patch: { type: "jobLoss", durationMonths: 3 } }
      ]
    };
  }

  if (!moneyCandidates.length && !parsedMonths && draft.type === "emergency") {
    return {
      prompt: "Should I treat this like a one-time expense or a recurring monthly change?",
      choices: [
        { label: "One-time cost", patch: { type: "emergency", oneTimeCost: 3000 } },
        { label: "Monthly change", patch: { type: "rentIncrease", monthlyExpenseDelta: 400 } }
      ]
    };
  }

  if (normalized && !hasAny(normalized, Object.values(INTENT_KEYWORDS).flat())) {
    return {
      prompt: "I made a best guess. Which shape is closest?",
      choices: [
        { label: "Cash hit", patch: { type: "emergency", oneTimeCost: moneyCandidates[0]?.value || 3000 } },
        { label: "Monthly expense", patch: { type: "rentIncrease", monthlyExpenseDelta: 400 } },
        { label: "Income drop", patch: { type: "incomeReduction", monthlyIncomeDelta: -1200 } }
      ]
    };
  }

  return null;
}

function buildScenarioTitle(draft) {
  switch (draft.type) {
    case "car":
      return `Buy a ${formatCurrency(draft.purchaseAmount)} car`;
    case "move":
      return `Move to a ${formatCurrency(draft.targetRent || 0)} apartment`;
    case "jobLoss":
      return `Lose your income for ${draft.durationMonths} months`;
    case "compound":
      if (draft.focusMode === "incomeOnly") return `Lose income for ${draft.durationMonths} months`;
      if (draft.focusMode === "legalOnly") return `Absorb ${formatCurrency(draft.legalCost)} in legal costs`;
      return `Handle job loss and ${formatCurrency(draft.legalCost)} in legal costs`;
    case "invest":
      return `Invest ${formatCurrency(draft.monthlyInvestingDelta)} per month`;
    case "rentIncrease":
      return `Handle a ${formatCurrency(draft.monthlyExpenseDelta)} rent increase`;
    case "incomeReduction":
      return `Reduce income by ${formatCurrency(Math.abs(draft.monthlyIncomeDelta))} per month`;
    case "emergency":
      return `Absorb a ${formatCurrency(draft.oneTimeCost)} cash shock`;
    default:
      return draft.prompt ? titleCase(draft.prompt) : "Custom decision";
  }
}

function buildScenarioAssumptions(draft, metrics) {
  const assumptions = [];
  const baselineRent = Number(draft.targetRent || 0) - Number(draft.monthlyExpenseDelta || 0);

  if (draft.oneTimeCost) {
    assumptions.push(`Assumes ${formatCurrency(draft.oneTimeCost)} leaves liquid savings up front.`);
  }

  if (draft.type === "car") {
    assumptions.push(
      `Uses ${formatCurrency(draft.monthlyExpenseDelta)} per month for payment, insurance, and maintenance.`
    );
    assumptions.push(`Assumes the car holds about ${formatCurrency(draft.residualValueAtHorizon)} of value in five years.`);
  }

  if (draft.type === "move") {
    assumptions.push(`Compares against the current ${formatCurrency(Math.max(baselineRent, 0))} housing baseline.`);
  }

  if (draft.type === "jobLoss" || draft.type === "compound") {
    assumptions.push(`Models ${draft.durationMonths} months of lower income and pauses ${formatCurrency(Math.abs(draft.monthlyInvestingDelta))} of investing.`);
  }

  if (draft.type === "invest") {
    assumptions.push(`Adds ${formatCurrency(draft.monthlyInvestingDelta)} to investing every month for ${draft.durationMonths} months.`);
  }

  if (draft.type === "incomeReduction") {
    assumptions.push(`Models a paycheck drop of ${formatCurrency(Math.abs(draft.monthlyIncomeDelta))} per month.`);
  }

  assumptions.push(`Baseline monthly flex cash starts at ${formatCurrency(metrics.monthlyFreeCash)}.`);
  assumptions.push("Results are directional, not tax or legal advice.");

  return assumptions;
}

function formatGoalDelay(goal) {
  if (!goal) return "On track";
  if (!Number.isFinite(goal.deltaMonths)) return goal.status === "Off track" ? "Off track" : "At risk";
  if (goal.deltaMonths <= 0) return "On track";
  return formatMonthDelta(goal.deltaMonths);
}

function getFieldSchema(draft, profile) {
  const field = (key, label, value, step = 100, min = 0, helper = "") => ({
    key,
    label,
    value: Number(value || 0),
    step,
    min,
    helper
  });

  switch (draft.type) {
    case "car":
      return [
        field("purchaseAmount", "Car price", draft.purchaseAmount, 500, 0, "Sale price or financed amount."),
        field("upfrontCost", "Upfront cash", draft.upfrontCost, 100, 0, "Down payment or cash paid today."),
        field("monthlyExpenseDelta", "Monthly ownership cost", draft.monthlyExpenseDelta, 25, 0, "Payment, insurance, fuel, parking.")
      ];
    case "move":
      return [
        field("monthlyExpenseDelta", "Monthly housing change", draft.monthlyExpenseDelta, 50, -1500, "Difference from your current rent."),
        field("moveCost", "Move cost", draft.moveCost, 100, 0, "Deposits, movers, setup costs.")
      ];
    case "jobLoss":
      return [
        field("durationMonths", "Income-loss duration (months)", draft.durationMonths, 1, 1, "How long income stays lower."),
        field("monthlyIncomeDelta", "Monthly income change", draft.monthlyIncomeDelta, 100, -20000, "Enter as a negative number."),
        field("monthlyInvestingDelta", "Monthly investing change", draft.monthlyInvestingDelta, 50, -5000, "Negative pauses investing, positive adds more.")
      ];
    case "compound":
      return [
        field("durationMonths", "Income-loss duration (months)", draft.durationMonths, 1, 1, "How long lost income lasts."),
        field("monthlyIncomeDelta", "Monthly income change", draft.monthlyIncomeDelta, 100, -20000, "Enter as a negative number."),
        field("legalCost", "Legal costs", draft.legalCost, 250, 0, "Retainer, settlement, or court costs."),
        field("monthlyInvestingDelta", "Monthly investing change", draft.monthlyInvestingDelta, 50, -5000, "Use negative values to model pausing investments.")
      ];
    case "invest":
      return [
        field("monthlyInvestingDelta", "Monthly investing", draft.monthlyInvestingDelta, 50, 0, "New recurring investment amount."),
        field("durationMonths", "Contribution period (months)", draft.durationMonths, 1, 1, "How long to keep it running.")
      ];
    case "rentIncrease":
      return [
        field("monthlyExpenseDelta", "Monthly rent increase", draft.monthlyExpenseDelta, 25, 0, "Pure monthly housing increase."),
        field("durationMonths", "Modeled months", draft.durationMonths, 1, 1, "How long the higher rent stays in the plan.")
      ];
    case "incomeReduction":
      return [
        field("monthlyIncomeDelta", "Monthly income change", draft.monthlyIncomeDelta, 100, -20000, "Enter as a negative number."),
        field("durationMonths", "Modeled months", draft.durationMonths, 1, 1, "How long income stays lower.")
      ];
    case "emergency":
      return [field("oneTimeCost", "One-time cash hit", draft.oneTimeCost, 100, 0, "Emergency bill or discretionary spend.")];
    default:
      return [
        field("oneTimeCost", "One-time cost", draft.oneTimeCost, 100, 0),
        field("monthlyExpenseDelta", "Monthly expense change", draft.monthlyExpenseDelta, 50, -10000),
        field("monthlyIncomeDelta", "Monthly income change", draft.monthlyIncomeDelta, 50, -10000),
        field("monthlyInvestingDelta", "Monthly investing change", draft.monthlyInvestingDelta, 50, -10000),
        field("durationMonths", "Modeled months", draft.durationMonths, 1, 1)
      ];
  }
}

function computeGoalContributionShift(goals, draft) {
  const nextGoals = goals.map((goal) => ({
    ...goal,
    scenarioCurrentAmount: goal.currentAmount,
    scenarioMonthlyContribution: goal.monthlyContribution
  }));
  const upfrontShock = Number(draft.oneTimeCost || 0) + Number(draft.legalCost || 0) + Number(draft.moveCost || 0) - Number(draft.upfrontCost || 0);
  const oneTimeShock = draft.type === "car" ? Number(draft.upfrontCost || 0) : Number(draft.oneTimeCost || 0);
  const totalShock = Math.max(oneTimeShock + upfrontShock, 0);
  const cashGoals = nextGoals.filter((goal) => goal.fundingSource === "cash");
  const shockPool = cashGoals.length ? cashGoals : nextGoals;
  const weightedCurrent = shockPool.reduce((total, goal) => {
    return total + Math.max(goal.currentAmount, 1000) * PRIORITY_WEIGHTS[goal.priority || "medium"];
  }, 0);

  if (totalShock > 0 && weightedCurrent > 0) {
    shockPool.forEach((goal) => {
      const weight = Math.max(goal.currentAmount, 1000) * PRIORITY_WEIGHTS[goal.priority || "medium"];
      const share = totalShock * (weight / weightedCurrent);
      goal.scenarioCurrentAmount = Math.max(goal.currentAmount - share, 0);
    });
  }

  let remainingDeficit = Math.max(-(Number(draft.monthlyIncomeDelta || 0) - Number(draft.monthlyExpenseDelta || 0)), 0);
  if (remainingDeficit > 0) {
    ["low", "medium", "high"].forEach((priority) => {
      nextGoals
        .filter((goal) => goal.priority === priority)
        .forEach((goal) => {
          if (remainingDeficit <= 0) return;
          const cut = Math.min(goal.scenarioMonthlyContribution, remainingDeficit);
          goal.scenarioMonthlyContribution -= cut;
          remainingDeficit -= cut;
        });
    });
  }

  const surplus = Math.max(Number(draft.monthlyIncomeDelta || 0) - Number(draft.monthlyExpenseDelta || 0), 0) * 0.6;
  if (surplus > 0) {
    const totalWeight = nextGoals.reduce((total, goal) => total + PRIORITY_WEIGHTS[goal.priority || "medium"], 0);
    nextGoals.forEach((goal) => {
      goal.scenarioMonthlyContribution += surplus * (PRIORITY_WEIGHTS[goal.priority || "medium"] / totalWeight);
    });
  }

  const investShift = Number(draft.monthlyInvestingDelta || 0);
  if (investShift !== 0) {
    const investGoals = nextGoals.filter((goal) => goal.fundingSource === "invest");
    const targetGoals = investGoals.length ? investGoals : nextGoals;
    const totalWeight = targetGoals.reduce((total, goal) => total + PRIORITY_WEIGHTS[goal.priority || "medium"], 0);

    if (investShift > 0) {
      targetGoals.forEach((goal) => {
        goal.scenarioMonthlyContribution += investShift * (PRIORITY_WEIGHTS[goal.priority || "medium"] / totalWeight);
      });
    } else {
      let remainingCut = Math.abs(investShift);
      ["low", "medium", "high"].forEach((priority) => {
        targetGoals
          .filter((goal) => goal.priority === priority)
          .forEach((goal) => {
            if (remainingCut <= 0) return;
            const cut = Math.min(goal.scenarioMonthlyContribution, remainingCut);
            goal.scenarioMonthlyContribution -= cut;
            remainingCut -= cut;
          });
      });
    }
  }

  nextGoals.forEach((goal) => {
    goal.scenarioMonthlyContribution = Math.max(goal.scenarioMonthlyContribution, 0);
  });

  return nextGoals;
}

function calculateMonthsToGoal(goal, currentAmount, monthlyContribution) {
  if (currentAmount >= goal.targetAmount) return 0;
  if (monthlyContribution <= 0 && !(goal.annualReturn > 0)) return Number.POSITIVE_INFINITY;

  let balance = currentAmount;
  const monthlyRate = Number(goal.annualReturn || 0) / 12;

  for (let month = 1; month <= 360; month += 1) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= goal.targetAmount) return month;
  }

  return Number.POSITIVE_INFINITY;
}

function describeGoalStatus(goal, monthsToGoal) {
  const target = Number(goal.targetTimelineMonths || 0);
  if (!Number.isFinite(monthsToGoal)) return "Off track";
  if (!target) return "In progress";
  if (monthsToGoal <= target) return "On track";
  if (monthsToGoal <= target * 1.3) return "Delayed";
  return "At risk";
}

function evaluateGoals(goals, draft) {
  const scenarioGoals = computeGoalContributionShift(goals, draft);

  const outcomes = scenarioGoals.map((goal) => {
    const baselineMonths = calculateMonthsToGoal(goal, goal.currentAmount, goal.monthlyContribution);
    const scenarioMonths = calculateMonthsToGoal(goal, goal.scenarioCurrentAmount, goal.scenarioMonthlyContribution);
    const deltaMonths =
      Number.isFinite(baselineMonths) && Number.isFinite(scenarioMonths)
        ? scenarioMonths - baselineMonths
        : Number.POSITIVE_INFINITY;
    const contributionDelta = goal.scenarioMonthlyContribution - goal.monthlyContribution;
    const currentDelta = goal.scenarioCurrentAmount - goal.currentAmount;

    return {
      ...goal,
      baselineMonths,
      baselineDateLabel: addMonthsLabel(baselineMonths),
      scenarioMonths,
      scenarioDateLabel: addMonthsLabel(scenarioMonths),
      deltaMonths,
      status: describeGoalStatus(goal, scenarioMonths),
      scenarioCurrentAmount: goal.scenarioCurrentAmount,
      scenarioMonthlyContribution: goal.scenarioMonthlyContribution,
      contributionDelta,
      currentDelta
    };
  });

  const sortedByImpact = [...outcomes].sort((left, right) => {
    const leftImpact = Number.isFinite(left.deltaMonths) ? left.deltaMonths : 9999;
    const rightImpact = Number.isFinite(right.deltaMonths) ? right.deltaMonths : 9999;
    return rightImpact - leftImpact;
  });

  return {
    goals: outcomes,
    mostImpactedGoal: sortedByImpact[0]
  };
}

function getSavingsRunoutMonths(liquidAssets, scenarioMonthlyFreeCash) {
  if (scenarioMonthlyFreeCash >= 0) return Number.POSITIVE_INFINITY;
  return liquidAssets / Math.abs(scenarioMonthlyFreeCash);
}

function getRiskLabel(runoutMonths, scenarioMonthlyFreeCash, mostImpactedGoal, scenarioRunwayMonths) {
  const goalDelay = Number.isFinite(mostImpactedGoal?.deltaMonths) ? mostImpactedGoal.deltaMonths : 18;

  if (runoutMonths < 6 || scenarioMonthlyFreeCash < 0 || scenarioRunwayMonths < 5 || goalDelay > 12) {
    return {
      label: "High",
      detail: "This move materially compresses flexibility and makes at least one important goal meaningfully harder to reach."
    };
  }

  if (runoutMonths < 12 || scenarioRunwayMonths < 7 || goalDelay > 4) {
    return {
      label: "Medium",
      detail: "The decision is survivable, but timing and tradeoffs matter because your margin for error gets thinner."
    };
  }

  return {
    label: "Low",
    detail: "The baseline can likely absorb this decision without heavily disrupting cash stability or long-term goals."
  };
}

function getConfidence(draft, followUp, prompt) {
  let score = 84;
  if (!collectMoneyCandidates(prompt).length) score -= 6;
  if (!parseMonths(prompt) && draft.type !== "emergency") score -= 4;
  if (followUp) score -= 6;
  if (draft.type === "compound") score -= 4;
  score = clamp(score, 62, 94);

  return {
    score,
    label: score >= 86 ? "High confidence" : score >= 76 ? "Medium confidence" : "Directional confidence"
  };
}

function buildAhaMoment(goalsSummary, scenarioRunoutMonths, scenario, currentPath) {
  if (Number.isFinite(scenarioRunoutMonths) && scenarioRunoutMonths < 18) {
    return `You would run out of flexible cash in about ${formatMonthDelta(scenarioRunoutMonths)} if this path stayed unchanged.`;
  }

  if (goalsSummary?.mostImpactedGoal && Number.isFinite(goalsSummary.mostImpactedGoal.deltaMonths) && goalsSummary.mostImpactedGoal.deltaMonths > 0) {
    return `This decision delays your goal of ${goalsSummary.mostImpactedGoal.title.toLowerCase()} by ${formatMonthDelta(
      goalsSummary.mostImpactedGoal.deltaMonths
    )}.`;
  }

  return `Your monthly buffer moves from ${formatCurrency(currentPath.monthlyFreeCash)} to ${formatCurrency(
    scenario.monthlyFreeCash
  )}, which gives you more room to keep goals funded.`;
}

function buildRecommendedNextStep(risk, mostImpactedGoal, scenarioMonthlyFreeCash, scenarioRunwayMonths) {
  if (risk.label === "High" && Number.isFinite(mostImpactedGoal?.deltaMonths)) {
    return `Protect the next 90 days first. Either phase the decision, reduce the upfront cash hit, or preserve the contribution feeding ${mostImpactedGoal.title.toLowerCase()}.`;
  }

  if (scenarioMonthlyFreeCash < 600) {
    return "Proceed only if you pair this move with a recurring offset elsewhere. A tighter monthly buffer is the main weakness here.";
  }

  if (scenarioRunwayMonths < 7) {
    return "Keep building cash first. A larger liquid cushion will make this decision far less fragile.";
  }

  return "The move looks workable. Lock the numbers, then stress-test one downside assumption before committing.";
}

export function evaluateScenario(profile, goals, draft, prompt = draft.prompt || "") {
  const metrics = getProfileMetrics(profile);
  const normalizedDraft = reconcileDraft(draft, profile);
  const durationMonths = normalizedDraft.durationMonths || 12;
  const years = DEFAULT_HORIZON_MONTHS / 12;

  const oneTimeCost =
    normalizedDraft.type === "compound"
      ? Number(normalizedDraft.legalCost || 0)
      : normalizedDraft.type === "move"
        ? Number(normalizedDraft.moveCost || 0)
        : Number(normalizedDraft.oneTimeCost || 0);

  const monthlyIncomeDelta = Number(normalizedDraft.monthlyIncomeDelta || 0);
  const monthlyExpenseDelta = Number(normalizedDraft.monthlyExpenseDelta || 0);
  const monthlyInvestingDelta = Number(normalizedDraft.monthlyInvestingDelta || 0);
  const scenarioMonthlyFreeCash = metrics.monthlyFreeCash + monthlyIncomeDelta - monthlyExpenseDelta - monthlyInvestingDelta;
  const yearOneLiquidityDelta = -oneTimeCost + (monthlyIncomeDelta - monthlyExpenseDelta - monthlyInvestingDelta) * Math.min(12, durationMonths);
  const scenarioLiquidAssets = Math.max(metrics.liquidAssets + yearOneLiquidityDelta, 0);
  const scenarioRunwayMonths = scenarioLiquidAssets / metrics.essentialBurn;
  const runoutMonths = getSavingsRunoutMonths(Math.max(metrics.liquidAssets - oneTimeCost, 0), scenarioMonthlyFreeCash);

  const recurringDeltaAtHorizon = futureValueRecurring(monthlyIncomeDelta - monthlyExpenseDelta, OPPORTUNITY_RETURN, durationMonths);
  const investmentDeltaAtHorizon = futureValueRecurring(monthlyInvestingDelta, INVEST_RETURN, durationMonths);
  const oneTimeDeltaAtHorizon =
    -futureValueLump(oneTimeCost, OPPORTUNITY_RETURN, years) + Number(normalizedDraft.residualValueAtHorizon || 0);
  const longTermNetWorthDelta = oneTimeDeltaAtHorizon + recurringDeltaAtHorizon + investmentDeltaAtHorizon;
  const scenarioProjectedNetWorth = metrics.projectedNetWorth + longTermNetWorthDelta;

  const goalsSummary = evaluateGoals(goals, normalizedDraft);
  const risk = getRiskLabel(runoutMonths, scenarioMonthlyFreeCash, goalsSummary.mostImpactedGoal, scenarioRunwayMonths);
  const confidence = getConfidence(normalizedDraft, null, prompt);
  const healthScore = Math.round(
    clamp(metrics.healthScore + (scenarioMonthlyFreeCash - metrics.monthlyFreeCash) / 40 + longTermNetWorthDelta / 4500, 34, 97)
  );

  const currentPath = {
    monthlyFreeCash: metrics.monthlyFreeCash,
    runwayMonths: metrics.runwayMonths,
    projectedNetWorth: metrics.projectedNetWorth,
    healthScore: metrics.healthScore,
    liquidAssets: metrics.liquidAssets
  };

  const scenarioPath = {
    monthlyFreeCash: scenarioMonthlyFreeCash,
    runwayMonths: scenarioRunwayMonths,
    projectedNetWorth: scenarioProjectedNetWorth,
    healthScore,
    liquidAssets: scenarioLiquidAssets
  };

  return {
    draft: normalizedDraft,
    scenario: {
      ...normalizedDraft,
      title: buildScenarioTitle(normalizedDraft),
      assumptions: buildScenarioAssumptions(normalizedDraft, metrics)
    },
    currentPath,
    scenarioPath,
    shortTermLiquidityDelta: yearOneLiquidityDelta,
    longTermNetWorthDelta,
    monthlyCashFlowImpact: scenarioMonthlyFreeCash - metrics.monthlyFreeCash,
    savingsRunoutMonths: runoutMonths,
    risk,
    confidence,
    goalsSummary,
    ahaMoment: buildAhaMoment(goalsSummary, runoutMonths, scenarioPath, currentPath),
    nextStep: buildRecommendedNextStep(risk, goalsSummary.mostImpactedGoal, scenarioMonthlyFreeCash, scenarioRunwayMonths),
    impactCards: [
      {
        label: "Monthly cash flow",
        value: formatSignedCurrency(scenarioMonthlyFreeCash - metrics.monthlyFreeCash),
        detail: `${formatCurrency(metrics.monthlyFreeCash)} -> ${formatCurrency(scenarioMonthlyFreeCash)}`
      },
      {
        label: "Savings run-out",
        value: Number.isFinite(runoutMonths) ? formatMonthDelta(runoutMonths) : "Stable",
        detail: Number.isFinite(runoutMonths)
          ? "How long flexible cash lasts if nothing else changes."
          : "Current cash stays above zero under the modeled assumptions."
      },
      {
        label: "Goal timeline",
        value: formatGoalDelay(goalsSummary.mostImpactedGoal),
        detail: goalsSummary.mostImpactedGoal
          ? goalsSummary.mostImpactedGoal.title
          : "No major goal delay detected."
      },
      {
        label: "Risk level",
        value: risk.label,
        detail: risk.detail
      }
    ]
  };
}

function buildAssistantMessage(draft, result, followUp) {
  if (draft.type === "compound") {
    return {
      headline: "I can model that. I started with lost income plus legal costs.",
      body: followUp
        ? "You do not need a perfect prompt here. I modeled the combined shock with default assumptions and left one question to tighten next."
        : "I modeled both the income loss and the legal hit so you can see the tradeoff immediately."
    };
  }

  return {
    headline: `I can model that. I started with ${result.scenario.title.toLowerCase()}.`,
    body: followUp
      ? "I filled in the missing structure with defaults so you still get a usable answer now, then added one follow-up to sharpen it."
      : "The numbers below show the immediate cash impact, the goal tradeoff, and the longer-term path."
  };
}

export function buildDecisionSession({ prompt, starterId, draft, profile, goals, catalog }) {
  const metrics = getProfileMetrics(profile);
  const starter =
    starterId === "compound-shock"
      ? buildCompoundStarter(metrics)
      : starterId
        ? findStarter(catalog, starterId)
        : null;

  let sessionDraft = draft
    ? cloneValue(draft)
    : buildDraftFromStarter(starter || findStarter(catalog, detectScenarioId(prompt, catalog)) || buildCompoundStarter(metrics), profile, prompt);

  if (prompt) {
    hydrateDraftFromPrompt(sessionDraft, prompt, profile);
    sessionDraft.prompt = prompt;
  }

  sessionDraft = reconcileDraft(sessionDraft, profile);
  const followUp = buildFollowUp(sessionDraft, starter, prompt, profile);
  const result = evaluateScenario(profile, goals, sessionDraft, prompt);
  const confidence = getConfidence(sessionDraft, followUp, prompt);

  return {
    prompt,
    starterId: sessionDraft.starterId,
    draft: sessionDraft,
    followUp,
    result: {
      ...result,
      confidence
    },
    assistant: buildAssistantMessage(sessionDraft, result, followUp),
    editableFields: getFieldSchema(sessionDraft, profile),
    interpretation: {
      label: sessionDraft.type,
      summary:
        sessionDraft.type === "compound"
          ? "PAM detected a combined shock and modeled both pieces together before asking which one to tighten first."
          : `PAM treated this as a ${sessionDraft.type} scenario and translated it into cash flow, timeline, and goal effects.`
    }
  };
}

export function buildStarterSession(starterId, profile, goals, catalog) {
  return buildDecisionSession({
    prompt: findStarter(catalog, starterId)?.prompt || "",
    starterId,
    profile,
    goals,
    catalog
  });
}

export function buildDraftSession(draft, profile, goals, catalog) {
  return buildDecisionSession({
    prompt: draft.prompt || "",
    draft,
    profile,
    goals,
    catalog
  });
}

export function createLandingExamples(profile, goals, catalog) {
  return catalog.slice(0, 3).map((starter) => {
    const session = buildStarterSession(starter.id, profile, goals, catalog);
    const mostImpactedGoal = session.result.goalsSummary.mostImpactedGoal;

    return {
      id: starter.id,
      title: session.result.scenario.title,
      prompt: starter.prompt,
      highlight: session.result.ahaMoment,
      monthlyBufferBefore: session.result.currentPath.monthlyFreeCash,
      monthlyBufferAfter: session.result.scenarioPath.monthlyFreeCash,
      goalTitle: mostImpactedGoal?.title || "No major goal delay",
      goalDelayMonths: mostImpactedGoal?.deltaMonths || 0,
      risk: session.result.risk.label
    };
  });
}

export function generateInsights(profile, goals, session) {
  const result = session.result;
  const metrics = getProfileMetrics(profile);
  const mostImpactedGoal = result.goalsSummary.mostImpactedGoal;
  const opportunityAmount = 250;
  const recoveryValue = futureValueRecurring(opportunityAmount, OPPORTUNITY_RETURN, 60);

  return [
    {
      kind: "Takeaway",
      title: "The baseline gives you options",
      body: `You are starting from ${formatCurrency(metrics.monthlyFreeCash)} of monthly flex cash and ${formatMonthDelta(metrics.runwayMonths)} of essential runway. That is enough structure to test tradeoffs instead of guessing.`
    },
    {
      kind: "Warning",
      title: mostImpactedGoal
        ? `${mostImpactedGoal.title} absorbs the biggest hit`
        : "Cash stability is the main thing to watch",
      body: mostImpactedGoal
        ? `On this path, ${mostImpactedGoal.title.toLowerCase()} shifts by ${formatMonthDelta(
            mostImpactedGoal.deltaMonths
          )} and its monthly funding changes by ${formatSignedCurrency(mostImpactedGoal.contributionDelta)}.`
        : "No single goal breaks, but the decision still narrows your cash margin."
    },
    {
      kind: "Opportunity",
      title: `Recovering ${formatCurrency(opportunityAmount)} a month changes the picture`,
      body: `If you free up ${formatCurrency(opportunityAmount)} elsewhere, you recover about ${formatCurrency(
        recoveryValue
      )} of five-year value without needing a bigger raise or a perfect market call.`
    },
    {
      kind: "Guidance",
      title: "Use the scenario to set a threshold",
      body: `${result.nextStep} The goal is not just to answer “can I?” but to define the line where the decision still feels safe.`
    }
  ];
}
