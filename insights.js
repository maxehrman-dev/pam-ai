import { escapeHtml } from "../utils/formatters.js";

export function renderInsights(insights) {
  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Insights</p>
          <h2>Warnings, opportunities, and smarter levers</h2>
        </div>
        <p>If you change X, you can improve Y. That is the product habit PAM AI is meant to create.</p>
      </div>
      <div class="insights-grid">
        ${insights
          .map(
            (insight) => `
              <article class="insight-card surface-card">
                <span class="insight-kind">${escapeHtml(insight.kind)}</span>
                <h3>${escapeHtml(insight.title)}</h3>
                <p>${escapeHtml(insight.body)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
