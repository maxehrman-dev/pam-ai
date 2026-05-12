const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit } = require("../_lib/security.js");

const plaidLikeData = {
  accounts: [
    { id: "acct_checking_1", name: "Everyday Checking", type: "checking", current: 4450, available: 4210 },
    { id: "acct_savings_1", name: "High Yield Savings", type: "savings", current: 14800, available: 14800 },
    { id: "acct_savings_2", name: "Travel Sinking Fund", type: "savings", current: 2600, available: 2600 },
    { id: "acct_invest_1", name: "Roth IRA", type: "investment", current: 9400, available: 9400 },
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

const baseline = {
  source: "plaid_mock",
  profile: {
    firstName: "Jordan",
    emailAddress: "jordan@example.com",
    name: "Jordan",
    age: 24,
    state: "CA",
    employmentStatus: "w2"
  },
  income: {
    grossMonthlyIncome: null,
    knownTakeHomeMonthlyIncome: null,
    detectedMonthlyIncome: 4450,
    incomeStreams: [{ label: "Detected paycheck deposits", amount: 4450, cadence: "monthly", confidence: "medium" }]
  },
  expenses: {
    monthlyExpenses: 2885,
    recurringExpenses: [
      { name: "Rent", amount: 1650, category: "housing", frequency: "monthly" },
      { name: "Groceries", amount: 420, category: "food", frequency: "monthly" },
      { name: "Transportation", amount: 260, category: "transportation", frequency: "monthly" },
      { name: "Subscriptions", amount: 75, category: "subscriptions", frequency: "monthly" },
      { name: "Dining", amount: 320, category: "dining", frequency: "monthly" },
      { name: "Utilities", amount: 160, category: "utilities", frequency: "monthly" }
    ],
    categoryBreakdown: {
      housing: 1650,
      food: 420,
      transportation: 260,
      subscriptions: 75,
      dining: 320,
      utilities: 160
    }
  },
  obligations: {
    monthlyDebtPayments: 330,
    liabilities: [
      { type: "student_loan", name: "Student Loan", balance: 12000, minimumPayment: 280 },
      { type: "credit_card", name: "Travel Rewards Card", balance: 600, minimumPayment: 50 }
    ]
  },
  savings: {
    currentSavings: 17400,
    checkingBalance: 4450,
    savingsBalance: 17400,
    connectedAccounts: [
      { id: "acct_checking_1", name: "Everyday Checking", type: "checking", current: 4450, available: 4210 },
      { id: "acct_savings_1", name: "High Yield Savings", type: "savings", current: 14800, available: 14800 },
      { id: "acct_savings_2", name: "Travel Sinking Fund", type: "savings", current: 2600, available: 2600 },
      { id: "acct_invest_1", name: "Roth IRA", type: "investment", current: 9400, available: 9400 },
      { id: "acct_credit_1", name: "Travel Rewards Card", type: "credit", current: -600, available: 4400 }
    ],
    emergencyFundFloor: 8655
  },
  tax: {
    estimatedIncomeTaxRate: 11,
    payrollTaxRate: 8,
    combinedTaxRate: 19,
    annualDeductions: null,
    retirementContributionMonthly: null
  },
  goals: {
    primaryGoal: "Move out safely",
    goalTargetAmount: 17000,
    goalTimelineMonths: 18
  },
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confidence: "medium",
    notes: [
      "Sandbox-style data loaded. PAM built a financial baseline.",
      "This is mock data for Plaid Sandbox preparation, not a live bank connection."
    ]
  }
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return sendMethodNotAllowed(res);
  }

  if (
    !checkRateLimit(req, res, {
      routeKey: "plaid:mock-baseline",
      ipLimit: { windowMs: 60 * 1000, max: 30 }
    })
  ) {
    return;
  }

  return sendJson(res, 200, {
    ok: true,
    mode: "mock",
    plaidLikeData,
    baseline
  });
};
