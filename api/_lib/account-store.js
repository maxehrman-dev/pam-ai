const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const MEMORY_STORE = global.__PAM_ACCOUNT_STORE__ || {
  accounts: [],
  sessions: {},
  verificationRequests: {}
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
        sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        verificationRequests:
          parsed.verificationRequests && typeof parsed.verificationRequests === "object"
            ? parsed.verificationRequests
            : {}
      };
  } catch (_error) {
    return MEMORY_STORE;
  }
}

function writeStore(store) {
  MEMORY_STORE.accounts = store.accounts;
  MEMORY_STORE.sessions = store.sessions;
  MEMORY_STORE.verificationRequests = store.verificationRequests;

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

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [name, domain] = normalized.split("@");
  if (!name || !domain) return normalized;
  const safeName = name.length <= 2 ? `${name[0] || ""}*` : `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 1))}`;
  return `${safeName}@${domain}`;
}

function pruneVerificationRequests(store, { emailAddress = "", purpose = "", removeMatching = false } = {}) {
  const now = Date.now();

  for (const [requestId, request] of Object.entries(store.verificationRequests || {})) {
    const isExpired = !request?.expiresAt || new Date(request.expiresAt).getTime() < now;
    const matchesIdentity =
      Boolean(removeMatching) &&
      (!emailAddress || request.emailAddress === emailAddress) &&
      (!purpose || request.purpose === purpose);

    if (isExpired || matchesIdentity) {
      delete store.verificationRequests[requestId];
    }
  }
}

exports.createVerificationRequest = ({ emailAddress, purpose = "signup" }) => {
  const email = normalizeEmail(emailAddress);
  if (!email) {
    throw new Error("Add an email before requesting a verification code.");
  }

  const store = readStore();
  if (purpose === "signup" && store.accounts.some((account) => account.emailAddress === email)) {
    throw new Error("An account with that email already exists.");
  }

  pruneVerificationRequests(store, { emailAddress: email, purpose, removeMatching: true });

  const requestId = generateId("verify");
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  store.verificationRequests[requestId] = {
    emailAddress: email,
    purpose,
    code,
    expiresAt,
    createdAt: new Date().toISOString()
  };
  writeStore(store);

  return {
    requestId,
    maskedEmail: maskEmail(email),
    expiresAt,
    previewCode: code
  };
};

function consumeVerificationRequest(store, { emailAddress, requestId, verificationCode, purpose = "signup" }) {
  const email = normalizeEmail(emailAddress);
  pruneVerificationRequests(store);
  const request = store.verificationRequests[String(requestId || "")];

  if (!request) {
    writeStore(store);
    throw new Error("Request a fresh verification code before creating the account.");
  }

  if (request.purpose !== purpose || request.emailAddress !== email) {
    writeStore(store);
    throw new Error("This verification code does not match the email you entered.");
  }

  if (new Date(request.expiresAt).getTime() < Date.now()) {
    delete store.verificationRequests[String(requestId || "")];
    writeStore(store);
    throw new Error("That verification code expired. Request a new one.");
  }

  if (String(verificationCode || "").trim() !== String(request.code)) {
    writeStore(store);
    throw new Error("That verification code is incorrect.");
  }

  delete store.verificationRequests[String(requestId || "")];
}

exports.createAccount = ({
  firstName,
  emailAddress,
  password,
  age,
  employmentStatus,
  stateCode,
  verificationRequestId,
  verificationCode
}) => {
  const email = normalizeEmail(emailAddress);
  const store = readStore();
  if (store.accounts.some((account) => account.emailAddress === email)) {
    throw new Error("An account with that email already exists.");
  }

  consumeVerificationRequest(store, {
    emailAddress: email,
    requestId: verificationRequestId,
    verificationCode,
    purpose: "signup"
  });

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
