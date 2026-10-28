// Homepage live demo: PAM answering three real questions on its own, the way
// the app does (question typed in, steps checked off, the answer building in,
// numbers counting up), then moving to the next. Every number comes from
// PAM's engines run on the sample profile, so the page shows what the
// product actually computes.
//
// The demo is driven by one clock per scene. Each tick derives what should be
// visible from the elapsed time, so a re-render of the page just picks up
// where it was.

import { escapeHtml, formatCompactCurrency, formatCurrency } from "./utils/formatters.js";
import { renderRangeChartSvg } from "./utils/rangeChart.js";

const TYPE_START = 0.45;
const TYPE_PER_CHAR = 0.03;
const STEP_GAP = 0.45;
const HOLD_AFTER_REVEAL = 3.4;
const LEAVE_DURATION = 0.45;

const VERDICT_CLASS = { "Worth it": "verdict-worth", "Not yet": "verdict-notyet", "Don't": "verdict-dont" };

function goalName(title = "") {
  return String(title).replace(/^(save for|build|reach|hit|pay off)\s+(an?\s+|the\s+|my\s+)?/i, "").toLowerCase();
}

// Scenes are computed once from the engines; the engine call is passed in so
// this module doesn't need the whole app's imports.
export function buildLiveDemoScenes({ askEngine, rangeExample }) {
  const scenes = [];

  const move = askEngine("Can I afford a $2,900 apartment?");
  if (move) {
    const before = Math.round(move.currentPath.monthlyFreeCash);
    const after = Math.round(move.scenarioPath.monthlyFreeCash);
    const upfront = Math.round(Number(move.draft.moveCost || move.draft.oneTimeCost || 0));
    const goal = move.goalsSummary?.mostImpactedGoal;
    const delay = Math.round(Number(goal?.deltaMonths) || 0);
    const verdict = move.risk.label === "Low" ? "Worth it" : move.risk.label === "High" ? "Don't" : "Not yet";
    scenes.push({
      question: "Can I afford a $2,900 apartment?",
      verdict,
      headline: delay > 0 ? `${verdict === "Don't" ? "Not at this rent." : "Not yet."} It pushes your ${goalName(goal.title)} back ${delay} months.` : "Yes, and your goals stay on schedule.",
      body: `Rent goes up ${formatCurrency(before - after)} a month, so your buffer drops from ${formatCurrency(before)} to ${formatCurrency(after)}. The move takes about ${formatCurrency(upfront)} up front.`,
      stats: [
        { label: "Monthly buffer", value: after, sub: `−${formatCurrency(before - after)} a month` },
        { label: "Up front", value: upfront, sub: "Deposit and moving" },
        { label: "Goal", text: delay > 0 ? `${delay} mo later` : "On time", sub: goal ? goalName(goal.title).replace(/^\w/, (c) => c.toUpperCase()) : "Main goal" }
      ]
    });
  }

  if (rangeExample) {
    const endAge = rangeExample.startAge + Math.round(rangeExample.months / 12);
    scenes.push({
      question: `If I invest ${formatCurrency(rangeExample.monthlyContribution)} a month starting at ${rangeExample.startAge}, where could I be at ${endAge}?`,
      verdict: "Worth it",
      headline: `Typically about ${formatCompactCurrency(rangeExample.typical)} by ${endAge}.`,
      body: `Rough markets end near ${formatCompactCurrency(rangeExample.low)}, strong ones near ${formatCompactCurrency(rangeExample.high)}. Only ${formatCompactCurrency(rangeExample.totalContributed)} of it is money you put in.`,
      chart: renderRangeChartSvg({ series: rangeExample.series, startAge: rangeExample.startAge, goalAmount: rangeExample.goalAmount }),
      stats: [
        { label: "You put in", value: rangeExample.totalContributed, compact: true },
        { label: `Typical at ${endAge}`, value: rangeExample.typical, compact: true },
        { label: `Odds of ${formatCompactCurrency(rangeExample.goalAmount)}`, text: `${rangeExample.goalProbabilityPct}%` }
      ]
    });
  }

  const debt = askEngine("Should I pay off debt or start investing?")?.comparison;
  if (debt?.options?.length) {
    scenes.push({
      question: "Should I pay off debt or start investing?",
      verdict: { debt: "Debt first", invest: "Invest", split: "Split it" }[debt.call] || "PAM's pick",
      headline: debt.headline,
      body: debt.reason,
      compare: { title: `Net worth after ${debt.years} years`, options: debt.options }
    });
  }
  return scenes;
}

// Times (seconds into the scene) for each part of one scene.
function sceneTimeline(scene) {
  const typed = TYPE_START + scene.question.length * TYPE_PER_CHAR;
  const send = typed + 0.25;
  const steps = [send + 0.1, send + 0.1 + STEP_GAP, send + 0.1 + STEP_GAP * 2];
  const answer = steps[2] + STEP_GAP + 0.15;
  const phrases = splitPhrases(scene.headline);
  const sentences = splitSentences(scene.body);
  const headlineAt = answer + 0.3;
  const bodyAt = headlineAt + phrases.length * 0.1 + 0.15;
  const extrasAt = bodyAt + sentences.length * 0.38 + 0.05;
  const extrasEnd = extrasAt + (scene.chart ? 1.8 : scene.compare ? scene.compare.options.length * 0.25 + 0.4 : 0.9);
  const leave = extrasEnd + HOLD_AFTER_REVEAL;
  return { typed, send, steps, answer, phrases, sentences, headlineAt, bodyAt, extrasAt, leave, end: leave + LEAVE_DURATION };
}

function splitPhrases(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const phrases = [];
  let current = [];
  words.forEach((word) => {
    current.push(word);
    if (current.length >= 3 || /[,.;:!?]$/.test(word)) {
      phrases.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) phrases.push(current.join(" "));
  return phrases;
}

function splitSentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
}

function piece(at, className, inner, tag = "div") {
  return `<${tag} class="ld-piece ${className}" data-at="${at.toFixed(2)}">${inner}</${tag}>`;
}

function renderStage(scene) {
  const t = sceneTimeline(scene);
  const stepLabels = ["Reading your question", "Running it against your numbers", "Checking your goals"];
  const statsHtml = scene.stats
    ? `<div class="ld-stats">${scene.stats.map((stat, index) => piece(t.extrasAt + index * 0.12, "ld-stat", `
        <span>${escapeHtml(stat.label)}</span>
        <strong ${stat.text ? "" : `data-count="${Math.round(stat.value)}" data-count-at="${(t.extrasAt + index * 0.12).toFixed(2)}" ${stat.compact ? "data-compact" : ""}`}>${escapeHtml(stat.text || (stat.compact ? formatCompactCurrency(stat.value) : formatCurrency(stat.value)))}</strong>
        ${stat.sub ? `<small>${escapeHtml(stat.sub)}</small>` : ""}
      `)).join("")}</div>`
    : "";
  const chartHtml = scene.chart ? piece(t.extrasAt + 0.35, "ld-chart", scene.chart) : "";
  const compareHtml = scene.compare
    ? `<div class="ld-compare">
        ${piece(t.extrasAt, "ld-compare-title", escapeHtml(scene.compare.title), "p")}
        ${scene.compare.options.map((option, index) => piece(t.extrasAt + 0.2 + index * 0.25, `ld-compare-row${option.recommended ? " is-pick" : ""}`, `
          <span>${escapeHtml(option.label)}${option.recommended ? `<b>PAM's pick</b>` : ""}</span>
          <strong data-count="${Math.round(option.net)}" data-count-at="${(t.extrasAt + 0.2 + index * 0.25).toFixed(2)}">${escapeHtml(formatCurrency(option.net))}</strong>
        `)).join("")}
      </div>`
    : "";
  return `
    <div class="ld-thinking" data-collapse-at="${t.answer.toFixed(2)}">
      ${stepLabels.map((label, index) => `
        <div class="ld-piece ld-step" data-at="${(t.steps[index] - 0.05).toFixed(2)}" data-done="${(t.steps[index] + STEP_GAP - 0.05).toFixed(2)}">
          <i aria-hidden="true"></i><span>${label}</span>
        </div>
      `).join("")}
    </div>
    <div class="ld-answer">
      ${piece(t.answer, "ld-trail", `<i aria-hidden="true">✓</i> Checked against the sample numbers`, "p")}
      ${piece(t.answer + 0.12, `ld-pop verdict-badge ${VERDICT_CLASS[scene.verdict] || "verdict-worth"}`, escapeHtml(scene.verdict), "span")}
      <h3 class="ld-headline">${t.phrases.map((phrase, index) => piece(t.headlineAt + index * 0.1, "ld-phrase", escapeHtml(phrase), "span")).join(" ")}</h3>
      <p class="ld-body">${t.sentences.map((sentence, index) => piece(t.bodyAt + index * 0.38, "ld-sentence", escapeHtml(sentence), "span")).join(" ")}</p>
      ${chartHtml}${statsHtml}${compareHtml}
    </div>
  `;
}

export function renderLiveDemo(scenes) {
  if (!scenes.length) return "";
  return `
    <div class="marketing-sample-card live-demo" data-live-demo aria-label="Example: PAM answering money questions">
      <div class="marketing-sample-head">
        <span class="marketing-sample-dots"><i></i><i></i><i></i></span>
        <strong>Ask PAM</strong>
        <span class="data-source-badge">EXAMPLE</span>
      </div>
      <div class="live-demo-input" aria-hidden="true">
        <span class="live-demo-typed" data-ld-typed></span><i class="live-demo-caret"></i>
        <span class="live-demo-send" data-ld-send>↑</span>
      </div>
      <div class="live-demo-stage" data-ld-stage aria-hidden="true"></div>
      <div class="live-demo-progress">
        ${scenes.map((scene, index) => `<button type="button" data-ld-jump="${index}" aria-label="Show example ${index + 1}: ${escapeHtml(scene.question)}"><i></i></button>`).join("")}
      </div>
      <ul class="sr-only">
        ${scenes.map((scene) => `<li>${escapeHtml(scene.question)} PAM: ${escapeHtml(scene.verdict)}. ${escapeHtml(scene.headline)} ${escapeHtml(scene.body)}</li>`).join("")}
      </ul>
    </div>
  `;
}

const clock = { scene: 0, time: 0, last: 0, raf: 0, element: null, visible: true, observer: null, timeline: null };

function easeOut(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function update(scenes) {
  const root = clock.element;
  if (!root?.isConnected) return;
  const scene = scenes[clock.scene];
  const t = clock.timeline;
  const now = clock.time;
  const typedChars = Math.max(0, Math.min(scene.question.length, Math.floor((now - TYPE_START) / TYPE_PER_CHAR)));
  root.querySelector("[data-ld-typed]").textContent = scene.question.slice(0, typedChars);
  root.classList.toggle("is-typing", now < t.typed);
  root.querySelector("[data-ld-send]").classList.toggle("is-sent", now >= t.send && now < t.send + 0.6);
  const stage = root.querySelector("[data-ld-stage]");
  stage.classList.toggle("is-leaving", now >= t.leave);
  stage.querySelector(".ld-thinking")?.classList.toggle("is-collapsed", now >= t.answer);
  stage.querySelectorAll(".ld-piece").forEach((element) => {
    element.classList.toggle("is-in", now >= Number(element.dataset.at));
    if (element.dataset.done) element.classList.toggle("is-done", now >= Number(element.dataset.done));
  });
  stage.querySelectorAll("[data-count]").forEach((element) => {
    const progress = Math.min(Math.max((now - Number(element.dataset.countAt)) / 0.8, 0), 1);
    const value = Math.round(Number(element.dataset.count) * easeOut(progress));
    element.textContent = element.hasAttribute("data-compact") ? formatCompactCurrency(value) : formatCurrency(value);
  });
  root.querySelectorAll("[data-ld-jump]").forEach((button, index) => {
    const fill = index < clock.scene ? 1 : index > clock.scene ? 0 : Math.min(now / t.end, 1);
    button.style.setProperty("--fill", fill.toFixed(3));
    button.classList.toggle("is-current", index === clock.scene);
  });
}

function showScene(scenes, index, time = 0) {
  clock.scene = (index + scenes.length) % scenes.length;
  clock.timeline = sceneTimeline(scenes[clock.scene]);
  // Infinity means "show it finished" (just before it would leave).
  clock.time = time === Infinity ? clock.timeline.leave - 0.01 : time;
  const stage = clock.element?.querySelector("[data-ld-stage]");
  if (stage) stage.innerHTML = renderStage(scenes[clock.scene]);
  update(scenes);
}

function tick(scenes, timestamp) {
  if (!clock.element?.isConnected) {
    clock.raf = 0;
    return;
  }
  const delta = clock.last ? Math.min((timestamp - clock.last) / 1000, 0.1) : 0;
  clock.last = timestamp;
  if (clock.visible && !document.hidden) {
    clock.time += delta;
    if (clock.time >= clock.timeline.end) showScene(scenes, clock.scene + 1);
    else update(scenes);
  }
  clock.raf = requestAnimationFrame((next) => tick(scenes, next));
}

// Called after every render. Picks up the same scene and time if the page
// re-rendered, and pauses while the demo is off screen.
export function mountLiveDemo(scenes) {
  const element = document.querySelector("[data-live-demo]");
  if (!element || !scenes.length) return;
  const fresh = clock.element === null;
  clock.element = element;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.querySelectorAll("[data-ld-jump]").forEach((button) => {
    button.addEventListener("click", () => showScene(scenes, Number(button.dataset.ldJump), reduceMotion ? Infinity : 0));
  });
  if (reduceMotion) {
    // No motion: each example is shown complete; the dots switch between them.
    element.classList.add("is-static");
    showScene(scenes, clock.scene, Infinity);
    return;
  }
  showScene(scenes, fresh ? 0 : clock.scene, fresh ? 0 : clock.time);
  clock.observer?.disconnect();
  if (typeof IntersectionObserver !== "undefined") {
    clock.observer = new IntersectionObserver((entries) => {
      clock.visible = entries.some((entry) => entry.isIntersecting);
    }, { threshold: 0.25 });
    clock.observer.observe(element);
  }
  if (!clock.raf) {
    clock.last = 0;
    clock.raf = requestAnimationFrame((timestamp) => tick(scenes, timestamp));
  }
}
