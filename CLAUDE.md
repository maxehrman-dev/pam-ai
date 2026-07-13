# PAM AI Claude Code Handoff

This file is the working context for Claude Code. Read it before editing. PAM AI is moving quickly, but the rule is simple: preserve what works, make the product feel calmer and more real, and do not rebuild the app from scratch.

## Product

PAM AI = Personal Asset Manager.

Live domain: https://pamadvisor.com

Core promise: PAM helps young adults test financial decisions before making them.

Primary homepage headline: "Know what happens before you decide."

PAM is not a budgeting tracker, bank app, generic chatbot, spreadsheet, or wealth-management product for rich households. It is a financial decision simulator for young adults before traditional advisors make sense.

The product should answer:

- What happens if I do this?
- Can I afford this decision?
- How does this change my monthly buffer?
- Does this delay a goal?
- What happens to taxes, runway, savings, debt, credit readiness, and compound growth?
- What should I consider next?

Tone should feel like a calm financial advisor: helpful, direct, specific, and not robotic. Avoid filler copy. If the user has already completed an action, do not keep showing that action as primary.

## Current Stack

This is a lightweight vanilla JavaScript app. Do not convert to React, Next, or a new framework unless the user explicitly asks.

Important files:

- `index.html` - app shell, metadata, fallback.
- `src/bootstrap.js` - boot loader and startup error handling.
- `src/main.js` - main client app, routing, rendering, onboarding, dashboard, decision flows.
- `src/styles.css` - full visual system and responsive layout.
- `src/utils/scenarioEngine.js` - richer deterministic scenario engine.
- `src/utils/personaEngine.js` - persona coefficients that personalize every engine.
- `BRAIN.md` - the deterministic-personalization strategy and engine backlog. Read it before adding decision logic.
- `server.js` - local Node server.
- `api/*.js` - Vercel API routes.
- `api/_lib/*.js` - shared backend helpers.
- `supabase/schema.sql` - database schema.
- `tests/*.test.mjs` - Node test suite.
- `vercel.json` - routes, headers, cron, function config.

Current package scripts:

```bash
npm test
node server.js
```

Run locally:

```bash
node server.js
open http://127.0.0.1:3000/
```

Do not open `index.html` with `file://`; modules, storage, and API calls may behave incorrectly.

## Current Repo / Deployment Status

Latest shipped commit when this handoff was written:

```text
5851b3b Refine dashboard ask layout
```

Recent important commits:

- `5851b3b Refine dashboard ask layout`
- `22a1cc0 Add cost protection rate limits`
- `004c6a3 Add decision memory and planning utilities`
- `47ca37b Clarify telemetry storage status`
- `2cc4005 Improve dark mode contrast`

Production was deployed with Vercel CLI and aliased to `https://pamadvisor.com`.

Git remote:

```text
origin git@github.com:maxehrman-dev/pam-ai.git
```

Always keep GitHub and Vercel in sync after meaningful changes unless the user explicitly says not to.

## Access / Launch Gate

There is a private-preview gate that can show:

```text
Oops, not time yet.
```

The user asked to remove it, then immediately said to bring it back. It is currently back and should remain unless the user asks again.

Demo tester fallback codes are handled by `api/account/session.js` and tests:

- `PAMDEVTEAM`
- `pam dev team`
- `pam demo`

Do not expose private app functionality to random visitors if the gate is supposed to be on.

## UX Direction

The app should feel like a real mobile/desktop financial product, not a long scroll website. Recent focus has been reducing scroll and making interactions obvious.

Recent dashboard direction:

- Desktop dashboard is now a 2-column layout, not 3 columns.
- Left column is financial context and should stay sticky.
- Right column is the action area: Ask PAM first, result inline, then supporting dashboard cards.
- Ask/result should not feel like separate hidden tabs.
- On mobile, Ask and Result are merged into one screen.
- Mobile bottom nav should stay simple: Home, Ask, Goals, Profile.
- Structured builder is collapsed by default and expands only when a decision mode is selected.
- Net worth chart should not appear when there are no connected accounts; fake chart data is misleading.

Avoid:

- Too many visible buttons.
- Buttons that do nothing.
- Showing "create account", "join waitlist", "verify", etc. after the user already did that action.
- Requiring users to re-onboard when signing back in.
- Random internal/prototype text such as "profile draft", "baseline source", or unnecessary explanations.
- Long disclaimers repeated inside every card.

## Dashboard / Decision Engine

Current decision flow:

- Freeform question input should work.
- Structured builder should pass precise values directly when possible.
- Scenario engine output should include specific numbers.
- Decision results should include:
  - Aha moment.
  - Interpreted assumptions.
  - Monthly buffer impact.
  - Projected savings.
  - Risk.
  - Tax impact if relevant.
  - Goal impact.
  - Compound growth impact if relevant.
  - Credit / loan readiness when relevant and credit score is available.
  - Offset plan or safer next step.
  - AI explanation grounded in deterministic numbers.

The deterministic engine must remain the source of truth for math. AI can interpret/explain, but it should not invent calculations.

Important functions to inspect before changing decision logic:

- `runDecisionAnalysis()`
- `buildScenarioSession()`
- `toLegacyDecisionFromSession()`
- `renderDecisionPanel()`
- `renderResult()`
- `renderScenarioEngineDetails()`
- `handleStructuredDecisionSubmit()`
- `src/utils/scenarioEngine.js`

Known important rule: If Anthropic quota is unavailable, the app should still return deterministic local guidance and not fail the whole decision flow.

## Plaid / Financial Data

Plaid is not the product. Plaid is how PAM can automatically understand a user's baseline.

Desired Plaid behavior:

- User may connect multiple institutions.
- Checking/savings balances inform cash and runway.
- Credit cards and liabilities inform debt obligations.
- Transactions inform recurring spending and income patterns.
- Investments can inform net worth / long-term goals if connected.
- If one institution does not include all financial life, users need to add multiple institutions.

Do not imply real production bank connection is live unless it is. Current language should remain careful around Sandbox.

Important endpoints:

- `POST /api/plaid/create_link_token`
- `POST /api/plaid/exchange_public_token`
- `GET /api/plaid/baseline`
- `GET /api/plaid/mock_baseline`

Important security rule:

- Never expose `PLAID_SECRET`.
- Never store Plaid `access_token` in browser/localStorage.
- Sandbox access tokens may be temporarily stored in Supabase `pam_plaid_items.access_token_reference`; production needs encryption.

Expected env vars:

```text
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions,balance,liabilities
PLAID_COUNTRY_CODES=US
```

## Supabase / Database

Supabase is used or prepared for:

- accounts
- sessions
- legal acceptance
- waitlist / demographics
- feedback
- telemetry
- Plaid items

Schema file:

```text
supabase/schema.sql
```

Helper script:

```bash
node scripts/apply-supabase-schema.mjs
```

Confirm schema exists before assuming storage works. If a Supabase table error occurs, do not hide it behind a random unrelated UI message.

The user wants waitlist signups saved with optional demographic info:

- email
- full name
- age
- stage
- goals / purpose / intentions
- created timestamp

If Google Sheets integration is added later, Supabase can remain the canonical database and Sheets can be a synced export. Do not replace reliable database storage with fragile spreadsheet-only storage.

## Auth / Accounts

The current app has custom prototype auth. The user's longer-term preference is Clerk/Auth0 instead of rolling custom auth, but do not switch architecture without a clear migration task.

Current account UX requirements:

- Homepage should have both Create account and Sign in.
- Sign-in should not feel like sign-up.
- Returning users should land back in their dashboard if account/session exists.
- Do not force users through onboarding again if their account is complete.
- If account already exists during signup, stop and offer sign-in.
- Password mismatch should immediately say passwords do not match.
- Verification code should tell the user quickly whether it is correct.
- Verification should not require a huge token/body field issue.

Password/security rules:

- Passwords must be hashed at rest.
- No passwords or sensitive tokens in logs.
- Sessions should expire.

## Resend / Email

Resend is used for:

- email verification codes
- waitlist welcome emails / newsletter-style updates

Current issue history:

- Resend test mode only sent to the account owner's email until domain verification/from-address setup was corrected.
- Official branded sender should be on `pamadvisor.com`, for example `hello@pamadvisor.com`.

If emails go to junk, improve deliverability:

- verified domain
- SPF/DKIM/DMARC
- consistent from address
- plain, non-spammy copy
- avoid too many links or salesy language

Do not leak API keys. Use env vars.

## Legal / Safety

PAM must be framed as a financial modeling tool, not a licensed financial advisor/RIA/tax/legal/investment service.

Required disclaimer language is present throughout:

```text
PAM AI is a financial modeling tool, not a licensed financial advisor, investment adviser, tax professional, attorney, or RIA. Nothing in PAM is financial, tax, legal, or investment advice. Consult a qualified professional before making financial decisions.
```

Legal pages:

- `/terms`
- `/privacy`
- `/content-policy`
- `/faq`

Important legal principles:

- No guarantees of financial outcomes.
- Educational estimates only.
- Do not provide tax evasion advice.
- Do not tell users to hide income or avoid reporting income.
- Users are responsible for decisions.
- PAM does not store raw bank credentials; Plaid handles bank login.
- Do not use financial data to train AI models.

Cookie consent exists. If analytics are declined, tracking should be disabled.

## Cost Protection / DDoS / Abuse

Important recent commit:

```text
22a1cc0 Add cost protection rate limits
```

Cost protection goals:

- Prevent one user/bot from burning Anthropic, Plaid, Resend, or other API costs.
- Public endpoints need IP-based and account/user-based rate limits.
- Expensive services should have kill switches.
- Graceful `429` and `503` responses.

Important files:

- `security/cost-protection.md`
- `api/_lib/rateLimit.js`
- `api/_lib/costProtection.js`
- API route usage checks.

Keep these protections intact when adding new endpoints.

## Mobile

Mobile has been a major pain point. The user strongly dislikes a giant desktop page disguised as an app.

Mobile target:

- Simple app-like screens.
- Bottom nav with clear sections.
- Less vertical scroll.
- Larger tap targets.
- Ask and Result together.
- No Result nav item.
- No excessive homepage nav/buttons before sign-in.
- Important information visible without hunting.

Current mobile direction:

- Home
- Ask
- Goals
- Profile

Do not add a fifth bottom-nav item unless there is a very good reason.

## Dark Mode

Dark mode previously had poor contrast and was improved. If editing theme styles:

- Test contrast.
- Avoid green-on-green mud.
- Keep cards legible.
- Make disabled states visibly disabled but readable.

## Tests

Run before shipping:

```bash
node --check src/main.js
npm test
git diff --check
```

Current expected test count:

```text
64 passing tests
```

Known harmless warning:

```text
[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of scenarioEngine.js is not specified...
```

Do not ignore failing tests.

## Deployment

Deploy with:

```bash
npx vercel --prod --yes
```

Recent successful deploy aliased to:

```text
https://pamadvisor.com
```

Verify after deploy:

```bash
curl -I https://pamadvisor.com
```

Expected:

```text
HTTP/2 200
server: Vercel
```

## Editing Rules

Do:

- Make small, targeted patches.
- Preserve the current vanilla JS architecture.
- Keep product copy concise.
- Make every visible button work.
- Use real baseline data when available.
- Show explicit loading/error states.
- Prefer deterministic calculations for finance.
- Keep GitHub + Vercel synced after meaningful changes.

Do not:

- Rebuild from scratch.
- Convert to React/Next without explicit instruction.
- Add dead buttons.
- Add fake financial charts that look real.
- Expose secrets in frontend code.
- Commit `.env`.
- Store raw bank credentials.
- Store Plaid access tokens in browser storage.
- Overwrite unrelated user changes.

## Current Open Product Priorities

These are the most valuable next improvements if the user asks "what next":

1. Finish real dashboard data binding from Plaid/Supabase so mock/fake values do not leak into the app.
2. Make sign-in/session return users directly to the right screen.
3. Improve Ask PAM so every result includes a clear next step and optional safer alternative.
4. Make mobile truly app-like with fewer cards and less scroll.
5. Harden Supabase activity / telemetry visibility so product actions show up reliably.
6. Add persistent user goals and make them affect every decision.
7. Improve resend/domain deliverability and waitlist demographic capture.
8. Add Stripe only when user is ready to spend/setup payment flow.

## Active Backlog From Latest User Feedback

These are the most recent concrete asks and should be treated as high-priority unless they are already fixed in code:

### Plaid / Supabase / Vercel Data Flow

- Persist Plaid Sandbox access tokens across Vercel serverless invocations by saving them server-side in Supabase `pam_plaid_items`, keyed by account.
- `api/plaid/baseline.js` should read the token from Supabase first and only use in-memory fallback for local dev.
- Dashboard numbers should come from the normalized baseline, not hardcoded demo values.
- Net worth should equal connected assets minus liabilities.
- Spending rows should come from connected transaction/category data.
- Account rows should come from connected accounts.
- If no accounts are connected, show empty/connect states instead of fake charts.
- After connecting Sandbox or loading Sandbox-style data, the dashboard should visibly update and feel obvious.
- Supabase activity should be triggered by real app actions so storage/telemetry is visible.

### Decision Engine / AI

- Replace shallow regex-only analysis with `src/utils/scenarioEngine.js` wherever possible.
- `runDecisionAnalysis()` should build a scenario session with profile + goals and render the rich output.
- Structured decision inputs should pass a draft object directly instead of building a sentence and re-parsing it.
- Results should show:
  - `ahaMoment`
  - `impactCards`
  - `goalsSummary`
  - `offsetPlan`
  - `reasoningTrace`
  - AI guidance grounded in the deterministic result.
- If Anthropic quota is missing or unavailable, use deterministic fallback and clearly avoid pretending the AI succeeded.
- Ask PAM must always have an actual visible input on the dashboard.
- Each decision result should include a useful next step or safer alternative.
- For loan/car/rent decisions, incorporate credit readiness when credit score or debt data is available. If credit score is missing, ask for or mark it as unknown rather than inventing it.

### Desktop Dashboard Layout

- Avoid the old 3-column dashboard. The preferred desktop structure is:
  - top KPI strip,
  - left sticky context panel,
  - right Ask PAM + inline result panel,
  - supporting spending/goals/accounts cards below or collapsed.
- Remove large empty spaces.
- The dashboard graph should either be meaningful from real connected account data or not shown.
- Timeframe buttons like `1M`, `3M`, `6M`, `1Y`, `All` must actually change the chart/summary or be removed.
- Avoid fake projection graphs that imply real history when the data is mocked.

### Mobile Experience

- Mobile should not be a giant scroll version of desktop.
- Use four main mobile sections: Home, Ask, Goals, Profile.
- Ask and Result should live on the same mobile screen.
- Remove duplicate or redundant CTAs.
- Keep tap targets large enough.
- Reduce visible buttons before sign-in.
- If a user is signed in and verified, do not keep asking them to create account or verify.
- Returning users should go straight to their dashboard/profile state, not through setup again.

### Account / Auth / UX Logic

- Homepage needs a clear Sign in option, not just Create account.
- If an account already exists, show "Would you like to sign in instead?" instead of a random error.
- If passwords do not match, say that immediately.
- Verification code should validate immediately and show success/failure clearly.
- Do not show internal labels such as "profile draft".
- Ask for either zip code or state, not city + state if not necessary.
- Buttons should only appear when they are relevant to the current state.
- Avoid "reset baseline" language unless it is renamed into something user-understandable like "Reconnect financial data" or "Clear connected data".

### Settings / Profile

- Profile should include practical product settings:
  - personal info,
  - security,
  - change password,
  - connected accounts,
  - display settings,
  - dark mode toggle,
  - sign out.
- Dark mode must have strong contrast and should not look muddy.
- Account refresh should be understandable. Plaid refresh should be automated on a sensible cadence where possible, and manual refresh should be labeled clearly.

### Waitlist / Email / Marketing

- Waitlist and newsletter are the same list and should be called waitlist.
- Waitlist form should collect optional demographics: full name, age, stage, intent/purpose.
- Signups should be saved to Supabase; Google Sheets can be added as an export/sync later.
- Resend should send from a verified `pamadvisor.com` address.
- Avoid displaying raw newsletter links on the homepage.
- Waitlist users should get a branded experience but should not access the private work-in-progress app unless they pass the demo gate.

### Cost / Security

- Keep API rate limits and cost protection on every public endpoint.
- Protect AI/Plaid/Resend endpoints from abuse so traffic spikes do not create surprise bills.
- Do not expose keys client-side.
- Do not commit env files.
- Keep legal disclaimers clear but not intrusive or repeated everywhere.

## If You Are Unsure

Ask less, inspect more. This repo already contains most of the intent. If you need to make an assumption, choose the path that keeps the app:

- safer,
- less cluttered,
- more deterministic,
- more mobile-friendly,
- and easier to pitch.
