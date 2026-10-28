// Private admin page: a glass window with a side rail of views. Overview
// (stats), People (waitlist), Partners (program requests with follow-up
// status), Controls (gate, kill switches, banner, invite codes), Email
// (waitlist update + export) and System (integrations + live health check).
// All user-written text is inserted with textContent, never innerHTML.

const SECRET_KEY = "pam:admin-secret";
const ENDPOINT = "/api/admin/send_waitlist_update";
const PARTNER_STAGES = {
  "School or employer partner": "Schools & employers",
  "Creator affiliate": "Creators",
  "Advisor referral partner": "Advisors"
};
const PARTNER_STATUS_LABELS = { new: "New", contacted: "Contacted", accepted: "Accepted", declined: "Declined" };

const form = document.getElementById("admin-login");
const statusLine = document.getElementById("admin-status");
const appShell = document.getElementById("admin-app");
const rail = document.getElementById("admin-rail");
const content = document.getElementById("admin-content");
const viewTitle = document.getElementById("admin-view-title");
const viewSub = document.getElementById("admin-view-sub");
const updatedLine = document.getElementById("admin-updated");
const refreshButton = document.getElementById("admin-refresh");
const toast = document.getElementById("admin-toast");

// Static icons (no user data), 24px line glyphs.
const ICONS = {
  overview: '<path d="M4 13h6V4H4zm10 7h6V11h-6zM4 20h6v-4H4zm10-11h6V4h-6z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.3.2 4.2 1.8 4.8 4.8"/>',
  partners: '<path d="M3 11l4-4 3 2 4-3 7 5"/><path d="M7 7v9l5 3 5-3v-5"/>',
  controls: '<path d="M5 5v14M12 5v14M19 5v14"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="8" r="2"/>',
  email: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  system: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>'
};

const VIEWS = [
  { id: "overview", label: "Overview", sub: "How PAM is doing, last 30 days." },
  { id: "people", label: "People", sub: "Everyone on the waitlist." },
  { id: "partners", label: "Partners", sub: "Schools, employers, creators and advisors who reached out." },
  { id: "controls", label: "Controls", sub: "Changes reach the site within about a minute. No deploy needed." },
  { id: "email", label: "Email", sub: "Send the waitlist update, or download everyone as a CSV." },
  { id: "system", label: "System", sub: "What's connected, and whether it's answering." }
];

const data = { stats: null, settings: null, history: [], environment: null, people: null, partnerStatuses: {}, generatedAt: "" };

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attrs || {})) node.setAttribute(key, value);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "admin-icon");
  svg.innerHTML = ICONS[name] || "";
  return svg;
}

function secret() {
  return sessionStorage.getItem(SECRET_KEY) || "";
}

async function api(path = ENDPOINT, init = {}) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", "x-pam-admin-secret": secret(), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" });
}

let toastTimer = 0;
function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
}

async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    notify(label);
  } catch (_error) {
    notify("Couldn't copy. Select it and copy manually.");
  }
}

// ─── Building blocks ─────────────────────────────────────────────────────────
function platter(title, note, body, extraClass = "") {
  return el("section", { className: `admin-platter ${extraClass}`.trim() }, [
    title ? el("h2", { text: title }) : null,
    note ? el("p", { className: "admin-note", text: note }) : null,
    body
  ]);
}

function grid(children, columns = 2) {
  return el("div", { className: `admin-grid admin-grid-${columns}` }, children);
}

// Rounded pill bars. Widths go through the CSSOM (allowed under the page's
// style-src 'self' CSP, unlike style attributes) and grow in after render.
function barList(rows, { valueKey = "count", labelKey = "label" } = {}) {
  if (!rows || !rows.length) return el("p", { className: "admin-empty", text: "Nothing yet." });
  const max = Math.max(...rows.map((row) => row[valueKey]), 1);
  const list = el("ul", { className: "admin-bars" });
  rows.forEach((row, index) => {
    const fill = el("i");
    fill.style.setProperty("--w", `${Math.max((row[valueKey] / max) * 100, 2).toFixed(1)}%`);
    fill.style.setProperty("--delay", `${Math.min(index * 40, 400)}ms`);
    const track = el("span", { className: "admin-bar-track", attrs: { role: "img", "aria-label": `${row[labelKey]}: ${row[valueKey]}` } }, [fill]);
    list.appendChild(el("li", {}, [el("span", { className: "admin-bar-label", text: row[labelKey] }), track, el("strong", { text: row[valueKey] })]));
  });
  return list;
}

// Vertical pill columns (daily activity).
function columnChart(rows) {
  if (!rows || !rows.length) return el("p", { className: "admin-empty", text: "No activity yet." });
  const ordered = [...rows].reverse();
  const max = Math.max(...ordered.map((row) => row.count), 1);
  const chart = el("div", { className: "admin-columns", attrs: { role: "img", "aria-label": ordered.map((row) => `${row.label}: ${row.count}`).join(", ") } });
  ordered.forEach((row, index) => {
    const pill = el("i");
    pill.style.setProperty("--h", `${Math.max((row.count / max) * 100, 4).toFixed(1)}%`);
    pill.style.setProperty("--delay", `${index * 35}ms`);
    chart.appendChild(el("div", { className: "admin-column" }, [
      el("span", { className: "admin-column-value", text: row.count }),
      el("span", { className: "admin-column-track" }, [pill]),
      el("span", { className: "admin-column-label", text: String(row.label).replace(/^[A-Za-z]{3} /, "") })
    ]));
  });
  return chart;
}

function ring(percent, label, caption) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "admin-ring");
  svg.setAttribute("aria-hidden", "true");
  const track = document.createElementNS(ns, "circle");
  const value = document.createElementNS(ns, "circle");
  for (const circle of [track, value]) {
    circle.setAttribute("cx", "32");
    circle.setAttribute("cy", "32");
    circle.setAttribute("r", "26");
    circle.setAttribute("pathLength", "100");
  }
  track.setAttribute("class", "admin-ring-track");
  value.setAttribute("class", "admin-ring-value");
  value.setAttribute("stroke-dasharray", `${Math.max(Math.min(Number(percent) || 0, 100), 0)} 100`);
  svg.append(track, value);
  return el("div", { className: "admin-ring-wrap", attrs: { role: "img", "aria-label": `${label}: ${percent === null ? "n/a" : `${percent}%`}` } }, [
    svg,
    el("strong", { className: "admin-ring-number", text: percent === null ? "n/a" : `${percent}%` }),
    el("span", { className: "admin-ring-label", text: label }),
    caption ? el("small", { text: caption }) : null
  ]);
}

function quoteList(items, map, empty) {
  if (!items || !items.length) return el("p", { className: "admin-empty", text: empty });
  const list = el("ul", { className: "admin-quotes" });
  for (const item of items) {
    const { text, meta } = map(item);
    list.appendChild(el("li", {}, [el("p", { text }), el("small", { text: meta })]));
  }
  return list;
}

function chip(label, tone) {
  return el("span", { className: `admin-chip admin-chip-${tone}`, text: label });
}

function button(label, onClick, { primary = false, danger = false, small = false, type = "button" } = {}) {
  const node = el("button", { className: `admin-btn${primary ? " admin-btn-primary" : ""}${danger ? " admin-btn-danger" : ""}${small ? " admin-btn-small" : ""}`, text: label, attrs: { type } });
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

function segmented(options, value, onChange, label) {
  const group = el("div", { className: "admin-segmented", attrs: { role: "radiogroup", "aria-label": label } });
  for (const [optionValue, optionLabel] of options) {
    const item = el("button", { className: optionValue === value ? "is-active" : "", text: optionLabel, attrs: { type: "button", role: "radio", "aria-checked": String(optionValue === value) } });
    item.addEventListener("click", () => {
      group.querySelectorAll("button").forEach((other) => {
        other.classList.toggle("is-active", other === item);
        other.setAttribute("aria-checked", String(other === item));
      });
      onChange(optionValue);
    });
    group.appendChild(item);
  }
  return group;
}

function toggle(labelText, checked, name, extra) {
  const input = el("input", { attrs: { type: "checkbox", role: "switch", name } });
  input.checked = checked;
  return el("label", { className: "admin-toggle" }, [el("span", { text: labelText }), extra || null, input, el("i", { attrs: { "aria-hidden": "true" } })]);
}

// ─── Overview ────────────────────────────────────────────────────────────────
function renderOverview() {
  const { stats } = data;
  const aiPct = stats.aiHealth?.successPct === null || stats.aiHealth?.successPct === undefined ? null : stats.aiHealth.successPct;
  const lastStep = stats.funnel[stats.funnel.length - 1];
  const firstStep = stats.funnel[0];
  const funnelPct = firstStep?.sessions ? Math.round((lastStep.sessions / firstStep.sessions) * 100) : null;

  const kpis = el("div", { className: "admin-kpis" });
  for (const [label, value, note] of [
    ["Waitlist", stats.totals.waitlist, "people"],
    ["Decisions run", stats.totals.decisionsRun, "all time"],
    ["Saved profiles", stats.totals.accounts ?? "n/a", "accounts"],
    ["Partner requests", stats.totals.partnerRequests, "open the Partners tab"]
  ]) {
    kpis.appendChild(el("div", { className: "admin-kpi" }, [el("span", { text: label }), el("strong", { text: value }), el("small", { text: note })]));
  }
  const rings = el("div", { className: "admin-rings" }, [
    ring(aiPct, "AI answers", `${stats.aiHealth?.received ?? 0} delivered, ${stats.aiHealth?.unavailable ?? 0} fell back`),
    ring(funnelPct, "Signup to first decision", firstStep ? `${lastStep.sessions} of ${firstStep.sessions} sessions` : "")
  ]);

  const funnelRows = stats.funnel.map((step) => ({ label: step.conversionPct === null ? step.label : `${step.label} (${step.conversionPct}%)`, count: step.sessions }));
  return el("div", { className: "admin-stack" }, [
    grid([kpis, platter("", "", rings, "admin-platter-rings")], 2),
    grid([
      platter("Daily active sessions", "Last 14 days with activity.", columnChart(stats.dailySessions || [])),
      platter("Signup funnel", "Unique sessions per step. Only visitors who allowed analytics are counted.", barList(funnelRows))
    ], 2),
    grid([
      platter("What people ask about", "Decision questions grouped by topic.", barList(stats.questionTopics)),
      platter("Feature usage", "Last 30 days.", barList(stats.highlights || []))
    ], 2),
    grid([
      platter("Waitlist by stage", "", barList(stats.waitlistByStage)),
      platter("Waitlist by age", "", barList(stats.waitlistByAge)),
      platter("Signups per week", "Week starting Monday.", barList(stats.waitlistByWeek))
    ], 3),
    grid([
      platter("What waitlist members want help with", "Most recent first.", quoteList(stats.recentGoals, (item) => ({ text: item.goal, meta: [item.stage, formatDate(item.when)].filter(Boolean).join(" · ") }), "Nothing yet.")),
      platter("Recent feedback", "", quoteList(stats.recentFeedback, (item) => ({ text: item.message, meta: [item.rating ? `${item.rating}/5` : "", item.page, formatDate(item.when)].filter(Boolean).join(" · ") }), "No feedback yet."))
    ], 2)
  ]);
}

// ─── People ──────────────────────────────────────────────────────────────────
async function ensurePeople(force = false) {
  if (data.people && !force) return true;
  const { response, payload } = await api(`${ENDPOINT}?view=people`, { method: "GET" });
  if (!response.ok || !payload.ok) {
    notify(payload.error || "Couldn't load people.");
    return false;
  }
  data.people = payload.people || [];
  data.partnerStatuses = payload.partnerStatuses || {};
  return true;
}

function renderPeople() {
  const state = { query: "", filter: "people" };
  const wrap = el("div", { className: "admin-stack" });
  const count = el("span", { className: "admin-count" });
  const search = el("input", { className: "admin-search", attrs: { type: "search", placeholder: "Search name, email, stage, goal", "aria-label": "Search people" } });
  const list = el("div", { className: "admin-table", attrs: { role: "table", "aria-label": "Waitlist" } });

  const draw = () => {
    const query = state.query.trim().toLowerCase();
    const rows = data.people.filter((person) => {
      const isPartner = Boolean(PARTNER_STAGES[person.stage]);
      if (state.filter === "people" && isPartner) return false;
      if (state.filter === "partners" && !isPartner) return false;
      return !query || [person.email, person.name, person.stage, person.goal].join(" ").toLowerCase().includes(query);
    });
    count.textContent = `${rows.length} ${rows.length === 1 ? "person" : "people"}`;
    list.replaceChildren(el("div", { className: "admin-row admin-row-head", attrs: { role: "row" } }, [
      el("span", { text: "Person", attrs: { role: "columnheader" } }),
      el("span", { text: "Stage", attrs: { role: "columnheader" } }),
      el("span", { text: "Wants help with", attrs: { role: "columnheader" } }),
      el("span", { text: "Joined", attrs: { role: "columnheader" } }),
      el("span", { text: "", attrs: { role: "columnheader" } })
    ]));
    if (!rows.length) {
      list.appendChild(el("p", { className: "admin-empty", text: query ? "No one matches that search." : "No one here yet." }));
      return;
    }
    for (const person of rows.slice(0, 500)) {
      const actions = el("span", { className: "admin-row-actions" }, [
        button("Copy email", () => copyText(person.email, "Email copied"), { small: true }),
        button("Delete", async (event) => {
          const target = event.currentTarget;
          if (!window.confirm(`Remove ${person.email} from the waitlist? This can't be undone.`)) return;
          target.disabled = true;
          const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ action: "delete_person", email: person.email }) });
          if (!response.ok || !payload.ok) {
            notify(payload.error || "Couldn't delete.");
            target.disabled = false;
            return;
          }
          data.people = data.people.filter((other) => other.email !== person.email);
          notify("Removed from the waitlist");
          draw();
        }, { small: true, danger: true })
      ]);
      list.appendChild(el("div", { className: "admin-row", attrs: { role: "row" } }, [
        el("span", { className: "admin-person", attrs: { role: "cell" } }, [el("strong", { text: person.name || person.email.split("@")[0] }), el("small", { text: person.email })]),
        el("span", { attrs: { role: "cell" } }, [person.stage ? chip(PARTNER_STAGES[person.stage] || person.stage, PARTNER_STAGES[person.stage] ? "partner" : "neutral") : el("small", { text: "Not given" })]),
        el("span", { className: "admin-goal", text: person.goal || "", attrs: { role: "cell" } }),
        el("span", { className: "admin-date", text: formatDate(person.joined), attrs: { role: "cell" } }),
        actions
      ]));
    }
    if (rows.length > 500) list.appendChild(el("p", { className: "admin-note", text: "Showing the newest 500. Search to narrow it down, or download the CSV from Email." }));
  };

  search.addEventListener("input", () => { state.query = search.value; draw(); });
  wrap.append(
    el("div", { className: "admin-toolbar" }, [
      search,
      segmented([["people", "Waitlist"], ["partners", "Partner requests"], ["all", "Everyone"]], state.filter, (value) => { state.filter = value; draw(); }, "Filter people"),
      count
    ]),
    platter("", "", list, "admin-platter-flush")
  );
  draw();
  return wrap;
}

// ─── Partners ────────────────────────────────────────────────────────────────
const REPLY_SUBJECTS = {
  "School or employer partner": "PAM for your group",
  "Creator affiliate": "Your PAM creator application",
  "Advisor referral partner": "Your PAM referral link"
};

function renderPartners() {
  const state = { program: "all", status: "open" };
  const wrap = el("div", { className: "admin-stack" });
  const listWrap = el("div", { className: "admin-partner-list" });
  const summary = el("div", { className: "admin-kpis admin-kpis-compact" });

  const statusOf = (person) => data.partnerStatuses[person.email]?.status || "new";
  const draw = () => {
    const partners = data.people.filter((person) => PARTNER_STAGES[person.stage]);
    summary.replaceChildren(...Object.entries(PARTNER_STATUS_LABELS).map(([key, label]) => el("div", { className: "admin-kpi" }, [
      el("span", { text: label }),
      el("strong", { text: partners.filter((person) => statusOf(person) === key).length })
    ])));
    const rows = partners.filter((person) => {
      if (state.program !== "all" && person.stage !== state.program) return false;
      const status = statusOf(person);
      if (state.status === "open") return status === "new" || status === "contacted";
      return state.status === "all" || status === state.status;
    });
    if (!rows.length) {
      listWrap.replaceChildren(el("p", { className: "admin-empty", text: partners.length ? "Nothing in this filter." : "No partner requests yet. They arrive from /schools, /creators and /advisors." }));
      return;
    }
    listWrap.replaceChildren(...rows.map((person) => {
      const select = el("select", { className: "admin-select", attrs: { "aria-label": `Status for ${person.email}` } });
      for (const [value, label] of Object.entries(PARTNER_STATUS_LABELS)) {
        const option = el("option", { text: label, attrs: { value } });
        if (value === statusOf(person)) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", async () => {
        select.disabled = true;
        const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ action: "set_partner_status", email: person.email, status: select.value }) });
        select.disabled = false;
        if (!response.ok || !payload.ok) {
          notify(payload.error || "Couldn't save.");
          select.value = statusOf(person);
          return;
        }
        data.partnerStatuses[person.email] = { status: select.value, when: new Date().toISOString() };
        notify(`Marked ${PARTNER_STATUS_LABELS[select.value].toLowerCase()}`);
        draw();
      });
      const greeting = person.name ? `Hi ${person.name.split(" ")[0]},` : "Hi,";
      const reply = el("a", {
        className: "admin-btn admin-btn-primary admin-btn-small",
        text: "Reply",
        attrs: { href: `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(REPLY_SUBJECTS[person.stage] || "PAM")}&body=${encodeURIComponent(`${greeting}\n\nThanks for reaching out about PAM.\n\n`)}` }
      });
      return el("article", { className: "admin-partner" }, [
        el("div", { className: "admin-partner-main" }, [
          chip(PARTNER_STAGES[person.stage], "partner"),
          el("h3", { text: person.goal || "(nothing given)" }),
          el("p", { className: "admin-partner-meta", text: [person.name, person.email, formatDate(person.joined)].filter(Boolean).join(" · ") })
        ]),
        el("div", { className: "admin-partner-actions" }, [select, reply, button("Copy email", () => copyText(person.email, "Email copied"), { small: true })])
      ]);
    }));
  };

  wrap.append(
    summary,
    el("div", { className: "admin-toolbar" }, [
      segmented([["all", "All programs"], ["School or employer partner", "Schools"], ["Creator affiliate", "Creators"], ["Advisor referral partner", "Advisors"]], state.program, (value) => { state.program = value; draw(); }, "Filter by program"),
      segmented([["open", "Open"], ["accepted", "Accepted"], ["declined", "Declined"], ["all", "All"]], state.status, (value) => { state.status = value; draw(); }, "Filter by status")
    ]),
    listWrap
  );
  draw();
  return wrap;
}

// ─── Controls ────────────────────────────────────────────────────────────────
function randomInviteCode() {
  const words = ["maple", "harbor", "summit", "orbit", "cedar", "lumen", "atlas", "river", "north", "ember", "pilot", "quartz"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100)}`;
}

function describeSettings(settings) {
  const parts = [`Gate: ${settings.launchGate === true ? "on" : settings.launchGate === false ? "off" : "Vercel setting"}`];
  if (settings.disableAi) parts.push("AI paused");
  if (settings.disablePlaid) parts.push("bank connections paused");
  if (settings.disableEmail) parts.push("emails paused");
  parts.push(settings.announcement ? `Banner: "${settings.announcement}"` : "No banner");
  if (Array.isArray(settings.inviteCodes)) parts.push(`${settings.inviteCodes.length} invite code${settings.inviteCodes.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function renderControls() {
  const { settings, environment } = data;
  const draft = {
    launchGate: settings.launchGate === true ? "on" : settings.launchGate === false ? "off" : "vercel",
    inviteCodes: [...(settings.inviteCodes || [])]
  };
  const formNode = el("form", { className: "admin-stack", attrs: { id: "admin-controls" } });

  const gate = segmented([["vercel", `Vercel setting (${environment.launchGateEnv ? "on" : "off"})`], ["on", "On: invite only"], ["off", "Off: open signup"]], draft.launchGate, (value) => { draft.launchGate = value; }, "Private beta gate");

  const switches = el("div", { className: "admin-toggles" });
  for (const [key, label, envKey] of [["disableAi", "Pause AI answers", "ai"], ["disablePlaid", "Pause bank connections", "plaid"], ["disableEmail", "Pause waitlist emails", "email"]]) {
    switches.appendChild(toggle(label, settings[key] === true, key, environment.killSwitches[envKey] ? chip("Also paused in Vercel", "warn") : null));
  }

  const announcement = el("input", { className: "admin-input", attrs: { type: "text", name: "announcement", maxlength: "160", placeholder: "Leave blank for no banner", "aria-label": "Homepage announcement" } });
  announcement.value = settings.announcement || "";
  const preview = el("div", { className: "admin-banner-preview" });
  const counter = el("small", { className: "admin-note" });
  const drawPreview = () => {
    preview.textContent = announcement.value.trim() || "No banner is showing.";
    preview.classList.toggle("is-empty", !announcement.value.trim());
    counter.textContent = `${announcement.value.length}/160`;
  };
  announcement.addEventListener("input", drawPreview);
  drawPreview();

  const codeList = el("ul", { className: "admin-codes" });
  const codeInput = el("input", { className: "admin-input", attrs: { type: "text", maxlength: "40", placeholder: "e.g. state-u-fall", "aria-label": "New invite code" } });
  const drawCodes = () => {
    codeList.replaceChildren(...(draft.inviteCodes.length ? draft.inviteCodes.map((code) => el("li", {}, [
      el("code", { text: code }),
      button("Copy", () => copyText(code, "Code copied"), { small: true }),
      button("Revoke", () => { draft.inviteCodes = draft.inviteCodes.filter((other) => other !== code); drawCodes(); }, { small: true, danger: true })
    ])) : [el("li", { className: "admin-empty", text: environment.setup.inviteCodes ? "No extra codes. The codes in Vercel still work." : "No codes yet. Until you add one, the public fallback codes work." })]));
  };
  const addCode = (value) => {
    const code = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!/^[a-z0-9][a-z0-9 -]{2,38}[a-z0-9]$/.test(code)) {
      notify("Use 4 to 40 letters, numbers, spaces or dashes.");
      return;
    }
    if (draft.inviteCodes.includes(code)) {
      notify("That code already exists.");
      return;
    }
    draft.inviteCodes.push(code);
    codeInput.value = "";
    drawCodes();
  };
  drawCodes();

  const saveMessage = el("p", { className: "admin-status", attrs: { role: "status" } });
  formNode.append(
    grid([
      platter("Private beta gate", "Who can get past the homepage.", gate),
      platter("Pause services", "Protects costs. Vercel switches still win if they're on.", switches)
    ], 2),
    grid([
      platter("Homepage announcement", "Shown to everyone at the top of the site.", el("div", { className: "admin-stack admin-stack-tight" }, [announcement, counter, preview])),
      platter("Invite codes", "Codes people can enter at \"Have an invite code?\". Changes apply when you save.", el("div", { className: "admin-stack admin-stack-tight" }, [
        codeList,
        el("div", { className: "admin-inline" }, [codeInput, button("Add", () => addCode(codeInput.value)), button("Generate", () => addCode(randomInviteCode()))])
      ]))
    ], 2),
    el("div", { className: "admin-savebar" }, [button("Save changes", null, { primary: true, type: "submit" }), saveMessage]),
    platter("Change history", "Most recent first.", quoteList(data.history, (item) => ({ text: describeSettings(item.settings), meta: formatDate(item.when, true) }), "No changes yet."))
  );
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCode(codeInput.value);
    }
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(formNode);
    const settingsPatch = {
      launchGate: draft.launchGate === "on" ? true : draft.launchGate === "off" ? false : null,
      disableAi: values.get("disableAi") === "on",
      disablePlaid: values.get("disablePlaid") === "on",
      disableEmail: values.get("disableEmail") === "on",
      announcement: String(values.get("announcement") || ""),
      inviteCodes: draft.inviteCodes
    };
    saveMessage.textContent = "Saving...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ action: "update_settings", settings: settingsPatch }) });
    if (!response.ok || !payload.ok) {
      saveMessage.textContent = payload.error || "Couldn't save.";
      return;
    }
    saveMessage.textContent = "";
    notify("Saved. Live within about a minute.");
    await loadStats();
  });
  return formNode;
}

// ─── Email ───────────────────────────────────────────────────────────────────
function renderEmail() {
  const { environment } = data;
  const message = el("p", { className: "admin-status", attrs: { role: "status" } });
  const send = button("Send to waitlist", null, { primary: true });
  send.disabled = true;
  let recipients = 0;

  const preview = button("Preview update email", async () => {
    message.textContent = "Checking recipients...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ dryRun: true }) });
    if (!response.ok || !payload.ok) {
      message.textContent = payload.error || "Preview failed.";
      return;
    }
    recipients = Number(payload.activeAudienceContacts || payload.waitlistRows || 0);
    message.textContent = `"${payload.subject}" would go to ${recipients} subscribed people.`;
    send.disabled = !(environment.setup.mailingAddress && recipients > 0);
  });

  send.addEventListener("click", async () => {
    if (!window.confirm(`Send the update email to ${recipients} people now? This can't be undone.`)) return;
    send.disabled = true;
    message.textContent = "Sending...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ dryRun: false }) });
    message.textContent = response.ok && payload.ok ? `Sent. Broadcast ${payload.broadcastId}.` : payload.error || "Send failed.";
  });

  const exportButton = button("Download waitlist CSV", async () => {
    message.textContent = "Preparing CSV...";
    const response = await fetch(`${ENDPOINT}?export=waitlist`, { headers: { "x-pam-admin-secret": secret() } });
    if (!response.ok) {
      message.textContent = "Export failed.";
      return;
    }
    const blob = await response.blob();
    const link = el("a", { attrs: { href: URL.createObjectURL(blob), download: `pam-waitlist-${new Date().toISOString().slice(0, 10)}.csv` } });
    document.body.appendChild(link);
    link.click();
    link.remove();
    message.textContent = "Downloaded.";
  });

  return el("div", { className: "admin-stack" }, [
    grid([
      platter("Waitlist update", environment.setup.mailingAddress
        ? "Preview first. Sending goes to everyone subscribed in your Resend audience, with an unsubscribe link."
        : "Sending is off until PAM_MAILING_ADDRESS is set in Vercel (CAN-SPAM). Preview still works.", el("div", { className: "admin-inline" }, [preview, send])),
      platter("Export", "Everyone on the waitlist, including partner requests, as a spreadsheet.", el("div", { className: "admin-inline" }, [exportButton]))
    ], 2),
    message
  ]);
}

// ─── System ──────────────────────────────────────────────────────────────────
async function renderSystem() {
  const { environment, settings } = data;
  const statusResponse = await fetch("/api/integrations/status").then((response) => response.json()).catch(() => ({}));
  const rows = [
    ["Supabase", "Database", statusResponse.supabase?.configured, statusResponse.supabase?.connected === false ? "Configured but not reachable" : statusResponse.supabase?.schemaReady === false ? "Connected, schema incomplete" : statusResponse.supabase?.mode || ""],
    ["Plaid", "Bank connections", statusResponse.plaid?.configured, `Mode: ${statusResponse.plaid?.mode || "unknown"}`, environment.killSwitches.plaid || settings.disablePlaid],
    ["Anthropic", "AI answers", statusResponse.ai?.configured, "", environment.killSwitches.ai || settings.disableAi],
    ["Resend", "Email", statusResponse.email?.configured, statusResponse.email?.newsletterAudienceConfigured ? "Waitlist audience connected" : "No waitlist audience", environment.killSwitches.email || settings.disableEmail],
    ["Clerk", "Sign-in", statusResponse.clerk?.configured, ""],
    ["Stripe", "Billing", environment.setup.stripe, environment.setup.requireSubscription ? "Subscription required" : "Subscription waived", environment.killSwitches.billing],
    ["PostHog", "Analytics", environment.setup.posthog, "Loads only after a visitor allows analytics"],
    ["Sentry", "Error reports", environment.setup.sentry, ""],
    ["Mailing address", "Required for update emails", environment.setup.mailingAddress, ""],
    ["Invite codes", "DEMO_ACCESS_CODE in Vercel", environment.setup.inviteCodes, environment.setup.inviteCodes ? "" : "Add codes in Controls instead"]
  ];
  const list = el("ul", { className: "admin-services" });
  for (const [name, role, ready, detail, paused] of rows) {
    list.appendChild(el("li", {}, [
      el("span", { className: `admin-dot ${paused ? "is-warn" : ready ? "is-ok" : "is-off"}`, attrs: { "aria-hidden": "true" } }),
      el("div", {}, [el("strong", { text: name }), el("small", { text: [role, detail].filter(Boolean).join(" · ") })]),
      chip(paused ? "Paused" : ready ? "Ready" : "Not set up", paused ? "warn" : ready ? "ok" : "off")
    ]));
  }

  const healthResult = el("div", { className: "admin-health" }, [el("p", { className: "admin-empty", text: "Checks the live site answers and how fast." })]);
  const runCheck = button("Run health check", async () => {
    healthResult.replaceChildren(el("p", { className: "admin-note", text: "Checking..." }));
    const checks = [["Site", "/api/health"], ["Integrations", "/api/integrations/status"]];
    const results = await Promise.all(checks.map(async ([label, path]) => {
      const started = performance.now();
      try {
        const response = await fetch(path, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        return { label, ok: response.ok, ms: Math.round(performance.now() - started), detail: body.version ? `Version ${body.version}` : response.ok ? "Answering" : `HTTP ${response.status}` };
      } catch (_error) {
        return { label, ok: false, ms: Math.round(performance.now() - started), detail: "No response" };
      }
    }));
    healthResult.replaceChildren(...results.map((result) => el("div", { className: "admin-health-row" }, [
      el("span", { className: `admin-dot ${result.ok ? "is-ok" : "is-off"}`, attrs: { "aria-hidden": "true" } }),
      el("strong", { text: result.label }),
      el("small", { text: result.detail }),
      el("span", { className: "admin-health-ms", text: `${result.ms} ms` })
    ])));
  }, { primary: true });

  return el("div", { className: "admin-stack" }, [
    grid([
      platter("Services", "Live status from the production server. Secrets are never shown here.", list),
      platter("Health check", "", el("div", { className: "admin-stack admin-stack-tight" }, [runCheck, healthResult]))
    ], 2)
  ]);
}

// ─── Shell ───────────────────────────────────────────────────────────────────
function currentView() {
  const id = window.location.hash.replace("#", "");
  return VIEWS.find((view) => view.id === id) || VIEWS[0];
}

function drawRail() {
  const active = currentView().id;
  rail.replaceChildren(
    el("span", { className: "admin-brand-mark", text: "PAM", attrs: { "aria-hidden": "true" } }),
    ...VIEWS.map((view) => {
      const link = el("a", { className: `admin-rail-item${view.id === active ? " is-active" : ""}`, attrs: { href: `#${view.id}`, "aria-label": view.label, title: view.label } }, [icon(view.id), el("span", { className: "admin-rail-label", text: view.label })]);
      if (view.id === active) link.setAttribute("aria-current", "page");
      return link;
    })
  );
}

let renderToken = 0;
async function drawView() {
  const token = ++renderToken;
  const view = currentView();
  drawRail();
  viewTitle.textContent = view.label;
  viewSub.textContent = view.sub;
  updatedLine.textContent = data.generatedAt ? `Updated ${formatDate(data.generatedAt, true)}` : "";
  content.classList.remove("is-ready");
  let node;
  if (view.id === "people" || view.id === "partners") {
    content.replaceChildren(el("p", { className: "admin-note admin-loading", text: "Loading..." }));
    const ok = await ensurePeople();
    if (token !== renderToken) return;
    node = ok ? (view.id === "people" ? renderPeople() : renderPartners()) : el("p", { className: "admin-empty", text: "Couldn't load. Try Refresh." });
  } else if (view.id === "system") {
    node = await renderSystem();
    if (token !== renderToken) return;
  } else {
    node = { overview: renderOverview, controls: renderControls, email: renderEmail }[view.id]();
  }
  content.replaceChildren(node);
  // Let bars, columns and rings grow in from zero.
  requestAnimationFrame(() => requestAnimationFrame(() => content.classList.add("is-ready")));
}

async function loadStats() {
  const { response, payload } = await api(ENDPOINT, { method: "GET" });
  if (response.status === 401) {
    sessionStorage.removeItem(SECRET_KEY);
    return { ok: false, message: "That secret didn't work." };
  }
  if (!response.ok || !payload.ok) return { ok: false, message: payload.error || "Could not load stats." };
  data.stats = payload.stats;
  data.settings = payload.settings;
  data.history = payload.settingsHistory || [];
  data.environment = payload.environment;
  data.generatedAt = payload.stats.generatedAt;
  return { ok: true };
}

async function open(newSecret) {
  if (newSecret) sessionStorage.setItem(SECRET_KEY, newSecret);
  statusLine.textContent = "Loading...";
  try {
    const result = await loadStats();
    if (!result.ok) {
      form.hidden = false;
      appShell.hidden = true;
      statusLine.textContent = result.message;
      return;
    }
    form.hidden = true;
    appShell.hidden = false;
    statusLine.textContent = "";
    await drawView();
  } catch (_error) {
    statusLine.textContent = "Network error. Try again.";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = String(new FormData(form).get("secret") || "").trim();
  if (value) open(value);
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  const view = currentView().id;
  const result = await loadStats();
  if (view === "people" || view === "partners") await ensurePeople(true);
  refreshButton.disabled = false;
  if (!result.ok) {
    notify(result.message);
    return;
  }
  notify("Up to date");
  await drawView();
});

window.addEventListener("hashchange", () => {
  if (!appShell.hidden) drawView();
});

if (secret()) open();
