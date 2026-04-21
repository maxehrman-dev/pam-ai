import { escapeHtml, formatCurrency } from "../utils/formatters.js";

function renderGoalCards(goals, scenarioGoals) {
  return goals
    .map((goal) => {
      const scenarioGoal = scenarioGoals.find((item) => item.id === goal.id) || goal;
      const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
      const scenarioProgress = Math.min((scenarioGoal.scenarioCurrentAmount / goal.targetAmount) * 100, 100);
      const delay =
        Number.isFinite(scenarioGoal.deltaMonths) && scenarioGoal.deltaMonths > 0
          ? `${Math.round(scenarioGoal.deltaMonths)} mo`
          : "On track";

      return `
        <article class="goal-card surface-card">
          <div class="goal-card-header">
            <div>
              <span class="eyebrow">${escapeHtml(goal.category)}</span>
              <h3>${escapeHtml(goal.title)}</h3>
            </div>
            <span class="goal-priority">${escapeHtml(goal.priority)}</span>
          </div>
          <div class="goal-amount-row">
            <span>${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}</span>
            <strong>${delay}</strong>
          </div>
          <div class="goal-stack">
            <div class="goal-stack-row">
              <span>Current path</span>
              <div class="goal-stack-track"><i style="width:${progress}%"></i></div>
              <small>${escapeHtml(scenarioGoal.baselineDateLabel || "In progress")}</small>
            </div>
            <div class="goal-stack-row">
              <span>Scenario path</span>
              <div class="goal-stack-track scenario"><i style="width:${scenarioProgress}%"></i></div>
              <small>${escapeHtml(scenarioGoal.scenarioDateLabel || "In progress")}</small>
            </div>
          </div>
          <div class="goal-card-footer">
            <span>Monthly funding</span>
            <strong>${formatCurrency(goal.monthlyContribution)} -> ${formatCurrency(scenarioGoal.scenarioMonthlyContribution || goal.monthlyContribution)}</strong>
          </div>
          <button class="goal-remove-button" type="button" data-remove-goal-id="${escapeHtml(goal.id)}">Remove</button>
        </article>
      `;
    })
    .join("");
}

function renderTemplateButtons(templates) {
  return templates
    .map(
      (template) => `
        <button class="template-chip" type="button" data-goal-template="${escapeHtml(template.id)}">
          ${escapeHtml(template.title)}
        </button>
      `
    )
    .join("");
}

export function renderGoals(goals, session, goalTemplates) {
  const scenarioGoals = session.result.goalsSummary.goals;
  const onTrackCount = scenarioGoals.filter((goal) => goal.status === "On track").length;
  const atRiskCount = scenarioGoals.filter((goal) => goal.status === "At risk" || goal.status === "Off track").length;
  const monthlyFunding = goals.reduce((total, goal) => total + Number(goal.monthlyContribution || 0), 0);

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Life Goals</p>
          <h2>Watch decisions reshape the timelines that matter</h2>
        </div>
        <p>The goal system is the scoreboard. Every scenario updates these timelines in real time.</p>
      </div>

      <div class="metric-grid goals-metric-grid">
        <article class="metric-card surface-card">
          <span>Goals tracked</span>
          <strong>${goals.length}</strong>
          <small>${onTrackCount} still on track</small>
        </article>
        <article class="metric-card surface-card">
          <span>Monthly goal funding</span>
          <strong>${formatCurrency(monthlyFunding)}</strong>
          <small>Current recurring allocation</small>
        </article>
        <article class="metric-card surface-card">
          <span>Most impacted</span>
          <strong>${escapeHtml(session.result.goalsSummary.mostImpactedGoal?.title || "None")}</strong>
          <small>${atRiskCount} goals at risk under current scenario</small>
        </article>
      </div>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Goal board</p>
            <h3>Current path vs scenario path</h3>
          </div>
        </div>
        <div class="goal-card-grid">
          ${renderGoalCards(goals, scenarioGoals)}
        </div>
      </article>

      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Add a goal</p>
            <h3>Make the product feel like your actual life plan</h3>
          </div>
        </div>
        <p class="goal-builder-copy">Quick-add a common goal or define your own target amount, timeline, and priority.</p>
        <div class="template-chip-row">
          ${renderTemplateButtons(goalTemplates)}
        </div>
        <form class="goal-form" data-goal-form>
          <label class="builder-field">
            <span>Goal title</span>
            <input type="text" name="title" placeholder="Save for a home office" required />
          </label>
          <label class="builder-field">
            <span>Target amount</span>
            <input type="number" name="targetAmount" min="1000" step="100" value="15000" required />
          </label>
          <label class="builder-field">
            <span>Current saved</span>
            <input type="number" name="currentAmount" min="0" step="100" value="0" />
          </label>
          <label class="builder-field">
            <span>Monthly contribution</span>
            <input type="number" name="monthlyContribution" min="0" step="25" value="250" required />
          </label>
          <label class="builder-field">
            <span>Priority</span>
            <select name="priority">
              <option value="high">High</option>
              <option value="medium" selected>Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="builder-field">
            <span>Target timeline (months)</span>
            <input type="number" name="targetTimelineMonths" min="1" step="1" value="36" />
          </label>
          <label class="builder-field">
            <span>Funding source</span>
            <select name="fundingSource">
              <option value="cash">Cash</option>
              <option value="invest">Investments</option>
            </select>
          </label>
          <div class="button-row">
            <button class="button button-primary" type="submit">Add goal</button>
          </div>
        </form>
      </article>
    </section>
  `;
}
