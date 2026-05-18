const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  createSession: createSupabaseSession,
  deleteVerificationRequests,
  deleteSession: deleteSupabaseSession,
  findAccountByEmail,
  findAccountById,
  findVerificationRequest,
  getSession: getSupabaseSession,
  hasSupabaseConfig,
  insertAccount,
  insertVerificationRequest
} = require("./supabase.js");

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function getVerificationSecret() {
  return (
    process.env.PAM_VERIFICATION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.RESEND_API_KEY ||
    "pam-local-verification-secret"
  );
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getVerificationSecret()).update(payload).digest("base64url");
}

function createVerificationToken({ emailAddress, purpose, code, expiresAt }) {
  const payload = base64UrlEncode(JSON.stringify({
    emailAddress: normalizeEmail(emailAddress),
    purpose,
    code,
    expiresAt,
    nonce: crypto.randomBytes(10).toString("hex")
  }));
  return `${payload}.${signPayload(payload)}`;
}

function readVerificationToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload));
  } catch (_error) {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return {
    algorithm: "scrypt",
    salt,
    hash
  };
}

function verifyPassword(password, account) {
  if (!account?.passwordSalt || !account?.passwordHash) return false;

  if (account.passwordAlgorithm === "scrypt") {
    const expected = Buffer.from(String(account.passwordHash || ""), "hex");
    const actual = crypto.scryptSync(String(password || ""), account.passwordSalt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  const legacyHash = crypto
    .pbkdf2Sync(String(password || ""), account.passwordSalt, 100000, 64, "sha512")
    .toString("hex");
  const expected = Buffer.from(String(account.passwordHash || ""), "hex");
  const actual = Buffer.from(legacyHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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

function hashVerificationCode(code, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(String(code || ""), salt, 32).toString("hex")
  };
}

function verifyCodeHash(code, salt, hash) {
  const expected = Buffer.from(String(hash || ""), "hex");
  const actual = crypto.scryptSync(String(code || ""), String(salt || ""), 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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

function pruneSessions(store) {
  const now = Date.now();
  for (const [sessionToken, session] of Object.entries(store.sessions || {})) {
    const createdAt = new Date(session?.createdAt || 0).getTime();
    if (!createdAt || createdAt + SESSION_TTL_MS < now) {
      delete store.sessions[sessionToken];
    }
  }
}

exports.createVerificationRequest = async ({ emailAddress, purpose = "signup" }) => {
  const email = normalizeEmail(emailAddress);
  if (!email) {
    throw new Error("Add an email before requesting a verification code.");
  }

  const store = readStore();
  pruneSessions(store);
  const existingAccount = hasSupabaseConfig()
    ? await findAccountByEmail(email)
    : store.accounts.find((account) => account.emailAddress === email);

  if (purpose === "signup" && existingAccount) {
    throw new Error("An account with that email already exists.");
  }

  pruneVerificationRequests(store, { emailAddress: email, purpose, removeMatching: true });

  const requestId = generateId("verify");
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  if (hasSupabaseConfig()) {
    const codeRecord = hashVerificationCode(code);
    await deleteVerificationRequests({ emailAddress: email, purpose });
    await insertVerificationRequest({
      requestId,
      emailAddress: email,
      purpose,
      codeHash: codeRecord.hash,
      codeSalt: codeRecord.salt,
      expiresAt,
      createdAt
    });

    return {
      requestId,
      maskedEmail: maskEmail(email),
      expiresAt,
      previewCode: code,
      verificationToken: ""
    };
  }

  store.verificationRequests[requestId] = {
    emailAddress: email,
    purpose,
    code,
    expiresAt,
    createdAt
  };
  writeStore(store);

  return {
    requestId,
    maskedEmail: maskEmail(email),
    expiresAt,
    previewCode: code,
    verificationToken: createVerificationToken({
      emailAddress: email,
      purpose,
      code,
      expiresAt
    })
  };
};

function consumeVerificationToken({ emailAddress, verificationCode, verificationToken, purpose }) {
  const email = normalizeEmail(emailAddress);
  const request = readVerificationToken(verificationToken);
  if (!request) {
    throw new Error("Verification expired. Send a new code.");
  }

  if (request.purpose !== purpose || request.emailAddress !== email) {
    throw new Error("This verification code does not match the email you entered.");
  }

  if (new Date(request.expiresAt).getTime() < Date.now()) {
    throw new Error("Verification expired. Send a new code.");
  }

  if (String(verificationCode || "").trim() !== String(request.code)) {
    throw new Error("That verification code is incorrect.");
  }
}

async function consumeVerificationRequest(store, { emailAddress, requestId, verificationCode, verificationToken = "", purpose = "signup" }) {
  const email = normalizeEmail(emailAddress);

  if (hasSupabaseConfig()) {
    const request = await findVerificationRequest(String(requestId || ""));
    if (!request) {
      throw new Error("Request a fresh verification code before creating the account.");
    }

    if (request.purpose !== purpose || request.email_address !== email) {
      throw new Error("This verification code does not match the email you entered.");
    }

    if (new Date(request.expires_at).getTime() < Date.now()) {
      await deleteVerificationRequests({ requestId });
      throw new Error("That verification code expired. Request a new one.");
    }

    if (!verifyCodeHash(verificationCode, request.code_salt, request.code_hash)) {
      throw new Error("That verification code is incorrect.");
    }

    await deleteVerificationRequests({ requestId });
    return;
  }

  pruneVerificationRequests(store);
  const request = store.verificationRequests[String(requestId || "")];

  if (!request) {
    writeStore(store);
    if (!verificationToken) {
      throw new Error("Request a fresh verification code before creating the account.");
    }
    consumeVerificationToken({
      emailAddress: email,
      verificationCode,
      verificationToken,
      purpose
    });
    return;
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

exports.createAccount = async ({
  firstName,
  emailAddress,
  password,
  age,
  employmentStatus,
  stateCode,
  verificationRequestId,
  verificationCode,
  verificationToken
}) => {
  const email = normalizeEmail(emailAddress);
  const store = readStore();
  pruneSessions(store);
  const existingAccount = hasSupabaseConfig()
    ? await findAccountByEmail(email)
    : store.accounts.find((account) => account.emailAddress === email);

  if (existingAccount) {
    throw new Error("An account with that email already exists.");
  }

  await consumeVerificationRequest(store, {
    emailAddress: email,
    requestId: verificationRequestId,
    verificationCode,
    verificationToken,
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
    passwordAlgorithm: passwordRecord.algorithm,
    passwordSalt: passwordRecord.salt,
    passwordHash: passwordRecord.hash
  };

  const sessionToken = generateId("sess");
  const sessionCreatedAt = new Date().toISOString();

  if (hasSupabaseConfig()) {
    await insertAccount(account);
    await createSupabaseSession({
      sessionToken,
      accountId: account.id,
      createdAt: sessionCreatedAt
    });
  } else {
    store.accounts.push(account);
    store.sessions[sessionToken] = {
      accountId: account.id,
      createdAt: sessionCreatedAt
    };
    writeStore(store);
  }

  return {
    account: sanitizeAccount(account),
    sessionToken
  };
};

exports.loginAccount = async ({ emailAddress, password }) => {
  const email = normalizeEmail(emailAddress);
  const store = readStore();
  pruneSessions(store);
  const account = hasSupabaseConfig()
    ? await findAccountByEmail(email)
    : store.accounts.find((item) => item.emailAddress === email);

  if (!account) {
    throw new Error("No account was found for that email.");
  }

  if (!verifyPassword(password, account)) {
    throw new Error("Incorrect email or password.");
  }

  const sessionToken = generateId("sess");
  const sessionCreatedAt = new Date().toISOString();

  if (hasSupabaseConfig()) {
    await createSupabaseSession({
      sessionToken,
      accountId: account.id,
      createdAt: sessionCreatedAt
    });
  } else {
    store.sessions[sessionToken] = {
      accountId: account.id,
      createdAt: sessionCreatedAt
    };
    writeStore(store);
  }

  return {
    account: sanitizeAccount(account),
    sessionToken
  };
};

exports.getSessionAccount = async (sessionToken) => {
  if (hasSupabaseConfig()) {
    const session = await getSupabaseSession(sessionToken);
    if (!session?.account_id) return null;
    const account = await findAccountById(session.account_id);
    return account ? sanitizeAccount(account) : null;
  }

  const store = readStore();
  pruneSessions(store);
  const session = store.sessions[String(sessionToken || "")];
  if (!session?.accountId) return null;
  const account = store.accounts.find((item) => item.id === session.accountId);
  return account ? sanitizeAccount(account) : null;
};

exports.clearSession = async (sessionToken) => {
  if (hasSupabaseConfig()) {
    await deleteSupabaseSession(sessionToken);
    return;
  }

  const store = readStore();
  pruneSessions(store);
  delete store.sessions[String(sessionToken || "")];
  writeStore(store);
};
