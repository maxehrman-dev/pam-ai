// Prefer the official Vercel Marketplace Supabase integration when it is connected.
// The legacy SUPABASE_* names remain supported so local/dev deployments do not break.
const SUPABASE_URL = String(
  process.env.PAM_SUPABASE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
).replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.PAM_SUPABASE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function isRecoverableSupabaseStorageError(error) {
  return /schema cache|could not find the table|does not exist|relation/i.test(String(error?.message || ""));
}

function getHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: getHeaders(options.headers || {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.hint || "Supabase request failed.";
    throw new Error(message);
  }

  return data;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

function fromDbAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    emailAddress: row.email_address,
    age: row.age,
    employmentStatus: row.employment_status,
    stateCode: row.state_code,
    createdAt: row.created_at,
    passwordAlgorithm: row.password_algorithm,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash
  };
}

function toDbAccount(account) {
  return {
    id: account.id,
    first_name: account.firstName,
    email_address: account.emailAddress,
    age: account.age,
    employment_status: account.employmentStatus,
    state_code: account.stateCode,
    created_at: account.createdAt,
    password_algorithm: account.passwordAlgorithm,
    password_salt: account.passwordSalt,
    password_hash: account.passwordHash
  };
}

async function findAccountByEmail(emailAddress) {
  const rows = await supabaseRequest(`pam_accounts?email_address=eq.${encodeFilter(emailAddress)}&limit=1`);
  return fromDbAccount(rows?.[0]);
}

async function findAccountById(accountId) {
  const rows = await supabaseRequest(`pam_accounts?id=eq.${encodeFilter(accountId)}&limit=1`);
  return fromDbAccount(rows?.[0]);
}

async function insertAccount(account) {
  const rows = await supabaseRequest("pam_accounts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(toDbAccount(account))
  });
  return fromDbAccount(rows?.[0]);
}

async function createSession({ sessionToken, accountId, createdAt }) {
  await supabaseRequest("pam_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      session_token: sessionToken,
      account_id: accountId,
      created_at: createdAt
    })
  });
}

async function getSession(sessionToken) {
  const rows = await supabaseRequest(`pam_sessions?session_token=eq.${encodeFilter(sessionToken)}&limit=1`);
  return rows?.[0] || null;
}

async function deleteSession(sessionToken) {
  await supabaseRequest(`pam_sessions?session_token=eq.${encodeFilter(sessionToken)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function upsertWaitlistEntry({ emailAddress, fullName = "", age = null, stage = "", goal = "" }) {
  await supabaseRequest("pam_waitlist", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      email_address: emailAddress,
      full_name: fullName || null,
      age,
      stage: stage || null,
      goal: goal || null,
      updated_at: new Date().toISOString()
    })
  });
}

async function upsertWaitlistEntryLegacy(emailAddress) {
  await supabaseRequest("pam_waitlist", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      email_address: emailAddress,
      updated_at: new Date().toISOString()
    })
  });
}

async function deleteVerificationRequests({ emailAddress = "", purpose = "", requestId = "" } = {}) {
  const filters = [];
  if (requestId) filters.push(`request_id=eq.${encodeFilter(requestId)}`);
  if (emailAddress) filters.push(`email_address=eq.${encodeFilter(emailAddress)}`);
  if (purpose) filters.push(`purpose=eq.${encodeFilter(purpose)}`);
  if (!filters.length) return;

  await supabaseRequest(`pam_verification_requests?${filters.join("&")}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function findVerificationRequest(requestId) {
  const rows = await supabaseRequest(`pam_verification_requests?request_id=eq.${encodeFilter(requestId)}&limit=1`);
  return rows?.[0] || null;
}

async function insertVerificationRequest({ requestId, emailAddress, purpose, codeHash, codeSalt, expiresAt, createdAt }) {
  await supabaseRequest("pam_verification_requests", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      request_id: requestId,
      email_address: emailAddress,
      purpose,
      code_hash: codeHash,
      code_salt: codeSalt,
      expires_at: expiresAt,
      created_at: createdAt
    })
  });
}

async function upsertBaseline({ accountId, baseline }) {
  if (!accountId || !baseline) return;
  await supabaseRequest("pam_baselines", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      account_id: accountId,
      baseline,
      updated_at: new Date().toISOString()
    })
  });
}

async function findBaselineByAccountId(accountId) {
  if (!accountId) return null;
  const rows = await supabaseRequest(`pam_baselines?account_id=eq.${encodeFilter(accountId)}&select=baseline&limit=1`);
  return rows?.[0]?.baseline || null;
}

async function insertTelemetryEvent({ eventType, eventName, sessionId = "", page = "", properties = {} }) {
  await supabaseRequest("pam_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      event_type: eventType,
      event_name: eventName,
      session_id: sessionId || null,
      page: page || null,
      properties: properties || {}
    })
  });
}

async function insertFeedback({ accountId = "", emailAddress = "", page = "", rating = null, message }) {
  await supabaseRequest("pam_feedback", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      account_id: accountId || null,
      email_address: emailAddress || null,
      page: page || null,
      rating,
      message
    })
  });
}

async function insertLegalAcceptance({
  accountId,
  emailAddress = "",
  acceptedAdvisorDisclaimer,
  acceptedTermsPrivacy,
  termsVersion,
  privacyVersion,
  acceptedAt
}) {
  await supabaseRequest("pam_legal_acceptances", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      account_id: accountId,
      email_address: emailAddress || null,
      accepted_advisor_disclaimer: acceptedAdvisorDisclaimer,
      accepted_terms_privacy: acceptedTermsPrivacy,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      accepted_at: acceptedAt
    })
  });
}

async function checkSupabaseConnection() {
  if (!hasSupabaseConfig()) {
    return {
      configured: false,
      connected: false,
      schemaReady: false,
      mode: "not_configured"
    };
  }

  try {
    await supabaseRequest("pam_accounts?select=id&limit=1", {
      method: "GET"
    });
    return {
      configured: true,
      connected: true,
      schemaReady: true,
      mode: process.env.PAM_SUPABASE_SUPABASE_URL ? "vercel_marketplace" : "manual_env"
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      schemaReady: false,
      mode: process.env.PAM_SUPABASE_SUPABASE_URL ? "vercel_marketplace" : "manual_env",
      reason: /does not exist|schema cache|relation/i.test(String(error.message || ""))
        ? "schema_pending"
        : "connection_error"
    };
  }
}

module.exports = {
  checkSupabaseConnection,
  createSession,
  deleteVerificationRequests,
  deleteSession,
  findAccountByEmail,
  findAccountById,
  findBaselineByAccountId,
  findVerificationRequest,
  getSession,
  hasSupabaseConfig,
  insertFeedback,
  insertLegalAcceptance,
  insertVerificationRequest,
  insertTelemetryEvent,
  insertAccount,
  isRecoverableSupabaseStorageError,
  upsertBaseline,
  upsertWaitlistEntry,
  upsertWaitlistEntryLegacy
};
