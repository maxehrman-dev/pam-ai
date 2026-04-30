import { escapeHtml, formatCurrency, formatSignedCurrency } from "./utils/formatters.js";

const app = document.querySelector("#app");
const BASELINE_KEY = "pam-ai-baseline-v2";
const LAST_QUESTION_KEY = "pam-ai-last-question-v1";
const PROFILE_KEY = "pam-ai-profile-v2";
const ONBOARDING_STEP_KEY = "pam-ai-onboarding-step-v2";

const DEFAULT_BASELINE = {
  source: "Manual baseline",
  income: 4200,
  expenses: 2600,
  savings: 12000,
  extractedSignals: [
    "Rent or housing appears to be the largest recurring obligation.",
    "Recurring bills are summarized, not shown as raw transactions.",
    "Runway is calculated from current savings and monthly burn."
  ]
};

const PLAID_SIMULATED_BASELINE = {
  source: "Simulated Plaid bank connection",
  income: 4200,
  expenses: 2600,
  savings: 12000,
  extractedSignals: [
    "Detected recurring deposits averaging $4,200/month.",
    "Detected recurring expenses near $2,600/month across rent, bills, subscriptions, and card payments.",
    "Detected $12,000 available across checking and savings.",
    "No raw transactions are shown. PAM AI only keeps the summarized baseline."
  ]
};

const state = {
  profile: loadProfile(),
  onboardingStep: loadOnboardingStep(),
  baseline: loadBaseline(),
  question: loadLastQuestion(),
  result: null,
  aiGuidance: null,
  aiStatus: "",
  status: ""
};

let isStarted = false;

function loadBaseline() {
  if (typeof window === "undefined") return { ...DEFAULT_BASELINE };

  try {
    const stored = window.localStorage.getItem(BASELINE_KEY);
    return stored ? { ...DEFAULT_BASELINE, ...JSON.parse(stored) } : { ...DEFAULT_BASELINE };
  } catch (_error) {
    return { ...DEFAULT_BASELINE };
  }
}

function loadProfile() {
  const defaults = getDefaultProfile();
  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    return stored
      ? {
          ...defaults,
          ...JSON.parse(stored)
        }
      : defaults;
  } catch (_error) {
    return defaults;
  }
}

function getDefaultProfile() {
  return {
    isCreated: false,
    name: "",
    ageRange: "",
    priority: "Build a safer financial future",
    employmentStatus: "Employed full-time",
    grossMonthlyIncome: 5600,
    estimatedTaxRate: 25,
    otherMonthlyIncome: 0,
    financialSupport: "None",
    supportAmount: 0,
    housingCost: 1500,
    debtPayments: 250,
    subscriptionsBills: 350,
    variableSpending: 500,
    upcomingObligations: 0,
    obligationNote: "",
    cashSavings: 12000,
    investments: 3000,
    otherAssets: 0,
    goal: "Build emergency savings",
    goalTarget: 15000,
    goalTimeline: 18
  };
}

function loadOnboardingStep() {
  if (typeof window === "undefined") return 0;
  const stored = Number(window.localStorage.getItem(ONBOARDING_STEP_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(stored, 3)) : 0;
}

function saveOnboardingStep(step) {
  state.onboardingStep = Math.max(0, Math.min(step, 3));
  try {
    window.localStorage.setItem(ONBOARDING_STEP_KEY, String(state.onboardingStep));
  } catch (_error) {
    // Step persistence is helpful, not required.
  }
}

function saveProfile(profile) {
  state.profile = {
    ...state.profile,
    ...profile
  };

  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
  } catch (_error) {
    // Local profile persistence is helpful, not required.
  }
}

function calculateBaselineFromProfile(profile, source = "Onboarding cash-flow estimate") {
  const taxMultiplier = 1 - Number(profile.estimatedTaxRate || 0) / 100;
  const netIncome =
    Math.max(Number(profile.grossMonthlyIncome || 0) * taxMultiplier, 0) +
    Number(profile.otherMonthlyIncome || 0) +
    Number(profile.supportAmount || 0);
  const expenses =
    Number(profile.housingCost || 0) +
    Number(profile.debtPayments || 0) +
    Number(profile.subscriptionsBills || 0) +
    Number(profile.variableSpending || 0) +
    Number(profile.upcomingObligations || 0);

  return {
    source,
    income: Math.round(netIncome),
    expenses: Math.round(expenses),
    savings: Number(profile.cashSavings || 0),
    extractedSignals: [
      `${profile.employmentStatus || "Employment"} with estimated ${profile.estimatedTaxRate || 0}% tax set aside.`,
      `${formatCurrency(Number(profile.housingCost || 0))}/month housing and ${formatCurrency(Number(profile.debtPayments || 0))}/month debt obligations included.`,
      `${formatCurrency(Number(profile.investments || 0) + Number(profile.otherAssets || 0))} of investments/other assets tracked outside immediate cash.`,
      profile.obligationNote ? `Upcoming obligation: ${profile.obligationNote}.` : "No major upcoming obligation note entered."
    ]
  };
}

function getProfileNumber(profile, key) {
  const value = Number(profile[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function readProfileDraft(form) {
  const formData = new FormData(form);
  const numericFields = [
    "grossMonthlyIncome",
    "estimatedTaxRate",
    "otherMonthlyIncome",
    "supportAmount",
    "housingCost",
    "debtPayments",
    "subscriptionsBills",
    "variableSpending",
    "upcomingObligations",
    "cashSavings",
    "investments",
    "otherAssets",
    "goalTarget",
    "goalTimeline"
  ];
  const draft = { ...state.profile };

  for (const [key, value] of formData.entries()) {
    draft[key] = numericFields.includes(key) ? Number(value || 0) : String(value || "").trim();
  }

  return draft;
}

function completeProfile(profile) {
  const profileName = profile.name || "PAM AI user";
  const completedProfile = {
    ...profile,
    name: profileName,
    isCreated: true
  };
  saveProfile(completedProfile);
  saveOnboardingStep(3);
  saveBaseline(calculateBaselineFromProfile(completedProfile));
  state.status = "Cash-flow estimate complete. PAM AI is now modeling decisions against your profile.";
  state.result = analyzeQuestion(state.question);
}

function saveBaseline(baseline) {
  state.baseline = {
    ...baseline,
    income: Number(baseline.income || 0),
    expenses: Number(baseline.expenses || 0),
    savings: Number(baseline.savings || 0)
  };

  try {
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify(state.baseline));
  } catch (_error) {
    // Local persistence is helpful, not required.
  }
}

function loadLastQuestion() {
  if (typeof window === "undefined") return "Can I buy a car with a $400/month payment?";
  return window.localStorage.getItem(LAST_QUESTION_KEY) || "Can I buy a car with a $400/month payment?";
}

function saveQuestion(question) {
  state.question = question;
  try {
    window.localStorage.setItem(LAST_QUESTION_KEY, question);
  } catch (_error) {
    // The question can still be analyzed without persistence.
  }
}

function getCurrentMonthlyBalance() {
  return state.baseline.income - state.baseline.expenses;
}

function getRunwayMonths() {
  if (state.baseline.expenses <= 0) return Number.POSITIVE_INFINITY;
  return state.baseline.savings / state.baseline.expenses;
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

function parseHorizonMonths(question) {
  const monthMatch = question.match(/(\d+(?:\.\d+)?)\s*(?:months?|mo)\b/i);
  if (monthMatch) return Math.max(1, Math.round(Number(monthMatch[1])));

  const yearMatch = question.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
  if (yearMatch) return Math.max(1, Math.round(Number(yearMatch[1]) * 12));

  return 12;
}

function interpretDecision(question) {
  const normalized = question.toLowerCase();
  const amounts = collectAmounts(question);
  const firstAmount = amounts[0]?.amount || 0;
  const monthlyAmount = parseMonthlyAmount(question);
  const horizonMonths = parseHorizonMonths(question);

  const interpretation = {
    type: "General financial decision",
    oneTimeCost: 0,
    monthlyChange: 0,
    horizonMonths,
    assumptions: []
  };

  if (/rent|move|apartment|lease|housing/.test(normalized)) {
    interpretation.type = "Housing change";
    const newRent = monthlyAmount || firstAmount;
    interpretation.monthlyChange = Math.max(newRent - estimateCurrentHousingCost(), 0);
    interpretation.assumptions.push({ label: "New rent", value: newRent ? `${formatCurrency(newRent)}/month` : "Not specified" });
    interpretation.assumptions.push({ label: "Estimated current housing", value: `${formatCurrency(estimateCurrentHousingCost())}/month` });
    interpretation.assumptions.push({ label: "Monthly change", value: formatSignedCurrency(interpretation.monthlyChange) });
    return interpretation;
  }

  if (/car|auto|vehicle|truck|suv|payment/.test(normalized)) {
    interpretation.type = "Vehicle purchase";
    interpretation.monthlyChange = monthlyAmount || firstAmount || 400;
    interpretation.assumptions.push({ label: "Car payment / ownership cost", value: `${formatCurrency(interpretation.monthlyChange)}/month` });
    if (!monthlyAmount && !firstAmount) {
      interpretation.assumptions.push({ label: "Missing detail", value: "No price or payment given; using $400/month until updated." });
    }
    return interpretation;
  }

  if (/vacation|trip|travel|emergency|repair|medical|bill|wedding|expense/.test(normalized)) {
    interpretation.type = /vacation|trip|travel/.test(normalized) ? "One-time travel spend" : "One-time cash expense";
    interpretation.oneTimeCost = firstAmount || 2500;
    interpretation.assumptions.push({ label: "One-time cost", value: formatCurrency(interpretation.oneTimeCost) });
    if (!firstAmount) {
      interpretation.assumptions.push({ label: "Missing detail", value: "No amount given; using $2,500 until updated." });
    }
    return interpretation;
  }

  if (/subscription|bill|recurring|monthly|per month|\/month/.test(normalized)) {
    interpretation.type = "Recurring expense change";
    interpretation.monthlyChange = monthlyAmount || firstAmount || 250;
    interpretation.assumptions.push({ label: "Monthly change", value: formatSignedCurrency(interpretation.monthlyChange) });
    return interpretation;
  }

  if (firstAmount) {
    interpretation.type = "One-time financial decision";
    interpretation.oneTimeCost = firstAmount;
    interpretation.assumptions.push({ label: "One-time cost", value: formatCurrency(firstAmount) });
    return interpretation;
  }

  interpretation.assumptions.push({ label: "Decision shape", value: "Could not identify an amount yet." });
  interpretation.assumptions.push({ label: "Next useful detail", value: "Add a dollar amount or monthly cost." });
  return interpretation;
}

function estimateCurrentHousingCost() {
  return Math.round(state.baseline.expenses * 0.42);
}

function getRisk(balance) {
  if (balance > 500) {
    return {
      label: "Low",
      className: "risk-low",
      explanation: "You can likely absorb this decision while keeping a healthy monthly margin."
    };
  }

  if (balance >= 0) {
    return {
      label: "Medium",
      className: "risk-medium",
      explanation: "You can afford this on paper, but your margin is tight and unexpected expenses could become risky."
    };
  }

  return {
    label: "High",
    className: "risk-high",
    explanation: "This decision pushes your monthly balance negative. You would need to reduce costs, increase income, or delay the decision."
  };
}

function analyzeQuestion(question) {
  const interpretation = interpretDecision(question);
  const currentMonthlyBalance = getCurrentMonthlyBalance();
  const newMonthlyBalance = currentMonthlyBalance - interpretation.monthlyChange;
  const projectedSavings6 = state.baseline.savings - interpretation.oneTimeCost + newMonthlyBalance * 6;
  const projectedSavings12 = state.baseline.savings - interpretation.oneTimeCost + newMonthlyBalance * 12;
  const risk = getRisk(newMonthlyBalance);
  const runwayAfterDecision = state.baseline.expenses + interpretation.monthlyChange <= 0
    ? Number.POSITIVE_INFINITY
    : Math.max(state.baseline.savings - interpretation.oneTimeCost, 0) / (state.baseline.expenses + interpretation.monthlyChange);
  const savingsDelta = interpretation.oneTimeCost + interpretation.monthlyChange * 12;
  const goalDelayMonths = Math.max(0, Math.ceil(savingsDelta / Math.max(newMonthlyBalance, 1)));
  const ahaMoment = risk.label === "High"
    ? `You would run out of liquid cash in ${Number.isFinite(runwayAfterDecision) ? runwayAfterDecision.toFixed(1) : "many"} months unless you offset the cost.`
    : `This decision would reduce your 12-month savings path by ${formatCurrency(Math.max(savingsDelta, 0))}${goalDelayMonths ? ` and delay your main goal about ${goalDelayMonths} months` : ""}.`;
  const nextStep = risk.label === "Low"
    ? "Proceed only if the real cost matches this estimate and your emergency cash stays intact."
    : "Before saying yes, cut a matching monthly expense, increase income, or delay the decision.";

  return {
    question,
    interpretation,
    currentMonthlyBalance,
    newMonthlyBalance,
    projectedSavings6,
    projectedSavings12,
    runwayAfterDecision,
    ahaMoment,
    nextStep,
    risk,
    explanation: buildExplanation(interpretation, risk, newMonthlyBalance, projectedSavings12)
  };
}

function buildExplanation(interpretation, risk, newMonthlyBalance, projectedSavings12) {
  if (interpretation.assumptions.some((item) => /not specified|missing/i.test(item.value))) {
    return "PAM AI made a conservative first pass, but the result will get more useful when you add the actual dollar amount.";
  }

  if (risk.label === "Low") {
    return `This looks workable. You would still have about ${formatCurrency(newMonthlyBalance)} left each month, and your 12-month savings projection stays positive.`;
  }

  if (risk.label === "Medium") {
    return `You can afford this, but your margin is tight. At this pace, your 12-month projected savings would be ${formatCurrency(projectedSavings12)}.`;
  }

  return `This is risky because the decision creates a monthly shortfall. PAM AI would not treat this as safe unless you offset the cost first.`;
}

function handleBaselineSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  saveBaseline({
    source: "Manual baseline",
    income: Number(formData.get("income") || 0),
    expenses: Number(formData.get("expenses") || 0),
    savings: Number(formData.get("savings") || 0),
    extractedSignals: [
      "Manual baseline saved.",
      "PAM AI will use these numbers for every decision.",
      "Connect-your-bank simulation can replace this summary at any time."
    ]
  });
  state.status = "Baseline saved. Future decisions now use these numbers.";
  if (state.question) state.result = analyzeQuestion(state.question);
  render();
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const action = event.submitter?.dataset.onboardingAction || "next";
  const draft = readProfileDraft(event.currentTarget);
  saveProfile(draft);

  if (action === "back") {
    saveOnboardingStep(state.onboardingStep - 1);
  } else if (action === "finish") {
    completeProfile(draft);
  } else {
    saveOnboardingStep(state.onboardingStep + 1);
  }

  render();
}

function connectSimulatedPlaid() {
  saveBaseline(PLAID_SIMULATED_BASELINE);
  state.status = "Simulated Plaid connection complete. PAM AI extracted income, expenses, and savings into a baseline.";
  if (state.question) state.result = analyzeQuestion(state.question);
  render();
}

function createProfileWithSimulatedPlaid() {
  saveProfile({
    ...state.profile,
    isCreated: true,
    name: state.profile.name || "PAM AI user",
    ageRange: state.profile.ageRange || "Not specified",
    priority: state.profile.priority || "Understand financial decisions before making them",
    employmentStatus: "Plaid-derived profile",
    grossMonthlyIncome: 5600,
    estimatedTaxRate: 25,
    housingCost: 1500,
    subscriptionsBills: 700,
    variableSpending: 400,
    cashSavings: PLAID_SIMULATED_BASELINE.savings,
    investments: 3000
  });
  saveOnboardingStep(3);
  saveBaseline(PLAID_SIMULATED_BASELINE);
  state.status = "Simulated Plaid connection complete. PAM AI extracted income, expenses, and savings into a baseline.";
  state.result = analyzeQuestion(state.question);
  render();
}

function resetLocalProfile() {
  state.profile = getDefaultProfile();
  state.onboardingStep = 0;
  try {
    window.localStorage.removeItem(PROFILE_KEY);
    window.localStorage.removeItem(ONBOARDING_STEP_KEY);
  } catch (_error) {
    // Reset can still update the in-memory screen.
  }
  state.status = "";
  state.aiGuidance = null;
  state.aiStatus = "";
  render();
}

async function requestAdvisorGuidance(question, result) {
  state.aiStatus = "PAM AI is checking the advisor layer...";
  state.aiGuidance = null;
  render();

  try {
    const response = await fetch("/api/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: question,
        draft: {
          type: result.interpretation.type,
          title: question
        },
        result: {
          ahaMoment: result.ahaMoment,
          nextStep: result.nextStep,
          risk: {
            label: result.risk.label,
            detail: result.risk.explanation
          },
          monthlyCashFlowImpact: result.interpretation.monthlyChange,
          savingsRunoutMonths: result.runwayAfterDecision
        }
      })
    });
    const payload = await response.json();
    if (!payload.ok) {
      state.aiStatus = "Advisor layer is wired, but no live OpenAI key is configured on this deployment yet.";
      return;
    }
    state.aiGuidance = payload.guidance;
    state.aiStatus = payload.engine?.provider || "PAM AI advisor layer active.";
  } catch (_error) {
    state.aiStatus = "Advisor layer is unavailable, so PAM AI is using deterministic scenario math.";
  } finally {
    render();
  }
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  saveQuestion(question);
  state.result = analyzeQuestion(question);
  state.status = "Decision analyzed against your current financial baseline.";
  state.aiGuidance = null;
  state.aiStatus = "";
  render();
  await requestAdvisorGuidance(question, state.result);
}

function renderBaselinePanel() {
  return `
    <aside class="foresee-panel baseline-panel">
      <div class="panel-kicker">Financial baseline</div>
      <h2>${escapeHtml(state.profile.name || "Your")} baseline</h2>
      <p>This is the source of truth for every decision. Plaid is conceptually the automatic way to fill this in; manual input works for now.</p>

      <form class="baseline-form" data-baseline-form>
        <label>
          <span>Monthly income</span>
          <input type="number" name="income" value="${state.baseline.income}" min="0" step="50" />
        </label>
        <label>
          <span>Monthly expenses</span>
          <input type="number" name="expenses" value="${state.baseline.expenses}" min="0" step="50" />
        </label>
        <label>
          <span>Current savings</span>
          <input type="number" name="savings" value="${state.baseline.savings}" min="0" step="100" />
        </label>
        <button class="button button-primary" type="submit">Save baseline</button>
      </form>

      <button class="button button-secondary plaid-sim-button" type="button" data-connect-plaid>
        Connect your bank (via Plaid)
      </button>

      <div class="baseline-source">
        <span>Current source</span>
        <strong>${escapeHtml(state.baseline.source)}</strong>
      </div>

      <div class="baseline-source">
        <span>Profile context</span>
        <strong>${escapeHtml(state.profile.ageRange || "Age not set")}</strong>
        <small>${escapeHtml(state.profile.priority)}</small>
      </div>

      <div class="signal-list-foresee">
        ${state.baseline.extractedSignals.map((signal) => `<p>${escapeHtml(signal)}</p>`).join("")}
      </div>
    </aside>
  `;
}

function renderMoneyInput(name, label, value, step = 50) {
  return `
    <label>
      <span>${label}</span>
      <input type="number" name="${name}" value="${getProfileNumber(state.profile, name)}" min="0" step="${step}" />
    </label>
  `;
}

function renderSelect(name, label, options, value) {
  return `
    <label>
      <span>${label}</span>
      <select name="${name}">
        ${options.map((option) => `<option value="${option}" ${value === option ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderCashFlowPreview(profile = state.profile) {
  const preview = calculateBaselineFromProfile(profile);
  const monthlySurplus = preview.income - preview.expenses;
  const runway = preview.expenses > 0 ? preview.savings / preview.expenses : Number.POSITIVE_INFINITY;

  return `
    <aside class="cash-flow-preview">
      <div class="panel-kicker">Live cash-flow estimate</div>
      <h3>Profile preview</h3>
      <div class="cash-flow-preview-grid">
        <div>
          <span>Take-home income</span>
          <strong>${formatCurrency(preview.income)}</strong>
        </div>
        <div>
          <span>Monthly obligations</span>
          <strong>${formatCurrency(preview.expenses)}</strong>
        </div>
        <div>
          <span>Monthly margin</span>
          <strong class="${monthlySurplus < 0 ? "negative-number" : "positive-number"}">${formatSignedCurrency(monthlySurplus)}</strong>
        </div>
        <div>
          <span>Cash runway</span>
          <strong>${Number.isFinite(runway) ? `${runway.toFixed(1)} mo` : "Stable"}</strong>
        </div>
      </div>
      <p>PAM AI uses this summarized baseline for decisions. Plaid will eventually fill this automatically from income, balances, recurring bills, liabilities, and transaction patterns.</p>
    </aside>
  `;
}

function renderOnboardingFields() {
  if (state.onboardingStep === 0) {
    return `
      <div class="onboarding-field-grid">
        <label>
          <span>Name</span>
          <input type="text" name="name" placeholder="Demo User" value="${escapeHtml(state.profile.name)}" />
        </label>
        ${renderSelect("ageRange", "Age range", ["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"], state.profile.ageRange)}
        ${renderSelect(
          "priority",
          "What are you trying to protect?",
          [
            "Move out safely",
            "Buy a car",
            "Build emergency savings",
            "Avoid bad debt",
            "Invest consistently",
            "Understand financial decisions before making them"
          ],
          state.profile.priority
        )}
      </div>
    `;
  }

  if (state.onboardingStep === 1) {
    return `
      <div class="onboarding-field-grid">
        ${renderSelect(
          "employmentStatus",
          "Employment status",
          ["Employed full-time", "Employed part-time", "Self-employed", "Student", "Unemployed", "Retired"],
          state.profile.employmentStatus
        )}
        ${renderMoneyInput("grossMonthlyIncome", "Gross monthly income", state.profile.grossMonthlyIncome, 100)}
        <label>
          <span>Estimated tax rate</span>
          <input type="number" name="estimatedTaxRate" value="${getProfileNumber(state.profile, "estimatedTaxRate")}" min="0" max="60" step="1" />
        </label>
        ${renderMoneyInput("otherMonthlyIncome", "Other monthly income", state.profile.otherMonthlyIncome, 50)}
        ${renderSelect("financialSupport", "Financial support", ["None", "Family support", "Partner support", "Benefits/stipend", "Other"], state.profile.financialSupport)}
        ${renderMoneyInput("supportAmount", "Monthly support amount", state.profile.supportAmount, 50)}
      </div>
    `;
  }

  if (state.onboardingStep === 2) {
    return `
      <div class="onboarding-field-grid">
        ${renderMoneyInput("housingCost", "Rent / housing", state.profile.housingCost, 50)}
        ${renderMoneyInput("debtPayments", "Debt payments", state.profile.debtPayments, 25)}
        ${renderMoneyInput("subscriptionsBills", "Bills + subscriptions", state.profile.subscriptionsBills, 25)}
        ${renderMoneyInput("variableSpending", "Food, gas, discretionary", state.profile.variableSpending, 50)}
        ${renderMoneyInput("upcomingObligations", "Upcoming obligations", state.profile.upcomingObligations, 50)}
        <label>
          <span>Upcoming obligation note</span>
          <input type="text" name="obligationNote" placeholder="Insurance renewal, tuition, medical bill..." value="${escapeHtml(state.profile.obligationNote)}" />
        </label>
      </div>
    `;
  }

  return `
    <div class="onboarding-field-grid">
      ${renderMoneyInput("cashSavings", "Cash savings", state.profile.cashSavings, 100)}
      ${renderMoneyInput("investments", "Investments", state.profile.investments, 100)}
      ${renderMoneyInput("otherAssets", "Other assets", state.profile.otherAssets, 100)}
      ${renderSelect(
        "goal",
        "Primary life goal",
        ["Move out safely", "Buy a house", "Save for college", "Have kids", "Build emergency savings", "Reach a net worth target", "Retire early"],
        state.profile.goal
      )}
      ${renderMoneyInput("goalTarget", "Goal target amount", state.profile.goalTarget, 100)}
      <label>
        <span>Target timeline, months</span>
        <input type="number" name="goalTimeline" value="${getProfileNumber(state.profile, "goalTimeline")}" min="1" step="1" />
      </label>
    </div>
  `;
}

function renderOnboardingCard() {
  const stepTitles = ["Identity", "Income", "Obligations", "Assets + goal"];
  const title = stepTitles[state.onboardingStep] || stepTitles[0];
  const isLastStep = state.onboardingStep === stepTitles.length - 1;

  return `
    <section class="foresee-panel profile-card" id="create-profile">
      <div class="panel-kicker">Secure account setup</div>
      <h2>Create your PAM AI profile</h2>
      <p>Before the simulator opens, PAM builds a real baseline: income after estimated tax, fixed obligations, liquid savings, assets, support, and the goal each decision should protect.</p>

      <div class="onboarding-progress" aria-label="Account setup progress">
        ${stepTitles
          .map(
            (step, index) => `
              <span class="${index <= state.onboardingStep ? "active" : ""}">
                <strong>${index + 1}</strong>
                ${step}
              </span>
            `
          )
          .join("")}
      </div>

      <div class="onboarding-layout">
        <form class="profile-form onboarding-form" data-profile-form>
          <h3>${title}</h3>
          ${renderOnboardingFields()}
          <div class="onboarding-actions">
            ${state.onboardingStep > 0 ? '<button class="button button-secondary" type="submit" data-onboarding-action="back">Back</button>' : ""}
            <button class="button button-primary" type="submit" data-onboarding-action="${isLastStep ? "finish" : "next"}">
              ${isLastStep ? "Enter PAM AI" : "Continue"}
            </button>
          </div>
        </form>
        ${renderCashFlowPreview()}
      </div>
    </section>
  `;
}

function renderHomepage() {
  return `
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
          <strong>Plaid-ready architecture</strong>
          <span>Simulated connection until live API keys are added</span>
        </div>
      </header>

      <main class="pam-homepage">
        <section class="pam-hero foresee-panel">
          <div class="panel-kicker">Financial decision foresight</div>
          <h1>Full financial context before every decision.</h1>
          <p>
            PAM AI starts like financial software should: build the baseline first, then model the decision. Create a profile, estimate cash flow, and let every scenario answer what changes, what gets delayed, and what risk appears.
          </p>
          <div class="pam-hero-actions">
            <a class="button button-primary" href="#create-profile">Create profile</a>
            <button class="button button-secondary" type="button" data-home-plaid>Connect bank simulation</button>
          </div>
          <div class="pam-proof-grid">
            <div>
              <span>Not a budget tracker</span>
              <strong>Decision analysis first</strong>
            </div>
            <div>
              <span>Baseline source</span>
              <strong>Guided setup now, Plaid later</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>Risk, runway, savings</strong>
            </div>
          </div>
        </section>

        ${renderOnboardingCard()}

        <section class="foresee-panel plaid-primer-card">
          <div class="panel-kicker">Plaid role</div>
          <h2>Plaid is the data layer, not the product.</h2>
          <p>When real Plaid is connected, PAM AI should summarize account balances, recurring income, recurring expenses, and transaction patterns into a baseline. It should not show raw transactions or become Mint.</p>
          <div class="signal-list-foresee">
            <p>Income: recurring deposits and payroll-like inflows.</p>
            <p>Expenses: rent, bills, subscriptions, loan payments, and card spend summarized monthly.</p>
            <p>Balances: checking/savings totals for runway and cash-risk calculations.</p>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderDecisionInput() {
  return `
    <section class="foresee-panel decision-panel">
      <div class="panel-kicker">Decision analysis</div>
      <h1>What happens if I do this?</h1>
      <p class="decision-lead">Submit one financial decision. PAM AI will interpret it, run the baseline math, and return one clear outcome.</p>

      <form class="foresee-question-form" data-question-form>
        <label for="foresee-question">Ask a financial question</label>
        <textarea
          id="foresee-question"
          name="question"
          rows="4"
          placeholder="Can I afford to move out if rent is $1,800?&#10;What happens if I go on a $2,500 vacation?&#10;Can I buy a car with a $400/month payment?"
        >${escapeHtml(state.question)}</textarea>
        <button class="button button-primary" type="submit">Analyze decision</button>
      </form>

      <div class="quick-question-row">
        <button type="button" data-question-example="Can I afford to move out if rent is $1,800?">Move out at $1,800 rent</button>
        <button type="button" data-question-example="What happens if I go on a $2,500 vacation?">$2,500 vacation</button>
        <button type="button" data-question-example="Can I buy a car with a $400/month payment?">$400/month car</button>
      </div>

      ${state.status ? `<p class="foresee-status">${escapeHtml(state.status)}</p>` : ""}
    </section>
  `;
}

function renderResult() {
  const result = state.result || analyzeQuestion(state.question);
  state.result = result;

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
        <h3>PAM AI interpreted your decision as:</h3>
        <div class="assumption-grid-foresee">
          <div>
            <span>Decision type</span>
            <strong>${escapeHtml(result.interpretation.type)}</strong>
          </div>
          ${result.interpretation.assumptions
            .map(
              (item) => `
                <div>
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.value)}</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="result-section">
        <h3>Your outcome</h3>
        <div class="outcome-grid">
          <div>
            <span>New monthly balance</span>
            <strong>${formatCurrency(result.newMonthlyBalance)}</strong>
            <small>Before: ${formatCurrency(result.currentMonthlyBalance)}</small>
          </div>
          <div>
            <span>Projected savings, 6 months</span>
            <strong>${formatCurrency(result.projectedSavings6)}</strong>
          </div>
          <div>
            <span>Projected savings, 12 months</span>
            <strong>${formatCurrency(result.projectedSavings12)}</strong>
          </div>
          <div>
            <span>Runway after decision</span>
            <strong>${Number.isFinite(result.runwayAfterDecision) ? `${result.runwayAfterDecision.toFixed(1)} mo` : "Stable"}</strong>
          </div>
        </div>
      </div>

      <div class="result-section explanation-box">
        <h3>Explanation</h3>
        <p><strong>${escapeHtml(result.ahaMoment)}</strong></p>
        <p>${escapeHtml(result.explanation)}</p>
        <p>${escapeHtml(result.risk.explanation)}</p>
        <p>${escapeHtml(result.nextStep)}</p>
      </div>

      <div class="result-section advisor-box">
        <h3>Advisor layer</h3>
        ${
          state.aiGuidance
            ? `
              <p><strong>${escapeHtml(state.aiGuidance.assistant.headline)}</strong></p>
              <p>${escapeHtml(state.aiGuidance.assistant.body)}</p>
              ${
                state.aiGuidance.followUpPrompt
                  ? `<p class="advisor-followup">${escapeHtml(state.aiGuidance.followUpPrompt)}</p>`
                  : ""
              }
            `
            : `<p>${escapeHtml(state.aiStatus || "PAM AI is using deterministic decision math here. The server-side AI advisor endpoint is wired for OpenAI once the deployment has a valid key.")}</p>`
        }
      </div>
    </section>
  `;
}

function render() {
  if (!app) return;

  if (!state.profile.isCreated) {
    app.innerHTML = renderHomepage();
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
        <div class="foresee-truth">
          <strong>${escapeHtml(state.profile.name || "PAM AI profile")}</strong>
          <span>${escapeHtml(state.profile.ageRange || "Age not set")} • ${escapeHtml(state.baseline.source)}</span>
          <button class="link-button" type="button" data-reset-profile>Sign out</button>
        </div>
      </header>

      <main class="foresee-layout">
        ${renderBaselinePanel()}
        <div class="foresee-main">
          ${renderDecisionInput()}
          ${renderResult()}
        </div>
      </main>
    </div>
  `;

  wireInteractions();
}

function wireInteractions() {
  document.querySelector("[data-profile-form]")?.addEventListener("submit", handleProfileSubmit);
  document.querySelector("[data-baseline-form]")?.addEventListener("submit", handleBaselineSubmit);
  document.querySelector("[data-question-form]")?.addEventListener("submit", handleQuestionSubmit);
  document.querySelector("[data-connect-plaid]")?.addEventListener("click", connectSimulatedPlaid);
  document.querySelector("[data-home-plaid]")?.addEventListener("click", createProfileWithSimulatedPlaid);
  document.querySelector("[data-reset-profile]")?.addEventListener("click", resetLocalProfile);
  document.querySelectorAll("[data-question-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.questionExample || "";
      saveQuestion(question);
      state.result = analyzeQuestion(question);
      state.status = "Example analyzed. Edit the question or baseline any time.";
      render();
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  state.result = analyzeQuestion(state.question);
  render();
}
