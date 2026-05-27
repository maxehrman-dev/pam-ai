const PLAID_ENV = process.env.PLAID_ENV || "sandbox";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_PRODUCTS = String(process.env.PLAID_PRODUCTS || "transactions,balance,liabilities")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const PLAID_COUNTRY_CODES = String(process.env.PLAID_COUNTRY_CODES || "US")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const LINK_TOKEN_PRODUCTS = PLAID_PRODUCTS.filter((value) => value !== "balance");
const SANDBOX_ACCESS_TOKENS = new Map();

const BASE_URLS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
};

function getBaseUrl() {
  return BASE_URLS[PLAID_ENV] || BASE_URLS.sandbox;
}

function getHeaders() {
  return {
    "Content-Type": "application/json"
  };
}

function assertConfigured() {
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be configured.");
  }
}

function isConfigured() {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
}

function sanitizeClientUserId(value) {
  const candidate = String(value || "").trim();
  if (!candidate || /@|\s/.test(candidate)) {
    return `pam-user-${Date.now()}`;
  }
  return candidate.slice(0, 128);
}

function getSessionKey(clientUserId = "prototype") {
  return sanitizeClientUserId(clientUserId || "prototype");
}

async function callPlaid(path, payload) {
  assertConfigured();

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      ...payload
    })
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.error_message || json?.display_message || `Plaid request failed for ${path}.`;
    throw new Error(message);
  }

  return json;
}

function normalizeCategory(value) {
  if (Array.isArray(value)) return value.join(" / ");
  return value || "Uncategorized";
}

function normalizeAccounts(accounts = []) {
  return accounts.map((account) => ({
    name: account.name,
    official_name: account.official_name,
    type: account.type,
    subtype: account.subtype,
    balances: {
      available: account.balances?.available ?? null,
      current: account.balances?.current ?? 0
    }
  }));
}

function normalizeLiabilities(liabilities = {}) {
  const rows = [];
  for (const bucket of Object.values(liabilities || {})) {
    if (!Array.isArray(bucket)) continue;
    for (const liability of bucket) {
      rows.push({
        name: liability.account_name || liability.name || liability.type || "Liability",
        type: liability.type || liability.subtype || "liability",
        balance: liability.current_balance ?? liability.last_payment_amount ?? 0,
        rate: liability.interest_rate_percentage ?? 0,
        monthlyPayment: liability.minimum_payment_amount ?? liability.last_payment_amount ?? 0
      });
    }
  }
  return rows;
}

function normalizeTransactions(transactions = []) {
  return transactions.slice(0, 60).map((transaction) => ({
    name: transaction.name,
    amount: Number(transaction.amount || 0),
    date: transaction.date,
    category: normalizeCategory(transaction.category || transaction.personal_finance_category?.primary),
    recurring: Boolean(transaction.personal_finance_category?.detailed?.includes("RECURRING"))
  }));
}

function estimateMonthlySnapshot(accounts = [], transactions = []) {
  const depository = accounts.filter((account) => account.type === "depository");
  const investment = accounts.filter((account) => account.type === "investment");
  const recentTransactions = normalizeTransactions(transactions);
  const monthlyIncome = Math.round(
    recentTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + Math.abs(transaction.amount), 0) / 3
  );
  const monthlyOutflow = Math.round(
    recentTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0) / 3
  );

  return {
    income: monthlyIncome
      ? [
          {
            label: "Plaid-estimated recurring income",
            amount: monthlyIncome
          }
        ]
      : [],
    fixed: monthlyOutflow
      ? [
          {
            label: "Plaid-estimated recurring obligations",
            amount: Math.round(monthlyOutflow * 0.68),
            essential: true
          }
        ]
      : [],
    variable: monthlyOutflow
      ? [
          {
            label: "Plaid-estimated flexible spending",
            amount: Math.round(monthlyOutflow * 0.32),
            essential: false
          }
        ]
      : [],
    contributions: investment.length
      ? [
          {
            label: "Linked investment contribution",
            amount: 500,
            bucket: "invest"
          }
        ]
      : [],
    liquidEstimate: depository.reduce((total, account) => total + Number(account.balances?.current || 0), 0),
    transactionSignals: recentTransactions.slice(0, 8)
  };
}

async function getAccounts(accessToken) {
  const response = await callPlaid("/accounts/get", {
    access_token: accessToken
  });

  return response.accounts || [];
}

async function getLiabilities(accessToken) {
  try {
    const response = await callPlaid("/liabilities/get", {
      access_token: accessToken
    });
    return normalizeLiabilities(response.liabilities);
  } catch (_error) {
    return [];
  }
}

async function getTransactions(accessToken) {
  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
    const response = await callPlaid("/transactions/get", {
      access_token: accessToken,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      options: {
        count: 100
      }
    });
    return response.transactions || [];
  } catch (_error) {
    return [];
  }
}

function mapAccountType(account = {}) {
  const subtype = String(account.subtype || "").toLowerCase();
  const type = String(account.type || "").toLowerCase();
  if (subtype.includes("checking")) return "checking";
  if (subtype.includes("savings")) return "savings";
  if (type.includes("credit")) return "credit";
  return subtype || type || "account";
}

function mapEmploymentStatus(transactions = []) {
  const payrollNames = transactions
    .filter((transaction) => Number(transaction.amount || 0) < 0)
    .map((transaction) => String(transaction.name || "").toLowerCase());

  if (payrollNames.some((name) => /payroll|adp|gusto|salary|wages|employer/.test(name))) {
    return "w2";
  }

  return "unknown";
}

function deriveRecurringExpenses(transactions = []) {
  const outgoing = transactions.filter((transaction) => Number(transaction.amount || 0) > 0);
  return outgoing.map((transaction) => ({
    name: transaction.name,
    amount: Math.round(Number(transaction.amount || 0)),
    category: normalizeCategory(transaction.category || transaction.personal_finance_category?.primary),
    frequency: "monthly"
  }));
}

function deriveIncomeStreams(transactions = []) {
  const incoming = transactions.filter((transaction) => Number(transaction.amount || 0) < 0);
  const total = incoming.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  return total
    ? [
        {
          label: "Detected paycheck deposits",
          amount: Math.round(total / 3),
          cadence: "monthly",
          confidence: "medium"
        }
      ]
    : [];
}

function deriveCategoryBreakdown(recurringExpenses = []) {
  return recurringExpenses.reduce((accumulator, expense) => {
    accumulator[expense.category] = (accumulator[expense.category] || 0) + Number(expense.amount || 0);
    return accumulator;
  }, {});
}

function toNormalizedBaseline({ accounts = [], transactions = [], liabilities = [], profile = {} }) {
  const recurringExpenses = deriveRecurringExpenses(transactions);
  const categoryBreakdown = deriveCategoryBreakdown(recurringExpenses);
  const monthlyExpenses = recurringExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomeStreams = deriveIncomeStreams(transactions);
  const detectedMonthlyIncome = incomeStreams[0]?.amount || 0;
  const checkingBalance = accounts
    .filter((account) => mapAccountType(account) === "checking")
    .reduce((sum, account) => sum + Number(account.balances?.current || 0), 0);
  const savingsBalance = accounts
    .filter((account) => mapAccountType(account) === "savings")
    .reduce((sum, account) => sum + Number(account.balances?.current || 0), 0);
  const connectedAccounts = accounts.map((account, index) => ({
    id: account.account_id || `${account.name || "account"}-${index}`,
    name: account.name || account.official_name || "Connected account",
    type: mapAccountType(account),
    subtype: account.subtype || "",
    current: Number(account.balances?.current || 0),
    available: account.balances?.available ?? null
  }));
  const monthlyDebtPayments = liabilities.reduce((sum, item) => sum + Number(item.monthlyPayment || 0), 0);
  const emergencyFundFloor = Math.round(monthlyExpenses * 3);
  const now = new Date().toISOString();

  return {
    source: "plaid_sandbox",
    profile: {
      firstName: profile.firstName || "",
      emailAddress: profile.emailAddress || "",
      name: profile.firstName || "",
      age: profile.age ?? null,
      state: profile.state || "CA",
      employmentStatus: profile.employmentStatus || mapEmploymentStatus(transactions)
    },
    income: {
      grossMonthlyIncome: null,
      knownTakeHomeMonthlyIncome: null,
      detectedMonthlyIncome,
      incomeStreams
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
        balance: Number(item.balance || 0),
        minimumPayment: Number(item.monthlyPayment || 0)
      }))
    },
    savings: {
      currentSavings: savingsBalance || null,
      checkingBalance: checkingBalance || null,
      savingsBalance: savingsBalance || null,
      connectedAccounts,
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
      createdAt: now,
      updatedAt: now,
      confidence: "medium",
      notes: [
        "Sandbox account connected. PAM built your baseline.",
        "This baseline came from Plaid Sandbox data, not a production bank connection."
      ]
    }
  };
}

exports.createLinkToken = async ({ clientUserId, legalName, emailAddress }) => {
  return callPlaid("/link/token/create", {
    client_name: "PAM AI",
    country_codes: PLAID_COUNTRY_CODES,
    language: "en",
    user: {
      client_user_id: sanitizeClientUserId(clientUserId),
      legal_name: legalName || undefined,
      email_address: emailAddress || undefined
    },
    products: LINK_TOKEN_PRODUCTS.filter((value) => value !== "liabilities"),
    optional_products: LINK_TOKEN_PRODUCTS.includes("liabilities") ? ["liabilities"] : [],
    redirect_uri: process.env.PLAID_REDIRECT_URI || undefined
  });
};

exports.createSandboxPublicToken = async ({
  institutionId = "ins_109508",
  username = "user_good",
  password = "pass_good"
} = {}) => {
  return callPlaid("/sandbox/public_token/create", {
    institution_id: institutionId,
    initial_products: ["transactions"],
    options: {
      override_username: username,
      override_password: password
    }
  });
};

exports.exchangePublicToken = async ({ publicToken, institution }) => {
  const exchange = await callPlaid("/item/public_token/exchange", {
    public_token: publicToken
  });

  const accounts = await getAccounts(exchange.access_token);
  const liabilities = await getLiabilities(exchange.access_token);
  const transactions = await getTransactions(exchange.access_token);

  return {
    accessToken: exchange.access_token,
    itemId: exchange.item_id,
    snapshot: {
      accounts: normalizeAccounts(accounts),
      liabilities,
      monthly: estimateMonthlySnapshot(accounts, transactions),
      transactions: normalizeTransactions(transactions)
    },
    institutionName: institution?.name || "Linked institution"
  };
};

exports.hasPlaidConfig = isConfigured;

exports.storeAccessTokenForSession = ({ clientUserId, accessToken, itemId, institutionName, profile }) => {
  SANDBOX_ACCESS_TOKENS.set(getSessionKey(clientUserId), {
    accessToken,
    itemId,
    institutionName,
    profile,
    updatedAt: Date.now()
  });
};

exports.getStoredSession = (clientUserId) => SANDBOX_ACCESS_TOKENS.get(getSessionKey(clientUserId));

exports.buildNormalizedBaseline = async ({ clientUserId, session: providedSession }) => {
  const session = providedSession || SANDBOX_ACCESS_TOKENS.get(getSessionKey(clientUserId));
  if (!session?.accessToken) {
    throw new Error("No sandbox session available.");
  }

  const accounts = await getAccounts(session.accessToken);
  const liabilities = await getLiabilities(session.accessToken);
  const transactions = await getTransactions(session.accessToken);

  return toNormalizedBaseline({
    accounts,
    transactions,
    liabilities,
    profile: session.profile || {}
  });
};
