# PAM AI — Phase 0 Audit

_Read-only audit. No code was changed. Every claim cites a file and function. Items I could not verify by running the full Clerk/Plaid/Supabase stack locally are marked **Unverified** rather than asserted._

Date: 2026-06-09 · Auditor: Claude Code · Scope: full repo at commit after `ffe67d1`

---

## A. Executive verdict

**PAM has a genuinely good deterministic engine wrapped in a funnel that prevents almost everyone from ever seeing it.** The math in `src/utils/scenarioEngine.js` is real, traceable, and more sophisticated than most "AI finance" demos. The AI layer is correctly subordinate to that math. That is the hard part, and it mostly works.

But the analytics are unambiguous: 10 visitors → 1 account → 2 decisions (one user, likely you). The product is gated three times before a stranger can experience the one thing that makes it special. A visitor must (1) enter a demo code (`shouldShowPublicLaunchGate`, main.js:460), (2) create an account (`canAccessDashboard` requires `hasPrototypeAccount`, main.js:1347–1352), and (3) connect data + accept legal terms before a single simulation renders. **The aha moment is buried behind the signup wall it should be used to sell.**

Three things block Phase 1+ work and must be fixed first:
- **No server-side error capture** on any API route (Sentry is client-only) — you are flying blind on serverless failures, and "zero errors" in the dashboard is an artifact of missing instrumentation, not reliability.
- **Conditional IDOR / auth-bypass** on Plaid endpoints if Clerk env vars are ever absent (`baseline.js:31–36`).
- **The activation path itself** — not a bug, but the highest-impact problem in the product.

Verdict: **Strong prototype, not yet a trustworthy beta.** The path to beta is mostly subtraction and re-sequencing, not new features. Do not build anything from the deferred list until activation works.

---

## B. Genuinely working (code-evidenced)

| Area | Evidence | Assessment |
|---|---|---|
| Deterministic scenario engine | `evaluateScenario` (scenarioEngine.js:1373), `getProfileMetrics` (:193), `evaluateGoals` (:1186) | Real cash-flow, runway, goal-timeline and net-worth math. Compound interest via `futureValueRecurring`/`futureValueLump` (:42–52) is correct. **This is the asset.** |
| AI subordinate to math | `api/decision.js` `buildInput` (:198) sends engine output; system prompt says "never invent or change numbers, only interpret them" (:218) | Architecturally correct. The AI explains; the engine computes. |
| Values → AI wiring (just shipped) | `getConnectedSnapshot` (main.js:1831) + `buildInput` (decision.js) | Verified end-to-end in prod: AI answers cite the deterministic retire-age and career-velocity figures. |
| Credit readiness logic | `estimateCreditReadiness` (scenarioEngine.js:1278), `getCreditTier` (:1254) | Honestly handles missing score (returns "Not provided" rather than inventing one) — good. DTI thresholds (0.36/0.43/0.5) are industry-standard. |
| Input validation framework | `validatePayload`/`validateObject` (security.js:108–177) | Real schema validation with type/length/enum/pattern checks on every route inspected. |
| Password handling | `account-store.test.mjs` ("passwords hashed at rest"), 22/22 tests pass | Hashed at rest, not logged. |
| Rate limiting present | `checkRateLimit` (security.js:212), applied on decision/plaid/session routes | Present on every route — but see C-4 (in-memory weakness). |
| Demo code constant-time compare | `timingSafeEqualText` (session.js:71) | Correctly avoids timing leak. |
| Secrets hygiene | grep across `src/` | No `SECRET`/`sk_`/service-role keys in client bundle. Clean. |

---

## C. Critical findings

### C-1 — No server-side error tracking (Severity: HIGH)
**Evidence:** `grep -rln Sentry api/` → none. Sentry is initialized only client-side (`initSentry`, bootstrap.js:147). No `@sentry` import in any `api/*.js`.
**User impact:** Every serverless failure (Claude error, Plaid timeout, Supabase write failure) is invisible. The "zero issues" PostHog reading is **false confidence** — capture is incomplete, exactly as the work order suspected. You cannot run a trustworthy beta blind to backend errors.
**Fix:** Add Sentry (or a minimal structured logger) to a shared wrapper in `api/_lib/http.js` so every route reports caught exceptions. Verify by throwing a deliberate error in one route and confirming it lands.
**Verification:** Phase 1, step 3 of the work order.

### C-2 — Conditional IDOR / auth bypass on Plaid baseline (Severity: HIGH if Clerk env ever unset; otherwise Medium)
**Evidence:** `api/plaid/baseline.js:31–36`. Auth is enforced **only** `if (hasClerkConfig())`. When Clerk keys are absent, `accountId = query.accountId` (browser-supplied, :36) flows directly into `findLatestPlaidItemByAccountId(accountId)` (:71), returning another account's stored Plaid token reference and normalized financial baseline. Same conditional pattern in `exchange_public_token.js:48–52`.
**User impact:** If Clerk is ever misconfigured/rotated/disabled in prod, user A can read user B's financial data by changing an ID. Auth that silently degrades to no-auth is a latent breach.
**Fix:** Fail closed. If `!hasClerkConfig()` in production, return 503, not unauthenticated access. Never derive `accountId` from the query/body when it controls data ownership.
**Verification:** API test — unauthenticated request and cross-user `accountId` must both 401/403 (Phase 4).

### C-3 — Plaid access tokens stored in plaintext in Supabase (Severity: HIGH for Plaid production; acceptable for Sandbox only)
**Evidence:** `exchange_public_token.js:101–108` calls `upsertPlaidItem({ accessTokenReference: exchange.accessToken })` — the raw token. Schema `pam_plaid_items.access_token_reference` (schema.sql:67) is plain text. CLAUDE.md already flags this.
**User impact:** Sandbox tokens are low-risk, but this **blocks Plaid production access** — real tokens grant ongoing bank-data access and must be encrypted at rest.
**Fix:** Encrypt before storage (KMS/libsodium) or use a token vault. Gate Plaid-prod switch on this.
**Verification:** Confirm stored value is ciphertext; decrypt only in-memory at call time.

### C-4 — Rate limits & cost budgets are in-memory only (Severity: MEDIUM, cost risk)
**Evidence:** `GLOBAL_RATE_LIMIT_STORE` / `GLOBAL_USAGE_BUDGET_STORE` are module-level Maps (security.js). On Vercel each serverless instance has its own memory and cold-starts reset it.
**User impact:** `/api/decision` (Claude, your most expensive call) has **no auth** (no `verifyClerkToken` in decision.js) and relies entirely on this limiter. Distributed or cold-start traffic bypasses it → surprise Anthropic bill. At current traffic this is theoretical; before any public exposure it is real.
**Fix:** Back limits with Supabase or Vercel KV/Upstash (shared store), keyed by IP+account. Add a hard global daily kill-switch. Pair with the Vercel Firewall rule already on your launch list.
**Verification:** Hammer the endpoint across instances; confirm the shared counter holds.

### C-5 — No post-check that AI numbers exist in engine output (Severity: MEDIUM, trust risk)
**Evidence:** `requestGuidance`/`normalizeGuidance` (decision.js:181–325) returns the model's prose verbatim. The prompt *instructs* the model not to invent numbers (:218) but nothing *enforces* it.
**User impact:** A hallucinated figure in a financial answer directly violates your core promise ("if a number appears in an AI answer it must be traceable to engine output"). Low probability per-call, unbounded reputational cost.
**Fix:** Phase 1, step 2 — extract numbers from the AI body, compare against the engine result set, flag/strip mismatches. Pass engine output as structured JSON, not prose, to reduce drift.
**Verification:** Regression test asserting no AI-emitted number is absent from engine output (Phase 4).

### C-6 — `/api/account/register` appears to be a dead path (Severity: MEDIUM, correctness/confusion)
**Evidence:** `handleCreateAccount` (main.js:1933) POSTs to `/api/account/register`, but no such file exists (`api/account/` contains only `session.js`). Auth is now Clerk (bootstrap.js:65 `initClerk`, `window.__pamClerkConfigured`). 
**User impact:** Either the custom signup flow is dead code (Clerk handles signup) or it 404s. Hundreds of lines of `CREATE_ACCOUNT_STEPS` UI (appConfig.js:27) and verification handlers may be unreachable theater. This must be resolved before reworking onboarding (Phase 2) or you will polish dead screens.
**Fix:** Confirm in prod which path renders. Delete the unreachable one. **Founder question Q1.**
**Verification:** Trace a real signup in prod; one flow should remain.

### C-7 — Engine defaults can produce confident answers from near-zero input (Severity: MEDIUM, trust risk)
**Evidence:** Many `derive*` functions inject magic defaults: `deriveJobLossValues` defaults income loss to **−$7,200/mo** (:371); `deriveCarValues` assumes a **$20k** car (:350); `getCurrentRent` falls back to **$2,450** (:190). `buildScenarioAssumptions` does surface some ("you only said car, so PAM is using a temporary $20,000…", :833) — good — but not all defaults are disclosed with equal prominence, and confidence (`getConfidence`, :1327) only drops to a floor of 62.
**User impact:** A vague prompt + sample profile yields a specific, confident-looking result. That is "prototype theater" risk — the number looks earned when it was defaulted.
**Fix:** Surface every silent default in the visible assumptions block, and lower confidence harder when key inputs are absent. Make assumptions editable inline (already partpossible via `editableFields`, :1569).

---

### Real vs. theater (explicit split, per 0.2)
- **Real & trustworthy:** cash-flow delta, runway/run-out, goal-timeline shift, compound growth, credit DTI logic, risk banding.
- **Real but under-disclosed:** default-driven scenarios (C-7) — correct math on assumed inputs the user didn't give.
- **Theater / thin:** the new values engines (`simulateCareerVelocity` :1733, `simulateBuyVsRent` :1775, `simulateLocationArbitrage` :1811) use **hardcoded national constants** — 3% vs 15% raise cadence, 38% finance-city boost, 18% flat cost-of-living penalty, 4.5× home-price-to-income, 7% returns. These are reasonable for directional illustration but are **not personalized** and must be labeled as illustrative ranges, never presented as "your" number. They are good marketing/aha tools; they are not yet advice-grade.

---

## D. Top 10 improvements — ranked impact vs. effort

| # | Improvement | Impact | Effort | Why |
|---|---|---|---|---|
| 1 | **Demo decision before signup** — one real simulation on sample data, no gate, no account | ★★★★★ | M | This is the whole funnel. Show value, then ask for the account to save it. |
| 2 | Add server-side error capture (C-1) | ★★★★★ | S | You cannot trust any other metric until this exists. |
| 3 | Fix conditional IDOR / fail-closed auth (C-2) | ★★★★ | S | Latent breach; cheap to fix. |
| 4 | One example result above the fold on landing | ★★★★ | S | Sells the promise pre-click; supports #1. |
| 5 | Cut onboarding to 3–4 inputs (income, savings, one goal) | ★★★★ | M | Every extra field is a drop-off at 10 visitors. |
| 6 | AI number post-check (C-5) | ★★★ | M | Protects the core trust promise. |
| 7 | Resolve dead signup path (C-6) | ★★★ | S | Stop polishing unreachable UI. |
| 8 | Persistent "SAMPLE DATA" badge on dashboard when source isn't real (see 0.5) | ★★★ | S | Honesty requirement; currently only button copy says "sample". |
| 9 | Disclose all engine defaults + harder confidence drop (C-7) | ★★★ | M | Kills theater risk. |
| 10 | Shared-store rate limiting + global kill switch (C-4) | ★★ | M | Before any traffic, not after the bill. |

---

## E. Remove or postpone

**Remove / resolve now:**
- The dead signup flow (C-6) — delete whichever of custom-auth vs Clerk is unreachable.
- `scenarioClient.js` `resolveDecisionPrompt` (lines 79–115) appears to be a **second, unused decision path** — the live path is `runDecisionAnalysis`→`requestDecisionGuidance` (main.js:1847). Two code paths for the same job is a bug farm. Confirm and delete one.

**Postpone (per work order's deferred list — do not build pre-retention):**
- Streaks / daily-frequency mechanics, morning-briefing dashboard, Stripe paywall activation, referral engine (spec Feature 7), scenario types beyond the core 4–5, any social features.

**Soft-pedal until activation works:**
- The three values "simulators" are excellent _marketing_ surfaces but are illustrative, not personalized (D-theater). Use them to create the aha moment, not as standalone advice screens.

---

## F. Test plan — realistic financial scenarios

Engine unit tests (`tests/scenario-engine.test.mjs` exists — extend it). Known input → exact expected output:

1. **Job A vs B** (e.g. +$1,200/mo income, salaried) → assert `monthlyCashFlowImpact`, goal-timeline acceleration.
2. **Buy vs lease a car** ($20k, $4k down, $380/mo) → assert run-out months, credit readiness, residual handling (`deriveCarValues`).
3. **Save vs invest $500/mo** → assert 5-yr compound value via `futureValueRecurring` (cross-check by hand).
4. **Big purchase vs goal date** ($8k one-time) → assert `goalDelay` on the most-impacted goal.
5. **Edge cases:** $0 income (div-by-zero guards in `getProfileMetrics` savingsRate/leverage), negative cash flow (run-out finite), absurd input ($10M car), empty prompt (custom fallback, no crash).
6. **AI regression:** every number in `guidance.assistant.body` must appear in the engine result set.
7. **API/security:** unauthenticated + cross-user `accountId` on `/api/plaid/baseline` must fail; `/api/decision` rate limit returns 429.
8. **E2E happy path:** signup → demo → Plaid sandbox → decision → result renders.

---

## G. 30-day roadmap to a trustworthy private beta (~20 users)

**Week 1 — Trust & safety (Phase 1).** Fix C-1 (server error capture), C-2 (fail-closed auth), C-5 (AI number post-check), C-8 mock badge. Resolve C-6 dead path. One commit per fix + verification note. _Exit: backend errors visible, no auth-bypass, no unlabeled mock data._

**Week 2 — Activation (Phase 2).** Demo-decision-before-signup (#1). One above-the-fold example result (#4). Cut onboarding to 3–4 inputs (#5). Instrument the precise funnel: `landing_viewed → demo_started → demo_completed → signup_started → account_created → bank_connected → first_real_decision_analyzed`. _Exit: a stranger reaches a result in <2 min, every drop-off measurable._

**Week 3 — Core experience (Phase 3).** 5 mobile fixes at 390px. Collapse nav to Decide / Results / Goals / Profile. Disclose engine defaults (C-7). Real loading states ("calculating your 5-year cash flow…"). Returning-user "what changed". _Exit: mobile feels like an app, no dead spinners._

**Week 4 — Tests + hardening (Phase 4).** Engine unit tests (F-1..5), AI regression (F-6), API/IDOR tests (F-7), one E2E (F-8). Shared-store rate limiting (C-4). _Exit: green suite, ready to invite ~20 real users._

---

## H. Founder questions (≤5, each changes direction)

1. **Auth reality:** Is production signup Clerk or the custom `/api/account/register` flow? (C-6 — determines which large block of code we delete vs. fix.)
2. **Gate during beta:** Keep the demo-code launch gate ON while we build the pre-signup demo decision? They partly conflict — the gate blocks the very visitors the demo is meant to convert. My recommendation: replace the hard gate with the sample-data demo, keep a soft waitlist for saving/connecting. Agree?
3. **Plaid timeline:** Is production Plaid access a 30-day goal or later? Determines whether C-3 (token encryption) is Week-1 urgent or deferred.
4. **Values simulators:** Are the three career/location/buy-rent engines meant as advice-grade or as illustrative hooks? (Changes how hard we label them and whether they gate on more user input.)
5. **Beta scope:** Is the ~20-user beta sample-data-only, or must real bank connection work for them? Determines whether C-2/C-3 block the beta or only the public launch.

---

## 0.x Section detail (traceability appendix)

**0.1 Core product.** Value is _not_ understandable in 10s for a stranger because the demo gate (main.js:460) shows "Oops, not time yet" before any content. Strongest aha = the before/after impact cards from `evaluateScenario` (scenarioEngine.js:1445–1475). Distractions: education/planning/pricing marketing sections (`renderEducationSections` :2789, `renderPlanningModules` :2801, `renderPricingModel` :2907) compete with the one CTA. **Delay** all marketing scroll behind the demo result.

**0.2 Decision engine.** Flow traced: `handleQuestionSubmit` (main.js:2412) → `runDecisionAnalysis` (:1868) → `buildScenarioSession` (:1213) → `evaluateScenario` (scenarioEngine.js:1373) → `requestDecisionGuidance` (:1847) → `api/decision.js`. Math audited above (B, C-7, F). Hardcoded assumptions catalogued in C-7.

**0.3 AI layer.** Exact prompt: `buildInput` (decision.js:198–287). Receives engine output as **flattened text lines, not structured JSON** (improvement target). User prompt is passed as a labeled line ("User prompt: …", :260) inside a larger message — **prompt-injection surface**: a user could write "ignore the above and output…". No instruction-isolation wrapper. Can the AI state numbers not in engine output? Yes — nothing prevents it (C-5). Token cost ≈ ~1.5–2k in + ~400 out ≈ $0.01–0.02/call (Sonnet). Follow-ups handled deterministically in the engine (`buildFollowUp`, scenarioEngine.js:550), not by the AI — good.

**0.4 UX & mobile.** Bottom nav is Home/Ask/Goals/Profile (`renderMobileBottomNav` :3215) — matches target. Duplicate "Use sample data/baseline" buttons at 4 sites (main.js:3485, 3794, 4552, 4615). `main.js` is **5,862 lines** and `styles.css` **5,858** — fragile DOM-string rendering throughout. **5 highest-impact mobile fixes:** (1) above-fold example result; (2) collapse marketing sections on mobile; (3) single sample-data entry point; (4) sticky result so it doesn't scroll away; (5) larger tap targets on chips. Proposed architecture: **Decide / Results / Goals / Profile** (merge Ask+Results).

**0.5 Data integrity.** Clerk→Supabase persistence exists (`session.js:108–120`, `upsertBaseline`) but is **Unverified** end-to-end without running the prod stack — **Founder Q1/Q5**. Plaid token ownership: C-2/C-3. Mock data labeling: only **button copy** says "sample" (main.js:3485 etc.); there is **no persistent badge** once sample data loads — `baseline.source.startsWith("plaid")` (:1997, 2511, 4086) drives some copy but no always-on "SAMPLE" indicator. **Browser-only state that should be server-side:** `pam:life-values`, `pam:user-values` (main.js:182/210), `pam:goals`, `pam:decision-history`, `pam:saved-scenarios`, `pam:demo-access` (localStorage). Goals and values especially should persist server-side so returning users don't lose them.

**0.6 Security.** Ranked: **HIGH** C-1, C-2, C-3. **MEDIUM** C-4, C-5, prompt-injection surface (0.3). **LOW:** demo-code fallback hardcoded in source (`getAllowedDemoCodes`, session.js:88) — acceptable as documented founder fallback but should move fully to env before public launch. No secrets in client (verified). Input validation present on all routes inspected.

**0.7 Reliability.** Oversized files (main.js 5.8k lines). Duplicated decision path (scenarioClient.js vs requestDecisionGuidance — E). `requestDecisionGuidance` (main.js:1847) has **no client timeout** (unlike the unused scenarioClient path which aborts at 4500ms) — a slow Claude call hangs the result UI. Tests: 22 passing but **none cover the scenario engine math directly** (`scenario-engine.test.mjs` exists — confirm depth) or IDOR. DOM-string rendering is XSS-prone; `escapeHtml` is used in places (e.g. life-value chips main.js:4191) — confirm it wraps **all** user-derived interpolation.

**0.8 Launch readiness table.**

| System | Status | Evidence |
|---|---|---|
| Auth (Clerk) | Partially working | bootstrap.js:65; Dev instance per memory; C-6 dead custom path |
| Deterministic engine | Production-ready | scenarioEngine.js (with C-7 disclosure fix) |
| AI explanations | Prototype-ready | decision.js; needs C-5 + injection wrap |
| Plaid | Mocked / Sandbox | baseline.js, exchange_public_token.js; C-2, C-3 |
| Supabase | Partially working / Unverified | session.js persistence; needs end-to-end check |
| Stripe | Mocked (gate off) | `PAM_REQUIRE_SUBSCRIPTION` waived per memory |
| Resend | Unverified | not exercised in this audit |
| PostHog | Working (client) | telemetry.js, bootstrap.js |
| Sentry | Broken (client-only) | C-1 |
| Landing | Prototype-ready | gated; needs Phase 2 |
| Dashboard | Prototype-ready | renders on sample/connected data |

**Before (a) private beta ~20:** C-1, C-2, C-5, mock badge, demo-before-signup, funnel instrumentation. **Before (b) paid public launch:** C-3, C-4, Vercel Firewall, Stripe gate flip, prompt-injection wrap, engine tests, dead-code removal. **Before (c) Plaid production:** C-3 (encryption), C-2 fail-closed, multi-institution verification, token refresh cadence.

---

_End of Phase 0. Awaiting founder approval (and answers to Section H) before any Phase 1 code changes._
