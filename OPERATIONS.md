# PAM OPERATIONS MANUAL

The "make it work every time" file. Everything you (Max) need to run, change,
launch, and un-break PAM — with or without an expensive AI model. Skim the
table of contents, then use it like a cookbook.

1. Daily driving: how to make changes with Claude Code
2. The ship ritual (every change, every time)
3. Switches & env vars (turn things on/off without code)
4. Stripe go-live (the exact steps when you're ready to charge)
5. Launch-day checklist
6. The blueprints vault (how to use cheap models well)
7. Emergencies & common fixes
8. Where everything lives
9. Recurring maintenance

---

## 1. Daily driving: how to make changes with Claude Code

Open Claude Code **in the repo folder** (`New project/pam-ai`). Model choice:

| Task | Model |
|---|---|
| Copy tweaks, small UI fixes, run a blueprint | `/model claude-haiku-4-5` or Sonnet |
| Features, bug hunts, most real work | `/model claude-sonnet-5` |
| Gnarly logic, engine math, architecture | `/model claude-opus-4-8` |

Then just describe what you want. Two magic phrases that keep quality high:
- **"verify it in the preview"** — makes the model actually look at the screen
  (it can fake a logged-in user locally, see §7 dev-preview).
- **"follow OPERATIONS.md ship ritual when done"** — makes it test, version-bump,
  commit, and deploy properly.

## 2. The ship ritual (every change, every time)

Any model (or you) must do these after changing code, in order:

```bash
node --check src/main.js        # syntax
npm test                        # must show 29 passing (update this number if tests are added)
# bump the cache-buster IN BOTH FILES (same string!):
#   index.html  +  src/bootstrap.js  →  ?v=pam-ai-YYYYMMDD-<slug>
git add -A && git commit -m "what changed" && git push origin main
npx vercel --prod --yes         # deploy (aliases to pamadvisor.com)
curl -I https://pamadvisor.com  # expect HTTP/2 200
```

⚠️ The version string MUST match in `index.html` and `src/bootstrap.js` —
they've drifted before. Grep `pam-ai-2026` in both to confirm.

## 3. Switches & env vars (Vercel → Project → Settings → Environment Variables)

| Variable | What it does | Current |
|---|---|---|
| `PAM_REQUIRE_SUBSCRIPTION=true` | **Turns the paywall ON**: 3 free sample decisions, real-bank connect requires paying | off (beta) |
| `PAM_FOUNDING_CLAIMED=23` | Founding counter on the paywall (hidden below 15) | unset |
| `PAM_DISABLE_AI=true` | Kill switch: AI answers off (deterministic fallback still works) | off |
| `PAM_DISABLE_PLAID=true` / `PAM_DISABLE_EMAIL=true` | Kill switches for Plaid / email | off |
| `ANTHROPIC_MODEL` | Which Claude answers users (default `claude-sonnet-4-5`) | default |
| `PAM_AI_USER_DAILY_LIMIT` etc. | Per-user/IP daily cost caps | sane defaults |

After changing env vars: **redeploy** (`npx vercel --prod --yes`) to apply.

## 4. Stripe go-live (do these in order)

1. Stripe.com → create account **under the LLC** (see COLLABORATION.md isn't this — LLC steps were given separately: bizfileonline.sos.ca.gov $70 + EIN free + LLC-12 $20; $800/yr franchise tax).
2. In Stripe: create Product "PAM AI" with two prices → copy both price IDs.
3. Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_FOUNDING` ($7.99/mo), `STRIPE_PRICE_ID_MONTHLY` ($9.99/mo).
4. Stripe → Developers → Webhooks → add endpoint `https://pamadvisor.com/api/integrations/stripe-webhook`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → copy signing secret → env `STRIPE_WEBHOOK_SECRET`.
5. Redeploy. Test with Stripe test card `4242 4242 4242 4242` — checkout → return → dashboard should toast "Welcome to PAM."
6. When ready to enforce: set `PAM_REQUIRE_SUBSCRIPTION=true` + redeploy. The free tier (3 sample decisions) and gates activate automatically.
7. Tell Claude: "Stripe is live — build the paid AI deep-dive session" (Blueprint 2 territory).

## 5. Launch-day checklist

- [ ] LLC formed + EIN + business bank; Stripe under the LLC
- [ ] 1-hour securities-attorney review of the advice language (verdict-first + allocation philosophy) — do NOT skip
- [ ] Add LLC name to Terms (`src/main.js` → renderLegalPage → terms intro/contact)
- [ ] Stripe live (§4) + `PAM_REQUIRE_SUBSCRIPTION=true`
- [ ] Clerk: Dev → Production instance (branded `hello@pamadvisor.com`), swap `CLERK_*` keys
- [ ] Plaid production application (needs entity + security questionnaire; token encryption already built — ensure `PAM_PLAID_TOKEN_SECRET` env is set!)
- [ ] Vercel Firewall rule on `/api/*`
- [ ] Anthropic credits topped up ($50+ for launch traffic)
- [ ] Run the happy path yourself: fresh signup → onboarding → paywall → pay (test card) → connect → decision

## 6. The blueprints vault

`./blueprints/` holds build-ready specs a cheap model can execute alone.
To run one: switch to Sonnet/Haiku and paste:
> "Read blueprints/<file>.md in this repo and implement it exactly. Do not
> redesign anything. When done, run the checks in DEFINITION OF DONE and
> report each checkbox. Then follow the ship ritual in OPERATIONS.md."

Scan the builder's report for `ASSUMPTION:` tags before trusting it.
Blueprint 1 (paywall) is already built. To mint new blueprints for future
features, use an Opus/high-end session and copy the format of
`blueprints/01-stripe-paywall-enforcement.md`.

## 7. Emergencies & common fixes

**Site down / broken deploy** → roll back:
```bash
git log --oneline -5          # find last good commit
git revert HEAD --no-edit && git push && npx vercel --prod --yes
```
**AI bill spiking** → Vercel env `PAM_DISABLE_AI=true` + redeploy (app keeps working, deterministic answers only).
**Supabase paused** → it shouldn't (GitHub Action pings every 6h: repo → Actions → "Keep Supabase warm"); if paused anyway, open the Supabase dashboard and click Restore, then check that Action's logs.
**"My change isn't showing on the site"** → version string didn't bump or didn't match in both files (§2), or browser cache — hard refresh.
**Errors in prod** → Sentry dashboard (client + server both wired). "Zero errors" + zero traffic means nothing; check PostHog for traffic first.
**See the app as a logged-in user locally (no Clerk needed)** → run `node server.js`, open http://127.0.0.1:3000, in the browser console:
`localStorage.setItem("pam:dev-preview:v1","on"); location.reload();`
**Reset a test browser completely** → console: `localStorage.clear(); location.reload();`

## 8. Where everything lives

| Thing | Place |
|---|---|
| All UI + app logic | `src/main.js` (the big one) |
| Money math (source of truth) | `src/utils/scenarioEngine.js` |
| Onboarding questions | `src/config/appConfig.js` → `VALUES_ONBOARDING_STEPS` |
| Trust/legal commitment lines | `src/config/appConfig.js` → `TRUST_COMMITMENTS` (flip `verified:false` to pull a claim) |
| AI prompt & guardrails | `api/decision.js` |
| Auth/session/decision memory API | `api/account/session.js` |
| DB schema | `supabase/schema.sql` |
| Contributor guide (for your friend) | `COLLABORATION.md` |
| Full audit + launch readiness | `AUDIT.md` |
| Marketing email template (Clerk) | `email-templates/clerk-verification-code.html` |
| Dashboards | Vercel (deploys/env) · Supabase (data) · Clerk (auth) · Stripe (money) · PostHog (funnel) · Sentry (errors) · Plaid (bank) · Anthropic (AI usage) · Resend (email) |

## 9. Recurring maintenance

- **Weekly:** glance at PostHog funnel (signup_started → values_onboarding_completed → decision_analyzed → paywall_viewed) and Sentry.
- **Monthly:** Anthropic credit balance; Supabase keep-warm Action still green.
- **When adding an onboarding question:** just add it to `VALUES_ONBOARDING_STEPS` — existing users automatically get a "PAM has N new questions" card (top-up flow). No migrations, no re-onboarding.
- **When testers give feedback:** funnel numbers beat opinions — check where they actually drop before building.
