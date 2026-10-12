// The smart-money playbook: legal, specific moves savvy people in their 20s
// use, each matched to a person and a question by plain conditions. Facts are
// year-labeled and educational; update the numbers when the law changes.
// Copy rule: no em dashes.

const MAX_PLAYS = 3;

function has(text, pattern) {
  return pattern.test(text || "");
}

const PLAYS = [
  {
    id: "tips-deduction",
    title: "Tips are deductible through 2028",
    text: "If you earn tips, up to $25,000 of qualified tips a year can be deducted from federal income tax for 2025 through 2028. It phases out above $150,000 of income, and tips still owe Social Security and Medicare tax.",
    when: (ctx) => has(ctx.prompt, /\b(tips?|tipped|server|waiter|waitress|bartend\w*|barista|delivery driver|hairstylist|stylist)\b/i)
  },
  {
    id: "overtime-deduction",
    title: "Overtime pay is partly deductible",
    text: "For 2025 through 2028, the overtime premium (the extra half in time-and-a-half) is deductible up to $12,500 a year for single filers, phasing out above $150,000. Extra shifts keep more than they used to.",
    when: (ctx) => ctx.tags.has("Hourly pay") || has(ctx.prompt, /\b(overtime|extra shifts?|time and a half)\b/i)
  },
  {
    id: "car-interest-deduction",
    title: "New car loan interest can be deductible",
    text: "For 2025 through 2028, interest on a loan for a new, U.S.-assembled personal car (loan taken out after 2024) is deductible up to $10,000 a year, phasing out above $100,000 of income. Used cars and leases don't qualify.",
    when: (ctx) => ctx.type === "car" || has(ctx.prompt, /\b(car|truck|suv|vehicle|auto loan)\b/i)
  },
  {
    id: "vesting-before-switch",
    title: "Check vesting before you quit",
    text: "Unvested employer 401(k) match is forfeited when you leave. Look up your vesting schedule before picking a start date; waiting a few weeks can be worth thousands.",
    when: (ctx) => ctx.type === "jobLoss" || has(ctx.prompt, /\b(new job|job offer|switch jobs?|quit|leave my job|resign|relocat\w*)\b/i)
  },
  {
    id: "negotiate-offer",
    title: "First offers usually have room",
    text: "Asking once, politely, with a number backed by market pay data rarely costs you an offer, and a higher starting salary compounds through every future raise.",
    when: (ctx) => has(ctx.prompt, /\b(job offer|new job|salary|raise|negotiat\w*)\b/i)
  },
  {
    id: "roth-contributions-access",
    title: "A Roth IRA can double as a backup fund",
    text: "Roth IRA contributions (not earnings) can come back out anytime without tax or penalty. Money you're nervous about locking up can still start compounding.",
    when: (ctx) => has(ctx.prompt, /\b(invest\w*|roth|ira|retire\w*|emergency)\b/i) && (ctx.age === null || ctx.age < 35)
  },
  {
    id: "529-to-roth",
    title: "Leftover 529 money can become Roth money",
    text: "If a 529 has been open 15+ years, up to $35,000 over your lifetime can move into your own Roth IRA, within the yearly IRA limit ($7,500 in 2026). Money added in the last 5 years doesn't qualify, and it has to transfer directly between accounts.",
    when: (ctx) => has(ctx.prompt, /\b(529|college savings|leftover college|college fund)\b/i)
  },
  {
    id: "employer-loan-repayment",
    title: "Ask HR about student loan help",
    text: "Employers can pay up to $5,250 a year toward your student loans tax-free. Plenty offer it and few people ask.",
    when: (ctx) => ctx.hasStudentLoans || has(ctx.prompt, /\b(student loans?|loans? payoff|pay off my loans?)\b/i)
  },
  {
    id: "emergency-parking",
    title: "Park emergency money somewhere boring",
    text: "Keep your buffer in a high-yield savings account or short-term Treasury bills, not checking. Treasury interest is exempt from state income tax, which helps in high-tax states.",
    when: (ctx) => ctx.bufferShort || has(ctx.prompt, /\b(emergency|savings account|where should i (keep|put) (my )?(cash|savings))\b/i)
  },
  {
    id: "credit-utilization",
    title: "Lower your reported card balance before applying",
    text: "Scores weigh how much of your limit you use. Paying the card down before the statement closes keeps reported use low (under 30%, ideally under 10%). On a thin file, being an authorized user on a parent's old, on-time card can help.",
    when: (ctx) => ["car", "move", "rentIncrease"].includes(ctx.type) || has(ctx.prompt, /\b(credit score|apartment|lease|loan|mortgage|approved?)\b/i)
  },
  {
    id: "house-hack",
    title: "House hacking",
    text: "An FHA loan allows as little as 3.5% down on a 2 to 4 unit home you live in. Renting out the other units can cover much of the mortgage, but you become a landlord, so model vacancies and repairs.",
    when: (ctx) => has(ctx.prompt, /\b(buy a (house|home|place|condo)|first home|down payment|mortgage)\b/i)
  },
  {
    id: "espp-discount",
    title: "ESPP discounts",
    text: "Many employee stock purchase plans sell shares at up to a 15% discount. Selling right after purchase locks in most of it; holding is a separate investing decision with concentration risk.",
    when: (ctx) => has(ctx.prompt, /\b(espp|employee stock|company stock)\b/i)
  },
  {
    id: "hsa-receipts",
    title: "HSA receipts trick",
    text: "With an HSA, you can pay medical bills out of pocket, keep the receipts, and let the HSA stay invested. Years later, reimburse yourself tax-free for those old receipts.",
    when: (ctx) => has(ctx.prompt, /\b(hsa|health savings|medical bills?)\b/i)
  },
  {
    id: "stay-home-year",
    title: "One more year of low rent is a huge lever",
    text: "Living with family or a roommate for one more year is often the biggest savings move in your 20s. PAM can show the exact difference against your move-out goal.",
    when: (ctx) => ctx.type === "move" || has(ctx.prompt, /\b(move out|moving out|my own place|roommates?)\b/i)
  }
];

export function getPlaybook({ prompt = "", type = "", persona = {}, age = null, liabilities = [], liquidAssets = 0, bufferTarget = 0 } = {}) {
  const ctx = {
    prompt: String(prompt || ""),
    type: String(type || ""),
    tags: new Set(Array.isArray(persona.tags) ? persona.tags : []),
    age: Number(age) > 0 ? Number(age) : null,
    hasStudentLoans: (liabilities || []).some((item) => /student/i.test(`${item.label || ""} ${item.name || ""} ${item.type || ""}`)),
    bufferShort: bufferTarget > 0 && liquidAssets < bufferTarget
  };
  return PLAYS.filter((play) => play.when(ctx))
    .slice(0, MAX_PLAYS)
    .map(({ id, title, text }) => ({ id, title, text }));
}

export const PLAYBOOK_IDS = PLAYS.map((play) => play.id);
