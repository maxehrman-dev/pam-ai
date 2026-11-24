import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatchers, termify } from '../js/glossary.js';

const terms = [
  { id: 'roe', term: 'Roe v. Wade', match: ['Roe v. Wade', 'Roe'], definition: 'd' },
  { id: 'aca', term: 'ACA', match: ['ACA'], definition: 'd' },
  { id: 'tcja', term: '2017 tax cuts', match: ['2017 tax cuts'], definition: 'd' },
];
const m = buildMatchers(terms);
const ids = (html) => [...html.matchAll(/data-term="([^"]+)"[^>]*>([^<]+)</g)].map((x) => `${x[1]}:${x[2]}`);

test('longest phrase wins and each term is wrapped once', () => {
  assert.deepEqual(ids(termify('Overturn Roe v. Wade; Roe was 1973.', m)), ['roe:Roe v. Wade']);
  assert.deepEqual(ids(termify('Restore Roe and keep the 2017 tax cuts.', m)), ['roe:Roe', 'tcja:2017 tax cuts']);
});

test('only whole words match, and hyphens count as boundaries', () => {
  assert.deepEqual(ids(termify('PACAS and Roebuck', m)), []);
  assert.deepEqual(ids(termify('cheaper non-ACA plans', m)), ['aca:ACA']);
});

test('text is escaped', () => {
  assert.equal(termify('<b>&', m), '&lt;b&gt;&amp;');
});

test('glossary file is well formed and every term appears somewhere in the content', () => {
  const g = JSON.parse(readFileSync(new URL('../data/glossary.json', import.meta.url))).terms;
  const issues = readFileSync(new URL('../data/issues.json', import.meta.url), 'utf8');
  const cands = readFileSync(new URL('../data/candidates.json', import.meta.url), 'utf8');
  const seen = new Set();
  for (const t of g) {
    assert.ok(t.id && t.term && t.definition && t.match.length, t.id);
    assert.ok(!seen.has(t.id), `duplicate ${t.id}`);
    seen.add(t.id);
    assert.ok(t.match.some((p) => issues.includes(p) || cands.includes(p)), `${t.id} never appears in the content`);
  }
});
