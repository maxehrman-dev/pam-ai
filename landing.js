import { escapeHtml, formatCompactCurrency, formatCurrency } from "../utils/formatters.js";

function renderComparisonRows(rows) {
  return rows
    .map(
      (row) => `
        <div class="comparison-row">
          <div class="comparison-label">${row.label}</div>
          <div class="comparison-cell comparison-cell-muted">${row.legacy}</div>
          <div class="comparison-cell comparison-cell-accent">${row.pam}</div>
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
          <p class="eyebrow">${feature.eyebrow}</p>
          <h3>${feature.title}</h3>
          <p>${feature.copy}</p>
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
          <span class="step-index">${step.step}</span>
          <h3>${step.title}</h3>
          <p>${step.copy}</p>
        </article>
      `
    )
    .join("");
}

function renderTrustHighlights(trustHighlights) {
  return trustHighlights
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

function renderScenarioExamples(examples) {
  return examples
    .map(
      (example) => `
        <button class="scenario-example-card surface-card" data-prompt="${escapeHtml(example.prompt)}">
          <span class="scenario-chip">Scenario example</span>
          <h3>${escapeHtml(example.title)}</h3>
          <p>${escapeHtml(example.teaser)}</p>
          <span class="link-arrow">Model this decision</span>
        </button>
      `
    )
    .join("");
}

function renderMockup(metrics, activeScenario) {
  return `
    <div class="hero-mockup surface-panel">
      <div class="mockup-window">
        <div class="mockup-toolbar">
          <span></span><span></span><span></span>
        </div>
        <div class="mockup-header">
          <div>
            <p class="mockup-kicker">Scenario preview</p>
            <h3>${escapeHtml(activeScenario.scenario.title)}</h3>
          </div>
          <div class="mockup-badge">${escapeHtml(activeScenario.risk.label)} risk</div>
        </div>
        <div class="mockup-stats">
          <div class="mockup-stat">
            <span>Net worth</span>
            <strong>${formatCompactCurrency(metrics.currentNetWorth)}</strong>
          </div>
          <div class="mockup-stat">
            <span>5Y path</span>
            <strong>${formatCompactCurrency(activeScenario.scenarioPath.projectedNetWorth)}</strong>
          </div>
          <div class="mockup-stat">
            <span>Flex cash</span>
            <strong>${formatCurrency(activeScenario.scenarioPath.monthlyFreeCash)}</strong>
          </div>
        </div>
        <div class="mockup-compare">
          <div class="mockup-compare-card">
            <span>Current path</span>
            <strong>${formatCurrency(activeScenario.currentPath.projectedNetWorth)}</strong>
            <small>${activeScenario.currentPath.runwayMonths.toFixed(1)} months runway</small>
          </div>
          <div class="mockup-compare-card mockup-compare-card-mint">
            <span>Scenario path</span>
            <strong>${formatCurrency(activeScenario.scenarioPath.projectedNetWorth)}</strong>
            <small>${activeScenario.scenarioPath.runwayMonths.toFixed(1)} months runway</small>
          </div>
        </div>
        <div class="mockup-bars">
          <div class="mockup-bar">
            <span>Liquidity</span>
            <div><i style="width:${Math.min((activeScenario.scenarioPath.liquidAssets / metrics.liquidAssets) * 100, 100)}%"></i></div>
          </div>
          <div class="mockup-bar">
            <span>Health score</span>
            <div><i style="width:${activeScenario.scenarioPath.healthScore}%"></i></div>
          </div>
          <div class="mockup-bar">
            <span>Confidence</span>
            <div><i style="width:${activeScenario.confidenceScore}%"></i></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderLanding({ comparisonRows, featureList, howItWorks, scenarioExamples, trustHighlights, metrics, activeScenario }) {
  return `
    <section class="hero-section" id="top">
      <div class="hero-copy">
        <p class="eyebrow">PAM AI • Personal Asset Manager</p>
        <h1>Test your financial future before you live it.</h1>
        <p class="hero-subtitle">
          Don’t just track your money. Model your decisions. PAM AI is a what-if engine for money that turns
          real finances into forward-looking scenarios, projections, and tradeoff analysis.
        </p>
        <div class="hero-cta-row">
          <a class="button button-primary" href="#workspace">Launch Scenario Lab</a>
          <a class="button button-secondary" href="#showcase">See the product flow</a>
        </div>
        <div class="hero-proof">
          <div class="hero-proof-card surface-card">
            <span>Why it stands out</span>
            <strong>Future modeling, not expense policing</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>North star</span>
            <strong>See the ripple effects of every financial move.</strong>
          </div>
        </div>
      </div>
      ${renderMockup(metrics, activeScenario)}
    </section>

    <section class="comparison-section" id="showcase">
      <div class="section-heading">
        <p class="eyebrow">Different by design</p>
        <h2>Built for decisions, not backward-looking categorization</h2>
        <p>
          Budgeting apps help explain the past. PAM AI exists to reduce uncertainty before the decision becomes real.
        </p>
      </div>
      <div class="comparison-table surface-card">
        <div class="comparison-row comparison-row-header">
          <div></div>
          <div class="comparison-cell comparison-cell-muted">Traditional finance apps</div>
          <div class="comparison-cell comparison-cell-accent">PAM AI</div>
        </div>
        ${renderComparisonRows(comparisonRows)}
      </div>
    </section>

    <section class="showcase-section">
      <div class="section-heading">
        <p class="eyebrow">Product mockup</p>
        <h2>A premium command center for financial hypotheticals</h2>
        <p>
          The interface is visual, calm, and decision-first. Snapshot context stays nearby, but the scenario engine is
          always the star.
        </p>
      </div>
      <div class="showcase-grid">
        <div class="showcase-panel surface-panel">
          <div class="showcase-stack">
            <div class="showcase-shell">
              <div class="showcase-shell-header">
                <span>Decision Lab</span>
                <strong>${escapeHtml(activeScenario.scenario.title)}</strong>
              </div>
              <div class="showcase-shell-grid">
                <div class="showcase-insight-card">
                  <span>Short-term impact</span>
                  <strong>${formatCurrency(activeScenario.shortTermLiquidityDelta)}</strong>
                </div>
                <div class="showcase-insight-card">
                  <span>Long-term path</span>
                  <strong>${formatCurrency(activeScenario.scenarioPath.projectedNetWorth)}</strong>
                </div>
                <div class="showcase-insight-card wide">
                  <span>Recommended next step</span>
                  <p>${escapeHtml(activeScenario.nextStep)}</p>
                </div>
              </div>
            </div>
            <div class="showcase-float-card surface-card">
              <p class="eyebrow">Financial snapshot</p>
              <strong>${formatCurrency(metrics.currentNetWorth)}</strong>
              <p>${formatCurrency(metrics.liquidAssets)} liquid • ${metrics.runwayMonths.toFixed(1)} months runway</p>
            </div>
          </div>
        </div>
        <div class="showcase-copy surface-card">
          <p class="eyebrow">Product philosophy</p>
          <h3>Every financial move deserves a before-state and after-state.</h3>
          <p>
            The product frames decisions as reversible simulations. You see what changes now, what compounds later, how
            much uncertainty sits in the assumptions, and what to do next if the answer is “not yet.”
          </p>
        </div>
      </div>
    </section>

    <section class="features-section">
      <div class="section-heading">
        <p class="eyebrow">Core capabilities</p>
        <h2>Decision modeling that feels trustworthy and fast</h2>
      </div>
      <div class="feature-grid">
        ${renderFeatureCards(featureList)}
      </div>
    </section>

    <section class="how-it-works-section">
      <div class="section-heading">
        <p class="eyebrow">How it works</p>
        <h2>Three moves from question to clarity</h2>
      </div>
      <div class="step-grid">
        ${renderHowItWorks(howItWorks)}
      </div>
    </section>

    <section class="trust-section">
      <div class="section-heading">
        <p class="eyebrow">Trust layer</p>
        <h2>Security and privacy belong in the core product, not the fine print</h2>
        <p>
          PAM AI is designed to support connected finance in the future without turning the simulator into a raw data sink.
        </p>
      </div>
      <div class="trust-highlight-grid">
        ${renderTrustHighlights(trustHighlights)}
      </div>
    </section>

    <section class="examples-section" id="examples">
      <div class="section-heading">
        <p class="eyebrow">Scenario examples</p>
        <h2>Start with the financial decisions people actually wrestle with</h2>
      </div>
      <div class="examples-grid">
        ${renderScenarioExamples(scenarioExamples)}
      </div>
    </section>
  `;
}
