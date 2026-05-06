const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const MEMORY_STORE = global.__PAM_ACCOUNT_STORE__ || {
  accounts: [],
  sessions: {}
};

global.__PAM_ACCOUNT_STORE__ = MEMORY_STORE;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function canUseFileStore() {
  try {
    ensureDataDir();
    return true;
  } catch (_error) {
    return false;
  }
}

function readStore() {
  if (!canUseFileStore()) return MEMORY_STORE;

  try {
    if (!fs.existsSync(DATA_FILE)) {
      return MEMORY_STORE;
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {}
    };
  } catch (_error) {
    return MEMORY_STORE;
  }
}

function writeStore(store) {
  MEMORY_STORE.accounts = store.accounts;
  MEMORY_STORE.sessions = store.sessions;

  if (!canUseFileStore()) return;

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (_error) {
    // Fallback stays in memory for serverless/ephemeral environments.
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function sanitizeAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    firstName: account.firstName,
    emailAddress: account.emailAddress,
    age: account.age,
    employmentStatus: account.employmentStatus,
    stateCode: account.stateCode,
    createdAt: account.createdAt
  };
}

exports.createAccount = ({ firstName, emailAddress, password, age, employmentStatus, stateCode }) => {
  const email = normalizeEmail(emailAddress);
  const store = readStore();
  if (store.accounts.some((account) => account.emailAddress === email)) {
    throw new Error("An account with that email already exists.");
  }

  const passwordRecord = hashPassword(password);
  const account = {
    id: generateId("acct"),
    firstName: String(firstName || "").trim(),
    emailAddress: email,
    age: age ?? null,
    employmentStatus: employmentStatus || "Not sure yet",
    stateCode: stateCode || "OTHER",
    createdAt: new Date().toISOString(),
    passwordSalt: passwordRecord.salt,
    passwordHash: passwordRecord.hash
  };

  const sessionToken = generateId("sess");
  store.accounts.push(account);
  store.sessions[sessionToken] = {
    accountId: account.id,
    createdAt: new Date().toISOString()
  };
  writeStore(store);

  return {
    account: sanitizeAccount(account),
    sessionToken
  };
};

exports.loginAccount = ({ emailAddress, password }) => {
  const email = normalizeEmail(emailAddress);
  const store = readStore();
  const account = store.accounts.find((item) => item.emailAddress === email);
  if (!account) {
    throw new Error("No account was found for that email.");
  }

  const passwordRecord = hashPassword(password, account.passwordSalt);
  if (passwordRecord.hash !== account.passwordHash) {
    throw new Error("Incorrect email or password.");
  }

  const sessionToken = generateId("sess");
  store.sessions[sessionToken] = {
    accountId: account.id,
    createdAt: new Date().toISOString()
  };
  writeStore(store);

  return {
    account: sanitizeAccount(account),
    sessionToken
  };
};

exports.getSessionAccount = (sessionToken) => {
  const store = readStore();
  const session = store.sessions[String(sessionToken || "")];
  if (!session?.accountId) return null;
  const account = store.accounts.find((item) => item.id === session.accountId);
  return account ? sanitizeAccount(account) : null;
};

exports.clearSession = (sessionToken) => {
  const store = readStore();
  delete store.sessions[String(sessionToken || "")];
  writeStore(store);
};
