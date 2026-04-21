import { escapeHtml, formatCurrency, formatMonths, formatPercent } from "../utils/formatters.js";

function renderMetricCards(metrics) {
  const cards = [
    { label: "Net worth", value: formatCurrency(metrics.currentNetWorth), detail: "Assets less liabilities" },
    { label: "Liquid cushion", value: formatCurrency(metrics.liquidAssets), detail: `${formatMonths(metrics.runwayMonths)} runway` },
    { label: "Monthly flex cash", value: formatCurrency(metrics.monthlyFreeCash), detail: "After planned savings" },
    { label: "Savings rate", value: formatPercent(metrics.savingsRate, 0), detail: "Current contribution mix" }
  ];

  return cards
    .map(
      (card) => `
        <article class="metric-card surface-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <small>${card.detail}</small>
        </article>
      `
    )
    .join("");
}

function renderAllocationRows(entries, total, key) {
  return entries
    .map((entry) => {
      const value = entry[key];
      const width = Math.max((value / total) * 100, 6);
      return `
        <div class="allocation-row">
          <div class="allocation-row-copy">
            <span>${escapeHtml(entry.label)}</span>
            <strong>${formatCurrency(value)}</strong>
          </div>
          <div class="allocation-track"><i style="width:${width}%"></i></div>
        </div>
      `;
    })
    .join("");
}

export function renderDashboard(profile, metrics) {
  const totalIncome = metrics.monthlyIncome;
  const fixedShare = metrics.fixedCosts / totalIncome;
  const variableShare = metrics.variableCosts / totalIncome;
  const contributionShare = metrics.contributions / totalIncome;
  const flexShare = metrics.monthlyFreeCash / totalIncome;

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h2>Financial snapshot</h2>
        </div>
        <p>${escapeHtml(profile.user.name)} • ${escapeHtml(profile.user.archetype)}</p>
      </div>
      <div class="metric-grid">
        ${renderMetricCards(metrics)}
      </div>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Balance sheet</p>
            <h3>Assets</h3>
          </div>
          <strong>${formatCurrency(metrics.totalAssets)}</strong>
        </div>
        <div class="allocation-list">
          ${renderAllocationRows(profile.assets, metrics.totalAssets, "value")}
        </div>
      </article>
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Obligations</p>
            <h3>Liabilities</h3>
          </div>
          <strong>${formatCurrency(metrics.totalLiabilities)}</strong>
        </div>
        <div class="allocation-list liabilities">
          ${renderAllocationRows(profile.liabilities, metrics.totalLiabilities, "balance")}
        </div>
      </article>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Cash flow</p>
            <h3>Monthly flow breakdown</h3>
          </div>
          <strong>${formatCurrency(metrics.monthlyIncome)}</strong>
        </div>
        <div class="flow-stack">
          <div class="flow-bar">
            <span>Fixed outflows</span>
            <div><i style="width:${fixedShare * 100}%"></i></div>
            <strong>${formatCurrency(metrics.fixedCosts)}</strong>
          </div>
          <div class="flow-bar">
            <span>Variable spend</span>
            <div><i style="width:${variableShare * 100}%"></i></div>
            <strong>${formatCurrency(metrics.variableCosts)}</strong>
          </div>
          <div class="flow-bar">
            <span>Planned savings</span>
            <div><i style="width:${contributionShare * 100}%"></i></div>
            <strong>${formatCurrency(metrics.contributions)}</strong>
          </div>
          <div class="flow-bar positive">
            <span>Remaining flex cash</span>
            <div><i style="width:${flexShare * 100}%"></i></div>
            <strong>${formatCurrency(metrics.monthlyFreeCash)}</strong>
          </div>
        </div>
      </article>
      <article class="surface-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Financial health</p>
            <h3>Resilience summary</h3>
          </div>
          <strong>${metrics.healthScore}/100</strong>
        </div>
        <div class="health-grid">
          <div class="health-tile">
            <span>Runway</span>
            <strong>${formatMonths(metrics.runwayMonths)}</strong>
          </div>
          <div class="health-tile">
            <span>Leverage</span>
            <strong>${formatPercent(1 - metrics.leverageRatio, 0)}</strong>
          </div>
          <div class="health-tile">
            <span>Savings rate</span>
            <strong>${formatPercent(metrics.savingsRate, 0)}</strong>
          </div>
          <div class="health-tile">
            <span>Debt payment load</span>
            <strong>${formatCurrency(metrics.debtPayment)}</strong>
          </div>
        </div>
        <div class="signal-list">
          ${profile.healthSignals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}
        </div>
      </article>
    </section>
  `;
}
