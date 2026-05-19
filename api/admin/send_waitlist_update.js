const crypto = require("crypto");
const { Resend } = require("resend");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { checkRateLimit, validatePayload } = require("../_lib/security.js");

const broadcastSchema = {
  properties: {
    dryRun: { type: "boolean" }
  },
  required: []
};

const SUBJECT = "What we're building with PAM AI";
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

function renderUpdateEmail() {
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
              <span style="display:inline-block;padding:9px 12px;border-radius:999px;background:#d8f3e5;color:#0d6549;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;">PAM AI</span>
              <h1 style="margin:18px 0 10px;font-family:Georgia,Times New Roman,serif;font-size:44px;line-height:0.95;letter-spacing:-0.045em;color:#143729;">A quick update from PAM AI</h1>
              <p style="margin:0;color:#0d6549;font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Personal Asset Manager</p>
            </div>
            <div style="padding:10px 32px 32px;">
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Hey, thanks for being on the early PAM AI waitlist.</p>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">The goal is simple: help young adults understand what could happen before they make a financial decision. Rent, a car payment, a trip, freelance income, moving out, investing earlier, taxes, emergency savings — PAM is being built to model the ripple effects before you commit.</p>
              <div style="margin:22px 0;padding:18px;border-radius:22px;background:#eefaf3;border:1px solid rgba(30,138,102,0.16);">
                <p style="margin:0 0 10px;color:#143729;font-size:18px;font-weight:900;">What we're working toward</p>
                <ul style="margin:0;padding-left:20px;color:#45584c;font-size:16px;line-height:1.7;">
                  <li>A cleaner account setup that builds a real financial baseline.</li>
                  <li>Decision modeling that shows monthly buffer, risk, taxes, savings, and goal impact.</li>
                  <li>Future account integrations that can summarize income, balances, recurring expenses, and liabilities automatically.</li>
                  <li>Plain-English guidance that feels closer to a financial advisor than a chatbot or spreadsheet.</li>
                  <li>A product that starts with young adults before traditional wealth management usually makes sense.</li>
                </ul>
              </div>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Near term, we're focused on making the prototype more reliable, easier to use on mobile, and clearer about what changed after every button press. Longer term, PAM should become a decision engine that connects today's choices to future goals.</p>
              <p style="margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;">Important note: PAM AI is a financial modeling and education tool. PAM AI is not a licensed financial advisor, registered investment adviser, tax professional, attorney, bank, or broker. Nothing from PAM is financial, tax, legal, or investment advice, and results are hypothetical estimates based on assumptions. Always verify important information and talk to a qualified professional before making major financial decisions.</p>
              <p style="margin:22px 0 0;color:#143729;font-weight:800;font-size:16px;">— The PAM AI team</p>
            </div>
            <div style="padding:18px 32px 28px;border-top:1px solid rgba(30,138,102,0.12);color:#809687;font-size:13px;line-height:1.5;">
              You are receiving this because you joined the PAM AI waitlist at pamadvisor.com.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function renderTextEmail() {
  return `A quick update from PAM AI

Hey, thanks for being on the early PAM AI waitlist.

The goal is simple: help young adults understand what could happen before they make a financial decision. Rent, a car payment, a trip, freelance income, moving out, investing earlier, taxes, emergency savings — PAM is being built to model the ripple effects before you commit.

What we're working toward:
- A cleaner account setup that builds a real financial baseline.
- Decision modeling that shows monthly buffer, risk, taxes, savings, and goal impact.
- Future account integrations that can summarize income, balances, recurring expenses, and liabilities automatically.
- Plain-English guidance that feels closer to a financial advisor than a chatbot or spreadsheet.
- A product that starts with young adults before traditional wealth management usually makes sense.

Near term, we're focused on making the prototype more reliable, easier to use on mobile, and clearer about what changed after every button press. Longer term, PAM should become a decision engine that connects today's choices to future goals.

Important note: PAM AI is a financial modeling and education tool. PAM AI is not a licensed financial advisor, registered investment adviser, tax professional, attorney, bank, or broker. Nothing from PAM is financial, tax, legal, or investment advice, and results are hypothetical estimates based on assumptions. Always verify important information and talk to a qualified professional before making major financial decisions.

— The PAM AI team

You are receiving this because you joined the PAM AI waitlist at pamadvisor.com.`;
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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    assertAdmin(req);
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
      name: "PAM AI waitlist update",
      subject: SUBJECT,
      previewText: PREVIEW,
      html: renderUpdateEmail(),
      text: renderTextEmail()
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
