// Glossary matching. Pure functions: no DOM.

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function validTerms(terms) {
  return Array.isArray(terms) ? terms.filter((t) => t && t.id && t.term && t.definition && Array.isArray(t.match)) : [];
}

/** Every phrase to look for, longest first so "Roe v. Wade" wins over "Roe". */
export function buildMatchers(terms) {
  return validTerms(terms)
    .flatMap((t) => t.match.map((pattern) => ({ pattern, id: t.id })))
    .sort((a, b) => b.pattern.length - a.pattern.length);
}

const isWordChar = (c) => /[A-Za-z0-9]/.test(c || '');

/**
 * Escapes `text` and wraps the first whole-word mention of each term in a toggle button.
 * Matching is case-sensitive; overlapping matches are skipped.
 */
export function termify(text, matchers) {
  const t = String(text ?? '');
  if (!matchers || !matchers.length) return esc(t);
  const hits = [];
  const used = new Set();
  for (const { pattern, id } of matchers) {
    if (used.has(id)) continue;
    for (let i = t.indexOf(pattern); i !== -1; i = t.indexOf(pattern, i + 1)) {
      const end = i + pattern.length;
      if (isWordChar(t[i - 1]) || isWordChar(t[end])) continue;
      if (hits.some((h) => i < h.end && end > h.start)) continue;
      hits.push({ start: i, end, id });
      used.add(id);
      break;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const h of hits) {
    out += `${esc(t.slice(pos, h.start))}<button type="button" class="term" data-term="${esc(h.id)}" aria-expanded="false" aria-controls="term-card">${esc(t.slice(h.start, h.end))}</button>`;
    pos = h.end;
  }
  return out + esc(t.slice(pos));
}
