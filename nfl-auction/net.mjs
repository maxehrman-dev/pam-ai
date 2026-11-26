// Online play. The host's browser runs the game; the guest sends actions and receives state.
// Default transport is PeerJS (WebRTC data channel, no game server needed).
// "?transport=bc" switches to BroadcastChannel so two tabs on one machine can play (used for testing).

const PEER_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
  "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"
];
const ID_PREFIX = "nflad-";
const PING_MS = 4000;
const STALE_MS = 13000;

let peerLoad = null;
function loadPeerJs() {
  if (typeof window !== "undefined" && window.Peer) return Promise.resolve(window.Peer);
  if (peerLoad) return peerLoad;
  peerLoad = new Promise((resolve, reject) => {
    const tryAt = (i) => {
      if (i >= PEER_SCRIPTS.length) {
        peerLoad = null;
        reject(new Error("Couldn't load the online play library. Check your connection."));
        return;
      }
      const s = document.createElement("script");
      s.src = PEER_SCRIPTS[i];
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = () => (window.Peer ? resolve(window.Peer) : tryAt(i + 1));
      s.onerror = () => {
        s.remove();
        tryAt(i + 1);
      };
      document.head.appendChild(s);
    };
    tryAt(0);
  });
  return peerLoad;
}

export function makeRoomId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function transportKind() {
  try {
    return new URLSearchParams(location.search).get("transport") === "bc" ? "bc" : "peer";
  } catch (_e) {
    return "peer";
  }
}

// A link wraps one live connection: send(), plus onMessage / onStatus callbacks.
class Link {
  constructor() {
    this.handlers = { message: () => {}, status: () => {} };
    this.lastSeen = 0;
    this.pinger = null;
  }
  on(evt, fn) {
    this.handlers[evt] = fn;
    return this;
  }
  emitStatus(status, detail) {
    this.status = status;
    this.handlers.status(status, detail);
  }
  receive(msg) {
    this.lastSeen = Date.now();
    if (this.status !== "connected") this.emitStatus("connected");
    if (msg && msg.t === "ping") return;
    this.handlers.message(msg);
  }
  startPing() {
    clearInterval(this.pinger);
    this.lastSeen = Date.now();
    this.pinger = setInterval(() => {
      this.send({ t: "ping" });
      if (this.status === "connected" && Date.now() - this.lastSeen > STALE_MS) this.emitStatus("waiting", "Opponent went quiet…");
    }, PING_MS);
  }
  stopPing() {
    clearInterval(this.pinger);
  }
}

// ---------- BroadcastChannel transport (same-machine testing) ----------
class BcHost extends Link {
  constructor(roomId) {
    super();
    this.ch = new BroadcastChannel(`nflad-${roomId}`);
    this.ch.onmessage = (e) => e.data?.to === "host" && this.receive(e.data.msg);
    setTimeout(() => this.emitStatus("waiting"), 0);
    this.startPing();
  }
  send(msg) {
    this.ch.postMessage({ to: "guest", msg });
  }
  close() {
    this.stopPing();
    this.ch.close();
  }
}
class BcGuest extends Link {
  constructor(roomId) {
    super();
    this.ch = new BroadcastChannel(`nflad-${roomId}`);
    this.ch.onmessage = (e) => e.data?.to === "guest" && this.receive(e.data.msg);
    setTimeout(() => this.emitStatus("open"), 0);
    this.startPing();
  }
  send(msg) {
    this.ch.postMessage({ to: "host", msg });
  }
  close() {
    this.stopPing();
    this.ch.close();
  }
}

// ---------- PeerJS transport ----------
class PeerHost extends Link {
  constructor(roomId) {
    super();
    this.roomId = roomId;
    this.conn = null;
    this.retries = 0;
    this.start();
  }
  async start() {
    this.emitStatus("starting");
    let Peer;
    try {
      Peer = await loadPeerJs();
    } catch (error) {
      this.emitStatus("error", error.message);
      return;
    }
    this.peer = new Peer(ID_PREFIX + this.roomId, { debug: 0 });
    this.peer.on("open", () => {
      this.retries = 0;
      this.emitStatus("waiting");
      this.startPing();
    });
    this.peer.on("connection", (conn) => {
      if (this.conn && this.conn.open && this.conn !== conn) this.conn.close();
      this.conn = conn;
      conn.on("data", (msg) => this.receive(msg));
      conn.on("close", () => this.conn === conn && this.emitStatus("waiting", "Opponent disconnected. They can reopen the link to rejoin."));
    });
    this.peer.on("disconnected", () => {
      if (!this.peer.destroyed) setTimeout(() => this.peer.reconnect(), 1500);
    });
    this.peer.on("error", (err) => {
      if (err.type === "unavailable-id" && this.retries < 6) {
        // Happens after a refresh while the old session is still registered. Try again shortly.
        this.retries += 1;
        this.peer.destroy();
        setTimeout(() => this.start(), 2500);
        return;
      }
      if (err.type === "peer-unavailable") return;
      this.emitStatus("error", friendlyPeerError(err));
    });
  }
  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }
  close() {
    this.stopPing();
    this.peer?.destroy();
  }
}

class PeerGuest extends Link {
  constructor(roomId) {
    super();
    this.roomId = roomId;
    this.closed = false;
    this.start();
  }
  async start() {
    this.emitStatus("starting");
    let Peer;
    try {
      Peer = await loadPeerJs();
    } catch (error) {
      this.emitStatus("error", error.message);
      return;
    }
    this.peer = new Peer({ debug: 0 });
    this.peer.on("open", () => this.connect());
    this.peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        this.emitStatus("error", "That challenge isn't live. The challenger needs to keep the game page open.");
        this.retryLater();
        return;
      }
      this.emitStatus("error", friendlyPeerError(err));
    });
    this.peer.on("disconnected", () => {
      if (!this.closed && !this.peer.destroyed) setTimeout(() => this.peer.reconnect(), 1500);
    });
  }
  connect() {
    if (this.closed) return;
    const conn = this.peer.connect(ID_PREFIX + this.roomId, { reliable: true });
    this.conn = conn;
    conn.on("open", () => {
      this.emitStatus("open");
      this.startPing();
    });
    conn.on("data", (msg) => this.receive(msg));
    conn.on("close", () => {
      if (this.conn !== conn || this.closed) return;
      this.emitStatus("waiting", "Connection lost. Reconnecting…");
      this.retryLater();
    });
  }
  retryLater() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), 3000);
  }
  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }
  close() {
    this.closed = true;
    this.stopPing();
    clearTimeout(this.retryTimer);
    this.peer?.destroy();
  }
}

function friendlyPeerError(err) {
  const map = {
    "browser-incompatible": "This browser can't do online play. Try Chrome, Safari or Firefox.",
    network: "Lost connection to the matchmaking server. Check your connection.",
    "server-error": "The matchmaking server is unavailable. Try again in a minute.",
    "socket-error": "Lost connection to the matchmaking server.",
    "webrtc": "Couldn't open a direct connection between your devices."
  };
  return map[err?.type] || "Online connection problem. Try again.";
}

export function hostRoom(roomId) {
  return transportKind() === "bc" ? new BcHost(roomId) : new PeerHost(roomId);
}
export function joinRoom(roomId) {
  return transportKind() === "bc" ? new BcGuest(roomId) : new PeerGuest(roomId);
}
