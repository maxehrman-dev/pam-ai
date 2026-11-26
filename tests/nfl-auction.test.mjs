import test from "node:test";
import assert from "node:assert/strict";
import { TEAMS, CURRENT, ALLTIME, POSITION_ORDER, teamEntries } from "../nfl-auction/data.mjs";
import {
  createGame, applyAction, maxBid, totalOpen, canTake, eligibleTeams, SLOTS, STARTING_BUDGET,
  eloUpdate, legacyTier, simGame, leagueTeam
} from "../nfl-auction/engine.mjs";

function playRandomDraft(mode, seed) {
  const state = createGame({ mode, players: [{ name: "A" }, { name: "B" }], seed });
  let guard = 0;
  let r = seed;
  const coin = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  while (state.phase === "draft" && guard++ < 2000) {
    const s = state.starter;
    if (state.step === "spin") {
      assert.equal(applyAction(state, { type: "spin" }, s).ok, true);
    } else if (state.step === "nominate") {
      const options = teamEntries(mode, state.team).filter((e) => canTake(state, s, e));
      assert.ok(options.length > 0, "spun team must have something the starter can take");
      const entry = options[Math.floor(coin() * options.length)];
      const bid = 1 + Math.floor(coin() * Math.min(4, maxBid(state.players[s])));
      assert.equal(applyAction(state, { type: "nominate", entryId: entry.id, bid }, s).ok, true);
    } else if (state.step === "bid") {
      const a = state.auction;
      const me = state.players[a.turn];
      if (coin() < 0.5 && maxBid(me) > a.high) {
        assert.equal(applyAction(state, { type: "raise", bid: a.high + 1 }, a.turn).ok, true);
      } else {
        assert.equal(applyAction(state, { type: "pass" }, a.turn).ok, true);
      }
    }
  }
  return state;
}

test("every team has a full pool in both modes", () => {
  assert.equal(TEAMS.length, 32);
  for (const data of [CURRENT, ALLTIME]) {
    for (const t of TEAMS) {
      const roster = data[t.id];
      assert.ok(roster, `missing ${t.id}`);
      for (const pos of POSITION_ORDER) assert.ok(roster[pos]?.length >= 1, `${t.id} missing ${pos}`);
      assert.ok(roster.WR.length >= 3, `${t.id} needs 3 WRs`);
      for (const pos of POSITION_ORDER) for (const [name, ovr] of roster[pos]) {
        assert.ok(name && ovr >= 50 && ovr <= 99, `${t.id} ${pos} ${name} ${ovr}`);
      }
    }
  }
});

test("mode must be chosen explicitly", () => {
  assert.throws(() => createGame({ mode: undefined, players: [{}, {}] }));
  assert.throws(() => createGame({ mode: "random", players: [{}, {}] }));
});

test("random drafts always finish with full lineups within budget, then simulate a season", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const mode = seed % 2 ? "current" : "alltime";
    const state = playRandomDraft(mode, seed);
    assert.equal(state.phase, "results", `seed ${seed} did not finish`);
    for (const p of state.players) {
      assert.equal(totalOpen(p), 0);
      assert.ok(p.budget >= 0);
      const spent = STARTING_BUDGET - p.budget;
      const prices = POSITION_ORDER.flatMap((pos) => p.lineup[pos].map((s) => s.price));
      assert.equal(prices.reduce((a, b) => a + b, 0), spent);
      for (const pos of POSITION_ORDER) assert.equal(p.lineup[pos].length, SLOTS[pos]);
    }
    const names = state.takenNames;
    assert.equal(new Set(names).size, names.length, "no real player drafted twice");
    const res = state.results;
    assert.ok([0, 1].includes(res.showdown.winner));
    for (const s of res.seasons) {
      assert.equal(s.w + s.l + s.t, 17);
      assert.equal(s.games.length, 17);
      assert.ok(s.finishLevel >= 0 && s.finishLevel <= 5);
      assert.equal(Boolean(s.seed), s.finishLevel > 0);
    }
    assert.ok([0, 1].includes(res.winner));
    assert.ok(res.champion.name);
  }
});

test("same seed and same actions give identical results (host and guest agree)", () => {
  const a = playRandomDraft("current", 77);
  const b = playRandomDraft("current", 77);
  assert.deepEqual(a.results, b.results);
});

test("bid rules: turn order, limits, and passing awards to the leader", () => {
  const state = createGame({ mode: "current", players: [{ name: "A" }, { name: "B" }], seed: 5 });
  const s = state.starter;
  const o = 1 - s;
  assert.equal(applyAction(state, { type: "spin" }, o).ok, false, "only the starter spins");
  assert.equal(applyAction(state, { type: "spin" }, s).ok, true);
  const entry = teamEntries("current", state.team).find((e) => canTake(state, s, e));
  assert.equal(applyAction(state, { type: "nominate", entryId: entry.id, bid: 15 }, s).ok, false, "max bid keeps $1 per open slot");
  assert.equal(maxBid(state.players[s]), STARTING_BUDGET - 8);
  assert.equal(applyAction(state, { type: "nominate", entryId: entry.id, bid: 3 }, s).ok, true);
  assert.equal(applyAction(state, { type: "raise", bid: 3 }, o).ok, false, "raise must beat the high bid");
  assert.equal(applyAction(state, { type: "raise", bid: 5 }, s).ok, false, "can't bid on your own turn twice");
  assert.equal(applyAction(state, { type: "raise", bid: 5 }, o).ok, true);
  assert.equal(applyAction(state, { type: "pass" }, s).ok, true);
  assert.equal(state.players[o].budget, STARTING_BUDGET - 5);
  assert.equal(state.players[o].lineup[entry.pos].length, 1);
  assert.equal(state.starter, o, "players take turns starting the bid");
});

test("re-spins are limited", () => {
  const state = createGame({ mode: "alltime", players: [{ name: "A" }, { name: "B" }], seed: 9 });
  const s = state.starter;
  applyAction(state, { type: "spin" }, s);
  assert.equal(applyAction(state, { type: "respin" }, s).ok, true);
  assert.equal(applyAction(state, { type: "respin" }, s).ok, true);
  assert.equal(applyAction(state, { type: "respin" }, s).ok, false);
  assert.ok(eligibleTeams(state, s).includes(state.team));
});

test("stronger teams win more often but upsets happen", () => {
  const h = { rng: 42 };
  const strong = leagueTeam("alltime", "PIT");
  const weak = leagueTeam("current", "CAR");
  let wins = 0;
  for (let i = 0; i < 2000; i += 1) wins += simGame(h, strong, weak).winner === 0 ? 1 : 0;
  assert.ok(wins / 2000 > 0.6 && wins / 2000 < 0.97, `win rate ${wins / 2000}`);
});

test("legacy rating behaves like Elo", () => {
  assert.equal(eloUpdate(1000, 1000, 1), 1016);
  assert.equal(eloUpdate(1000, 1000, 0), 984);
  assert.ok(eloUpdate(1000, 1400, 1) - 1000 > 16, "beating a stronger player is worth more");
  assert.equal(legacyTier(1000), "Starter");
  assert.equal(legacyTier(1350), "Hall of Fame");
});
