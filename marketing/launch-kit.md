# PAM AI — Launch Kit

Three demand tests. Do all three this week. Total cost: $0.

---

## 1. TikTok / Reels — "ChatGPT vs PAM with real bank data"

**Format:** Faceless screen recording. No talking-head. Phone screen recording + text captions + a trending low-key sound. 20–35 seconds. Post 1/day for 2 weeks, rotating the 3 hooks below.

**The shot (same every time):**
1. Open ChatGPT, type the question, show its vague answer (3 sec)
2. Cut to PAM, ask the same thing, show the real numbers result (buffer, risk, goal impact) (5 sec)
3. End card: "PAM — know what you can actually afford. Link in bio."

### Hook A — moving out
- Caption on screen: *"I asked ChatGPT if I could afford to move out."*
- ChatGPT: generic "it depends on your budget…"
- Caption: *"Then I asked PAM — connected to my actual bank."*
- PAM result: "Rent $1,800 → buffer drops to $640/mo · Risk: Medium · Move-out fund delayed 4 months"
- End: *"It uses YOUR money, not vibes."*

### Hook B — the car
- *"Everyone says don't buy the car. I wanted a real answer."*
- ChatGPT: "consider your budget and interest rates…"
- PAM: "$400/mo payment → you can afford it, but emergency fund stalls for 7 months."
- End: *"This is what a $400 car payment actually does."*

### Hook C — debt vs investing
- *"Should I pay off debt or start investing? ChatGPT couldn't really say."*
- PAM: shows the side-by-side with real numbers.
- End: *"PAM ran it on my actual accounts."*

**Why faceless works for you:** you look young → don't put your face on financial authority. Let the *product output* be the proof. The screen recording IS the credibility.

**Posting:** TikTok + Instagram Reels + YouTube Shorts (same file, all 3). Caption: 1 line + 3 hashtags max (#personalfinance #moneytok #genzmoney). Link in bio → pamadvisor.com/waitlist.

---

## 2. Reddit — answer real questions, soft-mention PAM

**Subreddits:** r/personalfinance, r/povertyfinance, r/MiddleClassFinance, r/Mortgages (rent affordability), r/financialindependence.

**Rules:** Be genuinely helpful first. Don't spam. Mention PAM in maybe 1 of 4 replies, and only when it actually fits. Reddit nukes obvious self-promo — lead with real value.

**Reply template (adapt per post):**
> The quick math: take your monthly take-home, subtract fixed costs (rent, debt, insurance), and what's left is your real buffer. For a $X decision, you want your buffer to stay above ~3 months of expenses after it.
>
> For your numbers that looks like [rough calc]. The thing people miss is what it does to your *timeline* — e.g. this pushes [goal] back about N months.
>
> *(occasional add-on:)* I've been testing a tool called PAM that does this against your connected accounts automatically if you don't want to do it by hand — pamadvisor.com. Either way the math above is the core of it.

**Where to find posts:** search each sub for "can I afford", "should I buy", "is it worth it". These get posted daily.

---

## 3. Pre-sell the $7.99 founding price (the real demand test)

**The honest version (do this now):** You should NOT charge people before the product reliably works for them — it's legally and reputationally risky pre-launch. Instead, make the founding offer a **clear commitment with a deadline**, captured on the waitlist:

- Waitlist already says: *"Early members lock in founding pricing forever."*
- Strengthen it to create urgency: *"First 100 founding members lock in $7.99/mo for life. After launch it's $9.99."*
- Track who clicks "I want founding pricing" — that intent signal is your proof.

**The real-money version (do later, once Plaid prod + Stripe are live):**
- Use Stripe **$0 authorization** or a small refundable deposit, OR a Stripe payment link for "Founding membership — $7.99/mo, first charge on launch day, cancel anytime."
- Only do this once the app works end-to-end for a stranger. Taking money for something that doesn't fully work yet will burn your earliest fans.

**What counts as proof:**
- 100+ genuine waitlist signups from the content above = there's interest
- 10+ people clicking "lock in founding price" / replying they'd pay = there's willingness to pay
- If you can't get signups even with a polished product, the problem is distribution, not the build — and that's worth knowing before you spend on production infra.

---

## The one number to watch

**Waitlist signups this week.** That's it. Everything else is noise until people are signing up. Check Supabase `pam_waitlist` (or PostHog `waitlist_joined` events) daily.
