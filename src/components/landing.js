import { escapeHtml, formatCompactCurrency, formatCurrency } from "../utils/formatters.js";

function renderComparisonRows(rows) {
  return rows
    .map(
      (row) => `
        <div class="comparison-row">
          <div class="comparison-label">${escapeHtml(row.label)}</div>
          <div class="comparison-cell comparison-cell-muted">${escapeHtml(row.legacy)}</div>
          <div class="comparison-cell comparison-cell-accent">${escapeHtml(row.pam)}</div>
        </div>
      `
    )
    .join("");
}

function renderFeatureCards(features) {
  return features
    .map(
      (feature) => `
        <article class="feature-card surface-card">
          <p class="eyebrow">${escapeHtml(feature.eyebrow)}</p>
          <h3>${escapeHtml(feature.title)}</h3>
          <p>${escapeHtml(feature.copy)}</p>
        </article>
      `
    )
    .join("");
}

function renderHowItWorks(steps) {
  return steps
    .map(
      (step) => `
        <article class="step-card surface-card">
          <span class="step-index">${escapeHtml(step.step)}</span>
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.copy)}</p>
        </article>
      `
    )
    .join("");
}

function renderTrustHighlights(highlights) {
  return highlights
    .map(
      (highlight) => `
        <article class="trust-highlight-card surface-card">
          <p class="eyebrow">${escapeHtml(highlight.eyebrow)}</p>
          <h3>${escapeHtml(highlight.title)}</h3>
          <p>${escapeHtml(highlight.copy)}</p>
        </article>
      `
    )
    .join("");
}

function renderMarketSignals() {
  const signals = [
    {
      title: "Turns vague stress into a plan",
      copy: "Users do not need a perfect prompt. PAM takes a messy life decision and gives it a structure they can act on."
    },
    {
      title: "Makes the hidden cost obvious",
      copy: "The product shows what a decision really costs in cash runway, delayed goals, and long-term wealth drag."
    },
    {
      title: "Feels like a financial second opinion",
      copy: "Instead of generic advice, people get a comparison, a risk call, and the one lever most likely to improve the outcome."
    }
  ];

  return signals
    .map(
      (signal) => `
        <article class="market-signal-card surface-card">
          <h3>${escapeHtml(signal.title)}</h3>
          <p>${escapeHtml(signal.copy)}</p>
        </article>
      `
    )
    .join("");
}

function renderGoalPreview(goals) {
  return goals
    .slice(0, 3)
    .map((goal) => {
      const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
      return `
        <article class="goal-preview-card surface-card">
          <div class="goal-preview-header">
            <span>${escapeHtml(goal.category)}</span>
            <strong>${escapeHtml(goal.priority)}</strong>
          </div>
          <h3>${escapeHtml(goal.title)}</h3>
          <p>${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}</p>
          <div class="goal-preview-track"><i style="width:${progress}%"></i></div>
        </article>
      `;
    })
    .join("");
}

function renderExamples(examples) {
  return examples
    .map(
      (example) => `
        <button class="example-card surface-card" data-example-prompt="${escapeHtml(example.prompt)}">
          <span class="scenario-chip">Input</span>
          <h3>${escapeHtml(example.title)}</h3>
          <p class="example-prompt">${escapeHtml(example.prompt)}</p>
          <div class="example-metrics">
            <div>
              <span>Monthly buffer</span>
              <strong>${formatCurrency(example.monthlyBufferBefore)} -> ${formatCurrency(example.monthlyBufferAfter)}</strong>
            </div>
            <div>
              <span>Most impacted goal</span>
              <strong>${escapeHtml(example.goalTitle)}</strong>
            </div>
            <div>
              <span>Goal delay</span>
              <strong>${example.goalDelayMonths > 0 ? `${Math.round(example.goalDelayMonths)} mo` : "On track"}</strong>
            </div>
            <div>
              <span>Risk</span>
              <strong>${escapeHtml(example.risk)}</strong>
            </div>
          </div>
          <p class="example-highlight">${escapeHtml(example.highlight)}</p>
          <span class="link-arrow">Run this scenario</span>
        </button>
      `
    )
    .join("");
}

function renderMockup(metrics, session) {
  const result = session.result;
  const goal = result.goalsSummary.mostImpactedGoal;

  return `
    <div class="hero-mockup surface-panel">
      <div class="mockup-shell">
        <div class="mockup-shell-header">
          <span>Guided scenario engine</span>
          <strong>${escapeHtml(result.scenario.title)}</strong>
        </div>
        <div class="mockup-input">
          <span class="mockup-chip">Lose my job</span>
          <span class="mockup-chip">Buy a car</span>
          <span class="mockup-chip">Big emergency expense</span>
        </div>
        <div class="mockup-card-grid">
          <div class="mockup-stat">
            <span>Net worth</span>
            <strong>${formatCompactCurrency(metrics.currentNetWorth)}</strong>
          </div>
          <div class="mockup-stat">
            <span>Monthly buffer</span>
            <strong>${formatCurrency(result.scenarioPath.monthlyFreeCash)}</strong>
          </div>
          <div class="mockup-stat">
            <span>Runway</span>
            <strong>${result.scenarioPath.runwayMonths.toFixed(1)} mo</strong>
          </div>
          <div class="mockup-stat">
            <span>Risk</span>
            <strong>${escapeHtml(result.risk.label)}</strong>
          </div>
        </div>
        <div class="mockup-highlight">
          <span>Aha moment</span>
          <p>${escapeHtml(result.ahaMoment)}</p>
        </div>
        <div class="mockup-goal-row">
          <div>
            <span>Most impacted goal</span>
            <strong>${escapeHtml(goal?.title || "No critical delay")}</strong>
          </div>
          <div>
            <span>Delay</span>
            <strong>${goal?.deltaMonths > 0 ? `${Math.round(goal.deltaMonths)} mo` : "0 mo"}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderLanding({
  comparisonRows,
  featureList,
  howItWorks,
  trustHighlights,
  metrics,
  session,
  goals,
  landingExamples
}) {
  return `
    <section class="hero-section" id="top">
      <div class="hero-copy">
        <p class="eyebrow">PAM AI • Personal Asset Manager</p>
        <h1>Test your financial future before you live it.</h1>
        <p class="hero-subtitle">
          PAM is a financial decision simulator for adult-money choices. It structures scenarios, models tradeoffs, and
          shows what each move does to your cash, timeline, and life goals before you commit.
        </p>
        <div class="hero-cta-row">
          <a class="button button-primary" href="#workspace">Try the simulator</a>
          <a class="button button-secondary" href="#examples">See real outputs</a>
        </div>
        <div class="hero-proof">
          <div class="hero-proof-card surface-card">
            <span>Core promise</span>
            <strong>Don't just track your money. Model your decisions.</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>Why it feels different</span>
            <strong>Structured guidance instead of a blank chatbot.</strong>
          </div>
        </div>
      </div>
      ${renderMockup(metrics, session)}
    </section>

    <section class="comparison-section" id="showcase">
      <div class="section-heading">
        <p class="eyebrow">Different by design</p>
        <h2>Built for decisions, not backward-looking categorization</h2>
        <p>Traditional finance tools tell you where money went. PAM shows what happens before a life decision becomes expensive.</p>
      </div>
      <div class="comparison-table surface-card">
        <div class="comparison-row comparison-row-header">
          <div></div>
          <div class="comparison-cell comparison-cell-muted">Budgeting apps</div>
          <div class="comparison-cell comparison-cell-accent">PAM AI</div>
        </div>
        ${renderComparisonRows(comparisonRows)}
      </div>
    </section>

    <section class="market-signal-section">
      <div class="section-heading">
        <p class="eyebrow">Why it lands</p>
        <h2>Marketable because the value is obvious in under a minute</h2>
        <p>PAM wins when someone can feel the product in one scenario: what changes now, what gets delayed, and what to do next.</p>
      </div>
      <div class="market-signal-grid">
        ${renderMarketSignals()}
      </div>
      <div class="market-quote surface-card">
        <strong>Instead of asking “can I afford it?”, PAM tells you what the decision costs in time.</strong>
      </div>
    </section>

    <section class="showcase-section">
      <div class="section-heading">
        <p class="eyebrow">Why it works</p>
        <h2>The app structures the decision so the user does not have to</h2>
        <p>Starter chips, one-question follow-ups, editable assumptions, and goal-aware projections make the scenario engine feel instant instead of brittle.</p>
      </div>
      <div class="showcase-grid">
        <div class="showcase-panel surface-panel">
          <div class="showcase-shell">
            <div class="showcase-shell-header">
              <span>Guided flow</span>
              <strong>Input -> follow-up -> answer</strong>
            </div>
            <div class="showcase-flow">
              <div class="showcase-flow-card">
                <span>User says</span>
                <strong>"What if I get fired and sued?"</strong>
              </div>
              <div class="showcase-flow-card">
                <span>PAM asks</span>
                <strong>"What should I model first: lost income, legal costs, or both?"</strong>
              </div>
              <div class="showcase-flow-card">
                <span>PAM returns</span>
                <strong>Monthly cash impact, savings runway, goal delay, and next step.</strong>
              </div>
            </div>
          </div>
        </div>
        <div class="showcase-copy surface-card">
          <p class="eyebrow">The aha moment</p>
          <h3>Every scenario should make the consequence obvious.</h3>
          <p>
            The product is strongest when it says something concrete like “you would run out of cash in 7 months” or
            “this delays your move-out goal by 4 months.” The interface is built around those moments.
          </p>
        </div>
      </div>
    </section>

    <section class="features-section">
      <div class="section-heading">
        <p class="eyebrow">Core capabilities</p>
        <h2>Decision modeling that feels premium, specific, and useful</h2>
      </div>
      <div class="feature-grid">
        ${renderFeatureCards(featureList)}
      </div>
    </section>

    <section class="how-it-works-section">
      <div class="section-heading">
        <p class="eyebrow">How it works</p>
        <h2>A faster path from question to clarity</h2>
      </div>
      <div class="step-grid">
        ${renderHowItWorks(howItWorks)}
      </div>
    </section>

    <section class="examples-section" id="examples">
      <div class="section-heading">
        <p class="eyebrow">Scenario examples</p>
        <h2>Visual examples that show the consequence immediately</h2>
        <p>Every example is a real output pattern: input scenario, concrete result, and the goal that moves the most.</p>
      </div>
      <div class="example-grid">
        ${renderExamples(landingExamples)}
      </div>
    </section>

    <section class="goals-highlight-section">
      <div class="section-heading">
        <p class="eyebrow">Life goals layer</p>
        <h2>Goals are the scoreboard, not an add-on</h2>
        <p>
          PAM turns abstract choices into personal consequences by showing what each scenario does to moving out, buying a
          house, building emergency savings, and long-term wealth goals.
        </p>
      </div>
      <div class="goal-preview-grid">
        ${renderGoalPreview(goals)}
      </div>
    </section>

    <section class="trust-section">
      <div class="section-heading">
        <p class="eyebrow">Trust layer</p>
        <h2>Privacy, 2FA, and connected-finance readiness are part of the product surface</h2>
        <p>The engine can become Plaid-backed later without turning the app into a raw-data sink.</p>
      </div>
      <div class="trust-highlight-grid">
        ${renderTrustHighlights(trustHighlights)}
      </div>
    </section>
  `;
}
