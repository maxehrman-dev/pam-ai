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

export const VALUES_ONBOARDING_STEPS = [
  {
    key: "age",
    question: "How old are you?",
    detail: "Age sets your runway — every projection depends on it.",
    type: "slider",
    min: 16,
    max: 70,
    defaultValue: 25
  },
  {
    key: "city",
    question: "Where do you live?",
    detail: "PAM uses this for cost-of-living and career-market math.",
    type: "text",
    placeholder: "City (e.g. Charlotte)",
    subKey: "state",
    subPlaceholder: "State (e.g. NC)"
  },
  {
    key: "household",
    question: "What does your household look like?",
    detail: "Who depends on your money changes every answer.",
    type: "options",
    options: [
      { value: "single", label: "Just me" },
      { value: "partner", label: "Me + partner" },
      { value: "married", label: "Married, no kids" },
      { value: "married_kids", label: "Married with kids" },
      { value: "single_parent", label: "Single parent" },
      { value: "support_family", label: "I support family members" }
    ]
  },
  {
    key: "housing",
    question: "What's your housing situation?",
    type: "options",
    options: [
      { value: "rent", label: "I rent" },
      { value: "own", label: "I own (mortgage or outright)" },
      { value: "family", label: "Living with family" },
      { value: "other", label: "Something else" }
    ]
  },
  {
    key: "worker_type",
    question: "What kind of worker are you?",
    detail: "Taxes, stability, and planning differ a lot between these.",
    type: "options",
    options: [
      { value: "salaried", label: "Salaried (W-2)" },
      { value: "hourly", label: "Hourly (W-2)" },
      { value: "freelance", label: "Freelance / 1099" },
      { value: "business_owner", label: "Business owner" },
      { value: "student", label: "Student / part-time" },
      { value: "between_jobs", label: "Between jobs right now" }
    ]
  },
  {
    key: "pay_frequency",
    question: "How often do you get paid?",
    type: "options",
    options: [
      { value: "weekly", label: "Weekly" },
      { value: "biweekly", label: "Every two weeks" },
      { value: "semimonthly", label: "Twice a month" },
      { value: "monthly", label: "Monthly" },
      { value: "irregular", label: "It varies / irregular" }
    ]
  },
  {
    key: "retirement_target_age",
    question: "When do you want to stop needing to work?",
    detail: "Give us a real number. You can always change it.",
    type: "slider",
    min: 25,
    max: 75,
    defaultValue: 65
  },
  {
    key: "work_philosophy",
    question: "How do you really feel about work?",
    type: "options",
    options: [
      { value: "hate_working", label: "I hate it. The sooner I'm out, the better." },
      { value: "work_to_live", label: "It's a means to an end — not my identity." },
      { value: "career_driven", label: "I'm ambitious. I want to climb and earn more." },
      { value: "entrepreneur", label: "I want to build something of my own." }
    ]
  },
  {
    key: "location_flexible",
    question: "Would you relocate for the right opportunity?",
    type: "options",
    options: [
      { value: "yes", label: "Absolutely — I'll go where the money is." },
      { value: "maybe", label: "Maybe, with the right offer on the table." },
      { value: "no", label: "No — I'm rooted where I am." }
    ]
  },
  {
    key: "lifestyle_priorities",
    question: "What matters most in your life?",
    detail: "Pick everything that applies.",
    type: "multiselect",
    options: ["Travel", "Homeownership", "Family", "Experiences", "Financial freedom", "Flexibility", "Status", "Security"]
  },
  {
    key: "industry",
    question: "What industry are you in?",
    detail: "Pick the closest match — PAM uses this to spot career and location upside.",
    type: "options",
    options: [
      { value: "finance", label: "Finance & banking" },
      { value: "tech", label: "Tech & software" },
      { value: "healthcare", label: "Healthcare & medicine" },
      { value: "law", label: "Law & legal services" },
      { value: "consulting", label: "Consulting & strategy" },
      { value: "marketing", label: "Marketing & media" },
      { value: "engineering", label: "Engineering & manufacturing" },
      { value: "entertainment", label: "Entertainment & creative" },
      { value: "education", label: "Education & government" },
      { value: "trades", label: "Trades & services" },
      { value: "retail", label: "Retail & hospitality" },
      { value: "other", label: "Something else" }
    ]
  },
  {
    key: "years_at_current_job",
    question: "How long have you been in your current role?",
    type: "options",
    options: [
      { value: "under_1", label: "Less than a year" },
      { value: "1_to_2", label: "1–2 years" },
      { value: "2_to_3", label: "2–3 years" },
      { value: "3_to_5", label: "3–5 years" },
      { value: "over_5", label: "More than 5 years" }
    ]
  },
  {
    key: "offline_factors",
    question: "Anything your bank accounts don't show?",
    detail: "Connected data misses these — pick everything that applies.",
    type: "multiselect",
    options: [
      "I own a car",
      "Crypto or other investments elsewhere",
      "Cash savings outside the bank",
      "Family helps me financially",
      "I help support family",
      "Student loans",
      "Money owed to friends/family",
      "I own property"
    ]
  }
];

export const INDUSTRY_CITY_MAP = {
  finance: { cities: ["New York City", "London", "Chicago", "Hong Kong", "Dubai"], boost: 0.38 },
  tech: { cities: ["San Francisco", "New York City", "Seattle", "Austin"], boost: 0.30 },
  "software engineering": { cities: ["San Francisco", "New York City", "Seattle"], boost: 0.30 },
  entertainment: { cities: ["Los Angeles", "New York City", "Atlanta"], boost: 0.25 },
  consulting: { cities: ["New York City", "Chicago", "Washington DC", "London"], boost: 0.24 },
  healthcare: { cities: ["Boston", "San Francisco", "New York City"], boost: 0.18 },
  law: { cities: ["New York City", "Washington DC", "Los Angeles", "Chicago"], boost: 0.32 },
  marketing: { cities: ["New York City", "Los Angeles", "San Francisco"], boost: 0.20 },
  engineering: { cities: ["San Francisco", "Seattle", "Austin", "New York City"], boost: 0.22 }
};

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
      "Can I move out this year?",
      "What car payment can I actually handle?",
      "Am I saving enough each month?",
      "Should I pay off debt or start investing?"
    ]
  }
];
