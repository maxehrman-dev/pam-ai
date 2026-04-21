import { defaultGoals, financialProfile } from "../data/mockData.js";

const PROFILE_STORAGE_KEY = "pam-ai-profile-bundle-v2";
const GOALS_STORAGE_KEY = "pam-ai-goals-v1";
const TRUST_STORAGE_KEY = "pam-ai-trust-state-v2";

const DEFAULT_TRUST_STATE = {
  security: {
    twoFactorEnabled: true,
    twoFactorMethod: "Authenticator app",
    loginAlertsEnabled: true,
    biometricLockEnabled: true,
    trustedDevices: 2,
    recoveryCodesRemaining: 8,
    sessionTimeoutMinutes: 15,
    lastUpdated: "2026-04-21T09:00:00.000Z"
  },
  privacy: {
    policyVersion: "1.1",
    reviewedAt: "2026-04-21T09:00:00.000Z",
    dataExportAvailable: true,
    deleteAccessAvailable: true,
    plaidConnectionMode: "Scoped snapshot import",
    trainingConsentRequired: true
  }
};

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStorage(key) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined") return value;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    return value;
  }

  return value;
}

function buildDefaultSource() {
  return {
    kind: "mock",
    label: "Mock financial snapshot",
    status: "Plaid-ready",
    detail: "Using seeded balances and cash flow today. The simulator can switch to a Plaid-backed snapshot without rewriting the scenario engine.",
    nextStep: "Create a link token on the server, exchange the public token securely, then normalize accounts into this profile store."
  };
}

function isLiquidAccount(account) {
  return ["checking", "savings", "cash management", "money market", "depository"].includes(
    String(account.subtype || account.type || "").toLowerCase()
  );
}

function mapPlaidAccountToAsset(account) {
  const value = Number(account?.balances?.current ?? account?.balances?.available ?? 0);
  const subtype = String(account.subtype || account.type || "other");

  return {
    label: account.name || subtype,
    value,
    bucket: /investment|brokerage|ira|401k|retirement/i.test(subtype) ? "invest" : "cash",
    liquid: isLiquidAccount(account),
    note: account.official_name || "Imported from Plaid"
  };
}

function mapPlaidLiabilityToEntry(liability) {
  const monthlyPayment = Number(liability.monthlyPayment ?? liability.minimumPayment ?? 0);

  return {
    label: liability.name || liability.type || "Linked liability",
    balance: Number(liability.balance ?? liability.current ?? 0),
    rate: Number(liability.rate ?? 0),
    monthlyPayment,
    principalShare: monthlyPayment * 0.65
  };
}

export function applyPlaidSnapshotToProfile(baseProfile, snapshot = {}) {
  const profile = cloneValue(baseProfile);

  if (Array.isArray(snapshot.accounts) && snapshot.accounts.length > 0) {
    profile.assets = snapshot.accounts.map(mapPlaidAccountToAsset);
  }

  if (Array.isArray(snapshot.liabilities) && snapshot.liabilities.length > 0) {
    profile.liabilities = snapshot.liabilities.map(mapPlaidLiabilityToEntry);
  }

  if (snapshot.monthly?.income) {
    profile.monthly.income = snapshot.monthly.income;
  }

  if (snapshot.monthly?.fixed) {
    profile.monthly.fixed = snapshot.monthly.fixed;
  }

  if (snapshot.monthly?.variable) {
    profile.monthly.variable = snapshot.monthly.variable;
  }

  if (snapshot.monthly?.contributions) {
    profile.monthly.contributions = snapshot.monthly.contributions;
  }

  return profile;
}

export async function loadProfileBundle() {
  const stored = readStorage(PROFILE_STORAGE_KEY);

  if (stored?.snapshot) {
    return {
      profile: applyPlaidSnapshotToProfile(financialProfile, stored.snapshot),
      source: {
        kind: "plaid",
        label: stored?.source?.label || "Plaid-linked financial snapshot",
        status: "Connected",
        detail:
          stored?.source?.detail ||
          "Linked balances are shaping the simulator while cash-flow logic continues to use the normalized PAM profile schema.",
        nextStep:
          stored?.source?.nextStep ||
          "Refresh the normalized snapshot on each Plaid update so account connectivity stays isolated from decision logic."
      }
    };
  }

  return {
    profile: cloneValue(financialProfile),
    source: buildDefaultSource()
  };
}

export async function loadGoalsState() {
  const stored = readStorage(GOALS_STORAGE_KEY);
  return stored?.length ? cloneValue(stored) : cloneValue(defaultGoals);
}

export function saveGoalsState(goals) {
  return writeStorage(GOALS_STORAGE_KEY, cloneValue(goals));
}

export async function loadTrustState() {
  const stored = readStorage(TRUST_STORAGE_KEY);

  if (!stored) {
    return cloneValue(DEFAULT_TRUST_STATE);
  }

  return {
    security: {
      ...DEFAULT_TRUST_STATE.security,
      ...(stored.security || {})
    },
    privacy: {
      ...DEFAULT_TRUST_STATE.privacy,
      ...(stored.privacy || {})
    }
  };
}

export function saveTrustState(trustState) {
  const nextState = {
    security: {
      ...DEFAULT_TRUST_STATE.security,
      ...(trustState?.security || {})
    },
    privacy: {
      ...DEFAULT_TRUST_STATE.privacy,
      ...(trustState?.privacy || {})
    }
  };

  return writeStorage(TRUST_STORAGE_KEY, nextState);
}
