# PAM AI Cost Protection Runbook

PAM has two layers of protection:

1. Vercel's automatic platform DDoS protection, which absorbs network floods before they reach the app.
2. App-level limits, which protect expensive routes if traffic still reaches the API.

## Emergency Kill Switches

Set these Vercel environment variables to `true`, then redeploy or promote a redeploy:

- `PAM_DISABLE_AI=true` pauses `/api/decision` Claude guidance.
- `PAM_DISABLE_PLAID=true` pauses Plaid Sandbox link, exchange, and baseline calls.
- `PAM_DISABLE_EMAIL=true` pauses outgoing verification and waitlist email sends while still allowing waitlist storage.

The deterministic decision engine and public marketing pages still work when AI or Plaid are paused.

## Built-In API Limits

These limits are enforced in `api/_lib/security.js` and are intentionally strict for preview/demo traffic.

| Route | Window limit | Daily cap |
| --- | --- | --- |
| `/api/decision` | 12/min/IP, 6/min/user | 80/day/IP, 30/day/user |
| `/api/plaid/create_link_token` | 10/10min/IP, 5/10min/user | 40/day/IP, 12/day/user |
| `/api/plaid/exchange_public_token` | 10/10min/IP, 5/10min/user | 40/day/IP, 12/day/user |
| `/api/plaid/baseline` | 18/5min/IP, 10/5min/user | 80/day/IP, 30/day/user |
| `/api/account/request-code` | 6/10min/IP, 3/10min/user | 20/day/IP, 6/day/user |
| `/api/waitlist` | 8/10min/IP, 3/hour/user | 25/day/IP, 5/day/user |
| `/api/telemetry` | 60/min/IP, 30/min/session | 500/day/IP, 250/day/session |

Daily caps can be overridden with:

- `PAM_AI_IP_DAILY_LIMIT`
- `PAM_AI_USER_DAILY_LIMIT`
- `PAM_PLAID_IP_DAILY_LIMIT`
- `PAM_PLAID_USER_DAILY_LIMIT`
- `PAM_EMAIL_IP_DAILY_LIMIT`
- `PAM_EMAIL_USER_DAILY_LIMIT`
- `PAM_TELEMETRY_IP_DAILY_LIMIT`
- `PAM_TELEMETRY_USER_DAILY_LIMIT`

## Shared Limits And Global Daily Caps

The limits above live in each serverless instance's memory, so under load (many
instances) they multiply and reset. `api/_lib/sharedLimits.js` adds counters in
Supabase (`public.pam_rate_limits` + `public.pam_hit_limit`) that every instance
shares. The global caps are the hard ceiling on what one day can cost.

| Route | Shared daily caps | Over the global cap |
| --- | --- | --- |
| `/api/decision` (AI) | 80/IP, 30/account, **500 total** | 503, users keep PAM's own math |
| `/api/plaid/create_link_token`, `exchange_public_token` | 40/IP, 12/account, **300 total** each | 503 |
| `/api/plaid/baseline` | 80/IP, 30/account, **1,000 total** | 503 |
| `/api/waitlist` emails | 1 email batch per address, **100 signups emailed total** | signup still saved, no email |

Override with `PAM_AI_GLOBAL_DAILY_LIMIT`, `PAM_AI_SHARED_IP_DAILY_LIMIT`,
`PAM_AI_SHARED_USER_DAILY_LIMIT`, the same `PAM_PLAID_*` names, and
`PAM_EMAIL_GLOBAL_DAILY_LIMIT`. Until `node scripts/apply-supabase-schema.mjs`
has run against production, the shared layer steps aside and the in-memory
limits keep working.

`/api/decision` also requires a signed-in Clerk session, so the AI can't be
called by anyone who just finds the URL.

## Vercel Firewall Settings To Enable

Currently published on Vercel:

- `Cost guard: API rate limit`: `/api/*` is limited to 100 requests per 60 seconds per IP, then denied.

If the Vercel plan supports additional rate-limit rules, add these too:

In Vercel Project -> Firewall:

- Turn on Bot Protection.
- Keep Attack Challenge Mode available for emergencies.
- Add a rate limit rule for `/api/decision`: 20 requests per minute per IP, action `Deny` or `Challenge`.
- Add a rate limit rule for `/api/plaid/*`: 20 requests per minute per IP, action `Deny`.
- Keep the general API rule for `/api/*`: 100 requests per minute per IP, action `Deny`.

Vercel's project-level firewall stops abuse before a Function invocation. The in-app limits are a second safety net and should not be treated as the only DDoS defense.

## Production Notes

- Do not expose `ANTHROPIC_API_KEY`, `PLAID_SECRET`, `RESEND_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` to frontend code.
- Plaid Sandbox access tokens are stored server-side only. Production Plaid tokens must be encrypted before storage.
- Watch Vercel Usage, Plaid Dashboard, Anthropic usage, Resend usage, and Supabase usage during ads or public posts.
- If traffic spikes unexpectedly, set `PAM_DISABLE_AI=true` first because AI has the highest variable cost.

## Pre-Launch Checklist (20 Items)

Status as of 2026-10-27. "You" = something only the account owner can do.

| # | Item | Status |
| --- | --- | --- |
| 1 | Rate limiting | Per-IP/per-account limits on every route, Vercel Firewall at the edge, shared Supabase counters across instances. |
| 2 | API limits | Daily per-IP, per-account and global caps on AI, Plaid and waitlist email. |
| 3 | Spending caps | Global daily caps in code. **You:** set a monthly spend limit in the Anthropic console and turn on Vercel Spend Management. |
| 4 | Error handling | Every route has an error boundary with safe messages; AI failures fall back to deterministic results. |
| 5 | Loading states | One loader per question; Plaid sync and sign-in have staged loading screens. |
| 6 | Empty states | Result, goals, net worth and accounts show empty states instead of fake data. |
| 7 | Failed requests | Browser requests time out with a clear "try again" message instead of a stuck spinner. |
| 8 | API timeouts | Anthropic 12s (20s deep-dive), Plaid 15s, Stripe 10s, Supabase 8s, analytics 5s; browser 6-25s. |
| 9 | Duplicate submissions | Submit handlers ignore repeats while busy; repeat waitlist signups don't re-send email. |
| 10 | Duplicate payments | Checkout refuses users with an active subscription and uses a Stripe idempotency key; the webhook is signature-checked and idempotent. |
| 11 | DB queries | Admin reads are bounded; status check is CDN-cached. |
| 12 | DB indexes | Indexes on every lookup column, including events by name + time. |
| 13 | Pagination | Only the admin stats read in bulk (30 days of events, capped). Revisit past ~20k events/month. |
| 14 | Compression | Vercel gzip/brotli on all responses. |
| 15 | Upload size | No file uploads; request bodies capped and schema-validated. |
| 16 | Caching | Status check cached 30s at the CDN; app files revalidate with ETags instead of re-downloading. |
| 17 | Uptime monitoring | `GET /api/health` (no DB). **You:** point a free monitor (UptimeRobot or Better Stack, 5-minute checks, email alerts) at `https://pamadvisor.com/api/health`. |
| 18 | Error logging | Sentry on client and server, flushed before functions freeze; swallowed AI/waitlist/checkout errors are reported. |
| 19 | Simultaneous users | Load-tested locally: 300 concurrent page loads, 200 status checks, 300 telemetry events, 150 AI asks from 150 IPs; no errors, global cap held exactly. |
| 20 | Backup + restore | Free Supabase has no automatic backups. `npm run backup` exports every table (secrets left out); `RESTORE_DATABASE_URL=... npm run restore-test backups/<stamp>` restores into a separate database and checks row counts (tested end to end). **You:** run a backup weekly, or move to Supabase Pro for daily backups. |
