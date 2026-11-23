import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeName, buildSnapshot } from '../scripts/fetch-markets.mjs';

test('market names normalize across punctuation and accents', () => {
  assert.equal(normalizeName('J.B. Pritzker'), normalizeName('JB Pritzker'));
  assert.equal(normalizeName('Alexandria Ocasio-Cortez'), 'alexandria ocasiocortez');
  assert.equal(normalizeName('Rubén  Gallego'), 'ruben gallego');
});

test('snapshot matches candidates, splits nomination vs presidency, lists uncovered names', () => {
  const candidates = [{ id: 'a', name: 'Ann Able' }, { id: 'b', name: 'B.C. Doe', market_name: 'Bee Doe' }];
  const ev = (t, s) => ({ event_ticker: t, series_ticker: s, title: t });
  const mk = (name, last, status = 'active') => ({ ticker: `T-${name}`, yes_sub_title: name, last_price_dollars: String(last), yes_bid_dollars: '0.1', yes_ask_dollars: '0.2', status });
  const snap = buildSnapshot(candidates, {
    nomination_republican: { event: ev('R-28', 'KXR'), markets: [mk('Ann Able', 0.3), mk('Zed Other', 0.05), mk('Tiny Other', 0.01)] },
    presidency: { event: ev('P-28', 'KXP'), markets: [mk('Ann Able', 0.12), mk('Bee Doe', 0.04), mk('Closed Person', 0.5, 'settled')] },
  }, '2026-11-23T00:00:00Z');
  assert.equal(snap.candidates.a.nomination.last, 0.3);
  assert.equal(snap.candidates.a.presidency.last, 0.12);
  assert.equal(snap.candidates.b.presidency.last, 0.04);
  assert.deepEqual(snap.uncovered.map((u) => u.name), ['Zed Other']);
  assert.equal(snap.events.presidency.url, 'https://kalshi.com/markets/kxp');
});

test('committed snapshot only references known candidates', () => {
  const data = JSON.parse(readFileSync(new URL('../data/candidates.json', import.meta.url)));
  const markets = JSON.parse(readFileSync(new URL('../data/markets.json', import.meta.url)));
  const ids = new Set(data.candidates.map((c) => c.id));
  assert.ok(!Number.isNaN(Date.parse(markets.fetched_at)));
  for (const [id, entry] of Object.entries(markets.candidates)) {
    assert.ok(ids.has(id), id);
    for (const e of Object.values(entry)) assert.ok(e.last === null || (e.last >= 0 && e.last <= 1), id);
  }
  for (const c of data.candidates) {
    assert.ok(c.links && 'official_url' in c.links && 'campaign_url' in c.links, `${c.id} links`);
    if (c.links.official_url) assert.match(c.links.official_url, /^https:\/\//);
  }
});
