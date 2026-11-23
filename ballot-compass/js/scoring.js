// Ballot Compass scoring. Pure functions only: no DOM, no storage.
//
// Per-issue match  = 1 - |user - candidate| / 4         (0..1)
// Issue weight     = Low 1, Medium 2, High 3, Dealbreaker 4
// Alignment        = sum(weight * match) / sum(weight)   over scored issues
// Scored issues    = issues the user answered AND the candidate has a known position.
// Dealbreaker flag = importance is Dealbreaker AND the gap is 2 or more.

export const IMPORTANCE = Object.freeze([
  { value: 1, key: 'low', label: 'Low' },
  { value: 2, key: 'medium', label: 'Medium' },
  { value: 3, key: 'high', label: 'High' },
  { value: 4, key: 'dealbreaker', label: 'Dealbreaker' },
]);

export const DEFAULT_IMPORTANCE = 2;
export const DEALBREAKER = 4;
export const DEALBREAKER_GAP = 2;

export function importanceLabel(weight) {
  const found = IMPORTANCE.find((i) => i.value === weight);
  return found ? found.label : 'Medium';
}

export function isValidValue(v) {
  return Number.isInteger(v) && v >= 0 && v <= 4;
}

/** 'Agree' (gap 0), 'Partial' (gap 1), 'Disagree' (gap 2+), 'Unknown' (no candidate position), 'Skipped'. */
export function matchLevel(userValue, candidateValue) {
  if (!isValidValue(userValue)) return 'Skipped';
  if (!isValidValue(candidateValue)) return 'Unknown';
  const gap = Math.abs(userValue - candidateValue);
  if (gap === 0) return 'Agree';
  if (gap === 1) return 'Partial';
  return 'Disagree';
}

export function issueMatch(userValue, candidateValue) {
  if (!isValidValue(userValue) || !isValidValue(candidateValue)) return null;
  return 1 - Math.abs(userValue - candidateValue) / 4;
}

/**
 * @param {Record<string, {value: number|null, importance: number}>} answers
 * @param {{positions: Record<string, {value: number|null}>}} candidate
 * @param {Array<{id: string}>} issues
 */
export function scoreCandidate(answers, candidate, issues) {
  const rows = [];
  let weighted = 0;
  let totalWeight = 0;
  let answered = 0;
  const counts = { Agree: 0, Partial: 0, Disagree: 0, Unknown: 0, Skipped: 0 };

  for (const issue of issues) {
    const answer = answers[issue.id];
    const userValue = answer && isValidValue(answer.value) ? answer.value : null;
    const weight = answer && IMPORTANCE.some((i) => i.value === answer.importance)
      ? answer.importance
      : DEFAULT_IMPORTANCE;
    const pos = candidate.positions ? candidate.positions[issue.id] : undefined;
    const candValue = pos && isValidValue(pos.value) ? pos.value : null;
    const level = matchLevel(userValue, candValue);
    const match = issueMatch(userValue, candValue);
    const gap = match === null ? null : Math.abs(userValue - candValue);
    const dealbreaker = userValue !== null && weight === DEALBREAKER && gap !== null && gap >= DEALBREAKER_GAP;

    if (userValue !== null) answered += 1;
    counts[level] += 1;
    if (match !== null) {
      weighted += weight * match;
      totalWeight += weight;
    }
    rows.push({ issueId: issue.id, userValue, candidateValue: candValue, weight, level, match, gap, dealbreaker });
  }

  const scored = rows.filter((r) => r.match !== null).length;
  const alignment = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : null;

  return {
    candidateId: candidate.id,
    alignment,
    scored,
    answered,
    counts,
    dealbreakers: rows.filter((r) => r.dealbreaker).map((r) => r.issueId),
    rows,
  };
}

/** Rank by alignment (desc), then coverage (desc), then name. Candidates with no scored issues go last. */
export function rankCandidates(answers, candidates, issues) {
  return candidates
    .map((c) => ({ candidate: c, result: scoreCandidate(answers, c, issues) }))
    .sort((a, b) => {
      const aa = a.result.alignment;
      const ba = b.result.alignment;
      if (aa === null && ba !== null) return 1;
      if (ba === null && aa !== null) return -1;
      if (aa !== ba) return (ba ?? 0) - (aa ?? 0);
      if (a.result.scored !== b.result.scored) return b.result.scored - a.result.scored;
      return a.candidate.name.localeCompare(b.candidate.name);
    });
}

export function countAnswered(answers, issues) {
  return issues.filter((i) => answers[i.id] && isValidValue(answers[i.id].value)).length;
}
