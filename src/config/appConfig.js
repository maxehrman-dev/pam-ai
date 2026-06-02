export const STORAGE_KEYS = {
  session: "pam:session:v1",
  lastQuestion: "pam-ai-last-question-v2",
  workspaceView: "pam-ai-workspace-view-v1",
  authView: "pam-ai-auth-view-v1",
  mobileView: "pam-ai-mobile-view-v1",
  netWorthRange: "pam-ai-net-worth-range-v1",
  displayTheme: "pam-ai-display-theme-v1",
  lastAutoSync: "pam-ai-last-auto-sync-v1",
  telemetrySession: "pam:telemetry-session:v1",
  cookieConsent: "pam:cookie-consent:v1",
  legalAcceptance: "pam:legal-acceptance:v1",
  walkthroughDismissed: "pam:walkthrough-dismissed:v1",
  waitlist: "pam:waitlist:v1",
  demoAccess: "pam:demo-access:v1"
};

export const TERMS_VERSION = "2026-05-18";
export const PRIVACY_VERSION = "2026-05-18";

export const LEGAL_DISCLAIMER =
  "PAM AI is a financial modeling tool, not a licensed financial advisor, investment adviser, tax professional, attorney, or RIA. Nothing in PAM is financial, tax, legal, or investment advice. Consult a qualified professional before making financial decisions.";

export const WAITLIST_FOUNDING_NOTE =
  "Hey — you're in. We'll email you the moment PAM launches with a direct link to sign up. As an early member you'll lock in our founding price of $7.99/month permanently. We're building something that actually helps you make smarter money decisions. Stay tuned. — The PAM AI team";

export const CREATE_ACCOUNT_STEPS = [
  {
    key: "firstName",
    label: "What should PAM call you?",
    errorLabel: "your name",
    type: "text",
    placeholder: "Maya",
    required: true,
    autocomplete: "given-name"
  },
  {
    key: "emailAddress",
    label: "Your email address",
    errorLabel: "your email",
    type: "email",
    placeholder: "you@example.com",
    required: true,
    autocomplete: "email"
  },
  {
    key: "verificationCode",
    label: "Check your email",
    detail: "We sent a 6-digit code.",
    errorLabel: "the 6-digit code",
    type: "text",
    placeholder: "123456",
    required: true,
    autocomplete: "one-time-code"
  },
  {
    key: "password",
    label: "Create a password",
    errorLabel: "a password",
    type: "password",
    placeholder: "At least 8 characters",
    required: true,
    withConfirm: true,
    autocomplete: "new-password"
  },
  {
    key: "firstDecision",
    label: "What do you want PAM to help with first?",
    detail: "One sentence is enough. PAM will connect to your accounts after.",
    errorLabel: "your first question",
    type: "textarea",
    placeholder: "I want to move out this year and understand what rent I can afford.",
    required: true,
    suggestions: [
      "Can I afford to move out if rent is $1,800?",
      "Can I afford a $400/month car payment?",
      "Should I start investing $200/month now?",
      "How would freelance income change my taxes?"
    ]
  }
];
