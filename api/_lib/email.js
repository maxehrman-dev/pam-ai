const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.PAM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "";
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID || "";
const WAITLIST_NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || "mbewebdesign@gmail.com";
const PAM_SITE_URL = (process.env.PAM_SITE_URL || "https://pamadvisor.com").replace(/\/$/, "");
const NEWSLETTER_URL = `${PAM_SITE_URL}/newsletter`;
const SIGNUP_URL = `${PAM_SITE_URL}/`;
const WAITLIST_FOUNDING_NOTE =
  "Hey — you're in. We'll email you the moment PAM launches with a direct link to sign up. As an early member you'll lock in our founding price of $7.99/month permanently. We're building something that actually helps you make smarter money decisions. Stay tuned. — The PAM AI team";

function getResendClient() {
  if (!RESEND_API_KEY) return null;

  try {
    const { Resend } = require("resend");
    return new Resend(RESEND_API_KEY);
  } catch (_error) {
    return null;
  }
}

function hasEmailProvider() {
  return Boolean(getResendClient() && RESEND_FROM_EMAIL);
}

function hasNewsletterAudience() {
  return Boolean(getResendClient() && RESEND_AUDIENCE_ID);
}

function isResendTestingRestriction(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("you can only send testing emails to your own email address") ||
    message.includes("verify a domain at resend.com/domains") ||
    message.includes("validation_error")
  );
}

async function sendVerificationEmail({ emailAddress, firstName = "", verificationCode }) {
  // Verification delivery must stay server-side so provider keys never reach the browser.
  const resend = getResendClient();
  if (!resend || !RESEND_FROM_EMAIL) {
    throw new Error("Resend email delivery is not configured.");
  }

  const subject = "Your PAM AI verification code";
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const html = renderPamEmail({
    eyebrow: "Secure sign in",
    title: "Your PAM AI code",
    preview: "Use this code to finish creating your PAM AI account.",
    body: `
      <p style="${styles.paragraph}">${greeting} use this code to finish creating your PAM AI account.</p>
      <div style="${styles.codeBox}">${verificationCode}</div>
      <p style="${styles.muted}">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
    `
  });

  await sendEmail({
    to: emailAddress,
    subject,
    html,
    text: `Your PAM AI verification code is ${verificationCode}. It expires in 10 minutes.`
  });
}

async function sendEmail({ to, subject, html, text = "" }) {
  const resend = getResendClient();
  if (!resend || !RESEND_FROM_EMAIL) {
    throw new Error("Resend email delivery is not configured.");
  }

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text
  });
}

async function sendWaitlistNotification({ emailAddress }) {
  const html = renderPamEmail({
    eyebrow: "PAM waitlist",
    title: "New waitlist signup",
    preview: `${emailAddress} joined the PAM AI waitlist.`,
    body: `
      <p style="${styles.paragraph}"><strong>${emailAddress}</strong> joined the PAM AI waitlist.</p>
      <a href="${NEWSLETTER_URL}" style="${styles.button}">Open waitlist page</a>
    `
  });

  await sendEmail({
    to: WAITLIST_NOTIFY_EMAIL,
    subject: "New PAM AI waitlist signup",
    html,
    text: `New PAM AI waitlist signup: ${emailAddress}`
  });
}

async function sendWaitlistConfirmation({ emailAddress }) {
  const html = renderPamEmail({
    eyebrow: "PAM AI early access",
    title: "You're on the waitlist",
    preview: "You are on the PAM AI waitlist.",
    body: `
      <p style="${styles.paragraph}">Hey — you're in.</p>
      <p style="${styles.paragraph}">We'll email you the moment PAM launches with a direct link to sign up. As an early member, you'll lock in our founding price of <strong>$7.99/month permanently</strong>.</p>
      <p style="${styles.paragraph}">We're building something that actually helps you make smarter money decisions. Stay tuned.</p>
      <a href="${SIGNUP_URL}" style="${styles.button}">Visit PAM AI</a>
      <p style="${styles.signature}">— The PAM AI team</p>
    `
  });

  await sendEmail({
    to: emailAddress,
    subject: "You're on the PAM AI waitlist",
    html,
    text: WAITLIST_FOUNDING_NOTE
  });
}

async function syncWaitlistContact({ emailAddress }) {
  const resend = getResendClient();
  if (!resend || !RESEND_AUDIENCE_ID) {
    return "not_configured";
  }

  try {
    await resend.contacts.create({
      audienceId: RESEND_AUDIENCE_ID,
      email: emailAddress,
      unsubscribed: false
    });
    return "synced";
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("already exists") || message.includes("contact already")) {
      return "already_synced";
    }
    throw error;
  }
}

const styles = {
  body:
    "margin:0;background:#f5f2e8;color:#1e2a24;font-family:Avenir Next,Helvetica Neue,Arial,sans-serif;",
  shell: "padding:34px 18px;",
  card:
    "max-width:620px;margin:0 auto;background:#fffdf9;border:1px solid rgba(30,138,102,0.16);border-radius:28px;overflow:hidden;box-shadow:0 22px 55px rgba(20,55,41,0.10);",
  header: "padding:28px 30px 8px;",
  mark:
    "display:inline-block;padding:9px 12px;border-radius:999px;background:#d8f3e5;color:#0d6549;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;",
  title:
    "margin:18px 0 8px;font-family:Georgia,Times New Roman,serif;font-size:42px;line-height:0.95;letter-spacing:-0.045em;color:#143729;",
  content: "padding:8px 30px 30px;",
  paragraph: "margin:0 0 16px;color:#45584c;font-size:17px;line-height:1.62;",
  muted: "margin:18px 0 0;color:#809687;font-size:14px;line-height:1.5;",
  signature: "margin:22px 0 0;color:#143729;font-weight:800;font-size:16px;",
  codeBox:
    "margin:18px 0 10px;padding:20px 22px;border-radius:20px;background:#d8f3e5;color:#0d6549;text-align:center;font-size:42px;letter-spacing:0.20em;font-weight:900;",
  button:
    "display:inline-block;margin:8px 0 4px;padding:14px 22px;border-radius:999px;background:#0d6549;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;",
  footer:
    "padding:18px 30px 28px;border-top:1px solid rgba(30,138,102,0.12);color:#809687;font-size:13px;line-height:1.5;"
};

function renderPamEmail({ eyebrow, title, preview, body }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content="${preview}" />
      </head>
      <body style="${styles.body}">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
        <div style="${styles.shell}">
          <div style="${styles.card}">
            <div style="${styles.header}">
              <span style="${styles.mark}">PAM AI</span>
              <h1 style="${styles.title}">${title}</h1>
              <p style="margin:0;color:#0d6549;font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${eyebrow}</p>
            </div>
            <div style="${styles.content}">
              ${body}
            </div>
            <div style="${styles.footer}">
              PAM AI helps young adults know what happens before they decide.<br />
              Newsletter signup: <a href="${NEWSLETTER_URL}" style="color:#0d6549;font-weight:800;">${NEWSLETTER_URL}</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

module.exports = {
  hasNewsletterAudience,
  hasEmailProvider,
  isResendTestingRestriction,
  sendVerificationEmail,
  sendWaitlistConfirmation,
  sendWaitlistNotification,
  syncWaitlistContact
};
