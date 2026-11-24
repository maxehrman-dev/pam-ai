import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreCandidate, rankCandidates, matchLevel, issueMatch } from '../js/scoring.js';

const issues = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const cand = (id, a, b, c) => ({ id, name: id, positions: { a: { value: a }, b: { value: b }, c: { value: c } } });

test('per-issue match follows 1 - |u - c| / 4', () => {
  assert.equal(issueMatch(2, 2), 1);
  assert.equal(issueMatch(0, 1), 0.75);
  assert.equal(issueMatch(0, 2), 0.5);
  assert.equal(issueMatch(4, 0), 0);
  assert.equal(issueMatch(null, 2), null);
  assert.equal(issueMatch(2, null), null);
});

test('match levels', () => {
  assert.equal(matchLevel(1, 1), 'Agree');
  assert.equal(matchLevel(1, 2), 'Partial');
  assert.equal(matchLevel(1, 3), 'Disagree');
  assert.equal(matchLevel(1, null), 'Unknown');
  assert.equal(matchLevel(null, 1), 'Skipped');
});

test('weighted alignment matches the methodology example (88%)', () => {
  const answers = { a: { value: 2, importance: 3 }, b: { value: 0, importance: 1 } };
  const r = scoreCandidate(answers, cand('x', 2, 2, 4), issues);
  assert.equal(r.alignment, 88);
  assert.equal(r.scored, 2);
  assert.equal(r.answered, 2);
});

test('skipped and unknown issues are excluded and counted', () => {
  const answers = { a: { value: 1, importance: 2 }, b: { value: null, importance: 2 }, c: { value: 3, importance: 2 } };
  const r = scoreCandidate(answers, cand('x', 1, 2, null), issues);
  assert.equal(r.scored, 1);
  assert.equal(r.answered, 2);
  assert.equal(r.alignment, 100);
  assert.equal(r.counts.Unknown, 1);
  assert.equal(r.counts.Skipped, 1);
});

test('dealbreaker flag requires dealbreaker importance and a gap of 2+', () => {
  const answers = { a: { value: 0, importance: 4 }, b: { value: 0, importance: 4 }, c: { value: 0, importance: 3 } };
  const r = scoreCandidate(answers, cand('x', 1, 2, 4), issues);
  assert.deepEqual(r.dealbreakers, ['b']);
});

test('no overlap yields a null alignment, ranked last', () => {
  const answers = { a: { value: 0, importance: 2 } };
  const ranked = rankCandidates(answers, [cand('none', null, 1, 1), cand('far', 4, 1, 1), cand('near', 0, 1, 1)], issues);
  assert.deepEqual(ranked.map((e) => e.candidate.id), ['near', 'far', 'none']);
  assert.equal(ranked[2].result.alignment, null);
});

test('range shows how far unknown positions could move the score', () => {
  // a: agree (w2, match 1). c: unknown (w2). b: skipped.
  const answers = { a: { value: 1, importance: 2 }, b: { value: null, importance: 2 }, c: { value: 3, importance: 2 } };
  const r = scoreCandidate(answers, cand('x', 1, 2, null), issues);
  assert.equal(r.alignment, 100);
  assert.deepEqual(r.range, { low: 50, high: 100 });
  const full = scoreCandidate(answers, cand('y', 1, 2, 3), issues);
  assert.equal(full.range, null);
});

test('coverage sort puts better-documented candidates first', () => {
  const answers = { a: { value: 0, importance: 2 }, b: { value: 0, importance: 2 } };
  const ranked = rankCandidates(answers, [cand('sparse', 0, null, 0), cand('full', 1, 1, 0)], issues, 'coverage');
  assert.deepEqual(ranked.map((e) => e.candidate.id), ['full', 'sparse']);
});

test('ties break on coverage', () => {
  const answers = { a: { value: 0, importance: 2 }, b: { value: 0, importance: 2 } };
  const ranked = rankCandidates(answers, [cand('one', 0, null, 0), cand('two', 0, 0, 0)], issues);
  assert.equal(ranked[0].candidate.id, 'two');
});

test('seed data is well formed', () => {
  const issuesData = JSON.parse(readFileSync(new URL('../data/issues.json', import.meta.url)));
  const data = JSON.parse(readFileSync(new URL('../data/candidates.json', import.meta.url)));
  const ids = issuesData.issues.map((i) => i.id);
  assert.equal(ids.length, 14);
  for (const issue of issuesData.issues) {
    assert.deepEqual(issue.positions.map((p) => p.value), [0, 1, 2, 3, 4], issue.id);
    assert.ok(issue.background.length >= 2 && issue.background.length <= 3, issue.id);
  }
  const statuses = new Set(data.meta.status_values);
  const provenance = new Set(data.meta.provenance_values);
  const parties = new Set();
  assert.equal(data.candidates.length, 21);
  for (const c of data.candidates) {
    parties.add(c.party);
    assert.ok(statuses.has(c.status), `${c.id} status`);
    assert.match(c.status_date, /^\d{4}(-\d{2}){0,2}$/, `${c.id} status_date`);
    assert.match(c.birth_date, /^\d{4}-\d{2}-\d{2}$/, `${c.id} birth_date`);
    assert.deepEqual(Object.keys(c.positions).sort(), ids.slice().sort(), `${c.id} positions`);
    for (const [issue, p] of Object.entries(c.positions)) {
      assert.equal(p.needs_verification, true, `${c.id}.${issue} must be flagged until reviewed`);
      assert.ok(typeof p.summary === 'string' && p.summary.length > 10, `${c.id}.${issue} summary`);
      if (p.value !== null) {
        assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 4, `${c.id}.${issue} value`);
        assert.match(p.source_url, /^https:\/\//, `${c.id}.${issue} source_url`);
        assert.match(p.source_date, /^\d{4}(-\d{2}){0,2}$/, `${c.id}.${issue} source_date`);
        assert.ok(provenance.has(p.provenance), `${c.id}.${issue} provenance`);
      }
    }
  }
  assert.deepEqual([...parties].sort(), ['Democratic', 'Republican']);
});
