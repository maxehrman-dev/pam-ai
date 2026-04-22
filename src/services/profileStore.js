import { defaultGoals, financialProfile, plaidSandboxSnapshot } from "../data/mockData.js";

const PROFILE_STORAGE_KEY = "pam-ai-profile-bundle-v3";
const GOALS_STORAGE_KEY = "pam-ai-goals-v1";
const TRUST_STORAGE_KEY = "pam-ai-trust-state-v2";
const ACCOUNT_STORAGE_KEY = "pam-ai-account-state-v1";

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

const DEFAULT_ACCOUNT_STATE = {
  isCreated: false,
  plan: "Founding",
  email: "avery@pamai.app",
  createdAt: null,
  lastLoginAt: "2026-04-21T09:00:00.000Z",
  plaidLinked: false,
  plaidInstitution: "Not connected",
  profileCompletion: 72,
  onboardingStep: "Create your account"
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
    label: "Guided demo profile",
    status: "Demo mode",
    detail: "Using a seeded financial profile so the homepage simulator works immediately. Users can personalize this profile or switch to a Plaid-backed snapshot without rewriting the scenario engine.",
    nextStep: "Create an account, personalize the baseline, then replace demo balances with a tokenized Plaid snapshot."
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

  if (stored?.profile) {
    return {
      profile: cloneValue(stored.profile),
      source: {
        ...buildDefaultSource(),
        ...(stored?.source || {}),
        kind: stored?.source?.kind || "mock",
        status: stored?.source?.status || "Demo mode"
      },
      snapshot: stored?.snapshot ? cloneValue(stored.snapshot) : null
    };
  }

  if (stored?.snapshot) {
    return {
      profile: applyPlaidSnapshotToProfile(financialProfile, stored.snapshot),
      source: {
        ...buildDefaultSource(),
        ...(stored?.source || {}),
        kind: stored?.source?.kind || "plaid",
        status: stored?.source?.status || "Connected"
      },
      snapshot: cloneValue(stored.snapshot)
    };
  }

  return {
    profile: cloneValue(financialProfile),
    source: buildDefaultSource(),
    snapshot: null
  };
}

export function saveProfileBundle(bundle) {
  const nextBundle = {
    profile: cloneValue(bundle.profile),
    source: {
      ...buildDefaultSource(),
      ...(bundle.source || {})
    },
    snapshot: bundle.snapshot ? cloneValue(bundle.snapshot) : null
  };

  writeStorage(PROFILE_STORAGE_KEY, nextBundle);
  return nextBundle;
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

export async function loadAccountState() {
  const stored = readStorage(ACCOUNT_STORAGE_KEY);
  return {
    ...DEFAULT_ACCOUNT_STATE,
    ...(stored || {})
  };
}

export function saveAccountState(accountState) {
  const nextState = {
    ...DEFAULT_ACCOUNT_STATE,
    ...(accountState || {})
  };

  return writeStorage(ACCOUNT_STORAGE_KEY, nextState);
}

export function createAccountProfile(profile, accountDraft) {
  const nextProfile = cloneValue(profile);
  nextProfile.user.name = accountDraft.name || nextProfile.user.name;
  nextProfile.user.city = accountDraft.city || nextProfile.user.city;
  nextProfile.user.objective = accountDraft.objective || nextProfile.user.objective;
  return nextProfile;
}

export function personalizeProfile(profile, updates) {
  const nextProfile = cloneValue(profile);

  nextProfile.user.name = updates.name || nextProfile.user.name;
  nextProfile.user.city = updates.city || nextProfile.user.city;
  nextProfile.user.objective = updates.objective || nextProfile.user.objective;

  if (Number.isFinite(Number(updates.salaryIncome))) {
    nextProfile.monthly.income[0].amount = Number(updates.salaryIncome);
  }

  if (Number.isFinite(Number(updates.sideIncome))) {
    if (nextProfile.monthly.income[1]) {
      nextProfile.monthly.income[1].amount = Number(updates.sideIncome);
    }
  }

  if (Number.isFinite(Number(updates.rentAmount))) {
    const rentLine = nextProfile.monthly.fixed.find((entry) => /rent|housing|mortgage/i.test(entry.label));
    if (rentLine) rentLine.amount = Number(updates.rentAmount);
  }

  if (Number.isFinite(Number(updates.lifestyleSpend))) {
    const lifestyleLine = nextProfile.monthly.variable.find((entry) => /lifestyle/i.test(entry.label));
    if (lifestyleLine) lifestyleLine.amount = Number(updates.lifestyleSpend);
  }

  if (Number.isFinite(Number(updates.liquidCash))) {
    const liquidAsset = nextProfile.assets.find((asset) => asset.liquid);
    if (liquidAsset) liquidAsset.value = Number(updates.liquidCash);
  }

  if (Number.isFinite(Number(updates.investmentsBalance))) {
    const investAsset = nextProfile.assets.find((asset) => asset.bucket === "invest");
    if (investAsset) investAsset.value = Number(updates.investmentsBalance);
  }

  return nextProfile;
}

export function connectPlaidSandbox(profile) {
  const snapshot = cloneValue(plaidSandboxSnapshot);

  return saveProfileBundle({
    profile: applyPlaidSnapshotToProfile(profile, snapshot),
    snapshot,
    source: {
      kind: "plaid",
      label: "Plaid sandbox snapshot",
      status: "Connected",
      detail: "Sandbox balances and liabilities are now feeding the normalized PAM profile so the simulator can behave like a connected account experience.",
      nextStep: "Replace the sandbox link flow with a server-created link token, public-token exchange, and scheduled snapshot refresh."
    }
  });
}

export function disconnectPlaidSnapshot(bundle) {
  return saveProfileBundle({
    profile: cloneValue(bundle.profile),
    source: buildDefaultSource(),
    snapshot: null
  });
}
