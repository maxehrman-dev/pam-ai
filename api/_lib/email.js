const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.PAM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "";
const WAITLIST_NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || "mbewebdesign@gmail.com";
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
  const html = `
    <div style="font-family: Avenir Next, Helvetica Neue, Arial, sans-serif; background:#f5f2e8; color:#1e2a24; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:#fffdf7; border-radius:24px; padding:32px; border:1px solid rgba(30,138,102,0.12);">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#0d6549; font-weight:700;">PAM AI</div>
        <h1 style="margin:12px 0 8px; font-size:32px; line-height:1;">Verify your account</h1>
        <p style="margin:0 0 20px; color:#45584c;">${greeting} enter this code in PAM to finish creating your account.</p>
        <div style="font-size:40px; font-weight:800; letter-spacing:0.18em; color:#0d6549; padding:18px 22px; border-radius:18px; background:#d8f3e5; text-align:center;">${verificationCode}</div>
        <p style="margin:20px 0 0; color:#809687;">This code expires in 10 minutes.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: emailAddress,
    subject,
    html
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
  const html = `
    <div style="font-family: Avenir Next, Helvetica Neue, Arial, sans-serif; color:#1e2a24; padding:24px;">
      <h1 style="margin:0 0 10px;">New PAM AI waitlist signup</h1>
      <p style="font-size:18px;"><strong>${emailAddress}</strong></p>
    </div>
  `;

  await sendEmail({
    to: WAITLIST_NOTIFY_EMAIL,
    subject: "New PAM AI waitlist signup",
    html,
    text: `New PAM AI waitlist signup: ${emailAddress}`
  });
}

async function sendWaitlistConfirmation({ emailAddress }) {
  const html = `
    <div style="font-family: Avenir Next, Helvetica Neue, Arial, sans-serif; background:#f5f2e8; color:#1e2a24; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:#fffdf7; border-radius:24px; padding:32px; border:1px solid rgba(30,138,102,0.12);">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#0d6549; font-weight:700;">PAM AI</div>
        <h1 style="margin:12px 0 14px; font-size:30px; line-height:1;">You're on the PAM AI waitlist</h1>
        <p style="margin:0; color:#45584c; font-size:16px; line-height:1.6;">${WAITLIST_FOUNDING_NOTE}</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: emailAddress,
    subject: "You're on the PAM AI waitlist",
    html,
    text: WAITLIST_FOUNDING_NOTE
  });
}

module.exports = {
  hasEmailProvider,
  isResendTestingRestriction,
  sendVerificationEmail,
  sendWaitlistConfirmation,
  sendWaitlistNotification
};
