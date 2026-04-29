const PLAID_ENV = process.env.PLAID_ENV || "sandbox";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;

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

function estimateMonthlySnapshot(accounts = []) {
  const depository = accounts.filter((account) => account.type === "depository");
  const investment = accounts.filter((account) => account.type === "investment");

  return {
    income: [],
    fixed: [],
    variable: [],
    contributions: investment.length
      ? [
          {
            label: "Linked investment contribution",
            amount: 500,
            bucket: "invest"
          }
        ]
      : [],
    liquidEstimate: depository.reduce((total, account) => total + Number(account.balances?.current || 0), 0)
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

exports.createLinkToken = async ({ clientUserId, legalName, emailAddress }) => {
  return callPlaid("/link/token/create", {
    client_name: "PAM AI",
    country_codes: ["US"],
    language: "en",
    user: {
      client_user_id: String(clientUserId || `pam-${Date.now()}`),
      legal_name: legalName || undefined,
      email_address: emailAddress || undefined
    },
    products: ["transactions"],
    optional_products: ["liabilities"],
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

  return {
    accessToken: exchange.access_token,
    itemId: exchange.item_id,
    snapshot: {
      accounts: normalizeAccounts(accounts),
      liabilities,
      monthly: estimateMonthlySnapshot(accounts)
    },
    institutionName: institution?.name || "Linked institution"
  };
};
