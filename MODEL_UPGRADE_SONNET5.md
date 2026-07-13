# Prompt: migrate PAM's AI guidance from Sonnet 4.5 to Sonnet 5

Paste everything below the line into a fresh AI coding session working in this
repo (`pam-ai`). It's self-contained — no other context needed.

---

## The task

PAM's decision-guidance backend (`api/decision.js`) currently calls Claude via
`DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5"`. Migrate
this to **`claude-sonnet-5`**. This is a narration-only model: the deterministic
engine (`src/utils/scenarioEngine.js`) computes every number; the model only
interprets a pre-built payload and phrases the result as strict JSON. Two call
sites use `DEFAULT_MODEL`: the main decision-guidance call (`callClaude()`)
and the deep-dive interview call (`requestDeepDive()`), both in
`api/decision.js`.

## Why this isn't a bare string swap

Sonnet 5 changes two defaults that Sonnet 4.5 did not have, and both are
**silent** — no error, just different behavior:

1. **Adaptive thinking runs by default when the `thinking` field is omitted.**
   Sonnet 4.5 ran with no thinking when the field was absent; Sonnet 5 now
   runs adaptive thinking in that same case. Neither `callClaude()` nor
   `requestDeepDive()` currently sets `thinking` at all.
2. **New tokenizer.** The same text now tokenizes to roughly 30% more tokens
   than on Sonnet 4.5. Pricing itself is unchanged at $3/$15 per MTok, with an
   introductory $2/$10 through 2026-08-31 — so cost is a wash to modestly
   favorable, but token *counts* (and therefore how close a response sits to
   `max_tokens`) shift.

Combine these two and there's a real correctness risk, not just a cost one:
`callClaude()` sets `max_tokens: 1000` and `requestDeepDive()` sets
`max_tokens: 700`. Both are already tight. If adaptive thinking silently turns
on and consumes part of that budget, the JSON response can get cut off before
it closes — which breaks `parseGuidanceJson()`'s parse and silently falls back
to the deterministic-only path (not a crash, but a quality regression that
would be easy to miss without checking for it explicitly).

## What to change

**1. `api/decision.js` — update the model default.**

```js
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
```

**2. `api/decision.js` — add `thinking: {type: "disabled"}` to both request
bodies**, in `callClaude()`:

```js
body: JSON.stringify({
  model,
  max_tokens: 1000,
  thinking: { type: "disabled" },
  system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
  messages: [...FEW_SHOT_MESSAGES, { role: "user", content: userText }]
})
```

and in `requestDeepDive()`'s fetch body:

```js
body: JSON.stringify({
  model: DEFAULT_MODEL,
  max_tokens: 700,
  thinking: { type: "disabled" },
  system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userMsg }]
})
```

Rationale: this task is templated narration over numbers PAM already computed
— no multi-step reasoning is needed, so paying for and waiting on thinking
tokens is pure waste for this call. Disabling it restores the Sonnet 4.5
behavior deliberately rather than by accident.

**3. Check the Vercel environment for an explicit `ANTHROPIC_MODEL` override.**
If one is set (e.g. via `vercel env ls` or the dashboard) pinning the old
model string, the code-level default change above won't take effect until
that env var is also updated or removed. Confirm this before considering the
migration complete.

**4. Do NOT touch:**
- The JSON output contract (`parseGuidanceJson` / `normalizeGuidance` / the
  strict-JSON system prompt instruction) — Sonnet 5 doesn't require
  `output_config.format`; PAM's prompt-instructed-JSON approach is unaffected.
- Sampling parameters — neither call site sets `temperature`/`top_p`/`top_k`,
  so there's nothing to strip (Sonnet 5 would reject non-default values, but
  PAM never sets them).
- Assistant-turn prefill — not used here (both message arrays end on a `user`
  turn), so the Sonnet 5 prefill removal doesn't apply.
- `findUntraceableDollars` / the integrity post-check in `api/decision.js` —
  leave the guard itself alone; it's part of what you verify against, below.

## What to verify before calling this done

- [ ] `node --check api/decision.js` passes.
- [ ] `npm test` — all 46 existing tests still pass (they don't hit the live
      API, so this confirms nothing else broke, not model behavior itself).
- [ ] Run at least 3 real decisions against the live API (need
      `ANTHROPIC_API_KEY` set) covering: a normal affordability question, the
      paycheck-split flow, and one deep-dive turn. For each, confirm:
  - `response.stop_reason` is `"end_turn"`, never `"max_tokens"` — a
    `max_tokens` stop here means thinking (or anything else) ate the budget
    and the JSON was truncated. Treat this as a blocking failure, not a
    warning.
  - The response parses cleanly through `parseGuidanceJson` /
    `normalizeGuidance` with `integrityFlagged: false` (i.e., no untraceable
    dollar figures — a phrasing shift from the new model could plausibly
    surface new false positives here, so this needs an actual check, not an
    assumption).
  - The verdict/tone still matches PAM's blunt-but-supportive voice — this is
    a subjective check, but confirm the response doesn't read as more hedged
    or more verbose than the current Sonnet 4.5 output on the same prompt.
- [ ] Compare `usage.input_tokens` / `usage.output_tokens` on one sample
      request against a Sonnet-4.5 baseline for the *same* prompt, to confirm
      the ~30% token increase from the new tokenizer is roughly what's
      expected and not something larger (which would point at a different
      problem, e.g. thinking not actually disabled).
- [ ] Deploy to production is a normal ship: version-bump the asset string in
      `index.html` + `src/bootstrap.js` per the usual ritual, commit, push,
      `npx vercel --prod --yes`, then re-run one of the live-API checks above
      against the deployed URL (not just locally) since the Vercel env var
      question in step 3 only shows up in that environment.

## What to report back

State plainly: which model string is now live, whether the Vercel env var
needed changing, the `stop_reason` / integrity-flag results from the 3 test
calls, and the before/after token counts for the comparison sample. If any
verification step fails, stop and report it rather than silently reverting or
proceeding — this is a "why the JSON stopped mid-object" class of bug that's
easy to miss if the check is skipped.
