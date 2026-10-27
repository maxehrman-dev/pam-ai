# PAM SI

**Know what happens before you decide.** PAM (Personal Asset Manager) helps young adults test money decisions before they make them: a lease, a car, a job offer, paying off loans, investing. It shows what each one does to their monthly buffer, goals, and long-term savings, using their real numbers.

Live at https://pamadvisor.com.

## Run it

```bash
npm install
cp .env.example .env.local   # add keys you have; everything else degrades gracefully
node server.js               # http://127.0.0.1:3000
npm test
```

Open it over HTTP, never with `file://`.

## Where things are

| | |
|---|---|
| What PAM is and isn't | `PRODUCT.md` |
| Build rules for contributors and AI sessions | `CLAUDE.md` |
| Decision-engine strategy | `BRAIN.md` |
| Running, deploying, and un-breaking it | `OPERATIONS.md` |
| Getting started as a collaborator | `COLLABORATION.md` |
| Cost and abuse protection | `security/cost-protection.md` |

Client: `src/main.js`, `src/styles.css`, engines in `src/utils/`. Server: `api/` (Vercel functions), shared helpers in `api/_lib/`. Database schema: `supabase/schema.sql`.

PAM SI is a financial modeling tool, not a licensed financial advisor, investment adviser, tax professional, attorney, or RIA. Nothing in PAM is financial, tax, legal, or investment advice.
