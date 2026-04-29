import { escapeHtml, formatCompactCurrency, formatCurrency } from "../utils/formatters.js";

function renderDemoSnapshot(metrics, session) {
  const result = session.result;
  const mostImpactedGoal = result.goalsSummary.mostImpactedGoal;

  return `
    <article class="surface-panel live-demo-panel demo-footnote-card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Limited demo preview</p>
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
    <article class="surface-panel hero-account-panel plaid-signin-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Secure Plaid sign-in</p>
            <h3>${accountState.plaidLinked ? "Your connected profile is ready" : "Connect your financial picture first"}</h3>
          </div>
        </div>
        <p class="hero-subtitle compact">
          PAM starts with a Plaid connection so every scenario is built from normalized balances, liabilities, and cash-flow context instead of manual guesses.
        </p>
      <div class="hero-proof-grid">
        <div class="hero-proof-card surface-card">
          <span>Data source</span>
          <strong>${escapeHtml(profileSource.status)}</strong>
          <small>${escapeHtml(profileSource.label)}</small>
        </div>
        <div class="hero-proof-card surface-card">
          <span>Account protection</span>
          <strong>${trustState.security.twoFactorEnabled ? "2FA active" : "2FA off"}</strong>
          <small>${escapeHtml(trustState.security.twoFactorMethod)}</small>
        </div>
        <div class="hero-proof-card surface-card">
          <span>Plaid</span>
          <strong>${accountState.plaidLinked ? "Connected" : "Required"}</strong>
          <small>${escapeHtml(accountState.plaidInstitution)}</small>
        </div>
      </div>
        <div class="hero-cta-row">
        <button class="button button-primary" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}" data-plaid-complete>
          ${accountState.plaidLinked ? "Refresh Plaid data" : "Sign in with Plaid"}
        </button>
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
    <section class="hero-section plaid-first-hero" id="top">
      <div class="hero-copy">
        <p class="eyebrow">PAM AI • Plaid-powered decision modeling</p>
        <h1>Connect your money. Test the decision before you live it.</h1>
        <p class="hero-subtitle">
          PAM AI turns your connected financial picture into a secure what-if engine. Link with Plaid, then see how cars, rent, emergencies, investments, and life goals change your future path.
        </p>
        <div class="hero-cta-row">
          <button class="button button-primary button-plaid" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}" data-plaid-complete>
            ${accountState.plaidLinked ? "Refresh Plaid connection" : "Sign in with Plaid"}
          </button>
          <button class="button button-secondary" type="button" data-plaid-action="sandbox">
            Load Plaid sandbox data
          </button>
          <a class="button button-secondary" href="#workspace">View limited demo</a>
        </div>
        <div class="hero-proof-grid">
          <div class="hero-proof-card surface-card">
            <span>Connection</span>
            <strong>${accountState.plaidLinked ? "Plaid linked" : "Plaid required"}</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>Model input</span>
            <strong>Balances + cash flow</strong>
          </div>
          <div class="hero-proof-card surface-card">
            <span>Security posture</span>
            <strong>2FA + scoped data</strong>
          </div>
        </div>
        <p class="demo-footnote">
          Demo mode is only a preview. For testing, use Plaid sandbox credentials or load a First Platypus Bank mock profile instantly.
        </p>
      </div>
      <div class="hero-stack">
        ${renderAccountCard(accountState, profileSource, trustState)}
        ${renderDemoSnapshot(metrics, session)}
      </div>
    </section>

    <section class="showcase-section" id="showcase">
      <div class="section-heading">
        <p class="eyebrow">Why it feels different</p>
        <h2>The homepage asks for the one thing the product needs: a secure financial baseline</h2>
        <p>PAM should not ask users to type a fake budget. Plaid creates the account-backed snapshot, then the scenario engine does the work.</p>
      </div>
      <div class="showcase-grid">
        <article class="surface-panel showcase-copy">
          <h3>Plaid first, decisions second</h3>
          <p>PAM is not a ledger with a chatbot bolted on. It links financial context, normalizes it into a profile, then models the life decisions that actually matter.</p>
          <div class="showcase-bullets">
            <p>No manual budget setup before the product becomes useful.</p>
            <p>Connected balances and obligations shape every scenario.</p>
            <p>The answer ties back to cash runway and long-term goals.</p>
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
