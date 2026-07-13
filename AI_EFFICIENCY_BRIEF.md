# Prompt: make PAM's AI usage more efficient and higher quality

Paste this alongside (after) `MODEL_UPGRADE_SONNET5.md`. That prompt is the
mechanical model swap. This one is about what to do *with* the upgraded
model — reduce cost per decision and raise output quality, without breaking
what already works. Read `BRAIN.md` first; don't re-derive its strategy.

## Two separate goals — don't conflate them

- **Efficiency**: fewer or cheaper AI calls, same or better product.
- **Quality**: better narration, using Sonnet 5's tightened instruction-following.

They overlap at one point: every fact computed in `scenarioEngine.js` instead
of reasoned about by the model is a fact that's both cheaper (no tokens spent
inferring it) and more correct (can't be wrong). That overlap is `BRAIN.md`'s
whole thesis — treat its Layer 2 backlog as the top efficiency AND quality
lever, not a separate task.

## Efficiency: what to do

1. **Execute `BRAIN.md`'s Layer 2 backlog in priority order** — P1-a
   (persona-aware verdict thresholds), P1-b (self-employed money physics),
   P1-c (irregular income baseline), then the P2s. Each engine you ship
   narrows what the AI has to interpret, which shortens the payload and cuts
   the odds of a clarifying follow-up (each follow-up is a full second API
   call at full price).
2. **Instrument and report real call volume.** Log or query existing
   telemetry for average AI calls per decision session — specifically how
   often a follow-up round-trip fires. The `parsePercent` regex bug fixed
   this session was silently causing exactly this (every "NN%" prompt forced
   an unnecessary follow-up). Grep the other `parse*` functions in
   `scenarioEngine.js` for the same `\b`-after-a-symbol mistake before
   assuming there isn't another one.
3. **Measure real cost per decision after the swap.** Average input/output
   tokens over at least 20 real decisions, and report it against this
   session's baseline (~1.9¢ cold-cache / ~1.1¢ warm-cache per decision on
   Sonnet 4.5). Confirm the Sonnet 5 move (new tokenizer, intro pricing,
   thinking disabled) actually landed where predicted — a wash to modestly
   favorable — rather than assuming the math worked out.
4. **Flag, don't cut, any AI call that looks redundant.** The paycheck-split
   panel already shows a complete deterministic breakdown before the AI adds
   a paragraph — that AI commentary might be skippable for cost. Surface it
   as a product question for the user to decide, not a unilateral efficiency
   cut — removing PAM's voice changes what makes the product feel like an
   advisor instead of a spreadsheet, and that's explicitly part of the pitch.

## Quality: what to do

1. **Run the Workbench test matrix against Sonnet 5 specifically**
   (`WORKBENCH_BRIEF.md` + `workbench-export.md`, already built for this).
   Sonnet 5 follows instructions more literally than Sonnet 4.5 — check in
   particular:
   - The verdict-first opening sentence still lands naturally, not
     formulaically — literal instruction-following can make a rule feel
     robotic if the rule was originally worded to compensate for a vaguer
     model.
   - Length caps (headline <90 chars, body 3-6 sentences) hold without
     needing to be restated more forcefully.
   - The "acknowledge everything the user raised AND relevant profile parts
     they didn't repeat" instruction still produces natural-sounding
     acknowledgment — this line may have been over-tuned for Sonnet 4.5's
     vagueness and could now need trimming rather than strengthening.
2. **Stress-test the one case most likely to suffer from `thinking: disabled`**
   — the vaguest, most ambiguous free-form prompts (the "idk what to do with
   my money" test case already in `workbench-export.md`). This is the one
   spot where a little reasoning could plausibly help, so it's the one spot
   worth checking closely, not assuming is fine. If quality measurably drops
   there, propose a scoped exception (e.g., enable adaptive thinking only
   when the deterministic engine tags the draft as `"custom"`/low-confidence)
   rather than silently shipping it.
3. **Report specific before/after text**, not just pass/fail, for at least 3
   of the persona test cases — the user needs to see the actual tone
   difference to judge whether it's actually better, not just different.

## What to report back

One summary covering: (a) which `BRAIN.md` engines shipped and their test
coverage, (b) measured average cost per decision post-migration vs. the
pre-migration baseline, (c) any redundant-AI-call opportunities flagged for a
product decision — not auto-cut, (d) Workbench findings as pass/fail per test
case plus the actual before/after text, and (e) any system-prompt edits made,
each with a before/after quote and the specific Sonnet 5 behavioral shift that
motivated it — same convention as the model-migration guide: quote the change,
name the reason, don't silently rewrite the prompt.
