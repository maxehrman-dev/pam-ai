import { escapeHtml, formatCurrency, formatSignedCurrency } from "./utils/formatters.js";
import {
  estimateGoalDefaults,
  estimateTaxProfile,
  getCurrentSavings,
  getEmptyBaseline,
  getGoalLabel,
  getMockPlaidLikeData,
  getMonthlyBuffer,
  getMonthlyExpenses,
  getMonthlyObligations,
  getSpendableIncome,
  getUiBaseline,
  hasCompletedBaseline,
  hasValue,
  labelToEmploymentStatus,
  loadBaseline as loadStoredBaseline,
  normalizeManualBaseline,
  normalizePlaidMockData,
  resetBaseline as clearStoredBaseline,
  saveBaseline as persistBaseline,
  toNumber,
  validateBaseline
} from "./utils/baseline.mjs";
import { connectSandboxAccount, loadSandboxFallback } from "./services/plaidClient.js";

const app = document.querySelector("#app");
const SESSION_STORAGE_KEY = "pam:session:v1";
const LAST_QUESTION_KEY = "pam-ai-last-question-v2";
const WORKSPACE_VIEW_KEY = "pam-ai-workspace-view-v1";
const AUTH_VIEW_KEY = "pam-ai-auth-view-v1";

const state = {
  baseline: loadStoredBaseline(),
  account: null,
  sessionToken: loadSessionToken(),
  workspaceView: loadWorkspaceView(),
  authView: loadAuthView(),
  question: loadQuestion(),
  result: null,
  aiGuidance: null,
  status: "",
  inlineGoalError: "",
  plaidBusy: false
};

let isStarted = false;

function saveBaseline(baseline) {
  state.baseline = persistBaseline(baseline);
}

function loadSessionToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || null;
  } catch (_error) {
    return null;
  }
}

function saveSessionToken(token) {
  state.sessionToken = token || null;
  try {
    if (!token) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch (_error) {
    // Session persistence is helpful, not required.
  }
}

function loadWorkspaceView() {
  if (typeof window === "undefined") return "landing";
  const stored = window.localStorage.getItem(WORKSPACE_VIEW_KEY);
  return ["landing", "account", "dashboard"].includes(stored || "") ? stored : "landing";
}

function loadAuthView() {
  if (typeof window === "undefined") return "create";
  const stored = window.localStorage.getItem(AUTH_VIEW_KEY);
  return ["create", "signin"].includes(stored || "") ? stored : "create";
}

function saveWorkspaceView(view) {
  state.workspaceView = ["landing", "account", "dashboard"].includes(view) ? view : "landing";
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_KEY, state.workspaceView);
  } catch (_error) {
    // View persistence is helpful, not required.
  }
}

function saveAuthView(view) {
  state.authView = ["create", "signin"].includes(view) ? view : "create";
  try {
    window.localStorage.setItem(AUTH_VIEW_KEY, state.authView);
  } catch (_error) {
    // Auth view persistence is helpful, not required.
  }
}

function resetBaseline() {
  state.baseline = clearStoredBaseline();
  if (state.account) {
    saveBaseline(syncAccountIntoBaseline(state.account, getEmptyBaseline()));
  }
  saveWorkspaceView("account");
  state.status = "Baseline reset. Your account stays saved on this device, but PAM will wait for a fresh Sandbox connection.";
  state.result = null;
  state.aiGuidance = null;
  state.inlineGoalError = "";
  render();
}

function loadQuestion() {
  if (typeof window === "undefined") return "Can I afford to move out if rent is $1,800?";
  return window.localStorage.getItem(LAST_QUESTION_KEY) || "Can I afford to move out if rent is $1,800?";
}

function saveQuestion(question) {
  state.question = question;
  try {
    window.localStorage.setItem(LAST_QUESTION_KEY, question);
  } catch (_error) {
    // The simulator can still run without storage.
  }
}

function parseMoneyValue(value, suffix = "") {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  if (/k/i.test(suffix)) return numeric * 1000;
  if (/m/i.test(suffix)) return numeric * 1000000;
  return numeric;
}

function collectAmounts(question) {
  const amounts = [];
  const patterns = [
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/g,
    /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:dollars?|bucks|usd)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of question.matchAll(pattern)) {
      const amount = parseMoneyValue(match[1], match[2] || "");
      if (amount > 0) amounts.push({ amount, index: match.index || 0 });
    }
  }

  return amounts.sort((left, right) => left.index - right.index);
}

function parseMonthlyAmount(question) {
  const monthlyPatterns = [
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i,
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:monthly|each month|every month)\b/i,
    /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i
  ];

  for (const pattern of monthlyPatterns) {
    const match = question.match(pattern);
    if (match) return parseMoneyValue(match[1], match[2] || "");
  }

  return 0;
}

function isSelfEmployedBaseline() {
  return state.baseline.profile.employmentStatus === "1099";
}

function hasPrototypeAccount() {
  return Boolean(state.account?.emailAddress && state.account?.firstName);
}

function canAccessDashboard() {
  return hasPrototypeAccount() && hasCompletedBaseline(state.baseline);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function restoreSessionAccount() {
  if (!state.sessionToken) return null;
  const { payload } = await requestJson(`/api/account/session?sessionToken=${encodeURIComponent(state.sessionToken)}`);
  if (!payload?.ok || !payload?.account) {
    saveSessionToken(null);
    state.account = null;
    return null;
  }
  state.account = payload.account;
  return payload.account;
}

async function logoutAccount() {
  if (state.sessionToken) {
    await fetch("/api/account/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: state.sessionToken })
    }).catch(() => null);
  }
  saveSessionToken(null);
  state.account = null;
  state.baseline = clearStoredBaseline();
  state.result = null;
  state.aiGuidance = null;
  saveWorkspaceView("landing");
  state.status = "Signed out.";
  render();
}

function syncAccountIntoBaseline(account, baseline = state.baseline) {
  if (!account) return baseline;
  const nextBaseline = JSON.parse(JSON.stringify(baseline || getEmptyBaseline()));
  nextBaseline.profile = nextBaseline.profile || getEmptyBaseline().profile;
  nextBaseline.profile.firstName = account.firstName || nextBaseline.profile.firstName || "";
  nextBaseline.profile.emailAddress = account.emailAddress || nextBaseline.profile.emailAddress || "";
  nextBaseline.profile.name = nextBaseline.profile.firstName;
  nextBaseline.profile.age = hasValue(account.age) ? toNumber(account.age, null) : nextBaseline.profile.age ?? null;
  nextBaseline.profile.employmentStatus = labelToEmploymentStatus(account.employmentStatus || nextBaseline.profile.employmentStatus);
  nextBaseline.profile.state = account.stateCode || nextBaseline.profile.state || "OTHER";
  nextBaseline.metadata = nextBaseline.metadata || {};
  nextBaseline.metadata.updatedAt = new Date().toISOString();
  return nextBaseline;
}

function inferPotentialDeduction(question, amount, cadence = "one-time") {
  const normalized = question.toLowerCase();
  const isWorkRelated = /business|work|client|freelance|1099|self[- ]?employ|contractor|side hustle|office|software|laptop|computer|equipment|mileage|marketing|website|course|training|professional|supplies|cowork|home office/.test(normalized);
  const requestedDeduction = /deduct|write[ -]?off|tax break|business expense/.test(normalized);

  if (!amount || (!isWorkRelated && !requestedDeduction)) {
    return {
      isPotentiallyDeductible: false,
      taxSavings: 0,
      note: "No likely deduction detected from the wording. PAM treats this as a regular cash decision."
    };
  }

  if (!isSelfEmployedBaseline()) {
    return {
      isPotentiallyDeductible: false,
      taxSavings: 0,
      note: "This may be work-related, but PAM only models a deduction when the baseline is self-employed/1099. W-2 workers may need reimbursement or specific eligibility."
    };
  }

  const businessUseShare = /car|auto|vehicle|truck|suv|travel|trip|mileage|home office/.test(normalized) ? 0.5 : 1;
  const deductibleAmount = amount * businessUseShare;
  const taxSavings = Math.round(deductibleAmount * (toNumber(state.baseline.tax.combinedTaxRate) / 100));
  const useNote = businessUseShare < 1
    ? "PAM assumes 50% business use for mixed-use costs like car, mileage, travel, or home office."
    : "PAM assumes this is fully business-related based on the wording.";

  return {
    isPotentiallyDeductible: true,
    deductibleAmount,
    taxSavings,
    note: `${useNote} Actual deductibility depends on business purpose, records, and current tax rules.`
  };
}

function inferDecision(question) {
  const normalized = question.toLowerCase();
  const amounts = collectAmounts(question);
  const firstAmount = amounts[0]?.amount || 0;
  const monthlyAmount = parseMonthlyAmount(question);
  const decision = {
    type: "Financial decision",
    monthlyImpact: 0,
    oneTimeImpact: 0,
    taxImpact: "No direct change",
    taxSavingsMonthly: 0,
    taxSavingsOneTime: 0,
    deductibleNote: "",
    compoundMonthlyDelta: 0,
    assumptions: []
  };

  if (/1099|freelance|contractor|self[- ]?employ|side hustle/.test(normalized)) {
    decision.type = "Employment / tax change";
    const baselineView = getUiBaseline(state.baseline);
    const newGross = monthlyAmount || firstAmount || baselineView.grossMonthlyIncome;
    const taxProfile = estimateTaxProfile({
      ...state.baseline,
      profile: {
        ...state.baseline.profile,
        employmentStatus: "1099"
      },
      income: {
        ...state.baseline.income,
        grossMonthlyIncome: newGross,
        knownTakeHomeMonthlyIncome: null
      },
      tax: {
        ...state.baseline.tax,
        taxRateOverride: false
      }
    });
    decision.monthlyImpact = taxProfile.takeHomeIncome - getSpendableIncome(state.baseline);
    decision.taxImpact = `Estimated combined tax rate changes to ${taxProfile.combinedTaxRate}%. Self-employment taxes may require setting aside more cash.`;
    decision.assumptions.push({ label: "Modeled income", value: `${formatCurrency(newGross)}/month gross` });
    decision.assumptions.push({ label: "Employment status", value: "1099 / self-employed" });
    return decision;
  }

  if (/invest|compound|retire|ira|roth|saving early|start saving/.test(normalized)) {
    decision.type = "Saving / investing decision";
    decision.monthlyImpact = -(monthlyAmount || firstAmount || 200);
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.taxImpact = /roth|ira|retire/.test(normalized)
      ? "Tax-advantaged accounts may matter, but eligibility and contribution rules depend on income and regulations."
      : "No direct tax change unless contributions affect taxable income.";
    decision.assumptions.push({ label: "Monthly contribution", value: `${formatCurrency(Math.abs(decision.monthlyImpact))}/month` });
    return decision;
  }

  if (/rent|move|apartment|lease|housing/.test(normalized)) {
    decision.type = "Housing decision";
    const estimatedCurrentRent = Math.round(getMonthlyExpenses(state.baseline) * 0.55);
    const newRent = monthlyAmount || firstAmount || 1800;
    decision.monthlyImpact = -(Math.max(newRent - estimatedCurrentRent, 0));
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.assumptions.push({ label: "New rent", value: `${formatCurrency(newRent)}/month` });
    decision.assumptions.push({ label: "Estimated current housing", value: `${formatCurrency(estimatedCurrentRent)}/month` });
    decision.taxImpact = "No direct change";
    return decision;
  }

  if (/car|auto|vehicle|truck|suv|payment/.test(normalized)) {
    decision.type = "Car purchase";
    const modeledMonthlyCost = monthlyAmount || firstAmount || 400;
    const deduction = inferPotentialDeduction(question, modeledMonthlyCost, "monthly");
    decision.monthlyImpact = -modeledMonthlyCost;
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.taxSavingsMonthly = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "Car payment / ownership cost", value: `${formatCurrency(Math.abs(decision.monthlyImpact))}/month` });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: `${formatCurrency(decision.taxSavingsMonthly)}/month` });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsMonthly)}/month. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  if (/trip|travel|vacation|emergency|repair|medical|bill|wedding|expense/.test(normalized)) {
    decision.type = /trip|travel|vacation/.test(normalized) ? "Trip / travel spend" : "One-time expense";
    const modeledCost = firstAmount || 2500;
    const deduction = inferPotentialDeduction(question, modeledCost);
    decision.oneTimeImpact = -modeledCost;
    decision.taxSavingsOneTime = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(Math.abs(decision.oneTimeImpact)) });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: formatCurrency(decision.taxSavingsOneTime) });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsOneTime)}. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  if (firstAmount) {
    const deduction = inferPotentialDeduction(question, firstAmount);
    decision.type = "One-time decision";
    decision.oneTimeImpact = -firstAmount;
    decision.taxSavingsOneTime = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(firstAmount) });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: formatCurrency(decision.taxSavingsOneTime) });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsOneTime)}. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  decision.assumptions.push({ label: "Decision shape", value: "PAM needs a dollar amount for a sharper estimate." });
  return decision;
}

function getRisk(newBuffer) {
  if (newBuffer > 750) return { label: "Low", className: "risk-low" };
  if (newBuffer >= 250) return { label: "Medium", className: "risk-medium" };
  return { label: "High", className: "risk-high" };
}

function formatMonths(months) {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function estimateCompoundGrowth(monthlyContribution, years = 10, annualReturn = 0.06) {
  if (monthlyContribution <= 0) return 0;
  const monthlyReturn = annualReturn / 12;
  const months = years * 12;
  return monthlyContribution * (((1 + monthlyReturn) ** months - 1) / monthlyReturn);
}

function estimateCompoundOpportunity(monthlyContribution, age, annualReturn = 0.1, retirementAge = 65) {
  if (monthlyContribution <= 0 || !hasValue(age)) return null;
  const years = Math.max(retirementAge - toNumber(age), 0);
  if (years <= 0) return null;
  const futureValue = estimateCompoundGrowth(monthlyContribution, years, annualReturn);
  return {
    years,
    retirementAge,
    annualReturn,
    futureValue
  };
}

function getTopConnectedExpenses(baseline, limit = 3) {
  const recurring = Array.isArray(baseline?.expenses?.recurringExpenses) ? baseline.expenses.recurringExpenses : [];
  return recurring
    .slice()
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))
    .slice(0, limit);
}

function getConnectedSnapshot(baseline) {
  return {
    source: baseline.source,
    profile: baseline.profile,
    income: baseline.income,
    expenses: {
      monthlyExpenses: baseline.expenses?.monthlyExpenses,
      recurringExpenses: getTopConnectedExpenses(baseline, 5)
    },
    obligations: baseline.obligations,
    savings: baseline.savings,
    tax: baseline.tax,
    goals: baseline.goals
  };
}

async function requestDecisionGuidance(question, result) {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: question,
      baseline: getConnectedSnapshot(state.baseline),
      result
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    return null;
  }

  return payload;
}

async function runDecisionAnalysis(question, statusMessage = "Decision analyzed locally using your current baseline.") {
  saveQuestion(question);
  saveWorkspaceView("dashboard");
  state.result = analyzeQuestion(question);
  state.aiGuidance = null;
  state.status = `${statusMessage} PAM advisor is refining the explanation...`;
  render();

  try {
    const guidance = await requestDecisionGuidance(question, state.result);
    if (guidance?.guidance) {
      state.aiGuidance = guidance;
      state.status = "Decision analyzed with your baseline and server-side AI guidance.";
    } else {
      state.status = statusMessage;
    }
  } catch (_error) {
    state.status = statusMessage;
  }

  render();
}

function analyzeQuestion(question) {
  const decision = inferDecision(question);
  const currentBuffer = getMonthlyBuffer(state.baseline);
  const taxAdjustedMonthlyImpact = decision.monthlyImpact + decision.taxSavingsMonthly;
  const taxAdjustedOneTimeImpact = decision.oneTimeImpact + decision.taxSavingsOneTime;
  const newBuffer = currentBuffer + taxAdjustedMonthlyImpact;
  const currentSavings = getCurrentSavings(state.baseline);
  const goalTargetAmount = toNumber(state.baseline.goals.goalTargetAmount, 0);
  const projectedSavings12 = currentSavings + taxAdjustedOneTimeImpact + newBuffer * 12;
  const risk = getRisk(newBuffer);
  const monthlyGoalPace = Math.max(currentBuffer, 1);
  const newGoalPace = Math.max(newBuffer, 1);
  const currentGoalMonths = Math.max(Math.ceil(Math.max(goalTargetAmount - currentSavings, 0) / monthlyGoalPace), 0);
  const newGoalMonths = Math.max(Math.ceil(Math.max(goalTargetAmount - (currentSavings + taxAdjustedOneTimeImpact), 0) / newGoalPace), 0);
  const goalDelay = Math.max(newGoalMonths - currentGoalMonths, 0);
  const compoundGrowth = estimateCompoundGrowth(decision.compoundMonthlyDelta);
  const compoundOpportunity = estimateCompoundOpportunity(decision.compoundMonthlyDelta, state.baseline.profile.age);
  const explanation = risk.label === "Low"
    ? "This looks workable, but PAM still checks whether it slows your goal or reduces your safety margin."
    : risk.label === "Medium"
      ? "You can afford it on paper, but your monthly buffer becomes tighter."
      : "This decision pushes your buffer below a safe target. PAM would suggest changing the timing, income, or cost before moving forward.";
  const topExpense = getTopConnectedExpenses(state.baseline, 1)[0];
  const mostImpactedGoal = getGoalLabel(state.baseline) || "your main goal";
  const runwayMonths = newBuffer > 0
    ? "stable"
    : Math.max(Math.floor((currentSavings + taxAdjustedOneTimeImpact) / Math.abs(newBuffer || 1)), 0);
  const sandboxInsight = state.baseline.source.startsWith("plaid")
    ? topExpense
      ? `Connected data suggests ${topExpense.name.toLowerCase()} is one of your biggest recurring costs at about ${formatCurrency(topExpense.amount)}/month.`
      : "Connected data is shaping the baseline behind this outcome."
    : "Manual or fallback baseline is shaping this outcome.";

  return {
    question,
    decision,
    currentBuffer,
    newBuffer,
    projectedSavings12,
    taxAdjustedMonthlyImpact,
    taxAdjustedOneTimeImpact,
    risk,
    goalDelay,
    currentGoalMonths,
    newGoalMonths,
    compoundGrowth,
    compoundOpportunity,
    explanation,
    runwayMonths,
    sandboxInsight,
    mostImpactedGoal
  };
}

function readBaselineForm(form) {
  const formData = new FormData(form);
  const baseline = getUiBaseline(state.baseline);
  const fieldNumber = (key) => formData.has(key) ? toNumber(formData.get(key)) : baseline[key];
  return {
    firstName: String(formData.get("firstName") || baseline.firstName),
    emailAddress: String(formData.get("emailAddress") || baseline.emailAddress),
    age: formData.has("age") ? toNumber(formData.get("age")) : baseline.age,
    grossMonthlyIncome: fieldNumber("grossMonthlyIncome"),
    knownTakeHomeMonthlyIncome: fieldNumber("knownTakeHomeMonthlyIncome"),
    employmentStatus: String(formData.get("employmentStatus") || baseline.employmentStatus),
    stateCode: String(formData.get("stateCode") || baseline.stateCode),
    combinedTaxRate: fieldNumber("combinedTaxRate"),
    taxRateOverride: formData.has("taxRateOverride") ? formData.get("taxRateOverride") === "on" : baseline.taxRateOverride,
    monthlyExpenses: fieldNumber("monthlyExpenses"),
    monthlyObligations: fieldNumber("monthlyObligations"),
    currentSavings: fieldNumber("currentSavings"),
    retirementContributions: fieldNumber("retirementContributions"),
    deductions: fieldNumber("deductions"),
    longTermGoal: String(formData.get("longTermGoal") || baseline.longTermGoal),
    customGoalLabel: String(formData.get("customGoalLabel") || baseline.customGoalLabel),
    goalTargetAmount: fieldNumber("goalTargetAmount"),
    goalTimelineMonths: fieldNumber("goalTimelineMonths")
  };
}

async function handleCreateAccount(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const firstName = String(formData.get("firstName") || "").trim();
  const emailAddress = String(formData.get("emailAddress") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const age = hasValue(formData.get("age")) ? toNumber(formData.get("age"), null) : null;
  const employmentStatus = String(formData.get("employmentStatus") || "Not sure yet");
  const stateCode = String(formData.get("stateCode") || "OTHER");

  if (!firstName || !emailAddress || !password) {
    state.status = "Add your first name, email, and password before PAM creates the account shell.";
    render();
    return;
  }

  if (password.length < 8) {
    state.status = "Use at least 8 characters for the prototype password.";
    render();
    return;
  }

  if (password !== confirmPassword) {
    state.status = "Your password confirmation does not match yet.";
    render();
    return;
  }

  const { payload } = await requestJson("/api/account/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      firstName,
      emailAddress,
      password,
      age,
      employmentStatus,
      stateCode
    })
  });

  if (!payload?.ok) {
    state.status = payload?.error || "Unable to create account.";
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  saveBaseline(syncAccountIntoBaseline(payload.account, state.baseline));
  state.aiGuidance = null;
  state.status = "Account created. Connect a Sandbox account next to unlock the dashboard.";
  saveAuthView("signin");
  saveWorkspaceView("account");
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const emailAddress = String(formData.get("loginEmailAddress") || "").trim();
  const password = String(formData.get("loginPassword") || "");

  if (!emailAddress || !password) {
    state.status = "Add your email and password to sign in.";
    render();
    return;
  }

  const { payload } = await requestJson("/api/account/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailAddress,
      password
    })
  });

  if (!payload?.ok) {
    state.status = payload?.error || "Unable to sign in.";
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  saveBaseline(syncAccountIntoBaseline(payload.account, state.baseline));
  state.aiGuidance = null;
  state.status = "Signed in. Connect Sandbox data to finish your dashboard.";
  saveAuthView("signin");
  saveWorkspaceView("account");
  render();
}

function handleAuthModeClick(event) {
  const nextView = event.currentTarget.dataset.authMode || "create";
  saveAuthView(nextView);
  state.status = "";
  render();
}

async function handleSandboxSampleData() {
  if (!hasPrototypeAccount()) {
    state.status = "Create your account first, then load Sandbox data.";
    render();
    return;
  }
  const sandboxPayload = loadSandboxFallback(state.baseline);
  saveBaseline(sandboxPayload.baseline);
  state.status = sandboxPayload.status;
  state.inlineGoalError = "";
  if (hasCompletedBaseline(state.baseline)) {
    await runDecisionAnalysis(state.question, sandboxPayload.status);
    return;
  }
  render();
}

async function handleConnectSandboxAccount() {
  if (!hasPrototypeAccount()) {
    state.status = "Create your account first, then connect Sandbox data.";
    render();
    return;
  }
  state.plaidBusy = true;
  state.status = "Connecting Sandbox account...";
  render();

  try {
    const payload = await connectSandboxAccount(state.baseline.profile);
    saveBaseline(payload.baseline);
    state.status = payload.status;
    state.inlineGoalError = "";
    await runDecisionAnalysis(state.question, payload.status);
  } catch (_error) {
    const fallbackPayload = loadSandboxFallback(state.baseline);
    saveBaseline(fallbackPayload.baseline);
    state.status = fallbackPayload.status;
    state.inlineGoalError = "";
    await runDecisionAnalysis(state.question, fallbackPayload.status);
  } finally {
    state.plaidBusy = false;
    render();
  }
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  if (!canAccessDashboard()) {
    saveWorkspaceView("account");
    state.result = null;
    state.aiGuidance = null;
    state.status = "Connect Sandbox data first so PAM can calculate this against your real inputs.";
    render();
    return;
  }
  await runDecisionAnalysis(question);
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openWorkspaceView(view) {
  if (view === "dashboard" && !canAccessDashboard()) {
    saveWorkspaceView(hasPrototypeAccount() ? "account" : "landing");
    state.status = hasPrototypeAccount()
      ? "Connect Sandbox data before opening the dashboard."
      : "Create an account before opening the dashboard.";
  }
  else {
    saveWorkspaceView(view);
  }
  render();
  requestAnimationFrame(() => {
    scrollToSection("#workspace-panel");
  });
}

function renderHero() {
  const isComplete = canAccessDashboard();
  return `
    <section class="pam-hero foresee-panel">
      <div class="panel-kicker">PAM AI • Personal Asset Manager</div>
      <h1>Know what happens before you decide.</h1>
      <p>
        PAM AI helps young adults see how money decisions affect their monthly buffer, savings, taxes, risk,
        compound growth, and long-term goals.
      </p>
      <div class="pam-hero-actions">
        <button class="button button-primary" type="button" data-open-view="${isComplete ? "dashboard" : "account"}">${isComplete ? "Open dashboard" : hasPrototypeAccount() ? "Finish setup" : "Create your account"}</button>
        <button class="button button-secondary" type="button" data-open-view="landing">Overview</button>
      </div>
      <div class="pam-proof-grid">
        <div><span>Flow</span><strong>Create account, connect Sandbox, land on home</strong></div>
        <div><span>Version one</span><strong>Young adults</strong></div>
        <div><span>Product</span><strong>Financial decision engine</strong></div>
      </div>
    </section>
  `;
}

function renderEducationSections() {
  return `
    <section class="foresee-panel split-section" id="how-it-works">
      <div>
        <div class="panel-kicker">How PAM works</div>
        <h2>Create your account, connect Sandbox data, then test real decisions.</h2>
      </div>
      <p>PAM is not trying to be a budgeting tracker. It builds a baseline from your connected Sandbox data, then uses that baseline to answer what happens if you rent, spend, save, invest, switch work types, or take on a new obligation.</p>
    </section>
  `;
}

function renderAccountPreview() {
  const baseline = getUiBaseline(state.baseline);
  const tax = estimateTaxProfile(state.baseline);
  const isComplete = canAccessDashboard();
  const valueOrPending = (value, formatter = (item) => item) => hasValue(value) ? formatter(value) : "Not provided";
  const goalLabel = getGoalLabel(state.baseline);
  return `
    <aside class="cash-flow-preview ${isComplete ? "" : "incomplete-preview"}">
      <div class="panel-kicker">${isComplete ? "Baseline ready" : "Setup in progress"}</div>
      <h3>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} PAM baseline` : "Profile draft only"}</h3>
      <p>${isComplete ? "PAM now has enough information to model decisions against your profile." : "PAM will show a baseline only after income, taxes, spending, savings, and a goal are provided."}</p>
      <div class="cash-flow-preview-grid">
        <div><span>Baseline source</span><strong>${escapeHtml(baseline.source === "plaid_sandbox" ? "Sandbox account" : baseline.source === "plaid_mock" ? "Sandbox-style sample data" : "Manual baseline")}</strong><small>Prototype data is saved only in this browser.</small></div>
        <div class="preview-card preview-card-account"><span>Signed in on this device</span><strong>${hasValue(baseline.emailAddress) ? escapeHtml(baseline.emailAddress) : "Not provided"}</strong><small>Prototype sign-in only for this version.</small></div>
        <div><span>Age</span><strong>${valueOrPending(baseline.age)}</strong><small>Used for time horizon and retirement runway.</small></div>
        <div><span>Gross income</span><strong>${valueOrPending(baseline.grossMonthlyIncome, formatCurrency)}</strong><small>Before tax and deductions.</small></div>
        <div><span>Spendable income</span><strong>${isComplete ? formatCurrency(baseline.takeHomeIncome) : "Pending"}</strong><small>${hasValue(baseline.knownTakeHomeMonthlyIncome) ? "Known take-home is used directly." : "PAM estimates this from income, state, taxes, and work type."}</small></div>
        <div><span>Estimated income tax</span><strong>${hasValue(baseline.estimatedIncomeTaxRate) ? `${baseline.estimatedIncomeTaxRate}%` : "Pending"}</strong><small>Federal and state income tax estimate.</small></div>
        <div><span>Payroll tax</span><strong>${hasValue(baseline.payrollTaxRate) ? `${baseline.payrollTaxRate}%` : "Pending"}</strong><small>Payroll or self-employment tax estimate.</small></div>
        <div><span>Combined tax/payroll</span><strong>${hasValue(baseline.combinedTaxRate) ? `${baseline.combinedTaxRate}%` : "Pending"}</strong><small>Overall estimate, not advice.</small></div>
        <div><span>Monthly buffer</span><strong>${isComplete ? formatCurrency(getMonthlyBuffer(state.baseline)) : "Pending"}</strong><small>Spendable income minus spending commitments.</small></div>
        <div><span>Savings</span><strong>${valueOrPending(baseline.currentSavings, formatCurrency)}</strong><small>Cash runway PAM can protect.</small></div>
        <div class="preview-card preview-card-goal"><span>Goal</span><strong>${hasValue(goalLabel) ? escapeHtml(goalLabel) : "Not provided"}</strong><small>${baseline.goalTargetEstimated || baseline.goalTimelineEstimated ? "PAM estimated part of this goal." : "No assumed goal."}</small></div>
      </div>
      <p>${escapeHtml(tax.note)}</p>
    </aside>
  `;
}

function renderSetupTermGuide() {
  return `
    <div class="term-guide">
      <div>
        <strong>Monthly buffer</strong>
        <span>Money left after taxes, spending, obligations, and retirement contributions.</span>
      </div>
      <div>
        <strong>Obligations</strong>
        <span>Payments you cannot easily skip, like debt, insurance, tuition, or family support.</span>
      </div>
      <div>
        <strong>Goal delay</strong>
        <span>How much a decision may push back the goal you chose.</span>
      </div>
      <div>
        <strong>Deductible cost</strong>
        <span>A business-related expense that may reduce taxable income, not a guaranteed refund.</span>
      </div>
    </div>
  `;
}

function renderWorkspaceHub() {
  const isComplete = canAccessDashboard();
  const goalLabel = getGoalLabel(state.baseline);
  const baseline = getUiBaseline(state.baseline);
  return `
    <section class="foresee-panel workspace-panel" id="workspace-panel">
      <div class="workspace-header">
        <div>
          <div class="panel-kicker">Workspace</div>
          <h2>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} dashboard` : hasPrototypeAccount() ? "Finish setup" : "Create your account"}</h2>
          <p>${isComplete ? `Connected baseline ready for ${escapeHtml(goalLabel)}.` : hasPrototypeAccount() ? "Connect Sandbox data to unlock the dashboard." : "Create an account, then connect Sandbox data."}</p>
        </div>
        ${hasPrototypeAccount() ? `<div class="workspace-account-chip"><strong>${escapeHtml(baseline.firstName || "Account")}</strong><span>${escapeHtml(baseline.emailAddress)}</span></div>` : ""}
      </div>
      <div class="workspace-tabs" role="tablist" aria-label="PAM views">
        ${[
          { id: "landing", label: "Overview" },
          { id: "account", label: hasPrototypeAccount() ? "Account" : "Create account" },
          { id: "dashboard", label: "Dashboard", disabled: !canAccessDashboard() }
        ].map((item) => `
          <button
            class="workspace-tab ${state.workspaceView === item.id ? "active" : ""}"
            type="button"
            data-open-view="${item.id}"
            role="tab"
            aria-selected="${state.workspaceView === item.id ? "true" : "false"}"
            ${item.disabled ? "disabled" : ""}
          >${item.label}</button>
        `).join("")}
      </div>
      <div class="workspace-active-view">
        ${state.workspaceView === "landing" ? renderLandingWorkspace() : ""}
        ${state.workspaceView === "account" ? renderBaselinePanel() : ""}
        ${state.workspaceView === "dashboard" ? renderDashboardWorkspace() : ""}
      </div>
    </section>
  `;
}

function renderLandingWorkspace() {
  return `
    <div class="workspace-guide-grid compact-workspace-view">
      ${renderEducationSections()}
      ${renderHowItWorksSteps()}
    </div>
  `;
}

function renderDashboardWorkspace() {
  if (!canAccessDashboard()) {
    return `
      <section class="foresee-panel result-panel locked-result">
        <div class="result-header">
          <div>
            <div class="panel-kicker">Dashboard locked</div>
            <h2>Create an account and connect Sandbox data first.</h2>
          </div>
        </div>
        <p>PAM only opens the dashboard after a real account session exists and the connected baseline is complete.</p>
      </section>
    `;
  }

  return `
    <div class="workspace-guide-grid compact-workspace-view" id="dashboard-section">
      ${renderAccountPreview()}
      ${renderConnectedInsights()}
      <div class="workspace-grid-simulator" id="decision-input">
        ${renderDecisionPanel()}
        ${renderResult()}
      </div>
    </div>
  `;
}

function renderConnectedInsights() {
  if (!state.baseline.source.startsWith("plaid")) return "";
  const topExpenses = getTopConnectedExpenses(state.baseline, 3);
  const incomeStreams = state.baseline.income?.incomeStreams || [];
  const liabilities = state.baseline.obligations?.liabilities || [];

  return `
    <section class="foresee-panel">
      <div class="panel-kicker">Connected baseline</div>
      <h2>Your Sandbox data is feeding PAM.</h2>
      <div class="feature-grid">
        <article><h3>Detected income</h3><p>${incomeStreams[0] ? `${formatCurrency(incomeStreams[0].amount)}/month from connected deposits.` : "No recurring income pattern detected yet."}</p></article>
        <article><h3>Largest recurring costs</h3><p>${topExpenses.length ? topExpenses.map((item) => `${item.name} ${formatCurrency(item.amount)}`).join(" • ") : "No recurring expenses detected yet."}</p></article>
        <article><h3>Debt obligations</h3><p>${liabilities.length ? `${liabilities.length} connected liabilities totaling about ${formatCurrency(getMonthlyObligations(state.baseline))}/month.` : "No liabilities detected from connected data."}</p></article>
      </div>
    </section>
  `;
}

function renderBaselinePanel() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = canAccessDashboard();
  const account = state.account || {};
  const isSignedIn = hasPrototypeAccount();
  return `
    <section class="baseline-panel account-setup-panel compact-workspace-view" id="baseline-section">
      <div class="panel-kicker">Account setup</div>
      <h2>${isSignedIn ? "Finish your PAM setup." : "Create your account."}</h2>
      <div class="onboarding-layout">
        <div class="baseline-form onboarding-form sandbox-connect-panel">
          ${isSignedIn ? `
            <div class="account-status-card">
              <div class="account-status-main">
                <div class="panel-kicker">Signed in</div>
                <h3>${escapeHtml(account.firstName || baseline.firstName || "Your")} account is ready.</h3>
                <p>${escapeHtml(account.emailAddress || baseline.emailAddress || "")}</p>
              </div>
              <div class="account-status-meta">
                <span>${escapeHtml(account.employmentStatus || baseline.employmentStatus || "Not sure yet")}</span>
                <span>${escapeHtml(account.stateCode || baseline.stateCode || "OTHER")}</span>
              </div>
            </div>
            <div class="connect-actions-header">
              <h3>${isComplete ? "Dashboard ready." : "Connect Sandbox data to unlock your dashboard."}</h3>
              <p>PAM will build your financial baseline from Sandbox balances, transactions, and liabilities.</p>
            </div>
            <div class="connect-action-grid">
              <button class="button button-primary" type="button" data-connect-sandbox ${state.plaidBusy ? "disabled" : ""}>${state.plaidBusy ? "Connecting..." : "Connect Sandbox account"}</button>
              <button class="button button-secondary" type="button" data-load-sandbox ${state.plaidBusy ? "disabled" : ""}>Use Sandbox-style sample data</button>
            </div>
            <div class="form-actions">
              <button class="button button-secondary" type="button" data-reset-baseline>Reset baseline</button>
              <button class="button button-secondary" type="button" data-logout>Sign out</button>
            </div>
          ` : `
            <div class="auth-shell">
              <div class="auth-switcher" role="tablist" aria-label="Account access">
                <button class="auth-switch ${state.authView === "create" ? "active" : ""}" type="button" data-auth-mode="create" role="tab" aria-selected="${state.authView === "create" ? "true" : "false"}">Create account</button>
                <button class="auth-switch ${state.authView === "signin" ? "active" : ""}" type="button" data-auth-mode="signin" role="tab" aria-selected="${state.authView === "signin" ? "true" : "false"}">Sign in</button>
              </div>
              ${state.authView === "create" ? `
                <div class="auth-card">
                  <div class="auth-card-copy">
                    <h3>Set up your PAM account.</h3>
                    <p>Email and password get you back into your profile. Age, work type, and state help PAM frame decisions better from day one.</p>
                  </div>
                  <form class="profile-form" data-account-form>
                    <div class="onboarding-field-grid">
                      <label><span>First name</span><small>Used for your homepage and account label.</small><input type="text" name="firstName" value="${escapeHtml(account.firstName || baseline.firstName)}" placeholder="Maya" autocomplete="given-name" /></label>
                      <label><span>Email</span><small>Your sign-in email for this prototype.</small><input type="email" name="emailAddress" value="${escapeHtml(account.emailAddress || baseline.emailAddress)}" placeholder="you@example.com" autocomplete="email" /></label>
                      <label><span>Password</span><small>Use at least 8 characters.</small><input type="password" name="password" value="" placeholder="At least 8 characters" autocomplete="new-password" /></label>
                      <label><span>Confirm password</span><small>Re-enter the same password once.</small><input type="password" name="confirmPassword" value="" placeholder="Repeat password" autocomplete="new-password" /></label>
                      <label><span>Age</span><small>Optional. Helps PAM estimate runway and compounding time.</small><input type="number" name="age" value="${hasValue(account.age) ? account.age : baseline.age}" min="18" max="35" step="1" placeholder="24" /></label>
                      <label>
                        <span>Employment type</span>
                        <small>Used to frame taxes, deductions, and income structure.</small>
                        <select name="employmentStatus">
                          ${["W-2 employee", "1099 / self-employed", "Student worker", "Mixed income", "Not sure yet"].map((option) => `<option value="${option}" ${String(account.employmentStatus || baseline.employmentStatus) === option ? "selected" : ""}>${option}</option>`).join("")}
                        </select>
                      </label>
                      <label class="onboarding-wide">
                        <span>State</span>
                        <small>Optional now. PAM can refine tax assumptions later.</small>
                        <select name="stateCode">
                          ${["OTHER", "CA", "NY", "NJ", "MA", "IL", "PA", "TX", "FL", "WA", "NV", "TN"].map((option) => `<option value="${option}" ${String(account.stateCode || baseline.stateCode || "OTHER") === option ? "selected" : ""}>${option}</option>`).join("")}
                        </select>
                      </label>
                    </div>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Create account</button>
                    </div>
                  </form>
                </div>
              ` : `
                <div class="auth-card">
                  <div class="auth-card-copy">
                    <h3>Welcome back.</h3>
                    <p>Sign in with the email and password you already used for PAM. Once your Sandbox baseline is connected, PAM brings you right back to your homepage.</p>
                  </div>
                  <form class="profile-form" data-login-form>
                    <div class="credential-row">
                      <label><span>Email</span><small>Use the same email you registered with.</small><input type="email" name="loginEmailAddress" placeholder="you@example.com" autocomplete="email" /></label>
                      <label><span>Password</span><small>Your PAM password.</small><input type="password" name="loginPassword" placeholder="Password" autocomplete="current-password" /></label>
                    </div>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Sign in</button>
                    </div>
                  </form>
                </div>
              `}
              <div class="auth-aside">
                <div>
                  <span>Why create an account</span>
                  <strong>So PAM remembers your profile and brings you back to your homepage.</strong>
                </div>
                <div>
                  <span>What comes next</span>
                  <strong>Connect Sandbox data once, then run decisions from your saved baseline.</strong>
                </div>
                <div>
                  <span>Prototype note</span>
                  <strong>Real production-grade auth and permanent cloud storage come next.</strong>
                </div>
              </div>
            </div>
          `}
        </div>
        ${renderAccountPreview()}
      </div>
      <p class="disclaimer">Educational estimate only. Not financial, tax, legal, or investment advice.</p>
    </section>
  `;
}

function renderDecisionPanel() {
  return `
    <section class="foresee-panel decision-panel" id="decision-input">
      <div class="panel-kicker">Decision simulator</div>
      <h2>Ask a financial question</h2>
      <p>Run one decision at a time. PAM estimates the outcome from your baseline.</p>
      <form class="foresee-question-form" data-question-form>
        <label for="pam-question">Ask a financial question</label>
        <textarea id="pam-question" name="question" rows="4" placeholder="Can I afford to move out if rent is $1,800?">${escapeHtml(state.question)}</textarea>
        <button class="button button-primary" type="submit">Analyze decision</button>
      </form>
      <div class="quick-question-row">
        ${[
          "What happens if I go on a $2,500 trip?",
          "Can I buy a car with a $400/month payment?",
          "Can I deduct a $1,200 laptop for freelance work?",
          "What if I invest $200/month?",
          "How would freelance income affect my taxes?",
          "Will this delay my emergency fund goal?",
          "What happens if I switch from W-2 to 1099 work?"
        ].map((prompt) => `<button type="button" data-question-example="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
      </div>
      ${state.status ? `<p class="foresee-status">${escapeHtml(state.status)}</p>` : ""}
    </section>
  `;
}

function renderResult() {
  if (!canAccessDashboard()) {
    return `
      <section class="foresee-panel result-panel locked-result">
      <div class="result-header">
        <div>
          <div class="panel-kicker">Result locked</div>
          <h2>Create your account and connect Sandbox data first.</h2>
        </div>
      </div>
      <p>PAM will not fake a homepage or pretend to know your finances. Create the account shell first, then connect Sandbox data so the decision engine has a real baseline to work from.</p>
    </section>
  `;
  }
  const result = state.result || analyzeQuestion(state.question);
  state.result = result;
  const goalLabel = getGoalLabel(state.baseline);
  return `
    <section class="foresee-panel result-panel">
      <div class="result-header">
        <div>
          <div class="panel-kicker">Result</div>
          <h2>Decision outcome</h2>
        </div>
        <span class="risk-badge ${result.risk.className}">${result.risk.label} risk</span>
      </div>
      <div class="result-section">
        <h3>PAM interpreted your decision as</h3>
        <div class="assumption-grid-foresee">
          <div><span>Decision type</span><strong>${escapeHtml(result.decision.type)}</strong></div>
          <div><span>Monthly impact</span><strong>${formatSignedCurrency(result.decision.monthlyImpact)}</strong></div>
          <div><span>One-time impact</span><strong>${formatSignedCurrency(result.decision.oneTimeImpact)}</strong></div>
          ${(result.decision.taxSavingsMonthly || result.decision.taxSavingsOneTime) ? `<div><span>Estimated tax offset</span><strong>${result.decision.taxSavingsMonthly ? `${formatCurrency(result.decision.taxSavingsMonthly)}/month` : formatCurrency(result.decision.taxSavingsOneTime)}</strong></div>` : ""}
          ${(result.decision.taxSavingsMonthly || result.decision.taxSavingsOneTime) ? `<div><span>Tax-adjusted impact</span><strong>${result.decision.taxSavingsMonthly ? `${formatSignedCurrency(result.taxAdjustedMonthlyImpact)}/month` : formatSignedCurrency(result.taxAdjustedOneTimeImpact)}</strong></div>` : ""}
          ${result.decision.assumptions.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
        </div>
      </div>
      <div class="result-section">
        <h3>Your outcome</h3>
        <div class="outcome-grid">
          <div><span>New monthly buffer</span><strong>${formatCurrency(result.newBuffer)}</strong><small>Before: ${formatCurrency(result.currentBuffer)}</small></div>
          <div><span>Projected savings, 12 months</span><strong>${formatCurrency(result.projectedSavings12)}</strong></div>
          <div><span>Risk</span><strong>${result.risk.label}</strong></div>
          <div><span>Goal timeline</span><strong>${formatMonths(result.newGoalMonths)}</strong></div>
          <div><span>Cash runway</span><strong>${typeof result.runwayMonths === "number" ? formatMonths(result.runwayMonths) : "Stable"}</strong></div>
          <div><span>Most impacted goal</span><strong>${escapeHtml(result.mostImpactedGoal)}</strong></div>
        </div>
      </div>
      ${state.aiGuidance?.guidance ? `
        <div class="result-section advisor-box">
          <h3>PAM advisor</h3>
          <p><strong>${escapeHtml(state.aiGuidance.guidance.assistant.headline)}</strong></p>
          <p>${escapeHtml(state.aiGuidance.guidance.assistant.body)}</p>
          <p>${escapeHtml(state.aiGuidance.guidance.interpretationSummary)}</p>
          ${state.aiGuidance.guidance.followUpPrompt ? `<p><strong>Next question:</strong> ${escapeHtml(state.aiGuidance.guidance.followUpPrompt)}</p>` : ""}
          ${state.aiGuidance.guidance.followUpChoiceLabels.length ? `<div class="quick-question-row">${state.aiGuidance.guidance.followUpChoiceLabels.map((label) => `<button type="button" data-question-example="${escapeHtml(`${state.question} ${label}`)}">${escapeHtml(label)}</button>`).join("")}</div>` : ""}
        </div>
      ` : ""}
      <div class="result-section explanation-box">
        <h3>Tax impact</h3>
        <p>${escapeHtml(result.decision.taxImpact)}</p>
        <h3>Long-term goal impact</h3>
        <p>${result.goalDelay ? `This delays ${escapeHtml(goalLabel.toLowerCase())} by about ${formatMonths(result.goalDelay)}.` : `This does not delay ${escapeHtml(goalLabel.toLowerCase())} in this estimate.`}</p>
        <h3>Connected baseline insight</h3>
        <p>${escapeHtml(result.sandboxInsight)}</p>
        <h3>Compound growth impact</h3>
        <p>${result.compoundOpportunity ? `If you redirected ${formatCurrency(result.decision.compoundMonthlyDelta)}/month into a long-term investment earning a hypothetical 10% average annual return, it could grow to about ${formatCurrency(result.compoundOpportunity.futureValue)} by age ${result.compoundOpportunity.retirementAge}. If this were held in a Roth-style account and eligibility rules were met, qualified withdrawals may be tax-free. Educational estimate only, not guaranteed.` : result.compoundGrowth ? `If invested monthly, this could hypothetically grow to about ${formatCurrency(result.compoundGrowth)} over 10 years at a 6% assumed annual return. Not guaranteed.` : "No direct compound-growth impact detected for this decision."}</p>
        <h3>Explanation</h3>
        <p>${escapeHtml(result.explanation)}</p>
        <p class="disclaimer">Educational estimate only. Not financial, tax, legal, or investment advice.</p>
      </div>
    </section>
  `;
}

function renderHowItWorksSteps() {
  return `
    <section class="foresee-panel">
      <div class="panel-kicker">How it works</div>
      <h2>From account to decision.</h2>
      <div class="steps-grid">
        <div><strong>1</strong><span>Create your account with email, password, age, and work type</span></div>
        <div><strong>2</strong><span>Connect Sandbox data or load sample data</span></div>
        <div><strong>3</strong><span>PAM builds your baseline from balances, transactions, and liabilities</span></div>
        <div><strong>4</strong><span>Ask a financial question</span></div>
        <div><strong>5</strong><span>PAM shows tax, goal, buffer, and compound-growth tradeoffs</span></div>
        <div><strong>6</strong><span>Return later and land back on your homepage</span></div>
      </div>
    </section>
  `;
}

function render() {
  if (!app) return;
  app.innerHTML = `
    <div class="foresee-shell">
      <header class="foresee-header">
        <a class="foresee-brand" href="/">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <div class="foresee-truth">
          <strong>${hasPrototypeAccount() ? "Signed in prototype" : "Public homepage"}</strong>
          <span>${canAccessDashboard() ? "Dashboard unlocked" : "Create account to unlock dashboard"}</span>
        </div>
      </header>
      <main class="pam-homepage">
        ${renderHero()}
        ${renderWorkspaceHub()}
      </main>
    </div>
  `;
  wireInteractions();
}

function wireInteractions() {
  document.querySelector("[data-account-form]")?.addEventListener("submit", handleCreateAccount);
  document.querySelector("[data-login-form]")?.addEventListener("submit", handleLogin);
  document.querySelector("[data-question-form]")?.addEventListener("submit", handleQuestionSubmit);
  document.querySelector("[data-reset-baseline]")?.addEventListener("click", resetBaseline);
  document.querySelector("[data-logout]")?.addEventListener("click", logoutAccount);
  document.querySelector("[data-load-sandbox]")?.addEventListener("click", handleSandboxSampleData);
  document.querySelector("[data-connect-sandbox]")?.addEventListener("click", handleConnectSandboxAccount);
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => scrollToSection(button.dataset.scrollTarget));
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => openWorkspaceView(button.dataset.openView || "account"));
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", handleAuthModeClick);
  });
  document.querySelectorAll("[data-question-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.questionExample || "";
      if (canAccessDashboard()) {
        runDecisionAnalysis(question, "Example prompt analyzed. You can edit it and run another scenario.");
      } else {
        saveQuestion(question);
        saveWorkspaceView("account");
        state.result = null;
        state.aiGuidance = null;
        state.status = "Prompt saved. Finish account setup first so PAM can analyze it against your baseline.";
        render();
      }
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  await restoreSessionAccount();
  if (hasPrototypeAccount()) {
    const baseline = syncAccountIntoBaseline(state.account, state.baseline);
    saveBaseline(baseline);
  }
  if (canAccessDashboard()) {
    saveWorkspaceView("dashboard");
  } else if (hasPrototypeAccount()) {
    saveWorkspaceView("account");
  } else {
    saveWorkspaceView("landing");
  }
  state.result = canAccessDashboard() ? analyzeQuestion(state.question) : null;
  render();
}
