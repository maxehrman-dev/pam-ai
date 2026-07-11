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
  paycheckSplit: [
    "paycheck split",
    "split my paycheck",
    "split each paycheck",
    "split my pay",
    "divide my paycheck",
    "allocate my paycheck",
    "direct deposit split",
    "budget my paycheck",
    "where should my money go",
    "where should each paycheck go",
    "how should i divide my money",
    "how much should i save each month",
    "am i saving enough"
  ],
  jobLoss: ["lose my job", "laid off", "layoff", "fired", "job loss", "unemployed", "out of work"],
  legal: ["sued", "lawsuit", "legal", "attorney", "court", "settlement"],
  car: ["car", "vehicle", "truck", "suv", "auto", "tesla", "lease", "finance a car"],
  move: ["move apartments", "move", "apartment", "lease", "new place", "one-bedroom", "studio"],
  rentIncrease: ["rent increase", "rent goes up", "increase rent", "rent jumps"],
  invest: ["invest", "brokerage", "401k", "401(k)", "roth", "index fund", "monthly investing"],
  emergency: ["emergency", "repair", "medical", "travel", "vacation", "trip", "expense", "bill"],
  incomeReduction: ["reduce income", "pay cut", "income drops", "salary cut", "earn less", "income down"]
};

const INTENT_TO_STARTER = {
  paycheckSplit: "paycheck-split",
  jobLoss: "job-loss",
  car: "buy-car",
  move: "move-apartments",
  rentIncrease: "increase-rent",
  invest: "start-investing",
  emergency: "emergency-expense",
  incomeReduction: "reduce-income"
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
  // "\b" after "%" can never match (both sides are non-word chars), so the
  // boundary lives inside the group and only guards the word form.
  const percentMatch = String(prompt || "").match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b)/i);
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
  return keywords.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(text);
  });
}

function getIntentFlags(prompt) {
  const normalized = normalizePrompt(prompt);

  return {
    normalized,
    hasPaycheckSplit: hasAny(normalized, INTENT_KEYWORDS.paycheckSplit),
    hasJobLoss: hasAny(normalized, INTENT_KEYWORDS.jobLoss),
    hasLegal: hasAny(normalized, INTENT_KEYWORDS.legal),
    hasCar: hasAny(normalized, INTENT_KEYWORDS.car),
    hasMove: hasAny(normalized, INTENT_KEYWORDS.move),
    hasRentIncrease: hasAny(normalized, INTENT_KEYWORDS.rentIncrease),
    hasInvest: hasAny(normalized, INTENT_KEYWORDS.invest),
    hasEmergency: hasAny(normalized, INTENT_KEYWORDS.emergency),
    hasIncomeReduction: hasAny(normalized, INTENT_KEYWORDS.incomeReduction)
  };
}

function listDetectedIntents(flags) {
  return Object.entries(INTENT_TO_STARTER)
    .filter(([key]) => {
      if (key === "paycheckSplit") return flags.hasPaycheckSplit;
      if (key === "rentIncrease") return flags.hasRentIncrease;
      if (key === "incomeReduction") return flags.hasIncomeReduction;
      if (key === "jobLoss") return flags.hasJobLoss;
      if (key === "car") return flags.hasCar;
      if (key === "move") return flags.hasMove;
      if (key === "invest") return flags.hasInvest;
      if (key === "emergency") return flags.hasEmergency;
      return false;
    })
    .map(([key]) => key);
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
  const flags = getIntentFlags(prompt);
  const intents = listDetectedIntents(flags);

  if (flags.hasPaycheckSplit) return "paycheck-split";
  if (flags.hasJobLoss && flags.hasLegal) return "compound-shock";
  if (flags.hasRentIncrease) return "increase-rent";
  if (flags.hasJobLoss) return "job-loss";
  if (flags.hasCar) return "buy-car";
  if (flags.hasMove) return "move-apartments";
  if (flags.hasInvest) return "start-investing";
  if (flags.hasIncomeReduction) return "reduce-income";
  if (flags.hasEmergency) return "emergency-expense";

  const hasMoney = collectMoneyCandidates(prompt).length > 0;
  if (intents.length > 1) return INTENT_TO_STARTER[intents[0]] || "job-loss";
  if (hasMoney) return "emergency-expense";

  return "custom-decision";
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

function buildCustomStarter() {
  return {
    id: "custom-decision",
    label: "Custom decision",
    title: "Model a custom financial decision",
    type: "custom",
    prompt: "What should I model?",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 12,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0,
      customFocus: "unknown",
      customDirection: "negative"
    }
  };
}

// ─── Paycheck split (advice-only allocation plan, never money movement) ─────
// A legible priority waterfall, not a clever formula: essentials + minimum debt
// first, a guilt-free floor so the plan is followable, then buffer -> high-APR
// debt -> investing. Every step is an auditable rule with editable assumptions.

const PAY_FREQUENCY_META = {
  weekly: { label: "weekly", noun: "weekly paycheck", perMonth: 52 / 12 },
  biweekly: { label: "every two weeks", noun: "biweekly paycheck", perMonth: 26 / 12 },
  semimonthly: { label: "twice a month", noun: "semimonthly paycheck", perMonth: 2 },
  monthly: { label: "monthly", noun: "monthly paycheck", perMonth: 1 },
  irregular: { label: "monthly", noun: "monthly income (irregular pay)", perMonth: 1 }
};

const SPLIT_DEFAULTS = {
  bufferTargetMonths: 3,
  guiltFreePct: 10,
  highAprThreshold: 7
};

function buildPaycheckSplitStarter(profile) {
  return {
    id: "paycheck-split",
    label: "Paycheck split",
    title: "Split each paycheck with intention",
    type: "paycheckSplit",
    prompt: "How should I split my paycheck?",
    defaults: {
      payFrequency: profile?.user?.payFrequency || "",
      bufferTargetMonths: SPLIT_DEFAULTS.bufferTargetMonths,
      guiltFreePct: SPLIT_DEFAULTS.guiltFreePct,
      highAprThreshold: SPLIT_DEFAULTS.highAprThreshold,
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 12
    }
  };
}

function derivePaycheckSplitValues(draft) {
  const numberOr = (value, fallback) => {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  draft.payFrequency = PAY_FREQUENCY_META[draft.payFrequency] ? draft.payFrequency : draft.payFrequency ? "biweekly" : "";
  draft.bufferTargetMonths = clamp(Math.round(numberOr(draft.bufferTargetMonths, SPLIT_DEFAULTS.bufferTargetMonths)), 1, 12);
  draft.guiltFreePct = clamp(numberOr(draft.guiltFreePct, SPLIT_DEFAULTS.guiltFreePct), 0, 40);
  draft.highAprThreshold = clamp(numberOr(draft.highAprThreshold, SPLIT_DEFAULTS.highAprThreshold), 0, 36);
  draft.oneTimeCost = 0;
  draft.monthlyExpenseDelta = 0;
  draft.monthlyIncomeDelta = 0;
}

export function computePaycheckSplit(profile, rawDraft = {}) {
  const draft = cloneValue({ ...SPLIT_DEFAULTS, ...rawDraft });
  derivePaycheckSplitValues(draft);
  const metrics = getProfileMetrics(profile);
  const income = Math.max(Math.round(metrics.monthlyIncome), 0);
  const frequency = PAY_FREQUENCY_META[draft.payFrequency] || PAY_FREQUENCY_META.biweekly;
  const warnings = [];

  // Essentials + minimum debt payments. Some profiles already carry a debt row
  // inside essential fixed costs — only add liability minimums when they don't.
  const debtInEssentials = (profile.monthly?.fixed || []).some(
    (entry) => entry.essential && /debt|loan|student|credit/i.test(entry.label)
  );
  const debtMinimums = debtInEssentials ? 0 : Math.round(metrics.debtPayment);
  const essentials = Math.round(metrics.essentialBurn) + debtMinimums;

  // Guilt-free floor: a plan with $0 of fun money is a plan nobody follows.
  let guiltFree = Math.round((income * draft.guiltFreePct) / 100);
  let flexible = income - essentials - guiltFree;
  if (flexible < 0) {
    guiltFree = Math.max(income - essentials, 0);
    flexible = 0;
    if (income > 0 && essentials >= income) {
      warnings.push("Essentials and minimum payments use your whole paycheck. The split can only improve once income rises or a fixed cost drops.");
    } else if (income > 0) {
      warnings.push("Guilt-free spending was reduced below the target floor so essentials stay covered.");
    }
  }
  if (income <= 0) {
    warnings.push("No monthly income detected yet. Connect accounts or add income so the split uses real numbers.");
  }

  // Buffer: fill toward the target before anything discretionary. While the
  // buffer is short, half of every flexible dollar goes to cash — 80% when
  // runway is under one month.
  const bufferTargetAmount = Math.round(essentials * draft.bufferTargetMonths);
  const liquid = Math.round(metrics.liquidAssets);
  const bufferGap = Math.max(bufferTargetAmount - liquid, 0);
  const bufferShare = metrics.runwayMonths < 1 ? 0.8 : 0.5;
  let bufferContribution = bufferGap > 0 ? Math.round(flexible * bufferShare) : 0;
  bufferContribution = Math.min(bufferContribution, flexible);
  const bufferMonthsToTarget = bufferGap > 0 && bufferContribution > 0 ? bufferGap / bufferContribution : bufferGap > 0 ? Number.POSITIVE_INFINITY : 0;

  // High-APR debt beats investing, mathematically: anything above the threshold
  // rate gets 70% of what's left before long-term investing starts.
  const highAprDebts = (profile.liabilities || [])
    .filter((item) => Number(item.rate || 0) >= draft.highAprThreshold && Number(item.balance || 0) > 0)
    .sort((left, right) => Number(right.rate || 0) - Number(left.rate || 0));
  const highAprBalance = Math.round(sumAmounts(highAprDebts, "balance"));
  const afterBuffer = flexible - bufferContribution;
  let debtExtra = highAprBalance > 0 ? Math.min(Math.round(afterBuffer * 0.7), highAprBalance) : 0;
  debtExtra = Math.max(debtExtra, 0);

  // Investing absorbs the remainder so the buckets always sum to income exactly.
  const investing = Math.max(income - essentials - guiltFree - bufferContribution - debtExtra, 0);

  const perPaycheck = (monthly) => Math.round(monthly / frequency.perMonth);
  const pct = (monthly) => (income > 0 ? Math.round((monthly / income) * 100) : 0);
  const topDebt = highAprDebts[0] || null;
  const debtPayoffMonths = topDebt && debtExtra > 0
    ? Math.ceil(highAprBalance / (debtExtra + Math.round(sumAmounts(highAprDebts, "monthlyPayment"))))
    : null;

  const buckets = [
    {
      id: "essentials",
      label: "Essentials & minimum payments",
      monthly: essentials,
      perPaycheck: perPaycheck(essentials),
      percent: pct(essentials),
      detail: "Rent, utilities, groceries, insurance, and every required debt minimum. Non-negotiable, so it comes off the top."
    },
    ...(bufferContribution > 0 ? [{
      id: "buffer",
      label: "Emergency buffer",
      monthly: bufferContribution,
      perPaycheck: perPaycheck(bufferContribution),
      percent: pct(bufferContribution),
      detail: `Fills your cash buffer toward ${formatCurrency(bufferTargetAmount)} (${draft.bufferTargetMonths} months of essentials). Once it's full, this slice rolls into investing.`
    }] : []),
    ...(debtExtra > 0 ? [{
      id: "debt",
      label: `Extra to high-interest debt`,
      monthly: debtExtra,
      perPaycheck: perPaycheck(debtExtra),
      percent: pct(debtExtra),
      detail: topDebt
        ? `${topDebt.label} at ${topDebt.rate}% APR costs more than investing typically earns, so it gets attacked before long-term investing.`
        : "Debt above your APR threshold gets paid down before long-term investing."
    }] : []),
    ...(investing > 0 ? [{
      id: "invest",
      label: "Investing & long-term goals",
      monthly: investing,
      perPaycheck: perPaycheck(investing),
      percent: pct(investing),
      detail: "Automatic long-term saving — tax-advantaged accounts first where they fit your timeline. PAM recommends allocation strategy, never specific funds."
    }] : []),
    {
      id: "guiltFree",
      label: "Guilt-free spending",
      monthly: guiltFree,
      perPaycheck: perPaycheck(guiltFree),
      percent: pct(guiltFree),
      detail: "Spend this without tracking or guilt. Everything else is already handled, which is the whole point of the split."
    }
  ];

  const plannedSavings = bufferContribution + debtExtra + investing;
  const savingsRatePct = pct(plannedSavings);

  const setupSteps = [
    `Ask payroll (or your employer portal) to split direct deposit: keep ${formatCurrency(perPaycheck(essentials + guiltFree))} per paycheck in checking and route ${formatCurrency(perPaycheck(plannedSavings))} to savings/investing accounts.`,
    ...(bufferContribution > 0 ? [`If payroll can't split deposits, set an automatic transfer of ${formatCurrency(perPaycheck(bufferContribution))} from checking to savings on every payday.`] : []),
    ...(debtExtra > 0 && topDebt ? [`Add ${formatCurrency(debtExtra)}/month as an extra automatic payment on ${topDebt.label} — autopay it the day after payday so it happens before willpower is involved.`] : []),
    ...(investing > 0 ? [`Set a recurring ${formatCurrency(investing)}/month auto-invest transfer. If your bank supports "buckets" or sub-accounts, name them so each dollar has a job.`] : []),
    "Re-run this split whenever income, rent, or a debt changes. PAM never moves money — you set these up once with your employer or bank."
  ];

  const assumptions = [
    `Uses ${formatCurrency(income)}/month of detected income, paid ${frequency.label}.`,
    `Essentials and minimum payments total ${formatCurrency(essentials)}/month from your baseline.`,
    `Emergency buffer target: ${draft.bufferTargetMonths} months of essentials (${formatCurrency(bufferTargetAmount)}); you hold ${formatCurrency(liquid)} today.`,
    `Debt above ${draft.highAprThreshold}% APR is paid down before long-term investing.`,
    `Guilt-free floor: ${draft.guiltFreePct}% of income, so the plan stays livable.`,
    "Every assumption above is editable — change it and re-run."
  ];

  return {
    income,
    payFrequency: draft.payFrequency || "biweekly",
    payFrequencyLabel: frequency.noun,
    paychecksPerMonth: frequency.perMonth,
    perPaycheckIncome: perPaycheck(income),
    buckets,
    plannedSavings,
    savingsRatePct,
    essentials,
    essentialsSharePct: pct(essentials),
    guiltFree,
    bufferContribution,
    bufferTargetMonths: draft.bufferTargetMonths,
    bufferTargetAmount,
    bufferGap,
    bufferMonthsToTarget,
    debtExtra,
    debtPayoffMonths,
    topHighAprDebt: topDebt ? { label: topDebt.label, rate: Number(topDebt.rate || 0), balance: Number(topDebt.balance || 0) } : null,
    investing,
    warnings,
    assumptions,
    setupSteps
  };
}

function getSplitRisk(plan) {
  if (plan.income <= 0 || (plan.income > 0 && plan.essentials >= plan.income)) {
    return {
      label: "High",
      detail: "Committed costs consume the whole paycheck, so there is no flexible money to allocate yet. The lever here is income or fixed costs, not willpower."
    };
  }
  if (plan.essentialsSharePct > 65 || (plan.bufferGap > 0 && (!Number.isFinite(plan.bufferMonthsToTarget) || plan.bufferMonthsToTarget > 18))) {
    return {
      label: "Medium",
      detail: "The split works, but essentials are heavy relative to income, so the buffer and long-term slices build slowly. Any income gain should go straight to the flexible pool."
    };
  }
  return {
    label: "Low",
    detail: "Income comfortably covers essentials, so this split can run on autopilot without squeezing your day-to-day."
  };
}

function buildSplitAhaMoment(plan) {
  if (plan.bufferContribution > 0 && Number.isFinite(plan.bufferMonthsToTarget) && plan.bufferMonthsToTarget > 0) {
    return `Routing ${formatCurrency(plan.bufferContribution)}/month of every paycheck into savings fills your ${formatCurrency(plan.bufferTargetAmount)} buffer by about ${addMonthsLabel(plan.bufferMonthsToTarget)} — automatically, before you can spend it.`;
  }
  if (plan.debtExtra > 0 && plan.topHighAprDebt && plan.debtPayoffMonths) {
    return `An extra ${formatCurrency(plan.debtExtra)}/month clears ${plan.topHighAprDebt.label.toLowerCase()} (${plan.topHighAprDebt.rate}% APR) in about ${formatMonths(plan.debtPayoffMonths)} — a guaranteed return no investment matches.`;
  }
  if (plan.plannedSavings > 0) {
    return `This split saves ${plan.savingsRatePct}% of your income (${formatCurrency(plan.plannedSavings)}/month) before it ever reaches your checking account, and still leaves ${formatCurrency(plan.guiltFree)} guilt-free.`;
  }
  return "Right now every dollar is committed before it lands. The split shows exactly where the paycheck goes, which is the first step to changing it.";
}

function buildSplitNextStep(plan) {
  if (plan.income <= 0) {
    return "Connect your accounts or add income first — the split needs a real paycheck number to be useful.";
  }
  if (plan.bufferContribution > 0) {
    return `Start with one move: an automatic ${formatCurrency(Math.round(plan.bufferContribution / plan.paychecksPerMonth))} transfer to savings every payday. Add the other slices once that feels normal.`;
  }
  if (plan.debtExtra > 0) {
    return `Start with the debt slice: automate the extra ${formatCurrency(plan.debtExtra)}/month payment, then layer in the rest of the split.`;
  }
  return "Set the transfers up with your bank or payroll this week — the split only works when it happens before you see the money.";
}

export function evaluatePaycheckSplit(profile, goals, draft) {
  const metrics = getProfileMetrics(profile);
  const normalizedDraft = cloneValue(draft);
  derivePaycheckSplitValues(normalizedDraft);
  const plan = computePaycheckSplit(profile, normalizedDraft);
  const risk = getSplitRisk(plan);

  // For goal math, the plan behaves like redirecting free cash into deliberate
  // saving: compare planned buffer+investing against current contributions.
  const investingDelta = plan.bufferContribution + plan.investing - Math.round(metrics.contributions);
  const goalsSummary = evaluateGoals(goals, {
    oneTimeCost: 0,
    monthlyIncomeDelta: 0,
    monthlyExpenseDelta: 0,
    monthlyInvestingDelta: investingDelta,
    type: "paycheckSplit"
  });

  const projectedNetWorth = metrics.projectedNetWorth + futureValueRecurring(investingDelta, INVEST_RETURN, DEFAULT_HORIZON_MONTHS);
  const currentPath = {
    monthlyFreeCash: metrics.monthlyFreeCash,
    runwayMonths: metrics.runwayMonths,
    projectedNetWorth: metrics.projectedNetWorth,
    healthScore: metrics.healthScore,
    liquidAssets: metrics.liquidAssets
  };
  const scenarioPath = {
    // For a split, "buffer" reads as deliberate monthly saving: every dollar not
    // consumed by essentials or guilt-free spending.
    monthlyFreeCash: plan.plannedSavings,
    runwayMonths: metrics.runwayMonths,
    projectedNetWorth,
    healthScore: Math.round(clamp(metrics.healthScore + (plan.plannedSavings - Math.max(metrics.monthlyFreeCash, 0)) / 40, 34, 97)),
    liquidAssets: metrics.liquidAssets
  };

  const impactCards = [
    {
      label: "Automatic save rate",
      value: `${plan.savingsRatePct}%`,
      detail: `${formatCurrency(plan.plannedSavings)} of ${formatCurrency(plan.income)} each month goes to buffer, debt payoff, and investing before you can spend it.`
    },
    {
      label: "Buffer target",
      value: plan.bufferGap > 0
        ? (Number.isFinite(plan.bufferMonthsToTarget) && plan.bufferMonthsToTarget > 0 ? addMonthsLabel(plan.bufferMonthsToTarget) : "Needs income room")
        : "Funded",
      detail: `${formatCurrency(plan.bufferTargetAmount)} target — ${plan.bufferTargetMonths || normalizedDraft.bufferTargetMonths} months of essentials.`
    },
    {
      label: "High-interest debt",
      value: plan.debtExtra > 0 ? `${formatCurrency(plan.debtExtra)}/mo extra` : "Minimums only",
      detail: plan.topHighAprDebt
        ? `${plan.topHighAprDebt.label} at ${plan.topHighAprDebt.rate}% APR${plan.debtPayoffMonths ? ` — gone in about ${formatMonths(plan.debtPayoffMonths)}` : ""}.`
        : `No debt above ${normalizedDraft.highAprThreshold}% APR detected.`
    },
    {
      label: "Guilt-free spending",
      value: `${formatCurrency(plan.buckets[plan.buckets.length - 1].perPaycheck)}/paycheck`,
      detail: risk.detail
    }
  ];

  return {
    draft: normalizedDraft,
    scenario: {
      ...normalizedDraft,
      title: `Split your ${plan.payFrequencyLabel}`,
      assumptions: plan.assumptions
    },
    splitPlan: plan,
    currentPath,
    scenarioPath,
    shortTermLiquidityDelta: 0,
    longTermNetWorthDelta: projectedNetWorth - metrics.projectedNetWorth,
    monthlyCashFlowImpact: plan.plannedSavings - metrics.monthlyFreeCash,
    savingsRunoutMonths: Number.POSITIVE_INFINITY,
    risk,
    creditReadiness: null,
    confidence: { score: 90, label: "High confidence" },
    goalsSummary,
    ahaMoment: buildSplitAhaMoment(plan),
    nextStep: buildSplitNextStep(plan),
    impactCards
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

function inferCustomFocus(normalized) {
  if (!normalized) return "unknown";
  if (/\b(bonus|raise|promotion|windfall|inherit|sell|sold|profit|commission|side hustle)\b/i.test(normalized)) return "income";
  if (/\b(tuition|wedding|divorce|baby|kids|child|pet|vet|insurance claim|medical|tax|lawsuit|settlement)\b/i.test(normalized)) return "oneTime";
  if (/\b(subscription|gym|daycare|mortgage|rent|lease|utilities|payment|costs me)\b/i.test(normalized)) return "expense";
  if (/\b(invest|save|contribute|brokerage|401k|roth|retirement)\b/i.test(normalized)) return "invest";
  return "unknown";
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
    case "paycheckSplit":
      derivePaycheckSplitValues(nextDraft);
      break;
    default:
      deriveCustomValues(nextDraft);
      break;
  }

  return nextDraft;
}

function hydrateDraftFromPrompt(draft, prompt, profile) {
  const normalized = normalizePrompt(prompt);
  const flags = getIntentFlags(prompt);
  const values = collectMoneyCandidates(prompt);
  const firstAmount = values[0]?.value || null;
  const recurringAmount = parseRecurringAmount(prompt);
  const parsedMonths = parseMonths(prompt);
  const percent = parsePercent(prompt);

  draft.userSpecifiedDuration = Boolean(parsedMonths);
  draft.userSpecifiedRecurringAmount = Boolean(recurringAmount);
  draft.userSpecifiedOneTimeCost = Boolean(firstAmount);
  draft.userSpecifiedPercent = Boolean(percent);

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
    case "paycheckSplit":
      if (percent) draft.guiltFreePct = clamp(percent * 100, 0, 40);
      if (parsedMonths) draft.bufferTargetMonths = clamp(parsedMonths, 1, 12);
      if (/\bweekly\b/i.test(normalized) && !/\bbi-?weekly\b/i.test(normalized)) draft.payFrequency = "weekly";
      if (/\bbi-?weekly\b|every two weeks|every other week/i.test(normalized)) draft.payFrequency = "biweekly";
      if (/\bmonthly\b|once a month/i.test(normalized)) draft.payFrequency = "monthly";
      if (/twice a month|semi-?monthly/i.test(normalized)) draft.payFrequency = "semimonthly";
      if (draft.payFrequency) draft.userSpecifiedPayFrequency = true;
      break;
    case "jobLoss":
      if (parsedMonths) draft.durationMonths = parsedMonths;
      break;
    case "compound":
      if (firstAmount) draft.legalCost = firstAmount;
      draft.userSpecifiedLegalCost = Boolean(firstAmount && flags.hasLegal);
      if (normalized.includes("legal only")) {
        draft.focusMode = "legalOnly";
        draft.compoundFocusResolved = true;
      }
      if (normalized.includes("income only")) {
        draft.focusMode = "incomeOnly";
        draft.compoundFocusResolved = true;
      }
      if (flags.hasJobLoss && flags.hasLegal && (normalized.includes("both") || (firstAmount && parsedMonths))) {
        draft.focusMode = "both";
        draft.compoundFocusResolved = true;
      }
      break;
    case "custom":
      draft.customFocus = inferCustomFocus(normalized);
      draft.customDirection = /\braise|bonus|promotion|windfall|profit|sell|sold|inherit|commission\b/i.test(normalized)
        ? "positive"
        : "negative";
      if (firstAmount) {
        if (draft.customFocus === "income") {
          draft.monthlyIncomeDelta = draft.customDirection === "positive" ? firstAmount : -Math.abs(firstAmount);
        } else if (draft.customFocus === "invest") {
          draft.monthlyInvestingDelta = Math.abs(recurringAmount || firstAmount);
        } else if (draft.customFocus === "expense" && recurringAmount) {
          draft.monthlyExpenseDelta = Math.abs(recurringAmount);
        } else if (draft.customFocus === "oneTime" || !recurringAmount) {
          draft.oneTimeCost = draft.customDirection === "positive" ? -Math.abs(firstAmount) : Math.abs(firstAmount);
        }
      }
      if (recurringAmount && draft.customFocus !== "invest") {
        if (draft.customFocus === "income") {
          draft.monthlyIncomeDelta = draft.customDirection === "positive" ? Math.abs(recurringAmount) : -Math.abs(recurringAmount);
        } else {
          draft.monthlyExpenseDelta = draft.customDirection === "positive" ? -Math.abs(recurringAmount) : Math.abs(recurringAmount);
        }
      }
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
  const flags = getIntentFlags(prompt);
  const normalized = flags.normalized;
  const detectedIntents = listDetectedIntents(flags);

  if (draft.type === "paycheckSplit") {
    // Only one thing can block a useful split: not knowing the pay cadence.
    // Labels double as self-contained prompts so the dashboard chips re-route
    // back into the split with the cadence filled in.
    if (!draft.payFrequency) {
      return {
        prompt: "How often does your paycheck land? I'll size each deposit split to match.",
        choices: [
          { label: "Split my paycheck — paid every two weeks", patch: { payFrequency: "biweekly", userSpecifiedPayFrequency: true } },
          { label: "Split my paycheck — paid twice a month", patch: { payFrequency: "semimonthly", userSpecifiedPayFrequency: true } },
          { label: "Split my paycheck — paid monthly", patch: { payFrequency: "monthly", userSpecifiedPayFrequency: true } }
        ]
      };
    }
    return null;
  }

  if (draft.type === "compound") {
    if (!draft.compoundFocusResolved) {
      return {
        prompt: "Got it. Let's break that down. What should I model first?",
        choices: [
          {
            label: "Lost income",
            patch: { focusMode: "incomeOnly", legalCost: 0, oneTimeCost: 0, compoundFocusResolved: true }
          },
          {
            label: "Legal costs",
            patch: { focusMode: "legalOnly", monthlyIncomeDelta: 0, monthlyInvestingDelta: 0, compoundFocusResolved: true }
          },
          {
            label: "Both",
            patch: { focusMode: "both", compoundFocusResolved: true }
          }
        ]
      };
    }

    if ((draft.focusMode === "incomeOnly" || draft.focusMode === "both") && !draft.userSpecifiedDuration) {
      return {
        prompt: "How long should I model the income loss?",
        choices: [
          { label: "1 month", patch: { durationMonths: 1, userSpecifiedDuration: true } },
          { label: "3 months", patch: { durationMonths: 3, userSpecifiedDuration: true } },
          { label: "6 months", patch: { durationMonths: 6, userSpecifiedDuration: true } }
        ]
      };
    }

    if ((draft.focusMode === "legalOnly" || draft.focusMode === "both") && !draft.userSpecifiedLegalCost) {
      return {
        prompt: "What legal-cost range should I use?",
        choices: [
          { label: "$5k", patch: { legalCost: 5000, userSpecifiedLegalCost: true } },
          { label: "$15k", patch: { legalCost: 15000, userSpecifiedLegalCost: true } },
          { label: "$30k", patch: { legalCost: 30000, userSpecifiedLegalCost: true } }
        ]
      };
    }

    return null;
  }

  if (detectedIntents.length > 1) {
    return {
      prompt: "I spotted more than one moving piece. Which one should I tighten first?",
      choices: [
        { label: "Income", patch: { type: "incomeReduction", monthlyIncomeDelta: -1200 } },
        { label: "Expense", patch: { type: "rentIncrease", monthlyExpenseDelta: recurringAmount || 400 } },
        { label: "Upfront cost", patch: { type: "emergency", oneTimeCost: moneyCandidates[0]?.value || 3000 } }
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

  if (draft.type === "custom") {
    if (draft.customFocus === "unknown") {
      return {
        prompt: "What kind of financial change is this closest to?",
        choices: [
          { label: "One-time cash hit", patch: { customFocus: "oneTime", oneTimeCost: moneyCandidates[0]?.value || 3000 } },
          { label: "Monthly cash change", patch: { customFocus: "expense", monthlyExpenseDelta: recurringAmount || 400 } },
          { label: "Income or savings change", patch: { customFocus: "income", monthlyIncomeDelta: -1200 } }
        ]
      };
    }

    if (draft.customFocus === "oneTime" && !moneyCandidates.length) {
      return {
        prompt: "How big should I make the one-time impact?",
        choices: [
          { label: "$1k", patch: { oneTimeCost: 1000, userSpecifiedOneTimeCost: true } },
          { label: "$5k", patch: { oneTimeCost: 5000, userSpecifiedOneTimeCost: true } },
          { label: "$15k", patch: { oneTimeCost: 15000, userSpecifiedOneTimeCost: true } }
        ]
      };
    }

    if (draft.customFocus === "expense" && !recurringAmount) {
      return {
        prompt: "What monthly change should I use?",
        choices: [
          { label: "+$200/mo", patch: { monthlyExpenseDelta: 200, userSpecifiedRecurringAmount: true } },
          { label: "+$600/mo", patch: { monthlyExpenseDelta: 600, userSpecifiedRecurringAmount: true } },
          { label: "+$1,500/mo", patch: { monthlyExpenseDelta: 1500, userSpecifiedRecurringAmount: true } }
        ]
      };
    }

    if (draft.customFocus === "income" && !draft.userSpecifiedRecurringAmount && !draft.userSpecifiedPercent) {
      return {
        prompt: draft.customDirection === "positive" ? "How much monthly upside should I use?" : "How much monthly income loss should I use?",
        choices: draft.customDirection === "positive"
          ? [
              { label: "+$500/mo", patch: { monthlyIncomeDelta: 500, userSpecifiedRecurringAmount: true } },
              { label: "+$1,500/mo", patch: { monthlyIncomeDelta: 1500, userSpecifiedRecurringAmount: true } },
              { label: "+$3,000/mo", patch: { monthlyIncomeDelta: 3000, userSpecifiedRecurringAmount: true } }
            ]
          : [
              { label: "-$500/mo", patch: { monthlyIncomeDelta: -500, userSpecifiedRecurringAmount: true } },
              { label: "-$1,500/mo", patch: { monthlyIncomeDelta: -1500, userSpecifiedRecurringAmount: true } },
              { label: "-$3,000/mo", patch: { monthlyIncomeDelta: -3000, userSpecifiedRecurringAmount: true } }
            ]
      };
    }

    if (draft.customFocus === "invest" && !recurringAmount && !moneyCandidates.length) {
      return {
        prompt: "What monthly save-or-invest amount should I model?",
        choices: [
          { label: "$250/mo", patch: { monthlyInvestingDelta: 250, userSpecifiedRecurringAmount: true } },
          { label: "$750/mo", patch: { monthlyInvestingDelta: 750, userSpecifiedRecurringAmount: true } },
          { label: "$1,500/mo", patch: { monthlyInvestingDelta: 1500, userSpecifiedRecurringAmount: true } }
        ]
      };
    }
  }

  if (draft.type === "jobLoss" && !parsedMonths) {
    return {
      prompt: "How long should I assume the income gap lasts?",
      choices: [
        { label: "1 month", patch: { durationMonths: 1, userSpecifiedDuration: true } },
        { label: "3 months", patch: { durationMonths: 3, userSpecifiedDuration: true } },
        { label: "6 months", patch: { durationMonths: 6, userSpecifiedDuration: true } }
      ]
    };
  }

  if (draft.type === "car" && !moneyCandidates.length && !recurringAmount) {
    return {
      prompt: "Should I model a starter car, something mid-range, or a stretch purchase?",
      choices: [
        { label: "$12k used", patch: { purchaseAmount: 12000, userSpecifiedOneTimeCost: true } },
        { label: "$20k practical", patch: { purchaseAmount: 20000, userSpecifiedOneTimeCost: true } },
        { label: "$35k stretch", patch: { purchaseAmount: 35000, userSpecifiedOneTimeCost: true } }
      ]
    };
  }

  if (draft.type === "move" && !recurringAmount && !moneyCandidates.length) {
    return {
      prompt: "What kind of housing jump should I use?",
      choices: [
        { label: "+$300/mo", patch: { monthlyExpenseDelta: 300, userSpecifiedRecurringAmount: true } },
        { label: "+$700/mo", patch: { monthlyExpenseDelta: 700, userSpecifiedRecurringAmount: true } },
        { label: "+$1,200/mo", patch: { monthlyExpenseDelta: 1200, userSpecifiedRecurringAmount: true } }
      ]
    };
  }

  if (draft.type === "rentIncrease" && !recurringAmount && !moneyCandidates.length) {
    return {
      prompt: "How much higher should I make the monthly rent?",
      choices: [
        { label: "+$150/mo", patch: { monthlyExpenseDelta: 150, userSpecifiedRecurringAmount: true } },
        { label: "+$400/mo", patch: { monthlyExpenseDelta: 400, userSpecifiedRecurringAmount: true } },
        { label: "+$900/mo", patch: { monthlyExpenseDelta: 900, userSpecifiedRecurringAmount: true } }
      ]
    };
  }

  if (draft.type === "invest" && !recurringAmount && !moneyCandidates.length) {
    return {
      prompt: "How much do you want PAM to invest each month?",
      choices: [
        { label: "$250/mo", patch: { monthlyInvestingDelta: 250, userSpecifiedRecurringAmount: true } },
        { label: "$500/mo", patch: { monthlyInvestingDelta: 500, userSpecifiedRecurringAmount: true } },
        { label: "$1,000/mo", patch: { monthlyInvestingDelta: 1000, userSpecifiedRecurringAmount: true } }
      ]
    };
  }

  if (draft.type === "incomeReduction" && !draft.userSpecifiedRecurringAmount && !draft.userSpecifiedPercent) {
    return {
      prompt: "What income drop should I model?",
      choices: [
        { label: "-10%", patch: { monthlyIncomeDelta: -Math.round(getProfileMetrics(profile).monthlyIncome * 0.1), userSpecifiedPercent: true } },
        { label: "-$1,500/mo", patch: { monthlyIncomeDelta: -1500, userSpecifiedRecurringAmount: true } },
        { label: "-$3,000/mo", patch: { monthlyIncomeDelta: -3000, userSpecifiedRecurringAmount: true } }
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
    case "paycheckSplit":
      return `Split your ${(PAY_FREQUENCY_META[draft.payFrequency] || PAY_FREQUENCY_META.biweekly).noun}`;
    case "custom":
      return draft.prompt ? titleCase(draft.prompt) : "Model a custom financial decision";
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
    if (!draft.userSpecifiedOneTimeCost && !draft.userSpecifiedRecurringAmount) {
      assumptions.push("You only said car, so PAM is using a temporary $20,000 practical-car assumption until you pick the real price.");
    }
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

  if (draft.type === "custom") {
    assumptions.push("Uses a flexible custom scenario path so PAM can respond even when the decision does not match a preset.");
    if (draft.oneTimeCost) assumptions.push(`Applies a one-time balance change of ${formatCurrency(draft.oneTimeCost)}.`);
    if (draft.monthlyExpenseDelta) assumptions.push(`Applies a monthly expense change of ${formatCurrency(draft.monthlyExpenseDelta)}.`);
    if (draft.monthlyIncomeDelta) assumptions.push(`Applies a monthly income change of ${formatCurrency(draft.monthlyIncomeDelta)}.`);
    if (draft.monthlyInvestingDelta) assumptions.push(`Applies a monthly save-or-invest change of ${formatCurrency(draft.monthlyInvestingDelta)}.`);
  }

  assumptions.push(`Baseline monthly buffer starts at ${formatCurrency(metrics.monthlyFreeCash)}.`);
  assumptions.push("Results are directional, not tax or legal advice.");

  return assumptions;
}

function getPromptSignals(prompt) {
  const flags = getIntentFlags(prompt);
  const signals = [];
  if (flags.hasCar) signals.push("car purchase");
  if (flags.hasMove) signals.push("housing move");
  if (flags.hasJobLoss) signals.push("income loss");
  if (flags.hasLegal) signals.push("legal cost");
  if (flags.hasInvest) signals.push("investing change");
  if (flags.hasEmergency) signals.push("cash shock");
  if (flags.hasIncomeReduction) signals.push("income reduction");
  if (flags.hasRentIncrease) signals.push("rent increase");
  return signals;
}

function buildReasoningTrace(prompt, draft, result, metrics, followUp) {
  if (draft.type === "paycheckSplit" && result.splitPlan) {
    const plan = result.splitPlan;
    const trace = [
      {
        label: "1. Read the request",
        detail: `Treated this as a paycheck allocation plan built from ${formatCurrency(plan.income)}/month of detected income.`
      },
      {
        label: "2. Cover the non-negotiables",
        detail: `Essentials and minimum payments claim ${formatCurrency(plan.essentials)} (${plan.essentialsSharePct}% of income) off the top, plus a ${formatCurrency(plan.guiltFree)} guilt-free floor so the plan is livable.`
      },
      {
        label: "3. Run the waterfall",
        detail: plan.bufferContribution > 0
          ? `Buffer first (${formatCurrency(plan.bufferContribution)}/mo toward the ${formatCurrency(plan.bufferTargetAmount)} target), then ${plan.debtExtra > 0 ? `${formatCurrency(plan.debtExtra)}/mo against high-APR debt, then ` : ""}${formatCurrency(plan.investing)}/mo to investing.`
          : plan.debtExtra > 0
            ? `Buffer is funded, so high-APR debt gets ${formatCurrency(plan.debtExtra)}/mo before ${formatCurrency(plan.investing)}/mo flows to investing.`
            : `Buffer is funded and no high-APR debt is open, so ${formatCurrency(plan.investing)}/mo flows straight to investing.`
      },
      {
        label: "4. Connect to goals",
        detail: result.goalsSummary?.mostImpactedGoal
          ? `${result.goalsSummary.mostImpactedGoal.title} moves the most under this saving pace.`
          : "No single goal dominates; the split funds them evenly."
      }
    ];
    if (followUp) {
      trace.push({ label: "5. Ask the next best question", detail: followUp.prompt });
    }
    return trace;
  }

  const signals = getPromptSignals(prompt);
  const trace = [
    {
      label: "1. Read the request",
      detail: signals.length
        ? `Detected ${signals.join(", ")} from "${prompt || draft.prompt || "the starter scenario"}".`
        : "No exact preset matched, so PAM opened a flexible custom model instead of failing."
    },
    {
      label: "2. Fill missing numbers",
      detail:
        draft.type === "car" && !draft.userSpecifiedOneTimeCost && !draft.userSpecifiedRecurringAmount
          ? `Car price was not provided, so the first pass uses ${formatCurrency(draft.purchaseAmount)} and asks you to tighten it.`
          : `Used explicit inputs where available and defaulted the rest from the current financial profile.`
    },
    {
      label: "3. Stress-test cash flow",
      detail: `Monthly buffer changes from ${formatCurrency(metrics.monthlyFreeCash)} to ${formatCurrency(result.scenarioPath.monthlyFreeCash)}.`
    },
    {
      label: "4. Connect to goals",
      detail: result.goalsSummary.mostImpactedGoal
        ? `${result.goalsSummary.mostImpactedGoal.title} is the most affected goal.`
        : "No single goal takes a major hit under this scenario."
    }
  ];

  if (followUp) {
    trace.push({
      label: "5. Ask the next best question",
      detail: followUp.prompt
    });
  }

  if (result.creditReadiness) {
    trace.push({
      label: `${followUp ? "6" : "5"}. Check credit fit`,
      detail: result.creditReadiness.score
        ? `Used credit score ${result.creditReadiness.score}, debt-to-income ${formatPercent(result.creditReadiness.debtToIncome)}, and remaining buffer to estimate ${result.creditReadiness.approvalStrength.toLowerCase()}.`
        : "This decision may involve approval or borrowing, but no credit score is saved yet."
    });
  }

  return trace;
}

function buildSpendingOffsetPlan(profile, draft, result) {
  const monthlyGap = Math.max(
    result.currentPath.monthlyFreeCash - result.scenarioPath.monthlyFreeCash,
    result.scenarioPath.monthlyFreeCash < 800 ? 800 - result.scenarioPath.monthlyFreeCash : 0,
    0
  );
  const upfrontShock =
    draft.type === "car"
      ? Number(draft.upfrontCost || draft.oneTimeCost || 0)
      : draft.type === "compound"
        ? Number(draft.legalCost || 0)
        : draft.type === "move"
          ? Number(draft.moveCost || 0)
          : Number(draft.oneTimeCost || 0);
  const upfrontGap = Math.max(upfrontShock - 3000, 0);
  const variableCuts = [...(profile.monthly?.variable || [])]
    .filter((entry) => !entry.essential && Number(entry.amount || 0) > 0)
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));
  const contributionCuts = [...(profile.monthly?.contributions || [])]
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));

  const actions = [];
  let remainingMonthly = monthlyGap;

  for (const entry of variableCuts) {
    if (remainingMonthly <= 25) break;
    const cut = Math.min(Math.ceil(remainingMonthly / 25) * 25, Math.round(Number(entry.amount || 0) * 0.45));
    if (cut <= 0) continue;
    actions.push({
      label: `Cut ${entry.label}`,
      amount: cut,
      cadence: "per month",
      detail: `Reduces the monthly pressure created by this scenario without touching essentials.`
    });
    remainingMonthly -= cut;
  }

  for (const entry of contributionCuts) {
    if (remainingMonthly <= 25) break;
    const cut = Math.min(Math.ceil(remainingMonthly / 25) * 25, Math.round(Number(entry.amount || 0) * 0.35));
    if (cut <= 0) continue;
    actions.push({
      label: `Temporarily reduce ${entry.label}`,
      amount: cut,
      cadence: "per month",
      detail: "This protects cash flow, but it is why the goal timeline moves."
    });
    remainingMonthly -= cut;
  }

  if (upfrontGap > 0) {
    actions.unshift({
      label: "Lower the upfront cash hit",
      amount: Math.min(upfrontGap, Math.max(upfrontShock * 0.5, 1000)),
      cadence: "one time",
      detail: "Use a smaller down payment, cheaper option, or delay until this cash is saved separately."
    });
  }

  if (!actions.length) {
    actions.push({
      label: "Keep current spending intact",
      amount: 0,
      cadence: "no cut needed",
      detail: "The model does not require an immediate spending cut, but PAM still recommends stress-testing a worse case."
    });
  }

  return {
    targetMonthlyOffset: monthlyGap,
    remainingMonthlyGap: Math.max(remainingMonthly, 0),
    actions: actions.slice(0, 4)
  };
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
    case "paycheckSplit":
      return [
        field("bufferTargetMonths", "Buffer target (months of essentials)", draft.bufferTargetMonths, 1, 1, "How many months of essentials to hold in cash."),
        field("guiltFreePct", "Guilt-free spending (% of income)", draft.guiltFreePct, 1, 0, "The floor reserved for spending without guilt."),
        field("highAprThreshold", "High-interest threshold (% APR)", draft.highAprThreshold, 1, 0, "Debt above this rate gets paid down before investing.")
      ];
    case "custom":
      return [
        field("oneTimeCost", "One-time balance change", draft.oneTimeCost, 100, -50000, "Use negative for extra cash in, positive for cash out."),
        field("monthlyExpenseDelta", "Monthly expense change", draft.monthlyExpenseDelta, 50, -10000, "Negative lowers expenses, positive raises them."),
        field("monthlyIncomeDelta", "Monthly income change", draft.monthlyIncomeDelta, 50, -10000, "Negative lowers income, positive raises it."),
        field("monthlyInvestingDelta", "Monthly saving or investing", draft.monthlyInvestingDelta, 50, -10000, "Positive adds saving, negative pauses it."),
        field("durationMonths", "Modeled months", draft.durationMonths, 1, 1, "How long the change should last.")
      ];
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

function getCreditTier(score) {
  if (!Number.isFinite(score)) {
    return {
      label: "Not provided",
      rateRange: "Add score",
      detail: "PAM can model cash flow, but loan/lease odds are directional until a credit score is added."
    };
  }

  if (score >= 780) return { label: "Excellent", rateRange: "best available rates", detail: "Credit strength should help most approval conversations if income and debt also support it." };
  if (score >= 720) return { label: "Strong", rateRange: "competitive rates", detail: "Credit score is likely a positive signal, but debt-to-income and income stability still matter." };
  if (score >= 680) return { label: "Good", rateRange: "average to competitive rates", detail: "Approval can be realistic, though the rate may not be the lowest available." };
  if (score >= 620) return { label: "Fair", rateRange: "higher rates likely", detail: "Approval may be possible, but pricing, deposit, down payment, or co-signer requirements can become material." };
  return { label: "Weak", rateRange: "approval may be difficult", detail: "This score can make approval harder or materially more expensive unless income, collateral, or a co-signer offsets it." };
}

function isCreditSensitiveDecision(draft, prompt = "") {
  const text = normalizePrompt(`${prompt || ""} ${draft.prompt || ""} ${draft.title || ""}`);
  return (
    ["car", "move", "rentIncrease"].includes(draft.type) ||
    /\b(loan|finance|financing|lease|mortgage|credit|apr|interest|approval|approved|qualify|apartment|landlord|car payment|auto)\b/i.test(text)
  );
}

function estimateCreditReadiness(profile, metrics, draft, scenarioMonthlyFreeCash, prompt) {
  if (!isCreditSensitiveDecision(draft, prompt)) return null;

  const rawScore = profile?.user?.creditScore;
  const score = rawScore === null || rawScore === undefined || rawScore === "" ? Number.NaN : Number(rawScore);
  const hasScore = Number.isFinite(score);
  const tier = getCreditTier(score);
  const monthlyDebtAfterDecision = metrics.debtPayment + Math.max(Number(draft.monthlyExpenseDelta || 0), 0);
  const debtToIncome = metrics.monthlyIncome > 0 ? monthlyDebtAfterDecision / metrics.monthlyIncome : 1;
  const downPayment =
    draft.type === "car"
      ? Math.max(Number(draft.upfrontCost || draft.oneTimeCost || 0), 0)
      : Math.max(Number(draft.oneTimeCost || draft.moveCost || 0), 0);
  const loanAmount =
    draft.type === "car"
      ? Math.max(Number(draft.purchaseAmount || 0) - downPayment, 0)
      : Math.max(Number(draft.purchaseAmount || draft.oneTimeCost || 0), 0);

  let strength = "Needs more info";
  if (hasScore) {
    if (score >= 720 && debtToIncome <= 0.36 && scenarioMonthlyFreeCash >= 600) strength = "Strong chance";
    else if (score >= 680 && debtToIncome <= 0.43 && scenarioMonthlyFreeCash >= 300) strength = "Workable chance";
    else if (score >= 620 && debtToIncome <= 0.5 && scenarioMonthlyFreeCash >= 0) strength = "Possible but expensive";
    else strength = "Low chance";
  }

  const constraints = [];
  if (!hasScore) constraints.push("Credit score missing");
  if (debtToIncome > 0.43) constraints.push("Debt-to-income looks high");
  if (scenarioMonthlyFreeCash < 300) constraints.push("Monthly buffer is tight");
  if (draft.type === "car" && loanAmount > 0 && downPayment / Math.max(Number(draft.purchaseAmount || loanAmount), 1) < 0.1) {
    constraints.push("Down payment may be light");
  }

  return {
    score: hasScore ? score : null,
    tier: tier.label,
    rateRange: tier.rateRange,
    approvalStrength: strength,
    debtToIncome,
    loanAmount,
    monthlyDebtAfterDecision,
    constraints,
    detail: hasScore
      ? `${strength}. Score is ${tier.label.toLowerCase()}, debt-to-income would be ${formatPercent(debtToIncome)}, and buffer after the decision is ${formatCurrency(scenarioMonthlyFreeCash)}.`
      : `Add an approximate credit score to estimate approval strength. Cash-flow risk still uses the connected baseline.`
  };
}

function getConfidence(draft, followUp, prompt) {
  if (draft.type === "paycheckSplit") {
    // The split is pure baseline math — the only real unknown is pay cadence.
    const score = followUp ? 82 : 90;
    return { score, label: score >= 86 ? "High confidence" : "Medium confidence" };
  }

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
    return `You would run out of buffer in about ${formatMonthDelta(scenarioRunoutMonths)} if this path stayed unchanged.`;
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
    return "Keep building cash first. A larger savings buffer will make this decision far less fragile.";
  }

  return "The move looks workable. Lock the numbers, then stress-test one downside assumption before committing.";
}

export function evaluateScenario(profile, goals, draft, prompt = draft.prompt || "") {
  // Paycheck split is an allocation plan, not a shock scenario — it has its own
  // deterministic evaluator and skips the delta/stress-test framing entirely.
  if (draft.type === "paycheckSplit") {
    return { ...evaluatePaycheckSplit(profile, goals, draft), offsetPlan: null };
  }

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
  const creditReadiness = estimateCreditReadiness(profile, metrics, normalizedDraft, scenarioMonthlyFreeCash, prompt);
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

  const baseResult = {
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
    creditReadiness,
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
          ? "How long your buffer lasts if nothing else changes."
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
      },
      ...(creditReadiness ? [{
        label: "Loan / approval",
        value: creditReadiness.approvalStrength,
        detail: creditReadiness.detail
      }] : [])
    ]
  };

  return {
    ...baseResult,
    offsetPlan: buildSpendingOffsetPlan(profile, normalizedDraft, baseResult)
  };
}

function buildAssistantMessage(draft, result, followUp) {
  const scenarioTitle = result.scenario.title.toLowerCase();

  if (draft.type === "compound") {
    return {
      headline: followUp
        ? "I split that into separate shocks so we can tighten one at a time."
        : "I modeled the income hit and legal drag together.",
      body: followUp
        ? `You already have a usable first-pass model. Answer the next question and I'll sharpen the parts that matter most.`
        : `${result.ahaMoment} ${result.nextStep}`
    };
  }

  if (followUp) {
    const followUpLead = {
      jobLoss: "I started with an income interruption and left one question to size the gap.",
      car: "I started with a car purchase and left one question to pin down the budget.",
      move: "I started with a housing move and left one question to size the rent jump.",
      invest: "I started with a monthly investing plan and left one question to set the contribution.",
      incomeReduction: "I started with an income drop and left one question to size the cut.",
      emergency: "I treated this like a cash shock first and left one question to refine the shape.",
      custom: "I translated this into a custom money scenario and left one question so the model stays flexible instead of forcing a bad preset.",
      paycheckSplit: "I built your paycheck split from the baseline and left one question — pay cadence — so the per-deposit amounts are exact."
    };

    return {
      headline: `I can model that. I started with ${scenarioTitle}.`,
      body:
        followUpLead[draft.type] ||
        "I translated the prompt into a first-pass model and left one follow-up so we can tighten the scenario without slowing you down."
    };
  }

  return {
    headline: `I can model that. I started with ${result.scenario.title.toLowerCase()}.`,
    body: `${result.ahaMoment} ${result.nextStep}`
  };
}

export function buildDecisionSession({ prompt, starterId, draft, profile, goals, catalog }) {
  const metrics = getProfileMetrics(profile);
  const starter =
    starterId === "compound-shock"
      ? buildCompoundStarter(metrics)
      : starterId === "custom-decision"
        ? buildCustomStarter()
      : starterId === "paycheck-split"
        ? buildPaycheckSplitStarter(profile)
      : starterId
        ? findStarter(catalog, starterId)
        : null;

  const detectedId = detectScenarioId(prompt, catalog);
  let sessionDraft = draft
    ? cloneValue(draft)
    : buildDraftFromStarter(
        starter ||
          (detectedId === "custom-decision"
            ? buildCustomStarter()
            : detectedId === "paycheck-split"
              ? buildPaycheckSplitStarter(profile)
              : findStarter(catalog, detectedId)) ||
          buildCompoundStarter(metrics),
        profile,
        prompt
      );

  if (prompt) {
    hydrateDraftFromPrompt(sessionDraft, prompt, profile);
    sessionDraft.prompt = prompt;
  }

  sessionDraft = reconcileDraft(sessionDraft, profile);
  const followUp = buildFollowUp(sessionDraft, starter, prompt, profile);
  const result = evaluateScenario(profile, goals, sessionDraft, prompt);
  const reasoningTrace = buildReasoningTrace(prompt, sessionDraft, result, metrics, followUp);
  const confidence = getConfidence(sessionDraft, followUp, prompt);
  const detectedIntents = listDetectedIntents(getIntentFlags(prompt));

  return {
    prompt,
    starterId: sessionDraft.starterId,
    draft: sessionDraft,
    followUp,
    result: {
      ...result,
      reasoningTrace,
      confidence
    },
    assistant: buildAssistantMessage(sessionDraft, result, followUp),
    editableFields: getFieldSchema(sessionDraft, profile),
    interpretation: {
      label: sessionDraft.type,
      summary:
        sessionDraft.type === "compound"
          ? "PAM detected a combined shock and modeled both pieces together before asking which one to tighten first."
          : detectedIntents.length > 1
            ? `PAM detected multiple moving pieces (${detectedIntents.join(", ")}) and chose the closest first-pass model before narrowing with a follow-up.`
            : sessionDraft.type === "custom"
              ? "PAM did not force this into a narrow preset. It opened a flexible custom scenario and is using follow-ups to learn the shape."
          : sessionDraft.type === "paycheckSplit"
              ? "PAM built a paycheck allocation plan from your baseline: essentials and minimums first, then buffer, high-interest debt, investing, and a guilt-free floor. Every number is deterministic and every assumption is editable."
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
      body: `You are starting from ${formatCurrency(metrics.monthlyFreeCash)} of monthly buffer and ${formatMonthDelta(metrics.runwayMonths)} of essential runway. That is enough structure to test tradeoffs instead of guessing.`
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
      body: `${result.nextStep} The goal is not just to answer "can I?" but to define the line where the decision still feels safe.`
    }
  ];
}

// ─── Values-based insight engines ────────────────────────────────────────────
// All accept a flat `profile` object computed by the caller:
// { age, annualSalary, monthlyBuffer, currentSavings, monthlyExpenses, lifeValues[] }

function fvRecurring(monthlyPayment, annualRate, months) {
  const r = annualRate / 12;
  if (r === 0) return monthlyPayment * months;
  return monthlyPayment * ((Math.pow(1 + r, months) - 1) / r);
}

function yearsToNestEgg(annualSavings, startSavings, target) {
  let s = startSavings;
  for (let y = 0; y < 50; y++) {
    if (s >= target) return y;
    s = s * 1.07 + annualSavings;
  }
  return 50;
}

export function detectGoalConflicts(userValues, profile) {
  if (!userValues) return [];
  const { age = 30, annualSalary = 50000, monthlyBuffer = 0, currentSavings = 0, monthlyExpenses = 0, lifeValues = [] } = profile;
  const retirementAge = Number(userValues.retirement_target_age) || 65;
  const yearsToRetire = Math.max(retirementAge - age, 1);
  const annualSpending = monthlyExpenses * 12 || annualSalary * 0.6;
  const requiredNestEgg = annualSpending * 25;
  const monthlyContrib = Math.max(monthlyBuffer * 0.8, 0);
  const projectedNestEgg = currentSavings * Math.pow(1.07, yearsToRetire) + fvRecurring(monthlyContrib, 0.07, yearsToRetire * 12);
  const conflicts = [];

  if (retirementAge < 62 && projectedNestEgg < requiredNestEgg * 0.75) {
    const actualRetire = Math.min(age + yearsToNestEgg(monthlyContrib * 12, currentSavings, requiredNestEgg), 75);
    conflicts.push({
      severity: "critical",
      title: `You want to retire at ${retirementAge}. At your current pace, you'll retire closer to ${actualRetire}.`,
      detail: `You need ~${formatCurrency(requiredNestEgg)} to retire at ${retirementAge}. You're on track for ~${formatCurrency(Math.round(projectedNestEgg / 1000) * 1000)}. The gap is ${formatCurrency(Math.max(requiredNestEgg - projectedNestEgg, 0))}.`,
      action: `What savings rate do I need to retire at ${retirementAge}?`
    });
  }

  const priorities = (Array.isArray(userValues.lifestyle_priorities) ? userValues.lifestyle_priorities : []).map(p => String(p).toLowerCase());
  if (priorities.includes("homeownership") && (userValues.location_flexible === "yes" || priorities.some(p => ["travel", "flexibility"].includes(p)))) {
    conflicts.push({
      severity: "moderate",
      title: "Homeownership and flexibility are in direct conflict.",
      detail: "A home ties up your down payment and locks you to a location. If mobility matters, that capital may work harder invested.",
      action: "Should I buy a home given I want to stay flexible?"
    });
  }

  if (lifeValues.includes("Never work for a boss") && userValues.work_philosophy !== "entrepreneur") {
    conflicts.push({
      severity: "moderate",
      title: "You want to escape employment but have no clear path to that yet.",
      detail: "Freelancing, a business, or enough invested to live off returns: you need one of these. PAM can model each.",
      action: "What do I need saved to never work for an employer?"
    });
  }

  if (retirementAge < 55 && annualSalary > 0 && monthlyBuffer < annualSalary * 0.15 / 12) {
    conflicts.push({
      severity: "moderate",
      title: `Retiring at ${retirementAge} requires saving 20–30% of income. You're below that.`,
      detail: `Your buffer is ${formatCurrency(monthlyBuffer)}/mo. To hit ${retirementAge} you likely need at least ${formatCurrency(Math.round(annualSalary * 0.20 / 12))}/mo going toward long-term savings.`,
      action: `How much do I need to save each month to retire at ${retirementAge}?`
    });
  }

  return conflicts.sort((a, b) => ({ critical: 0, moderate: 1, minor: 2 }[a.severity] ?? 2) - ({ critical: 0, moderate: 1, minor: 2 }[b.severity] ?? 2));
}

export function simulateCareerVelocity(userValues, profile) {
  const { age = 28, annualSalary = 55000, monthlyBuffer = 500, currentSavings = 0, monthlyExpenses = 0 } = profile;
  const retirementAge = Number(userValues.retirement_target_age) || 65;
  const YEARS = 10;

  const pathA = [];
  const pathB = [];
  let sA = annualSalary;
  let sB = annualSalary;
  for (let y = 0; y <= YEARS; y++) {
    pathA.push({ year: y, salary: Math.round(sA) });
    pathB.push({ year: y, salary: Math.round(sB) });
    if (y < YEARS) {
      sA *= 1.03;
      const switchYear = y > 0 && y % 3 === 0;
      sB = switchYear ? sB * 1.15 : sB * 1.03;
    }
  }

  const totalA = pathA.reduce((s, p) => s + p.salary, 0);
  const totalB = pathB.reduce((s, p) => s + p.salary, 0);
  const finalDelta = pathB[YEARS].salary - pathA[YEARS].salary;
  const annualSpending = monthlyExpenses * 12 || annualSalary * 0.6;
  const requiredNestEgg = annualSpending * 25;
  const savingsA = Math.max(monthlyBuffer * 12, annualSalary * 0.10);
  const savingsB = savingsA + finalDelta * 0.35;
  const retireA = Math.min(age + yearsToNestEgg(savingsA, currentSavings, requiredNestEgg), 75);
  const retireB = Math.min(age + yearsToNestEgg(savingsB, currentSavings, requiredNestEgg), 75);

  const yrs = userValues.years_at_current_job || "";
  const shouldTrigger = (["2_to_3", "3_to_5", "over_5"].includes(yrs)) && retirementAge < 60;

  return {
    pathA: { label: "Stay at current employer", finalSalary: pathA[YEARS].salary, totalEarnings: totalA, retirementAge: retireA },
    pathB: { label: "Switch every 2–3 years", finalSalary: pathB[YEARS].salary, totalEarnings: totalB, retirementAge: retireB },
    salaryDelta: finalDelta,
    earningsDelta: totalB - totalA,
    yearsSaved: Math.max(retireA - retireB, 0),
    shouldTrigger
  };
}

export function simulateBuyVsRent(userValues, profile) {
  const { annualSalary = 60000, currentSavings = 0 } = profile;
  const YEARS = 10;
  const homePrice = annualSalary * 4.5;
  const downPayment = homePrice * 0.10;
  const loanAmt = homePrice - downPayment;
  const monthlyMortgage = loanAmt * (0.065 / 12) / (1 - Math.pow(1 + 0.065 / 12, -360));
  const monthlyTaxIns = homePrice * 0.015 / 12;
  const totalBuyMonthly = monthlyMortgage + monthlyTaxIns;
  const monthlyRent = annualSalary * 0.28 / 12;
  const rentDelta = Math.max(totalBuyMonthly - monthlyRent, 0);

  const homeValueFinal = homePrice * Math.pow(1.03, YEARS);
  const r12 = 0.065 / 12;
  const remainingMortgage = loanAmt * Math.pow(1 + r12, 120) - monthlyMortgage * ((Math.pow(1 + r12, 120) - 1) / r12);
  const buyNetWorth = homeValueFinal - Math.max(remainingMortgage, 0) + currentSavings - downPayment;

  const investedDP = downPayment * Math.pow(1.07, YEARS);
  const investedDelta = rentDelta > 0 ? fvRecurring(rentDelta, 0.07, 120) : 0;
  const rentNetWorth = currentSavings + investedDP + investedDelta;

  const priorities = (Array.isArray(userValues.lifestyle_priorities) ? userValues.lifestyle_priorities : []).map(p => String(p).toLowerCase());
  const wantsFlexibility = userValues.location_flexible === "yes" || priorities.some(p => ["travel", "flexibility"].includes(p));
  const wantsHome = priorities.includes("homeownership");
  const winner = rentNetWorth > buyNetWorth ? "rent" : "buy";
  const recommendation = (wantsFlexibility && !wantsHome) ? "rent" : winner;

  return {
    buy: { label: "Buy a home", downPayment: Math.round(downPayment), monthlyPayment: Math.round(totalBuyMonthly), projectedNetWorth: Math.round(buyNetWorth), homePrice: Math.round(homePrice) },
    rent: { label: "Rent + invest the difference", monthlyRent: Math.round(monthlyRent), monthlyInvested: Math.round(rentDelta), projectedNetWorth: Math.round(rentNetWorth) },
    recommendation,
    winner,
    netWorthDelta: Math.round(Math.abs(rentNetWorth - buyNetWorth))
  };
}

export function simulateLocationArbitrage(userValues, profile) {
  const INDUSTRY_MAP = {
    finance: { cities: ["New York City", "London", "Chicago"], boost: 0.38 },
    tech: { cities: ["San Francisco", "New York City", "Seattle"], boost: 0.30 },
    "software engineering": { cities: ["San Francisco", "Seattle", "New York City"], boost: 0.30 },
    entertainment: { cities: ["Los Angeles", "New York City"], boost: 0.25 },
    consulting: { cities: ["New York City", "Chicago", "Washington DC"], boost: 0.24 },
    healthcare: { cities: ["Boston", "San Francisco", "New York City"], boost: 0.18 },
    law: { cities: ["New York City", "Washington DC", "Los Angeles"], boost: 0.32 },
    marketing: { cities: ["New York City", "Los Angeles", "San Francisco"], boost: 0.20 },
    engineering: { cities: ["San Francisco", "Seattle", "Austin"], boost: 0.22 }
  };
  const { age = 28, annualSalary = 55000, monthlyBuffer = 400, currentSavings = 0, monthlyExpenses = 0 } = profile;
  const retirementAge = Number(userValues.retirement_target_age) || 65;
  const industry = String(userValues.industry || "").toLowerCase().trim();
  const city = String(userValues.city || "").toLowerCase();

  const match = Object.entries(INDUSTRY_MAP).find(([key]) => industry.includes(key));
  if (!match) return null;

  const [industryKey, data] = match;
  const targetCity = data.cities[0];
  const alreadyThere = data.cities.some(c => city.includes(c.toLowerCase().split(" ")[0]));
  if (alreadyThere) return null;

  const boostSalary = Math.round(annualSalary * (1 + data.boost));
  const salaryGain = boostSalary - annualSalary;
  const costPenalty = annualSalary * 0.18;
  const netAnnualGain = Math.round(salaryGain - costPenalty);
  const annualSpending = monthlyExpenses * 12 || annualSalary * 0.6;
  const requiredNestEgg = annualSpending * 25;
  const savingsStay = Math.max(monthlyBuffer * 12, annualSalary * 0.10);
  const savingsMove = savingsStay + netAnnualGain * 0.45;
  const retireStay = Math.min(age + yearsToNestEgg(savingsStay, currentSavings, requiredNestEgg), 72);
  const retireMove = Math.min(age + yearsToNestEgg(savingsMove, currentSavings, requiredNestEgg), 72);

  return {
    industryKey,
    targetCity,
    salaryGain,
    netAnnualGain,
    retireAgeStay: retireStay,
    retireAgeMove: retireMove,
    yearsSaved: Math.max(retireStay - retireMove, 0)
  };
}
