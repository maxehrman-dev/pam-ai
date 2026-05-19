# PAM AI

PAM AI is a premium financial decision simulator built around one core promise: test your financial future before you live it.

## Product focus

PAM AI is not a budgeting tracker or an expense categorizer. It is a scenario engine that helps users structure money decisions, model tradeoffs, and see how each choice affects cash flow, runway, and life goals.

## What is included

- Landing page with premium fintech positioning and product mockups
- Guided Scenario Engine with starter chips, follow-up prompts, and comparison cards
- Life Goals layer showing how decisions delay or accelerate major milestones
- Financial dashboard with realistic snapshot, net worth, and cash flow context
- Insights and Trust Center surfaces, including privacy guidance and Plaid readiness
- Server-side decision endpoint ready for OpenAI-powered guidance on Vercel
- Normalized baseline model shared by manual entry and Sandbox-style sample data

## Run locally

1. `cd /Users/iwillfixthis/Documents/New\ project/pam-ai`
2. Create `.env.local` from `.env.example` and add `OPENAI_API_KEY`
3. `node server.js`
4. Open `http://localhost:3000`

Do not open `index.html` directly with `file://`. PAM uses JavaScript modules and local browser storage, so it should always run over HTTP.

## AI configuration

- The live decision guidance route is `/api/decision`
- `OPENAI_API_KEY` is read server-side only
- Frontend code should never contain a raw OpenAI key
- For local development, use `.env.local`
- For Vercel production, set `OPENAI_API_KEY` in the project environment settings
- If any provider key was ever pasted into code, chat, or a client bundle, rotate it in the provider dashboard before reuse

## Verification email configuration

- Account verification codes can send through Resend when configured
- Set `RESEND_API_KEY` and `PAM_FROM_EMAIL` in `.env.local` or Vercel project settings
- Production uses `PAM AI <hello@pamadvisor.com>` from the verified `pamadvisor.com` Resend domain
- `PAM_FROM_EMAIL` must be an address on a verified Resend domain before Resend will send to arbitrary user emails
- `onboarding@resend.dev` is Resend's testing sender and can only send to the verified owner email on the Resend account
- Optional: set `WAITLIST_NOTIFY_EMAIL` to the inbox that should receive new waitlist signup notifications
- Optional: set `RESEND_AUDIENCE_ID` to sync waitlist signups into a Resend Audience for newsletter/broadcasts
- The waitlist endpoint stores the signup, syncs the Resend audience when configured, then sends a notification email plus a confirmation email
- Public signup links are `https://pamadvisor.com/newsletter` and `https://pamadvisor.com/waitlist`
- If those variables are missing, PAM falls back to prototype preview mode and shows the code in the UI instead of emailing it
- Keep email provider credentials server-side only and rotate them immediately if they were ever exposed

### Domain setup

- `pamadvisor.com` is the production brand domain
- Vercel project `pam-ai1` has `pamadvisor.com` and `www.pamadvisor.com` attached
- In the domain DNS provider, use the exact Vercel records shown in the Vercel Domains screen
- The current production setup uses Vercel DNS for `pamadvisor.com` and `www.pamadvisor.com`
- Resend sending is verified for `pamadvisor.com` with DKIM, SPF/MX, and DMARC records in Vercel DNS
- Do not use `onboarding@resend.dev` for production email
- Set `PAM_SITE_URL=https://pamadvisor.com` anywhere the app needs its public URL

## Supabase setup

- Run `supabase/schema.sql` in the Supabase SQL Editor to create PAM's account, session, waitlist, baseline, scenario, and future Plaid item tables
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel project environment variables
- If Supabase is connected through Vercel Marketplace, PAM also supports the prefixed `PAM_SUPABASE_*` environment variables Vercel creates automatically
- To apply the schema locally from pulled Vercel env vars, run `npx -p pg node scripts/apply-supabase-schema.mjs`
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only; never expose it in frontend code
- If Supabase env vars are missing, PAM falls back to prototype storage so local demos still work

## Security notes

- Public API routes use strict payload validation, reject unexpected fields, and apply rate limiting by IP and user identifier
- Passwords are hashed server-side and are never stored in plaintext
- Plaid and OpenAI credentials stay in environment variables only; never commit them and never expose them in frontend code
- Plaid access tokens must remain server-side only and must never be written to `localStorage`

## Startup stack status

- Live now: GitHub, Vercel deployment, Supabase storage, Resend API wiring, Plaid Sandbox wiring, and server-side OpenAI route
- Needs external verification only if missing in provider dashboards: Resend domain sending from `hello@pamadvisor.com`
- Optional free-tier next: PostHog analytics, Sentry error monitoring, and Cloudflare DNS after DNS is moved or configured
- Later, not necessary for this MVP: Clerk auth, Stripe payments, Upstash Redis, and Pinecone vector search
- PAM already has account creation and password hashing, so do not add Clerk unless replacing the current auth path deliberately
- Stripe has no monthly platform fee for basic setup, but payments have transaction fees, so leave it out until pricing is ready

## Stack

- Native ES modules
- Responsive HTML, CSS, and JavaScript
- Small Node server for local hosting and API passthrough

## Future Plaid setup

1. Create a Plaid developer account
2. Use Sandbox first
3. Add `PLAID_CLIENT_ID` and `PLAID_SECRET` to the environment
4. Implement the create-link-token backend route against Plaid
5. Implement the public-token exchange backend route against Plaid
6. Store `access_token` server-side only
7. Pull Transactions, Balances, and Liabilities
8. Normalize Plaid data into PAM's shared baseline object

### Planned environment variables

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV=sandbox`
- `PLAID_PRODUCTS=transactions,balance,liabilities`
- `PLAID_COUNTRY_CODES=US`
