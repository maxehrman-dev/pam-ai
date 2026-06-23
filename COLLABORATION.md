# PAM AI — Collaborator Guide

Welcome. This is everything you need to start contributing to PAM AI without breaking
anything. Read it once, top to bottom — it's the only doc you need to get productive.

---

## 1. What PAM is (60 seconds)

**PAM AI** (live at https://pamadvisor.com) is a **financial decision simulator and
life/career strategist for young adults**. You connect your real money (via Plaid), tell
PAM your goals (retire age, career ambition, mobility, risk backing), and it gives **bold,
direct, numbers-grounded advice** on real decisions: "can I afford this car?", "should I take
the job across the country?", "is law school worth it?".

The pitch in one line: generic AI gives mushy answers because it doesn't know your money or
your goals. PAM knows both, so PAM has an opinion.

**Two hard rules that define the product:**
1. **The deterministic engine is the source of truth for all math.** The AI explains and gives
   opinions; it never invents numbers. (`src/utils/scenarioEngine.js` does the math.)
2. **PAM is "educational modeling, not licensed financial advice."** That disclaimer is always
   present — it's what lets PAM speak directly. We never recommend specific stocks/tickers.

It is **not** a budgeting tracker, a bank app, or a generic chatbot. Don't make it feel like one.

---

## 2. The stack

Plain **vanilla JavaScript** front end (no React/Next — do not introduce a framework) +
**Vercel serverless** API routes. Everything is plain JS, HTML, CSS.

| Layer | Tech |
|---|---|
| Front end | Vanilla JS (`src/`), one big `main.js`, plus `styles.css` |
| Server / hosting | Vercel (serverless functions in `api/`) |
| Auth | Clerk |
| Database | Supabase (Postgres) |
| Bank data | Plaid (Sandbox for now) |
| AI | Anthropic Claude (`api/decision.js`) |
| Email | Resend |
| Analytics / errors | PostHog + Sentry |
| Payments | Stripe (built, currently turned OFF) |

**You do not need accounts for most of these to build.** See §4.

---

## 3. Run it locally in 10 minutes

```bash
# 1. clone
git clone git@github.com:maxehrman-dev/pam-ai.git
cd pam-ai

# 2. install (Node 18+)
npm install

# 3. create your local env file (see §4 — you can start with almost nothing)
cp .env.example .env.local   # then edit it

# 4. run
node server.js
# open http://127.0.0.1:3000  (NOT file:// — modules and storage will break)

# 5. run the tests
npm test     # should say 29 passing
```

> ⚠️ `.env.example` in the repo is currently out of date (it lists OpenAI — PAM uses
> **Anthropic**). Use §4 below as the real reference, and ask Max for a working `.env.local`.

### Getting past the private gate + into the dashboard locally
- The app has a **private-preview gate** ("Oops, not time yet."). Get in with a demo code:
  `PAMDEVTEAM` (or `pam demo`).
- To see the **signed-in dashboard without setting up Clerk/Plaid**, use the built-in
  **local preview mode**. In the browser console on `localhost`:
  ```js
  localStorage.setItem("pam:dev-preview:v1", "on");
  location.reload();
  ```
  This fakes a logged-in user with sample financial data so you can build and style every
  screen. It is **localhost-only and inert in production** — safe.

---

## 4. Environment variables (what you actually need)

Secrets live in **Vercel** (production) and in your local **`.env.local`** (never committed —
`.env.local` is gitignored, keep it that way). Here's the real list, grouped by how much you
need it:

### Tier 0 — Need NOTHING to build UI
Most front-end work (screens, styling, layout, copy, onboarding flow) needs **zero secrets**.
Run `node server.js`, use the demo code + dev-preview mode, and you're working with sample data.

### Tier 1 — Add ONE key to test the AI locally
```
ANTHROPIC_API_KEY=sk-ant-...     # makes /api/decision return real AI answers
ANTHROPIC_MODEL=claude-sonnet-4-5
```
Without this, the app still works — it falls back to deterministic guidance (no AI prose).

### Tier 2 — Only if you're working on that specific feature
| Feature you're touching | Env vars |
|---|---|
| Auth / login | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` |
| Database reads/writes | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Bank connection | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`, `PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES`, `PLAID_REDIRECT_URI`, `PAM_PLAID_TOKEN_SECRET` |
| Email | `RESEND_API_KEY`, `PAM_FROM_EMAIL`, `RESEND_AUDIENCE_ID` |
| Analytics | `POSTHOG_KEY`, `POSTHOG_HOST` |
| Error tracking | `SENTRY_DSN` |
| Payments (off) | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_FOUNDING`, `STRIPE_WEBHOOK_SECRET` |
| Misc | `DEMO_ACCESS_CODE`, `PAM_ADMIN_SECRET`, `SESSION_SECRET`, `PAM_SITE_URL` |

**Never** put any secret in front-end code, never commit a `.env*` file, never paste a key in chat.

---

## 5. Where everything lives (the map)

```
index.html                  app shell + metadata
src/
  bootstrap.js              boot loader; inits Clerk, Sentry, PostHog
  main.js          (BIG)    the entire front end: routing, every screen,
                            state, onboarding, dashboard, decision flow, handlers
  styles.css                the whole visual system (light + dark)
  config/appConfig.js       onboarding steps, constants, storage keys
  utils/
    scenarioEngine.js       THE MATH — deterministic decision engine (source of truth)
    baseline.mjs            Plaid data -> normalized baseline
    formatters.js           currency/number formatting
  data/mockData.js          sample/starter data
  services/plaidClient.js   front-end Plaid calls
api/
  decision.js               the AI endpoint (Anthropic)
  account/session.js        auth/session, legal acceptance, demo codes
  plaid/*.js                link token, exchange, baseline
  waitlist.js, telemetry.js, integrations/*  email, analytics, stripe
  _lib/*.js                 shared backend helpers (auth, db, http, security, observability)
supabase/schema.sql         database schema
tests/*.test.mjs            test suite (run with npm test)
vercel.json                 routes, headers, cron, function config
```

**The thing to understand:** `src/main.js` is ~6,000 lines and contains almost the entire
front end. Nearly every UI change touches it. (A refactor to split it is planned — ask Max.)

---

## 6. How we work together (the workflow)

You build features; Max + his Claude Code integrator review, test, wire to the services, and
deploy. You **never** have to touch Vercel, env vars, the database, or the deploy steps.

```
1. git checkout -b your-feature-name        # always work on a branch, never on main
2. ...make your changes (UI / styling / copy / a screen)...
3. node --check src/main.js && npm test      # make sure nothing's broken
4. git add -A && git commit -m "what you did"
5. git push origin your-feature-name
6. Tell Max: "branch your-feature-name is ready"
```

Max's Claude Code can then see your exact diff, confirm it works, fix any integration, and
deploy it. **Open a Pull Request** on GitHub if you can — it makes the review cleaner — but a
pushed branch is enough.

---

## 7. What's yours to change vs. leave alone

**Go ahead and change (UI / product surface):**
- `src/main.js` (screens, layout, copy, handlers), `src/styles.css`
- `src/config/appConfig.js` (onboarding questions, constants)
- `src/data/mockData.js`
- Anything visual or copy-related

**Leave to the integrator (plumbing / secrets / risk):**
- `api/_lib/*` (auth, database, security, error handling)
- `vercel.json`, `supabase/schema.sql`, anything env-related
- `src/utils/scenarioEngine.js` — the math engine. Touching it changes every answer PAM
  gives; coordinate before editing.

If you're not sure which bucket something is in, ask before changing it.

---

## 8. House rules (read these — they prevent the common mistakes)

- **Don't rebuild from scratch. Don't add React/Next/a framework.** Vanilla JS, small targeted patches.
- **Math comes from the deterministic engine, never from the AI.** If a number appears, it must
  trace to `scenarioEngine.js`. The AI explains; it doesn't calculate.
- **No dead buttons.** Every visible button must do something.
- **No fake charts.** Don't show a net-worth graph when there's no real connected data.
- **Mobile is app-like, not a long scroll.** Bottom nav is Home / Ask / Goals / Profile — don't add a 5th.
- **Dark mode uses CSS variables (tokens), never hardcoded light colors.** Use `var(--pam-surface)`,
  `var(--forest)`, etc. — never `background: #fff` or `rgba(255,255,255,...)`. Test both themes.
- **Keep the legal disclaimer present** but don't repeat it in every card.
- **Don't show "create account / verify / join waitlist" to someone who already did it.**
- **Secrets:** never in front-end code, never committed, never in logs.
- **CSS/JS changed?** There's a cache-buster version string in `index.html` + `src/bootstrap.js`
  (`?v=pam-ai-YYYYMMDD-x`). The integrator bumps it on deploy — you don't need to, just know
  that's why it exists (prod won't pick up changes otherwise).

---

## 9. Before you push — the 30-second checklist

```bash
node --check src/main.js     # no syntax errors
npm test                     # 29 passing
git diff --check             # no stray whitespace/conflict markers
```

If all three are clean, push your branch and hand it off. That's it — welcome aboard.
