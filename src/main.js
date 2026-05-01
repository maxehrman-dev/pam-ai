import { escapeHtml, formatCurrency, formatSignedCurrency } from "./utils/formatters.js";

const app = document.querySelector("#app");
const BASELINE_KEY = "pam-ai-young-adult-baseline-v1";
const LAST_QUESTION_KEY = "pam-ai-last-question-v2";

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

const DEFAULT_BASELINE = {
  grossMonthlyIncome: 5600,
  takeHomeIncome: 4200,
  employmentStatus: "W-2 employee",
  stateCode: "CA",
  estimatedTaxRate: 25,
  taxRateOverride: false,
  monthlyExpenses: 2100,
  monthlyObligations: 500,
  currentSavings: 12000,
  retirementContributions: 200,
  deductions: 0,
  longTermGoal: "Move out safely",
  goalTargetAmount: 18000,
  goalTimelineMonths: 18
};

const state = {
  baseline: loadBaseline(),
  question: loadQuestion(),
  result: null,
  status: "",
  showWaitlist: false
};

let isStarted = false;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function loadBaseline() {
  if (typeof window === "undefined") return { ...DEFAULT_BASELINE };

  try {
    const stored = window.localStorage.getItem(BASELINE_KEY);
    const baseline = stored ? { ...DEFAULT_BASELINE, ...JSON.parse(stored) } : { ...DEFAULT_BASELINE };
    return normalizeBaseline(baseline);
  } catch (_error) {
    return { ...DEFAULT_BASELINE };
  }
}

function saveBaseline(baseline) {
  state.baseline = normalizeBaseline(baseline);
  try {
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify(state.baseline));
  } catch (_error) {
    // Local persistence is helpful, not required.
  }
}

function resetBaseline() {
  saveBaseline({ ...DEFAULT_BASELINE });
  state.status = "Baseline reset to the young-adult starter profile.";
  state.result = analyzeQuestion(state.question);
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

function estimateTaxProfile(baseline) {
  const grossAnnual = toNumber(baseline.grossMonthlyIncome) * 12;
  const annualRetirement = toNumber(baseline.retirementContributions) * 12;
  const deductions = toNumber(baseline.deductions);
  const taxableIncome = Math.max(grossAnnual - annualRetirement - deductions - 14600, 0);
  const federalTax = estimateFederalAnnualTax(taxableIncome);
  const stateRate = STATE_TAX_RATES[baseline.stateCode] ?? STATE_TAX_RATES.OTHER;
  const stateTax = Math.max(taxableIncome * stateRate, 0);
  const payrollTax = baseline.employmentStatus === "1099 / self-employed"
    ? grossAnnual * 0.1413
    : grossAnnual * 0.0765;
  const combinedTax = federalTax + stateTax + payrollTax;
  const estimatedRate = grossAnnual > 0 ? Math.min(Math.round((combinedTax / grossAnnual) * 100), 45) : 0;
  const combinedRate = baseline.taxRateOverride ? toNumber(baseline.estimatedTaxRate, estimatedRate) : estimatedRate;
  const monthlyTax = Math.round((grossAnnual * (combinedRate / 100)) / 12);
  const takeHomeIncome = Math.max(Math.round(toNumber(baseline.grossMonthlyIncome) - monthlyTax), 0);

  return {
    grossAnnual,
    taxableIncome,
    federalTax,
    stateTax,
    payrollTax,
    combinedRate,
    monthlyTax,
    takeHomeIncome,
    note: baseline.employmentStatus === "1099 / self-employed"
      ? "1099 income usually needs a larger estimated tax set-aside because taxes are not automatically withheld."
      : "W-2 income often has taxes withheld automatically, but the take-home estimate still matters for affordability."
  };
}

function normalizeBaseline(baseline) {
  const taxProfile = estimateTaxProfile(baseline);
  return {
    ...DEFAULT_BASELINE,
    ...baseline,
    grossMonthlyIncome: toNumber(baseline.grossMonthlyIncome, DEFAULT_BASELINE.grossMonthlyIncome),
    takeHomeIncome: taxProfile.takeHomeIncome,
    estimatedTaxRate: taxProfile.combinedRate,
    monthlyExpenses: toNumber(baseline.monthlyExpenses, DEFAULT_BASELINE.monthlyExpenses),
    monthlyObligations: toNumber(baseline.monthlyObligations, DEFAULT_BASELINE.monthlyObligations),
    currentSavings: toNumber(baseline.currentSavings, DEFAULT_BASELINE.currentSavings),
    retirementContributions: toNumber(baseline.retirementContributions, DEFAULT_BASELINE.retirementContributions),
    deductions: toNumber(baseline.deductions, DEFAULT_BASELINE.deductions),
    goalTargetAmount: toNumber(baseline.goalTargetAmount, DEFAULT_BASELINE.goalTargetAmount),
    goalTimelineMonths: toNumber(baseline.goalTimelineMonths, DEFAULT_BASELINE.goalTimelineMonths),
    taxProfile
  };
}

function getMonthlyBuffer() {
  return state.baseline.takeHomeIncome - state.baseline.monthlyExpenses - state.baseline.monthlyObligations - state.baseline.retirementContributions;
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
    compoundMonthlyDelta: 0,
    assumptions: []
  };

  if (/1099|freelance|contractor|self[- ]?employ|side hustle/.test(normalized)) {
    decision.type = "Employment / tax change";
    const newGross = monthlyAmount || firstAmount || state.baseline.grossMonthlyIncome;
    const taxProfile = estimateTaxProfile({
      ...state.baseline,
      employmentStatus: "1099 / self-employed",
      grossMonthlyIncome: newGross,
      taxRateOverride: false
    });
    decision.monthlyImpact = taxProfile.takeHomeIncome - state.baseline.takeHomeIncome;
    decision.taxImpact = `Estimated combined tax rate changes to ${taxProfile.combinedRate}%. Self-employment taxes may require setting aside more cash.`;
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
    const estimatedCurrentRent = Math.round(state.baseline.monthlyExpenses * 0.55);
    const newRent = monthlyAmount || firstAmount || 1800;
    decision.monthlyImpact = -(Math.max(newRent - estimatedCurrentRent, 0));
    decision.assumptions.push({ label: "New rent", value: `${formatCurrency(newRent)}/month` });
    decision.assumptions.push({ label: "Estimated current housing", value: `${formatCurrency(estimatedCurrentRent)}/month` });
    decision.taxImpact = "No direct change";
    return decision;
  }

  if (/car|auto|vehicle|truck|suv|payment/.test(normalized)) {
    decision.type = "Car purchase";
    decision.monthlyImpact = -(monthlyAmount || firstAmount || 400);
    decision.assumptions.push({ label: "Car payment / ownership cost", value: `${formatCurrency(Math.abs(decision.monthlyImpact))}/month` });
    decision.taxImpact = "No direct change";
    return decision;
  }

  if (/trip|travel|vacation|emergency|repair|medical|bill|wedding|expense/.test(normalized)) {
    decision.type = /trip|travel|vacation/.test(normalized) ? "Trip / travel spend" : "One-time expense";
    decision.oneTimeImpact = -(firstAmount || 2500);
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(Math.abs(decision.oneTimeImpact)) });
    decision.taxImpact = "No direct change";
    return decision;
  }

  if (firstAmount) {
    decision.type = "One-time decision";
    decision.oneTimeImpact = -firstAmount;
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(firstAmount) });
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

function analyzeQuestion(question) {
  const decision = inferDecision(question);
  const currentBuffer = getMonthlyBuffer();
  const newBuffer = currentBuffer + decision.monthlyImpact;
  const projectedSavings12 = state.baseline.currentSavings + decision.oneTimeImpact + newBuffer * 12;
  const risk = getRisk(newBuffer);
  const monthlyGoalPace = Math.max(currentBuffer, 1);
  const newGoalPace = Math.max(newBuffer, 1);
  const currentGoalMonths = Math.max(Math.ceil(Math.max(state.baseline.goalTargetAmount - state.baseline.currentSavings, 0) / monthlyGoalPace), 0);
  const newGoalMonths = Math.max(Math.ceil(Math.max(state.baseline.goalTargetAmount - (state.baseline.currentSavings + decision.oneTimeImpact), 0) / newGoalPace), 0);
  const goalDelay = Math.max(newGoalMonths - currentGoalMonths, 0);
  const compoundGrowth = estimateCompoundGrowth(decision.compoundMonthlyDelta);
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
    risk,
    goalDelay,
    currentGoalMonths,
    newGoalMonths,
    compoundGrowth,
    explanation
  };
}

function readBaselineForm(form) {
  const formData = new FormData(form);
  return {
    grossMonthlyIncome: toNumber(formData.get("grossMonthlyIncome")),
    employmentStatus: String(formData.get("employmentStatus") || DEFAULT_BASELINE.employmentStatus),
    stateCode: String(formData.get("stateCode") || "OTHER"),
    estimatedTaxRate: toNumber(formData.get("estimatedTaxRate")),
    taxRateOverride: formData.get("taxRateOverride") === "on",
    monthlyExpenses: toNumber(formData.get("monthlyExpenses")),
    monthlyObligations: toNumber(formData.get("monthlyObligations")),
    currentSavings: toNumber(formData.get("currentSavings")),
    retirementContributions: toNumber(formData.get("retirementContributions")),
    deductions: toNumber(formData.get("deductions")),
    longTermGoal: String(formData.get("longTermGoal") || DEFAULT_BASELINE.longTermGoal),
    goalTargetAmount: toNumber(formData.get("goalTargetAmount")),
    goalTimelineMonths: toNumber(formData.get("goalTimelineMonths"))
  };
}

function handleBaselineSubmit(event) {
  event.preventDefault();
  saveBaseline(readBaselineForm(event.currentTarget));
  state.status = "Baseline saved. PAM will use these numbers for every scenario.";
  state.result = analyzeQuestion(state.question);
  render();
}

function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  saveQuestion(question);
  state.result = analyzeQuestion(question);
  state.status = "Decision analyzed locally using your current baseline.";
  render();
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHero() {
  return `
    <section class="pam-hero foresee-panel">
      <div class="panel-kicker">PAM AI • Personal Asset Manager</div>
      <h1>Know what happens before you decide.</h1>
      <p>
        PAM AI helps young adults see how money decisions affect their monthly buffer, savings, taxes, risk,
        compound growth, and long-term goals.
      </p>
      <div class="pam-hero-actions">
        <button class="button button-primary" type="button" data-scroll-target="#decision-input">Try PAM</button>
        <button class="button button-secondary" type="button" data-scroll-target="#baseline-section">Start with your baseline</button>
        <button class="button button-secondary" type="button" data-scroll-target="#how-it-works">Learn how it works</button>
      </div>
      <div class="pam-proof-grid">
        <div><span>Version one</span><strong>Young adults</strong></div>
        <div><span>Category</span><strong>Financial decision engine</strong></div>
        <div><span>Not</span><strong>Budget tracker, chatbot, or spreadsheet</strong></div>
      </div>
    </section>
  `;
}

function renderStaticExample() {
  return `
    <section class="foresee-panel static-example">
      <div>
        <div class="panel-kicker">Simple example</div>
        <h2>One decision, clear consequences.</h2>
        <p class="example-question">Question: “Can I buy a car with a $400/month payment?”</p>
      </div>
      <div class="example-output-grid">
        <div><span>Monthly impact</span><strong>-$400</strong></div>
        <div><span>Risk</span><strong>Medium</strong></div>
        <div><span>Tax impact</span><strong>No direct change</strong></div>
        <div><span>Goal impact</span><strong>This delays moving out by 6–9 months.</strong></div>
      </div>
      <p>You can afford it, but your monthly buffer becomes tighter.</p>
    </section>
  `;
}

function renderEducationSections() {
  return `
    <section class="foresee-panel split-section">
      <div>
        <div class="panel-kicker">Past vs future</div>
        <h2>Most money tools show the past. PAM shows what happens next.</h2>
      </div>
      <p>Budgeting apps track spending after it happens. PAM is built to simulate how a decision changes your future: your buffer, savings timeline, tax picture, risk, investing path, and independence goals.</p>
    </section>

    <section class="foresee-panel" id="how-it-works">
      <div class="panel-kicker">Decision engine</div>
      <h2>A decision engine for your money.</h2>
      <div class="feature-grid">
        <article><h3>Build your baseline</h3><p>Add income, employment status, taxes, expenses, savings, obligations, and goals.</p></article>
        <article><h3>Ask a financial question</h3><p>Test rent, cars, trips, freelance work, saving, investing, and independence decisions.</p></article>
        <article><h3>See the future impact</h3><p>PAM estimates monthly buffer, risk, goal delay, tax impact, and hypothetical compound growth.</p></article>
      </div>
    </section>

    <section class="foresee-panel">
      <div class="panel-kicker">Goals</div>
      <h2>PAM connects decisions to future goals.</h2>
      <div class="signal-list-foresee">
        <p>“This delays moving out by 8 months.”</p>
        <p>“This pushes your emergency fund goal back by 4 months.”</p>
        <p>“This lowers your monthly buffer below your safe target.”</p>
        <p>“This slows down your investing plan.”</p>
      </div>
    </section>

    <section class="foresee-panel">
      <div class="panel-kicker">Version one focus</div>
      <h2>Different ages, different goals.</h2>
      <p>PAM starts with young adults making early decisions around income, rent, cars, saving, taxes, investing, and independence. Over time, PAM may expand to other groups because financial goals change with age.</p>
      <div class="feature-grid">
        <article><h3>Teenagers</h3><p>Saving, earning, investing early, financial literacy, and Roth IRA education.</p></article>
        <article><h3>Young adults</h3><p>Rent, cars, taxes, emergency funds, independence, and income growth.</p></article>
        <article><h3>Older adults</h3><p>Retirement readiness, expense control, and wealth preservation.</p></article>
      </div>
    </section>

    <section class="foresee-panel">
      <div class="panel-kicker">Time advantage</div>
      <h2>Compound interest matters early.</h2>
      <p>Young adults and teens have one huge advantage: time. PAM can show estimated growth based on assumptions, hypothetical projections, and scenarios that are not guaranteed.</p>
      <div class="signal-list-foresee">
        <p>“What if I invest $200/month instead of spending it?”</p>
        <p>“How much could this grow over 10 years?”</p>
        <p>“What happens if I wait 5 years to start saving?”</p>
        <p>“How could starting early affect retirement?”</p>
      </div>
      <p class="disclaimer">PAM can teach users why tax-advantaged accounts like Roth IRAs may matter. Eligibility and contribution rules depend on income and regulations. Educational estimate only. Not financial, tax, legal, or investment advice.</p>
    </section>

    <section class="foresee-panel">
      <div class="panel-kicker">Tax-aware affordability</div>
      <h2>Taxes change the real outcome.</h2>
      <p>PAM estimates combined tax impact from federal and state taxes so users can understand what they may actually keep. Gross income is not the same as take-home money, and taxes can change whether a decision is actually affordable.</p>
      <div class="feature-grid">
        <article><h3>Employment status matters</h3><p>A W-2 worker may have taxes withheld automatically. A 1099 worker may need to set aside more for estimated taxes.</p></article>
        <article><h3>Taxable income matters</h3><p>Federal tax, state tax, deductions, retirement contributions, and employment type all affect the estimate.</p></article>
        <article><h3>User control matters</h3><p>If tax rate is unknown, PAM estimates it from income, state, and employment status, then lets the user override it manually.</p></article>
      </div>
      <p class="disclaimer">Educational estimate only. Not financial, tax, legal, or investment advice.</p>
    </section>
  `;
}

function renderBaselinePanel() {
  const baseline = state.baseline;
  const tax = baseline.taxProfile;
  return `
    <section class="foresee-panel baseline-panel" id="baseline-section">
      <div class="panel-kicker">Baseline</div>
      <h2>Start with your real monthly picture.</h2>
      <p>PAM does not assume you know your tax rate. It estimates take-home income from gross income, state, employment status, retirement contributions, and deductions.</p>
      <form class="baseline-form baseline-grid" data-baseline-form>
        <label><span>Gross monthly income</span><input type="number" name="grossMonthlyIncome" value="${baseline.grossMonthlyIncome}" min="0" step="50" /></label>
        <label><span>Take-home income</span><input type="number" value="${baseline.takeHomeIncome}" disabled /></label>
        <label>
          <span>Employment status</span>
          <select name="employmentStatus">
            ${["W-2 employee", "1099 / self-employed", "Part-time employee", "Student worker", "Not currently employed"].map((option) => `<option value="${option}" ${baseline.employmentStatus === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>State</span>
          <select name="stateCode">
            ${["CA", "NY", "NJ", "MA", "IL", "PA", "TX", "FL", "WA", "NV", "TN", "OTHER"].map((option) => `<option value="${option}" ${baseline.stateCode === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label><span>Estimated combined tax rate</span><input type="number" name="estimatedTaxRate" value="${baseline.estimatedTaxRate}" min="0" max="50" step="1" /></label>
        <label class="checkbox-label"><input type="checkbox" name="taxRateOverride" ${baseline.taxRateOverride ? "checked" : ""} /> Override tax estimate manually</label>
        <label><span>Monthly expenses</span><input type="number" name="monthlyExpenses" value="${baseline.monthlyExpenses}" min="0" step="50" /></label>
        <label><span>Monthly obligations</span><input type="number" name="monthlyObligations" value="${baseline.monthlyObligations}" min="0" step="50" /></label>
        <label><span>Current savings</span><input type="number" name="currentSavings" value="${baseline.currentSavings}" min="0" step="100" /></label>
        <label><span>Retirement contributions</span><input type="number" name="retirementContributions" value="${baseline.retirementContributions}" min="0" step="25" /></label>
        <label><span>Deductions</span><input type="number" name="deductions" value="${baseline.deductions}" min="0" step="100" /></label>
        <label>
          <span>Long-term goal</span>
          <select name="longTermGoal">
            ${["Move out safely", "Build emergency savings", "Buy a car", "Start investing", "Reach a net worth target"].map((option) => `<option value="${option}" ${baseline.longTermGoal === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label><span>Goal target amount</span><input type="number" name="goalTargetAmount" value="${baseline.goalTargetAmount}" min="0" step="100" /></label>
        <label><span>Goal timeline, months</span><input type="number" name="goalTimelineMonths" value="${baseline.goalTimelineMonths}" min="1" step="1" /></label>
        <div class="form-actions">
          <button class="button button-primary" type="submit">Save baseline</button>
          <button class="button button-secondary" type="button" data-reset-baseline>Reset baseline</button>
        </div>
      </form>
      <div class="tax-summary">
        <div><span>Estimated monthly tax</span><strong>${formatCurrency(tax.monthlyTax)}</strong></div>
        <div><span>Estimated taxable income</span><strong>${formatCurrency(tax.taxableIncome)}</strong></div>
        <div><span>Monthly buffer</span><strong>${formatCurrency(getMonthlyBuffer())}</strong></div>
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
        <h3>PAM interpreted your decision as</h3>
        <div class="assumption-grid-foresee">
          <div><span>Decision type</span><strong>${escapeHtml(result.decision.type)}</strong></div>
          <div><span>Monthly impact</span><strong>${formatSignedCurrency(result.decision.monthlyImpact)}</strong></div>
          <div><span>One-time impact</span><strong>${formatSignedCurrency(result.decision.oneTimeImpact)}</strong></div>
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
        <p>${result.goalDelay ? `This delays ${escapeHtml(state.baseline.longTermGoal.toLowerCase())} by about ${formatMonths(result.goalDelay)}.` : `This does not delay ${escapeHtml(state.baseline.longTermGoal.toLowerCase())} in this estimate.`}</p>
        <h3>Compound growth impact</h3>
        <p>${result.compoundGrowth ? `If invested monthly, this could hypothetically grow to about ${formatCurrency(result.compoundGrowth)} over 10 years at a 6% assumed annual return. Not guaranteed.` : "No direct compound-growth impact detected for this decision."}</p>
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
        <div><strong>1</strong><span>Enter your baseline</span></div>
        <div><strong>2</strong><span>Choose employment status</span></div>
        <div><strong>3</strong><span>Add income, expenses, savings, obligations, and goals</span></div>
        <div><strong>4</strong><span>Ask a financial question</span></div>
        <div><strong>5</strong><span>PAM estimates tax impact if relevant</span></div>
        <div><strong>6</strong><span>PAM shows the outcome</span></div>
      </div>
    </section>
  `;
}

function renderWaitlistModal() {
  if (!state.showWaitlist) return "";
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="waitlist-title">
      <div class="waitlist-modal">
        <h2 id="waitlist-title">You are on the PAM AI waitlist.</h2>
        <p>Thanks. For this prototype, the waitlist action is confirmed locally.</p>
        <button class="button button-primary" type="button" data-close-waitlist>Close</button>
      </div>
    </div>
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
        <button class="button button-secondary" type="button" data-join-waitlist>Join waitlist</button>
      </header>
      <main class="pam-homepage">
        ${renderHero()}
        ${renderStaticExample()}
        ${renderEducationSections()}
        ${renderBaselinePanel()}
        ${renderDecisionPanel()}
        ${renderResult()}
        ${renderHowItWorksSteps()}
      </main>
    </div>
    ${renderWaitlistModal()}
  `;
  wireInteractions();
}

function wireInteractions() {
  document.querySelector("[data-baseline-form]")?.addEventListener("submit", handleBaselineSubmit);
  document.querySelector("[data-question-form]")?.addEventListener("submit", handleQuestionSubmit);
  document.querySelector("[data-reset-baseline]")?.addEventListener("click", resetBaseline);
  document.querySelector("[data-join-waitlist]")?.addEventListener("click", () => {
    state.showWaitlist = true;
    render();
  });
  document.querySelector("[data-close-waitlist]")?.addEventListener("click", () => {
    state.showWaitlist = false;
    render();
  });
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => scrollToSection(button.dataset.scrollTarget));
  });
  document.querySelectorAll("[data-question-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.questionExample || "";
      saveQuestion(question);
      state.result = analyzeQuestion(question);
      state.status = "Example prompt analyzed. You can edit it and run another scenario.";
      render();
      scrollToSection("#decision-input");
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  state.result = analyzeQuestion(state.question);
  render();
}
