const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.PAM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "";

function hasEmailProvider() {
  return Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
}

async function sendVerificationEmail({ emailAddress, firstName = "", verificationCode }) {
  const subject = "Your PAM AI verification code";
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const html = `
    <div style="font-family: Avenir Next, Helvetica Neue, Arial, sans-serif; background:#fbf7ef; color:#1e2a24; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:white; border-radius:24px; padding:32px; border:1px solid rgba(30,138,102,0.12);">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#0d6549; font-weight:700;">PAM AI</div>
        <h1 style="margin:12px 0 8px; font-size:32px; line-height:1;">Verify your account</h1>
        <p style="margin:0 0 20px; color:#45584c;">${greeting} enter this code in PAM to finish creating your account.</p>
        <div style="font-size:40px; font-weight:800; letter-spacing:0.18em; color:#0d6549; padding:18px 22px; border-radius:18px; background:#d8f3e5; text-align:center;">${verificationCode}</div>
        <p style="margin:20px 0 0; color:#809687;">This code expires in 10 minutes.</p>
      </div>
    </div>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [emailAddress],
      subject,
      html
    })
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || "Unable to send verification email.");
  }
}

module.exports = {
  hasEmailProvider,
  sendVerificationEmail
};
