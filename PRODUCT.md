# PAM SI: Product

**Know what happens before you decide.**

PAM (Personal Asset Manager) helps young adults test money decisions before they make them. Ask about a lease, a car, a job offer in a new city, paying off loans, or investing, and PAM shows what it does to your monthly buffer, your goals, and your next 20 years, using your real numbers.

This file is the plain-language product doc. Build rules and stack details live in `CLAUDE.md`. Engine strategy lives in `BRAIN.md`.

## Who it's for

Young adults early in their careers, before a traditional financial advisor makes sense. People making their first big money calls: the first lease, the first real paycheck, the first 401(k), the first loan.

## How PAM talks

Calm, direct, and on your side. PAM gives a straight call (worth it, not yet, or don't) and always pairs a hard truth with a path forward. Blunt, never harsh. No filler, no hedging, no generic advice.

## What PAM does today

- **Decision engine.** Any money move, modeled against your buffer, runway, goals, and risk, with a safer version when the answer is no.
- **Range of outcomes.** Investing questions run through 1,000 simulated markets: a rough, typical, and strong outcome, plus the odds of hitting each goal on time.
- **Tax analytics.** The same dollars compared across a taxable account, Roth IRA, Roth 401(k), Traditional 401(k), and HSA, with taxes paid now, during growth, and at withdrawal.
- **Planning tools.** Paycheck split, debt payoff plan, affordability ceilings, goal timelines, early retirement bridge, rent vs buy, job offer and relocation math.
- **Your real numbers.** Connect accounts through Plaid (read only) or type numbers in.

Every number comes from deterministic code. The AI explains the math; it never invents it.

## North Star

**PAM becomes the Trump Account for young adults.**

Trump Accounts are new government-backed investment accounts for kids, created by the One Big Beautiful Bill Act. They give children a head start on long-term investing. But the special kid-account rules end as the child approaches 18, and nothing helps them with what comes next.

PAM owns what comes next, for ages 18 to 25. Two jobs:

1. **If you have a Trump Account:** help you decide what to do with it. Leave it invested, use it for school, put it toward a first home, convert it, or take it out, with the taxes, penalties, and long-term cost of each choice shown in plain numbers.
2. **If you don't:** help you start building long-term wealth early, with the same compounding math, so a late start doesn't have to mean a small one.

**Honest timing.** Kids eligible for the $1,000 federal seed were born 2025 through 2028, so the first of them reach 18 in 2043. Most of today's 18 to 25 year olds have no Trump Account at all, and teens who open one now will only have a few years of contributions. So in the near term, job 2 is the product, and job 1 grows into the main event over the next two decades.

**How we talk about it.** "Trump Account" names the government program. PAM's own brand stays PAM.

### Trump Account rules PAM relies on

Source: IRS Notice 2025-68 (December 2, 2025). These are the rules as of that notice. Recheck them before building anything that depends on them.

- **Who can have one.** A child under 18 at the end of the year the account is opened, with a Social Security number.
- **The $1,000 seed.** A one-time $1,000 from the Treasury for a U.S. citizen child born 2025 through 2028 with a Social Security number. Someone has to elect it; it is not automatic.
- **Contributions.** Up to $5,000 a year combined from family and employers in 2026 and 2027, adjusted for inflation after 2027. Employers can add up to $2,500 per employee, and that counts toward the $5,000. The $1,000 seed, government or charitable contributions, and rollovers do not count toward the cap. Nothing can be contributed before July 4, 2026.
- **Investments.** Until the kid-account rules end, money can only go into mutual funds or ETFs that track an index of mostly U.S. companies, use no leverage, and charge no more than 0.1% a year.
- **When the kid-account rules end.** On December 31 of the year before the account holder turns 18. Example from the notice: a child born October 1, 2025 is covered through December 31, 2042. Some account holders are still 17 when this happens.
- **After that.** The account stays a Trump Account but generally follows traditional IRA rules. Withdrawals are taxed as income and can carry a 10% early withdrawal penalty unless an exception applies, such as qualified higher education costs, a first home purchase, or reaching age 59 1/2. Roth conversions follow the normal IRA rules.
- **What gets taxed on the way out.** The $1,000 seed, employer money, and government or charitable contributions create no tax basis, so they are taxed when withdrawn. Family contributions do create basis.

### Still unclear (flag, don't guess)

- Final regulations. The notice says proposed regulations were coming; confirm whether they have been issued and whether anything changed.
- First home withdrawals. The notice names the first home exception but not a dollar limit. General IRA law caps it at $10,000 over a lifetime; confirm that applies here.
- State taxes. How each state treats Trump Account contributions and withdrawals.
- Account data. Whether trustees expose Trump Account balances through Plaid or similar, or whether users would enter them by hand.
- Age. PAM's Terms require users to be 18 or older, but the kid-account rules can end while the account holder is 17.

## What PAM is not (yet)

- **PAM does not hold or move money.** It models decisions; it never touches a dollar. Real accounts would come later, and only through a regulated brokerage partner, as a separate project with its own legal review.
- **PAM is not a licensed advisor.** PAM SI is a financial modeling tool, not a licensed financial advisor, investment adviser, tax professional, attorney, or RIA. Nothing in PAM is financial, tax, legal, or investment advice.
- **PAM does not pick investments.** No specific funds, stocks, or tickers. Guidance about what to do with a Trump Account must stay educational and show the math, with clear disclaimers wherever it gets close to personalized investment advice.
