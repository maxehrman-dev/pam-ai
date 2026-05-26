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
    detail: "",
    type: "text",
    placeholder: "Maya",
    required: true,
    autocomplete: "given-name"
  },
  {
    key: "emailAddress",
    label: "What email should you sign in with?",
    detail: "",
    type: "email",
    placeholder: "you@example.com",
    required: true,
    autocomplete: "email"
  },
  {
    key: "verificationCode",
    label: "Enter the verification code",
    detail: "",
    type: "text",
    placeholder: "123456",
    required: true,
    autocomplete: "one-time-code"
  },
  {
    key: "password",
    label: "Create a password",
    detail: "",
    type: "password",
    placeholder: "At least 8 characters",
    required: true,
    autocomplete: "new-password"
  },
  {
    key: "confirmPassword",
    label: "Confirm your password",
    detail: "",
    type: "password",
    placeholder: "Repeat password",
    required: true,
    autocomplete: "new-password"
  },
  {
    key: "age",
    label: "How old are you?",
    detail: "",
    type: "number",
    placeholder: "24",
    required: false,
    min: "18",
    max: "35",
    step: "1"
  },
  {
    key: "cityOrZip",
    label: "What ZIP code or state should PAM use?",
    detail: "",
    type: "text",
    placeholder: "90210 or CA",
    required: false,
    autocomplete: "postal-code"
  },
  {
    key: "firstDecision",
    label: "What decision should PAM help with first?",
    detail: "Write one sentence, or tap a starter and edit it.",
    type: "textarea",
    placeholder: "I want to move out this year and understand what rent I can afford.",
    required: true,
    suggestions: [
      "I want to move out this year.",
      "I want to know if I can afford a car payment.",
      "I want to start investing without slowing my savings.",
      "I want to understand how freelance income changes taxes."
    ]
  },
  {
    key: "employmentStatus",
    label: "What is your main source of income?",
    detail: "",
    type: "select",
    required: true,
    options: ["W-2 employee", "1099 / self-employed", "Student worker", "Mixed income", "Not sure yet"]
  },
  {
    key: "review",
    label: "Review your account",
    detail: "",
    type: "review",
    required: false
  }
];
