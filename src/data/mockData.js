export const financialProfile = {
  user: {
    name: "Demo User",
    archetype: "Measured Builder",
    city: "Seattle, WA",
    objective: "Stay liquid enough for real life decisions without sacrificing long-term wealth."
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
      { label: "Lifestyle", amount: 880, essential: false },
      { label: "Travel sinking fund", amount: 160, essential: false }
    ],
    contributions: [
      { label: "Emergency reserve", amount: 450, bucket: "cash" },
      { label: "House down payment", amount: 540, bucket: "cash" },
      { label: "Move-out fund", amount: 240, bucket: "cash" },
      { label: "Brokerage auto-invest", amount: 360, bucket: "invest" },
      { label: "Retirement boost", amount: 510, bucket: "invest" }
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
    "Strong liquid cushion",
    "Multiple goals funded every month",
    "Minor drag from revolving debt"
  ]
};

export const defaultGoals = [
  {
    id: "emergency-fund",
    title: "Build 6-month emergency savings",
    category: "Emergency savings",
    targetAmount: 30000,
    currentAmount: 17800,
    monthlyContribution: 450,
    priority: "high",
    fundingSource: "cash",
    targetTimelineMonths: 18,
    annualReturn: 0.024
  },
  {
    id: "move-out",
    title: "Move into my own place",
    category: "Move out",
    targetAmount: 15000,
    currentAmount: 7200,
    monthlyContribution: 240,
    priority: "high",
    fundingSource: "cash",
    targetTimelineMonths: 15,
    annualReturn: 0.02
  },
  {
    id: "house-down-payment",
    title: "Save for a house down payment",
    category: "Buy a house",
    targetAmount: 95000,
    currentAmount: 26000,
    monthlyContribution: 540,
    priority: "high",
    fundingSource: "cash",
    targetTimelineMonths: 72,
    annualReturn: 0.024
  },
  {
    id: "net-worth-500k",
    title: "Reach $500k net worth",
    category: "Net worth",
    targetAmount: 500000,
    currentAmount: 265450,
    monthlyContribution: 360,
    priority: "medium",
    fundingSource: "invest",
    targetTimelineMonths: 90,
    annualReturn: 0.066
  },
  {
    id: "retire-early",
    title: "Build early-retirement runway",
    category: "Retire early",
    targetAmount: 1500000,
    currentAmount: 225300,
    monthlyContribution: 510,
    priority: "medium",
    fundingSource: "invest",
    targetTimelineMonths: 180,
    annualReturn: 0.07
  }
];

export const goalTemplates = [
  {
    id: "template-move-out",
    title: "Move out of parents' house",
    category: "Move out",
    targetAmount: 14000,
    monthlyContribution: 300,
    priority: "high",
    fundingSource: "cash",
    annualReturn: 0.02
  },
  {
    id: "template-house",
    title: "Buy a house",
    category: "Buy a house",
    targetAmount: 100000,
    monthlyContribution: 700,
    priority: "high",
    fundingSource: "cash",
    annualReturn: 0.024
  },
  {
    id: "template-college",
    title: "Save for college",
    category: "Education",
    targetAmount: 60000,
    monthlyContribution: 400,
    priority: "medium",
    fundingSource: "invest",
    annualReturn: 0.055
  },
  {
    id: "template-kids",
    title: "Prepare for kids",
    category: "Family",
    targetAmount: 25000,
    monthlyContribution: 350,
    priority: "medium",
    fundingSource: "cash",
    annualReturn: 0.02
  },
  {
    id: "template-emergency",
    title: "Build emergency savings",
    category: "Emergency savings",
    targetAmount: 30000,
    monthlyContribution: 450,
    priority: "high",
    fundingSource: "cash",
    annualReturn: 0.024
  },
  {
    id: "template-net-worth",
    title: "Reach a net worth milestone",
    category: "Net worth",
    targetAmount: 750000,
    monthlyContribution: 500,
    priority: "medium",
    fundingSource: "invest",
    annualReturn: 0.066
  },
  {
    id: "template-retire",
    title: "Retire early",
    category: "Retire early",
    targetAmount: 1800000,
    monthlyContribution: 600,
    priority: "high",
    fundingSource: "invest",
    annualReturn: 0.07
  }
];

export const starterScenarios = [
  {
    id: "job-loss",
    label: "Lose my job",
    title: "Income interruption",
    type: "jobLoss",
    prompt: "What if I lose my job?",
    teaser: "Stress-test a temporary income gap before it becomes urgent.",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: -7200,
      monthlyInvestingDelta: -450,
      durationMonths: 3,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How long should I model the income loss?",
      field: "durationMonths",
      choices: [
        { label: "1 month", value: 1 },
        { label: "3 months", value: 3 },
        { label: "6 months", value: 6 }
      ]
    }
  },
  {
    id: "buy-car",
    label: "Buy a car",
    title: "Vehicle purchase",
    type: "car",
    prompt: "What if I buy a car?",
    teaser: "Model the upfront hit, monthly burn, and long-term tradeoff.",
    defaults: {
      oneTimeCost: 4000,
      monthlyExpenseDelta: 420,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 60,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 20000,
      upfrontCost: 4000,
      residualValueAtHorizon: 8600
    },
    followUp: {
      prompt: "What price point should I start with?",
      field: "purchaseAmount",
      choices: [
        { label: "$20k", value: 20000 },
        { label: "$30k", value: 30000 },
        { label: "$40k", value: 40000 }
      ]
    }
  },
  {
    id: "move-apartments",
    label: "Move apartments",
    title: "Housing move",
    type: "move",
    prompt: "What if I move apartments?",
    teaser: "See how a different rent profile changes runway and goal timing.",
    defaults: {
      oneTimeCost: 2800,
      monthlyExpenseDelta: 650,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 60,
      moveCost: 2800,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How much more would housing cost each month?",
      field: "monthlyExpenseDelta",
      choices: [
        { label: "+$300", value: 300 },
        { label: "+$650", value: 650 },
        { label: "+$950", value: 950 }
      ]
    }
  },
  {
    id: "emergency-expense",
    label: "Big emergency expense",
    title: "One-time cash shock",
    type: "emergency",
    prompt: "What if I get hit with a big emergency expense?",
    teaser: "Pressure test your cash buffer before a surprise bill shows up.",
    defaults: {
      oneTimeCost: 3500,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 12,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How large is the surprise expense?",
      field: "oneTimeCost",
      choices: [
        { label: "$1k", value: 1000 },
        { label: "$3.5k", value: 3500 },
        { label: "$8k", value: 8000 }
      ]
    }
  },
  {
    id: "start-investing",
    label: "Start investing monthly",
    title: "Increase monthly investing",
    type: "invest",
    prompt: "What if I start investing more every month?",
    teaser: "Trade a smaller monthly buffer for a stronger long-term path.",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 500,
      durationMonths: 60,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How much should I model investing each month?",
      field: "monthlyInvestingDelta",
      choices: [
        { label: "$250", value: 250 },
        { label: "$500", value: 500 },
        { label: "$900", value: 900 }
      ]
    }
  },
  {
    id: "increase-rent",
    label: "Increase rent",
    title: "Rent increase",
    type: "rentIncrease",
    prompt: "What if my rent goes up?",
    teaser: "Model a pure monthly burn increase without a full move.",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 400,
      monthlyIncomeDelta: 0,
      monthlyInvestingDelta: 0,
      durationMonths: 60,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How much higher should I model rent?",
      field: "monthlyExpenseDelta",
      choices: [
        { label: "+$200", value: 200 },
        { label: "+$400", value: 400 },
        { label: "+$700", value: 700 }
      ]
    }
  },
  {
    id: "reduce-income",
    label: "Reduce income",
    title: "Income reduction",
    type: "incomeReduction",
    prompt: "What if my income drops?",
    teaser: "See what a smaller paycheck does to goals and runway.",
    defaults: {
      oneTimeCost: 0,
      monthlyExpenseDelta: 0,
      monthlyIncomeDelta: -1200,
      monthlyInvestingDelta: 0,
      durationMonths: 24,
      moveCost: 0,
      legalCost: 0,
      purchaseAmount: 0,
      upfrontCost: 0,
      residualValueAtHorizon: 0
    },
    followUp: {
      prompt: "How much income should I take out of the plan?",
      field: "monthlyIncomeDelta",
      choices: [
        { label: "-$600", value: -600 },
        { label: "-$1,200", value: -1200 },
        { label: "-$2,000", value: -2000 }
      ]
    }
  }
];

export const scenarioExamples = [
  {
    id: "buy-car",
    title: "Buying a $20,000 car",
    prompt: "What if I buy a $20,000 car?",
    highlight: "Monthly buffer drops sharply and your housing goal slips by more than a year."
  },
  {
    id: "job-loss",
    title: "Losing your job for 3 months",
    prompt: "What if I lose my job for 3 months?",
    highlight: "Cash runway becomes the story immediately, not net worth five years from now."
  },
  {
    id: "emergency-expense",
    title: "Paying a $3,000 emergency expense",
    prompt: "What if I spend $3,000 on a vacation?",
    highlight: "A one-time spend can still push back the next milestone if it comes from cash reserves."
  }
];

export const samplePrompts = [
  "What if I get fired and sued?",
  "Can I buy a $20,000 car this year?",
  "What if my rent goes up by $400?",
  "Would investing $500 a month help more than it hurts?",
  "What happens if I take a $3,000 vacation?"
];

export const comparisonRows = [
  {
    label: "Primary question",
    legacy: "Where did my money go?",
    pam: "What happens if I change my plan?"
  },
  {
    label: "What the product does",
    legacy: "Tracks and categorizes spending",
    pam: "Structures decisions, tests outcomes, and shows tradeoffs"
  },
  {
    label: "Why it matters",
    legacy: "Explains the past",
    pam: "Protects the future before the decision is made"
  }
];

export const featureList = [
  {
    eyebrow: "Guided scenarios",
    title: "PAM structures the question for you",
    copy: "Vague inputs still move forward. The app guesses intent, asks one smart follow-up, and keeps the simulation usable."
  },
  {
    eyebrow: "Life goals",
    title: "See what every decision does to the life you actually want",
    copy: "Each scenario maps to goals like moving out, buying a house, building emergency savings, and reaching a target net worth."
  },
  {
    eyebrow: "Specific outputs",
    title: "Numbers first, commentary second",
    copy: "Monthly cash flow change, time until cash runs out, goal delay, and current-vs-scenario comparisons stay front and center."
  }
];

export const howItWorks = [
  {
    step: "01",
    title: "Start with a real-life decision",
    copy: "Type loosely or tap a starter chip like losing your job, moving apartments, or buying a car."
  },
  {
    step: "02",
    title: "Let PAM fill in the structure",
    copy: "The engine breaks the decision into income, expenses, timeline, and goal impact without making you write a perfect prompt."
  },
  {
    step: "03",
    title: "Use the answer, not just the analysis",
    copy: "You get a clear comparison, the most impacted goal, and the next lever to pull if the answer is not yet."
  }
];

export const trustHighlights = [
  {
    eyebrow: "Privacy by design",
    title: "Scenario math lives on normalized profile data",
    copy:
      "PAM AI is designed so connected-account data can be reduced to balances, liabilities, and cash-flow snapshots before it ever touches the simulator."
  },
  {
    eyebrow: "Security posture",
    title: "2FA and access controls are part of the product surface",
    copy:
      "The MVP includes visible two-factor controls, recovery code management, and device-protection settings so trust is not buried in a settings drawer."
  },
  {
    eyebrow: "Plaid-ready",
    title: "Prepared for Plaid without becoming a raw credential sink",
    copy:
      "The intended integration path uses server-created link tokens, token exchange, and normalized account snapshots so PAM AI can stay decision-first."
  }
];

export const plaidQuickstart = {
  title: "Plaid quickstart path",
  sourceUrl: "https://plaid.com/docs/quickstart/",
  summary:
    "The next integration step is to keep Plaid on the authentication side and feed PAM AI only the normalized snapshot needed for scenario modeling.",
  steps: [
    {
      title: "Create a link token on the server",
      detail: "Generate a short-lived link token for the signed-in user before opening Link in the browser."
    },
    {
      title: "Launch Plaid Link from the client",
      detail: "Use the link token to open Link and capture the temporary public token on success."
    },
    {
      title: "Exchange the public token server-side",
      detail: "Trade the public token for a persistent access token and item id on the backend."
    },
    {
      title: "Normalize accounts into PAM's profile store",
      detail: "Fetch accounts and liabilities, then map balances, debts, and monthly cash flow into the existing scenario schema."
    }
  ],
  sandbox: {
    environment: "Sandbox",
    credentialHint: "Use Plaid sandbox credentials during the first connection test, including the test 2FA step if prompted."
  }
};

export const plaidSandboxSnapshot = {
  accounts: [
    {
      name: "Plaid Checking",
      official_name: "Plaid Gold Standard 0% Interest Checking",
      type: "depository",
      subtype: "checking",
      balances: {
        available: 12840,
        current: 12840
      }
    },
    {
      name: "Plaid High Yield Savings",
      official_name: "Plaid Emergency Reserve Savings",
      type: "depository",
      subtype: "savings",
      balances: {
        available: 21450,
        current: 21450
      }
    },
    {
      name: "Plaid Brokerage",
      official_name: "Plaid Personal Investment Account",
      type: "investment",
      subtype: "brokerage",
      balances: {
        current: 74100
      }
    }
  ],
  liabilities: [
    {
      name: "Student loans",
      type: "student",
      balance: 17200,
      rate: 4.6,
      monthlyPayment: 300
    },
    {
      name: "Credit card",
      type: "credit",
      balance: 1260,
      rate: 17.9,
      minimumPayment: 65
    }
  ],
  monthly: {
    income: [
      { label: "Take-home salary", amount: 9200 },
      { label: "Freelance income", amount: 650 }
    ],
    fixed: [
      { label: "Rent", amount: 2480, essential: true },
      { label: "Utilities & internet", amount: 320, essential: true },
      { label: "Insurance", amount: 410, essential: true },
      { label: "Debt payments", amount: 430, essential: true }
    ],
    variable: [
      { label: "Groceries", amount: 620, essential: true },
      { label: "Transportation", amount: 470, essential: true },
      { label: "Lifestyle", amount: 760, essential: false },
      { label: "Travel sinking fund", amount: 140, essential: false }
    ],
    contributions: [
      { label: "Emergency reserve", amount: 500, bucket: "cash" },
      { label: "House down payment", amount: 600, bucket: "cash" },
      { label: "Move-out fund", amount: 220, bucket: "cash" },
      { label: "Brokerage auto-invest", amount: 420, bucket: "invest" },
      { label: "Retirement boost", amount: 560, bucket: "invest" }
    ]
  }
};

export const privacyPolicy = {
  version: "1.1",
  effectiveDate: "April 21, 2026",
  summary:
    "PAM AI helps users model financial decisions. The product is designed to minimize raw financial data exposure, keep security controls visible, and separate connected-account access from the decision engine itself.",
  sections: [
    {
      title: "What PAM AI collects",
      paragraphs: [
        "PAM AI uses a financial profile, user-defined goals, scenario inputs, and account-security settings in order to simulate decisions and show their consequences.",
        "In this MVP, seeded mock data powers the experience unless a future linked account snapshot is normalized into the profile store."
      ],
      bullets: [
        "Assets, liabilities, balances, and monthly cash flow inputs",
        "Goals, priorities, timelines, and scenario history",
        "Security settings such as two-factor status, trusted device count, and recovery-code metadata"
      ]
    },
    {
      title: "How decision modeling works",
      paragraphs: [
        "PAM AI compares a current financial path against a hypothetical one using structured cash flow, savings, and long-term compounding assumptions.",
        "The product is designed to work from normalized financial data rather than direct banking credentials."
      ]
    },
    {
      title: "Future Plaid connectivity",
      paragraphs: [
        "If Plaid is connected, Plaid would handle account authentication and token exchange. PAM AI's role is to receive scoped account data, map it into a normalized profile, and use that profile for decision modeling.",
        "PAM AI is not intended to store bank usernames or passwords."
      ]
    },
    {
      title: "How data is used",
      paragraphs: [
        "Financial and goal data is used to produce scenario comparisons, goal-impact timelines, and product guidance inside the workspace.",
        "Security metadata is used for account protection, suspicious-login alerts, and recovery workflows."
      ]
    },
    {
      title: "User controls",
      paragraphs: [
        "Users should be able to review their data source, enable two-factor authentication, manage trusted devices, rotate recovery codes, and request deletion or export of their profile.",
        "These controls are surfaced in-product so trust remains part of the core experience."
      ]
    },
    {
      title: "Retention and deletion",
      paragraphs: [
        "PAM AI should retain only the profile, goals, scenario history, and security metadata needed to deliver the product and protect user accounts.",
        "When a linked account is disconnected in the future, the intended behavior is to remove or refresh outdated normalized snapshots rather than keep stale raw banking data."
      ]
    },
    {
      title: "Contact and updates",
      paragraphs: [
        "Material policy changes should be announced inside the product before they apply to newly processed financial data.",
        "Questions about privacy or connected-account handling should be routed to the product's support and privacy channels."
      ],
      bullets: ["privacy@pamai.app", "support@pamai.app"]
    }
  ]
};
