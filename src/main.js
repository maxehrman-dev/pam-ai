import { escapeHtml, formatCurrency, formatSignedCurrency } from "./utils/formatters.js";

const app = document.querySelector("#app");
const BASELINE_KEY = "pam-ai-young-adult-baseline-v2";
const LAST_QUESTION_KEY = "pam-ai-last-question-v2";
const SETUP_STEP_KEY = "pam-ai-account-setup-step-v1";

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

const EMPTY_BASELINE = {
  grossMonthlyIncome: "",
  takeHomeIncome: 0,
  employmentStatus: "",
  stateCode: "",
  estimatedTaxRate: "",
  taxRateOverride: false,
  monthlyExpenses: "",
  monthlyObligations: "",
  currentSavings: "",
  retirementContributions: "",
  deductions: "",
  longTermGoal: "",
  goalTargetAmount: "",
  goalTimelineMonths: ""
};

const state = {
  baseline: loadBaseline(),
  setupStep: loadSetupStep(),
  question: loadQuestion(),
  result: null,
  status: "",
  showWaitlist: false
};

let isStarted = false;

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function loadBaseline() {
  if (typeof window === "undefined") return { ...EMPTY_BASELINE };

  try {
    const stored = window.localStorage.getItem(BASELINE_KEY);
    const baseline = stored ? { ...EMPTY_BASELINE, ...JSON.parse(stored) } : { ...EMPTY_BASELINE };
    return normalizeBaseline(baseline);
  } catch (_error) {
    return { ...EMPTY_BASELINE };
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

function loadSetupStep() {
  if (typeof window === "undefined") return 0;
  const stored = Number(window.localStorage.getItem(SETUP_STEP_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(stored, 3)) : 0;
}

function saveSetupStep(step) {
  state.setupStep = Math.max(0, Math.min(step, 3));
  try {
    window.localStorage.setItem(SETUP_STEP_KEY, String(state.setupStep));
  } catch (_error) {
    // Step persistence is helpful, not required.
  }
}

function resetBaseline() {
  saveBaseline({ ...EMPTY_BASELINE });
  saveSetupStep(0);
  state.status = "Setup reset. PAM will wait to calculate until your baseline is complete.";
  state.result = null;
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
    note: !baseline.employmentStatus
      ? "Choose employment status so PAM can estimate how taxes may affect take-home cash."
      : baseline.employmentStatus === "1099 / self-employed"
        ? "1099 income usually needs a larger estimated tax set-aside because taxes are not automatically withheld."
        : "W-2 income often has taxes withheld automatically, but the take-home estimate still matters for affordability."
  };
}

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

function hasCompletedBaseline(baseline = state.baseline) {
  return [
    baseline.grossMonthlyIncome,
    baseline.employmentStatus,
    baseline.stateCode,
    baseline.monthlyExpenses,
    baseline.monthlyObligations,
    baseline.currentSavings,
    baseline.longTermGoal,
    baseline.goalTargetAmount,
    baseline.goalTimelineMonths
  ].every(hasValue);
}

function normalizeBaseline(baseline) {
  const taxProfile = estimateTaxProfile(baseline);
  const combinedRate = baseline.taxRateOverride
    ? toNumber(baseline.estimatedTaxRate, taxProfile.combinedRate)
    : taxProfile.combinedRate;
  return {
    ...EMPTY_BASELINE,
    ...baseline,
    grossMonthlyIncome: hasValue(baseline.grossMonthlyIncome) ? toNumber(baseline.grossMonthlyIncome) : "",
    takeHomeIncome: taxProfile.takeHomeIncome,
    estimatedTaxRate: hasValue(baseline.grossMonthlyIncome) ? combinedRate : "",
    monthlyExpenses: hasValue(baseline.monthlyExpenses) ? toNumber(baseline.monthlyExpenses) : "",
    monthlyObligations: hasValue(baseline.monthlyObligations) ? toNumber(baseline.monthlyObligations) : "",
    currentSavings: hasValue(baseline.currentSavings) ? toNumber(baseline.currentSavings) : "",
    retirementContributions: hasValue(baseline.retirementContributions) ? toNumber(baseline.retirementContributions) : "",
    deductions: hasValue(baseline.deductions) ? toNumber(baseline.deductions) : "",
    goalTargetAmount: hasValue(baseline.goalTargetAmount) ? toNumber(baseline.goalTargetAmount) : "",
    goalTimelineMonths: hasValue(baseline.goalTimelineMonths) ? toNumber(baseline.goalTimelineMonths) : "",
    taxProfile
  };
}

function getMonthlyBuffer() {
  return state.baseline.takeHomeIncome
    - toNumber(state.baseline.monthlyExpenses)
    - toNumber(state.baseline.monthlyObligations)
    - toNumber(state.baseline.retirementContributions);
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
  const fieldNumber = (key) => formData.has(key) ? toNumber(formData.get(key)) : state.baseline[key];
  return {
    ...state.baseline,
    grossMonthlyIncome: fieldNumber("grossMonthlyIncome"),
    employmentStatus: String(formData.get("employmentStatus") || state.baseline.employmentStatus),
    stateCode: String(formData.get("stateCode") || state.baseline.stateCode),
    estimatedTaxRate: fieldNumber("estimatedTaxRate"),
    taxRateOverride: formData.has("taxRateOverride") ? formData.get("taxRateOverride") === "on" : state.baseline.taxRateOverride,
    monthlyExpenses: fieldNumber("monthlyExpenses"),
    monthlyObligations: fieldNumber("monthlyObligations"),
    currentSavings: fieldNumber("currentSavings"),
    retirementContributions: fieldNumber("retirementContributions"),
    deductions: fieldNumber("deductions"),
    longTermGoal: String(formData.get("longTermGoal") || state.baseline.longTermGoal),
    goalTargetAmount: fieldNumber("goalTargetAmount"),
    goalTimelineMonths: fieldNumber("goalTimelineMonths")
  };
}

function handleBaselineSubmit(event) {
  event.preventDefault();
  const action = event.submitter?.dataset.setupAction || "save";
  const draft = readBaselineForm(event.currentTarget);
  saveBaseline(draft);

  if (action === "back") {
    saveSetupStep(state.setupStep - 1);
    render();
    return;
  }

  if (action === "next") {
    saveSetupStep(state.setupStep + 1);
    render();
    return;
  }

  if (!hasCompletedBaseline()) {
    state.status = "Finish the required setup fields first. PAM will not create a baseline until the profile is complete.";
    state.result = null;
    render();
    return;
  }

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
  if (!hasCompletedBaseline()) {
    state.result = null;
    state.status = "Create your account baseline first so PAM can calculate this against your real inputs.";
    render();
    scrollToSection("#baseline-section");
    return;
  }
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
        <button class="button button-secondary" type="button" data-scroll-target="#baseline-section">Create your account</button>
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

function renderAccountSetupFields() {
  const baseline = state.baseline;
  if (state.setupStep === 0) {
    return `
      <p class="setup-step-copy">Start with money coming in. PAM uses this to estimate take-home cash, not to judge spending.</p>
      <div class="onboarding-field-grid">
        <label><span>Gross monthly income</span><small>What you earn before taxes, deductions, or retirement contributions.</small><input type="number" name="grossMonthlyIncome" value="${baseline.grossMonthlyIncome}" min="0" step="50" placeholder="Example: 5600" /></label>
        <label>
          <span>Employment status</span>
          <small>This changes the tax estimate. W-2 and 1099 income behave differently.</small>
          <select name="employmentStatus">
            <option value="" ${baseline.employmentStatus === "" ? "selected" : ""}>Select status</option>
            ${["W-2 employee", "1099 / self-employed", "Part-time employee", "Student worker", "Not currently employed"].map((option) => `<option value="${option}" ${baseline.employmentStatus === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>State</span>
          <small>State helps PAM estimate combined tax impact. You can refine later.</small>
          <select name="stateCode">
            <option value="" ${baseline.stateCode === "" ? "selected" : ""}>Select state</option>
            ${["CA", "NY", "NJ", "MA", "IL", "PA", "TX", "FL", "WA", "NV", "TN", "OTHER"].map((option) => `<option value="${option}" ${baseline.stateCode === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label><span>Retirement contributions</span><small>Optional monthly amount going to retirement accounts.</small><input type="number" name="retirementContributions" value="${baseline.retirementContributions}" min="0" step="25" placeholder="Optional" /></label>
      </div>
    `;
  }

  if (state.setupStep === 1) {
    return `
      <p class="setup-step-copy">PAM estimates taxes from your income, state, and work type. Override only if you already know your rate.</p>
      <div class="onboarding-field-grid">
        <label><span>Estimated combined tax rate</span><small>Federal, state, and payroll/self-employment tax estimate.</small><input type="number" name="estimatedTaxRate" value="${baseline.estimatedTaxRate}" min="0" max="50" step="1" placeholder="PAM can estimate" /></label>
        <label><span>Deductions</span><small>Optional annual deductions that may reduce taxable income.</small><input type="number" name="deductions" value="${baseline.deductions}" min="0" step="100" placeholder="Optional" /></label>
        <label class="checkbox-label onboarding-wide"><input type="checkbox" name="taxRateOverride" ${baseline.taxRateOverride ? "checked" : ""} /> <span>Override tax estimate manually</span></label>
      </div>
    `;
  }

  if (state.setupStep === 2) {
    return `
      <p class="setup-step-copy">Now add the money already spoken for. This is what turns income into a real monthly buffer.</p>
      <div class="onboarding-field-grid">
        <label><span>Monthly expenses</span><small>Expected everyday spending like rent, food, utilities, transport, and subscriptions.</small><input type="number" name="monthlyExpenses" value="${baseline.monthlyExpenses}" min="0" step="50" placeholder="Example: 2600" /></label>
        <label><span>Monthly obligations</span><small>Fixed commitments like debt payments, insurance, tuition, or family support.</small><input type="number" name="monthlyObligations" value="${baseline.monthlyObligations}" min="0" step="50" placeholder="Example: 400" /></label>
        <label><span>Current savings</span><small>Cash you can actually use as a buffer if something goes wrong.</small><input type="number" name="currentSavings" value="${baseline.currentSavings}" min="0" step="100" placeholder="Example: 12000" /></label>
      </div>
    `;
  }

  return `
    <p class="setup-step-copy">Pick the goal PAM should protect first. PAM will not assume one until you choose it.</p>
    <div class="onboarding-field-grid">
      <label>
        <span>Long-term goal</span>
        <small>The life outcome PAM should measure decisions against.</small>
        <select name="longTermGoal">
          <option value="" ${baseline.longTermGoal === "" ? "selected" : ""}>Choose a goal</option>
          ${["Move out safely", "Build emergency savings", "Buy a car", "Start investing", "Reach a net worth target"].map((option) => `<option value="${option}" ${baseline.longTermGoal === option ? "selected" : ""}>${option}</option>`).join("")}
        </select>
      </label>
      <label><span>Goal target amount</span><small>How much money makes this goal feel realistically funded.</small><input type="number" name="goalTargetAmount" value="${baseline.goalTargetAmount}" min="0" step="100" placeholder="Example: 18000" /></label>
      <label><span>Goal timeline, months</span><small>When you hope to reach it. PAM checks if decisions push this out.</small><input type="number" name="goalTimelineMonths" value="${baseline.goalTimelineMonths}" min="1" step="1" placeholder="Example: 18" /></label>
    </div>
  `;
}

function renderAccountPreview() {
  const baseline = state.baseline;
  const tax = baseline.taxProfile;
  const isComplete = hasCompletedBaseline(baseline);
  const valueOrPending = (value, formatter = (item) => item) => hasValue(value) ? formatter(value) : "Not provided";
  return `
    <aside class="cash-flow-preview ${isComplete ? "" : "incomplete-preview"}">
      <div class="panel-kicker">${isComplete ? "Baseline ready" : "Setup in progress"}</div>
      <h3>${isComplete ? "Your PAM baseline" : "No baseline yet"}</h3>
      <p>${isComplete ? "PAM now has enough information to model decisions against your profile." : "PAM will show a baseline only after income, taxes, spending, savings, and a goal are provided."}</p>
      <div class="cash-flow-preview-grid">
        <div><span>Gross income</span><strong>${valueOrPending(baseline.grossMonthlyIncome, formatCurrency)}</strong><small>Before tax and deductions.</small></div>
        <div><span>Take-home</span><strong>${isComplete ? formatCurrency(baseline.takeHomeIncome) : "Pending"}</strong><small>Estimated spendable income.</small></div>
        <div><span>Tax rate</span><strong>${hasValue(baseline.estimatedTaxRate) ? `${baseline.estimatedTaxRate}%` : "Pending"}</strong><small>Combined estimate, not advice.</small></div>
        <div><span>Monthly buffer</span><strong>${isComplete ? formatCurrency(getMonthlyBuffer()) : "Pending"}</strong><small>Take-home minus spending commitments.</small></div>
        <div><span>Savings</span><strong>${valueOrPending(baseline.currentSavings, formatCurrency)}</strong><small>Cash runway PAM can protect.</small></div>
        <div><span>Goal</span><strong>${hasValue(baseline.longTermGoal) ? escapeHtml(baseline.longTermGoal) : "Not provided"}</strong><small>No assumed goal.</small></div>
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
    </div>
  `;
}

function renderBaselinePanel() {
  const steps = ["Income", "Taxes", "Spending", "Goals"];
  const isLastStep = state.setupStep === steps.length - 1;
  return `
    <section class="foresee-panel baseline-panel account-setup-panel" id="baseline-section">
      <div class="panel-kicker">Create account</div>
      <h2>Build your PAM baseline step by step.</h2>
      <p>PAM starts with a guided profile: income, employment status, taxes, expenses, obligations, savings, and goals. Then every decision is analyzed against that baseline.</p>

      <div class="onboarding-progress" aria-label="Account setup progress">
        ${steps.map((step, index) => `
          <span class="${index <= state.setupStep ? "active" : ""}">
            <strong>${index + 1}</strong>
            ${step}
          </span>
        `).join("")}
      </div>

      <div class="onboarding-layout">
        <form class="baseline-form onboarding-form" data-baseline-form>
          <h3>${steps[state.setupStep]}</h3>
          ${renderAccountSetupFields()}
          <div class="form-actions">
            ${state.setupStep > 0 ? '<button class="button button-secondary" type="submit" data-setup-action="back">Back</button>' : ""}
            <button class="button button-primary" type="submit" data-setup-action="${isLastStep ? "save" : "next"}">${isLastStep ? "Save baseline" : "Continue"}</button>
            <button class="button button-secondary" type="button" data-reset-baseline>Reset baseline</button>
          </div>
        </form>
        ${renderAccountPreview()}
      </div>
      ${renderSetupTermGuide()}
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
  if (!hasCompletedBaseline()) {
    return `
      <section class="foresee-panel result-panel locked-result">
        <div class="result-header">
          <div>
            <div class="panel-kicker">Result locked</div>
            <h2>Finish setup to model decisions.</h2>
          </div>
        </div>
        <p>PAM needs your income, tax context, monthly spending, savings, and one goal before it can calculate a real outcome. Until then, it will not show a fake baseline or pretend to know your priorities.</p>
      </section>
    `;
  }
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
        <div><strong>1</strong><span>Create your account baseline</span></div>
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
      if (hasCompletedBaseline()) {
        state.result = analyzeQuestion(question);
        state.status = "Example prompt analyzed. You can edit it and run another scenario.";
      } else {
        state.result = null;
        state.status = "Prompt saved. Finish account setup first so PAM can analyze it against your baseline.";
      }
      render();
      scrollToSection(hasCompletedBaseline() ? "#decision-input" : "#baseline-section");
    });
  });
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  state.result = hasCompletedBaseline() ? analyzeQuestion(state.question) : null;
  render();
}
