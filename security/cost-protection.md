# PAM AI Cost Protection Runbook

PAM has two layers of protection:

1. Vercel's automatic platform DDoS protection, which absorbs network floods before they reach the app.
2. App-level limits, which protect expensive routes if traffic still reaches the API.

## Emergency Kill Switches

Set these Vercel environment variables to `true`, then redeploy or promote a redeploy:

- `PAM_DISABLE_AI=true` pauses `/api/decision` OpenAI guidance.
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

- Do not expose `OPENAI_API_KEY`, `PLAID_SECRET`, `RESEND_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` to frontend code.
- Plaid Sandbox access tokens are stored server-side only. Production Plaid tokens must be encrypted before storage.
- Watch Vercel Usage, Plaid Dashboard, OpenAI usage, Resend usage, and Supabase usage during ads or public posts.
- If traffic spikes unexpectedly, set `PAM_DISABLE_AI=true` first because AI has the highest variable cost.
