// Pure game logic for the NFL Auction Draft: auction state machine, game/season simulation, legacy rating.
// Runs in the browser and in Node tests. All randomness comes from a seeded RNG stored in state,
// so the host can replay or verify any result.
import { TEAMS, MODES, POSITION_ORDER, teamEntries, getEntry, getTeam } from "./data.mjs";

export const SLOTS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 1, K: 1, DST: 1 };
export const TOTAL_SLOTS = Object.values(SLOTS).reduce((a, b) => a + b, 0);
export const STARTING_BUDGET = 22;
export const RESPINS_PER_PLAYER = 2;
export const REPLACEMENT_OVR = 68;

// ---------- RNG (mulberry32, state kept as a uint32 in the game state) ----------
export function rand(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(h, min, max) {
  return min + Math.floor(rand(h) * (max - min + 1));
}
function pick(h, list) {
  return list[Math.floor(rand(h) * list.length)];
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
export function newSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// ---------- Players / lineup helpers ----------
function emptyLineup() {
  return Object.fromEntries(POSITION_ORDER.map((p) => [p, []]));
}
export function openSlots(player, pos) {
  return SLOTS[pos] - player.lineup[pos].length;
}
export function totalOpen(player) {
  return POSITION_ORDER.reduce((n, pos) => n + openSlots(player, pos), 0);
}
export function maxBid(player) {
  const open = totalOpen(player);
  if (!open) return 0;
  // Always keep $1 for every other open slot so a lineup can always be completed.
  return Math.max(0, player.budget - (open - 1));
}
export function isTaken(state, entry) {
  return Boolean(state.taken[entry.id]) || state.takenNames.includes(entry.name);
}
export function canTake(state, idx, entry) {
  const p = state.players[idx];
  return !isTaken(state, entry) && openSlots(p, entry.pos) > 0 && maxBid(p) >= 1;
}
export function eligibleTeams(state, idx) {
  return TEAMS.filter((t) => teamEntries(state.mode, t.id).some((e) => canTake(state, idx, e))).map((t) => t.id);
}

export function createGame({ mode, players, seed = newSeed(), ranked = false }) {
  if (!MODES[mode]) throw new Error("Pick Current or All-Time rosters first.");
  const state = {
    v: 1,
    mode,
    ranked,
    seed,
    rng: seed >>> 0,
    phase: "draft",
    step: "spin",
    players: players.map((p) => ({
      name: String(p.name || "Player").slice(0, 20),
      elo: Number(p.elo) || 1000,
      budget: STARTING_BUDGET,
      lineup: emptyLineup(),
      respins: RESPINS_PER_PLAYER
    })),
    starter: 0,
    team: null,
    spin: { id: 0, team: null },
    auction: null,
    taken: {},
    takenNames: [],
    lastAward: null,
    log: [],
    results: null,
    rev: 0
  };
  state.starter = rand(state) < 0.5 ? 0 : 1;
  addLog(state, `Coin toss: ${state.players[state.starter].name} starts the first bid.`);
  return state;
}

function addLog(state, text) {
  state.log.push(text);
  if (state.log.length > 60) state.log.shift();
}

function doSpin(state, excludeTeam) {
  let options = eligibleTeams(state, state.starter);
  if (excludeTeam && options.length > 1) options = options.filter((t) => t !== excludeTeam);
  const team = pick(state, options);
  state.team = team;
  state.spin = { id: state.spin.id + 1, team, by: state.starter };
  state.step = "nominate";
  const t = getTeam(team);
  addLog(state, `${state.players[state.starter].name} spun the ${t.city} ${t.name}.`);
}

function award(state, idx, entry, price, note) {
  const p = state.players[idx];
  p.lineup[entry.pos].push({ id: entry.id, price });
  p.budget -= price;
  state.taken[entry.id] = idx + 1;
  state.takenNames.push(entry.name);
  state.auction = null;
  state.lastAward = { id: (state.lastAward?.id || 0) + 1, entryId: entry.id, player: idx, price, note };
  addLog(state, `${p.name} won ${entry.name} (${entry.pos}, ${entry.ovr}) for $${price}${note ? ` · ${note}` : ""}.`);

  const done = state.players.every((pl) => totalOpen(pl) === 0);
  if (done) {
    state.phase = "results";
    state.step = null;
    state.team = null;
    state.results = simulateAll(state);
    return;
  }
  // Take turns starting the bid. A player with a full lineup is skipped.
  let next = 1 - state.starter;
  if (totalOpen(state.players[next]) === 0) next = 1 - next;
  state.starter = next;
  state.step = "spin";
}

export function applyAction(state, action, actor) {
  const fail = (error) => ({ ok: false, error });
  if (state.phase !== "draft") return fail("The draft is over.");
  const me = state.players[actor];
  if (!me) return fail("Unknown player.");
  const opp = 1 - actor;

  switch (action.type) {
    case "spin": {
      if (state.step !== "spin") return fail("Not time to spin.");
      if (actor !== state.starter) return fail("It's not your spin.");
      doSpin(state);
      break;
    }
    case "respin": {
      if (state.step !== "nominate" || actor !== state.starter) return fail("You can only re-spin before you open the bid.");
      if (me.respins <= 0) return fail("No re-spins left.");
      me.respins -= 1;
      doSpin(state, state.team);
      break;
    }
    case "nominate": {
      if (state.step !== "nominate" || actor !== state.starter) return fail("It's not your turn to open the bid.");
      const entry = getEntry(String(action.entryId || ""));
      if (!entry || entry.team !== state.team || !entry.id.startsWith(`${state.mode}:`)) return fail("Pick a player from this team.");
      if (!canTake(state, actor, entry)) return fail("You can't add that player (taken or slot full).");
      const bid = Math.floor(Number(action.bid));
      if (!(bid >= 1 && bid <= maxBid(me))) return fail(`Opening bid must be $1–$${maxBid(me)}.`);
      if (!canTake(state, opp, entry) || maxBid(state.players[opp]) < bid + 1) {
        award(state, actor, entry, bid, "uncontested");
      } else {
        state.auction = { entryId: entry.id, high: bid, leader: actor, turn: opp, history: [{ p: actor, bid }] };
        state.step = "bid";
        addLog(state, `${me.name} opened ${entry.name} at $${bid}.`);
      }
      break;
    }
    case "raise": {
      const a = state.auction;
      if (state.step !== "bid" || !a || a.turn !== actor) return fail("It's not your bid.");
      const bid = Math.floor(Number(action.bid));
      if (!(bid > a.high && bid <= maxBid(me))) return fail(`Raise must be $${a.high + 1}–$${maxBid(me)}.`);
      a.high = bid;
      a.leader = actor;
      a.history.push({ p: actor, bid });
      const entry = getEntry(a.entryId);
      if (maxBid(state.players[opp]) < bid + 1) {
        award(state, actor, entry, bid, `${state.players[opp].name} can't go higher`);
      } else {
        a.turn = opp;
      }
      break;
    }
    case "pass": {
      const a = state.auction;
      if (state.step !== "bid" || !a || a.turn !== actor) return fail("It's not your call.");
      award(state, a.leader, getEntry(a.entryId), a.high, `${me.name} let it go`);
      break;
    }
    default:
      return fail("Unknown action.");
  }
  state.rev += 1;
  return { ok: true };
}

// ---------- Ratings ----------
export function lineupEntries(player) {
  const out = [];
  for (const pos of POSITION_ORDER) for (const slot of player.lineup[pos]) out.push({ ...getEntry(slot.id), price: slot.price });
  return out;
}

function ratingsFrom(byPos) {
  const avg = (list) => list.reduce((s, e) => s + e.ovr, 0) / Math.max(1, list.length);
  const qb = avg(byPos.QB), rb = avg(byPos.RB), wr = avg(byPos.WR), te = avg(byPos.TE), ol = avg(byPos.OL);
  const off = qb * 0.34 + rb * 0.12 + wr * 0.26 + te * 0.1 + ol * 0.18;
  return { off: round1(off), def: avg(byPos.DST), k: avg(byPos.K) };
}
function round1(v) {
  return Math.round(v * 10) / 10;
}
export function overall(r) {
  return Math.round(r.off * 0.62 + r.def * 0.3 + r.k * 0.08);
}

export function userTeam(player) {
  const entries = lineupEntries(player);
  const byPos = Object.fromEntries(POSITION_ORDER.map((p) => [p, entries.filter((e) => e.pos === p)]));
  return { name: player.name, byPos, ...ratingsFrom(byPos) };
}

// Real NFL team, with any player drafted in this game replaced by a backup.
export function leagueTeam(mode, teamId, takenNames = []) {
  const t = getTeam(teamId);
  const entries = teamEntries(mode, teamId);
  const byPos = {};
  for (const pos of POSITION_ORDER) {
    const pool = entries
      .filter((e) => e.pos === pos)
      .map((e) => (takenNames.includes(e.name) ? { ...e, name: `${t.name} backup`, ovr: REPLACEMENT_OVR } : e))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, SLOTS[pos]);
    while (pool.length < SLOTS[pos]) pool.push({ pos, name: `${t.name} backup`, ovr: REPLACEMENT_OVR });
    byPos[pos] = pool;
  }
  return { id: teamId, name: `${t.city} ${t.name}`, short: t.name, conf: t.conf, byPos, ...ratingsFrom(byPos) };
}

// ---------- Game simulation ----------
function weightedPick(h, list) {
  const total = list.reduce((s, e) => s + Math.pow(e.ovr - 50, 2), 0);
  let r = rand(h) * total;
  for (const e of list) {
    r -= Math.pow(e.ovr - 50, 2);
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}
function last(name) {
  const parts = String(name).split(" ");
  return parts.length > 1 && !/(Jr\.|Sr\.|II|III)$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : parts.slice(-2).join(" ");
}

function driveResult(h, off, def, detail) {
  const edge = (off.off - def.def) / 10;
  const pDefTD = 0.012 + Math.max(0, def.def - 80) * 0.0015;
  const pTO = clamp(0.11 - 0.025 * edge, 0.04, 0.24);
  const pTD = clamp(0.21 + 0.06 * edge, 0.07, 0.48);
  const pFG = 0.17;
  const r = rand(h);
  if (r < pDefTD) return { kind: "defTD", text: detail ? `${defUnit(def)} returns a turnover for a touchdown` : "" };
  if (r < pDefTD + pTO) return { kind: "TO", text: detail ? turnoverText(h, off, def) : "" };
  if (r < pDefTD + pTO + pTD) {
    const xp = rand(h) < 0.95;
    return { kind: "TD", pts: xp ? 7 : 6, text: detail ? tdText(h, off) + (xp ? "" : " (PAT no good)") : "" };
  }
  if (r < pDefTD + pTO + pTD + pFG) {
    const dist = randInt(h, 24, 55);
    const make = clamp(0.98 - (dist - 20) * 0.012 + (off.k - 80) * 0.008, 0.35, 0.99);
    const kicker = off.byPos?.K?.[0]?.name || "Kicker";
    if (rand(h) < make) return { kind: "FG", pts: 3, text: detail ? `${kicker} ${dist}-yd field goal` : "" };
    return { kind: "FGX", text: detail ? `${kicker} misses from ${dist}` : "" };
  }
  return { kind: "punt" };
}
function defUnit(team) {
  return team.byPos?.DST?.[0]?.name || "Defense";
}
function tdText(h, team) {
  const qb = team.byPos?.QB?.[0];
  const yards = rand(h) < 0.55 ? randInt(h, 1, 15) : randInt(h, 16, 78);
  if (rand(h) < 0.62 && qb) {
    const target = weightedPick(h, [...(team.byPos.WR || []), ...(team.byPos.TE || [])]);
    return `${last(qb.name)} ${yards}-yd TD pass to ${target.name}`;
  }
  const runner = rand(h) < 0.82 ? team.byPos?.RB?.[0] : qb;
  return `${runner ? runner.name : "Running back"} ${yards}-yd TD run`;
}
function turnoverText(h, off, def) {
  const qb = off.byPos?.QB?.[0];
  return rand(h) < 0.6 && qb ? `${defUnit(def)} picks off ${last(qb.name)}` : `${defUnit(def)} forces a fumble`;
}

export function simGame(h, A, B, { allowTie = false, detail = false } = {}) {
  const teams = [A, B];
  const score = [0, 0];
  const quarters = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const plays = [];
  const drives = randInt(h, 11, 13);
  let poss = rand(h) < 0.5 ? 0 : 1;
  const total = drives * 2;
  for (let d = 0; d < total; d += 1) {
    const q = Math.min(3, Math.floor((d / total) * 4));
    const off = teams[poss];
    const def = teams[1 - poss];
    const res = driveResult(h, off, def, detail);
    if (res.kind === "defTD") {
      score[1 - poss] += 7;
      quarters[1 - poss][q] += 7;
    } else if (res.pts) {
      score[poss] += res.pts;
      quarters[poss][q] += res.pts;
    }
    if (detail && res.text) plays.push({ q: q + 1, team: res.kind === "defTD" || res.kind === "TO" ? 1 - poss : poss, kind: res.kind, text: res.text, score: [...score] });
    poss = 1 - poss;
  }
  let ot = false;
  if (score[0] === score[1]) {
    ot = true;
    const maxRounds = allowTie ? 1 : 8;
    for (let round = 0; round < maxRounds && score[0] === score[1]; round += 1) {
      for (let k = 0; k < 2 && score[0] === score[1]; k += 1) {
        const off = teams[poss];
        const res = driveResult(h, off, teams[1 - poss], detail);
        if (res.kind === "defTD") score[1 - poss] += 6;
        else if (res.pts) score[poss] += res.kind === "TD" ? 6 : 3;
        if (detail && res.text) plays.push({ q: "OT", team: res.kind === "defTD" || res.kind === "TO" ? 1 - poss : poss, kind: res.kind, text: res.text, score: [...score] });
        poss = 1 - poss;
      }
    }
    if (!allowTie && score[0] === score[1]) {
      const w = A.k + rand(h) * 10 >= B.k + rand(h) * 10 ? 0 : 1;
      score[w] += 3;
      if (detail) plays.push({ q: "OT", team: w, kind: "FG", text: `${teams[w].byPos?.K?.[0]?.name || "Kicker"} walk-off field goal`, score: [...score] });
    }
  }
  const winner = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1;
  return { score, winner, ot, quarters: detail ? quarters : undefined, plays: detail ? plays : undefined };
}

// ---------- Season + playoffs ----------
const ROUND_NAMES = ["Wild Card", "Divisional", "Conference Championship", "Super Bowl"];
export const FINISH_LABELS = [
  "Missed the playoffs",
  "Lost in the Wild Card round",
  "Lost in the Divisional round",
  "Lost the Conference Championship",
  "Lost the Super Bowl",
  "Super Bowl Champion"
];

function compareStanding(a, b) {
  const pct = (t) => (t.w + t.t * 0.5) / Math.max(1, t.w + t.l + t.t);
  return pct(b) - pct(a) || b.pf - b.pa - (a.pf - a.pa) || a.tb - b.tb;
}

export function simulateAll(state) {
  const h = state; // advances the shared RNG
  const users = state.players.map((p) => ({ ...userTeam(p), user: true }));
  const showdown = simGame(h, users[0], users[1], { detail: true });

  const league = TEAMS.map((t) => leagueTeam(state.mode, t.id, state.takenNames));
  users[0].id = "U0";
  users[0].conf = "AFC";
  users[1].id = "U1";
  users[1].conf = "NFC";
  const all = [...league, users[0], users[1]];
  const rec = Object.fromEntries(all.map((t) => [t.id, { id: t.id, name: t.name, conf: t.conf, w: 0, l: 0, t: 0, pf: 0, pa: 0, tb: rand(h) }]));
  const userGames = { U0: [], U1: [] };

  for (let week = 1; week <= 17; week += 1) {
    const order = all.map((t) => t);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand(h) * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < order.length; i += 2) {
      const A = order[i];
      const B = order[i + 1];
      const g = simGame(h, A, B, { allowTie: true });
      const ra = rec[A.id];
      const rb = rec[B.id];
      ra.pf += g.score[0]; ra.pa += g.score[1];
      rb.pf += g.score[1]; rb.pa += g.score[0];
      if (g.winner === 0) { ra.w += 1; rb.l += 1; } else if (g.winner === 1) { rb.w += 1; ra.l += 1; } else { ra.t += 1; rb.t += 1; }
      for (const [me, them, us, op] of [[A, B, g.score[0], g.score[1]], [B, A, g.score[1], g.score[0]]]) {
        if (userGames[me.id]) userGames[me.id].push({ week, opp: them.id, oppName: them.user ? them.name : them.short, us, them: op, res: us > op ? "W" : us < op ? "L" : "T" });
      }
    }
  }

  const standings = {};
  const seeds = {};
  for (const conf of ["AFC", "NFC"]) {
    const table = Object.values(rec).filter((r) => r.conf === conf).sort(compareStanding);
    standings[conf] = table.map((r, i) => ({ id: r.id, name: r.name, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa, seed: i < 7 ? i + 1 : null }));
    seeds[conf] = table.slice(0, 7).map((r) => r.id);
  }

  const byId = Object.fromEntries(all.map((t) => [t.id, t]));
  const playoffGames = [];
  const exitRound = {}; // id -> round index where they lost (0..3), or 4 for champion
  const playGame = (round, conf, hiId, loId) => {
    const g = simGame(h, byId[hiId], byId[loId]);
    const winId = g.winner === 0 ? hiId : loId;
    const loseId = winId === hiId ? loId : hiId;
    exitRound[loseId] = round;
    playoffGames.push({ round, roundName: ROUND_NAMES[round], conf, home: hiId, away: loId, homeName: byId[hiId].name, awayName: byId[loId].name, score: g.score, ot: g.ot, winner: winId });
    return winId;
  };
  const confChamps = {};
  for (const conf of ["AFC", "NFC"]) {
    const s = seeds[conf];
    const seedOf = (id) => s.indexOf(id) + 1;
    const wc = [playGame(0, conf, s[1], s[6]), playGame(0, conf, s[2], s[5]), playGame(0, conf, s[3], s[4])];
    const remaining = [s[0], ...wc].sort((a, b) => seedOf(a) - seedOf(b));
    const d1 = playGame(1, conf, remaining[0], remaining[3]);
    const d2 = playGame(1, conf, remaining[1], remaining[2]);
    const [hi, lo] = seedOf(d1) < seedOf(d2) ? [d1, d2] : [d2, d1];
    confChamps[conf] = playGame(2, conf, hi, lo);
  }
  const champ = playGame(3, "SB", confChamps.AFC, confChamps.NFC);
  exitRound[champ] = 4;

  const seasons = ["U0", "U1"].map((id) => {
    const r = rec[id];
    const conf = byId[id].conf;
    const seed = seeds[conf].includes(id) ? seeds[conf].indexOf(id) + 1 : null;
    const finishLevel = seed ? (exitRound[id] ?? 0) + 1 : 0;
    return {
      id,
      conf,
      w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa,
      rank: standings[conf].findIndex((x) => x.id === id) + 1,
      seed,
      games: userGames[id],
      playoffs: playoffGames.filter((g) => g.home === id || g.away === id),
      finishLevel,
      finish: FINISH_LABELS[finishLevel]
    };
  });

  const s0 = seasons[0];
  const s1 = seasons[1];
  let winner;
  let reason;
  if (s0.finishLevel !== s1.finishLevel) {
    winner = s0.finishLevel > s1.finishLevel ? 0 : 1;
    reason = "Went further in the playoffs";
  } else if (s0.w !== s1.w) {
    winner = s0.w > s1.w ? 0 : 1;
    reason = "Better regular-season record";
  } else {
    winner = showdown.winner;
    reason = "Won the head-to-head showdown";
  }

  return {
    ratings: users.map((u) => ({ off: u.off, def: u.def, k: u.k, ovr: overall(u) })),
    showdown,
    seasons,
    standings,
    playoffGames,
    champion: { id: champ, name: byId[champ].name },
    winner,
    reason
  };
}

// ---------- Legacy rating (Elo, like chess ratings) ----------
export const LEGACY_START = 1000;
export function eloExpected(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}
export function eloUpdate(ra, rb, scoreA, k = 32) {
  return Math.round(ra + k * (scoreA - eloExpected(ra, rb)));
}
export function legacyTier(r) {
  if (r >= 1300) return "Hall of Fame";
  if (r >= 1200) return "All-Pro";
  if (r >= 1100) return "Pro Bowl";
  if (r >= 1000) return "Starter";
  if (r >= 900) return "Rookie";
  return "Practice Squad";
}
