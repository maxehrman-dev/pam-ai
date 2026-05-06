export const BASELINE_STORAGE_KEY = "pam:baseline:v2";
export const WAITLIST_STORAGE_KEY = "pam:waitlist:v1";

const LEGACY_BASELINE_KEYS = ["pam-ai-young-adult-baseline-v2"];
const STANDARD_DEDUCTION_SINGLE = 14600;

const STATE_TAX_RATES = {
  CA: 0.06,
  NY: 0.055,
  NJ: 0.045,
  MA: 0.05,
  IL: 0.0495,
  PA: 0.0307,
  TX: 0,
  FL: 0,
  WA: 0,
  NV: 0,
  TN: 0,
  OTHER: 0.04
};

const EMPLOYMENT_LABELS = {
  w2: "W-2 employee",
  "1099": "1099 / self-employed",
  student: "Student worker",
  mixed: "Mixed income",
  unknown: "Not sure yet"
};

const EMPLOYMENT_PAYROLL_RATES = {
  w2: 0.0765,
  "1099": 0.1413,
  student: 0.0765,
  mixed: 0.109,
  unknown: 0.0765
};

function nowIso() {
  return new Date().toISOString();
}

export function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

export function toNumber(value, fallback = 0) {
  if (!hasValue(value)) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getEmptyBaseline() {
  const timestamp = nowIso();
  return {
    source: "manual",
    profile: {
      firstName: "",
      emailAddress: "",
      name: "",
      age: null,
      state: "OTHER",
      employmentStatus: "unknown"
    },
    income: {
      grossMonthlyIncome: null,
      knownTakeHomeMonthlyIncome: null,
      detectedMonthlyIncome: null,
      incomeStreams: []
    },
    expenses: {
      monthlyExpenses: null,
      recurringExpenses: [],
      categoryBreakdown: {}
    },
    obligations: {
      monthlyDebtPayments: null,
      liabilities: []
    },
    savings: {
      currentSavings: null,
      checkingBalance: null,
      savingsBalance: null,
      emergencyFundFloor: null
    },
    tax: {
      estimatedIncomeTaxRate: null,
      payrollTaxRate: null,
      combinedTaxRate: null,
      annualDeductions: null,
      retirementContributionMonthly: null,
      taxRateOverride: false
    },
    goals: {
      primaryGoal: "",
      customGoalLabel: "",
      goalTargetAmount: null,
      goalTimelineMonths: null,
      goalTargetEstimated: false,
      goalTimelineEstimated: false
    },
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      confidence: "low",
      notes: []
    }
  };
}

export function employmentStatusToLabel(value) {
  return EMPLOYMENT_LABELS[value] || EMPLOYMENT_LABELS.unknown;
}

export function labelToEmploymentStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("1099") || normalized.includes("self")) return "1099";
  if (normalized.includes("student")) return "student";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("w-2") || normalized.includes("w2") || normalized.includes("part-time")) return "w2";
  return "unknown";
}

export function estimateGoalDefaults(goalLabel, emergencyFundFloor = null) {
  const normalized = normalizeString(goalLabel).toLowerCase();
  if (normalized.includes("move out")) {
    return {
      target: 17000,
      timeline: 18,
      note: "Move-out estimate includes emergency buffer, first month rent, security deposit, and setup cash."
    };
  }
  if (normalized.includes("emergency")) return { target: emergencyFundFloor || 10000, timeline: 12, note: "Emergency-fund estimate uses a default one-year target." };
  if (normalized.includes("car")) return { target: 8000, timeline: 14, note: "Car estimate assumes down payment and initial setup cash." };
  if (normalized.includes("invest")) return { target: 6000, timeline: 12, note: "Investing estimate assumes a one-year first milestone." };
  if (normalized.includes("net worth")) return { target: 25000, timeline: 24, note: "Net-worth estimate uses a two-year starter milestone." };
  return { target: 12000, timeline: 18, note: "PAM used a general starter goal estimate." };
}

export function getGoalLabel(baseline) {
  const custom = normalizeString(baseline?.goals?.customGoalLabel);
  if (normalizeString(baseline?.goals?.primaryGoal).toLowerCase() === "custom goal" && custom) {
    return custom;
  }
  return normalizeString(baseline?.goals?.primaryGoal);
}

function estimateFederalAnnualTax(taxableIncome) {
  const brackets = [
    { limit: 11600, rate: 0.1 },
    { limit: 47150, rate: 0.12 },
    { limit: 100525, rate: 0.22 },
    { limit: 191950, rate: 0.24 },
    { limit: Number.POSITIVE_INFINITY, rate: 0.32 }
  ];

  let remaining = Math.max(taxableIncome, 0);
  let previousLimit = 0;
  let tax = 0;

  for (const bracket of brackets) {
    const taxableAtBracket = Math.min(remaining, bracket.limit - previousLimit);
    if (taxableAtBracket <= 0) break;
    tax += taxableAtBracket * bracket.rate;
    remaining -= taxableAtBracket;
    previousLimit = bracket.limit;
  }

  return tax;
}

export function estimateTaxProfile(baseline) {
  const grossMonthlyIncome = toNumber(baseline?.income?.grossMonthlyIncome, 0);
  const knownTakeHome = toNumber(baseline?.income?.knownTakeHomeMonthlyIncome, 0);
  const employmentStatus = baseline?.profile?.employmentStatus || "unknown";
  const retirementMonthly = toNumber(baseline?.tax?.retirementContributionMonthly, 0);
  const annualDeductions = toNumber(baseline?.tax?.annualDeductions, 0);
  const grossAnnual = grossMonthlyIncome * 12;
  const taxableIncome = Math.max(grossAnnual - retirementMonthly * 12 - annualDeductions - STANDARD_DEDUCTION_SINGLE, 0);
  const federalTax = estimateFederalAnnualTax(taxableIncome);
  const stateRate = STATE_TAX_RATES[baseline?.profile?.state] ?? STATE_TAX_RATES.OTHER;
  const stateTax = taxableIncome * stateRate;
  const incomeTaxRate = grossAnnual > 0 ? ((federalTax + stateTax) / grossAnnual) * 100 : 0;
  const payrollTaxRate = (EMPLOYMENT_PAYROLL_RATES[employmentStatus] || EMPLOYMENT_PAYROLL_RATES.unknown) * 100;
  const calculatedCombinedRate = Math.min(Math.round(incomeTaxRate + payrollTaxRate), 45);
  const combinedTaxRate = baseline?.tax?.taxRateOverride && hasValue(baseline?.tax?.combinedTaxRate)
    ? toNumber(baseline.tax.combinedTaxRate, calculatedCombinedRate)
    : calculatedCombinedRate;
  const monthlyTax = Math.round((grossAnnual * (combinedTaxRate / 100)) / 12);
  const takeHomeIncome = knownTakeHome > 0
    ? knownTakeHome
    : Math.max(Math.round(grossMonthlyIncome - monthlyTax), 0);

  return {
    grossAnnual,
    taxableIncome,
    federalTax,
    stateTax,
    estimatedIncomeTaxRate: grossAnnual > 0 ? Math.round(incomeTaxRate) : null,
    payrollTaxRate: Math.round(payrollTaxRate),
    combinedTaxRate: grossAnnual > 0 || knownTakeHome > 0 ? combinedTaxRate : null,
    monthlyTax,
    takeHomeIncome,
    note: employmentStatus === "1099"
      ? "1099 income usually needs a larger tax set-aside because taxes are not automatically withheld."
      : employmentStatus === "w2"
        ? "W-2 income usually has withholding already, but PAM still estimates taxes for affordability."
        : "PAM estimates taxes from income, state, and employment status."
  };
}

export function getSpendableIncome(baseline) {
  const knownTakeHome = toNumber(baseline?.income?.knownTakeHomeMonthlyIncome, 0);
  if (knownTakeHome > 0) return knownTakeHome;

  const detected = toNumber(baseline?.income?.detectedMonthlyIncome, 0);
  if (detected > 0) return detected;

  return estimateTaxProfile(baseline).takeHomeIncome;
}

export function getMonthlyExpenses(baseline) {
  const direct = toNumber(baseline?.expenses?.monthlyExpenses, 0);
  if (direct > 0) return direct;

  return (baseline?.expenses?.recurringExpenses || []).reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
}

export function getMonthlyObligations(baseline) {
  const direct = toNumber(baseline?.obligations?.monthlyDebtPayments, 0);
  if (direct > 0) return direct;

  return (baseline?.obligations?.liabilities || []).reduce(
    (sum, item) => sum + toNumber(item.minimumPayment ?? item.monthlyPayment, 0),
    0
  );
}

export function getCurrentSavings(baseline) {
  const direct = toNumber(baseline?.savings?.currentSavings, 0);
  if (direct > 0) return direct;

  const savingsBalance = toNumber(baseline?.savings?.savingsBalance, 0);
  if (savingsBalance > 0) return savingsBalance;

  return toNumber(baseline?.savings?.checkingBalance, 0);
}

export function getMonthlyBuffer(baseline) {
  return getSpendableIncome(baseline)
    - getMonthlyExpenses(baseline)
    - getMonthlyObligations(baseline)
    - toNumber(baseline?.tax?.retirementContributionMonthly, 0);
}

function buildMetadata(previousBaseline, confidence, notes) {
  return {
    createdAt: previousBaseline?.metadata?.createdAt || nowIso(),
    updatedAt: nowIso(),
    confidence,
    notes
  };
}

export function normalizeManualBaseline(input, previousBaseline = getEmptyBaseline()) {
  const next = clone(getEmptyBaseline());
  const firstName = normalizeString(input.firstName || previousBaseline?.profile?.firstName);
  const emailAddress = normalizeString(input.emailAddress || previousBaseline?.profile?.emailAddress);
  const employmentStatus = labelToEmploymentStatus(input.employmentStatus || previousBaseline?.profile?.employmentStatus);
  const state = normalizeString(input.stateCode || previousBaseline?.profile?.state || "OTHER") || "OTHER";
  const grossMonthlyIncome = hasValue(input.grossMonthlyIncome) ? toNumber(input.grossMonthlyIncome, null) : previousBaseline?.income?.grossMonthlyIncome;
  const knownTakeHome = hasValue(input.knownTakeHomeMonthlyIncome)
    ? toNumber(input.knownTakeHomeMonthlyIncome, null)
    : previousBaseline?.income?.knownTakeHomeMonthlyIncome;
  const monthlyExpenses = hasValue(input.monthlyExpenses) ? toNumber(input.monthlyExpenses, null) : previousBaseline?.expenses?.monthlyExpenses;
  const monthlyDebtPayments = hasValue(input.monthlyObligations) ? toNumber(input.monthlyObligations, null) : previousBaseline?.obligations?.monthlyDebtPayments;
  const currentSavings = hasValue(input.currentSavings) ? toNumber(input.currentSavings, null) : previousBaseline?.savings?.currentSavings;
  const retirementContributionMonthly = hasValue(input.retirementContributions)
    ? toNumber(input.retirementContributions, null)
    : previousBaseline?.tax?.retirementContributionMonthly;
  const annualDeductions = hasValue(input.deductions) ? toNumber(input.deductions, null) : previousBaseline?.tax?.annualDeductions;
  const combinedTaxRate = hasValue(input.combinedTaxRate)
    ? toNumber(input.combinedTaxRate, null)
    : previousBaseline?.tax?.combinedTaxRate;
  const goalLabel = normalizeString(input.longTermGoal || previousBaseline?.goals?.primaryGoal);
  const customGoalLabel = normalizeString(input.customGoalLabel || previousBaseline?.goals?.customGoalLabel);
  const detectedGoalLabel = goalLabel === "Custom goal" ? customGoalLabel : goalLabel;
  const emergencyFundFloor = hasValue(monthlyExpenses) ? Math.round(toNumber(monthlyExpenses, 0) * 3) : previousBaseline?.savings?.emergencyFundFloor;
  const defaults = detectedGoalLabel ? estimateGoalDefaults(detectedGoalLabel, emergencyFundFloor) : null;
  const rawGoalTarget = hasValue(input.goalTargetAmount) ? toNumber(input.goalTargetAmount, null) : previousBaseline?.goals?.goalTargetAmount;
  const rawGoalTimeline = hasValue(input.goalTimelineMonths) ? toNumber(input.goalTimelineMonths, null) : previousBaseline?.goals?.goalTimelineMonths;
  const goalTargetEstimated = !hasValue(rawGoalTarget) && Boolean(defaults);
  const goalTimelineEstimated = !hasValue(rawGoalTimeline) && Boolean(defaults);

  next.source = "manual";
  next.profile = {
    firstName,
    emailAddress,
    name: firstName,
    age: hasValue(input.age) ? toNumber(input.age, null) : previousBaseline?.profile?.age ?? null,
    state,
    employmentStatus
  };
  next.income = {
    grossMonthlyIncome: hasValue(grossMonthlyIncome) ? toNumber(grossMonthlyIncome, null) : null,
    knownTakeHomeMonthlyIncome: hasValue(knownTakeHome) ? toNumber(knownTakeHome, null) : null,
    detectedMonthlyIncome: previousBaseline?.source?.startsWith("plaid") ? previousBaseline?.income?.detectedMonthlyIncome ?? null : null,
    incomeStreams: previousBaseline?.source?.startsWith("plaid") ? clone(previousBaseline.income.incomeStreams || []) : []
  };
  next.expenses = {
    monthlyExpenses: hasValue(monthlyExpenses) ? toNumber(monthlyExpenses, null) : null,
    recurringExpenses: previousBaseline?.source?.startsWith("plaid") ? clone(previousBaseline.expenses.recurringExpenses || []) : [],
    categoryBreakdown: previousBaseline?.source?.startsWith("plaid") ? clone(previousBaseline.expenses.categoryBreakdown || {}) : {}
  };
  next.obligations = {
    monthlyDebtPayments: hasValue(monthlyDebtPayments) ? toNumber(monthlyDebtPayments, null) : null,
    liabilities: previousBaseline?.source?.startsWith("plaid") ? clone(previousBaseline.obligations.liabilities || []) : []
  };
  next.savings = {
    currentSavings: hasValue(currentSavings) ? toNumber(currentSavings, null) : null,
    checkingBalance: previousBaseline?.source?.startsWith("plaid") ? previousBaseline?.savings?.checkingBalance ?? null : null,
    savingsBalance: previousBaseline?.source?.startsWith("plaid") ? previousBaseline?.savings?.savingsBalance ?? null : null,
    emergencyFundFloor: hasValue(emergencyFundFloor) ? toNumber(emergencyFundFloor, null) : null
  };
  next.tax = {
    estimatedIncomeTaxRate: null,
    payrollTaxRate: null,
    combinedTaxRate: hasValue(combinedTaxRate) ? toNumber(combinedTaxRate, null) : null,
    annualDeductions: hasValue(annualDeductions) ? toNumber(annualDeductions, null) : null,
    retirementContributionMonthly: hasValue(retirementContributionMonthly) ? toNumber(retirementContributionMonthly, null) : null,
    taxRateOverride: Boolean(input.taxRateOverride || previousBaseline?.tax?.taxRateOverride)
  };
  next.goals = {
    primaryGoal: goalLabel,
    customGoalLabel,
    goalTargetAmount: hasValue(rawGoalTarget) ? toNumber(rawGoalTarget, null) : defaults?.target ?? null,
    goalTimelineMonths: hasValue(rawGoalTimeline) ? toNumber(rawGoalTimeline, null) : defaults?.timeline ?? null,
    goalTargetEstimated,
    goalTimelineEstimated
  };
  next.metadata = buildMetadata(previousBaseline, "medium", [
    "Prototype data is saved only in this browser.",
    "Manual baseline remains available as a fallback while Plaid Sandbox preparation is in progress."
  ]);

  const taxProfile = estimateTaxProfile(next);
  next.tax.estimatedIncomeTaxRate = taxProfile.estimatedIncomeTaxRate;
  next.tax.payrollTaxRate = taxProfile.payrollTaxRate;
  next.tax.combinedTaxRate = next.tax.taxRateOverride && hasValue(next.tax.combinedTaxRate)
    ? next.tax.combinedTaxRate
    : taxProfile.combinedTaxRate;

  return next;
}

export function getMockPlaidLikeData() {
  return {
    accounts: [
      { id: "acct_checking_1", name: "Everyday Checking", type: "checking", current: 4450, available: 4210 },
      { id: "acct_savings_1", name: "High Yield Savings", type: "savings", current: 14800, available: 14800 },
      { id: "acct_credit_1", name: "Travel Rewards Card", type: "credit", current: -600, available: 4400 }
    ],
    transactions: [
      { id: "tx_paycheck_1", name: "Employer Payroll", amount: 2225, direction: "inflow", category: "income", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_paycheck_2", name: "Employer Payroll", amount: 2225, direction: "inflow", category: "income", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_rent", name: "Rent", amount: 1650, direction: "outflow", category: "housing", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_groceries", name: "Groceries", amount: 420, direction: "outflow", category: "food", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_transport", name: "Transportation", amount: 260, direction: "outflow", category: "transportation", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_subscriptions", name: "Subscriptions", amount: 75, direction: "outflow", category: "subscriptions", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_dining", name: "Dining", amount: 320, direction: "outflow", category: "dining", recurring: true, monthlyOccurrences: 1 },
      { id: "tx_utilities", name: "Utilities", amount: 160, direction: "outflow", category: "utilities", recurring: true, monthlyOccurrences: 1 }
    ],
    liabilities: [
      { id: "liab_student_1", type: "student_loan", name: "Student Loan", balance: 12000, monthlyPayment: 280 },
      { id: "liab_card_1", type: "credit_card", name: "Travel Rewards Card", balance: 600, monthlyPayment: 50 }
    ]
  };
}

export function deriveBaselineFromTransactions(transactions = [], accounts = [], liabilities = [], profileOverrides = {}) {
  const recurringExpenses = [];
  const categoryBreakdown = {};
  let detectedMonthlyIncome = 0;

  for (const item of transactions) {
    const monthlyAmount = toNumber(item.amount, 0) * toNumber(item.monthlyOccurrences || 1, 1);
    if (item.direction === "inflow") {
      detectedMonthlyIncome += monthlyAmount;
      continue;
    }

    recurringExpenses.push({
      name: item.name,
      amount: monthlyAmount,
      category: item.category,
      frequency: "monthly"
    });
    categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + monthlyAmount;
  }

  const monthlyExpenses = recurringExpenses.reduce((sum, item) => sum + item.amount, 0);
  const monthlyDebtPayments = liabilities.reduce((sum, item) => sum + toNumber(item.monthlyPayment, 0), 0);
  const checkingBalance = accounts.filter((item) => item.type === "checking").reduce((sum, item) => sum + toNumber(item.current, 0), 0);
  const savingsBalance = accounts.filter((item) => item.type === "savings").reduce((sum, item) => sum + toNumber(item.current, 0), 0);
  const emergencyFundFloor = Math.round(monthlyExpenses * 3);

  return {
    source: "plaid_mock",
    profile: {
      firstName: normalizeString(profileOverrides.firstName),
      emailAddress: normalizeString(profileOverrides.emailAddress),
      name: normalizeString(profileOverrides.firstName),
      age: hasValue(profileOverrides.age) ? toNumber(profileOverrides.age, null) : null,
      state: normalizeString(profileOverrides.state || "CA") || "CA",
      employmentStatus: profileOverrides.employmentStatus || "w2"
    },
    income: {
      grossMonthlyIncome: null,
      knownTakeHomeMonthlyIncome: null,
      detectedMonthlyIncome,
      incomeStreams: [
        {
          label: "Detected paycheck deposits",
          amount: detectedMonthlyIncome,
          cadence: "monthly",
          confidence: "medium"
        }
      ]
    },
    expenses: {
      monthlyExpenses,
      recurringExpenses,
      categoryBreakdown
    },
    obligations: {
      monthlyDebtPayments,
      liabilities: liabilities.map((item) => ({
        type: item.type,
        name: item.name,
        balance: toNumber(item.balance, 0),
        minimumPayment: toNumber(item.monthlyPayment, 0)
      }))
    },
    savings: {
      currentSavings: savingsBalance,
      checkingBalance,
      savingsBalance,
      emergencyFundFloor
    },
    tax: {
      estimatedIncomeTaxRate: null,
      payrollTaxRate: null,
      combinedTaxRate: null,
      annualDeductions: null,
      retirementContributionMonthly: null,
      taxRateOverride: false
    },
    goals: {
      primaryGoal: "Move out safely",
      customGoalLabel: "",
      goalTargetAmount: 17000,
      goalTimelineMonths: 18,
      goalTargetEstimated: true,
      goalTimelineEstimated: true
    },
    metadata: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      confidence: "medium",
      notes: [
        "Sandbox-style sample data loaded. PAM built a financial baseline.",
        "This is mock data shaped like Plaid-derived information, not a live bank connection."
      ]
    }
  };
}

export function normalizePlaidMockData(plaidLikeData, previousBaseline = getEmptyBaseline()) {
  const derived = deriveBaselineFromTransactions(
    plaidLikeData?.transactions || [],
    plaidLikeData?.accounts || [],
    plaidLikeData?.liabilities || [],
    previousBaseline?.profile || {}
  );
  const taxProfile = estimateTaxProfile(derived);
  derived.tax.estimatedIncomeTaxRate = taxProfile.estimatedIncomeTaxRate;
  derived.tax.payrollTaxRate = taxProfile.payrollTaxRate;
  derived.tax.combinedTaxRate = taxProfile.combinedTaxRate;
  derived.metadata.createdAt = previousBaseline?.metadata?.createdAt || derived.metadata.createdAt;
  return derived;
}

export function migrateLegacyBaseline(rawBaseline) {
  if (!rawBaseline || typeof rawBaseline !== "object") return null;
  if (rawBaseline.profile && rawBaseline.income && rawBaseline.expenses) {
    return rawBaseline;
  }

  return normalizeManualBaseline({
    firstName: rawBaseline.firstName,
    emailAddress: rawBaseline.emailAddress,
    age: rawBaseline.age,
    grossMonthlyIncome: rawBaseline.grossMonthlyIncome,
    knownTakeHomeMonthlyIncome: rawBaseline.knownTakeHomeMonthlyIncome || rawBaseline.takeHomeIncome,
    employmentStatus: rawBaseline.employmentStatus,
    stateCode: rawBaseline.stateCode,
    combinedTaxRate: rawBaseline.estimatedTaxRate,
    taxRateOverride: rawBaseline.taxRateOverride,
    monthlyExpenses: rawBaseline.monthlyExpenses,
    monthlyObligations: rawBaseline.monthlyObligations,
    currentSavings: rawBaseline.currentSavings,
    retirementContributions: rawBaseline.retirementContributions,
    deductions: rawBaseline.deductions,
    longTermGoal: rawBaseline.longTermGoal,
    customGoalLabel: rawBaseline.customGoalLabel,
    goalTargetAmount: rawBaseline.goalTargetAmount,
    goalTimelineMonths: rawBaseline.goalTimelineMonths
  });
}

export function loadBaseline(storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!storage) return getEmptyBaseline();

  try {
    const stored = storage.getItem(BASELINE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return migrateLegacyBaseline(parsed) || getEmptyBaseline();
    }

    for (const key of LEGACY_BASELINE_KEYS) {
      const legacy = storage.getItem(key);
      if (!legacy) continue;
      const migrated = migrateLegacyBaseline(JSON.parse(legacy));
      if (migrated) {
        saveBaseline(migrated, storage);
        storage.removeItem(key);
        return migrated;
      }
    }
  } catch (_error) {
    return getEmptyBaseline();
  }

  return getEmptyBaseline();
}

export function saveBaseline(baseline, storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!storage) return baseline;
  const next = migrateLegacyBaseline(baseline) || baseline;

  // Plaid access tokens must stay server-side only. Never store tokens in localStorage.
  const safeBaseline = clone(next);
  delete safeBaseline.access_token;
  delete safeBaseline.public_token;

  storage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(safeBaseline));
  return safeBaseline;
}

export function resetBaseline(storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (storage) {
    storage.removeItem(BASELINE_STORAGE_KEY);
    for (const key of LEGACY_BASELINE_KEYS) storage.removeItem(key);
  }
  return getEmptyBaseline();
}

export function validateBaseline(baseline) {
  const errors = [];
  const goalLabel = getGoalLabel(baseline);

  if (!normalizeString(baseline?.profile?.firstName)) errors.push("Add a first name so PAM can save this device profile.");
  if (!normalizeString(baseline?.profile?.emailAddress)) errors.push("Add an email so this prototype knows which profile is saved on this device.");
  if (!(toNumber(baseline?.income?.grossMonthlyIncome, 0) > 0 || toNumber(baseline?.income?.knownTakeHomeMonthlyIncome, 0) > 0 || toNumber(baseline?.income?.detectedMonthlyIncome, 0) > 0)) {
    errors.push("Add income before saving your baseline.");
  }
  if ((baseline?.profile?.employmentStatus || "unknown") === "unknown") errors.push("Choose an employment status so PAM can estimate taxes the right way.");
  if (!(getMonthlyExpenses(baseline) > 0)) errors.push("Add monthly expenses before saving your baseline.");
  if (!(getCurrentSavings(baseline) >= 0 && hasValue(baseline?.savings?.currentSavings) || toNumber(baseline?.savings?.savingsBalance, 0) > 0 || toNumber(baseline?.savings?.checkingBalance, 0) > 0)) {
    errors.push("Add current savings before saving your baseline.");
  }
  if (!goalLabel) errors.push("Choose one long-term goal so PAM knows what to protect.");
  if (normalizeString(baseline?.goals?.primaryGoal).toLowerCase() === "custom goal" && !normalizeString(baseline?.goals?.customGoalLabel)) {
    errors.push("Write a custom goal label or choose one of the preset goals.");
  }
  if (!(toNumber(baseline?.goals?.goalTargetAmount, 0) > 0)) errors.push("Add a goal target amount or use an estimate.");
  if (!(toNumber(baseline?.goals?.goalTimelineMonths, 0) > 0)) errors.push("Goal timeline must be at least 1 month, or use an estimate.");

  return errors;
}

export function hasCompletedBaseline(baseline) {
  return validateBaseline(baseline).length === 0;
}

export function getUiBaseline(baseline) {
  const taxProfile = estimateTaxProfile(baseline);
  return {
    source: baseline?.source || "manual",
    firstName: baseline?.profile?.firstName || "",
    emailAddress: baseline?.profile?.emailAddress || "",
    age: hasValue(baseline?.profile?.age) ? baseline.profile.age : "",
    stateCode: baseline?.profile?.state || "OTHER",
    employmentStatus: employmentStatusToLabel(baseline?.profile?.employmentStatus || "unknown"),
    grossMonthlyIncome: hasValue(baseline?.income?.grossMonthlyIncome) ? baseline.income.grossMonthlyIncome : "",
    knownTakeHomeMonthlyIncome: hasValue(baseline?.income?.knownTakeHomeMonthlyIncome) ? baseline.income.knownTakeHomeMonthlyIncome : "",
    detectedMonthlyIncome: hasValue(baseline?.income?.detectedMonthlyIncome) ? baseline.income.detectedMonthlyIncome : "",
    takeHomeIncome: getSpendableIncome(baseline),
    estimatedIncomeTaxRate: hasValue(baseline?.tax?.estimatedIncomeTaxRate) ? baseline.tax.estimatedIncomeTaxRate : "",
    payrollTaxRate: hasValue(baseline?.tax?.payrollTaxRate) ? baseline.tax.payrollTaxRate : "",
    combinedTaxRate: hasValue(baseline?.tax?.combinedTaxRate) ? baseline.tax.combinedTaxRate : "",
    monthlyExpenses: hasValue(baseline?.expenses?.monthlyExpenses) ? baseline.expenses.monthlyExpenses : "",
    monthlyObligations: hasValue(baseline?.obligations?.monthlyDebtPayments) ? baseline.obligations.monthlyDebtPayments : getMonthlyObligations(baseline) || "",
    currentSavings: hasValue(baseline?.savings?.currentSavings) ? baseline.savings.currentSavings : getCurrentSavings(baseline) || "",
    checkingBalance: hasValue(baseline?.savings?.checkingBalance) ? baseline.savings.checkingBalance : "",
    savingsBalance: hasValue(baseline?.savings?.savingsBalance) ? baseline.savings.savingsBalance : "",
    emergencyFundFloor: hasValue(baseline?.savings?.emergencyFundFloor) ? baseline.savings.emergencyFundFloor : "",
    retirementContributions: hasValue(baseline?.tax?.retirementContributionMonthly) ? baseline.tax.retirementContributionMonthly : "",
    deductions: hasValue(baseline?.tax?.annualDeductions) ? baseline.tax.annualDeductions : "",
    taxRateOverride: Boolean(baseline?.tax?.taxRateOverride),
    longTermGoal: baseline?.goals?.primaryGoal || "",
    customGoalLabel: baseline?.goals?.customGoalLabel || "",
    goalTargetAmount: hasValue(baseline?.goals?.goalTargetAmount) ? baseline.goals.goalTargetAmount : "",
    goalTimelineMonths: hasValue(baseline?.goals?.goalTimelineMonths) ? baseline.goals.goalTimelineMonths : "",
    goalTargetEstimated: Boolean(baseline?.goals?.goalTargetEstimated),
    goalTimelineEstimated: Boolean(baseline?.goals?.goalTimelineEstimated),
    taxProfile,
    metadataNotes: baseline?.metadata?.notes || []
  };
}
