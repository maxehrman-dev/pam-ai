// Draws the shareable results graphic (1080x1350, Instagram portrait) on a canvas.
import { getTeam, logoUrl } from "./data.mjs";
import { lineupEntries } from "./engine.mjs";

const W = 1080;
const H = 1350;
const HEAD = "'Oswald', 'Impact', 'Arial Narrow', sans-serif";
const BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const P_COLORS = ["#38bdf8", "#fb923c"];

function loadLogo(teamId) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 3000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = logoUrl(teamId);
  });
}

function badge(ctx, teamId, x, y, size) {
  const t = getTeam(teamId);
  ctx.save();
  ctx.fillStyle = t.colors[0];
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(size * 0.36)}px ${HEAD}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t.id, x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

function fit(ctx, text, maxWidth) {
  let s = String(text);
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderShareCard(game, { legacy = null, siteUrl = "" } = {}) {
  try {
    await document.fonts?.load?.("700 40px Oswald");
    await document.fonts?.load?.("600 20px Inter");
  } catch (_e) {
    /* fonts are optional */
  }
  const res = game.results;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const lineups = game.players.map((p) => lineupEntries(p));
  const teamIds = [...new Set(lineups.flat().map((e) => e.team))];
  const logos = Object.fromEntries(await Promise.all(teamIds.map(async (id) => [id, await loadLogo(id)])));

  // Background: night-game field with yard lines.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1220");
  bg.addColorStop(1, "#06140d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 3;
  for (let y = 120; y < H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Header
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#facc15";
  ctx.font = `700 30px ${HEAD}`;
  ctx.fillText(`NFL AUCTION DRAFT · ${game.mode === "alltime" ? "ALL-TIME" : "CURRENT"} ROSTERS`, 60, 82);

  const winner = game.players[res.winner];
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 84px ${HEAD}`;
  ctx.fillText(fit(ctx, `${winner.name.toUpperCase()} WINS`, W - 120), 60, 178);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 30px ${BODY}`;
  ctx.fillText(res.reason, 60, 226);

  // Showdown scoreboard
  const sd = res.showdown;
  roundRect(ctx, 60, 262, W - 120, 150, 24);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 22px ${BODY}`;
  ctx.textAlign = "center";
  ctx.fillText(`HEAD-TO-HEAD SHOWDOWN${sd.ot ? " · OT" : ""}`, W / 2, 300);
  ctx.font = `700 76px ${HEAD}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${sd.score[0]}  –  ${sd.score[1]}`, W / 2, 380);
  ctx.font = `600 30px ${BODY}`;
  ctx.textAlign = "left";
  ctx.fillStyle = P_COLORS[0];
  ctx.fillText(fit(ctx, game.players[0].name, 300), 96, 362);
  ctx.textAlign = "right";
  ctx.fillStyle = P_COLORS[1];
  ctx.fillText(fit(ctx, game.players[1].name, 300), W - 96, 362);

  // Two lineup columns
  const colW = (W - 120 - 30) / 2;
  for (let i = 0; i < 2; i += 1) {
    const x = 60 + i * (colW + 30);
    const y = 440;
    const season = res.seasons[i];
    roundRect(ctx, x, y, colW, 740, 24);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.fillStyle = P_COLORS[i];
    ctx.fillRect(x, y + 22, 6, 56);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 40px ${HEAD}`;
    ctx.fillText(fit(ctx, game.players[i].name.toUpperCase(), colW - 150), x + 28, y + 64);
    ctx.textAlign = "right";
    ctx.fillStyle = "#facc15";
    ctx.fillText(`${res.ratings[i].ovr}`, x + colW - 28, y + 64);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 15px ${BODY}`;
    ctx.fillText("TEAM OVR", x + colW - 28, y + 86);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 30px ${HEAD}`;
    const rec = `${season.w}-${season.l}${season.t ? `-${season.t}` : ""}`;
    ctx.fillText(`${rec}  ·  ${season.seed ? `${season.conf} #${season.seed} seed` : `${season.conf} #${season.rank}`}`, x + 28, y + 128);
    ctx.fillStyle = season.finishLevel === 5 ? "#facc15" : season.finishLevel > 0 ? "#86efac" : "#fca5a5";
    ctx.font = `600 22px ${BODY}`;
    ctx.fillText(fit(ctx, season.finish, colW - 56), x + 28, y + 162);

    let ry = y + 196;
    for (const e of lineups[i]) {
      const size = 40;
      const logo = logos[e.team];
      if (logo) ctx.drawImage(logo, x + 24, ry, size, size);
      else badge(ctx, e.team, x + 24, ry, size);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `700 17px ${BODY}`;
      ctx.fillText(e.pos, x + 76, ry + 26);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 22px ${BODY}`;
      ctx.fillText(fit(ctx, e.name, colW - 230), x + 124, ry + 27);
      ctx.textAlign = "right";
      ctx.fillStyle = "#facc15";
      ctx.font = `700 22px ${HEAD}`;
      ctx.fillText(String(e.ovr), x + colW - 82, ry + 28);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `600 18px ${BODY}`;
      ctx.fillText(`$${e.price}`, x + colW - 26, ry + 27);
      ctx.textAlign = "left";
      ry += 58;
    }
  }

  // Footer
  ctx.textAlign = "left";
  ctx.fillStyle = "#facc15";
  ctx.font = `700 30px ${HEAD}`;
  ctx.fillText(fit(ctx, `SUPER BOWL CHAMPION: ${res.champion.name.toUpperCase()}`, W - 120), 60, 1236);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `500 24px ${BODY}`;
  const legacyText = legacy
    ? `Legacy ${legacy.before} → ${legacy.after} (${legacy.after - legacy.before >= 0 ? "+" : ""}${legacy.after - legacy.before}) · ${legacy.tier}`
    : "Unranked game";
  ctx.fillText(legacyText, 60, 1280);
  ctx.textAlign = "right";
  ctx.fillText(siteUrl, W - 60, 1280);
  return canvas;
}
