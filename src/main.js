import { escapeHtml, formatCurrency, formatSignedCurrency } from "./utils/formatters.js";

const app = document.querySelector("#app");
const BASELINE_KEY = "pam-ai-baseline-v1";
const LAST_QUESTION_KEY = "pam-ai-last-question-v1";

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
  baseline: loadBaseline(),
  question: loadLastQuestion(),
  result: null,
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

  return {
    question,
    interpretation,
    currentMonthlyBalance,
    newMonthlyBalance,
    projectedSavings6,
    projectedSavings12,
    runwayAfterDecision,
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

function connectSimulatedPlaid() {
  saveBaseline(PLAID_SIMULATED_BASELINE);
  state.status = "Simulated Plaid connection complete. PAM AI extracted income, expenses, and savings into a baseline.";
  if (state.question) state.result = analyzeQuestion(state.question);
  render();
}

function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  saveQuestion(question);
  state.result = analyzeQuestion(question);
  state.status = "Decision analyzed against your current financial baseline.";
  render();
}

function renderBaselinePanel() {
  return `
    <aside class="foresee-panel baseline-panel">
      <div class="panel-kicker">Financial baseline</div>
      <h2>PAM AI needs three numbers.</h2>
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

      <div class="signal-list-foresee">
        ${state.baseline.extractedSignals.map((signal) => `<p>${escapeHtml(signal)}</p>`).join("")}
      </div>
    </aside>
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
        <p>${escapeHtml(result.explanation)}</p>
        <p>${escapeHtml(result.risk.explanation)}</p>
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
          <strong>No demo mode</strong>
          <span>Manual baseline + simulated Plaid baseline</span>
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
  document.querySelector("[data-baseline-form]")?.addEventListener("submit", handleBaselineSubmit);
  document.querySelector("[data-question-form]")?.addEventListener("submit", handleQuestionSubmit);
  document.querySelector("[data-connect-plaid]")?.addEventListener("click", connectSimulatedPlaid);
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
