# BLUEPRINT 1: Stripe paywall enforcement

BUILDER: Claude Sonnet, working alone, cold start, cannot ask questions. (Multi-file gating logic with an env-driven kill switch — needs care, not creativity. Sonnet fits.)

## GOAL
When the env flag `PAM_REQUIRE_SUBSCRIPTION` is on, non-paying users can complete onboarding and use sample data for up to 3 decisions, but connecting real bank accounts, running further decisions, and the paid deep-dive are gated behind the existing paywall screen. When the flag is off (today's beta state), nothing changes for anyone. Paying users (Stripe subscription `active` or `trialing`) never see a gate.

## CONTEXT THE BUILDER NEEDS (it has no memory of the planning chat)
- Files to read first:
  - `src/main.js` — the whole client app. Key existing pieces: `hasActiveSubscription()` (~line 311; returns `true` when `state.subscription` is null — "waived by default"), `startCheckout(plan)`, `renderPaywallScreen()` (the "unlock" workspace view, already built), `runDecisionAnalysis()`, `handleConnectSandboxAccount()`, `advanceValuesFlow()` (routes fresh onboarding to the `"unlock"` view), the `data-load-sandbox` / `data-checkout` handlers in `wireInteractions()`.
  - `api/integrations/status.js` — returns a `clientConfig` object consumed by `src/bootstrap.js` `loadConfig()`.
  - `src/bootstrap.js` — fetches `/api/integrations/status`, reads `data.clientConfig`, then dynamic-imports main.js.
  - `api/_lib/security.js` — has `envFlagEnabled(name)` at ~line 270 but does NOT export it.
- Real inputs:
  - Subscription state shape on the client: `state.subscription = { status, isFoundingMember, priceId } | null`. Set by `loadSubscription()` from `/api/account/session` GET. The Stripe webhook (`api/integrations/stripe-webhook.js`) already upserts subscriptions to Supabase keyed by Clerk user id.
  - Checkout flow already works end-to-end when Stripe env vars exist: `startCheckout("monthly")` → POST `/api/integrations/checkout` → redirect → return URL `?checkout=success` handler already calls `loadSubscription()`.
  - Paywall screen already exists as workspace view `"unlock"` with CTA `data-checkout="monthly"` and a skip button `.paywall-skip` (`data-load-sandbox`).
- Data shapes / examples:
  - "Paying" definition (use everywhere, one helper): `Boolean(state.subscription && ["active", "trialing"].includes(state.subscription.status))`.
  - Free decision counter example value in localStorage: `pam:free-decisions:v1` → `"2"` (string int).
- Gotchas:
  - Do NOT change `hasActiveSubscription()` semantics — other code (settings panel rendering ~line 5176) depends on its waived-by-default behavior. Add a NEW helper instead (see plan).
  - `envFlagEnabled` must be added to `module.exports` in `api/_lib/security.js`; do not redefine it elsewhere.
  - `state.workspaceView` whitelist already includes `"unlock"` in `saveWorkspaceView()`.
  - The asset-version cache-buster: after changing `src/main.js` or CSS, bump the `?v=pam-ai-...` string in BOTH `index.html` and `src/bootstrap.js` to a new value like `pam-ai-YYYYMMDD-paygate1` (grep the current one and sed-replace).

## CONSTRAINTS
- Must stay inside: `src/main.js`, `src/bootstrap.js`, `api/integrations/status.js`, `api/_lib/security.js`, `index.html` (version bump only).
- Must not change: the paywall screen's copy/design, `hasActiveSubscription()` behavior, the Stripe webhook, the checkout endpoint, any onboarding step, the demo-access logic.
- Stack: vanilla JS only, no new dependencies, match existing code style (no semicolon changes, template-literal HTML).
- Non-negotiables: when `PAM_REQUIRE_SUBSCRIPTION` is unset/false, behavior must be byte-for-byte identical to today for users. All 29 tests must stay green (`npm test`).

## STEP-BY-STEP PLAN (in build order)
1. `api/_lib/security.js` — add `envFlagEnabled` to the `module.exports` object (one line).
2. `api/integrations/status.js` — import `envFlagEnabled` from `../_lib/security.js`; inside the returned `clientConfig` object add: `requireSubscription: envFlagEnabled("PAM_REQUIRE_SUBSCRIPTION")`.
3. `src/bootstrap.js` — in the code path after `loadConfig()` resolves (where `config.sentryDsn` / `config.clerkPublishableKey` are used), add: `window.__pamRequireSubscription = Boolean(config.requireSubscription);` BEFORE the dynamic `import("./main.js?...")` line.
4. `src/main.js` — add two helpers next to `hasActiveSubscription()` (~line 311):
   ```js
   function isPayingSubscriber() {
     return Boolean(state.subscription && ["active", "trialing"].includes(state.subscription.status));
   }
   function subscriptionRequired() {
     return Boolean(window.__pamRequireSubscription) && !isPayingSubscriber();
   }
   ```
5. `src/main.js` — free-decision counter. Add near `loadQuestion()`:
   ```js
   const FREE_DECISION_LIMIT = 3;
   function getFreeDecisionCount() {
     try { return Number(window.localStorage.getItem("pam:free-decisions:v1") || 0); } catch (_e) { return 0; }
   }
   function bumpFreeDecisionCount() {
     try { window.localStorage.setItem("pam:free-decisions:v1", String(getFreeDecisionCount() + 1)); } catch (_e) {}
   }
   ```
6. `src/main.js` — gate decisions. At the very top of `runDecisionAnalysis(question, ...)` insert:
   ```js
   if (subscriptionRequired() && getFreeDecisionCount() >= FREE_DECISION_LIMIT) {
     saveWorkspaceView("unlock");
     setStatus("You've used your 3 free decisions. Unlock PAM to keep going.", "decision");
     render();
     return;
   }
   ```
   And immediately after the existing `recordDecisionHistory(state.result);` line add: `if (subscriptionRequired()) bumpFreeDecisionCount();`
7. `src/main.js` — gate real bank connect. At the top of `handleConnectSandboxAccount(options = {})`, after the existing `hasPrototypeAccount()` and legal checks, insert:
   ```js
   if (subscriptionRequired()) {
     saveWorkspaceView("unlock");
     setStatus("Connecting real accounts is part of the paid plan.", "account");
     render();
     return;
   }
   ```
   Do NOT gate `handleSandboxSampleData` (sample data stays free).
8. `src/main.js` — in `renderPaywallScreen()`, change the skip-button condition from `hasActiveSubscription()` to `!subscriptionRequired()` so the "try it with sample data first" link disappears entirely once enforcement is on AND the user isn't paying. Also, inside the same function, when `subscriptionRequired() && getFreeDecisionCount() >= FREE_DECISION_LIMIT`, show under the CTA: `<p class="values-detail">You've used your ${FREE_DECISION_LIMIT} free sample decisions.</p>`.
9. `src/main.js` — on successful checkout return: the existing `?checkout=success` handler already calls `loadSubscription()`; after it, add `saveWorkspaceView("dashboard"); showSuccessToast("Welcome to PAM. Everything's unlocked.");`.
10. Bump the asset version string in `index.html` + `src/bootstrap.js` (sed-replace the current `pam-ai-...` value with `pam-ai-<today>-paygate1`).
11. Run `node --check src/main.js && node --check src/bootstrap.js && node --check api/integrations/status.js && npm test`.

## EXACT INPUTS TO USE
- Files: listed above; no new files.
- Kickoff prompt for the builder: "Read blueprints/01-stripe-paywall-enforcement.md in this repo and implement it exactly. Do not redesign anything. When done, run the checks in DEFINITION OF DONE and report each checkbox."
- Copy to use verbatim: the two gate messages and the toast in steps 6–9.

## DEFINITION OF DONE
- [ ] `npm test` passes (29 tests).
- [ ] `node --check` passes on all touched JS files.
- [ ] With `PAM_REQUIRE_SUBSCRIPTION` unset: `subscriptionRequired()` is false; no gate can trigger (verify by reading the code paths — all gates are behind `subscriptionRequired()`).
- [ ] `curl` of `/api/integrations/status` response shape includes `clientConfig.requireSubscription` (boolean).
- [ ] The skip link logic: hidden when `subscriptionRequired()` is true; visible otherwise.
- [ ] Decision #4 for a gated free user routes to the `"unlock"` view instead of running.
- [ ] Real-connect attempt for a gated free user routes to `"unlock"`; sample-data load still works.
- [ ] Asset version bumped in both `index.html` and `src/bootstrap.js`, and they match.
- [ ] Nothing in CONSTRAINTS violated (no copy/design changes to the paywall, `hasActiveSubscription()` untouched).

## IF SOMETHING IS UNCLEAR
Make the smallest safe assumption, write `ASSUMPTION: ...` at the top of your final report, and keep going. Never stall, never expand scope.
