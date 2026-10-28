// Private admin page: stats, runtime controls, integrations, waitlist email.
// All user-written text is inserted with textContent, never innerHTML.

const SECRET_KEY = "pam:admin-secret";
const ENDPOINT = "/api/admin/send_waitlist_update";
const form = document.getElementById("admin-login");
const statusLine = document.getElementById("admin-status");
const content = document.getElementById("admin-content");
const refreshButton = document.getElementById("admin-refresh");
const nav = document.getElementById("admin-nav");

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attrs || {})) node.setAttribute(key, value);
  for (const child of children) if (child) node.appendChild(child);
  return node;
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
  return date.toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
}

function card(title, note, body, extraClass = "") {
  return el("section", { className: `admin-card ${extraClass}`.trim() }, [
    el("h2", { text: title }),
    note ? el("p", { className: "admin-note", text: note }) : null,
    body
  ]);
}

// Rounded pill bars. Widths go through the CSSOM (allowed under the page's
// style-src 'self' CSP, unlike style attributes) and grow in after render.
function barList(rows, { valueKey = "count", labelKey = "label" } = {}) {
  if (!rows.length) return el("p", { className: "admin-empty", text: "Nothing yet." });
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

// Ring gauge for a percentage (visionOS-style).
function ring(percent, label) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "admin-ring");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label}: ${percent === null ? "n/a" : `${percent}%`}`);
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
  return svg;
}

function section(id, title, children) {
  return el("section", { className: "admin-section", attrs: { id } }, [el("h2", { className: "admin-section-title", text: title }), ...children]);
}

function quoteList(items, map, empty) {
  if (!items.length) return el("p", { className: "admin-empty", text: empty });
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

// ─── Controls ────────────────────────────────────────────────────────────────
function renderControls(settings, environment, history) {
  const wrap = el("form", { className: "admin-controls", attrs: { id: "admin-controls" } });
  const gateValue = settings.launchGate === true ? "on" : settings.launchGate === false ? "off" : "vercel";
  const gate = el("fieldset", { className: "admin-fieldset" }, [
    el("legend", { text: "Private beta gate" }),
    ...[["vercel", `Use the Vercel setting (currently ${environment.launchGateEnv ? "on" : "off"})`], ["on", "On: waitlist and invite codes only"], ["off", "Off: anyone can sign up"]].map(([value, label]) => {
      const input = el("input", { attrs: { type: "radio", name: "launchGate", value } });
      if (value === gateValue) input.checked = true;
      return el("label", { className: "admin-option" }, [input, el("span", { text: label })]);
    })
  ]);
  wrap.appendChild(gate);

  const switches = el("fieldset", { className: "admin-fieldset" }, [el("legend", { text: "Pause services (protects costs)" })]);
  for (const [key, label, envKey] of [["disableAi", "Pause AI answers (PAM falls back to its own math)", "ai"], ["disablePlaid", "Pause bank connections (Plaid)", "plaid"], ["disableEmail", "Pause waitlist emails", "email"]]) {
    const input = el("input", { attrs: { type: "checkbox", name: key } });
    input.checked = settings[key] === true;
    const row = el("label", { className: "admin-option" }, [input, el("span", { text: label })]);
    if (environment.killSwitches[envKey]) row.appendChild(chip("Also paused in Vercel", "warn"));
    switches.appendChild(row);
  }
  wrap.appendChild(switches);

  const announcement = el("input", { attrs: { type: "text", name: "announcement", maxlength: "160", id: "admin-announcement", placeholder: "Leave blank for no banner" } });
  announcement.value = settings.announcement || "";
  wrap.appendChild(el("label", { className: "admin-field", attrs: { for: "admin-announcement" } }, [el("span", { text: "Homepage announcement (shown to everyone, 160 characters)" }), announcement]));

  const message = el("p", { className: "admin-status", attrs: { role: "status" } });
  wrap.appendChild(el("div", { className: "admin-actions" }, [el("button", { className: "button button-primary", text: "Save controls", attrs: { type: "submit" } }), message]));

  wrap.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(wrap);
    const gateChoice = data.get("launchGate");
    const settingsPatch = {
      launchGate: gateChoice === "on" ? true : gateChoice === "off" ? false : null,
      disableAi: data.get("disableAi") === "on",
      disablePlaid: data.get("disablePlaid") === "on",
      disableEmail: data.get("disableEmail") === "on",
      announcement: String(data.get("announcement") || "")
    };
    message.textContent = "Saving...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ action: "update_settings", settings: settingsPatch }) });
    message.textContent = response.ok && payload.ok ? "Saved. Changes reach the site within about a minute." : payload.error || "Could not save.";
    if (response.ok && payload.ok) load();
  });

  const historyList = quoteList(history, (item) => ({
    text: describeSettings(item.settings),
    meta: formatDate(item.when, true)
  }), "No changes yet.");

  return [
    card("Controls", "Changes apply without a deploy. Vercel kill switches still win if they're on.", wrap, "admin-card-controls"),
    card("Change history", "Most recent first.", historyList)
  ];
}

function describeSettings(settings) {
  const parts = [`Gate: ${settings.launchGate === true ? "on" : settings.launchGate === false ? "off" : "Vercel setting"}`];
  if (settings.disableAi) parts.push("AI paused");
  if (settings.disablePlaid) parts.push("bank connections paused");
  if (settings.disableEmail) parts.push("emails paused");
  parts.push(settings.announcement ? `Banner: "${settings.announcement}"` : "No banner");
  return parts.join(" · ");
}

// ─── Integrations ────────────────────────────────────────────────────────────
async function renderIntegrations(environment, settings) {
  const statusResponse = await fetch("/api/integrations/status").then((response) => response.json()).catch(() => ({}));
  const rows = [
    ["Supabase (database)", statusResponse.supabase?.configured, statusResponse.supabase?.connected === false ? "Configured but not reachable" : statusResponse.supabase?.schemaReady === false ? "Connected, schema incomplete" : statusResponse.supabase?.mode || ""],
    ["Plaid (bank connections)", statusResponse.plaid?.configured, `Mode: ${statusResponse.plaid?.mode || "unknown"}`, environment.killSwitches.plaid || settings.disablePlaid],
    ["Anthropic (AI answers)", statusResponse.ai?.configured, statusResponse.ai?.model || "", environment.killSwitches.ai || settings.disableAi],
    ["Resend (email)", statusResponse.email?.configured, statusResponse.email?.newsletterAudienceConfigured ? "Waitlist audience connected" : "No waitlist audience", environment.killSwitches.email || settings.disableEmail],
    ["Clerk (sign-in)", statusResponse.clerk?.configured, ""],
    ["Stripe (billing)", environment.setup.stripe, environment.setup.requireSubscription ? "Subscription required" : "Subscription waived", environment.killSwitches.billing],
    ["PostHog (analytics)", environment.setup.posthog, "Loads only after a visitor allows analytics"],
    ["Sentry (errors)", environment.setup.sentry, ""],
    ["Mailing address (CAN-SPAM)", environment.setup.mailingAddress, environment.setup.mailingAddress ? "" : "Required before sending update emails"],
    ["Invite codes", environment.setup.inviteCodes, environment.setup.inviteCodes ? "" : "Using the public fallback codes"]
  ];
  const list = el("ul", { className: "admin-integrations" });
  for (const [name, ready, detail, paused] of rows) {
    const state = paused ? chip("Paused", "warn") : ready ? chip("Ready", "ok") : chip("Not set up", "off");
    list.appendChild(el("li", {}, [el("span", { className: "admin-integration-name", text: name }), state, detail ? el("small", { text: detail }) : null]));
  }
  return card("Integrations", "Live status from the production server. Secrets are never shown here.", list);
}

// ─── Waitlist email + export ─────────────────────────────────────────────────
function renderWaitlistTools(environment) {
  const message = el("p", { className: "admin-status", attrs: { role: "status" } });
  const preview = el("button", { className: "button button-secondary", text: "Preview update email", attrs: { type: "button" } });
  const send = el("button", { className: "button button-primary", text: "Send to waitlist", attrs: { type: "button", disabled: "" } });
  const exportButton = el("button", { className: "button button-secondary", text: "Download waitlist CSV", attrs: { type: "button" } });
  let recipients = 0;

  preview.addEventListener("click", async () => {
    message.textContent = "Checking recipients...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ dryRun: true }) });
    if (!response.ok || !payload.ok) {
      message.textContent = payload.error || "Preview failed.";
      return;
    }
    recipients = Number(payload.activeAudienceContacts || payload.waitlistRows || 0);
    message.textContent = `"${payload.subject}" would go to ${recipients} subscribed people.`;
    if (environment.setup.mailingAddress && recipients > 0) send.removeAttribute("disabled");
  });

  send.addEventListener("click", async () => {
    if (!window.confirm(`Send the update email to ${recipients} people now? This can't be undone.`)) return;
    send.setAttribute("disabled", "");
    message.textContent = "Sending...";
    const { response, payload } = await api(ENDPOINT, { method: "POST", body: JSON.stringify({ dryRun: false }) });
    message.textContent = response.ok && payload.ok ? `Sent. Broadcast ${payload.broadcastId}.` : payload.error || "Send failed.";
  });

  exportButton.addEventListener("click", async () => {
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

  const note = environment.setup.mailingAddress
    ? "Preview first. Sending goes to everyone subscribed in your Resend audience, with an unsubscribe link."
    : "Sending is disabled until PAM_MAILING_ADDRESS is set in Vercel (CAN-SPAM). Preview and export still work.";
  return card("Waitlist email and export", note, el("div", {}, [el("div", { className: "admin-actions" }, [preview, send, exportButton]), message]));
}

// ─── Page ────────────────────────────────────────────────────────────────────
async function render(payload) {
  const { stats, settings, settingsHistory, environment } = payload;
  content.replaceChildren();

  const aiPct = stats.aiHealth?.successPct === null || stats.aiHealth?.successPct === undefined ? null : stats.aiHealth.successPct;
  const totals = el("div", { className: "admin-totals" });
  for (const [label, value, accent] of [
    ["Waitlist", stats.totals.waitlist, "lime"],
    ["Decisions run", stats.totals.decisionsRun, "cyan"],
    ["Saved profiles", stats.totals.accounts ?? "n/a", ""],
    ["Partner requests", stats.totals.partnerRequests, ""]
  ]) {
    totals.appendChild(el("div", { className: `admin-total ${accent ? `admin-total-${accent}` : ""}`.trim() }, [el("span", { text: label }), el("strong", { text: value })]));
  }
  totals.appendChild(el("div", { className: "admin-total admin-total-ring" }, [
    ring(aiPct, "AI answer success"),
    el("div", {}, [el("span", { text: "AI answer success" }), el("strong", { text: aiPct === null ? "n/a" : `${aiPct}%` })])
  ]));

  const funnelRows = stats.funnel.map((step) => ({ label: step.conversionPct === null ? step.label : `${step.label} (${step.conversionPct}%)`, count: step.sessions }));
  const integrations = await renderIntegrations(environment, settings);

  content.append(
    section("overview", "Overview", [
      totals,
      el("div", { className: "admin-layout" }, [
        card("Signup funnel, last 30 days", "Unique sessions per step, with the share that made it from the step before. Only visitors who allowed analytics are counted.", barList(funnelRows)),
        card("Daily active sessions", "Last 14 days with activity.", barList(stats.dailySessions || []))
      ])
    ]),
    section("controls", "Controls", [
      el("div", { className: "admin-layout" }, [
        el("div", { className: "admin-stack" }, renderControls(settings, environment, settingsHistory || [])),
        el("div", { className: "admin-stack" }, [integrations, renderWaitlistTools(environment)])
      ])
    ]),
    section("growth", "Growth", [
      el("div", { className: "admin-layout" }, [
        card("Feature usage, last 30 days", `AI answers: ${stats.aiHealth?.received ?? 0} delivered, ${stats.aiHealth?.unavailable ?? 0} fell back to PAM's own math.`, barList(stats.highlights || [])),
        card("What people ask about", "Decision questions grouped by topic.", barList(stats.questionTopics)),
        card("Waitlist by stage", "", barList(stats.waitlistByStage)),
        card("Waitlist by age", "", barList(stats.waitlistByAge)),
        card("Signups per week", "Waitlist and partner requests, week starting Monday.", barList(stats.waitlistByWeek)),
        card("Most common events", "Last 30 days.", barList(stats.topEvents))
      ])
    ]),
    section("voices", "Voices", [
      el("div", { className: "admin-layout" }, [
        card("What waitlist members want help with", "Most recent first.", quoteList(stats.recentGoals, (item) => ({ text: item.goal, meta: [item.stage, formatDate(item.when)].filter(Boolean).join(" · ") }), "Nothing yet.")),
        card("Recent feedback", "", quoteList(stats.recentFeedback, (item) => ({ text: item.message, meta: [item.rating ? `${item.rating}/5` : "", item.page, formatDate(item.when)].filter(Boolean).join(" · ") }), "No feedback yet.")),
        card("School and employer requests", "Reply from your inbox; emails stay in Supabase.", quoteList(stats.partnerRequests, (item) => ({ text: item.organization || "(no organization given)", meta: formatDate(item.when) }), "None yet."))
      ])
    ]),
    el("p", { className: "admin-note admin-updated", text: `Updated ${new Date(stats.generatedAt).toLocaleString("en-US")}` })
  );
  // Let bars and rings grow in from zero.
  requestAnimationFrame(() => requestAnimationFrame(() => content.classList.add("is-ready")));
}

async function load(newSecret) {
  if (newSecret) sessionStorage.setItem(SECRET_KEY, newSecret);
  statusLine.textContent = "Loading...";
  try {
    const { response, payload } = await api(ENDPOINT, { method: "GET" });
    if (response.status === 401) {
      sessionStorage.removeItem(SECRET_KEY);
      form.hidden = false;
      refreshButton.hidden = true;
      nav.hidden = true;
      statusLine.textContent = "That secret didn't work.";
      return;
    }
    if (!response.ok || !payload.ok) {
      form.hidden = false;
      statusLine.textContent = payload.error || "Could not load stats.";
      return;
    }
    form.hidden = true;
    refreshButton.hidden = false;
    nav.hidden = false;
    content.classList.remove("is-ready");
    statusLine.textContent = "";
    await render(payload);
  } catch (_error) {
    statusLine.textContent = "Network error. Try again.";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = String(new FormData(form).get("secret") || "").trim();
  if (value) load(value);
});

refreshButton.addEventListener("click", () => load());

if (secret()) load();
