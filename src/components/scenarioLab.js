import { escapeHtml, formatCurrency, formatMonths, formatSignedCurrency } from "../utils/formatters.js";

function renderPresetButtons(catalog, isResolving) {
  return catalog
    .map(
      (scenario) => `
        <button class="preset-card surface-card" data-preset-id="${escapeHtml(scenario.id)}" ${isResolving ? "disabled" : ""}>
          <span class="eyebrow">Preset scenario</span>
          <strong>${escapeHtml(scenario.title)}</strong>
          <small>${escapeHtml(scenario.teaser)}</small>
        </button>
      `
    )
    .join("");
}

function renderImpactCards(cards) {
  return cards
    .map(
      (card) => `
        <article class="impact-card surface-card" data-risk="${escapeHtml(card.value)}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function renderComparisonCard(label, values, delta, tone = "neutral") {
  return `
    <article class="comparison-card surface-card comparison-card-${tone}">
      <div class="comparison-card-header">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(values.title)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Monthly flex cash</span>
        <strong>${formatCurrency(values.monthlyFreeCash)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Emergency runway</span>
        <strong>${formatMonths(values.runwayMonths)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Projected 5Y net worth</span>
        <strong>${formatCurrency(values.projectedNetWorth)}</strong>
      </div>
      <div class="comparison-footer">${escapeHtml(delta)}</div>
    </article>
  `;
}

export function renderScenarioLab(activeScenario, scenarioCatalog, { isResolving, engine, profileSource }) {
  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Scenario Lab</p>
          <h2>Model the decision before you make it</h2>
        </div>
        <p>Plain-English prompts, believable projections, and cleaner reasoning across varied phrasing.</p>
      </div>

      <div class="scenario-system-strip">
        <div class="scenario-system-card surface-card">
          <span class="eyebrow">Engine</span>
          <strong>${escapeHtml(engine.provider)}</strong>
          <p>${escapeHtml(engine.mode)}</p>
        </div>
        <div class="scenario-system-card surface-card">
          <span class="eyebrow">Data source</span>
          <strong>${escapeHtml(profileSource.status)}</strong>
          <p>${escapeHtml(profileSource.label)}</p>
        </div>
      </div>

      <div class="scenario-builder-grid">
        <article class="surface-panel scenario-builder">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Describe a decision</p>
              <h3>Run a what-if simulation</h3>
            </div>
            <span class="pill">${escapeHtml(activeScenario.confidenceLabel)}</span>
          </div>
          <form class="scenario-form" data-scenario-form>
            <label for="scenario-prompt">Try a scenario in plain English</label>
            <textarea
              id="scenario-prompt"
              name="prompt"
              rows="4"
              placeholder="Can I afford a $20,000 car right now?"
              ${isResolving ? "disabled" : ""}
            >${escapeHtml(activeScenario.scenario.prompt)}</textarea>
            <div class="button-row">
              <button class="button button-primary" type="submit" ${isResolving ? "disabled" : ""}>
                ${isResolving ? "Modeling..." : "Model decision"}
              </button>
              <button class="button button-secondary" type="button" data-open-tab="chat" ${isResolving ? "disabled" : ""}>
                Ask in chat instead
              </button>
            </div>
          </form>
          <div class="scenario-builder-note">
            <p>${escapeHtml(activeScenario.interpretationNarrative)}</p>
          </div>
          <div class="preset-grid">
            ${renderPresetButtons(scenarioCatalog, isResolving)}
          </div>
        </article>

        <article class="surface-panel scenario-focus">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Active scenario</p>
              <h3>${escapeHtml(activeScenario.scenario.title)}</h3>
            </div>
            <span class="risk-pill" data-risk="${escapeHtml(activeScenario.risk.label.toLowerCase())}">${escapeHtml(
              activeScenario.risk.label
            )} risk</span>
          </div>
          <p class="scenario-summary">${escapeHtml(activeScenario.shortTermNarrative)}</p>
          <p class="scenario-summary subtle">${escapeHtml(activeScenario.longTermNarrative)}</p>
          <div class="impact-grid">
            ${renderImpactCards(activeScenario.impactCards)}
          </div>
        </article>
      </div>
    </section>

    <section class="panel-section">
      <div class="comparison-grid">
        ${renderComparisonCard(
          "Current path",
          { ...activeScenario.currentPath, title: "Baseline plan" },
          "No scenario applied. This is your default trajectory.",
          "neutral"
        )}
        ${renderComparisonCard(
          "Scenario path",
          { ...activeScenario.scenarioPath, title: activeScenario.scenario.title },
          `Change vs current path: ${formatSignedCurrency(activeScenario.longTermNetWorthDelta)} over five years.`,
          activeScenario.longTermNetWorthDelta >= 0 ? "positive" : "negative"
        )}
      </div>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Assumptions</p>
            <h3>What PAM AI is modeling</h3>
          </div>
        </div>
        <div class="assumption-list">
          ${activeScenario.scenario.assumptions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
      </article>
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Recommended next step</p>
            <h3>What to do with this answer</h3>
          </div>
        </div>
        <p class="next-step-copy">${escapeHtml(activeScenario.nextStep)}</p>
        <div class="scenario-deltas">
          <div>
            <span>Liquidity change</span>
            <strong>${formatSignedCurrency(activeScenario.shortTermLiquidityDelta)}</strong>
          </div>
          <div>
            <span>Runway change</span>
            <strong>${(activeScenario.scenarioPath.runwayMonths - activeScenario.currentPath.runwayMonths).toFixed(1)} mo</strong>
          </div>
          <div>
            <span>Health score</span>
            <strong>${activeScenario.scenarioPath.healthScore}/100</strong>
          </div>
        </div>
      </article>
    </section>
  `;
}
