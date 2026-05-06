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
const ACCOUNT_STORAGE_KEY = "pam:account:v1";
const LAST_QUESTION_KEY = "pam-ai-last-question-v2";
const WORKSPACE_VIEW_KEY = "pam-ai-workspace-view-v1";

const state = {
  baseline: loadStoredBaseline(),
  account: loadAccount(),
  workspaceView: loadWorkspaceView(),
  question: loadQuestion(),
  result: null,
  status: "",
  inlineGoalError: "",
  plaidBusy: false
};

let isStarted = false;

function saveBaseline(baseline) {
  state.baseline = persistBaseline(baseline);
}

function loadAccount() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function saveAccount(account) {
  state.account = account;
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } catch (_error) {
    // Prototype account state is helpful, not required.
  }
}

function loadWorkspaceView() {
  if (typeof window === "undefined") return "account";
  const stored = window.localStorage.getItem(WORKSPACE_VIEW_KEY);
  return ["account", "home"].includes(stored || "") ? stored : "account";
}

function saveWorkspaceView(view) {
  state.workspaceView = ["account", "home"].includes(view) ? view : "account";
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_KEY, state.workspaceView);
  } catch (_error) {
    // View persistence is helpful, not required.
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
    explanation
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

function handleCreateAccount(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const firstName = String(formData.get("firstName") || "").trim();
  const emailAddress = String(formData.get("emailAddress") || "").trim();
  const password = String(formData.get("password") || "");
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

  saveAccount({
    firstName,
    emailAddress,
    age,
    employmentStatus,
    stateCode,
    createdAt: state.account?.createdAt || new Date().toISOString(),
    hasPassword: true
  });
  saveBaseline(syncAccountIntoBaseline({
    firstName,
    emailAddress,
    age,
    employmentStatus,
    stateCode
  }, state.baseline));
  state.status = "Account created. Connect a Sandbox account next so PAM can build your financial homepage.";
  saveWorkspaceView("account");
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
    saveWorkspaceView("home");
    state.result = analyzeQuestion(state.question);
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
    saveWorkspaceView("home");
    state.result = analyzeQuestion(state.question);
  } catch (_error) {
    const fallbackPayload = loadSandboxFallback(state.baseline);
    saveBaseline(fallbackPayload.baseline);
    state.status = fallbackPayload.status;
    state.inlineGoalError = "";
    saveWorkspaceView("home");
    state.result = analyzeQuestion(state.question);
  } finally {
    state.plaidBusy = false;
    render();
  }
}

function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  saveQuestion(question);
  if (!hasCompletedBaseline(state.baseline)) {
    saveWorkspaceView("account");
    state.result = null;
    state.status = "Connect Sandbox data first so PAM can calculate this against your real inputs.";
    render();
    return;
  }
  saveWorkspaceView("home");
  state.result = analyzeQuestion(question);
  state.status = "Decision analyzed locally using your current baseline.";
  render();
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openWorkspaceView(view) {
  saveWorkspaceView(view);
  render();
  const target = "#workspace-panel";
  requestAnimationFrame(() => {
    scrollToSection(target);
  });
}

function renderHero() {
  const isComplete = hasCompletedBaseline(state.baseline);
  return `
    <section class="pam-hero foresee-panel">
      <div class="panel-kicker">PAM AI • Personal Asset Manager</div>
      <h1>Know what happens before you decide.</h1>
      <p>
        PAM AI helps young adults see how money decisions affect their monthly buffer, savings, taxes, risk,
        compound growth, and long-term goals.
      </p>
      <div class="pam-hero-actions">
        <button class="button button-primary" type="button" data-open-view="${isComplete ? "home" : "account"}">${isComplete ? "Open my homepage" : "Create your account"}</button>
        <button class="button button-secondary" type="button" data-scroll-target="#how-it-works">How PAM works</button>
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
  const isComplete = hasCompletedBaseline(state.baseline);
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
  const isComplete = hasCompletedBaseline(state.baseline);
  const goalLabel = getGoalLabel(state.baseline);
  const baseline = getUiBaseline(state.baseline);
  return `
    <section class="foresee-panel workspace-panel" id="workspace-panel">
      <div class="workspace-header">
        <div>
          <div class="panel-kicker">Workspace</div>
          <h2>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} PAM homepage` : "Create your account"}</h2>
          <p>${isComplete ? `You are signed in on this device. PAM will reopen here and model tradeoffs against your connected baseline for ${escapeHtml(goalLabel)}.` : "Create the account shell once, connect Sandbox data, and PAM will bring you back to your homepage on return visits."}</p>
        </div>
        ${isComplete ? `<div class="workspace-account-chip"><strong>${escapeHtml(baseline.firstName || "Account")}</strong><span>${escapeHtml(baseline.emailAddress)}</span></div>` : ""}
      </div>
      <div class="workspace-tabs" role="tablist" aria-label="PAM workspace views">
        ${[
          { id: "account", label: isComplete ? "Account" : "Create account" },
          { id: "home", label: "Homepage" }
        ].map((item) => `
          <button
            class="workspace-tab ${state.workspaceView === item.id ? "active" : ""}"
            type="button"
            data-open-view="${item.id}"
            role="tab"
            aria-selected="${state.workspaceView === item.id ? "true" : "false"}"
          >${item.label}</button>
        `).join("")}
      </div>
      ${state.workspaceView === "account" ? renderBaselinePanel() : ""}
      ${state.workspaceView === "home" ? renderHomeWorkspace() : ""}
    </section>
  `;
}

function renderHomeWorkspace() {
  return `
    <div class="workspace-guide-grid">
      ${renderAccountPreview()}
      <div class="workspace-grid-simulator" id="decision-input">
        ${renderDecisionPanel()}
        ${renderResult()}
      </div>
      ${renderEducationSections()}
      ${renderHowItWorksSteps()}
    </div>
  `;
}

function renderBaselinePanel() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = hasCompletedBaseline(state.baseline);
  const account = state.account || {};
  return `
    <section class="foresee-panel baseline-panel account-setup-panel" id="baseline-section">
      <div class="panel-kicker">Account setup</div>
      <h2>${hasPrototypeAccount() ? "Account ready. Connect Sandbox data next." : "Create your account first."}</h2>
      <p>PAM will use a simple email-and-password account shell for this prototype, then build the financial baseline from Sandbox data instead of manual entry.</p>
      <div class="onboarding-layout">
        <div class="baseline-form onboarding-form sandbox-connect-panel">
          <div class="step-counter">Step 1</div>
          <h3>${hasPrototypeAccount() ? "Account saved on this device." : "Create the account shell PAM will remember on this device."}</h3>
          ${hasPrototypeAccount() ? `
            <div class="signal-list-foresee">
              <p><strong>${escapeHtml(account.firstName || baseline.firstName || "Account")}</strong> is signed in on this device.</p>
              <p>${escapeHtml(account.emailAddress || baseline.emailAddress || "")}</p>
              <p>${escapeHtml(account.employmentStatus || baseline.employmentStatus || "Not sure yet")} • ${escapeHtml(account.stateCode || baseline.stateCode || "OTHER")}</p>
            </div>
          ` : `
            <form class="profile-form" data-account-form>
              <div class="onboarding-field-grid">
                <label><span>First name</span><small>Used for your homepage and account label.</small><input type="text" name="firstName" value="${escapeHtml(account.firstName || baseline.firstName)}" placeholder="Maya" /></label>
                <label><span>Email</span><small>Used as your sign-in label for this prototype.</small><input type="email" name="emailAddress" value="${escapeHtml(account.emailAddress || baseline.emailAddress)}" placeholder="you@example.com" /></label>
                <label><span>Password</span><small>Prototype sign-in only. Use at least 8 characters.</small><input type="password" name="password" value="" placeholder="At least 8 characters" /></label>
                <label><span>Age</span><small>Optional, but it helps PAM frame runway and compound-growth timing.</small><input type="number" name="age" value="${hasValue(account.age) ? account.age : baseline.age}" min="18" max="35" step="1" placeholder="24" /></label>
                <label>
                  <span>Employment type</span>
                  <small>A quick differentiator so PAM can frame taxes and deductions better.</small>
                  <select name="employmentStatus">
                    ${["W-2 employee", "1099 / self-employed", "Student worker", "Mixed income", "Not sure yet"].map((option) => `<option value="${option}" ${String(account.employmentStatus || baseline.employmentStatus) === option ? "selected" : ""}>${option}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>State</span>
                  <small>Optional now. PAM can refine its tax estimate later.</small>
                  <select name="stateCode">
                    ${["OTHER", "CA", "NY", "NJ", "MA", "IL", "PA", "TX", "FL", "WA", "NV", "TN"].map((option) => `<option value="${option}" ${String(account.stateCode || baseline.stateCode || "OTHER") === option ? "selected" : ""}>${option}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="form-actions">
                <button class="button button-primary" type="submit">Create account</button>
              </div>
            </form>
          `}
          <div class="step-counter">Step 2</div>
          <h3>${isComplete ? "Your homepage is ready." : "Connect Sandbox data so PAM can build your homepage."}</h3>
          <p class="setup-step-copy">PAM opens Plaid Link in Sandbox mode, exchanges the token on the backend, then turns balances, transactions, and liabilities into your baseline. If Sandbox is unavailable, sample data can still unblock the prototype.</p>
          <div class="signal-list-foresee">
            <p>Primary path: Connect Sandbox account</p>
            <p>Fallback path: Use Sandbox-style sample data</p>
            <p>No financial baseline is entered by hand here</p>
          </div>
          <div class="form-actions">
            <button class="button button-primary" type="button" data-connect-sandbox ${state.plaidBusy || !hasPrototypeAccount() ? "disabled" : ""}>${state.plaidBusy ? "Connecting..." : "Connect Sandbox account"}</button>
            <button class="button button-secondary" type="button" data-load-sandbox ${state.plaidBusy || !hasPrototypeAccount() ? "disabled" : ""}>Use Sandbox-style sample data</button>
            <button class="button button-secondary" type="button" data-reset-baseline>Reset baseline</button>
          </div>
          <p class="prototype-note">Prototype sign-in and profile data stay on this device. Financial baseline data comes from Sandbox or sample data.</p>
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
  if (!hasCompletedBaseline(state.baseline)) {
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
        </div>
      </div>
      <div class="result-section explanation-box">
        <h3>Tax impact</h3>
        <p>${escapeHtml(result.decision.taxImpact)}</p>
        <h3>Long-term goal impact</h3>
        <p>${result.goalDelay ? `This delays ${escapeHtml(goalLabel.toLowerCase())} by about ${formatMonths(result.goalDelay)}.` : `This does not delay ${escapeHtml(goalLabel.toLowerCase())} in this estimate.`}</p>
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
      <h2>From baseline to outcome.</h2>
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
          <strong>Sandbox-first prototype</strong>
          <span>Account shell + connected financial homepage</span>
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
  document.querySelector("[data-question-form]")?.addEventListener("submit", handleQuestionSubmit);
  document.querySelector("[data-reset-baseline]")?.addEventListener("click", resetBaseline);
  document.querySelector("[data-load-sandbox]")?.addEventListener("click", handleSandboxSampleData);
  document.querySelector("[data-connect-sandbox]")?.addEventListener("click", handleConnectSandboxAccount);
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => scrollToSection(button.dataset.scrollTarget));
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => openWorkspaceView(button.dataset.openView || "account"));
  });
  document.querySelectorAll("[data-question-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.questionExample || "";
      saveQuestion(question);
      if (hasCompletedBaseline(state.baseline)) {
        saveWorkspaceView("home");
        state.result = analyzeQuestion(question);
        state.status = "Example prompt analyzed. You can edit it and run another scenario.";
      } else {
        saveWorkspaceView("account");
        state.result = null;
        state.status = "Prompt saved. Finish account setup first so PAM can analyze it against your baseline.";
      }
      render();
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  if (hasPrototypeAccount()) {
    const baseline = syncAccountIntoBaseline(state.account, state.baseline);
    saveBaseline(baseline);
  }
  if (hasPrototypeAccount() && hasCompletedBaseline(state.baseline)) {
    saveWorkspaceView("home");
  } else if (hasPrototypeAccount()) {
    saveWorkspaceView("account");
  }
  state.result = hasCompletedBaseline(state.baseline) ? analyzeQuestion(state.question) : null;
  render();
}
