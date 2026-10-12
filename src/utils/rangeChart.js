// Fan chart for a Monte Carlo series: shaded band between the rough (p10) and
// strong (p90) paths, typical (p50) line on top. Plain SVG string, colored via
// CSS classes so it follows light/dark tokens. Only ever drawn from engine
// output — never from made-up history.

import { escapeHtml, formatCompactCurrency } from "./formatters.js";

const WIDTH = 560;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 30, left: 56 };

function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((candidate) => candidate * magnitude >= value) || 10;
  return step * magnitude;
}

function xLabel(month, startAge) {
  const years = Math.round(month / 12);
  if (startAge) return `Age ${Math.round(startAge + month / 12)}`;
  return years === 0 ? "Now" : `Year ${years}`;
}

export function renderRangeChartSvg({ series, startAge = null, goalAmount = null, caption = "" } = {}) {
  if (!Array.isArray(series) || series.length < 2) return "";
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const lastMonth = series[series.length - 1].month || 1;
  const maxValue = niceCeiling(Math.max(...series.map((point) => point.high), goalAmount || 0));

  const x = (month) => PAD.left + (month / lastMonth) * plotWidth;
  const y = (value) => PAD.top + plotHeight - (Math.max(value, 0) / maxValue) * plotHeight;
  const toPath = (points) => points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");

  const upper = series.map((point) => [x(point.month), y(point.high)]);
  const lower = series.map((point) => [x(point.month), y(point.low)]).reverse();
  const band = `${toPath(upper)} ${lower.map((point) => `L${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ")} Z`;
  const typical = toPath(series.map((point) => [x(point.month), y(point.typical)]));

  const gridValues = [maxValue / 2, maxValue];
  const midIndex = Math.floor((series.length - 1) / 2);
  const ticks = [series[0], series[midIndex], series[series.length - 1]];
  const last = series[series.length - 1];
  const summary = `Range of outcomes: by ${xLabel(last.month, startAge).toLowerCase()}, rough markets about ${formatCompactCurrency(last.low)}, typical about ${formatCompactCurrency(last.typical)}, strong markets about ${formatCompactCurrency(last.high)}.`;

  return `
    <figure class="range-chart">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="xMidYMid meet">
        <line class="range-chart-axis" x1="${PAD.left}" y1="${PAD.top + plotHeight}" x2="${WIDTH - PAD.right}" y2="${PAD.top + plotHeight}" />
        ${gridValues.map((value) => `
          <line class="range-chart-grid" x1="${PAD.left}" y1="${y(value).toFixed(1)}" x2="${WIDTH - PAD.right}" y2="${y(value).toFixed(1)}" />
          <text class="range-chart-label" x="${PAD.left - 8}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatCompactCurrency(value))}</text>
        `).join("")}
        <path class="range-chart-band" d="${band}" />
        ${goalAmount ? `
          <line class="range-chart-goal" x1="${PAD.left}" y1="${y(goalAmount).toFixed(1)}" x2="${WIDTH - PAD.right}" y2="${y(goalAmount).toFixed(1)}" />
          <text class="range-chart-label range-chart-goal-label" x="${WIDTH - PAD.right}" y="${(y(goalAmount) - 6).toFixed(1)}" text-anchor="end">Goal ${escapeHtml(formatCompactCurrency(goalAmount))}</text>
        ` : ""}
        <path class="range-chart-typical" d="${typical}" />
        <circle class="range-chart-dot" cx="${x(last.month).toFixed(1)}" cy="${y(last.typical).toFixed(1)}" r="4" />
        ${ticks.map((point, index) => `
          <text class="range-chart-label" x="${x(point.month).toFixed(1)}" y="${HEIGHT - 8}" text-anchor="${index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}">${escapeHtml(xLabel(point.month, startAge))}</text>
        `).join("")}
      </svg>
      <figcaption class="range-chart-legend">
        <span><i class="range-chart-key range-chart-key-band"></i>1 in 10 to 9 in 10 markets</span>
        <span><i class="range-chart-key range-chart-key-line"></i>Typical</span>
        ${caption ? `<span class="range-chart-caption">${escapeHtml(caption)}</span>` : ""}
      </figcaption>
    </figure>
  `;
}
