const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
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

async function upsertWaitlistEntry(emailAddress) {
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

module.exports = {
  createSession,
  deleteSession,
  findAccountByEmail,
  findAccountById,
  getSession,
  hasSupabaseConfig,
  insertTelemetryEvent,
  insertAccount,
  upsertBaseline,
  upsertWaitlistEntry
};
