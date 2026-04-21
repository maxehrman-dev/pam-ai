import {
  escapeHtml,
  formatCurrency,
  formatMonths,
  formatSignedCurrency
} from "../utils/formatters.js";

function renderStarterChips(catalog, isResolving) {
  return catalog
    .map(
      (starter) => `
        <button class="starter-chip" type="button" data-starter-id="${escapeHtml(starter.id)}" ${isResolving ? "disabled" : ""}>
          ${escapeHtml(starter.label)}
        </button>
      `
    )
    .join("");
}

function renderField(field) {
  return `
    <label class="builder-field">
      <span>${escapeHtml(field.label)}</span>
      <input
        type="number"
        name="${escapeHtml(field.key)}"
        value="${Number(field.value || 0)}"
        step="${Number(field.step || 1)}"
        min="${Number(field.min ?? 0)}"
      />
      ${field.helper ? `<small>${escapeHtml(field.helper)}</small>` : ""}
    </label>
  `;
}

function renderFollowUp(followUp) {
  if (!followUp) return "";

  return `
    <div class="followup-card">
      <span class="eyebrow">Clarify one thing</span>
      <p>${escapeHtml(followUp.prompt)}</p>
      <div class="followup-choice-row">
        ${followUp.choices
          .map(
            (choice, index) => `
              <button class="followup-choice" type="button" data-followup-choice="${index}">
                ${escapeHtml(choice.label)}
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderImpactCards(cards) {
  return cards
    .map(
      (card) => `
        <article class="impact-card surface-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function renderComparisonCard(label, path, delta, tone = "neutral") {
  return `
    <article class="comparison-card surface-card comparison-card-${tone}">
      <div class="comparison-card-header">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(path.title)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Monthly buffer</span>
        <strong>${formatCurrency(path.monthlyFreeCash)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Liquid savings</span>
        <strong>${formatCurrency(path.liquidAssets)}</strong>
      </div>
      <div class="comparison-metric">
        <span>5Y net worth</span>
        <strong>${formatCurrency(path.projectedNetWorth)}</strong>
      </div>
      <div class="comparison-metric">
        <span>Resilience score</span>
        <strong>${path.healthScore}/100</strong>
      </div>
      <div class="comparison-footer">${escapeHtml(delta)}</div>
    </article>
  `;
}

function renderGoalImpactPreview(goalsSummary) {
  return goalsSummary.goals
    .slice(0, 3)
    .map((goal) => {
      const baselineProgress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
      const scenarioProgress = Math.min((goal.scenarioCurrentAmount / goal.targetAmount) * 100, 100);
      return `
        <article class="goal-impact-card">
          <div class="goal-impact-header">
            <div>
              <span>${escapeHtml(goal.category)}</span>
              <strong>${escapeHtml(goal.title)}</strong>
            </div>
            <span class="goal-impact-status">${escapeHtml(goal.status)}</span>
          </div>
          <div class="goal-impact-row">
            <span>Current path</span>
            <strong>${escapeHtml(goal.baselineDateLabel)}</strong>
          </div>
          <div class="goal-impact-row">
            <span>Scenario path</span>
            <strong>${escapeHtml(goal.scenarioDateLabel)}</strong>
          </div>
          <div class="goal-impact-bars">
            <div>
              <span>Today</span>
              <div class="goal-impact-track"><i style="width:${baselineProgress}%"></i></div>
            </div>
            <div>
              <span>After decision</span>
              <div class="goal-impact-track scenario"><i style="width:${scenarioProgress}%"></i></div>
            </div>
          </div>
          <p>
            ${goal.deltaMonths > 0 ? `Delayed by ${Math.round(goal.deltaMonths)} months.` : "No meaningful delay detected."}
          </p>
        </article>
      `;
    })
    .join("");
}

export function renderScenarioLab(session, catalog, { isResolving, engine, profileSource }) {
  const result = session.result;
  const mostImpactedGoal = result.goalsSummary.mostImpactedGoal;
  const goalLead = mostImpactedGoal
    ? Number.isFinite(mostImpactedGoal.deltaMonths)
      ? `${escapeHtml(mostImpactedGoal.title)} shifts by ${Math.round(
          mostImpactedGoal.deltaMonths
        )} months and monthly funding changes by ${escapeHtml(formatSignedCurrency(mostImpactedGoal.contributionDelta))}.`
      : `${escapeHtml(mostImpactedGoal.title)} becomes ${escapeHtml(mostImpactedGoal.status.toLowerCase())} unless you restore funding or reduce the shock.`
    : "The current goal stack stays broadly on track under this scenario.";

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Scenario Engine</p>
          <h2>I can test life decisions instantly</h2>
        </div>
        <p>Starter chips, smart follow-ups, and editable assumptions keep the simulator useful even when the first prompt is messy.</p>
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

      <div class="decision-grid">
        <article class="surface-panel decision-builder">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Guided input</p>
              <h3>Describe the decision in plain English</h3>
            </div>
            <span class="pill">${escapeHtml(result.confidence.label)}</span>
          </div>

          <form class="decision-form" data-decision-form>
            <label for="decision-prompt">Tell PAM what might happen</label>
            <textarea
              id="decision-prompt"
              name="prompt"
              rows="3"
              placeholder="What if I get fired and sued?"
              ${isResolving ? "disabled" : ""}
            >${escapeHtml(session.prompt || session.draft.prompt || "")}</textarea>
            <div class="button-row">
              <button class="button button-primary" type="submit" ${isResolving ? "disabled" : ""}>
                ${isResolving ? "Simulating..." : "Simulate scenario"}
              </button>
            </div>
          </form>

          <div class="starter-chip-row">
            ${renderStarterChips(catalog, isResolving)}
          </div>

          <div class="assistant-note surface-card">
            <span class="eyebrow">PAM guide</span>
            <h3>${escapeHtml(session.assistant.headline)}</h3>
            <p>${escapeHtml(session.assistant.body)}</p>
            <p class="assistant-interpretation">${escapeHtml(session.interpretation.summary)}</p>
            ${renderFollowUp(session.followUp)}
          </div>

          <form class="builder-form" data-draft-form>
            <div class="card-heading compact">
              <div>
                <p class="eyebrow">Use your own numbers</p>
                <h3>Refine the assumptions directly</h3>
              </div>
            </div>
            <input type="hidden" name="type" value="${escapeHtml(session.draft.type)}" />
            <input type="hidden" name="starterId" value="${escapeHtml(session.draft.starterId || "")}" />
            <input type="hidden" name="prompt" value="${escapeHtml(session.prompt || session.draft.prompt || "")}" />
            <div class="builder-grid">
              ${session.editableFields.map(renderField).join("")}
            </div>
            <div class="button-row">
              <button class="button button-secondary" type="submit" ${isResolving ? "disabled" : ""}>Recalculate</button>
            </div>
          </form>
        </article>

        <article class="surface-panel decision-results">
          <div class="result-aha-banner">
            <span class="eyebrow">Aha moment</span>
            <h3>${escapeHtml(result.ahaMoment)}</h3>
          </div>

          <div class="impact-grid">
            ${renderImpactCards(result.impactCards)}
          </div>

          <div class="comparison-grid">
            ${renderComparisonCard(
              "Current path",
              { ...result.currentPath, title: "Baseline plan" },
              "No scenario applied. This is your current trajectory.",
              "neutral"
            )}
            ${renderComparisonCard(
              "Scenario path",
              { ...result.scenarioPath, title: result.scenario.title },
              `Five-year net worth change: ${formatSignedCurrency(result.longTermNetWorthDelta)}.`,
              result.longTermNetWorthDelta >= 0 ? "positive" : "negative"
            )}
          </div>
        </article>
      </div>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Goal impact</p>
            <h3>${escapeHtml(mostImpactedGoal?.title || "No major goal delay")}</h3>
          </div>
          <span class="risk-pill" data-risk="${escapeHtml(result.risk.label.toLowerCase())}">${escapeHtml(result.risk.label)} risk</span>
        </div>
        <p class="goal-impact-lead">${goalLead}</p>
        <div class="goal-impact-preview">
          ${renderGoalImpactPreview(result.goalsSummary)}
        </div>
      </article>

      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Assumptions and next step</p>
            <h3>What PAM is using</h3>
          </div>
        </div>
        <div class="assumption-list">
          ${result.scenario.assumptions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
        <div class="next-step-block">
          <span>Recommended next step</span>
          <strong>${escapeHtml(result.nextStep)}</strong>
        </div>
        <div class="scenario-deltas">
          <div>
            <span>Year-one liquidity</span>
            <strong>${formatSignedCurrency(result.shortTermLiquidityDelta)}</strong>
          </div>
          <div>
            <span>Cash runway</span>
            <strong>${formatMonths(result.scenarioPath.runwayMonths)}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>${result.confidence.score}/100</strong>
          </div>
        </div>
      </article>
    </section>
  `;
}
