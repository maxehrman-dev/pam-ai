#!/usr/bin/env node
// Snapshot Kalshi's public 2028 presidential markets into data/markets.json.
//
// Why a snapshot instead of a live call from the page:
//  - Ballot Compass promises no third-party requests from the reader's browser.
//  - Kalshi's API rejects browser-origin (CORS) requests and rate-limits callers.
// Run it whenever you want fresher prices:
//   node scripts/fetch-markets.mjs            (add NODE_USE_ENV_PROXY=1 behind a proxy)
// Read-only, public market data. No API key is used or needed.

import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.elections.kalshi.com/trade-api/v2';
const ROOT = new URL('../', import.meta.url);
const EVENTS = {
  nomination_republican: 'KXPRESNOMR-28',
  nomination_democratic: 'KXPRESNOMD-28',
  presidency: 'KXPRESPERSON-28',
};
// Names traded on Kalshi but not covered by Ballot Compass are listed when priced at or above this.
const UNCOVERED_MIN = 0.02;

export function normalizeName(name) {
  return String(name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function price(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path, attempt = 1) {
  await sleep(1500); // stay well inside Kalshi's public rate limit
  const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json', 'user-agent': 'ballot-compass-snapshot/0.1' } });
  if (res.status === 429 && attempt <= 8) {
    const reset = (Number(res.headers.get('x-ratelimit-reset')) || 0) * 1000;
    await sleep(Math.max(reset, Math.min(2 ** attempt * 1000, 30000)));
    return getJson(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Kalshi API ${res.status} for ${path}`);
  return res.json();
}

async function fetchEvent(ticker) {
  const { event } = await getJson(`/events/${encodeURIComponent(ticker)}`);
  const markets = [];
  let cursor = '';
  do {
    const page = await getJson(`/markets?event_ticker=${encodeURIComponent(ticker)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    markets.push(...(page.markets || []));
    cursor = page.cursor || '';
  } while (cursor);
  return { event, markets };
}

export function buildSnapshot(candidates, fetched, fetchedAt) {
  const byName = new Map(candidates.map((c) => [normalizeName(c.market_name || c.name), c.id]));
  const out = {
    source: 'Kalshi',
    source_url: 'https://kalshi.com',
    fetched_at: fetchedAt,
    note: 'Prices are the last traded price of a contract that pays $1 if the outcome happens. They reflect what traders were willing to pay at the time of the snapshot; they are not polls, endorsements or Ballot Compass forecasts, and they are never used in alignment scores.',
    events: {},
    candidates: {},
    uncovered: [],
  };
  for (const [key, { event, markets }] of Object.entries(fetched)) {
    out.events[key] = {
      ticker: event.event_ticker,
      title: event.title,
      url: `https://kalshi.com/markets/${String(event.series_ticker).toLowerCase()}`,
    };
    for (const m of markets) {
      if (m.status && !['active', 'open'].includes(m.status)) continue;
      const entry = {
        market_ticker: m.ticker,
        last: price(m.last_price_dollars),
        bid: price(m.yes_bid_dollars),
        ask: price(m.yes_ask_dollars),
      };
      const id = byName.get(normalizeName(m.yes_sub_title));
      if (id) {
        out.candidates[id] = out.candidates[id] || {};
        // Each candidate is only in their own party's nomination market.
        out.candidates[id][key === 'presidency' ? 'presidency' : 'nomination'] = entry;
      } else if (entry.last !== null && entry.last >= UNCOVERED_MIN) {
        out.uncovered.push({ name: m.yes_sub_title, market: key, last: entry.last });
      }
    }
  }
  out.uncovered.sort((a, b) => b.last - a.last || a.name.localeCompare(b.name));
  return out;
}

async function main() {
  const { candidates } = JSON.parse(await readFile(new URL('data/candidates.json', ROOT), 'utf8'));
  const fetched = {};
  for (const [key, ticker] of Object.entries(EVENTS)) fetched[key] = await fetchEvent(ticker);
  const snapshot = buildSnapshot(candidates, fetched, new Date().toISOString());
  await writeFile(new URL('data/markets.json', ROOT), `${JSON.stringify(snapshot, null, 2)}\n`);
  const missing = candidates.filter((c) => !snapshot.candidates[c.id]).map((c) => c.name);
  console.log(`Wrote data/markets.json: ${Object.keys(snapshot.candidates).length} of ${candidates.length} candidates matched.`);
  if (missing.length) console.log(`No Kalshi market found for: ${missing.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
