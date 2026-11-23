# Ballot Compass

A nonpartisan tool that lets a voter compare their own policy views with possible 2028 U.S. presidential candidates in both parties. Every comparison is issue by issue and sourced. The tool shows where each candidate agrees and differs with the user; it never recommends a candidate.

This is a standalone static app, separate from PAM AI. It is listed in the repo's `.vercelignore` so it is never deployed to pamadvisor.com by accident. Move it to its own repository before publishing it.

## Run it

```bash
cd ballot-compass
python3 -m http.server 8080      # or: npm start
open http://127.0.0.1:8080/
```

Don't open `index.html` from disk (`file://`): the browser will block it from loading the data files.

## Test

```bash
cd ballot-compass
npm test
```

The tests cover the scoring formula, match levels, dealbreaker flags, ranking and tie-breaks, and check that the seed data is well formed. The data check fails if any position is not flagged for verification while the data is unreviewed.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | App shell. Strict Content-Security-Policy: no third-party scripts, fonts or requests. |
| `css/styles.css` | Editorial design system: light and dark themes, print/PDF styles. |
| `js/scoring.js` | Pure scoring functions (no DOM). |
| `js/app.js` | Hash router and views: intro, questions, leadership, results, candidate, compare, methodology. |
| `data/issues.json` | The 14 issues: framing question, five positions (0-4), background notes, plus the leadership traits. |
| `data/candidates.json` | Candidates, statuses and coded positions. **Edit this file to correct or update data.** |
| `tests/scoring.test.mjs` | Node test suite. |

## Scoring

- Per-issue match = `1 - |user - candidate| / 4`
- Weights: Low 1, Medium 2, High 3, Dealbreaker 4
- Alignment = `Σ(weight × match) / Σ(weight)`, shown as a percentage
- An issue is left out of the score when the user skipped it or the candidate's position is unknown (`value: null`). Every score shows its coverage, for example "Based on 9 of the 13 issues you answered".
- Dealbreaker flag: the issue is marked Dealbreaker and the gap is 2 or more steps.
- Match levels: Agree (gap 0), Partial (gap 1), Disagree (gap 2+), Unknown.

## Editing candidate data

Each position in `data/candidates.json` looks like this:

```json
"abortion": {
  "value": 2,
  "summary": "One plain-English sentence on what they said or did.",
  "source_url": "https://...",
  "source_label": "Who published it and what it is",
  "source_date": "2025-06",
  "provenance": "Record",
  "needs_verification": true
}
```

- `value`: 0-4 on that issue's scale (see `data/issues.json`), or `null` if there is no clear position. A `null` value is not scored; use `summary` to explain why.
- `source_date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Use only the precision you can source.
- `provenance`: `"Stated 2026"` for a 2026 statement, otherwise `"Record"`.
- After checking a source, set `needs_verification` to `false`. When a full review pass is done, set `meta.last_reviewed` (and `meta.reviewed_by`). The "Data last reviewed" stamp on every page reads from that field.
- Candidate `status` must be one of `Declared`, `Exploring`, `Undecided`, `Says not running` or `Declined`, with `status_date` set to the date of the latest statement.
- Ages are calculated from `birth_date`, so they don't go stale.

## Status of the seed data

The seed data was compiled from public records and reporting available through mid-2026. **No human has verified it yet**, and every position and status is flagged for verification.

Known gaps to address before anyone relies on it:

1. **The November 2026 elections are not reflected.** Several candidates were on the 2026 ballot (Ossoff, Shapiro, Pritzker, Huckabee Sanders), and roles or statuses may have changed. Every status is set to "Undecided".
2. **No "Stated 2026" entries yet.** Every coded position is tagged "Record" because the seed research did not cover 2026 statements in depth.
3. **Many sources are secondary.** Where no specific bill or vote page was on hand, positions link to the candidate's Ballotpedia profile, or a Wikipedia summary for Harris. These should be replaced with primary sources: floor votes, official statements, interview transcripts.
4. **Coverage is uneven.** Governors and House members have fewer coded positions, especially on foreign policy. Because scores are averages over covered issues, a candidate with few known positions can rank high from a small number of matches. The UI flags this with a coverage count and a "Limited data" note.

## Prediction markets (Kalshi)

Candidate pages, and a collapsed panel on the results page, show Kalshi's last traded prices for the 2028 Republican nomination, Democratic nomination and presidency markets. They are labeled "not part of your score" and never enter alignment. The app has no affiliate link and no "trade" prompts.

Prices come from a **snapshot file**, `data/markets.json`, not a live feed. This keeps the no-third-party-requests promise, since the reader's browser never contacts Kalshi. It also avoids a technical block: Kalshi's API rejects browser-origin requests and rate-limits callers. To refresh the snapshot:

```bash
cd ballot-compass
node scripts/fetch-markets.mjs          # behind a proxy: NODE_USE_ENV_PROXY=1 node scripts/fetch-markets.mjs
```

The script uses Kalshi's public, read-only API, with no key. It matches markets to candidates by name; if a name differs, add `"market_name": "Name As Kalshi Writes It"` to that candidate. The results page warns when the snapshot is more than 7 days old. It also lists anyone Kalshi prices at 2¢ or more who isn't in `candidates.json`, which is a quick way to spot people missing from the field.

For a live feed instead, add a small server endpoint that runs the same script on a schedule. Don't call Kalshi from the page.

## Websites

Each candidate has `links.official_url` (their current office) and `links.campaign_url`. `campaign_url` stays `null` until the candidate declares and launches a campaign site. Former officials have no office site. Both URLs are flagged for verification.

## Privacy

There are no accounts, cookies, analytics or network requests beyond the app's own files. Answers are kept in `localStorage` under `ballot-compass:v1`, and "Clear my answers" removes them. PDF export uses the browser's print dialog.
