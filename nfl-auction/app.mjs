// NFL Auction Draft — UI and game flow.
import { TEAMS, MODES, getTeam, logoUrl, teamEntries, getEntry } from "./data.mjs";
import {
  createGame, applyAction, replayGame, cleanName, cleanElo, maxBid, totalOpen, openSlots, canTake, isTaken,
  eloUpdate, legacyTier, LEGACY_START, STARTING_BUDGET, TOTAL_SLOTS, RESPINS_PER_PLAYER
} from "./engine.mjs";
import { hostRoom, joinRoom, makeRoomId } from "./net.mjs";
import { renderShareCard } from "./share.mjs";

const root = document.getElementById("app");
const BASE = "/nfl-auction/";
const PROFILE_KEY = "nflad:profile:v1";
const HOST_KEY = "nflad:host:v1";
const CLIENT_KEY = "nflad:client:v1";
const TEST_TRANSPORT = new URLSearchParams(location.search).get("transport") === "bc";
const POS_LABEL = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", OL: "Offensive line", K: "Kicker", DST: "Defense / ST" };
const SLOT_ORDER = ["QB", "RB", "WR", "WR", "WR", "TE", "OL", "K", "DST"];

// ---------- storage (always guarded: private mode can throw) ----------
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_e) {
      /* ignore */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {
      /* ignore */
    }
  }
};
function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function count(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99999) : 0;
}
function loadProfile() {
  const p = store.get(PROFILE_KEY) || {};
  return {
    name: typeof p.name === "string" ? p.name.slice(0, 20) : "",
    elo: p.elo == null ? LEGACY_START : cleanElo(p.elo),
    best: p.best == null ? LEGACY_START : cleanElo(p.best),
    played: count(p.played),
    wins: count(p.wins),
    losses: count(p.losses),
    titles: count(p.titles),
    playoffs: count(p.playoffs),
    history: Array.isArray(p.history) ? p.history.slice(0, 50) : []
  };
}
function saveProfile() {
  store.set(PROFILE_KEY, app.profile);
}
function clientId() {
  let id = store.get(CLIENT_KEY);
  if (!id) {
    id = randomId();
    store.set(CLIENT_KEY, id);
  }
  return id;
}

// ---------- app state ----------
const app = {
  screen: "home",
  profile: loadProfile(),
  mode: null,
  name2: "",
  role: null, // local | host | guest
  me: 0,
  link: null,
  linkStatus: "",
  linkDetail: "",
  room: null,
  invite: null,
  game: null,
  peek: null, // what the other player is doing right now (online only)
  ui: freshUi()
};
function freshUi() {
  return { sel: null, bid: 1, raise: null, raiseTouched: false, stage: 0, spinning: false, shownSpin: 0, shownAward: 0, legacy: null, resultsKey: null, accepted: false, helloTimer: null };
}

// ---------- helpers ----------
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const failedLogos = new Set();
function logoImg(teamId, alt = true) {
  if (failedLogos.has(teamId)) return badgeHtml(teamId);
  const t = getTeam(teamId);
  return `<img src="${logoUrl(teamId)}" alt="${alt ? esc(`${t.city} ${t.name} logo`) : ""}" data-team="${t.id}" loading="lazy" decoding="async" />`;
}
function badgeHtml(teamId) {
  const t = getTeam(teamId);
  return `<div class="fallback-badge" style="background:${t.colors[0]}">${t.id}</div>`;
}
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img && img.tagName === "IMG" && img.dataset.team) {
      failedLogos.add(img.dataset.team);
      img.outerHTML = badgeHtml(img.dataset.team);
    }
  },
  true
);
function ovrClass(o) {
  return o >= 90 ? "ovr elite" : o >= 82 ? "ovr good" : "ovr";
}
function pname(i) {
  return app.game ? app.game.players[i].name : "";
}
function canAct(idx) {
  return app.role === "local" || app.me === idx;
}
function whoActs(g) {
  if (!g || g.phase !== "draft") return null;
  return g.step === "bid" ? g.auction.turn : g.starter;
}
let toastTimer = null;
function toast(text, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}
function siteLink() {
  return `${location.origin}${BASE}`;
}

// ---------- networking ----------
function statusChip() {
  if (app.role === "local") return `<span class="chip"><span class="dot"></span>Same device</span>`;
  if (!app.role) return "";
  const s = app.linkStatus;
  const opp = app.role === "host" ? app.room?.guest?.name || "Opponent" : app.room?.host?.name || "Host";
  let cls = "warn";
  let text = "Connecting…";
  if (s === "connected") {
    cls = "ok";
    text = `${opp} connected`;
  } else if (s === "waiting") {
    text = app.role === "host" ? (app.room?.guest ? `${opp} disconnected` : "Waiting for opponent") : "Reconnecting…";
  } else if (s === "error") {
    cls = "bad";
    text = "Connection problem";
  } else if (s === "starting") {
    text = "Going online…";
  } else if (s === "ended") {
    cls = "bad";
    text = "Game ended";
  }
  return `<span class="chip ${cls}" title="${esc(app.linkDetail)}"><span class="dot"></span>${esc(text)}</span>`;
}
function refreshStatus() {
  const el = document.getElementById("net-status");
  if (el) el.innerHTML = statusChip();
  const detail = document.getElementById("net-detail");
  if (detail) detail.textContent = ["error", "waiting", "ended"].includes(app.linkStatus) ? app.linkDetail : "";
}

function persistHost() {
  if (app.role !== "host") return;
  const game = app.game ? { init: app.game.init, history: app.game.history } : null;
  store.set(HOST_KEY, { room: app.room, game, ts: Date.now() });
}

function connectHost() {
  app.link?.close();
  app.link = hostRoom(app.room.id)
    .on("status", (s, d) => {
      app.linkStatus = s;
      app.linkDetail = d || "";
      refreshStatus();
    })
    .on("message", onHostMessage);
}

function lobbyInfo() {
  return { id: app.room.id, mode: app.room.mode, host: hostProfileCard() };
}
function hostProfileCard() {
  const p = app.profile;
  return { name: p.name, elo: p.elo, wins: p.wins, losses: p.losses, titles: p.titles };
}
// Everything from the other browser is untrusted: coerce it before it is stored or shown.
function sanitizeCard(msg, fallbackName) {
  return {
    name: cleanName(msg?.name, fallbackName),
    elo: cleanElo(msg?.elo),
    wins: count(msg?.wins),
    losses: count(msg?.losses),
    titles: count(msg?.titles)
  };
}
function sanitizeGuest(msg) {
  return { ...sanitizeCard(msg, "Guest"), clientId: String(msg.clientId || "").slice(0, 40) };
}
function stateMessage() {
  return { t: "state", init: app.game.init, history: app.game.history };
}

function onHostMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "hello") {
    const guest = sanitizeGuest(msg);
    const known = app.room.guest;
    const inDraft = app.game && app.game.phase === "draft";
    if (inDraft && known && known.clientId !== guest.clientId) {
      app.link.send({ t: "full" });
      return;
    }
    app.room.guest = guest;
    app.link.send({ t: "lobby", room: lobbyInfo() });
    if (app.game) app.link.send(stateMessage());
    persistHost();
    if (!known) toast(`${guest.name} accepted your challenge`);
    render();
  } else if (msg.t === "action") {
    if (!app.game || !msg.action) return;
    const result = applyAction(app.game, msg.action, 1);
    if (!result.ok) app.link.send({ t: "error", error: result.error });
    else gameChanged();
  } else if (msg.t === "peek") {
    receivePeek(msg, 1);
  } else if (msg.t === "rematch") {
    toast(`${app.room.guest?.name || "Your opponent"} wants a rematch`);
  } else if (msg.t === "bye") {
    app.linkStatus = "waiting";
    app.linkDetail = `${app.room.guest?.name || "Your opponent"} left the game.`;
    toast(app.linkDetail);
    refreshStatus();
  }
}

function onGuestMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "lobby") {
    clearInterval(app.ui.helloTimer);
    const r = msg.room || {};
    app.room = { id: app.invite?.room, mode: MODES[r.mode] ? r.mode : null, host: sanitizeCard(r.host, "Host") };
    if (!app.game) render();
  } else if (msg.t === "state") {
    clearInterval(app.ui.helloTimer);
    // Rebuild the game from its moves rather than trusting the host's copy.
    const result = replayGame(msg.init, msg.history);
    if (!result.ok) {
      app.linkStatus = "error";
      app.linkDetail = `Game data didn't check out (${result.error}). Reopen the link to resync.`;
      toast("Game data didn't check out. Reopen the link to resync.");
      refreshStatus();
      return;
    }
    setGame(result.state);
  } else if (msg.t === "bye") {
    app.linkStatus = "ended";
    app.linkDetail = `${app.room?.host?.name || "The host"} ended the game.`;
    const ended = app.link;
    app.link = null;
    ended?.close();
    toast(app.linkDetail);
    refreshStatus();
  } else if (msg.t === "peek") {
    receivePeek(msg, 0);
  } else if (msg.t === "error") {
    toast(String(msg.error || "That move wasn't allowed.").slice(0, 120));
  } else if (msg.t === "full") {
    clearInterval(app.ui.helloTimer);
    app.linkStatus = "error";
    app.linkDetail = "This game already has two players.";
    render();
  }
}

function sendHello() {
  const p = app.profile;
  app.link?.send({ t: "hello", name: p.name, elo: p.elo, wins: p.wins, losses: p.losses, titles: p.titles, clientId: clientId() });
}

// ---------- live presence: show what the other player is doing ----------
let peekTimer = null;
function sendPeek() {
  if (!app.link || app.role === "local" || !app.game || app.game.phase !== "draft") return;
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => {
    const g = app.game;
    app.link.send({
      t: "peek",
      rev: g.rev,
      sel: g.step === "nominate" ? app.ui.sel : null,
      bid: g.step === "nominate" && app.ui.sel ? app.ui.bid : null,
      raise: g.step === "bid" && app.ui.raiseTouched ? app.ui.raise : null
    });
  }, 80);
}
function receivePeek(msg, from) {
  const g = app.game;
  if (!g || g.phase !== "draft") return;
  const money = (v) => (Number.isInteger(v) && v >= 1 && v <= 99 ? v : null);
  app.peek = {
    from,
    rev: Number(msg.rev),
    sel: getEntry(msg.sel) ? msg.sel : null,
    bid: money(msg.bid),
    raise: money(msg.raise)
  };
  if (!app.ui.spinning) renderDraftPanels(g);
}
// The other player's peek only counts for the current turn.
function livePeek(g, player) {
  const p = app.peek;
  if (!p || app.role === "local" || p.from !== player || p.rev !== g.rev) return null;
  return p;
}

// ---------- flows ----------
function startLocal() {
  const n1 = app.profile.name.trim() || "Player 1";
  const n2 = app.name2.trim() || "Player 2";
  app.role = "local";
  app.me = 0;
  app.room = null;
  newGame(createGame({ mode: app.mode, players: [{ name: n1 }, { name: n2 }], ranked: false }));
}

function startHosting() {
  const id = makeRoomId();
  app.role = "host";
  app.me = 0;
  app.room = { id, mode: app.mode, guest: null };
  const qs = new URLSearchParams({ join: id, from: app.profile.name.trim(), lr: String(app.profile.elo), mode: app.mode });
  if (TEST_TRANSPORT) qs.set("transport", "bc");
  app.room.url = `${siteLink()}?${qs.toString()}`;
  history.replaceState(null, "", `${BASE}${TEST_TRANSPORT ? "?transport=bc" : ""}#host=${id}`);
  connectHost();
  app.screen = "lobby";
  persistHost();
  render();
}

function resumeHost(id) {
  const saved = store.get(HOST_KEY);
  if (!saved || saved.room?.id !== id || Date.now() - saved.ts > 1000 * 60 * 60 * 24) return false;
  app.role = "host";
  app.me = 0;
  app.room = saved.room;
  const rebuilt = saved.game ? replayGame(saved.game.init, saved.game.history) : null;
  app.game = rebuilt && rebuilt.ok ? rebuilt.state : null;
  connectHost();
  if (app.game) {
    app.ui.shownSpin = app.game.spin.id;
    app.ui.shownAward = app.game.lastAward?.id || 0;
    app.screen = "game";
  } else {
    app.screen = "lobby";
  }
  return true;
}

function hostStartDraft(mode = app.room.mode) {
  const g = app.room.guest;
  if (!g) return;
  app.room.mode = mode;
  newGame(createGame({ mode, players: [{ name: app.profile.name, elo: app.profile.elo }, { name: g.name, elo: g.elo }], ranked: true }));
}

function acceptInvite() {
  const name = app.profile.name.trim();
  if (!name) {
    toast("Enter your name first");
    return;
  }
  saveProfile();
  try {
    sessionStorage.setItem("nflad:accepted", app.invite.room);
  } catch (_e) {
    /* ignore */
  }
  app.role = "guest";
  app.me = 1;
  app.ui.accepted = true;
  app.link?.close();
  app.link = joinRoom(app.invite.room)
    .on("status", (s, d) => {
      app.linkStatus = s;
      app.linkDetail = d || "";
      if (s === "open") sendHello();
      refreshStatus();
    })
    .on("message", onGuestMessage);
  clearInterval(app.ui.helloTimer);
  app.ui.helloTimer = setInterval(sendHello, 2500);
  render();
}

function newGame(game) {
  const keepShown = app.ui;
  app.ui = freshUi();
  app.ui.accepted = keepShown.accepted;
  app.game = game;
  app.screen = "game";
  gameChanged();
}

function setGame(game) {
  const first = !app.game || app.game.seed !== game.seed;
  if (first) {
    const accepted = app.ui.accepted;
    app.ui = freshUi();
    app.ui.accepted = accepted;
    // Joining mid-game: don't replay old spins.
    if (game.rev > 0 && game.spin.id > 0 && app.screen === "game") app.ui.shownSpin = game.spin.id;
  }
  app.game = game;
  app.screen = "game";
  renderGame();
}

function gameChanged() {
  if (app.role === "host") {
    app.link?.send(stateMessage());
    persistHost();
  }
  renderGame();
}

function dispatch(action, actor) {
  if (app.role === "guest") {
    app.link?.send({ t: "action", action });
    return;
  }
  const result = applyAction(app.game, action, actor);
  if (!result.ok) {
    toast(result.error);
    return;
  }
  gameChanged();
}

function leaveGame() {
  try {
    app.link?.send({ t: "bye" });
  } catch (_e) {
    /* ignore */
  }
  wheel?.destroy();
  wheel = null;
  const link = app.link;
  setTimeout(() => link?.close(), 150);
  app.link = null;
  clearInterval(app.ui.helloTimer);
  if (app.role === "host") store.del(HOST_KEY);
  try {
    sessionStorage.removeItem("nflad:accepted");
  } catch (_e) {
    /* ignore */
  }
  app.role = null;
  app.room = null;
  app.invite = null;
  app.game = null;
  app.linkStatus = "";
  app.ui = freshUi();
  app.screen = "home";
  history.replaceState(null, "", `${BASE}${TEST_TRANSPORT ? "?transport=bc" : ""}`);
  render();
}

// ---------- rendering: shell ----------
function topbar(extra = "") {
  return `<header class="topbar">
    <button class="brand" data-act="home" aria-label="NFL Auction Draft home"><span class="ball" aria-hidden="true">🏈</span>Auction Draft</button>
    <div class="chips">${extra}<span id="net-status">${statusChip()}</span></div>
  </header>`;
}

function render() {
  if (app.screen === "game" && app.game) return renderGame();
  if (app.screen === "lobby") return renderLobby();
  if (app.screen === "join") return renderJoin();
  renderHome();
}

function legacyBlock(p) {
  return `<div class="legacy">
    <div><div class="num">${p.elo}</div><div class="small muted">Legacy rating</div></div>
    <div><div class="tier">${legacyTier(p.elo)}</div><div class="small muted">Peak ${p.best} · starts at ${LEGACY_START}</div></div>
  </div>
  <div class="stats">
    <div><b>${p.wins}-${p.losses}</b><span>Matchups</span></div>
    <div><b>${p.played}</b><span>Played</span></div>
    <div><b>${p.playoffs}</b><span>Playoffs</span></div>
    <div><b>${p.titles}</b><span>Titles</span></div>
  </div>`;
}

function eraPicker() {
  return `<div class="era" role="group" aria-labelledby="era-label">
    ${Object.entries(MODES)
      .map(([key, m]) => `<button data-act="mode" data-mode="${key}" aria-pressed="${app.mode === key}"><strong>${m.label}</strong><span>${m.blurb}</span></button>`)
      .join("")}
  </div>`;
}

function renderHome() {
  const p = app.profile;
  const ready = Boolean(app.mode && p.name.trim());
  root.innerHTML = `${topbar()}
  <section class="hero">
    <h1>NFL Auction <span class="gold">Draft</span></h1>
    <p>Spin a team. Bid on its players. Build a 9-man lineup with $${STARTING_BUDGET}, then simulate the showdown, a 17-game season and the playoffs.</p>
  </section>
  <div class="home-grid">
    <section class="card stack">
      <label class="field"><span>Your name</span><input class="text" id="name1" maxlength="20" autocomplete="nickname" placeholder="e.g. Max" value="${esc(p.name)}" /></label>
      <div><div class="label" id="era-label">Roster era</div>${eraPicker()}
        <p class="hint ${app.mode ? "" : "warn"}" id="era-hint">${app.mode ? `${MODES[app.mode].label} rosters selected.` : "Pick Current or All-Time. The game never picks for you."}</p></div>
      <button class="btn primary big block" data-act="host" ${ready ? "" : "disabled"}>Challenge a friend online</button>
      <details>
        <summary class="small muted" style="cursor:pointer">Play on this device instead (unranked)</summary>
        <div class="row" style="margin-top:10px">
          <input class="text" id="name2" maxlength="20" placeholder="Player 2 name" value="${esc(app.name2)}" style="flex:1;min-width:160px" />
          <button class="btn" data-act="local" ${ready ? "" : "disabled"}>Start</button>
        </div>
      </details>
    </section>
    <aside class="stack">
      <section class="card stack"><h3>Your legacy</h3>${legacyBlock(p)}
        <p class="hint">Ranked online matchups move your rating like chess Elo: beat a higher-rated player and you gain more. Your opponent sees it before you play.</p></section>
      <section class="card"><h3 style="margin-bottom:10px">How it plays</h3>
        <ol class="rules">
          <li><b>Spin</b> the wheel to land on one of the 32 teams and see its roster with overalls.</li>
          <li>Players <b>take turns starting the bid</b>: pick a player and an opening price.</li>
          <li>The other player <b>raises or passes</b>. Back and forth until someone lets it go.</li>
          <li>Fill <b>QB, RB, 3 WR, TE, O-Line, K and Defense</b> with $${STARTING_BUDGET}. You always keep $1 per empty slot.</li>
          <li>Then a <b>head-to-head game</b>, a <b>17-game season</b> against the real NFL, and the <b>playoffs</b>.</li>
          <li><b>Winner:</b> whoever goes further in the playoffs. Tied? Better record, then the head-to-head.</li>
        </ol></section>
    </aside>
  </div>`;
}

function versusCards(a, b) {
  const card = (x, cls) =>
    x
      ? `<div class="pcard ${cls}"><div class="nm">${esc(x.name)}</div><div class="lr">${x.elo}</div><div class="small muted">${legacyTier(x.elo)} · ${x.wins || 0}-${x.losses || 0}${x.titles ? ` · ${x.titles} 🏆` : ""}</div></div>`
      : `<div class="pcard ${cls}"><div class="nm muted">Waiting…</div><div class="small muted"><span class="spinner-dot"></span>Not joined yet</div></div>`;
  return `<div class="versus">${card(a, "p0")}<div class="vs">VS</div>${card(b, "p1")}</div>`;
}

function renderLobby() {
  const r = app.room;
  const canShare = typeof navigator.share === "function";
  root.innerHTML = `${topbar(`<span class="chip">${MODES[r.mode].label} rosters</span>`)}
  <div class="center-col stack">
    <section class="card stack">
      <h2>Send your challenge</h2>
      <p class="muted">Send this link to your opponent. Keep this page open — the game runs from your browser.</p>
      <div class="linkbox"><input class="text" id="invite-link" readonly value="${esc(r.url)}" aria-label="Challenge link" />
        <button class="btn" data-act="copy-link">Copy</button></div>
      ${canShare ? `<button class="btn block" data-act="share-link">Share link…</button>` : ""}
    </section>
    <section class="card stack">
      ${versusCards(hostProfileCard(), r.guest)}
      <p class="hint" id="net-detail"></p>
      <button class="btn primary big block" data-act="start-draft" ${r.guest ? "" : "disabled"}>Start the draft</button>
      <button class="btn ghost block" data-act="leave">Cancel challenge</button>
    </section>
  </div>`;
  refreshStatus();
}

function renderJoin() {
  const inv = app.invite;
  const p = app.profile;
  const host = app.room?.host || { name: inv.from, elo: inv.lr };
  const modeLabel = MODES[app.room?.mode || inv.mode]?.label || "";
  const joined = app.ui.accepted;
  root.innerHTML = `${topbar(modeLabel ? `<span class="chip">${modeLabel} rosters</span>` : "")}
  <div class="center-col stack">
    <section class="card stack">
      <h2>${esc(host.name)} challenged you</h2>
      <p class="muted">Auction draft${modeLabel ? ` with ${modeLabel.toLowerCase()} rosters` : ""}. $${STARTING_BUDGET} each, 9 slots, winner gets the legacy points.</p>
      ${versusCards(host, joined ? { ...hostlessCard(p) } : null)}
    </section>
    <section class="card stack">
      ${
        joined
          ? `<p class="waiting"><span class="spinner-dot"></span>${app.room ? `Waiting for ${esc(host.name)} to start the draft…` : "Connecting to your opponent…"}</p>
             <p class="hint" id="net-detail"></p>
             <button class="btn ghost block" data-act="leave">Leave</button>`
          : `<label class="field"><span>Your name</span><input class="text" id="name1" maxlength="20" placeholder="e.g. Jordan" value="${esc(p.name)}" /></label>
             <div class="legacy"><div><div class="num">${p.elo}</div><div class="small muted">Your legacy</div></div><div class="tier">${legacyTier(p.elo)}</div></div>
             <button class="btn primary big block" data-act="accept" ${p.name.trim() ? "" : "disabled"}>Accept challenge</button>`
      }
    </section>
  </div>`;
  refreshStatus();
}
function hostlessCard(p) {
  return { name: p.name, elo: p.elo, wins: p.wins, losses: p.losses, titles: p.titles };
}

// ---------- rendering: game ----------
let wheel = null;

function renderGame() {
  const g = app.game;
  if (!g) return;
  if (!root.querySelector("#game-root")) {
    root.innerHTML = `<div id="game-root">${topbar('<span id="game-chips" class="chips"></span>')}
      <section class="players" id="players"></section>
      <div id="view"></div></div>`;
    wheel?.destroy();
    wheel = null;
  }
  document.getElementById("game-chips").innerHTML = `<span class="chip">${MODES[g.mode].label} rosters</span>${app.role === "local" ? "" : `<span class="chip">${g.ranked ? "Ranked" : "Unranked"}</span>`}`;
  const net = document.getElementById("net-status");
  if (net) net.innerHTML = statusChip();
  document.getElementById("players").innerHTML = playersHtml(g);
  if (g.phase === "draft") renderDraft(g);
  else renderResults(g);
}

function playersHtml(g) {
  const acting = whoActs(g);
  return g.players
    .map((p, i) => {
      const lineup = [];
      const used = { WR: 0 };
      for (const pos of SLOT_ORDER) {
        const k = pos === "WR" ? used.WR++ : 0;
        const slot = p.lineup[pos][k];
        if (slot) {
          const e = getEntry(slot.id);
          lineup.push(`<div class="slot filled" title="${esc(`${e.name} · ${e.ovr} OVR · $${slot.price}`)}"><span class="pos">${pos}</span><span class="who">${esc(e.name)}</span><span class="o">${e.ovr}</span></div>`);
        } else lineup.push(`<div class="slot empty"><span class="pos">${pos}</span><span class="who">—</span></div>`);
      }
      const you = app.role !== "local" && app.me === i ? " (you)" : "";
      return `<div class="pbox p${i} ${acting === i ? "active" : ""}">
        <div class="top"><div class="nm">${esc(p.name)}${you}</div><div class="money">$${p.budget}</div></div>
        <div class="sub">${totalOpen(p) ? `<span>${totalOpen(p)} of ${TOTAL_SLOTS} open</span><span>Max bid $${maxBid(p)}</span>` : "<span>Lineup full</span>"}${g.ranked ? `<span>Legacy ${p.elo}</span>` : ""}</div>
        <div class="slots">${lineup.join("")}</div>
      </div>`;
    })
    .join("");
}

function ensureDraftSkeleton() {
  const view = document.getElementById("view");
  if (view.querySelector(".draft")) return;
  view.innerHTML = `<div class="draft">
    <section class="card wheel-card">
      <div class="wheel-wrap"><div class="pointer" aria-hidden="true"></div><canvas id="wheel" width="340" height="340" aria-label="Team wheel"></canvas><div class="hub" id="hub">🏈</div></div>
      <div class="turn-line" id="turn-line"></div>
      <div class="wheel-actions" id="wheel-actions"></div>
    </section>
    <section class="card" id="team-panel"></section>
  </div>
  <section class="card log" id="log" aria-label="Draft log"></section>`;
  wheel = new Wheel(document.getElementById("wheel"));
  if (app.game.spin.team) wheel.setTo(app.game.spin.team);
}

function renderDraft(g) {
  ensureDraftSkeleton();
  wheel.draw();
  // New spin? Animate it once.
  if (g.spin.id > app.ui.shownSpin && !app.ui.spinning) {
    app.ui.shownSpin = g.spin.id;
    app.ui.spinning = true;
    app.ui.sel = null;
    setHub(null);
    wheel.spinTo(g.spin.team, () => {
      app.ui.spinning = false;
      if (app.game && app.game.phase === "draft" && document.getElementById("wheel")) {
        setHub(g.spin.team);
        renderDraft(app.game);
      }
    });
  } else if (!app.ui.spinning) {
    setHub(g.team);
  }
  // Award toast
  if (g.lastAward && g.lastAward.id > app.ui.shownAward) {
    app.ui.shownAward = g.lastAward.id;
    const e = getEntry(g.lastAward.entryId);
    toast(`${pname(g.lastAward.player)} gets ${e.name} for $${g.lastAward.price}`);
    app.ui.sel = null;
    app.ui.raise = null;
  }
  renderDraftPanels(g);
}

function setHub(teamId) {
  const hub = document.getElementById("hub");
  if (!hub) return;
  const key = teamId || "";
  if (hub.dataset.team === key) return;
  hub.dataset.team = key;
  hub.innerHTML = teamId ? logoImg(teamId) : "🏈";
}

function renderDraftPanels(g) {
  if (g.phase !== "draft") return;
  // On phones the roster/bid panel moves above the wheel once a team is on the clock.
  root.querySelector(".draft")?.classList.toggle("focus-team", !app.ui.spinning && g.step !== "spin");
  const turnLine = document.getElementById("turn-line");
  const actions = document.getElementById("wheel-actions");
  const panel = document.getElementById("team-panel");
  const s = g.starter;
  const sName = esc(pname(s));
  const local = app.role === "local";

  // Wheel area
  if (app.ui.spinning) {
    turnLine.innerHTML = `<span class="spinner-dot"></span>Spinning…`;
    actions.innerHTML = "";
  } else if (g.step === "spin") {
    turnLine.innerHTML = canAct(s) && !local ? "Your spin" : `${sName}'s spin`;
    actions.innerHTML = canAct(s)
      ? `<button class="btn primary big block" data-act="spin">Spin${local ? ` · ${sName}` : ""}</button>`
      : `<p class="waiting"><span class="spinner-dot"></span>Waiting for ${sName} to spin</p>`;
  } else if (g.step === "nominate") {
    turnLine.innerHTML = canAct(s) && !local ? "Pick a player and open the bid" : `${sName} is opening the bid`;
    const left = g.players[s].respins;
    actions.innerHTML = canAct(s)
      ? `<button class="btn block" data-act="respin" ${left > 0 ? "" : "disabled"}>Re-spin · ${left} of ${RESPINS_PER_PLAYER} left</button>`
      : "";
  } else if (g.step === "bid") {
    const t = g.auction.turn;
    turnLine.innerHTML = canAct(t) && !local ? "Your call: raise or pass" : `${esc(pname(t))}'s call: raise or pass`;
    actions.innerHTML = "";
  }

  // Team panel
  if (app.ui.spinning) {
    panel.innerHTML = `<p class="waiting" style="padding:40px 0;justify-content:center"><span class="spinner-dot"></span>Spinning the wheel…</p>`;
  } else if (g.step === "spin") {
    panel.innerHTML = spinPanel(g);
  } else {
    panel.innerHTML = teamHead(g.team) + (g.step === "bid" ? bidPanel(g) : nominatePanel(g)) + rosterList(g);
  }
  document.getElementById("log").innerHTML = g.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("");
}

function teamHead(teamId) {
  const t = getTeam(teamId);
  return `<div class="team-head"><div class="logo">${logoImg(teamId)}</div><div><div class="city">${esc(t.city)} · ${t.conf}</div><h2>${esc(t.name)}</h2></div></div>`;
}

function spinPanel(g) {
  const last = g.lastAward ? getEntry(g.lastAward.entryId) : null;
  const picks = g.players.reduce((n, p) => n + (TOTAL_SLOTS - totalOpen(p)), 0);
  return `<div class="stack">
    <h2>${picks === 0 ? "Draft day" : `Pick ${picks + 1} of ${TOTAL_SLOTS * 2}`}</h2>
    ${
      last
        ? `<div class="auction-card">${logoImg(last.team)}<div><div class="small muted">${esc(pname(g.lastAward.player))} won</div><strong>${esc(last.name)}</strong><span class="det small muted"> · ${last.pos}</span></div><div class="${ovrClass(last.ovr)}">${last.ovr}</div></div>
           <p class="muted small">Sold for $${g.lastAward.price}${g.lastAward.note ? ` · ${esc(g.lastAward.note)}` : ""}.</p>`
        : `<p class="muted">Each spin lands on a team. The spinner picks a player from that roster and opens the bidding. Teams that can't help the spinner are dimmed on the wheel.</p>`
    }
    <p class="muted small">Every lineup needs QB · RB · 3 WR · TE · OL · K · DST. Bid big where it matters — but every empty slot costs at least $1.</p>
  </div>`;
}

function entryStatus(g, e) {
  const owner = g.taken[e.id];
  if (owner) {
    const p = g.players[owner - 1];
    const slot = p.lineup[e.pos].find((s) => s.id === e.id);
    return { text: `${p.name} · $${slot ? slot.price : "?"}`, cls: `p${owner - 1}`, taken: true };
  }
  if (isTaken(g, e)) return { text: "Already drafted", cls: "", taken: true };
  const need = g.players.map((p) => openSlots(p, e.pos) > 0 && maxBid(p) >= 1);
  if (need[0] && need[1]) return { text: "Both need", cls: "" };
  if (need[0]) return { text: `${g.players[0].name} needs`, cls: "p0" };
  if (need[1]) return { text: `${g.players[1].name} needs`, cls: "p1" };
  return { text: "No open slot", cls: "" };
}

function rosterList(g) {
  const s = g.starter;
  const selectable = g.step === "nominate" && canAct(s);
  const nominated = g.auction?.entryId;
  const peek = g.step === "nominate" && !canAct(s) ? livePeek(g, s) : null;
  const rows = teamEntries(g.mode, g.team).map((e) => {
    const st = entryStatus(g, e);
    const pickable = selectable && canTake(g, s, e);
    const sel = app.ui.sel === e.id || nominated === e.id;
    const dim = st.taken || (selectable && !pickable);
    const eyed = peek && peek.sel === e.id;
    return `<button class="prow ${sel ? "sel" : ""} ${dim ? "dim" : ""} ${eyed ? `eyed p${s}` : ""}" data-act="select" data-id="${e.id}" ${pickable ? "" : "disabled"} aria-pressed="${sel}">
      <span class="pos">${e.pos}</span>
      <span><span class="nm">${esc(e.name)}</span>${e.detail ? `<span class="det">${esc(e.detail)}</span>` : ""}</span>
      <span class="${ovrClass(e.ovr)}">${e.ovr}</span>
      <span class="st ${eyed ? `p${s}` : st.cls}">${eyed ? `👀 ${esc(pname(s))} is looking` : esc(st.text)}</span>
    </button>`;
  });
  return `<div class="roster" style="margin-top:14px">${rows.join("")}</div>`;
}

function entryCard(e, right = "") {
  return `<div class="auction-card">${logoImg(e.team)}<div><div class="small muted">${POS_LABEL[e.pos]}</div><strong style="font-size:18px">${esc(e.name)}</strong>${e.detail ? `<div class="small muted">${esc(e.detail)}</div>` : ""}</div>${right || `<div class="${ovrClass(e.ovr)}">${e.ovr}</div>`}</div>`;
}

function nominatePanel(g) {
  const s = g.starter;
  if (!canAct(s)) {
    const peek = livePeek(g, s);
    const e = peek?.sel ? getEntry(peek.sel) : null;
    if (!e || e.team !== g.team) return `<p class="waiting"><span class="live-dot"></span>${esc(pname(s))} is looking through the ${esc(getTeam(g.team).name)} roster…</p>`;
    return `<div class="stack live p${s}">
      <p class="live-line"><span class="live-dot"></span>${esc(pname(s))} is looking at</p>
      ${entryCard(e)}
      ${peek.bid ? `<p class="live-line">Thinking about opening at <b class="amt-sm">$${peek.bid}</b></p>` : ""}
    </div>`;
  }
  const local = app.role === "local";
  if (!app.ui.sel) return `<p class="muted">${local ? `<b>${esc(pname(s))}</b>: tap` : "Tap"} a player to open the bidding.</p>`;
  const e = getEntry(app.ui.sel);
  const max = maxBid(g.players[s]);
  app.ui.bid = Math.max(1, Math.min(max, app.ui.bid || 1));
  const opp = g.players[1 - s];
  const oppCan = canTake(g, 1 - s, e);
  return `<div class="stack">
    ${entryCard(e)}
    <div class="row" style="justify-content:space-between">
      <div class="stepper"><button data-act="bid-dec" aria-label="Lower opening bid">−</button><output id="bid-out">$${app.ui.bid}</output><button data-act="bid-inc" aria-label="Raise opening bid">+</button></div>
      <div class="row"><button class="btn" data-act="bid-set" data-v="1">$1</button><button class="btn" data-act="bid-set" data-v="${max}">Max $${max}</button></div>
    </div>
    <button class="btn primary big block" data-act="nominate">Open bid at $${app.ui.bid}</button>
    <p class="hint">${oppCan ? `${esc(opp.name)} can raise up to $${maxBid(opp)}. If they can't top you, ${esc(e.name)} is yours.` : `${esc(opp.name)} has no open ${e.pos} slot, so ${esc(e.name)} is yours at your price.`}</p>
  </div>`;
}

function bidPanel(g) {
  const a = g.auction;
  const e = getEntry(a.entryId);
  const t = a.turn;
  const leader = esc(pname(a.leader));
  const hist = a.history.map((h) => `<span class="p${h.p}">${esc(pname(h.p))} $${h.bid}</span>`).join("");
  let controls;
  if (canAct(t)) {
    const max = maxBid(g.players[t]);
    const min = a.high + 1;
    app.ui.raise = Math.max(min, Math.min(max, app.ui.raise || min));
    const quick = [1, 2, 5].filter((d) => a.high + d <= max).map((d) => `<button class="btn" data-act="raise-set" data-v="${a.high + d}">+$${d}</button>`).join("");
    const who = app.role === "local" ? ` (${esc(pname(t))})` : "";
    controls = `<div class="row" style="justify-content:space-between">
        <div class="stepper"><button data-act="raise-dec" aria-label="Lower raise">−</button><output>$${app.ui.raise}</output><button data-act="raise-inc" aria-label="Increase raise">+</button></div>
        <div class="row">${quick}</div></div>
      <button class="btn primary big block" data-act="raise">Raise to $${app.ui.raise}${who}</button>
      <button class="btn danger block" data-act="pass">Pass · ${leader} wins it at $${a.high}</button>
      <p class="hint">You can bid up to $${max} (you keep $1 for each other empty slot).</p>`;
  } else {
    const peek = livePeek(g, t);
    controls = peek?.raise
      ? `<p class="live-line live p${t}"><span class="live-dot"></span>${esc(pname(t))} is eyeing a raise to <b class="amt-sm">$${peek.raise}</b>…</p>`
      : `<p class="waiting"><span class="live-dot"></span>${esc(pname(t))} is deciding: raise or pass…</p>`;
  }
  return `<div class="stack">
    ${entryCard(e)}
    <div class="bidline"><span class="amt">$${a.high}</span><span class="muted">${leader} leads</span></div>
    <div class="history">${hist}</div>
    ${controls}
  </div>`;
}

// ---------- wheel ----------
const WHEEL_ORDER = Array.from({ length: 32 }, (_, i) => TEAMS[(i * 13) % 32]);
class Wheel {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.rot = -Math.PI / 2 - Math.PI / 32;
    this.imgs = {};
    for (const t of TEAMS) {
      const img = new Image();
      img.onload = () => this.draw();
      img.src = logoUrl(t.id);
      this.imgs[t.id] = img;
    }
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
  }
  destroy() {
    window.removeEventListener("resize", this.onResize);
  }
  resize() {
    const size = this.c.clientWidth || 300;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.round(size * dpr);
    this.c.height = Math.round(size * dpr);
    this.draw();
  }
  angleFor(teamId) {
    const i = WHEEL_ORDER.findIndex((t) => t.id === teamId);
    const s = (Math.PI * 2) / 32;
    return -Math.PI / 2 - (i + 0.5) * s;
  }
  setTo(teamId) {
    this.rot = this.angleFor(teamId);
    this.draw();
  }
  spinTo(teamId, done) {
    const s = (Math.PI * 2) / 32;
    const jitter = (Math.random() - 0.5) * s * 0.6;
    let target = this.angleFor(teamId) + jitter;
    const TWO = Math.PI * 2;
    while (target < this.rot + TWO * 5) target += TWO;
    const start = this.rot;
    const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 300 : 3600;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      this.rot = start + (target - start) * eased;
      this.draw();
      if (p < 1) requestAnimationFrame(step);
      else {
        this.rot = target % TWO;
        done && done();
      }
    };
    requestAnimationFrame(step);
  }
  draw() {
    const { c, ctx } = this;
    if (!c.isConnected) return;
    const W = c.width;
    const R = W / 2 - 4 * (W / 340);
    const cx = W / 2;
    const s = (Math.PI * 2) / 32;
    const g = app.game;
    const eligible = g && g.phase === "draft" ? new Set(eligibleFor(g)) : null;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.translate(cx, cx);
    WHEEL_ORDER.forEach((t, i) => {
      const a0 = this.rot + i * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a0 + s);
      ctx.closePath();
      ctx.fillStyle = t.colors[0] === "#000000" ? "#1f2937" : t.colors[0];
      ctx.globalAlpha = eligible && !eligible.has(t.id) ? 0.22 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, W / 340);
      ctx.stroke();
      const mid = a0 + s / 2;
      const size = R * 0.15;
      ctx.save();
      ctx.rotate(mid);
      ctx.translate(R * 0.8, 0);
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = eligible && !eligible.has(t.id) ? 0.3 : 1;
      const img = this.imgs[t.id];
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
      else {
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${Math.round(size * 0.55)}px Oswald, Impact, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.id, 0, 0);
      }
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.lineWidth = 6 * (W / 340);
    ctx.strokeStyle = "#facc15";
    ctx.stroke();
    ctx.restore();
  }
}
const eligibleCache = { key: "", list: [] };
function eligibleFor(g) {
  const key = `${g.seed}:${g.rev}`;
  if (eligibleCache.key !== key) {
    eligibleCache.key = key;
    eligibleCache.list = TEAMS.filter((t) => teamEntries(g.mode, t.id).some((e) => canTake(g, g.starter, e))).map((t) => t.id);
  }
  return eligibleCache.list;
}

// ---------- results ----------
function applyLegacy(g) {
  if (!g.ranked || app.role === "local") return null;
  const me = app.me;
  const key = `${g.seed}:${g.players.map((p) => p.name).join("|")}`;
  const res = g.results;
  const score = res.winner === me ? 1 : 0;
  const pm = g.players[me].elo;
  const po = g.players[1 - me].elo;
  const myDelta = eloUpdate(pm, po, score) - pm;
  const oppDelta = eloUpdate(po, pm, 1 - score) - po;
  const prof = app.profile;
  let entry = prof.history.find((h) => h.key === key);
  if (!entry) {
    const before = prof.elo;
    prof.elo = Math.max(100, before + myDelta);
    prof.best = Math.max(prof.best, prof.elo);
    prof.played += 1;
    if (score) prof.wins += 1;
    else prof.losses += 1;
    const season = res.seasons[me];
    if (season.finishLevel > 0) prof.playoffs += 1;
    if (season.finishLevel === 5) prof.titles += 1;
    entry = { key, date: new Date().toISOString(), opp: g.players[1 - me].name, oppElo: po, mode: g.mode, result: score ? "W" : "L", before, after: prof.elo, delta: myDelta };
    prof.history.unshift(entry);
    prof.history = prof.history.slice(0, 50);
    saveProfile();
  }
  return { before: entry.before, after: entry.after, tier: legacyTier(entry.after), oppBefore: po, oppAfter: po + oppDelta };
}

function renderResults(g) {
  const view = document.getElementById("view");
  const res = g.results;
  const key = `${g.seed}`;
  if (app.ui.resultsKey !== key) {
    app.ui.resultsKey = key;
    app.ui.stage = 0;
    app.ui.legacy = applyLegacy(g);
    wheel?.destroy();
    wheel = null;
  }
  const stage = app.ui.stage;
  const steps = `<div class="steps">${[0, 1, 2].map((i) => `<span class="${i <= stage ? "on" : ""}"></span>`).join("")}</div>`;
  let body = "";
  if (stage === 0) body = showdownHtml(g, res) + `<button class="btn primary big block" data-act="stage" data-v="1" style="margin-top:14px">Simulate the 17-game season →</button>`;
  if (stage === 1) body = seasonHtml(g, res) + `<button class="btn primary big block" data-act="stage" data-v="2" style="margin-top:14px">Simulate the playoffs →</button>`;
  if (stage === 2) body = finalHtml(g, res);
  const titles = ["The Showdown", "The Season", "The Playoffs"];
  view.innerHTML = `<div class="results-head"><h1 style="font-size:clamp(32px,6vw,52px)">${titles[stage]}</h1>${steps}</div>${body}`;
}

function showdownHtml(g, res) {
  const sd = res.showdown;
  const side = (i) => `<div class="side p${i}"><div class="nm">${esc(g.players[i].name)}</div><div class="small muted">Team OVR ${res.ratings[i].ovr} · OFF ${Math.round(res.ratings[i].off)} · DEF ${Math.round(res.ratings[i].def)}</div></div>`;
  const qrow = (i) => `<tr><td>${esc(g.players[i].name)}</td>${sd.quarters[i].map((q) => `<td>${q}</td>`).join("")}<td><b>${sd.score[i]}</b></td></tr>`;
  const plays = sd.plays
    .map((p, i) => `<li class="p${p.team}" style="animation-delay:${i * 140}ms"><span class="q">${p.q === "OT" ? "OT" : `Q${p.q}`}</span><span><span class="t">${esc(g.players[p.team].name)}</span> · ${esc(p.text)}</span><span class="s">${p.score[0]}-${p.score[1]}</span></li>`)
    .join("");
  return `<section class="card">
    <div class="scoreboard">
      ${side(0)}
      <div><div class="row" style="justify-content:center;gap:18px"><span class="pts ${sd.winner === 0 ? "win" : ""}">${sd.score[0]}</span><span class="mid">${sd.ot ? "OT" : "FINAL"}</span><span class="pts ${sd.winner === 1 ? "win" : ""}">${sd.score[1]}</span></div></div>
      ${side(1)}
    </div>
    <table class="qtable"><thead><tr><th></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>T</th></tr></thead><tbody>${qrow(0)}${qrow(1)}</tbody></table>
    <ul class="plays">${plays || `<li class="muted" style="opacity:1">A defensive slugfest — no scoring plays.</li>`}</ul>
    <p class="hint" style="margin-top:12px">${esc(g.players[sd.winner].name)} takes the head-to-head${sd.ot ? " in overtime" : ""}. Now both teams play a full season against the real NFL (${esc(g.players[0].name)} in the AFC, ${esc(g.players[1].name)} in the NFC).</p>
  </section>`;
}

function seasonHtml(g, res) {
  const card = (i) => {
    const s = res.seasons[i];
    const weeks = s.games.map((w, k) => `<div class="wk ${w.res}" style="animation-delay:${k * 60}ms" title="Week ${w.week}: ${esc(w.oppName)} ${w.us}-${w.them}">${w.res}<small>${esc(w.oppName)}</small></div>`).join("");
    const fin = s.seed ? `<span class="finish in">${s.conf} #${s.seed} seed — in the playoffs</span>` : `<span class="finish out">Missed the playoffs (${s.conf} #${s.rank})</span>`;
    return `<section class="card season p${i}">
      <h3><span style="color:var(--p${i})">${esc(g.players[i].name)}</span><span class="muted small">${s.conf}</span></h3>
      <div class="row" style="margin-top:6px;align-items:baseline"><span class="record">${s.w}-${s.l}${s.t ? `-${s.t}` : ""}</span><span class="muted small">PF ${s.pf} · PA ${s.pa}</span></div>
      <div class="weeks">${weeks}</div>
      ${fin}
    </section>`;
  };
  const table = (conf) => {
    const rows = res.standings[conf].slice(0, 10).map((r, i) => {
      const me = r.id.startsWith("U");
      return `<tr class="${me ? "me" : ""} ${i === 6 ? "cut" : ""}"><td>${r.seed ? r.seed : "—"}</td><td>${esc(r.name)}</td><td>${r.w}-${r.l}${r.t ? `-${r.t}` : ""}</td><td class="muted">${r.pf - r.pa >= 0 ? "+" : ""}${r.pf - r.pa}</td></tr>`;
    });
    return `<section class="card"><h3 style="margin-bottom:8px">${conf} standings</h3><table class="standings"><tbody>${rows.join("")}</tbody></table><p class="hint" style="margin-top:6px">Top 7 make the playoffs. #1 seed gets a bye.</p></section>`;
  };
  return `<div class="two">${card(0)}${card(1)}</div><div class="two" style="margin-top:14px">${table("AFC")}${table("NFC")}</div>`;
}

function finalHtml(g, res) {
  const path = (i) => {
    const s = res.seasons[i];
    const id = s.id;
    const games = s.playoffs
      .map((pg, k) => {
        const won = pg.winner === id;
        const us = pg.home === id ? pg.score[0] : pg.score[1];
        const them = pg.home === id ? pg.score[1] : pg.score[0];
        const opp = pg.home === id ? pg.awayName : pg.homeName;
        return `<div class="pgame ${won ? "won" : "lost"}" style="animation-delay:${k * 260}ms"><div><div class="r">${pg.roundName}</div><div>vs ${esc(opp)}</div></div><div class="sc">${won ? "W" : "L"} ${us}-${them}${pg.ot ? " OT" : ""}</div></div>`;
      })
      .join("");
    const cls = s.finishLevel === 5 ? "champ" : s.finishLevel > 0 ? "in" : "out";
    return `<section class="card"><h3 style="color:var(--p${i})">${esc(g.players[i].name)}</h3>
      <div class="muted small">${s.w}-${s.l}${s.t ? `-${s.t}` : ""} · ${s.seed ? `${s.conf} #${s.seed} seed` : `${s.conf} #${s.rank}`}</div>
      <div class="finish ${cls}" style="margin:8px 0">${s.finishLevel === 5 ? "🏆 " : ""}${esc(s.finish)}</div>
      ${games || `<p class="muted small">Watched the playoffs from home.</p>`}</section>`;
  };
  const sb = res.playoffGames.find((p) => p.round === 3);
  const w = res.winner;
  const L = app.ui.legacy;
  const legacyHtml = L
    ? `<div class="row" style="justify-content:center;margin-top:10px;gap:18px">
        <span>Your legacy: <b>${L.before}</b> → <b>${L.after}</b> <span class="delta ${L.after >= L.before ? "up" : "down"}">${L.after >= L.before ? "+" : ""}${L.after - L.before}</span></span>
        <span class="muted">${esc(g.players[1 - app.me].name)}: ${L.oppBefore} → ${L.oppAfter}</span></div>`
    : `<p class="muted small" style="margin-top:8px">Same-device games are unranked.</p>`;
  let again = "";
  if (app.role === "guest") {
    again = `<button class="btn block" data-act="ask-rematch">Ask for a rematch</button>`;
  } else {
    const other = g.mode === "current" ? "alltime" : "current";
    again = `<div class="row"><button class="btn green" style="flex:1" data-act="rematch" data-mode="${g.mode}">Rematch · ${MODES[g.mode].label}</button><button class="btn" style="flex:1" data-act="rematch" data-mode="${other}">Rematch · ${MODES[other].label}</button></div>`;
  }
  return `<section class="banner">
      <div class="small muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Matchup winner</div>
      <h2>${esc(g.players[w].name)} wins</h2>
      <div class="muted">${esc(res.reason)} · Showdown ${res.showdown.score[0]}-${res.showdown.score[1]}</div>
      ${legacyHtml}
    </section>
    <div class="two" style="margin-top:14px">${path(0)}${path(1)}</div>
    <section class="card" style="margin-top:14px;text-align:center">
      <div class="small muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">Super Bowl</div>
      <div style="font-family:var(--head);font-size:26px;text-transform:uppercase">${esc(sb.homeName)} ${sb.score[0]} – ${sb.score[1]} ${esc(sb.awayName)}${sb.ot ? " (OT)" : ""}</div>
      <div class="gold" style="font-weight:700">Champion: ${esc(res.champion.name)}</div>
    </section>
    <section class="card stack" style="margin-top:14px">
      <button class="btn primary big block" data-act="share">Share result graphic</button>
      ${again}
      <button class="btn ghost block" data-act="leave">Back to home</button>
    </section>`;
}

async function openShare() {
  const g = app.game;
  const modal = document.getElementById("modal");
  modal.hidden = false;
  modal.innerHTML = `<div class="sheet"><p class="waiting"><span class="spinner-dot"></span>Building your graphic…</p></div>`;
  let canvas;
  try {
    canvas = await renderShareCard(g, { legacy: app.ui.legacy, siteUrl: siteLink().replace(/^https?:\/\//, "") });
  } catch (error) {
    modal.innerHTML = `<div class="sheet stack"><p>Couldn't build the graphic.</p><button class="btn block" data-act="close-modal">Close</button></div>`;
    return;
  }
  let url = "";
  let blob = null;
  try {
    url = canvas.toDataURL("image/png");
    blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  } catch (_e) {
    /* tainted canvas should not happen; logos fall back to badges */
  }
  app.ui.shareBlob = blob;
  if (app.ui.shareUrl) URL.revokeObjectURL(app.ui.shareUrl);
  app.ui.shareUrl = blob ? URL.createObjectURL(blob) : "";
  const file = blob ? new File([blob], "auction-draft-result.png", { type: "image/png" }) : null;
  const canShareFile = Boolean(file && navigator.canShare && navigator.canShare({ files: [file] }));
  modal.innerHTML = `<div class="sheet">
    ${url ? `<img class="preview" src="${url}" alt="Result graphic" />` : ""}
    <div class="stack">
      ${canShareFile ? `<button class="btn primary block" data-act="share-file">Share…</button>` : ""}
      ${app.ui.shareUrl ? `<a class="btn ${canShareFile ? "" : "primary"} block linkbtn" href="${app.ui.shareUrl}" download="auction-draft-result.png">Download image</a>` : ""}
      <button class="btn ghost block" data-act="close-modal">Close</button>
    </div></div>`;
}

// ---------- events ----------
root.addEventListener("input", (e) => {
  if (e.target.id === "name1") {
    app.profile.name = e.target.value.slice(0, 20);
    saveProfile();
    const ready = Boolean(app.profile.name.trim());
    root.querySelectorAll('[data-act="host"],[data-act="local"]').forEach((b) => (b.disabled = !(ready && app.mode)));
    const acc = root.querySelector('[data-act="accept"]');
    if (acc) acc.disabled = !ready;
  }
  if (e.target.id === "name2") app.name2 = e.target.value.slice(0, 20);
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  const g = app.game;
  switch (act) {
    case "home":
      if (app.screen === "home") return;
      if (app.screen === "game" && g && g.phase === "draft" && !confirm("Leave this game?")) return;
      leaveGame();
      break;
    case "mode":
      app.mode = btn.dataset.mode;
      renderHome();
      break;
    case "host":
      if (!app.mode) return toast("Pick Current or All-Time first");
      saveProfile();
      startHosting();
      break;
    case "local":
      if (!app.mode) return toast("Pick Current or All-Time first");
      startLocal();
      break;
    case "copy-link":
      try {
        await navigator.clipboard.writeText(app.room.url);
        toast("Link copied");
      } catch (_e) {
        document.getElementById("invite-link")?.select();
        toast("Select and copy the link");
      }
      break;
    case "share-link":
      try {
        await navigator.share({ title: "NFL Auction Draft", text: `${app.profile.name} (Legacy ${app.profile.elo}) challenged you to an NFL auction draft.`, url: app.room.url });
      } catch (_e) {
        /* cancelled */
      }
      break;
    case "start-draft":
      hostStartDraft();
      break;
    case "accept":
      acceptInvite();
      break;
    case "leave":
      leaveGame();
      break;
    case "spin":
      dispatch({ type: "spin" }, g.starter);
      break;
    case "respin":
      dispatch({ type: "respin" }, g.starter);
      break;
    case "select":
      app.ui.sel = btn.dataset.id;
      app.ui.bid = 1;
      renderDraftPanels(g);
      sendPeek();
      break;
    case "bid-inc":
    case "bid-dec":
    case "bid-set": {
      const max = maxBid(g.players[g.starter]);
      const v = act === "bid-set" ? Number(btn.dataset.v) : app.ui.bid + (act === "bid-inc" ? 1 : -1);
      app.ui.bid = Math.max(1, Math.min(max, v));
      renderDraftPanels(g);
      sendPeek();
      break;
    }
    case "nominate":
      dispatch({ type: "nominate", entryId: app.ui.sel, bid: app.ui.bid }, g.starter);
      break;
    case "raise-inc":
    case "raise-dec":
    case "raise-set": {
      const a = g.auction;
      const max = maxBid(g.players[a.turn]);
      const v = act === "raise-set" ? Number(btn.dataset.v) : app.ui.raise + (act === "raise-inc" ? 1 : -1);
      app.ui.raise = Math.max(a.high + 1, Math.min(max, v));
      app.ui.raiseTouched = true;
      renderDraftPanels(g);
      sendPeek();
      break;
    }
    case "raise":
      dispatch({ type: "raise", bid: app.ui.raise }, g.auction.turn);
      app.ui.raise = null;
      app.ui.raiseTouched = false;
      break;
    case "pass":
      dispatch({ type: "pass" }, g.auction.turn);
      break;
    case "stage":
      app.ui.stage = Number(btn.dataset.v);
      renderResults(g);
      window.scrollTo({ top: 0, behavior: "smooth" });
      break;
    case "share":
      openShare();
      break;
    case "share-file":
      try {
        const file = new File([app.ui.shareBlob], "auction-draft-result.png", { type: "image/png" });
        await navigator.share({ files: [file], title: "NFL Auction Draft", text: `${g.players[g.results.winner].name} won our NFL auction draft. Play: ${siteLink()}` });
      } catch (_e) {
        /* cancelled */
      }
      break;
    case "close-modal":
      document.getElementById("modal").hidden = true;
      break;
    case "rematch": {
      const mode = btn.dataset.mode;
      if (app.role === "local") {
        app.mode = mode;
        newGame(createGame({ mode, players: g.players.map((p) => ({ name: p.name })), ranked: false }));
      } else if (app.role === "host") {
        const L = app.ui.legacy;
        if (L) app.room.guest.elo = L.oppAfter;
        hostStartDraft(mode);
      }
      break;
    }
    case "ask-rematch":
      app.link?.send({ t: "rematch" });
      toast("Rematch request sent");
      break;
    default:
      break;
  }
});

document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") e.target.hidden = true;
});

// ---------- boot ----------
function boot() {
  const params = new URLSearchParams(location.search);
  const join = params.get("join");
  if (join && /^[a-z0-9]{6,16}$/.test(join)) {
    const mode = params.get("mode");
    app.invite = { room: join, from: cleanName(params.get("from"), "A friend"), lr: cleanElo(params.get("lr") ?? LEGACY_START), mode: MODES[mode] ? mode : null };
    app.screen = "join";
    let accepted = false;
    try {
      accepted = sessionStorage.getItem("nflad:accepted") === join;
    } catch (_e) {
      /* ignore */
    }
    render();
    if (accepted && app.profile.name.trim()) acceptInvite();
    return;
  }
  const hostMatch = location.hash.match(/^#host=([a-z0-9]{6,16})$/);
  if (hostMatch && resumeHost(hostMatch[1])) {
    render();
    return;
  }
  render();
}
boot();
