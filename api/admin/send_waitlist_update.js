const crypto = require("crypto");
const { withErrorReporting } = require("../_lib/observability.js");
const { Resend } = require("resend");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");
const { buildAdminStats } = require("../_lib/adminStats.js");
const { listSettingsHistory, loadRuntimeSettings, saveRuntimeSettings } = require("../_lib/runtimeSettings.js");
const { envFlagEnabled } = require("../_lib/security.js");

const broadcastSchema = {
  properties: {
    dryRun: { type: "boolean" }
  },
  required: []
};

const SUBJECT = "What we're building with PAM SI";
const PREVIEW = "A quick note on PAM's goals, roadmap, and how to think about the product.";

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertAdmin(req) {
  const configuredSecret = process.env.PAM_ADMIN_SECRET || process.env.RESEND_ADMIN_SECRET || "";
  const providedSecret = req.headers["x-pam-admin-secret"];
  if (!configuredSecret || !timingSafeEqualText(providedSecret, configuredSecret)) {
    const error = new Error("Unauthorized.");
    error.statusCode = 401;
    throw error;
  }
}

function escapeEmailText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// CAN-SPAM: every marketing email carries a working opt-out (Resend fills in
// a per-recipient link for the placeholder) and the sender's postal address.
const UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}";

function renderUpdateEmail(mailingAddress = "") {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${SUBJECT}</title>
      </head>
      <body style="margin:0;background:#f5f2e8;color:#1e2a24;font-family:Avenir Next,Helvetica Neue,Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREVIEW}</div>
        <div style="padding:34px 18px;">
          <div style="max-width:660px;margin:0 auto;background:#fffdf9;border:1px solid rgba(30,138,102,0.16);border-radius:30px;overflow:hidden;box-shadow:0 22px 55px rgba(20,55,41,0.10);">
            <div style="padding:30px 32px 10px;">
              <span style="display:inline-block;padding:9px 12px;border-radius:999px;background:#d8f3e5;color:#0d6549;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;">PAM SI</span>
              <h1 style="margin:18px 0 10px;font-family:Georgia,Times New Roman,serif;font-size:44px;line-height:0.95;letter-spacing:-0.045em;color:#143729;">A quick update from PAM SI</h1>
              <p style="margin:0;color:#0d6549;font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Personal Asset Manager</p>
            </div>
            <div style="padding:10px 32px 32px;">
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Hey, thanks for being on the early PAM SI waitlist.</p>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">The goal is simple: help young adults understand what could happen before they make a financial decision. Rent, a car payment, a trip, freelance income, moving out, investing earlier, taxes, emergency savings: PAM is being built to model the ripple effects before you commit.</p>
              <div style="margin:22px 0;padding:18px;border-radius:22px;background:#eefaf3;border:1px solid rgba(30,138,102,0.16);">
                <p style="margin:0 0 10px;color:#143729;font-size:18px;font-weight:900;">What we're working toward</p>
                <ul style="margin:0;padding-left:20px;color:#45584c;font-size:16px;line-height:1.7;">
                  <li>A cleaner account setup that builds a real financial baseline.</li>
                  <li>Decision modeling that shows monthly buffer, risk, taxes, savings, and goal impact.</li>
                  <li>Future account integrations that can summarize income, balances, recurring expenses, and liabilities automatically.</li>
                  <li>Plain-English guidance grounded in your real numbers, not a generic chatbot answer or a spreadsheet.</li>
                  <li>A product that starts with young adults before traditional wealth management usually makes sense.</li>
                </ul>
              </div>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Near term, we're focused on making the prototype more reliable, easier to use on mobile, and clearer about what changed after every button press. Longer term, PAM should become a decision engine that connects today's choices to future goals.</p>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Important note: PAM SI is a financial modeling and education tool. PAM SI is not a licensed financial advisor, registered investment adviser, tax professional, attorney, bank, or broker. Nothing from PAM is financial, tax, legal, or investment advice, and results are hypothetical estimates based on assumptions. Always verify important information and talk to a qualified professional before making major financial decisions.</p>
              <p style="margin:22px 0 0;color:#143729;font-weight:800;font-size:16px;">The PAM SI team</p>
            </div>
            <div style="padding:18px 32px 28px;border-top:1px solid rgba(30,138,102,0.12);color:#809687;font-size:13px;line-height:1.5;">
              You are receiving this because you joined the PAM SI waitlist at pamadvisor.com.<br />
              <a href="${UNSUBSCRIBE_URL}" style="color:#0d6549;font-weight:700;">Unsubscribe</a>${mailingAddress ? ` · ${escapeEmailText(mailingAddress)}` : ""}
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function renderTextEmail(mailingAddress = "") {
  return `A quick update from PAM SI

Hey, thanks for being on the early PAM SI waitlist.

The goal is simple: help young adults understand what could happen before they make a financial decision. Rent, a car payment, a trip, freelance income, moving out, investing earlier, taxes, emergency savings: PAM is being built to model the ripple effects before you commit.

What we're working toward:
- A cleaner account setup that builds a real financial baseline.
- Decision modeling that shows monthly buffer, risk, taxes, savings, and goal impact.
- Future account integrations that can summarize income, balances, recurring expenses, and liabilities automatically.
- Plain-English guidance grounded in your real numbers, not a generic chatbot answer or a spreadsheet.
- A product that starts with young adults before traditional wealth management usually makes sense.

Near term, we're focused on making the prototype more reliable, easier to use on mobile, and clearer about what changed after every button press. Longer term, PAM should become a decision engine that connects today's choices to future goals.

Important note: PAM SI is a financial modeling and education tool. PAM SI is not a licensed financial advisor, registered investment adviser, tax professional, attorney, bank, or broker. Nothing from PAM is financial, tax, legal, or investment advice, and results are hypothetical estimates based on assumptions. Always verify important information and talk to a qualified professional before making major financial decisions.

The PAM SI team

You are receiving this because you joined the PAM SI waitlist at pamadvisor.com.
Unsubscribe: ${UNSUBSCRIBE_URL}${mailingAddress ? `
${mailingAddress}` : ""}`;
}

async function getWaitlistRows() {
  const supabaseUrl = String(process.env.PAM_SUPABASE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(process.env.PAM_SUPABASE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
  if (!serviceRoleKey) throw new Error("Supabase service role key is not configured.");
  const requestRows = async (select) => {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/pam_waitlist?select=${select}&order=created_at.asc`,
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    const text = await response.text();
    return { response, text };
  };

  let { response, text } = await requestRows("email_address,full_name,created_at");
  if (!response.ok && /full_name|schema cache|column/i.test(text)) {
    ({ response, text } = await requestRows("email_address,created_at"));
  }
  if (!response.ok) throw new Error(text || "Could not read waitlist.");
  const rows = text ? JSON.parse(text) : [];
  const seen = new Set();
  return rows.filter((row) => {
    const email = String(row.email_address || "").trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    row.email_address = email;
    seen.add(email);
    return true;
  });
}

async function syncContacts(resend, audienceId, rows) {
  const listed = await resend.contacts.list({ audienceId });
  if (listed.error) throw new Error(listed.error.message || "Could not list Resend contacts.");

  const contacts = listed.data?.data || [];
  const existing = new Set(contacts.map((contact) => String(contact.email || "").toLowerCase()));
  let newlySynced = 0;

  for (const row of rows) {
    if (existing.has(row.email_address)) continue;
    const [firstName, ...rest] = String(row.full_name || "").trim().split(/\s+/).filter(Boolean);
    const created = await resend.contacts.create({
      audienceId,
      email: row.email_address,
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      unsubscribed: false
    });
    if (created.error) {
      const message = String(created.error.message || "").toLowerCase();
      if (!message.includes("already")) throw new Error(created.error.message || "Could not sync contact.");
    } else {
      newlySynced += 1;
    }
  }

  const refreshed = await resend.contacts.list({ audienceId });
  if (refreshed.error) throw new Error(refreshed.error.message || "Could not list synced contacts.");
  const activeContacts = (refreshed.data?.data || []).filter((contact) => !contact.unsubscribed);
  return {
    existingAudienceContacts: contacts.length,
    newlySynced,
    activeAudienceContacts: activeContacts.length
  };
}

// Read-only admin stats (GET). Same secret as the broadcast. Reads with the
// service role server-side and returns aggregates only.
async function readAdminTable(path, { count = false } = {}) {
  const supabaseUrl = String(process.env.PAM_SUPABASE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(process.env.PAM_SUPABASE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase is not configured.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: count ? "HEAD" : "GET",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(count ? { Prefer: "count=exact", Range: "0-0" } : {})
    }
  });
  if (count) {
    const total = Number(String(response.headers.get("content-range") || "").split("/")[1]);
    return Number.isFinite(total) ? total : null;
  }
  if (!response.ok) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

const settingsSchema = {
  properties: {
    action: { type: "string", enum: ["update_settings"] },
    settings: { type: "object", allowUnknown: true }
  },
  required: ["action", "settings"]
};

// Vercel-level switches and setup the admin should see next to the controls.
function getEnvironmentChecks() {
  const isSet = (name) => Boolean(String(process.env[name] || "").trim());
  return {
    killSwitches: {
      ai: envFlagEnabled("PAM_DISABLE_AI") || envFlagEnabled("DISABLE_AI"),
      plaid: envFlagEnabled("PAM_DISABLE_PLAID") || envFlagEnabled("DISABLE_PLAID"),
      email: envFlagEnabled("PAM_DISABLE_EMAIL") || envFlagEnabled("DISABLE_EMAIL"),
      billing: envFlagEnabled("PAM_DISABLE_BILLING")
    },
    launchGateEnv: envFlagEnabled("PAM_LAUNCH_GATE"),
    setup: {
      mailingAddress: isSet("PAM_MAILING_ADDRESS"),
      inviteCodes: isSet("DEMO_ACCESS_CODE"),
      stripe: isSet("STRIPE_SECRET_KEY"),
      sentry: isSet("SENTRY_DSN"),
      posthog: isSet("POSTHOG_KEY"),
      resendAudience: isSet("RESEND_AUDIENCE_ID"),
      requireSubscription: envFlagEnabled("PAM_REQUIRE_SUBSCRIPTION")
    }
  };
}

function toCsvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

async function handleWaitlistExport(res) {
  const rows = await readAdminTable("pam_waitlist?select=email_address,full_name,age,stage,goal,created_at&order=created_at.asc&limit=10000");
  const header = ["email", "full_name", "age", "stage", "goal", "joined"];
  const lines = [header.join(",")].concat(rows.map((row) => [row.email_address, row.full_name, row.age, row.stage, row.goal, row.created_at].map(toCsvCell).join(",")));
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", 'attachment; filename="pam-waitlist.csv"');
  res.end(lines.join("\n"));
}

async function handleAdminStats(req, res) {
  assertAdmin(req);
  if (
    !checkRateLimit(req, res, {
      routeKey: "admin:stats",
      userKey: "admin",
      ipLimit: { windowMs: 60 * 1000, max: 20 },
      userLimit: { windowMs: 60 * 1000, max: 20 }
    })
  ) {
    return;
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [waitlist, events, runs, feedbackDesc, accountCount] = await Promise.all([
    readAdminTable("pam_waitlist?select=age,stage,goal,created_at&order=created_at.asc&limit=10000"),
    readAdminTable(`pam_events?select=id,event_name,session_id,created_at&created_at=gte.${encodeURIComponent(since)}&limit=20000`),
    readAdminTable("pam_scenario_runs?select=question,created_at&order=created_at.desc&limit=5000"),
    readAdminTable("pam_feedback?select=rating,message,page,created_at&order=created_at.desc&limit=8"),
    readAdminTable("pam_baselines?select=account_id", { count: true })
  ]);
  const [settings, settingsHistory] = await Promise.all([loadRuntimeSettings({ force: true }), listSettingsHistory(8)]);
  return sendJson(res, 200, {
    ok: true,
    stats: buildAdminStats({ waitlist, events, runs, feedback: [...feedbackDesc].reverse(), accountCount }),
    settings,
    settingsHistory,
    environment: getEnvironmentChecks()
  });
}

// Every admin request counts against a per-IP budget before the secret is
// checked, so the secret can't be guessed by brute force.
const ADMIN_ATTEMPT_LIMIT = { windowMs: 15 * 60 * 1000, max: 40 };

const __pamRouteHandler = async (req, res) => {
  if (!checkRateLimit(req, res, { routeKey: "admin:attempts", ipLimit: ADMIN_ATTEMPT_LIMIT })) return;
  if (req.method === "GET") {
    try {
      if (String(req.query?.export || new URL(req.url || "/", "http://x").searchParams.get("export") || "") === "waitlist") {
        assertAdmin(req);
        if (!checkRateLimit(req, res, { routeKey: "admin:export", userKey: "admin", ipLimit: { windowMs: 60 * 1000, max: 5 }, userLimit: { windowMs: 60 * 1000, max: 5 } })) return;
        return await handleWaitlistExport(res);
      }
      return await handleAdminStats(req, res);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.statusCode === 401 ? "Unauthorized." : "Could not load stats." });
    }
  }
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    assertAdmin(req);
    if (req.body?.action === "update_settings") {
      const update = validatePayload(req.body, settingsSchema, "request body");
      if (!checkRateLimit(req, res, { routeKey: "admin:settings", userKey: "admin", ipLimit: { windowMs: 60 * 1000, max: 20 }, userLimit: { windowMs: 60 * 1000, max: 20 } })) return;
      const settings = await saveRuntimeSettings(update.settings);
      return sendJson(res, 200, { ok: true, settings });
    }
    const body = validatePayload(req.body, broadcastSchema, "request body");

    if (
      !checkRateLimit(req, res, {
        routeKey: "admin:waitlist-update",
        userKey: "admin",
        ipLimit: { windowMs: 60 * 1000, max: 8 },
        userLimit: { windowMs: 60 * 1000, max: 4 }
      })
    ) {
      return;
    }

    const resend = new Resend(getRequiredEnv("RESEND_API_KEY"));
    const audienceId = getRequiredEnv("RESEND_AUDIENCE_ID");
    const from = getRequiredEnv("PAM_FROM_EMAIL");
    const mailingAddress = String(process.env.PAM_MAILING_ADDRESS || "").trim();
    if (!body.dryRun && !mailingAddress) {
      const error = new Error("PAM_MAILING_ADDRESS is not configured. CAN-SPAM requires a valid postal address (street address, or a PO box or private mailbox registered with USPS) in every marketing email. Set it in Vercel before sending.");
      error.statusCode = 412;
      throw error;
    }
    const waitlistRows = await getWaitlistRows();
    const syncSummary = await syncContacts(resend, audienceId, waitlistRows);

    if (body.dryRun) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: true,
        waitlistRows: waitlistRows.length,
        ...syncSummary,
        subject: SUBJECT
      });
    }

    const created = await resend.broadcasts.create({
      audienceId,
      from,
      replyTo: from,
      name: "PAM SI waitlist update",
      subject: SUBJECT,
      previewText: PREVIEW,
      html: renderUpdateEmail(mailingAddress),
      text: renderTextEmail(mailingAddress)
    });
    if (created.error) throw new Error(created.error.message || "Could not create broadcast.");

    const sent = await resend.broadcasts.send(created.data.id);
    if (sent.error) throw new Error(sent.error.message || "Could not send broadcast.");

    return sendJson(res, 200, {
      ok: true,
      sent: true,
      broadcastId: sent.data.id,
      waitlistRows: waitlistRows.length,
      ...syncSummary,
      subject: SUBJECT
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Unable to send waitlist update."
    });
  }
};

module.exports = withErrorReporting("admin/send_waitlist_update", __pamRouteHandler);
