import { escapeHtml, formatCompactCurrency, formatCurrency } from "../utils/formatters.js";

function renderDemoSnapshot(metrics, session) {
  const result = session.result;
  const mostImpactedGoal = result.goalsSummary.mostImpactedGoal;

  return `
    <article class="surface-panel live-demo-panel">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Live demo</p>
          <h3>${escapeHtml(result.scenario.title)}</h3>
        </div>
        <span class="pill">${escapeHtml(result.risk.label)} risk</span>
      </div>
      <div class="demo-stat-grid">
        <div class="demo-stat-card">
          <span>Monthly buffer</span>
          <strong>${formatCurrency(result.scenarioPath.monthlyFreeCash)}</strong>
        </div>
        <div class="demo-stat-card">
          <span>Cash runway</span>
          <strong>${result.scenarioPath.runwayMonths.toFixed(1)} mo</strong>
        </div>
        <div class="demo-stat-card">
          <span>5Y net worth</span>
          <strong>${formatCompactCurrency(result.scenarioPath.projectedNetWorth)}</strong>
        </div>
        <div class="demo-stat-card">
          <span>Health score</span>
          <strong>${result.scenarioPath.healthScore}/100</strong>
        </div>
      </div>
      <div class="demo-aha-card">
        <span>Aha moment</span>
        <strong>${escapeHtml(result.ahaMoment)}</strong>
      </div>
      <div class="demo-comparison-strip">
        <div>
          <span>Current path</span>
          <strong>${formatCurrency(result.currentPath.monthlyFreeCash)}</strong>
        </div>
        <div>
          <span>Scenario path</span>
          <strong>${formatCurrency(result.scenarioPath.monthlyFreeCash)}</strong>
        </div>
        <div>
          <span>Most impacted goal</span>
          <strong>${escapeHtml(mostImpactedGoal?.title || "No major delay")}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderAccountCard(accountState, profileSource, trustState) {
  return `
    <article class="surface-panel hero-account-panel">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Account layer</p>
          <h3>${accountState.isCreated ? "Profile ready for personalization" : "Create an account to save your model"}</h3>
        </div>
      </div>
      <p class="hero-subtitle compact">
        PAM should feel secure, personal, and immediately usable. Start with the simulator, then save the profile behind it.
      </p>
      <div class="hero-proof-grid">
        <div class="hero-proof-card surface-card">
          <span>Profile source</span>
          <strong>${escapeHtml(profileSource.status)}</strong>
          <small>${escapeHtml(profileSource.label)}</small>
        </div>
        <div class="hero-proof-card surface-card">
          <span>Account security</span>
          <strong>${trustState.security.twoFactorEnabled ? "2FA active" : "2FA off"}</strong>
          <small>${escapeHtml(trustState.security.twoFactorMethod)}</small>
        </div>
        <div class="hero-proof-card surface-card">
          <span>Plaid</span>
          <strong>${accountState.plaidLinked ? "Sandbox linked" : "Ready to connect"}</strong>
          <small>${escapeHtml(accountState.plaidInstitution)}</small>
        </div>
      </div>
      <div class="hero-cta-row">
        <button class="button button-primary" type="button" data-open-tab="account">Create account</button>
        <button class="button button-secondary" type="button" data-open-tab="trust">Review security</button>
      </div>
    </article>
  `;
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
          <span class="scenario-chip">Scenario</span>
          <h3>${escapeHtml(example.title)}</h3>
          <p class="example-prompt">${escapeHtml(example.prompt)}</p>
          <div class="example-metrics">
            <div>
              <span>Monthly buffer</span>
              <strong>${formatCurrency(example.monthlyBufferBefore)} -> ${formatCurrency(example.monthlyBufferAfter)}</strong>
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
          <span class="link-arrow">Run in simulator</span>
        </button>
      `
    )
    .join("");
}

export function renderLanding({ metrics, session, goals, landingExamples, accountState, profileSource, trustState }) {
  return `
    <section class="hero-section" id="top">
      <div class="hero-copy">
        <p class="eyebrow">PAM AI • Personal Asset Manager</p>
        <h1>Test your financial future before you live it.</h1>
        <p class="hero-subtitle">
          This homepage is the product demo. PAM starts with a structured decision, shows the numbers that move, and makes the goal tradeoff obvious before you commit.
        </p>
        <div class="hero-cta-row">
          <a class="button button-primary" href="#workspace">Try the live simulator</a>
          <button class="button button-secondary" type="button" data-open-tab="account">Create account</button>
        </div>
        <div class="hero-proof-grid">
          <div class="hero-proof-card surface-card">
            <span>Current net worth</span>
            <strong>${formatCompactCurrency(metrics.currentNetWorth)}</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>Liquid buffer</span>
            <strong>${formatCurrency(metrics.liquidAssets)}</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>Decision engine</span>
            <strong>Guided, not open-ended</strong>
          </div>
        </div>
      </div>
      <div class="hero-stack">
        ${renderDemoSnapshot(metrics, session)}
        ${renderAccountCard(accountState, profileSource, trustState)}
      </div>
    </section>

    <section class="showcase-section" id="showcase">
      <div class="section-heading">
        <p class="eyebrow">Why it feels different</p>
        <h2>The homepage behaves like the product, not a brochure</h2>
        <p>You can start with a vague life decision, customize the assumptions, create an account, and see what happens to your goals without leaving the page.</p>
      </div>
      <div class="showcase-grid">
        <article class="surface-panel showcase-copy">
          <h3>Decisions first</h3>
          <p>PAM is not a ledger with a chatbot bolted on. It is a what-if engine for cars, apartments, layoffs, emergencies, investing, and the goals that decision touches.</p>
          <div class="showcase-bullets">
            <p>Starter chips remove prompt anxiety.</p>
            <p>One clarifying question keeps vague inputs moving.</p>
            <p>The answer is specific enough to act on.</p>
          </div>
        </article>
        <article class="surface-panel goals-preview-panel">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Life goals</p>
              <h3>Every scenario moves a timeline</h3>
            </div>
          </div>
          <div class="goal-preview-grid">
            ${renderGoalPreview(goals)}
          </div>
        </article>
      </div>
    </section>

    <section class="examples-section" id="examples">
      <div class="section-heading">
        <p class="eyebrow">Scenario examples</p>
        <h2>See the output before you type anything</h2>
        <p>Each card is a believable scenario with a visible consequence: buffer change, goal delay, and risk level.</p>
      </div>
      <div class="examples-grid">
        ${renderExamples(landingExamples)}
      </div>
    </section>
  `;
}
