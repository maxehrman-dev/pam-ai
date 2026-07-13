# WORKBENCH_BRIEF.md — What we need from Claude Workbench

Handoff for whoever is iterating on PAM's AI voice in Anthropic Workbench
(console.anthropic.com). This is a **wording and judgment** exercise, not a math
exercise — read the boundary section before touching anything.

## The one hard boundary

**Workbench can only change how PAM talks, never what PAM computes.**

- `api/decision.js` calls Claude with a deterministic result already computed
  (buffer, risk, goal delay, paycheck-split buckets, etc.) and asks it to
  *narrate* that result in PAM's voice — never to calculate anything new.
- The live app has a post-check (`findUntraceableDollars` in `api/decision.js`)
  that rejects any dollar figure the model states that isn't traceable to the
  numbers it was given. If a Workbench experiment "improves" an answer by
  having the model compute or invent a number, that's not shippable — it will
  get silently discarded in production and PAM will fall back to the plain
  deterministic summary. So: judge phrasing, tone, and completeness — not
  whether the numbers are right (they're already right by construction).
- The output must stay **strict JSON matching one exact schema** (below) —
  the app parses it directly. Do not accept or ship any variant shape.

## What to paste into Workbench

**1. System prompt** — copy verbatim from `api/decision.js`, the `system`
string built in `buildInput()`. Do not paraphrase it going in; only change it
if a specific rule is being deliberately revised.

**2. Few-shot examples** — copy the `FEW_SHOT_MESSAGES` array from the same
file (currently 2 pairs: a car-purchase "dont" and a Roth-vs-bridge "not_yet").
These ride along on every real call, so Workbench should test with them
present, not stripped out.

**3. Output contract (must not change):**
```json
{
  "verdict": "worth_it" | "not_yet" | "dont",
  "assistant": { "headline": "string, under 90 chars", "body": "string, 3-6 sentences, up to ~600 chars" },
  "interpretationSummary": "string",
  "followUpPrompt": "string",
  "followUpChoiceLabels": ["at most 3 short strings"]
}
```

**4. Test payloads** — the `userText` Claude actually receives is a long list
of labeled lines (profile, baseline, deterministic result, persona notes,
etc.), built by `buildInput()`. Don't hand-write fake ones — pull real
examples by running a decision locally and logging `userText` before it's
sent, OR use the persona fixtures below as a starting test matrix.

## The test matrix: 10 personas × 5 question shapes

`BRAIN.md` already defines 10 named personas (JADE, MARCUS, PRIYA, DEV, SAM,
ROSA, KEN, ALEX, NIA, OWEN) — each with a different worker type, household,
risk backing, and goal. Cross them with the 5 question shapes the system
prompt itself lists as "what people actually ask":

1. "Can I afford X?" (a car, rent, a trip)
2. "Should I do A or B?" (pay debt vs. invest, rent vs. buy)
3. "What happens if…?" (job loss, rent hike, emergency bill)
4. "How much should I…?" (save monthly, spend on rent) — includes "How should
   I split my paycheck?"
5. "When can I…?" (retire, move out, buy)

That's 50 realistic cells. Don't run all 50 by hand — pick ~15-20 that cover
the personas with the most divergent numbers (MARCUS the freelancer, JADE the
irregular-pay barista with a family backstop, PRIYA the aggressive early
retiree, DEV with high-APR debt) crossed with all 5 question shapes. The goal
is proving the SAME prompt correctly produces DIFFERENT verdicts and tones for
different people on different question types — that asymmetry is the product.

## What "good" looks like (review checklist per response)

- [ ] First sentence of `body` states a plain-English verdict anchored to
      "your numbers" / "your goal" — never buried in a conditional at the end.
- [ ] `verdict` field agrees with what the body actually says.
- [ ] Every dollar figure in the response can be traced to a number in the
      test payload (or an obvious derivation: monthly×12, a difference, a
      cadence conversion). If you can't trace a number by eye, it's a bug —
      the production `findUntraceableDollars` check would catch and discard it.
- [ ] Headline ≤ 90 characters. Body is 3–6 full sentences.
- [ ] `followUpChoiceLabels` has ≤ 3 short entries (or is empty when the
      answer is already complete).
- [ ] Response acknowledges the persona's stated goals/values, not just the
      raw numbers (e.g. MARCUS's "no backstop" should visibly tighten the
      verdict vs. an identical-numbers persona with a family backstop).
- [ ] No specific fund, ticker, or security is ever named. Allocation
      *philosophy* only (e.g. "tax-advantaged first" is fine; "buy VTSAX" is not).
- [ ] Never implies PAM moves money, gives licensed advice, or guarantees an
      outcome.
- [ ] Tone is blunt-but-supportive per the system prompt's persona — not
      generic chatbot hedging, not harsh/shaming.

## What comes back to the codebase

If a system-prompt or few-shot change survives the checklist across the test
matrix:

1. Paste the **final system prompt text** and **final few-shot pairs** back
   into `api/decision.js` (`buildInput()`'s `system` string and the
   `FEW_SHOT_MESSAGES` array) — verbatim, not re-typed.
2. Do NOT touch the JSON schema, `parseGuidanceJson`, `normalizeGuidance`, or
   `findUntraceableDollars` — those are the code-side contract and integrity
   check; Workbench changes are prompt-only.
3. Run `npm test` (see `tests/ai-integrity.test.mjs`) before shipping — those
   tests exercise the untraceable-dollar guard against the new prompt text
   indirectly through fixture strings, so a prompt change that breaks the
   contract will surface there.
4. Follow the normal ship ritual in `CLAUDE.md` (version bump, commit, deploy).

## Why this is worth doing at all

The system prompt is ~2,300 tokens of hand-tuned rules (verdict-first framing,
boldness guardrails, tax caveats, persona continuity). It has never been
tested against a deliberate matrix of different people — only against
whatever question happened to come up in dev. Workbench is the right place to
stress-test tone and personalization consistency cheaply, before a wording
change goes live and costs real tokens on real users.
