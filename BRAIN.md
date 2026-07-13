# BRAIN.md — PAM's Deterministic Personalization Blueprint

This is the build plan for making PAM's *code* smarter per-user, so the AI narrates
instead of computes. Written as a handoff: any session (Opus or otherwise) should be
able to pick a backlog item below and implement it without re-deriving strategy.

## Why this layer exists (the cost + trust math)

- Every number the deterministic engine computes is a number the AI cannot
  hallucinate, does not burn output tokens reasoning about, and survives the
  integrity post-check in `api/decision.js` (`findUntraceableDollars`).
- Deterministic output costs $0 per run and works when Anthropic quota is gone.
- The AI's only jobs: interpret the freeform ask, choose what to compute, and
  phrase the result in PAM's voice. If the AI is "making up for" missing logic,
  we're paying per-token for math we could ship once.
- This is NOT machine learning. There is no training data and we don't want the
  liability of a learned model giving financial guidance. It is deterministic,
  auditable rules — which is also the legal posture (educational modeling).

## The architecture law: composition over enumeration

There are thousands of user combinations (worker type x pay cadence x household x
housing x risk backing x career stage x goals x debt mix x ...). Do NOT write a
branch per combination. Coverage comes from **coefficients that compose**:

1. Each user dimension contributes small, named adjustments (a "modifier").
2. `src/utils/personaEngine.js` folds all modifiers into one coefficient object.
3. Every engine consumes coefficients — never raw `userValues` — so a new
   dimension added in one place personalizes every engine at once.
4. Every adjustment carries a human-readable `note` ("Irregular pay: planning
   with 85% of detected income") that flows into result assumptions AND the AI
   prompt, so the user and the model both see why the numbers moved.

Rules every engine must obey (same as the rest of the repo):

- Engine owns all numbers. AI never invents or changes them.
- Every output includes named, editable assumptions and a reasoning trace.
- Buckets/allocations must sum exactly (see the paycheck-split invariant tests).
- Degrade honestly: when the math can't work (essentials > income), say so —
  never invent room.
- Each engine ships with tests across the persona fixtures (Layer 3 below).

## Layer 1 — Persona coefficients (STATUS: SHIPPED)

`src/utils/personaEngine.js` — `getPersonaCoefficients(userValues, facts)`.
Attached to the scenario profile as `profile.persona` in
`getScenarioProfileFromBaseline()` (main.js), consumed by the paycheck split.

Current coefficient table (extend here, in data, not in engine branches):

| Dimension (userValues)        | Effect                                                        |
|-------------------------------|---------------------------------------------------------------|
| `worker_type: freelance`      | buffer +2 months; tax set-aside = max(combined rate, 25%)     |
| `worker_type: hourly`         | buffer +1 month                                               |
| `pay_frequency: irregular`    | buffer +1 month; plan with 85% of income (15% volatility cushion stays in checking) |
| `household: support_family`   | buffer +1 month; guilt-free floor 8%                          |
| `risk_backing: none`          | buffer +1 month                                               |
| `risk_backing: dependents`    | buffer +2 months; guilt-free floor 8%                         |
| `risk_backing: family`        | buffer −1 month (bail-out backstop exists)                    |
| `housing: own`                | buffer +1 month (repairs are on them)                         |
| `career_stage: between`       | buffer +1 month (income uncertainty)                          |

Buffer clamped to [2, 9] months. Base: 3 months buffer, 10% guilt-free, 0% tax
set-aside, 1.0 income reliability. Coefficients: `bufferTargetMonths`,
`guiltFreeFloorPct`, `taxSetAsidePct`, `incomeReliability`, `tags[]`, `notes[]`.

## Layer 2 — Engine backlog (build in this order)

### P1-a. Persona-aware verdict thresholds (STATUS: SHIPPED)
Today `scenarioEngine.js` hardcodes safety lines (e.g. buffer `< 600`/`< 300` in
`buildRecommendedNextStep` / credit readiness; runway `< 5`/`< 7` in risk labels).
Replace with persona floors: a parent supporting family should get "Not yet"
where a single renter with a family backstop gets "Worth it" **on the same
numbers**. That asymmetry is the product. Suggested floor:
`riskFloorMonthly = max(300, essentialBurn * bufferTargetMonths / 24)` and
runway floors scaled by `bufferTargetMonths / 3`.

### P1-b. Self-employed money physics everywhere
The split now carries a tax set-aside bucket for freelancers. Extend the same
concept to income scenarios: a `+$1,500/mo freelance` income delta should surface
net-after-set-aside (`delta * (1 - taxSetAsidePct/100)`) in buffer math, with the
gross-to-net shown in assumptions. W-2 deltas stay as-is (withheld at source).
Educational-estimate framing, never tax advice.

### P1-c. Irregular income in the baseline itself
The split plans with `incomeReliability`. Go deeper: when detecting income from
transactions (Plaid baseline normalization), irregular earners should get the
**trailing median month**, not the average — one great month shouldn't inflate
every decision. Persist both (`detectedMonthlyIncome`, `medianMonthlyIncome`)
and let persona pick.

### P2-a. Debt payoff planner engine (STATUS: SHIPPED — src/utils/financeKnowledge.js)
Input: liabilities (balance, rate, minimum). Output per strategy:
- **Avalanche** (rate desc) vs **snowball** (balance asc): payoff date per debt,
  total interest paid, interest saved vs minimums-only.
- Months to clear debt with payment p: `n = -log(1 - r*B/p) / log(1+r)` where
  `r` = monthly rate, `B` = balance (fall back to `B/p` when `r = 0`).
- Deterministic recommendation: avalanche by default; snowball when >= 3 debts
  and the smallest is < $1,000 (motivation rule — name it in assumptions).
Feeds: "should I pay off debt or invest" (compare top APR vs `INVEST_RETURN`),
the paycheck-split debt bucket, and a payoff-date line in every debt answer.

### P2-b. Affordability ceiling engine (STATUS: SHIPPED — src/utils/financeKnowledge.js)
"Can I afford X?" answers get a deterministic ceiling, persona-adjusted:
- Rent ceiling: 30% of gross (28% with dependents; 33% if no debt + strong buffer).
- Car all-in (payment + insurance + fuel): 15% of take-home (10% when DTI > 36%).
- Home price: 3.5–4.5x gross annual income, tightened by rate assumptions.
Output: the ceiling, where the asked amount sits vs it, and the gap. The AI's
"your buffer supports it / that's past your line" gets an exact, traceable
number. (Keep the AI rule that it never invents a precise limit — now it won't
need to.)

### P2-c. Milestone timeline engine ("when can I…")
Generic: `monthsTo(target, current, monthlyPace, annualReturn)` — this already
exists as `calculateMonthsToGoal`; promote it to answer direct "when can I move
out / buy / have 6 months saved" asks with a date, not just a goal delta.
Move-out target = deposit + first/last month + moving cost + persona buffer
months of the NEW rent.

### P2-d. Retirement bridge math
`retirement_target_age < 59.5` → compute bridge years and a taxable-bridge share
table: target < 50 → 60% taxable / 40% tax-advantaged; 50–55 → 50/50; 55+ →
40/60. Deterministic numbers for the "Roth vs bridge" conversations the AI
already has in prose. Allocation philosophy only — never named funds/securities.

### P3-a. Benchmark tables (STATUS: PARTIAL — age-band heuristics shipped in financeKnowledge.js)
Savings-rate and buffer norms by age band and income band as static tables
("typical range for your bracket" — cite as heuristic, not peer data). Powers
"am I doing okay?" with numbers instead of vibes.

### P3-b. Tax sharpening (STATUS: PARTIAL — retirement-account facts shipped in financeKnowledge.js; state tables remain)
State-level effective-rate table (partially present via `combinedTaxRate`) plus
self-employment tax awareness (15.3% below the SS wage base) for freelancers.
Estimates only, always verify-with-a-professional framing.

### P3-c. Decision-memory pattern counters
Deterministic counters over `recentDecisions`: nth discretionary stretch this
month, cumulative buffer erosion across recent asks, repeated same-category
asks. Emit as lines in the AI payload ("3rd stretch purchase in 30 days,
cumulative buffer cost $410/mo") — the AI already has the memory voice; give it
deterministic receipts.

## Layer 3 — Persona fixtures: how "every user" becomes enforceable

Create `tests/fixtures/personas.mjs` with named, fully-specified users. Every new
engine must ship at least one assertion per fixture. This is the honest version
of "think of every different user": a fixture matrix the test suite runs forever.

| Fixture | Sketch                                                                | What must differ for them |
|---------|-----------------------------------------------------------------------|---------------------------|
| JADE    | 24, hourly barista, irregular pay, lives with family, backing: family | volatility cushion; smaller buffer (family backstop); move-out milestone math |
| MARCUS  | 29, freelance designer, supports mom, no backstop                     | tax set-aside bucket; buffer 6+; guilt-free 8%; "not yet" verdicts earlier |
| PRIYA   | 31, salaried tech, retire at 45, no debt                              | bridge-share math; aggressive invest slice; higher rent ceiling |
| DEV     | 26, salaried, 3 debts incl. 24% card, small balances                  | snowball recommendation; debt bucket dominates split |
| SAM     | 35, single income, partner + 2 kids                                   | buffer 5+; 28% rent ceiling; conservative verdicts |
| ROSA    | 27, nurse, wants a house in 24 months                                 | milestone engine; down-payment goal shapes split |
| KEN     | 30, between jobs, modest cushion                                      | runway-first framing; investing deferred |
| ALEX    | 22, student, part-time, tiny income                                   | essentials-exceed-income honesty path |
| NIA     | 33, 1099 high earner, wants out at 50, relocatable                    | tax set-aside + bridge + location arbitrage interplay |
| OWEN    | 28, homeowner, others depend on his income                            | housing +1 buffer; dependents floor; low guilt-free |

Fixtures are also the demo/pitch artifact: "here's the same question answered
for 10 different people" is the tailoring story, shown deterministically.

## What NOT to build

- Real ML / model training — no data, no benefit, pure liability.
- More prompt tokens as a substitute for code — that's the expensive direction.
- A rules-engine framework or DSL — plain functions + data tables, like now.
- Money movement of any kind (see paycheck split guardrail — permanent).
- A rewrite. All of this lands inside `scenarioEngine.js` / small `src/utils/*`
  modules with tests, exactly as `personaEngine.js` did.

## How each engine reaches the AI

Pattern already proven twice (values insights, paycheck split): serialize the
deterministic result as one labeled line in `buildInput()` (`api/decision.js`),
marked "deterministic — use these, do not recompute". Numbers in that line are
automatically covered by the integrity allowlist. Persona `notes` should ride
along the same way so the AI can say *why* this user's thresholds differ.
