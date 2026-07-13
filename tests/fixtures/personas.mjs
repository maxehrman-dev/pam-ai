// Layer 3 (BRAIN.md): named, fully-specified persona fixtures. Every engine
// ships assertions across this matrix — "think of every possible user" made
// enforceable instead of aspirational. Amounts are monthly unless noted.

import { getPersonaCoefficients } from "../../src/utils/personaEngine.js";
import { financialProfile } from "../../src/data/mockData.js";

export const PERSONA_FIXTURES = [
  {
    id: "JADE",
    sketch: "24, hourly barista, irregular pay, lives with family, family backstop",
    userValues: { age: 24, worker_type: "hourly", pay_frequency: "irregular", housing: "family", risk_backing: "family" },
    income: 2600, fixedEssentials: 400, variableEssentials: 500, lifestyle: 300, cash: 1500,
    liabilities: [], combinedTaxRate: 12, payFrequency: ""
  },
  {
    id: "MARCUS",
    sketch: "29, freelance designer, irregular pay, supports mom, no backstop",
    userValues: { age: 29, worker_type: "freelance", pay_frequency: "irregular", household: "support_family", risk_backing: "none" },
    income: 4450, fixedEssentials: 1900, variableEssentials: 900, lifestyle: 400, cash: 2000,
    liabilities: [{ label: "Student loan", balance: 12000, rate: 5.5, monthlyPayment: 150 }],
    combinedTaxRate: 25, payFrequency: "", expectTaxBucket: true
  },
  {
    id: "PRIYA",
    sketch: "31, salaried tech, retire at 45, strong cushion, no debt",
    userValues: { age: 31, worker_type: "salaried", pay_frequency: "biweekly", risk_backing: "strong_cushion", retirement_target_age: 45 },
    income: 8900, fixedEssentials: 2600, variableEssentials: 800, lifestyle: 900, cash: 42000,
    contributions: [{ label: "Auto-invest", amount: 1500, bucket: "invest" }],
    liabilities: [], combinedTaxRate: 28, payFrequency: "biweekly"
  },
  {
    id: "DEV",
    sketch: "26, salaried, three debts including a small high-APR card",
    userValues: { age: 26, worker_type: "salaried", pay_frequency: "biweekly" },
    income: 5200, fixedEssentials: 2100, variableEssentials: 700, lifestyle: 500, cash: 6000,
    liabilities: [
      { label: "Store card", balance: 900, rate: 24, monthlyPayment: 35 },
      { label: "Credit card", balance: 2600, rate: 19, monthlyPayment: 80 },
      { label: "Car loan", balance: 9000, rate: 11, monthlyPayment: 180 }
    ],
    combinedTaxRate: 22, payFrequency: "biweekly", expectSnowball: true
  },
  {
    id: "SAM",
    sketch: "35, single income, partner and two kids depend on it",
    userValues: { age: 35, worker_type: "salaried", pay_frequency: "semimonthly", household: "support_family", risk_backing: "dependents" },
    income: 6800, fixedEssentials: 3400, variableEssentials: 1100, lifestyle: 500, cash: 12000,
    liabilities: [], combinedTaxRate: 22, payFrequency: "semimonthly"
  },
  {
    id: "ROSA",
    sketch: "27, nurse, wants a house in 24 months",
    userValues: { age: 27, worker_type: "salaried", pay_frequency: "biweekly", risk_backing: "modest_cushion" },
    income: 5600, fixedEssentials: 2200, variableEssentials: 800, lifestyle: 400, cash: 15000,
    liabilities: [], combinedTaxRate: 20, payFrequency: "biweekly"
  },
  {
    id: "KEN",
    sketch: "30, between jobs, modest cushion",
    userValues: { age: 30, career_stage: "between", risk_backing: "modest_cushion" },
    income: 3800, fixedEssentials: 1900, variableEssentials: 700, lifestyle: 300, cash: 9000,
    liabilities: [], combinedTaxRate: 18, payFrequency: ""
  },
  {
    id: "ALEX",
    sketch: "22, student, part-time income barely covers essentials",
    userValues: { age: 22, worker_type: "hourly", pay_frequency: "irregular", risk_backing: "family" },
    income: 1400, fixedEssentials: 900, variableEssentials: 500, lifestyle: 100, cash: 800,
    liabilities: [], combinedTaxRate: 10, payFrequency: "", expectOverCommitted: true
  },
  {
    id: "NIA",
    sketch: "33, 1099 high earner, wants out at 50, relocatable",
    userValues: { age: 33, worker_type: "freelance", pay_frequency: "monthly", risk_backing: "strong_cushion", retirement_target_age: 50, location_flexible: "yes" },
    income: 11000, fixedEssentials: 3200, variableEssentials: 900, lifestyle: 1200, cash: 60000,
    liabilities: [], combinedTaxRate: 30, payFrequency: "monthly", expectTaxBucket: true
  },
  {
    id: "OWEN",
    sketch: "28, homeowner, others depend on his income",
    userValues: { age: 28, worker_type: "salaried", pay_frequency: "biweekly", housing: "own", risk_backing: "dependents" },
    income: 5900, fixedEssentials: 2800, variableEssentials: 900, lifestyle: 400, cash: 10000,
    liabilities: [{ label: "Mortgage", balance: 210000, rate: 6.1, monthlyPayment: 1450 }],
    combinedTaxRate: 22, payFrequency: "biweekly"
  }
];

// Build a full engine profile for a fixture, persona attached — the same shape
// getScenarioProfileFromBaseline() produces in the app.
export function fixtureProfile(fixture) {
  return {
    ...financialProfile,
    user: {
      ...financialProfile.user,
      creditScore: fixture.creditScore ?? 700,
      age: fixture.userValues.age ?? null,
      retirementTargetAge: fixture.userValues.retirement_target_age ?? null,
      payFrequency: fixture.payFrequency || ""
    },
    persona: getPersonaCoefficients(fixture.userValues, { combinedTaxRate: fixture.combinedTaxRate || 0 }),
    monthly: {
      income: [{ label: "Income", amount: fixture.income }],
      fixed: [{ label: "Fixed essentials", amount: fixture.fixedEssentials, essential: true }],
      variable: [
        { label: "Variable essentials", amount: fixture.variableEssentials, essential: true },
        { label: "Lifestyle", amount: fixture.lifestyle, essential: false }
      ],
      contributions: fixture.contributions || []
    },
    assets: [{ label: "Cash", value: fixture.cash, bucket: "cash", liquid: true, note: "" }],
    liabilities: fixture.liabilities || []
  };
}
