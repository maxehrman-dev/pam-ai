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

## Verification email configuration

- Account verification codes can send through Resend when configured
- Set `RESEND_API_KEY` and `PAM_FROM_EMAIL` in `.env.local` or Vercel project settings
- If those variables are missing, PAM falls back to prototype preview mode and shows the code in the UI instead of emailing it

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
