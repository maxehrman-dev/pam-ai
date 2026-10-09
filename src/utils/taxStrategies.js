// Tax-aware account comparison + tax analytics. Runs the same seeded Monte
// Carlo paths through each account's tax rules so every account sees identical
// markets — the only difference is tax treatment. Educational estimates of
// legal, mainstream strategies only; never tax advice, never evasion.

import { clamp } from "./formatters.js";
import { MARKET_ASSUMPTIONS, simulateMarketRange } from "./monteCarlo.js";

// Year-labeled IRS figures (single filer). Update annually; keep in sync with
// MONEY_FACTS in financeKnowledge.js.
export const TAX_FACTS = Object.freeze({
  year: 2026,
  limit401k: 24500,
  limitIra: 7500,
  limitHsaSelf: 4400,
  rothIraPhaseOutStart: 153000,
  rothIraPhaseOutEnd: 168000,
  ltcgZeroTop: 49450,
  ltcgFifteenTop: 545500,
  saversCreditAgiTop: 40250,
  capitalLossOffset: 3000,
  earlyWithdrawalPenalty: 0.1,
  accessAge: 59.5,
  dividendYield: 0.015,
  ficaEmployee: 0.0765,
  assumedRetirementFederal: 0.12
});

const UNIT = 1000;

function n(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scale(range, monthly) {
  const factor = monthly / UNIT;
  return {
    low: Math.round(range.low * factor),
    typical: Math.round(range.typical * factor),
    high: Math.round(range.high * factor)
  };
}

function mapRange(range, fn) {
  return { low: Math.round(fn(range.low)), typical: Math.round(fn(range.typical)), high: Math.round(fn(range.high)) };
}

function addRanges(left, right) {
  return { low: left.low + right.low, typical: left.typical + right.typical, high: left.high + right.high };
}

export function getLtcgRate(taxableIncome) {
  if (taxableIncome <= TAX_FACTS.ltcgZeroTop) return 0;
  if (taxableIncome <= TAX_FACTS.ltcgFifteenTop) return 0.15;
  return 0.2;
}

export function getRothIraEligibleShare(grossAnnual) {
  if (grossAnnual <= TAX_FACTS.rothIraPhaseOutStart) return 1;
  if (grossAnnual >= TAX_FACTS.rothIraPhaseOutEnd) return 0;
  return (TAX_FACTS.rothIraPhaseOutEnd - grossAnnual) / (TAX_FACTS.rothIraPhaseOutEnd - TAX_FACTS.rothIraPhaseOutStart);
}

// Normalizes whatever tax info the profile has. Missing data gets named
// defaults so the assumption is visible instead of silently invented.
export function resolveTaxInputs(tax = {}) {
  const notes = [];
  const known = n(tax.federalMarginal, -1) >= 0;
  const federalMarginal = known ? clamp(n(tax.federalMarginal), 0, 0.37) : 0.22;
  const stateRate = n(tax.stateRate, -1) >= 0 ? clamp(n(tax.stateRate), 0, 0.15) : 0.05;
  const taxableIncome = n(tax.taxableIncome, -1) >= 0 ? n(tax.taxableIncome) : 60000;
  const grossAnnual = n(tax.grossAnnual, 0) > 0 ? n(tax.grossAnnual) : taxableIncome + 15000;
  const selfEmployed = tax.employmentStatus === "1099";
  if (!known) notes.push("Your tax profile is incomplete, so PAM assumed a 22% federal bracket and 5% state rate. Add your income to sharpen this.");
  return { federalMarginal, stateRate, taxableIncome, grossAnnual, selfEmployed, notes };
}

// A legal-strategy library. Each entry fires only when its condition matches
// this user, so the list stays short and specific.
const STRATEGY_LIBRARY = [
  {
    id: "employer-match",
    when: (ctx) => !ctx.selfEmployed,
    text: "If your employer matches 401(k) contributions, contribute at least enough to get the full match first — it's an instant 50–100% return before any tax math."
  },
  {
    id: "hsa",
    when: () => true,
    text: `With an HSA-eligible high-deductible health plan, an HSA is the only triple tax break: deductible in, untaxed growth, tax-free out for medical costs (${TAX_FACTS.year} limit about $${TAX_FACTS.limitHsaSelf.toLocaleString("en-US")} self-only).`
  },
  {
    id: "roth-vs-traditional",
    when: () => true,
    text: (ctx) => ctx.favorTraditional
      ? `Your bracket now (~${ctx.currentRatePct}%) looks higher than PAM's retirement estimate (~${ctx.retirementRatePct}%), so pre-tax Traditional dollars likely win.`
      : `Your bracket now (~${ctx.currentRatePct}%) is close to or below PAM's retirement estimate (~${ctx.retirementRatePct}%), so paying tax now with Roth likely wins.`
  },
  {
    id: "backdoor-roth",
    when: (ctx) => ctx.rothShare < 1,
    text: `Your income is in or above the Roth IRA phase-out (~$${TAX_FACTS.rothIraPhaseOutStart.toLocaleString("en-US")}–$${TAX_FACTS.rothIraPhaseOutEnd.toLocaleString("en-US")} single). A "backdoor" Roth (nondeductible Traditional IRA, then convert) is a legal route — watch the pro-rata rule if you hold other pre-tax IRA money.`
  },
  {
    id: "mega-backdoor",
    when: (ctx) => ctx.grossAnnual >= 120000 && !ctx.selfEmployed,
    text: "Some 401(k) plans allow after-tax contributions with in-plan Roth conversion (\"mega backdoor Roth\"). Check your plan document — it's plan-dependent."
  },
  {
    id: "solo-401k",
    when: (ctx) => ctx.selfEmployed,
    text: "Self-employed? A Solo 401(k) or SEP IRA lets you shelter far more than an IRA alone, and the QBI deduction may cut taxable business income by up to 20%."
  },
  {
    id: "zero-ltcg",
    when: (ctx) => ctx.taxableIncome <= TAX_FACTS.ltcgZeroTop,
    text: `Your taxable income is inside the 0% long-term capital-gains bracket (up to ~$${TAX_FACTS.ltcgZeroTop.toLocaleString("en-US")} single). Selling winners held 1+ year and rebuying can reset cost basis at zero federal tax ("gain harvesting").`
  },
  {
    id: "loss-harvest",
    when: (ctx) => ctx.taxableIncome > TAX_FACTS.ltcgZeroTop,
    text: `In a taxable account, selling losers to realize losses offsets gains plus up to $${TAX_FACTS.capitalLossOffset.toLocaleString("en-US")}/yr of ordinary income. Avoid buying the same fund within 30 days (wash-sale rule).`
  },
  {
    id: "asset-location",
    when: () => true,
    text: "Asset location: keep bonds and high-dividend funds in tax-advantaged accounts and broad index funds in taxable, where qualified dividends and long-term gains are taxed less."
  },
  {
    id: "hold-a-year",
    when: () => true,
    text: "Hold taxable investments 1+ year before selling — short-term gains are taxed as ordinary income; long-term gains get the lower 0/15/20% rates."
  },
  {
    id: "savers-credit",
    when: (ctx) => ctx.grossAnnual <= TAX_FACTS.saversCreditAgiTop,
    text: `At your income, the Saver's Credit may pay back 10–50% of retirement contributions (single AGI roughly under $${TAX_FACTS.saversCreditAgiTop.toLocaleString("en-US")}).`
  },
  {
    id: "roth-conversion-low-year",
    when: (ctx) => ctx.federalMarginal <= 0.12,
    text: "Low-bracket years (school, between jobs, early career) are the cheapest time to do Roth conversions — you pay 10–12% now on money that grows tax-free forever."
  },
  {
    id: "early-access",
    when: (ctx) => ctx.horizonEndsBeforeAccess,
    text: `This horizon ends before ${TAX_FACTS.accessAge}. Retirement-account earnings pulled early generally owe tax plus a 10% penalty; Roth IRA contributions (not earnings) can come out anytime. Money needed sooner belongs in taxable or cash.`
  }
];

// Compares where the same out-of-pocket monthly dollars end up after tax in
// each account type, across the same simulated markets.
export function compareTaxStrategies({ monthlyBudget, months, tax = {}, age = null } = {}) {
  const budget = Math.max(n(monthlyBudget), 0);
  const horizon = Math.round(clamp(n(months, 120), 12, 540));
  if (budget <= 0) return null;

  const inputs = resolveTaxInputs(tax);
  const currentRate = inputs.federalMarginal + inputs.stateRate;
  const retirementRate = Math.min(currentRate, TAX_FACTS.assumedRetirementFederal + inputs.stateRate);
  const ltcgRate = getLtcgRate(inputs.taxableIncome) + inputs.stateRate;
  const dividendTaxRate = ltcgRate;
  const rothShare = getRothIraEligibleShare(inputs.grossAnnual);
  const ageNumber = n(age, 0);
  const horizonEndsBeforeAccess = ageNumber > 0 && ageNumber + horizon / 12 < TAX_FACTS.accessAge;

  // Same seed for every account so all strategies face identical markets.
  const seedKey = `tax-compare:${horizon}`;
  const sheltered = simulateMarketRange({ monthlyContribution: UNIT, months: horizon, seedKey });
  const taxableReturn = MARKET_ASSUMPTIONS.annualReturn - TAX_FACTS.dividendYield * dividendTaxRate;
  const taxable = simulateMarketRange({ monthlyContribution: UNIT, months: horizon, annualReturn: taxableReturn, seedKey });

  const grossUp = 1 / (1 - currentRate);
  const totalOutOfPocket = budget * horizon;

  // After-tax value of the taxable-account slice funded with `monthly` dollars.
  const taxableAfterTax = (monthly) => {
    if (monthly <= 0) return { range: { low: 0, typical: 0, high: 0 }, exitTax: 0, dragTax: 0 };
    const pot = scale(taxable, monthly);
    const noDrag = scale(sheltered, monthly);
    const basis = monthly * horizon;
    const afterTax = mapRange(pot, (value) => value - Math.max(value - basis, 0) * ltcgRate);
    return {
      range: afterTax,
      exitTax: Math.round(Math.max(pot.typical - basis, 0) * ltcgRate),
      dragTax: Math.max(noDrag.typical - pot.typical, 0)
    };
  };

  const upfrontTaxOn = (outOfPocketMonthly) => Math.round(outOfPocketMonthly * horizon * (grossUp - 1));

  const strategies = [];

  {
    const slice = taxableAfterTax(budget);
    strategies.push({
      id: "taxable",
      label: "Taxable brokerage",
      monthlyIntoAccount: Math.round(budget),
      afterTax: slice.range,
      taxes: { upfront: upfrontTaxOn(budget), duringGrowth: slice.dragTax, atWithdrawal: slice.exitTax },
      note: `Dividends taxed yearly (~${Math.round(TAX_FACTS.dividendYield * 1000) / 10}% yield) and gains taxed at ~${Math.round(ltcgRate * 100)}% when sold. Fully accessible anytime.`
    });
  }

  {
    const cap = (TAX_FACTS.limitIra / 12) * rothShare;
    const intoRoth = Math.min(budget, cap);
    const spill = taxableAfterTax(budget - intoRoth);
    const rothPot = scale(sheltered, intoRoth);
    strategies.push({
      id: "roth-ira",
      label: "Roth IRA",
      monthlyIntoAccount: Math.round(intoRoth),
      overflowToTaxable: Math.round(budget - intoRoth),
      afterTax: addRanges(rothPot, spill.range),
      taxes: { upfront: upfrontTaxOn(budget), duringGrowth: spill.dragTax, atWithdrawal: spill.exitTax },
      eligible: rothShare > 0,
      note: rothShare <= 0
        ? "Income is above the direct Roth IRA limit — see the backdoor Roth note."
        : `Taxed now, tax-free later. Limit ~$${Math.round(cap).toLocaleString("en-US")}/mo${rothShare < 1 ? " (reduced by the income phase-out)" : ""}; the rest goes to taxable.`
    });
  }

  {
    const cap = TAX_FACTS.limit401k / 12;
    const intoRoth401k = Math.min(budget, cap);
    const spill = taxableAfterTax(budget - intoRoth401k);
    strategies.push({
      id: "roth-401k",
      label: inputs.selfEmployed ? "Roth Solo 401(k)" : "Roth 401(k)",
      monthlyIntoAccount: Math.round(intoRoth401k),
      overflowToTaxable: Math.round(budget - intoRoth401k),
      afterTax: addRanges(scale(sheltered, intoRoth401k), spill.range),
      taxes: { upfront: upfrontTaxOn(budget), duringGrowth: spill.dragTax, atWithdrawal: spill.exitTax },
      note: "Same tax treatment as a Roth IRA with a much higher limit and no income cap — only if your plan offers a Roth option."
    });
  }

  {
    const cap = TAX_FACTS.limit401k / 12;
    const intoTraditional = Math.min(budget * grossUp, cap);
    const outOfPocketUsed = intoTraditional / grossUp;
    const leftover = budget - outOfPocketUsed;
    const spill = taxableAfterTax(leftover);
    const pot = scale(sheltered, intoTraditional);
    const deferredTax = Math.round(pot.typical * retirementRate);
    strategies.push({
      id: "traditional-401k",
      label: inputs.selfEmployed ? "Traditional Solo 401(k)" : "Traditional 401(k)",
      monthlyIntoAccount: Math.round(intoTraditional),
      overflowToTaxable: Math.round(leftover),
      afterTax: addRanges(mapRange(pot, (value) => value * (1 - retirementRate)), spill.range),
      taxes: { upfront: upfrontTaxOn(leftover), duringGrowth: spill.dragTax, atWithdrawal: deferredTax + spill.exitTax },
      upfrontTaxSaved: Math.round(intoTraditional * horizon * currentRate),
      note: `Pre-tax: your $${Math.round(outOfPocketUsed).toLocaleString("en-US")}/mo out of pocket puts $${Math.round(intoTraditional).toLocaleString("en-US")}/mo in, because the tax break refills it. Withdrawals taxed at an assumed ~${Math.round(retirementRate * 100)}% in retirement.`
    });
  }

  {
    const ficaSaved = inputs.selfEmployed ? 0 : TAX_FACTS.ficaEmployee;
    const hsaGrossUp = 1 / (1 - currentRate - ficaSaved);
    const cap = TAX_FACTS.limitHsaSelf / 12;
    const intoHsa = Math.min(budget * hsaGrossUp, cap);
    const leftover = budget - intoHsa / hsaGrossUp;
    const spill = taxableAfterTax(leftover);
    strategies.push({
      id: "hsa",
      label: "HSA (medical use)",
      conditional: true,
      monthlyIntoAccount: Math.round(intoHsa),
      overflowToTaxable: Math.round(leftover),
      afterTax: addRanges(scale(sheltered, intoHsa), spill.range),
      taxes: { upfront: upfrontTaxOn(leftover), duringGrowth: spill.dragTax, atWithdrawal: spill.exitTax },
      upfrontTaxSaved: Math.round(intoHsa * horizon * (currentRate + ficaSaved)),
      note: `Only with an HSA-eligible health plan; tax-free out for qualified medical costs${ficaSaved ? ", and payroll contributions also skip the 7.65% FICA tax" : ""}. Limit ~$${Math.round(cap).toLocaleString("en-US")}/mo.`
    });
  }

  const taxableTypical = strategies[0].afterTax.typical;
  for (const strategy of strategies) {
    const totalTax = strategy.taxes.upfront + strategy.taxes.duringGrowth + strategy.taxes.atWithdrawal;
    strategy.taxes.total = totalTax;
    strategy.effectiveTaxRatePct = Math.round((totalTax / Math.max(strategy.afterTax.typical + totalTax, 1)) * 1000) / 10;
    strategy.vsTaxableTypical = strategy.afterTax.typical - taxableTypical;
  }

  const ranked = strategies
    .filter((strategy) => !strategy.conditional && strategy.eligible !== false)
    .sort((left, right) => right.afterTax.typical - left.afterTax.typical);
  const best = ranked[0];

  const ctx = {
    ...inputs,
    rothShare,
    horizonEndsBeforeAccess,
    favorTraditional: currentRate >= retirementRate + 0.05,
    currentRatePct: Math.round(currentRate * 100),
    retirementRatePct: Math.round(retirementRate * 100)
  };
  const strategyNotes = STRATEGY_LIBRARY
    .filter((entry) => entry.when(ctx))
    .map((entry) => ({ id: entry.id, text: typeof entry.text === "function" ? entry.text(ctx) : entry.text }));

  return {
    year: TAX_FACTS.year,
    monthlyBudget: Math.round(budget),
    months: horizon,
    totalOutOfPocket: Math.round(totalOutOfPocket),
    rates: {
      currentPct: ctx.currentRatePct,
      retirementPct: ctx.retirementRatePct,
      capitalGainsPct: Math.round(ltcgRate * 100)
    },
    strategies,
    bestId: best.id,
    bestLabel: best.label,
    bestVsTaxableTypical: best.vsTaxableTypical,
    strategyNotes,
    assumptions: [
      ...inputs.notes,
      `Every account runs through the same ${sheltered.runs.toLocaleString("en-US")} simulated markets, so the only difference is tax treatment.`,
      `${TAX_FACTS.year} single-filer limits and brackets. Retirement withdrawals assumed at ~${ctx.retirementRatePct}% (12% federal bracket plus your state). Educational estimate, not tax advice — verify with a tax professional.`
    ]
  };
}
