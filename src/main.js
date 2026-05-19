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
const TELEMETRY_SESSION_KEY = "pam:telemetry-session:v1";
const CREATE_ACCOUNT_STEPS = [
  {
    key: "firstName",
    label: "What should PAM call you?",
    detail: "",
    type: "text",
    placeholder: "Maya",
    required: true,
    autocomplete: "given-name"
  },
  {
    key: "emailAddress",
    label: "What email should you sign in with?",
    detail: "",
    type: "email",
    placeholder: "you@example.com",
    required: true,
    autocomplete: "email"
  },
  {
    key: "verificationCode",
    label: "Enter the verification code",
    detail: "",
    type: "text",
    placeholder: "123456",
    required: true,
    autocomplete: "one-time-code"
  },
  {
    key: "password",
    label: "Create a password",
    detail: "",
    type: "password",
    placeholder: "At least 8 characters",
    required: true,
    autocomplete: "new-password"
  },
  {
    key: "confirmPassword",
    label: "Confirm your password",
    detail: "",
    type: "password",
    placeholder: "Repeat password",
    required: true,
    autocomplete: "new-password"
  },
  {
    key: "age",
    label: "How old are you?",
    detail: "",
    type: "number",
    placeholder: "24",
    required: false,
    min: "18",
    max: "35",
    step: "1"
  },
  {
    key: "employmentStatus",
    label: "What is your main source of income?",
    detail: "",
    type: "select",
    required: true,
    options: ["W-2 employee", "1099 / self-employed", "Student worker", "Mixed income", "Not sure yet"]
  },
  {
    key: "stateCode",
    label: "What state should PAM start with?",
    detail: "",
    type: "select",
    required: false,
    options: ["OTHER", "CA", "NY", "NJ", "MA", "IL", "PA", "TX", "FL", "WA", "NV", "TN"]
  },
  {
    key: "review",
    label: "Review your account",
    detail: "",
    type: "review",
    required: false
  }
];

const state = {
  baseline: loadStoredBaseline(),
  account: null,
  sessionToken: loadSessionToken(),
  workspaceView: loadWorkspaceView(),
  authView: loadAuthView(),
  createAccountStep: 0,
  accountDraft: null,
  question: loadQuestion(),
  result: null,
  aiGuidance: null,
  status: "",
  statusScope: "",
  inlineGoalError: "",
  waitlistOpen: false,
  waitlistJoined: false,
  waitlistMessage: "",
  verificationPreviewCode: "",
  verificationWarning: "",
  verificationMaskedEmail: "",
  verificationExpiresAt: "",
  plaidBusy: false
};

let isStarted = false;

function getTelemetrySessionId() {
  try {
    const existing = localStorage.getItem(TELEMETRY_SESSION_KEY);
    if (existing) return existing;
    const nextId = crypto?.randomUUID ? crypto.randomUUID() : `pam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(TELEMETRY_SESSION_KEY, nextId);
    return nextId;
  } catch (_error) {
    return "pam-anonymous";
  }
}

function trackEvent(eventName, properties = {}, eventType = "product") {
  const body = JSON.stringify({
    eventType,
    eventName,
    sessionId: getTelemetrySessionId(),
    page: window.location.pathname || "/",
    properties
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry", blob);
      return;
    }

    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  } catch (_error) {
    // Telemetry should never interrupt the decision engine.
  }
}

function setStatus(message, scope = "account") {
  state.status = message;
  state.statusScope = message ? scope : "";
}

function clearStatus(scope = "") {
  if (!scope || state.statusScope === scope) {
    state.status = "";
    state.statusScope = "";
  }
}

function getStatus(scope) {
  return state.statusScope === scope ? state.status : "";
}

function saveBaseline(baseline) {
  state.baseline = persistBaseline(baseline);
}

function getInitialAccountDraft() {
  const baseline = getUiBaseline(state.baseline);
  const account = state.account || {};
  return {
    firstName: String(account.firstName || baseline.firstName || ""),
    emailAddress: String(account.emailAddress || baseline.emailAddress || ""),
    verificationCode: "",
    verificationRequestId: "",
    verificationToken: "",
    password: "",
    confirmPassword: "",
    age: hasValue(account.age) ? String(account.age) : hasValue(baseline.age) ? String(baseline.age) : "",
    employmentStatus: String(account.employmentStatus || baseline.employmentStatus || "Not sure yet"),
    stateCode: String(account.stateCode || baseline.stateCode || "OTHER")
  };
}

function ensureAccountDraft() {
  if (!state.accountDraft) {
    state.accountDraft = getInitialAccountDraft();
  }
  return state.accountDraft;
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

function getCreateAccountStepConfig(stepIndex = state.createAccountStep) {
  return CREATE_ACCOUNT_STEPS[Math.max(0, Math.min(stepIndex, CREATE_ACCOUNT_STEPS.length - 1))];
}

function saveCurrentStepValue(form) {
  const draft = ensureAccountDraft();
  const step = getCreateAccountStepConfig();
  if (!form || !step) return draft;
  const value = form.elements.namedItem(step.key)?.value ?? "";
  const previousValue = String(draft[step.key] || "");
  draft[step.key] = String(value);
  if (step.key === "emailAddress" && String(value) !== previousValue) {
    draft.verificationCode = "";
    draft.verificationRequestId = "";
    draft.verificationToken = "";
    state.verificationPreviewCode = "";
    state.verificationWarning = "";
    state.verificationMaskedEmail = "";
    state.verificationExpiresAt = "";
  }
  return draft;
}

function validateAccountStep(stepIndex = state.createAccountStep, draft = ensureAccountDraft()) {
  const step = getCreateAccountStepConfig(stepIndex);
  const value = String(draft[step.key] || "").trim();

  if (step.required && !value) {
    return `Add ${step.label.toLowerCase()} before continuing.`;
  }

  if (step.key === "password" && value && value.length < 8) {
    return "Use at least 8 characters for the prototype password.";
  }

  if (step.key === "confirmPassword" && value !== String(draft.password || "")) {
    return "Passwords don't match.";
  }

  if (step.key === "verificationCode") {
    if (!draft.verificationRequestId) {
      return "Code is still sending. Try again in a moment.";
    }
    if (!/^\d{6}$/.test(value)) {
      return "Enter the 6-digit verification code.";
    }
  }

  return "";
}

function resetBaseline() {
  state.baseline = clearStoredBaseline();
  if (state.account) {
    saveBaseline(syncAccountIntoBaseline(state.account, getEmptyBaseline()));
  }
  saveWorkspaceView("account");
  setStatus("Baseline reset. Connect Sandbox data again when ready.", "account");
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
  try {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);
    return { response, payload, error: null };
  } catch (error) {
    return {
      response: null,
      payload: null,
      error: error instanceof Error ? error.message : "Network request failed."
    };
  }
}

async function restoreSessionAccount() {
  if (!state.sessionToken) return null;
  const { payload, error } = await requestJson(`/api/account/session?sessionToken=${encodeURIComponent(state.sessionToken)}`);
  if (error) {
    setStatus("Could not confirm your saved session. Try again in a moment.", "account");
    return state.account;
  }
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
  state.accountDraft = null;
  state.verificationPreviewCode = "";
  state.verificationWarning = "";
  state.verificationMaskedEmail = "";
  state.verificationExpiresAt = "";
  saveWorkspaceView("landing");
  clearStatus();
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

function getConnectedAccounts(baseline) {
  return Array.isArray(baseline?.savings?.connectedAccounts) ? baseline.savings.connectedAccounts : [];
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
  trackEvent("decision_analyzed", {
    source: state.baseline.source || "unknown",
    hasQuestion: Boolean(question),
    risk: state.result?.risk?.label || ""
  });
  setStatus(`${statusMessage} PAM advisor is refining the explanation...`, "decision");
  render();

  try {
    const guidance = await requestDecisionGuidance(question, state.result);
    if (guidance?.guidance) {
      state.aiGuidance = guidance;
      setStatus("Decision analyzed with your baseline and server-side AI guidance.", "decision");
    } else {
      setStatus(statusMessage, "decision");
    }
  } catch (_error) {
    setStatus(statusMessage, "decision");
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
  saveCurrentStepValue(event.currentTarget);
  const draft = ensureAccountDraft();
  const firstName = String(draft.firstName || "").trim();
  const emailAddress = String(draft.emailAddress || "").trim();
  const verificationCode = String(draft.verificationCode || "").trim();
  const verificationRequestId = String(draft.verificationRequestId || "").trim();
  const verificationToken = String(draft.verificationToken || "").trim();
  const password = String(draft.password || "");
  const confirmPassword = String(draft.confirmPassword || "");
  const age = hasValue(draft.age) ? toNumber(draft.age, null) : null;
  const employmentStatus = String(draft.employmentStatus || "Not sure yet");
  const stateCode = String(draft.stateCode || "OTHER");

  if (!firstName || !emailAddress || !password) {
    setStatus("Add your first name, email, and password before PAM creates the account shell.", "account");
    render();
    return;
  }

  if (password.length < 8) {
    setStatus("Use at least 8 characters for the prototype password.", "account");
    render();
    return;
  }

  if (password !== confirmPassword) {
    setStatus("Passwords don't match.", "account");
    render();
    return;
  }

  const { payload, error } = await requestJson("/api/account/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      firstName,
      emailAddress,
      verificationCode,
      verificationRequestId,
      verificationToken,
      password,
      age,
      employmentStatus,
      stateCode
    })
  });

  if (error || !payload?.ok) {
    const message = payload?.error || error || "Unable to create account.";
    if (/fresh verification|verification expired|expired/i.test(message)) {
      draft.verificationCode = "";
      draft.verificationRequestId = "";
      draft.verificationToken = "";
      state.createAccountStep = CREATE_ACCOUNT_STEPS.findIndex((step) => step.key === "verificationCode");
      setStatus("Code expired. Sending a new one.", "account");
      render();
      await handleSendVerificationCode({ quiet: true });
      return;
    }
    setStatus(message, "account");
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  saveBaseline(syncAccountIntoBaseline(payload.account, state.baseline));
  state.aiGuidance = null;
  state.accountDraft = getInitialAccountDraft();
  state.createAccountStep = 0;
  state.verificationPreviewCode = "";
  state.verificationWarning = "";
  state.verificationMaskedEmail = "";
  state.verificationExpiresAt = "";
  setStatus("Account created. Connect Sandbox data next.", "account");
  saveAuthView("signin");
  saveWorkspaceView("account");
  trackEvent("account_created", {
    stateCode,
    employmentStatus
  });
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const emailAddress = String(formData.get("loginEmailAddress") || "").trim();
  const password = String(formData.get("loginPassword") || "");

  if (!emailAddress || !password) {
    setStatus("Add your email and password to sign in.", "account");
    render();
    return;
  }

  const { payload, error } = await requestJson("/api/account/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailAddress,
      password
    })
  });

  if (error || !payload?.ok) {
    setStatus(payload?.error || error || "Unable to sign in.", "account");
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  saveBaseline(syncAccountIntoBaseline(payload.account, state.baseline));
  state.aiGuidance = null;
  setStatus("Signed in. Connect Sandbox data to finish your dashboard.", "account");
  saveAuthView("signin");
  saveWorkspaceView("account");
  trackEvent("account_signed_in", {
    stateCode: payload.account?.stateCode || "",
    employmentStatus: payload.account?.employmentStatus || ""
  });
  render();
}

async function handleSendVerificationCode(options = {}) {
  const { quiet = false } = options;
  const draft = ensureAccountDraft();
  const emailAddress = String(draft.emailAddress || "").trim();
  const firstName = String(draft.firstName || "").trim();

  if (!emailAddress) {
    if (!quiet) {
      setStatus("Add your email first.", "account");
      render();
    }
    return;
  }

  const { payload, error } = await requestJson("/api/account/request-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailAddress,
      firstName
    })
  });

  if (error || !payload?.ok) {
    setStatus(payload?.error || error || "Could not send code.", "account");
    render();
    return;
  }

  draft.verificationRequestId = String(payload.requestId || "");
  draft.verificationToken = String(payload.verificationToken || "");
  state.verificationMaskedEmail = String(payload.maskedEmail || emailAddress);
  state.verificationPreviewCode = String(payload.previewCode || "");
  state.verificationWarning = String(payload.warning || "");
  state.verificationExpiresAt = String(payload.expiresAt || "");
  setStatus(payload.deliveryMode === "prototype_preview" ? "Code ready." : "Code sent.", "account");
  render();
}

function handleAuthModeClick(event) {
  const nextView = event.currentTarget.dataset.authMode || "create";
  saveAuthView(nextView);
  if (nextView === "create") {
    ensureAccountDraft();
  }
  if (nextView !== "create") {
    state.verificationPreviewCode = "";
    state.verificationWarning = "";
    state.verificationMaskedEmail = "";
    state.verificationExpiresAt = "";
  }
  clearStatus("account");
  render();
}

async function handleCreateAccountNext(event) {
  const form = event.currentTarget.closest("form");
  saveCurrentStepValue(form);
  const error = validateAccountStep();
  if (error) {
    setStatus(error, "account");
    render();
    return;
  }
  state.createAccountStep = Math.min(state.createAccountStep + 1, CREATE_ACCOUNT_STEPS.length - 1);
  clearStatus("account");
  const nextStep = getCreateAccountStepConfig();
  const draft = ensureAccountDraft();
  if (nextStep.key === "verificationCode" && !draft.verificationRequestId) {
    setStatus("Sending code.", "account");
    render();
    await handleSendVerificationCode({ quiet: true });
    return;
  }
  render();
}

function handleCreateAccountBack(event) {
  const form = event.currentTarget.closest("form");
  saveCurrentStepValue(form);
  state.createAccountStep = Math.max(state.createAccountStep - 1, 0);
  clearStatus("account");
  render();
}

function handleCreateAccountSubmitClick(event) {
  const form = event.currentTarget.closest("form");
  form?.requestSubmit();
}

async function handleSandboxSampleData() {
  if (!hasPrototypeAccount()) {
    setStatus("Create your account first, then load Sandbox data.", "account");
    render();
    return;
  }
  const sandboxPayload = loadSandboxFallback(state.baseline);
  saveBaseline(sandboxPayload.baseline);
  setStatus(sandboxPayload.status, "account");
  state.inlineGoalError = "";
  if (hasCompletedBaseline(state.baseline)) {
    await runDecisionAnalysis(state.question, sandboxPayload.status);
    return;
  }
  render();
}

async function handleConnectSandboxAccount() {
  if (!hasPrototypeAccount()) {
    setStatus("Create your account first, then connect Sandbox data.", "account");
    render();
    return;
  }
  state.plaidBusy = true;
  setStatus("Connecting Sandbox account...", "account");
  render();

  try {
    const payload = await connectSandboxAccount(state.baseline.profile);
    saveBaseline(payload.baseline);
    setStatus(payload.status, "account");
    state.inlineGoalError = "";
    await runDecisionAnalysis(state.question, payload.status);
  } catch (error) {
    const fallbackPayload = loadSandboxFallback(state.baseline);
    saveBaseline(fallbackPayload.baseline);
    setStatus(error instanceof Error && error.message
      ? `${error.message} ${fallbackPayload.status}`
      : fallbackPayload.status, "account");
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
    setStatus("Connect Sandbox data first so PAM can calculate this against your real inputs.", "account");
    render();
    return;
  }
  await runDecisionAnalysis(question);
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function isWaitlistRoute() {
  return ["/newsletter", "/waitlist"].includes(window.location.pathname);
}

const WAITLIST_FOUNDING_NOTE =
  "Hey — you're in. We'll email you the moment PAM launches with a direct link to sign up. As an early member you'll lock in our founding price of $7.99/month permanently. We're building something that actually helps you make smarter money decisions. Stay tuned. — The PAM AI team";

function handleSectionScroll(target) {
  if (!target) return;
  if (target === "#baseline-section") {
    saveWorkspaceView("account");
    render();
    requestAnimationFrame(() => scrollToSection(target));
    return;
  }
  if (!document.querySelector(target) && state.workspaceView !== "landing") {
    saveWorkspaceView("landing");
    render();
    requestAnimationFrame(() => scrollToSection(target));
    return;
  }
  scrollToSection(target);
}

function openWorkspaceView(view) {
  if (view === "dashboard" && !canAccessDashboard()) {
    saveWorkspaceView(hasPrototypeAccount() ? "account" : "landing");
    setStatus(hasPrototypeAccount()
      ? "Connect Sandbox data before opening the dashboard."
      : "Create an account before opening the dashboard.", "account");
  }
  else {
    saveWorkspaceView(view);
  }
  render();
  if (view !== "account") {
    requestAnimationFrame(() => {
      scrollToSection("#workspace-panel");
    });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderHero() {
  const isComplete = canAccessDashboard();
  return `
    <section class="pam-hero foresee-panel">
      <div class="hero-copy">
        <div class="panel-kicker">PAM AI • Personal Asset Manager</div>
        <h1>Know what happens before you decide.</h1>
        <p>
          PAM AI models your money decisions before you make them, so you can see the impact on your
          monthly buffer, taxes, savings, risk, and long-term goals before you commit.
        </p>
        <div class="pam-hero-actions">
          <button class="button button-primary" type="button" data-open-view="${isComplete ? "dashboard" : "account"}">${isComplete ? "Open dashboard" : "Create your account"}</button>
          <button class="button button-secondary" type="button" data-open-waitlist>Join waitlist</button>
          <button class="button button-secondary" type="button" data-scroll-target="#how-it-works">Learn how it works</button>
        </div>
        <p class="founding-note">Free to join. Early members lock in founding pricing forever.</p>
      </div>
      <div class="hero-preview-card" aria-label="PAM AI product preview">
        <div class="preview-window-bar">
          <strong>PAM dashboard</strong>
          <span>Decision mode</span>
        </div>
        <div class="preview-advisor-note">
          <span>Question</span>
          <strong>Can I buy a car with a $400/month payment?</strong>
        </div>
        <div class="preview-metric-row">
          <div><span>Monthly buffer</span><strong>$1,270 → $870</strong></div>
          <div><span>Risk</span><strong>Medium</strong></div>
        </div>
        <div class="preview-chart" aria-hidden="true">
          <span style="height: 44%"></span>
          <span style="height: 58%"></span>
          <span style="height: 50%"></span>
          <span style="height: 74%"></span>
          <span style="height: 63%"></span>
          <span style="height: 42%"></span>
        </div>
        <div class="preview-goal-callout">
          <span>Goal impact</span>
          <strong>Moving out delayed by 6-9 months</strong>
        </div>
      </div>
    </section>
  `;
}

function renderEducationSections() {
  return `
    <section class="foresee-panel split-section" id="positioning">
      <div>
        <div class="panel-kicker">Before wealth management</div>
        <h2>Built for people before wealth management.</h2>
      </div>
      <p>Traditional financial advisors and premium wealth platforms are built for people who already have significant money to manage. PAM starts earlier. It helps young adults make smarter first decisions around income, rent, cars, taxes, saving, investing, and independence.</p>
    </section>
  `;
}

function renderPlanningModules() {
  const modules = [
    ["decisions", "Decisions", "Test choices like rent, cars, trips, job changes, and big purchases."],
    ["taxes", "Taxes", "Understand estimated tax impact, W-2 vs 1099 income, deductions, and take-home pay."],
    ["goals", "Goals", "See whether a decision delays goals like moving out, emergency savings, or investing."],
    ["growth", "Growth", "Model compound interest and long-term saving/investing tradeoffs."],
    ["cash-flow", "Cash Flow", "Understand monthly buffer, expenses, obligations, and runway."],
    ["guidance", "Guidance", "Get plain-English explanations without needing a spreadsheet or financial advisor."]
  ];

  return `
    <section class="foresee-panel modules-section" id="planning-modules">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">Planning modules</div>
          <h2>Everything your financial future needs, in one place.</h2>
        </div>
        <p>PAM organizes the moving pieces of a young adult financial life into one decision engine.</p>
      </div>
      <div class="module-card-grid">
        ${modules.map(([id, title, copy]) => `
          <article class="module-card" id="${id}">
            <span>${title}</span>
            <p>${copy}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDecisionDemo() {
  return `
    <section class="foresee-panel product-demo-section" id="decision-input">
      <div class="demo-copy">
        <div class="panel-kicker">Decision engine</div>
        <h2>A preview of how PAM turns a question into a plan.</h2>
        <p>PAM is not a chatbot thread. It interprets the decision, runs deterministic math, and shows the tradeoff clearly.</p>
        <button class="button button-primary" type="button" data-open-view="account">Start with your baseline</button>
      </div>
      <div class="advisor-demo-window">
        <div class="demo-window-header">
          <strong>PAM analysis</strong>
          <span>Example</span>
        </div>
        <div class="demo-question">“Can I buy a car with a $400/month payment?”</div>
        <div class="demo-result-grid">
          <div><span>Monthly impact</span><strong>-$400</strong></div>
          <div><span>Risk</span><strong>Medium</strong></div>
          <div><span>Goal impact</span><strong>Delays moving out by 6-9 months</strong></div>
          <div><span>Tax impact</span><strong>No direct change</strong></div>
        </div>
        <p>You can afford it, but your monthly buffer becomes tighter and your moving-out goal slows down.</p>
      </div>
    </section>
  `;
}

function renderExamplesSection() {
  return `
    <section class="foresee-panel example-stack-section">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">Examples</div>
          <h2>From decision to consequence.</h2>
        </div>
      </div>
      <div class="example-stack-grid">
        <article class="decision-example-card">
          <span>Question</span>
          <h3>“Can I buy a car with a $400/month payment?”</h3>
          <ul>
            <li><strong>Monthly impact:</strong> -$400</li>
            <li><strong>Risk:</strong> Medium</li>
            <li><strong>Goal impact:</strong> This delays moving out by 6-9 months.</li>
            <li><strong>Tax impact:</strong> No direct change.</li>
          </ul>
          <p>You can afford it, but your monthly buffer becomes tighter and your moving-out goal slows down.</p>
        </article>
        <article class="decision-example-card">
          <span>Question</span>
          <h3>“What if I invest $200/month instead of spending it?”</h3>
          <ul>
            <li><strong>Monthly impact:</strong> -$200</li>
            <li><strong>Compound growth:</strong> Hypothetical projection based on assumptions.</li>
            <li><strong>Goal impact:</strong> Improves long-term savings.</li>
            <li><strong>Disclaimer:</strong> Educational estimate only. Not financial, tax, legal, or investment advice.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderFutureIntegrations() {
  return `
    <section class="foresee-panel split-section integrations-section">
      <div>
        <div class="panel-kicker">Future integrations</div>
        <h2>Automatic baselines later. Clear decisions now.</h2>
      </div>
      <p>Future versions can connect financial accounts and automatically build a baseline from income, balances, recurring expenses, and liabilities. For now, Sandbox data keeps the prototype decision-focused without making integrations the homepage story.</p>
    </section>
  `;
}

function renderPricingModel() {
  const tiers = [
    ["Free", ["Manual baseline", "Basic decision simulations", "Goal delay estimates"]],
    ["Premium", ["More scenarios", "Tax and compound growth modules", "Saved goals", "Comparison planning"]],
    ["Future", ["Account integrations", "School/employer financial wellness partnerships", "Advisor/expert review options later"]]
  ];

  return `
    <section class="foresee-panel pricing-section">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">Business model</div>
          <h2>Affordable guidance before you can afford an advisor.</h2>
        </div>
        <button class="button button-secondary" type="button" data-open-waitlist>Join waitlist</button>
      </div>
      <div class="pricing-grid">
        ${tiers.map(([name, items]) => `
          <article class="pricing-card">
            <h3>${name}</h3>
            <ul>
              ${items.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAccountPreview() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = canAccessDashboard();
  const goalLabel = getGoalLabel(state.baseline);
  const cards = [];

  if (hasValue(baseline.emailAddress)) {
    cards.push({
      label: "Account",
      value: escapeHtml(baseline.emailAddress),
      className: "preview-card preview-card-account"
    });
  }

  if (hasValue(baseline.age)) {
    cards.push({ label: "Age", value: baseline.age });
  }

  if (!isComplete && hasValue(baseline.grossMonthlyIncome)) {
    cards.push({ label: "Gross income", value: formatCurrency(baseline.grossMonthlyIncome) });
  }

  if (isComplete) {
    cards.push({ label: "Spendable income", value: formatCurrency(baseline.takeHomeIncome) });
  }

  if (isComplete) {
    cards.push({ label: "Monthly buffer", value: formatCurrency(getMonthlyBuffer(state.baseline)) });
  }

  if (hasValue(baseline.currentSavings)) {
    cards.push({ label: "Savings", value: formatCurrency(baseline.currentSavings) });
  }

  if (hasValue(goalLabel)) {
    cards.push({
      label: "Goal",
      value: escapeHtml(goalLabel),
      className: "preview-card preview-card-goal"
    });
  }

  return `
    <aside class="cash-flow-preview ${isComplete ? "" : "incomplete-preview"}">
      <div class="panel-kicker">${isComplete ? "Baseline" : "Profile"}</div>
      <h3>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} homepage` : "Draft"}</h3>
      <div class="cash-flow-preview-grid">
        ${cards.map((card) => `
          <div class="${card.className || ""}">
            <span>${card.label}</span>
            <strong>${card.value}</strong>
          </div>
        `).join("")}
      </div>
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
  const baseline = getUiBaseline(state.baseline);
  return `
    <section class="foresee-panel workspace-panel" id="workspace-panel">
      <div class="workspace-header">
        <div>
          <div class="panel-kicker">Workspace</div>
          <h2>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} dashboard` : hasPrototypeAccount() ? "Finish setup" : "Create your account"}</h2>
        </div>
        ${hasPrototypeAccount() ? `<div class="workspace-account-chip"><strong>${escapeHtml(baseline.firstName || "Account")}</strong><span>${escapeHtml(baseline.emailAddress)}</span></div>` : ""}
      </div>
      <div class="workspace-tabs" role="tablist" aria-label="PAM views">
        ${[
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
        ${state.workspaceView === "account" ? renderBaselinePanel() : ""}
        ${state.workspaceView === "dashboard" ? renderDashboardWorkspace() : ""}
      </div>
    </section>
  `;
}

function renderAccountPage() {
  return `
    <section class="auth-page-shell">
      <div class="auth-page-frame">
        <div class="auth-page-brand">
          <button class="auth-page-back" type="button" data-open-view="landing">Back to homepage</button>
          <div>
            <div class="panel-kicker">PAM account</div>
            <h1>${hasPrototypeAccount() ? "Finish your setup." : "Create your account."}</h1>
          </div>
        </div>
        ${renderWorkspaceHub()}
      </div>
    </section>
  `;
}

function renderLandingWorkspace() {
  return `
    <div class="workspace-guide-grid compact-workspace-view">
      ${renderEducationSections()}
      ${renderPlanningModules()}
      ${renderDecisionDemo()}
      ${renderHowItWorksSteps()}
      ${renderExamplesSection()}
      ${renderFutureIntegrations()}
      ${renderPricingModel()}
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
      </section>
    `;
  }

  return `
    <div class="workspace-guide-grid compact-workspace-view" id="dashboard-section">
      ${renderDailyDashboardHome()}
      ${renderConnectedInsights()}
      <div class="workspace-grid-simulator">
        ${renderDecisionPanel()}
        ${renderResult()}
      </div>
    </div>
  `;
}

function getProgressPercent(current, target) {
  const safeTarget = Math.max(toNumber(target), 1);
  return Math.max(4, Math.min(100, Math.round((toNumber(current) / safeTarget) * 100)));
}

function renderDailyDashboardHome() {
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const topExpenses = getTopConnectedExpenses(state.baseline, 4);
  const liabilities = state.baseline.obligations?.liabilities || [];
  const currentSavings = getCurrentSavings(state.baseline);
  const monthlyBuffer = getMonthlyBuffer(state.baseline);
  const monthlyExpenses = getMonthlyExpenses(state.baseline);
  const obligations = getMonthlyObligations(state.baseline);
  const investmentBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("investment"))
    .reduce((sum, account) => sum + Number(account.current || 0), 0);
  const checkingBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("checking"))
    .reduce((sum, account) => sum + Number(account.available ?? account.current ?? 0), 0);
  const netWorth = Math.max(currentSavings + checkingBalance + investmentBalance - obligations * 18, 0);
  const goalLabel = getGoalLabel(state.baseline) || "Move-out fund";
  const goalTarget = Math.max(toNumber(state.baseline.goals.goalTargetAmount), currentSavings + 1);
  const emergencyTarget = Math.max(Math.round(monthlyExpenses * 3), 1);
  const retirementStarter = Math.max(Math.round((investmentBalance || 1800) / 0.3), 6000);
  const spendingPlan = Math.max(monthlyExpenses + 120, 1);
  const spendingPercent = Math.min(100, Math.round((monthlyExpenses / spendingPlan) * 100));
  const underPlan = Math.max(spendingPlan - monthlyExpenses, 0);
  const chartPoints = [30, 34, 42, 48, 57, 66, 78, 92];
  const askPrompts = [
    "Can I afford a $400 car payment?",
    "Am I on track to move out this year?",
    "Should I start a Roth IRA now?"
  ];
  const expenseRows = topExpenses.length ? topExpenses : [
    { name: "Housing", amount: Math.round(monthlyExpenses * 0.46), category: "fixed" },
    { name: "Food & drink", amount: Math.round(monthlyExpenses * 0.2), category: "monthly" },
    { name: "Transport", amount: Math.round(monthlyExpenses * 0.13), category: "monthly" },
    { name: "Other", amount: Math.round(monthlyExpenses * 0.21), category: "flex" }
  ];
  const colors = ["#1e9f78", "#3b82d6", "#c27a13", "#d4507d"];

  return `
    <section class="daily-home-shell" id="daily-home">
      <aside class="daily-column daily-advisor-card">
        <div>
          <div class="panel-kicker">Today</div>
          <h2>Hi ${escapeHtml(ui.firstName || "there")}</h2>
          <p>Here’s what changed in your money.</p>
        </div>
        <div class="daily-update-list">
          <div class="daily-update">
            <span class="daily-icon mint">↗</span>
            <div><strong>Monthly buffer ${monthlyBuffer >= 0 ? "up" : "down"} to ${formatCurrency(monthlyBuffer)}</strong><p>${monthlyBuffer >= 500 ? "You have room to test decisions." : "Keep decisions conservative until buffer improves."}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon blue">⌂</span>
            <div><strong>${escapeHtml(goalLabel)} ${currentSavings >= goalTarget ? "funded" : "in progress"}</strong><p>${formatCurrency(currentSavings)} of ${formatCurrency(goalTarget)}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon amber">▤</span>
            <div><strong>Spending ${formatCurrency(underPlan)} under plan</strong><p>${spendingPercent}% of ${formatCurrency(spendingPlan)} plan used.</p></div>
          </div>
        </div>
        <div class="ask-pam-card">
          <h3>Ask PAM</h3>
          ${askPrompts.map((prompt) => `<button type="button" data-question-example="${escapeHtml(prompt)}">${escapeHtml(prompt)} ↗</button>`).join("")}
          <form class="ask-pam-mini-form" data-question-form>
            <input name="question" placeholder="Ask anything..." />
            <button type="submit" aria-label="Analyze question">↗</button>
          </form>
        </div>
      </aside>

      <div class="daily-main-card">
        <div class="daily-chart-header">
          <div>
            <div class="panel-kicker">Net worth</div>
            <h2>${formatCurrency(netWorth)}</h2>
            <p><strong>↗ ${formatCurrency(Math.max(monthlyBuffer, 0))}</strong> monthly buffer after goals</p>
          </div>
          <div class="daily-range-tabs"><span>1M</span><strong>3M</strong><span>6M</span><span>1Y</span><span>All</span></div>
        </div>
        <div class="daily-chart" aria-hidden="true">
          ${chartPoints.map((point) => `<span style="height:${point}%"></span>`).join("")}
        </div>
        <div class="daily-metric-strip">
          <div><span>Savings</span><strong>${formatCurrency(currentSavings)}</strong><small>${getProgressPercent(currentSavings, netWorth)}% of net worth</small></div>
          <div><span>Checking</span><strong>${formatCurrency(checkingBalance)}</strong><small>Available</small></div>
          <div><span>Monthly buffer</span><strong>${formatCurrency(monthlyBuffer)}</strong><small>After goals</small></div>
        </div>

        <div class="daily-spending-card">
          <div class="spending-header">
            <div><h3>This month’s spending</h3><p>${formatCurrency(monthlyExpenses)} of ${formatCurrency(spendingPlan)} plan · ${spendingPercent}%</p></div>
            <strong>${formatCurrency(underPlan)} under plan</strong>
          </div>
          <div class="spending-list">
            ${expenseRows.slice(0, 4).map((item, index) => `
              <div class="spending-row">
                <span class="spending-dot" style="background:${colors[index % colors.length]}"></span>
                <strong>${escapeHtml(item.name)}</strong>
                <em>${formatCurrency(item.amount)}</em>
                <i><b style="width:${Math.min(100, Math.round((toNumber(item.amount) / spendingPlan) * 100))}%; background:${colors[index % colors.length]}"></b></i>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <aside class="daily-column">
        <div class="daily-side-card">
          <h3>Your goals</h3>
          <div class="goal-row"><strong>${escapeHtml(goalLabel)}</strong><span><b style="width:${getProgressPercent(currentSavings, goalTarget)}%"></b></span><p>${formatCurrency(currentSavings)} of ${formatCurrency(goalTarget)}</p></div>
          <div class="goal-row blue"><strong>Emergency fund</strong><span><b style="width:${getProgressPercent(currentSavings, emergencyTarget)}%"></b></span><p>${formatCurrency(Math.min(currentSavings, emergencyTarget))} of ${formatCurrency(emergencyTarget)}</p></div>
          <div class="goal-row amber"><strong>Roth IRA starter</strong><span><b style="width:${getProgressPercent(investmentBalance || 1800, retirementStarter)}%"></b></span><p>${formatCurrency(investmentBalance || 1800)} of ${formatCurrency(retirementStarter)}</p></div>
        </div>
        <div class="daily-side-card insights-stack">
          <h3>PAM insights</h3>
          <div class="insight-pill good"><strong>On track</strong><p>${escapeHtml(goalLabel)} is moving forward at your current savings rate.</p></div>
          <div class="insight-pill warn"><strong>Watch out</strong><p>A $400 car payment could delay ${escapeHtml(goalLabel.toLowerCase())} by several months.</p></div>
          <div class="insight-pill info"><strong>Opportunity</strong><p>$200/mo invested early could materially change your long-term options.</p></div>
        </div>
        <div class="daily-side-card">
          <h3>Liabilities</h3>
          <p>${liabilities.length ? `${liabilities.length} connected liabilities · ${formatCurrency(getMonthlyObligations(state.baseline))}/mo minimums.` : "No connected liabilities detected."}</p>
          <button type="button" data-question-example="Should I pay down debt faster?">Should I pay these off faster? ↗</button>
        </div>
      </aside>
    </section>
  `;
}

function renderConnectedInsights() {
  if (!state.baseline.source.startsWith("plaid")) return "";
  const topExpenses = getTopConnectedExpenses(state.baseline, 3);
  const incomeStreams = state.baseline.income?.incomeStreams || [];
  const liabilities = state.baseline.obligations?.liabilities || [];
  const connectedAccounts = getConnectedAccounts(state.baseline);

  return `
    <section class="foresee-panel">
      <div class="panel-kicker">Connected baseline</div>
      <h2>Your Sandbox data is feeding PAM.</h2>
      <div class="feature-grid">
        <article><h3>Detected income</h3><p>${incomeStreams[0] ? `${formatCurrency(incomeStreams[0].amount)}/month from connected deposits.` : "No recurring income pattern detected yet."}</p></article>
        <article><h3>Largest recurring costs</h3><p>${topExpenses.length ? topExpenses.map((item) => `${item.name} ${formatCurrency(item.amount)}`).join(" • ") : "No recurring expenses detected yet."}</p></article>
        <article><h3>Debt obligations</h3><p>${liabilities.length ? `${liabilities.length} connected liabilities totaling about ${formatCurrency(getMonthlyObligations(state.baseline))}/month.` : "No liabilities detected from connected data."}</p></article>
      </div>
      ${connectedAccounts.length ? `
        <div class="connected-account-list">
          ${connectedAccounts.map((account) => `
            <div class="connected-account-card">
              <span>${escapeHtml(account.name)}</span>
              <strong>${formatCurrency(account.current)}</strong>
              <small>${escapeHtml(String(account.subtype || account.type || "account").replace(/_/g, " "))}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderDashboardSummary() {
  if (!state.baseline.source.startsWith("plaid")) return "";
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const liabilities = state.baseline.obligations?.liabilities || [];
  const topExpenses = getTopConnectedExpenses(state.baseline, 4);
  const investmentBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("investment"))
    .reduce((sum, account) => sum + Number(account.current || 0), 0);
  const debtBalance = liabilities.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const availableCash = connectedAccounts
    .filter((account) => ["checking", "savings"].includes(account.type))
    .reduce((sum, account) => sum + Number(account.available ?? account.current ?? 0), 0);

  return `
    <section class="foresee-panel">
      <div class="panel-kicker">Dashboard snapshot</div>
      <h2>${state.baseline.source === "plaid_mock" ? "Sandbox sample data is enough to power a mock dashboard." : "Your connected Sandbox accounts are shaping the dashboard."}</h2>
      <div class="outcome-grid dashboard-metric-grid">
        <div><span>Connected accounts</span><strong>${connectedAccounts.length}</strong><small>Checking, savings, credit, and investing can all flow in here.</small></div>
        <div><span>Available cash</span><strong>${formatCurrency(availableCash)}</strong><small>Across connected cash accounts.</small></div>
        <div><span>Protected savings</span><strong>${formatCurrency(getCurrentSavings(state.baseline))}</strong><small>Used for runway and goal protection.</small></div>
        <div><span>Investments</span><strong>${formatCurrency(investmentBalance)}</strong><small>Longer-term accounts connected through Plaid can show up here too.</small></div>
        <div><span>Recurring spend</span><strong>${formatCurrency(getMonthlyExpenses(state.baseline))}</strong><small>Detected from recurring Sandbox transactions.</small></div>
        <div><span>Debt balance</span><strong>${formatCurrency(debtBalance)}</strong><small>${liabilities.length ? `${liabilities.length} liability accounts connected.` : "No liabilities detected."}</small></div>
      </div>
      <div class="connected-dashboard-grid">
        <div class="connected-dashboard-card">
          <h3>Account mix</h3>
          <div class="connected-account-list">
            ${connectedAccounts.map((account) => `
              <div class="connected-account-card">
                <span>${escapeHtml(account.name)}</span>
                <strong>${formatCurrency(account.current)}</strong>
                <small>${escapeHtml(String(account.subtype || account.type || "account").replace(/_/g, " "))}</small>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="connected-dashboard-card">
          <h3>Recurring outflows</h3>
          <div class="connected-account-list">
            ${topExpenses.map((item) => `
              <div class="connected-account-card">
                <span>${escapeHtml(item.name)}</span>
                <strong>${formatCurrency(item.amount)}</strong>
                <small>${escapeHtml(item.category || "monthly")}</small>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
      <p class="disclaimer">${state.baseline.source === "plaid_mock" ? "This is a mock dashboard powered by Sandbox-style sample data." : "This is a mock dashboard powered by Plaid Sandbox data."}</p>
    </section>
  `;
}

function renderBaselinePanel() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = canAccessDashboard();
  const account = state.account || {};
  const isSignedIn = hasPrototypeAccount();
  const draft = ensureAccountDraft();
  const step = getCreateAccountStepConfig();
  const stepValue = String(draft[step.key] || "");
  const isLastStep = state.createAccountStep === CREATE_ACCOUNT_STEPS.length - 1;
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
                  <form class="profile-form auth-wizard-form" data-account-form>
                    <div class="wizard-progress">
                      <span>Step ${state.createAccountStep + 1} of ${CREATE_ACCOUNT_STEPS.length}</span>
                      <strong>${escapeHtml(step.label)}</strong>
                    </div>
                    <label class="wizard-field">
                      <span>${escapeHtml(step.label)}</span>
                      ${step.detail ? `<small>${escapeHtml(step.detail)}</small>` : ""}
                      ${step.type === "review" ? `
                        <div class="review-panel">
                          <div><span>Name</span><strong>${escapeHtml(draft.firstName || "—")}</strong></div>
                          <div><span>Email</span><strong>${escapeHtml(draft.emailAddress || "—")}</strong></div>
                          <div><span>Verification</span><strong>${draft.verificationRequestId && String(draft.verificationCode || "").trim().length === 6 ? "Ready" : "Incomplete"}</strong></div>
                          <div><span>Age</span><strong>${escapeHtml(draft.age || "—")}</strong></div>
                          <div><span>Main income</span><strong>${escapeHtml(draft.employmentStatus || "—")}</strong></div>
                          <div><span>State</span><strong>${escapeHtml(draft.stateCode || "OTHER")}</strong></div>
                        </div>
                      ` : step.type === "select" ? `
                        <select name="${step.key}">
                          ${step.options.map((option) => `<option value="${option}" ${stepValue === option ? "selected" : ""}>${option}</option>`).join("")}
                        </select>
                      ` : `
                        <input
                          type="${step.type}"
                          name="${step.key}"
                          value="${escapeHtml(stepValue)}"
                          placeholder="${escapeHtml(step.placeholder || "")}"
                          ${step.autocomplete ? `autocomplete="${step.autocomplete}"` : ""}
                          ${step.min ? `min="${step.min}"` : ""}
                          ${step.max ? `max="${step.max}"` : ""}
                          ${step.step ? `step="${step.step}"` : ""}
                        />
                      `}
                    </label>
                    ${step.key === "verificationCode" ? `
                      <div class="verification-panel">
                        <div class="verification-copy">
                          ${state.verificationMaskedEmail ? `<span>Sent to ${escapeHtml(state.verificationMaskedEmail)}</span>` : ""}
                          ${state.verificationPreviewCode ? `<strong>Code: ${escapeHtml(state.verificationPreviewCode)}</strong>` : ""}
                          ${state.verificationWarning ? `<span>${escapeHtml(state.verificationWarning)}</span>` : ""}
                        </div>
                        ${draft.verificationRequestId ? `<button class="button button-secondary verification-resend-button" type="button" data-send-verification-code>Resend</button>` : ""}
                      </div>
                    ` : ""}
                    ${getStatus("account") ? `<p class="auth-status-message">${escapeHtml(getStatus("account"))}</p>` : ""}
                    <div class="form-actions">
                      ${state.createAccountStep > 0 ? `<button class="button button-secondary" type="button" data-create-back>Back</button>` : `<button class="button button-secondary" type="button" data-open-view="landing">Cancel</button>`}
                      ${isLastStep
                        ? `<button class="button button-primary" type="button" data-create-submit>Create account</button>`
                        : `<button class="button button-primary" type="button" data-create-next>Continue</button>`}
                    </div>
                  </form>
                </div>
              ` : `
                <div class="auth-card">
                  <form class="profile-form" data-login-form>
                    <div class="credential-row">
                      <label><span>Email</span><input type="email" name="loginEmailAddress" placeholder="you@example.com" autocomplete="email" /></label>
                      <label><span>Password</span><input type="password" name="loginPassword" placeholder="Password" autocomplete="current-password" /></label>
                    </div>
                    ${getStatus("account") ? `<p class="auth-status-message">${escapeHtml(getStatus("account"))}</p>` : ""}
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Sign in</button>
                    </div>
                  </form>
                </div>
              `}
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
      ${getStatus("decision") ? `<p class="foresee-status">${escapeHtml(getStatus("decision"))}</p>` : ""}
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
    <section class="foresee-panel" id="how-it-works">
      <div class="panel-kicker">How it works</div>
      <h2>From account to decision.</h2>
      <div class="steps-grid">
        <div><strong>1</strong><span>Build your baseline</span></div>
        <div><strong>2</strong><span>Ask a financial question</span></div>
        <div><strong>3</strong><span>PAM models the outcome</span></div>
        <div><strong>4</strong><span>See your risk, taxes, buffer, and goal impact</span></div>
        <div><strong>5</strong><span>Compare safer alternatives</span></div>
      </div>
      <p class="disclaimer">Educational estimate only. Not financial, tax, legal, or investment advice.</p>
    </section>
  `;
}

function renderWaitlistModal() {
  if (!state.waitlistOpen) return "";
  return `
    <div class="modal-backdrop" data-close-waitlist>
      <div class="waitlist-modal" role="dialog" aria-modal="true" aria-label="Join PAM waitlist">
        <div class="panel-kicker">PAM newsletter</div>
        <h2>${state.waitlistJoined ? "You're on the list." : "Join the early access list."}</h2>
        <p>${state.waitlistJoined ? escapeHtml(state.waitlistMessage || WAITLIST_FOUNDING_NOTE) : "Get launch access, product updates, and founding pricing."}</p>
        ${state.waitlistJoined ? "" : `<p class="waitlist-founder-note">${escapeHtml(WAITLIST_FOUNDING_NOTE)}</p>`}
        ${state.waitlistJoined ? "" : `
          <form class="profile-form" data-waitlist-form>
            <label><span>Your email</span><input type="email" name="waitlistEmail" placeholder="you@example.com" required /></label>
            <button class="button button-primary" type="submit">Join waitlist</button>
          </form>
        `}
        ${!state.waitlistJoined && state.waitlistMessage ? `<p class="auth-status-message">${escapeHtml(state.waitlistMessage)}</p>` : ""}
        <button class="button button-secondary" type="button" data-close-waitlist-button>Close</button>
      </div>
    </div>
  `;
}

function renderWaitlistPage() {
  return `
    <div class="waitlist-page-shell">
      <header class="waitlist-page-header">
        <a class="foresee-brand" href="/newsletter" aria-label="PAM AI waitlist">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <p>Early access</p>
      </header>
      <main class="waitlist-page-card" aria-labelledby="waitlist-title">
        <section class="waitlist-page-copy">
          <div class="panel-kicker">PAM waitlist</div>
          <h1 id="waitlist-title">${state.waitlistJoined ? "You're on the list." : "Know what happens before you decide."}</h1>
          <p>
            PAM AI helps young adults test financial decisions before making them. Join the founding list for launch access and founding pricing.
          </p>
          <div class="waitlist-proof-grid">
            <div><span>Decision engine</span><strong>Rent, cars, trips, job changes</strong></div>
            <div><span>Future impact</span><strong>Buffer, taxes, savings, goals</strong></div>
            <div><span>Built for</span><strong>Young adults before wealth management</strong></div>
          </div>
        </section>
        <section class="waitlist-page-form-panel" aria-label="Join the PAM waitlist">
          <h2>${state.waitlistJoined ? "Check your inbox." : "Join the early access list."}</h2>
          <p>${state.waitlistJoined ? escapeHtml(state.waitlistMessage || WAITLIST_FOUNDING_NOTE) : "Free to join. Early members lock in founding pricing forever."}</p>
          ${state.waitlistJoined ? "" : `
            <form class="profile-form waitlist-page-form" data-waitlist-form>
              <label><span>Your email</span><input type="email" name="waitlistEmail" placeholder="you@example.com" required /></label>
              <button class="button button-primary" type="submit">Join waitlist</button>
            </form>
          `}
          ${state.waitlistMessage && !state.waitlistJoined ? `<p class="auth-status-message">${escapeHtml(state.waitlistMessage)}</p>` : ""}
        </section>
      </main>
      <p class="waitlist-page-footer">PAM AI is in private build. Waitlist signup does not open the work-in-progress app.</p>
    </div>
  `;
}

function render() {
  if (!app) return;
  if (isWaitlistRoute()) {
    app.innerHTML = renderWaitlistPage();
    wireInteractions();
    return;
  }
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
        <nav class="foresee-nav" aria-label="Homepage sections">
          <button type="button" data-scroll-target="#decision-input">Decisions</button>
          <button type="button" data-scroll-target="#goals">Goals</button>
          <button type="button" data-scroll-target="#taxes">Taxes</button>
          <button type="button" data-scroll-target="#growth">Growth</button>
          <button type="button" data-scroll-target="#how-it-works">How it works</button>
          <button type="button" data-open-waitlist>Newsletter</button>
        </nav>
        <div class="foresee-header-actions">
          <button class="button button-secondary" type="button" data-open-waitlist>Join waitlist</button>
          <button class="button button-primary" type="button" data-open-view="${canAccessDashboard() ? "dashboard" : "account"}">${canAccessDashboard() ? "Open dashboard" : "Create account"}</button>
        </div>
      </header>
      <main class="pam-homepage">
        ${state.workspaceView === "landing"
          ? `${renderHero()}${renderLandingWorkspace()}`
          : state.workspaceView === "account"
            ? renderAccountPage()
            : renderWorkspaceHub()}
      </main>
      ${renderWaitlistModal()}
    </div>
  `;
  wireInteractions();
}

function wireInteractions() {
  document.querySelector("[data-account-form]")?.addEventListener("submit", handleCreateAccount);
  document.querySelector("[data-login-form]")?.addEventListener("submit", handleLogin);
  document.querySelectorAll("[data-question-form]").forEach((form) => {
    form.addEventListener("submit", handleQuestionSubmit);
  });
  document.querySelectorAll("[data-waitlist-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const emailAddress = String(formData.get("waitlistEmail") || "").trim();
    if (!emailAddress) {
      state.waitlistMessage = "Add your email first.";
      render();
      return;
    }
    state.waitlistMessage = "Joining waitlist...";
    render();

    const { payload, error } = await requestJson("/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ emailAddress })
    });

    if (error || !payload?.ok) {
      state.waitlistJoined = false;
      state.waitlistMessage = payload?.error || error || "Could not join the waitlist.";
      render();
      return;
    }

    state.waitlistJoined = true;
    state.waitlistMessage = payload.deliveryMode === "email"
      ? WAITLIST_FOUNDING_NOTE
      : WAITLIST_FOUNDING_NOTE;
    trackEvent("waitlist_joined", {
      deliveryMode: payload.deliveryMode || "",
      stored: payload.stored || ""
    });
    render();
  }));
  document.querySelector("[data-reset-baseline]")?.addEventListener("click", resetBaseline);
  document.querySelector("[data-logout]")?.addEventListener("click", logoutAccount);
  document.querySelector("[data-load-sandbox]")?.addEventListener("click", handleSandboxSampleData);
  document.querySelector("[data-connect-sandbox]")?.addEventListener("click", handleConnectSandboxAccount);
  document.querySelector("[data-create-next]")?.addEventListener("click", handleCreateAccountNext);
  document.querySelector("[data-create-back]")?.addEventListener("click", handleCreateAccountBack);
  document.querySelector("[data-create-submit]")?.addEventListener("click", handleCreateAccountSubmitClick);
  document.querySelector("[data-send-verification-code]")?.addEventListener("click", handleSendVerificationCode);
  document.querySelectorAll("[data-open-waitlist]").forEach((button) => button.addEventListener("click", () => {
    state.waitlistOpen = true;
    state.waitlistMessage = "";
    trackEvent("waitlist_opened");
    render();
  }));
  document.querySelector("[data-close-waitlist-button]")?.addEventListener("click", () => {
    state.waitlistOpen = false;
    render();
  });
  document.querySelector("[data-close-waitlist]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-waitlist]")) {
      state.waitlistOpen = false;
      render();
    }
  });
  document.querySelectorAll("[data-open-waitlist-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.waitlistOpen = true;
      state.waitlistMessage = "";
      trackEvent("waitlist_opened", { source: "direct_link" });
      render();
    });
  });
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => handleSectionScroll(button.dataset.scrollTarget));
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
        setStatus("Prompt saved. Finish account setup first so PAM can analyze it against your baseline.", "account");
        render();
      }
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  window.addEventListener("error", (event) => {
    trackEvent("client_error", {
      message: event.message || "Unknown client error",
      source: event.filename || ""
    }, "error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    trackEvent("client_unhandled_rejection", {
      message: String(event.reason?.message || event.reason || "Unhandled rejection")
    }, "error");
  });
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
  if (["/newsletter", "/waitlist"].includes(window.location.pathname)) {
    saveWorkspaceView("landing");
    state.waitlistOpen = false;
  }
  state.result = canAccessDashboard() ? analyzeQuestion(state.question) : null;
  trackEvent("app_loaded", {
    view: state.workspaceView,
    hasAccount: hasPrototypeAccount(),
    hasDashboard: canAccessDashboard()
  });
  render();
}
