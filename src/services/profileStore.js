import { financialProfile } from "../data/mockData.js";

const PROFILE_STORAGE_KEY = "pam-ai-profile-bundle-v1";
const TRUST_STORAGE_KEY = "pam-ai-trust-state-v1";

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
    policyVersion: "1.0",
    reviewedAt: "2026-04-21T09:00:00.000Z",
    dataExportAvailable: true,
    deleteAccessAvailable: true,
    plaidConnectionMode: "Scoped snapshot import",
    trainingConsentRequired: true
  }
};

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefaultSource() {
  return {
    kind: "mock",
    label: "Mock financial snapshot",
    status: "Plaid-ready",
    detail: "Using seeded balances and cash flow today. The simulator can swap this source for Plaid account data without changing the scenario engine.",
    nextStep: "Add a Plaid link flow and persist a normalized account snapshot into the profile store."
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
  return {
    label: liability.name || liability.type || "Linked liability",
    balance: Number(liability.balance ?? liability.current ?? 0),
    rate: Number(liability.rate ?? 0),
    monthlyPayment: Number(liability.monthlyPayment ?? liability.minimumPayment ?? 0),
    principalShare: Number(liability.principalShare ?? liability.minimumPayment ?? 0) * 0.65
  };
}

export function applyPlaidSnapshotToProfile(baseProfile, snapshot = {}) {
  const profile = cloneProfile(baseProfile);

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

function readStoredProfileBundle() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function readStoredTrustState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(TRUST_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export async function loadProfileBundle() {
  const stored = readStoredProfileBundle();

  if (stored?.snapshot) {
    return {
      profile: applyPlaidSnapshotToProfile(financialProfile, stored.snapshot),
      source: {
        kind: "plaid",
        label: stored?.source?.label || "Plaid-linked financial snapshot",
        status: "Connected",
        detail:
          stored?.source?.detail ||
          "Connected balances are shaping the simulator while recurring cash flow continues to use the normalized profile structure.",
        nextStep:
          stored?.source?.nextStep ||
          "Keep the normalized schema stable so Plaid refreshes and scenario math stay decoupled."
      }
    };
  }

  return {
    profile: cloneProfile(financialProfile),
    source: buildDefaultSource()
  };
}

export async function loadTrustState() {
  const stored = readStoredTrustState();

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

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TRUST_STORAGE_KEY, JSON.stringify(nextState));
    } catch (_error) {
      return nextState;
    }
  }

  return nextState;
}
