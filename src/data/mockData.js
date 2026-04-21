export const financialProfile = {
  user: {
    name: "Avery Chen",
    archetype: "Measured Builder",
    city: "Seattle, WA",
    objective: "Stay flexible enough for big life choices without slowing long-term wealth creation."
  },
  monthly: {
    income: [
      { label: "Take-home salary", amount: 9000 },
      { label: "Consulting income", amount: 800 }
    ],
    fixed: [
      { label: "Rent", amount: 2450, essential: true },
      { label: "Utilities & internet", amount: 310, essential: true },
      { label: "Insurance", amount: 380, essential: true },
      { label: "Debt payments", amount: 460, essential: true }
    ],
    variable: [
      { label: "Groceries", amount: 650, essential: true },
      { label: "Transportation", amount: 510, essential: true },
      { label: "Lifestyle", amount: 920, essential: false },
      { label: "Travel sinking fund", amount: 140, essential: false }
    ],
    contributions: [
      { label: "Emergency reserve", amount: 450, bucket: "cash" },
      { label: "401(k)", amount: 950, bucket: "invest" },
      { label: "Brokerage auto-invest", amount: 700, bucket: "invest" }
    ]
  },
  assets: [
    { label: "High-yield cash", value: 42600, bucket: "cash", liquid: true, note: "2.4% APY" },
    { label: "Brokerage", value: 68900, bucket: "invest", liquid: false, note: "Taxable investing" },
    { label: "401(k)", value: 156400, bucket: "retirement", liquid: false, note: "Employer match included" },
    { label: "Vested RSUs", value: 14000, bucket: "equity", liquid: false, note: "Next diversification target" },
    { label: "HSA", value: 11200, bucket: "health", liquid: false, note: "Invested balance" }
  ],
  liabilities: [
    { label: "Student loans", balance: 18600, rate: 4.8, monthlyPayment: 310, principalShare: 215 },
    { label: "Auto loan", balance: 7200, rate: 3.9, monthlyPayment: 150, principalShare: 120 },
    { label: "Credit card", balance: 1850, rate: 18.9, monthlyPayment: 90, principalShare: 75 }
  ],
  healthSignals: [
    "Strong emergency buffer",
    "Consistent investment cadence",
    "Minor drag from revolving debt"
  ]
};

export const comparisonRows = [
  {
    label: "Primary question",
    legacy: "Where did my money go?",
    pam: "What happens if I change my plan?"
  },
  {
    label: "Core output",
    legacy: "Past transactions and budgets",
    pam: "Future projections, tradeoffs, and scenario outcomes"
  },
  {
    label: "Decision support",
    legacy: "Alerts after the fact",
    pam: "Clarity before you commit"
  }
];

export const featureList = [
  {
    eyebrow: "Scenario Lab",
    title: "Turn big decisions into modeled outcomes",
    copy: "Run a car purchase, move, layoff, or investment plan against your real financial posture in seconds."
  },
  {
    eyebrow: "Decision Lens",
    title: "See the ripple effects, not just the price tag",
    copy: "Each scenario maps short-term liquidity, long-term net worth impact, risk level, and the tradeoffs hiding beneath the headline number."
  },
  {
    eyebrow: "Guided Actions",
    title: "Get next steps instead of vague scores",
    copy: "PAM AI points to the lever that matters most, from preserving runway to reallocating savings without killing momentum."
  }
];

export const trustHighlights = [
  {
    eyebrow: "Privacy by design",
    title: "Scenario math stays separate from raw account credentials",
    copy:
      "PAM AI is structured to model decisions from a normalized financial profile, so future bank-link data can be scoped and minimized before it ever reaches the simulator."
  },
  {
    eyebrow: "Security posture",
    title: "2FA, session controls, and recovery paths are part of the core product",
    copy:
      "Trust is not a footer link. The MVP now includes a dedicated Trust Center with two-factor authentication status, recovery codes, device controls, and login alerts."
  },
  {
    eyebrow: "Plaid-ready boundary",
    title: "Prepared for Plaid without turning the app into a credential sink",
    copy:
      "When Plaid is added, the intended flow is tokenized account linking through Plaid with PAM AI storing only the normalized balances and liabilities needed for decision modeling."
  }
];

export const privacyPolicy = {
  version: "1.0",
  effectiveDate: "April 21, 2026",
  summary:
    "PAM AI exists to help users simulate financial decisions. The product is designed to minimize raw financial data exposure, explain how projections are produced, and keep future bank connectivity isolated behind scoped integrations.",
  sections: [
    {
      title: "What PAM AI collects",
      paragraphs: [
        "PAM AI uses the financial profile a user provides or links in order to generate scenario projections, comparison views, and tailored insights.",
        "In the current MVP, the product runs on seeded mock data unless a future connected source is normalized into the profile store."
      ],
      bullets: [
        "Account balances, assets, liabilities, and monthly cash flow inputs",
        "Scenario prompts, modeled outputs, and product interactions",
        "Security settings such as two-factor status, trusted device count, and recovery code metadata"
      ]
    },
    {
      title: "How scenario modeling works",
      paragraphs: [
        "PAM AI turns a financial profile into a structured baseline and compares hypothetical choices against that baseline over time.",
        "The simulator is designed to use normalized financial data rather than direct bank credentials, which keeps the decision engine decoupled from the connection layer."
      ]
    },
    {
      title: "Future Plaid connectivity",
      paragraphs: [
        "If Plaid is added, Plaid would handle account authentication and token exchange. PAM AI’s intended role is to receive scoped account and liability data, transform it into a normalized profile snapshot, and store only what is necessary for decision modeling.",
        "PAM AI is not intended to store end-user bank usernames or passwords."
      ]
    },
    {
      title: "How PAM AI uses data",
      paragraphs: [
        "Financial data is used to generate projections, compare current and hypothetical paths, and improve the clarity of scenario analysis inside the product.",
        "Security telemetry is used to protect account access, surface suspicious activity, and support recovery workflows."
      ]
    },
    {
      title: "User controls",
      paragraphs: [
        "Users should be able to review their data source, enable two-factor authentication, manage trusted devices, rotate recovery codes, and request deletion or export of their financial profile.",
        "These controls are surfaced in the Trust Center so privacy and security remain visible alongside the decision engine."
      ]
    },
    {
      title: "Retention and deletion",
      paragraphs: [
        "PAM AI should retain only the profile, scenario history, and security metadata required to deliver the product experience and protect user accounts.",
        "When a user disconnects a future linked account, the intended behavior is to remove or refresh outdated snapshots rather than keeping stale raw account data indefinitely."
      ]
    },
    {
      title: "Contact and policy updates",
      paragraphs: [
        "Material policy changes should be communicated inside the product before they apply to newly processed financial data.",
        "Questions about privacy or connected-account handling should be routed to the product’s support and privacy contact channels."
      ],
      bullets: ["privacy@pamai.app", "support@pamai.app"]
    }
  ]
};

export const howItWorks = [
  {
    step: "01",
    title: "Connect your financial posture",
    copy: "Assets, liabilities, cash flow, and savings habits create the baseline path."
  },
  {
    step: "02",
    title: "Describe the decision in plain English",
    copy: "Ask the product the way you think: buy a car, move apartments, take time off, invest more."
  },
  {
    step: "03",
    title: "Review outcomes and tradeoffs",
    copy: "PAM AI returns side-by-side comparisons, assumptions, confidence, and the smartest next move."
  }
];

export const scenarioCatalog = [
  {
    id: "car",
    type: "purchase",
    title: "Buy a $20,000 car",
    prompt: "What if I buy a $20,000 car?",
    teaser: "Model the liquidity hit, recurring carrying cost, and five-year tradeoff.",
    oneTimeCost: 20000,
    monthlyExpenseDelta: 260,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: 9000,
    confidenceBase: 76,
    assumptions: [
      "Assumes the purchase is paid from liquid savings.",
      "Includes about $260 per month in insurance, maintenance, and parking.",
      "Assumes the car retains roughly 45% of value after five years."
    ]
  },
  {
    id: "apartment",
    type: "housing",
    title: "Move to a more expensive apartment",
    prompt: "What if I move to a more expensive apartment?",
    teaser: "Stress-test a higher monthly burn rate before you sign the lease.",
    oneTimeCost: 2200,
    monthlyExpenseDelta: 650,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 79,
    assumptions: [
      "Assumes rent rises by $650 per month.",
      "Includes a one-time $2,200 move and setup cost.",
      "Assumes no roommate or offsetting income change."
    ]
  },
  {
    id: "job-loss",
    type: "incomeShock",
    title: "Lose my job for 3 months",
    prompt: "What if I lose my job for 3 months?",
    teaser: "See how much runway and momentum your current balance sheet can absorb.",
    oneTimeCost: 0,
    monthlyIncomeDelta: -7350,
    monthlyInvestmentDelta: -700,
    durationMonths: 3,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 68,
    assumptions: [
      "Assumes roughly 25% income replacement through severance or unemployment.",
      "Assumes spending stays flat during the gap.",
      "Assumes brokerage auto-investing pauses during the income interruption."
    ]
  },
  {
    id: "invest",
    type: "investment",
    title: "Invest $500 per month for 5 years",
    prompt: "What if I invest $500 per month for 5 years?",
    teaser: "Measure the short-term squeeze against the long-term upside.",
    oneTimeCost: 0,
    monthlyInvestmentDelta: 500,
    durationMonths: 60,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 86,
    assumptions: [
      "Assumes monthly contributions are automated and uninterrupted for five years.",
      "Uses a 6.8% annualized market return assumption.",
      "Assumes the added contribution comes from current flex cash, not new debt."
    ]
  },
  {
    id: "vacation",
    type: "discretionary",
    title: "Take a $3,000 vacation",
    prompt: "What if I take a vacation that costs $3,000?",
    teaser: "Understand the short-term cash draw and the long-term opportunity cost.",
    oneTimeCost: 3000,
    durationMonths: 12,
    horizonYears: 5,
    residualValueAtHorizon: 0,
    confidenceBase: 92,
    assumptions: [
      "Assumes the trip is paid in cash with no financing.",
      "Assumes no offsetting reduction in other discretionary spending.",
      "Assumes the main financial tradeoff is lost compounding on the cash outlay."
    ]
  }
];

export const scenarioExamples = scenarioCatalog.map((scenario) => ({
  title: scenario.title,
  prompt: scenario.prompt,
  teaser: scenario.teaser
}));

export const samplePrompts = [
  "Can I afford a $20,000 car right now?",
  "What happens if my rent jumps by $650?",
  "How bad is a three month layoff?",
  "Would investing $500 a month for 5 years be smart?",
  "Can I swing a $3,000 vacation this summer?",
  "What if I get a 10% raise and invest the difference?"
];
