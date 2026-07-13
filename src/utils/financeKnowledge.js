// Deterministic financial knowledge: rules and math that should never come
// from the AI. Facts live in data tables (easy to audit, easy to update when
// the IRS changes a number); engines are small pure functions. See BRAIN.md —
// this ships P1-a support, P2-a (debt payoff planner), P2-b (affordability
// ceilings), and the first slices of P3-a/P3-b (benchmarks + account rules).

import { clamp, formatCurrency } from "./formatters.js";

// ─── Retirement & account rules (educational facts, year-labeled) ───────────
// Each fact: keyword topics + one plain-English sentence PAM can surface and
// the AI can quote but never contradict. Update the numbers annually.

const MONEY_FACTS = [
  {
    id: "401k-limit",
    topics: ["401k", "401(k)", "contribution limit", "max my 401k"],
    text: "2026 401(k) employee contribution limit: $24,500 ($8,000 extra catch-up at 50+). Educational figure — verify the current-year IRS limit."
  },
  {
    id: "401k-match",
    topics: ["401k", "401(k)", "employer match", "match"],
    text: "An employer 401(k) match is an immediate 50–100% return on the matched dollars — contributing at least enough to capture the full match beats almost every other use of that money."
  },
  {
    id: "401k-lock",
    topics: ["401k", "401(k)", "retire early", "retire at", "early retirement"],
    text: "401(k) and IRA money is generally locked until age 59½ (10% penalty plus taxes on early withdrawal, with narrow exceptions like the Rule of 55 and 72(t) payments). Retiring earlier needs a taxable bridge fund you can actually touch."
  },
  {
    id: "roth-limit",
    topics: ["roth", "ira", "contribution limit"],
    text: "2026 IRA contribution limit (Roth + traditional combined): $7,500 ($1,100 extra catch-up at 50+). Roth contributions phase out at higher incomes (roughly $150k+ single). Educational figure — verify current-year limits."
  },
  {
    id: "roth-access",
    topics: ["roth", "withdraw", "take money out"],
    text: "Roth IRA contributions (not earnings) can be withdrawn anytime tax- and penalty-free. Earnings withdrawn before 59½ and before the account is 5 years old are generally taxed plus a 10% penalty."
  },
  {
    id: "roth-vs-traditional",
    topics: ["roth", "traditional", "pre-tax", "pretax"],
    text: "Roth = pay tax now, withdraw tax-free later; traditional = deduct now, pay tax at withdrawal. Early in a career (lower bracket now than later), Roth usually wins; the reverse favors traditional."
  },
  {
    id: "rmd",
    topics: ["rmd", "required minimum", "73", "retirement account"],
    text: "Traditional retirement accounts have required minimum distributions starting at age 73 (rising to 75 for younger savers). Roth IRAs have no RMDs during the owner's lifetime."
  },
  {
    id: "hsa",
    topics: ["hsa", "health savings"],
    text: "An HSA is triple tax-advantaged (deductible in, grows untaxed, tax-free out for medical costs). 2026 limits: about $4,400 self / $8,750 family. Educational figure — verify current-year limits."
  },
  {
    id: "debt-vs-invest",
    topics: ["pay off debt", "debt or invest", "pay down", "avalanche", "snowball"],
    text: "Paying down debt is a guaranteed return equal to its APR. Debt above roughly 7% APR beats expected long-run market returns; below ~4%, investing alongside minimum payments usually wins; in between it's a judgment call on risk tolerance."
  },
  {
    id: "emergency-first",
    topics: ["emergency fund", "buffer", "safety net", "how much should i save"],
    text: "The standard emergency buffer is 3–6 months of essential costs in cash — more for irregular income, self-employment, or dependents; less matters when a reliable backstop exists."
  }
];

const BENCHMARK_TOPICS = ["am i saving enough", "on track", "behind", "doing okay", "compare", "average", "normal", "enough saved"];

// Common industry heuristics, labeled as such — never presented as peer data.
const SAVINGS_BENCHMARKS = [
  { maxAge: 29, text: "Common heuristic for your bracket: save 10–15% of income and aim for ~1x annual salary in total savings by 30." },
  { maxAge: 39, text: "Common heuristic for your bracket: save 15–20% of income and aim for ~3x annual salary in total savings by 40." },
  { maxAge: 49, text: "Common heuristic for your bracket: save 15–20% of income and aim for ~6x annual salary in total savings by 50." },
  { maxAge: 120, text: "Common heuristic: total savings of ~8x annual salary by 60 supports a conventional retirement age; retiring earlier needs meaningfully more." }
];

function normalize(text) {
  return String(text || "").toLowerCase();
}

// Keyword-matched deterministic facts for a prompt. Returns at most `limit`
// plain sentences; empty array when nothing matches.
export function getMoneyFacts(prompt, { age = null, limit = 4 } = {}) {
  const normalized = normalize(prompt);
  if (!normalized) return [];

  const facts = MONEY_FACTS
    .filter((fact) => fact.topics.some((topic) => normalized.includes(topic)))
    .map((fact) => fact.text);

  if (BENCHMARK_TOPICS.some((topic) => normalized.includes(topic))) {
    const band = SAVINGS_BENCHMARKS.find((entry) => (Number(age) || 30) <= entry.maxAge);
    if (band) facts.push(band.text);
  }

  return facts.slice(0, limit);
}

// ─── Affordability ceilings (P2-b) ──────────────────────────────────────────
// Deterministic, persona-adjusted spending ceilings so "can I afford X?"
// answers anchor to an exact computed line instead of an AI guess. Ratios are
// calibrated for TAKE-HOME income (classic rules quote gross; take-home
// equivalents run ~3-5 points higher). Composition rule: every extra month of
// persona buffer target (risk signals) tightens each ceiling slightly.

export function computeAffordabilityCeilings({ monthlyTakeHome, persona = {}, debtToIncome = 0 }) {
  const income = Number(monthlyTakeHome) || 0;
  if (income <= 0) return null;

  const bufferMonths = clamp(Number(persona.bufferTargetMonths) || 3, 2, 9);
  const riskTightening = (bufferMonths - 3) * 0.01;
  const rentPct = clamp(0.33 - riskTightening, 0.24, 0.35);
  const carBase = Number(debtToIncome) > 0.36 ? 0.10 : 0.15;
  const carPct = clamp(carBase - riskTightening, 0.06, 0.16);
  const homeMultiple = clamp(4.5 - (bufferMonths - 3) * 0.15, 3.2, 4.5);

  return {
    rentMonthly: Math.round(income * rentPct),
    rentPct: Math.round(rentPct * 100),
    carAllInMonthly: Math.round(income * carPct),
    carPct: Math.round(carPct * 100),
    homePriceMax: Math.round(income * 12 * homeMultiple),
    homeMultiple: Math.round(homeMultiple * 10) / 10,
    notes: [
      `Rent ceiling: ${Math.round(rentPct * 100)}% of take-home (${formatCurrency(Math.round(income * rentPct))}/mo)${bufferMonths > 3 ? " — tightened for your risk profile" : ""}.`,
      `Car all-in ceiling (payment + insurance + fuel): ${Math.round(carPct * 100)}% of take-home (${formatCurrency(Math.round(income * carPct))}/mo)${Number(debtToIncome) > 0.36 ? " — reduced because existing debt payments are heavy" : ""}.`,
      `Home price ceiling: about ${Math.round(homeMultiple * 10) / 10}x annual take-home (${formatCurrency(Math.round(income * 12 * homeMultiple))}). Rate and down payment move this; treat it as a first screen, not pre-approval.`
    ]
  };
}

// ─── Retirement bridge math (P2-d) ───────────────────────────────────────────
// Retirement accounts are generally locked until 59½. Anyone targeting an
// earlier exit needs a taxable "bridge" that carries them from target age to
// 59½ — this computes the gap and a deterministic allocation-philosophy split
// (never specific funds). Share table: the earlier the exit, the more of new
// long-term saving belongs in accessible taxable accounts.

export function computeRetirementBridge({ targetAge, monthlyEssentials = 0 }) {
  const age = Number(targetAge) || 0;
  if (age <= 0 || age >= 59.5) return null;

  const bridgeYears = Math.round((59.5 - age) * 10) / 10;
  const taxableSharePct = age < 50 ? 60 : age <= 55 ? 50 : 40;
  const essentials = Math.max(Number(monthlyEssentials) || 0, 0);
  const bridgeFundTarget = essentials > 0 ? Math.round(essentials * 12 * bridgeYears) : null;

  return {
    targetAge: age,
    bridgeYears,
    taxableSharePct,
    taxAdvantagedSharePct: 100 - taxableSharePct,
    bridgeFundTarget,
    notes: [
      `Retiring at ${age} means ${bridgeYears} years before retirement accounts unlock at 59½ — that stretch runs on money you can actually touch.`,
      `Deterministic split for new long-term saving at this target: ~${taxableSharePct}% accessible taxable investing / ~${100 - taxableSharePct}% tax-advantaged. Allocation philosophy, not fund advice.`,
      ...(bridgeFundTarget
        ? [`At current essential costs, the bridge itself needs roughly ${formatCurrency(bridgeFundTarget)} (${bridgeYears} years of essentials) before growth — an educational first screen, not a plan.`]
        : [])
    ]
  };
}

// ─── Debt payoff planner (P2-a) ──────────────────────────────────────────────
// Month-by-month simulation (exact, no closed-form approximations): pay every
// minimum, throw `extraMonthly` plus freed-up minimums at one target debt at a
// time. Avalanche targets highest APR (mathematically optimal); snowball
// targets smallest balance (motivation). Deterministic recommendation rule:
// snowball only when >= 3 debts and the smallest is under $1,000 — the quick
// win is worth its small interest cost; otherwise avalanche.

const MAX_PAYOFF_MONTHS = 600;

function simulatePayoff(debts, extraMonthly) {
  const state = debts.map((debt) => ({ ...debt, remaining: debt.balance, payoffMonth: null }));
  let totalInterest = 0;

  for (let month = 1; month <= MAX_PAYOFF_MONTHS; month += 1) {
    const open = state.filter((debt) => debt.remaining > 0);
    if (!open.length) {
      return { months: month - 1, totalInterest: Math.round(totalInterest), debts: state, stalled: false };
    }

    let pool = extraMonthly + state.filter((d) => d.remaining <= 0).reduce((t, d) => t + d.minimum, 0);
    const balanceBefore = open.reduce((t, d) => t + d.remaining, 0);

    for (const debt of open) {
      const interest = debt.remaining * (debt.apr / 1200);
      totalInterest += interest;
      debt.remaining += interest;
      const payment = Math.min(debt.minimum, debt.remaining);
      debt.remaining -= payment;
    }

    // Extra pool goes to the first still-open debt in strategy order.
    for (const debt of open) {
      if (pool <= 0) break;
      if (debt.remaining <= 0) continue;
      const payment = Math.min(pool, debt.remaining);
      debt.remaining -= payment;
      pool -= payment;
    }

    for (const debt of open) {
      if (debt.remaining <= 0.005 && debt.payoffMonth === null) {
        debt.remaining = 0;
        debt.payoffMonth = month;
      }
    }

    const balanceAfter = state.reduce((t, d) => t + Math.max(d.remaining, 0), 0);
    if (balanceAfter >= balanceBefore - 0.01) {
      // Payments don't cover interest — the plan never terminates.
      return { months: null, totalInterest: null, debts: state, stalled: true };
    }
  }

  return { months: null, totalInterest: null, debts: state, stalled: true };
}

export function buildDebtPayoffPlan(liabilities = [], extraMonthly = 0) {
  const debts = (liabilities || [])
    .map((item) => ({
      label: item.label || item.name || "Debt",
      balance: Math.max(Number(item.balance) || 0, 0),
      apr: Math.max(Number(item.rate) || 0, 0),
      minimum: Math.max(Number(item.monthlyPayment ?? item.minimumPayment) || 0, 0)
    }))
    .filter((debt) => debt.balance > 0);

  if (!debts.length) return null;

  const extra = Math.max(Math.round(Number(extraMonthly) || 0), 0);
  const byRate = [...debts].sort((a, b) => b.apr - a.apr);
  const byBalance = [...debts].sort((a, b) => a.balance - b.balance);

  const avalanche = simulatePayoff(byRate.map((d) => ({ ...d })), extra);
  const snowball = simulatePayoff(byBalance.map((d) => ({ ...d })), extra);

  const smallest = byBalance[0];
  const preferSnowball = debts.length >= 3 && smallest.balance < 1000;
  const recommendation = preferSnowball ? "snowball" : "avalanche";
  const recommended = preferSnowball ? snowball : avalanche;
  const interestGap = avalanche.totalInterest !== null && snowball.totalInterest !== null
    ? snowball.totalInterest - avalanche.totalInterest
    : null;

  return {
    extraMonthly: extra,
    debtCount: debts.length,
    totalBalance: Math.round(debts.reduce((t, d) => t + d.balance, 0)),
    avalanche: { months: avalanche.months, totalInterest: avalanche.totalInterest, order: byRate.map((d) => d.label), stalled: avalanche.stalled },
    snowball: { months: snowball.months, totalInterest: snowball.totalInterest, order: byBalance.map((d) => d.label), stalled: snowball.stalled },
    recommendation,
    stalled: recommended.stalled,
    reason: recommended.stalled
      ? "Current payments don't cover the interest — the balances grow instead of shrinking. The lever is a bigger payment or a lower rate, not payoff order."
      : preferSnowball
        ? `Snowball: clearing ${smallest.label} (${formatCurrency(smallest.balance)}) first is a fast win that frees its payment${interestGap ? `, costing about ${formatCurrency(interestGap)} more interest than avalanche` : ""}.`
        : `Avalanche: paying the highest APR first (${byRate[0].label} at ${byRate[0].apr}%) minimizes total interest${interestGap ? ` — about ${formatCurrency(interestGap)} less than smallest-balance-first` : ""}.`
  };
}
