// Compound interest, made personal. Deterministic math on the user's own
// numbers: what waiting costs, how often money doubles, and how high-APR debt
// compounds against them. Uses the same 6.8% planning return as the engine.
// Copy rule: no em dashes.

import { formatCurrency } from "./formatters.js";

export const PLANNING_RETURN = 0.068;

function monthlyRate(annualReturn) {
  return Math.pow(1 + annualReturn, 1 / 12) - 1;
}

// Future value of `monthly` invested every month for `months` months.
export function futureValueOfMonthly(monthly, months, annualReturn = PLANNING_RETURN) {
  if (monthly <= 0 || months <= 0) return 0;
  const r = monthlyRate(annualReturn);
  if (r === 0) return monthly * months;
  return monthly * ((Math.pow(1 + r, months) - 1) / r);
}

export function yearsToDouble(annualRatePct) {
  const rate = Number(annualRatePct);
  if (!(rate > 0)) return null;
  return Math.round((72 / rate) * 10) / 10;
}

// What starting `delayYears` later costs by `endAge`, and the monthly amount a
// late start needs to land in the same place.
export function costOfWaiting({ monthly, startAge, endAge = 65, delayYears = 5, annualReturn = PLANNING_RETURN }) {
  const months = Math.round((endAge - startAge) * 12);
  const delayedMonths = months - delayYears * 12;
  if (!(monthly > 0) || months <= 12 || delayedMonths <= 12) return null;
  const startNow = Math.round(futureValueOfMonthly(monthly, months, annualReturn));
  const startLater = Math.round(futureValueOfMonthly(monthly, delayedMonths, annualReturn));
  const catchUpMonthly = monthly * (startNow / startLater);
  return {
    monthly: Math.round(monthly),
    startAge,
    endAge,
    delayYears,
    startNow,
    startLater,
    cost: startNow - startLater,
    catchUpMonthly: Math.round(catchUpMonthly),
    totalContributedNow: Math.round(monthly * months)
  };
}

const COMPOUND_PROMPT = /\b(compound\w*|invest\w*|retire\w*|saving|save|roth|401k|401\(k\)|ira|index fund|grow|start (now|early|later)|wait\w*|rule of 72|interest)\b/i;

// Personalized compounding insights for a decision. Returns null when the
// question has nothing to do with growth or interest.
export function buildCompoundingInsights({ prompt = "", age = null, retirementAge = null, monthlyInvesting = 0, liabilities = [] } = {}) {
  const asksAboutGrowth = COMPOUND_PROMPT.test(prompt);
  const worstDebt = (liabilities || [])
    .filter((item) => Number(item.rate) >= 10 && Number(item.balance) > 0)
    .sort((left, right) => Number(right.rate) - Number(left.rate))[0];
  const asksAboutDebt = /\b(debt|card|credit|apr|pay ?off|interest|loan)\b/i.test(prompt);
  if (!asksAboutGrowth && !(worstDebt && asksAboutDebt)) return null;

  const currentAge = Number(age) > 0 ? Number(age) : null;
  const endAge = Number(retirementAge) > (currentAge || 0) ? Number(retirementAge) : 65;
  const usedExample = !(monthlyInvesting > 0);
  const monthly = usedExample ? 100 : Math.round(monthlyInvesting);
  const lines = [];

  const waiting = currentAge ? costOfWaiting({ monthly, startAge: currentAge, endAge }) : null;
  if (asksAboutGrowth && waiting) {
    lines.push(`${usedExample ? "For example, " : ""}${formatCurrency(waiting.monthly)}/mo started at ${waiting.startAge} grows to about ${formatCurrency(waiting.startNow)} by ${waiting.endAge}. Start at ${waiting.startAge + waiting.delayYears} instead and it's about ${formatCurrency(waiting.startLater)}: waiting ${waiting.delayYears} years costs ${formatCurrency(waiting.cost)}, and catching up would take about ${formatCurrency(waiting.catchUpMonthly)}/mo.`);
  }

  const doubling = yearsToDouble(PLANNING_RETURN * 100);
  if (asksAboutGrowth) {
    const doublings = currentAge ? Math.round(((endAge - currentAge) / doubling) * 10) / 10 : null;
    lines.push(`Rule of 72: at a ${Math.round(PLANNING_RETURN * 1000) / 10}% average return, invested money doubles about every ${doubling} years${doublings ? `, so a dollar invested today has roughly ${doublings} doublings before ${endAge}` : ""}. The earliest dollars do the most work.`);
  }

  if (worstDebt) {
    const rate = Number(worstDebt.rate);
    const monthlyInterest = Number(worstDebt.balance) * (rate / 100 / 12);
    lines.push(`Compounding works against you on debt too: your ${rate}% ${String(worstDebt.label || worstDebt.name || "balance").toLowerCase()} would double in about ${yearsToDouble(rate)} years if left unpaid, and it costs about ${formatCurrency(monthlyInterest)} in interest this month. Paying it down is a guaranteed ${rate}% return.`);
  }

  if (!lines.length) return null;
  return {
    lines,
    costOfWaiting: asksAboutGrowth ? waiting : null,
    usedExample,
    assumption: `${Math.round(PLANNING_RETURN * 1000) / 10}% average annual return, compounded monthly. Real markets vary; see the range of outcomes for the spread.`
  };
}
