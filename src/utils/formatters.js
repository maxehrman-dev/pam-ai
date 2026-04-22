export function formatCurrency(value, options = {}) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    notation: options.compact ? "compact" : "standard"
  });
  return formatter.format(value);
}

export function formatCompactCurrency(value) {
  return formatCurrency(value, { compact: true, maximumFractionDigits: 1 });
}

export function formatSignedCurrency(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)}`;
}

export function formatPercent(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMonths(value) {
  return `${value.toFixed(1)} mo`;
}

export function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function formatSignedNumber(value, digits = 1) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
