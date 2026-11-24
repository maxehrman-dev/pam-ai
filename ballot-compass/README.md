# Ballot Compass

A nonpartisan tool for comparing your own policy views with possible 2028 U.S. presidential candidates in both parties, issue by issue, with sources. It shows where each candidate agrees and differs with you; it never recommends a candidate.

This is a standalone app, separate from PAM AI. It is listed in the repo's `.vercelignore` so it never ships to pamadvisor.com by accident. Move it to its own repository and Vercel project before launch.

## Run it

```bash
cd ballot-compass
python3 -m http.server 8080      # static only; sharing shows "not available"
npx vercel dev                   # static + the /api routes
```

Don't open `index.html` from disk (`file://`).

## Test

```bash
cd ballot-compass
npm test
```

There are 28 tests. They cover the scoring formula and score ranges, ranking and sorting, dealbreaker flags, glossary matching, the data files, the market snapshot, and the API. The API tests check validation, consent, origin checks, rate limits, the kill switch, and the exact database calls.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | App shell. Strict Content-Security-Policy; no third-party requests. |
| `editor.html` | Data review tool (not linked from the app). Check and correct entries, then download `candidates.json`. |
| `js/app.js` | Views: intro, questions, review, leadership, about you, results, candidate, compare, how it works. |
| `js/scoring.js` | Pure scoring functions. |
| `js/survey.js` | The optional "about you" questions and the consent version, shared by the browser and the server. |
| `api/responses.js` | `POST` shares anonymous answers; `DELETE` removes them. |
| `api/signup.js` | `POST` adds an email to the updates list. |
| `api/_lib/` | Validation, rate limits, kill switch, Supabase calls. |
| `supabase/schema.sql` | Tables, rate-limit function and an aggregate view. |
| `data/issues.json` | Issues, positions (0-4), background notes, leadership traits. |
| `data/candidates.json` | Candidates, statuses, links and coded positions. |
| `data/markets.json` | Kalshi odds snapshot. |
| `data/glossary.json` | Plain-English definitions for terms like Roe v. Wade or the 2017 tax cuts. The first mention in each block of text gets a dotted underline you can tap; all terms are listed under How it works. |
| `js/glossary.js` | Term matching (pure, tested). |
| `scripts/fetch-markets.mjs` | Refreshes the odds snapshot. |

## Scoring

- Per-issue match = `1 - |user - candidate| / 4`. Weights: Low 1, Medium 2, High 3, Dealbreaker 4.
- Alignment = `Σ(weight × match) / Σ(weight)` over issues the user answered and the candidate has a known position on.
- **Range**: when a candidate has unknown positions on issues the user answered, the card shows "could be X–Y%". X assumes every unknown is a full disagreement and Y a full agreement. The bar is solid to X, shaded to Y, with a tick at the score.
- Sort by alignment (default) or by issues covered.
- **Results screen**: the headline names your closest match. A featured card for #1 shows the full breakdown (why, agree/close/differ/unknown, top issues, odds, experience). Beside it is the closest candidate from the other party. A spectrum chart places everyone on one 0-100% line, and tapping a dot jumps to that candidate's card. Below, all 21 candidates appear as trading cards in a ranked grid: initials badge, match %, likely range, Agree / Differ / nomination odds, top agreements and differences, and status. Party chips and a sort control filter the grid; nothing is folded away.
- **Candidate pages** are player cards: badge, role, status, links, your match and the why, a stat strip (agree/close/differ, known positions, odds), experience, then every issue as a block with your answer beside theirs and the source. Before the survey is finished they show positions and odds only.
- **Tie-breakers** (`#sharpen`): when the top two are within 5 points (`TIE_THRESHOLD` in `js/scoring.js`), people are offered up to 3 questions on the issues where those two differ most, with the stances shown unnamed. A pick replaces their answer on that issue, and they can re-weight it too. After that the results page links to a side-by-side comparison instead of repeating the questions.
- Dealbreaker flag: importance Dealbreaker and a gap of 2+ steps.

## Collecting answers (optional, anonymous)

The profile is split in two, and every question is optional with "Prefer not to say":

- **Start** (before the issues): state and age range.
- **End** (just before results): voter registration, party leaning, marital status, household size and household income range. Party leaning is asked last so it doesn't color the issue answers.

Nothing leaves the browser until the person ticks the consent box and shares. The share step is skippable, not a gate. Profile questions live in `js/survey.js` (`step: 'start'` or `'end'`); the server validates against the same list. Adding a field also needs a column in `supabase/schema.sql`.

How the data is kept apart:

- **Responses** (`bc_responses`) are keyed by a random UUID that only the person's browser keeps. They store answers, leadership ranking, the profile answers and a **date only**, with no timestamp, name, email or IP address. Sharing again updates the same row. "Clear my answers" deletes it.
- **Signups** (`bc_signups`) are a separate table with only email and consent version. They are never sent in the same request as answers and never linked to them. Because responses store only a date, the two can't be matched by time.
- Rate-limit keys use a salted hash of the IP that changes daily; raw IPs are never stored.
- Every table has row-level security on and no policies, so only the server's service key can touch them. `bc_issue_totals` is an aggregate view to start analysis from.

The site's copy promises that we publish totals only and never sell or share individual responses. Keep that promise, or change the copy (and bump `CONSENT_VERSION` in `js/survey.js`) before changing what you do with the data.

### Going live

1. Create a **new** Supabase project, separate from PAM AI's, and run `supabase/schema.sql` in its SQL editor.
2. Create a Vercel project rooted at `ballot-compass/` and set these environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, never in the browser)
   - `BC_RATE_LIMIT_SALT` (any long random string)
   - Optional: `BC_COLLECTION=off` (kill switch), `BC_RESPONSES_GLOBAL_DAILY`, `BC_SIGNUP_GLOBAL_DAILY`, `BC_RESPONSES_IP_DAILY`, `BC_SIGNUP_IP_DAILY`.
3. Deploy. Without the Supabase variables, sharing replies "not set up yet" and nothing is sent.

### Cost

Per-visitor cost is close to zero:

- Pages, data and odds are static files served from a CDN.
- A visitor who doesn't share makes no server calls at all.
- A visitor who shares makes one small database write; joining the email list is a second.
- Market odds are a snapshot an editor refreshes, not a call per visitor.

Free tiers of Vercel and Supabase cover a lot of traffic, and the global daily caps stop a bot from running up a bill.

## Editing candidate data

Use `editor.html` (serve the folder, then open `/editor.html`). It lists every unchecked position and status. Fix anything wrong, tick **Checked**, then download `candidates.json` and commit it. Tick "Set Data last reviewed to today" on the final pass. Edits are saved in that browser as you go.

Field reference:

- `value`: 0-4 on the issue's scale, or `null` when there is no clear position (not scored; explain in `summary`).
- `source_date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Sources older than 4 years show an "Older record" tag.
- `provenance`: `"Stated 2026"` or `"Record"`.
- `needs_verification`: shows an "Unverified" tag until set to `false`.
- `status`: `Declared`, `Exploring`, `Undecided`, `Says not running` or `Declined`, with `status_date`.
- `links.official_url`, `links.campaign_url` (`null` until a campaign site exists).

## Known data gaps

The draft data runs through mid-2026 and **no human has checked it**.

1. The November 2026 elections aren't reflected. Every status is "Undecided". Kalshi has Jon Ossoff at 23% for the Democratic nomination, which suggests news the data is missing.
2. There are no "Stated 2026" entries yet.
3. Many sources are secondary (Ballotpedia profiles) and should be replaced with primary sources.
4. Coverage is uneven. The score range makes this visible.

## Market odds (Kalshi)

Shown as percentages (a 23¢ contract is shown as 23%), on candidate pages and in a collapsed panel on results. They are never part of the score. The odds come from a snapshot file (`data/markets.json`), so visitors' browsers never contact Kalshi. Refresh with:

```bash
NODE_USE_ENV_PROXY=1 node scripts/fetch-markets.mjs
```

Names are matched automatically; add `"market_name"` to a candidate if Kalshi spells it differently. People Kalshi prices at 2% or more who aren't in the data are listed under the table.
