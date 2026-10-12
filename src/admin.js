// Private admin page: reads aggregate stats with the admin secret. All
// user-written text is inserted with textContent, never innerHTML.

const SECRET_KEY = "pam:admin-secret";
const form = document.getElementById("admin-login");
const statusLine = document.getElementById("admin-status");
const content = document.getElementById("admin-content");
const refreshButton = document.getElementById("admin-refresh");

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attrs || {})) node.setAttribute(key, value);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function card(title, note, body) {
  return el("section", { className: "admin-card" }, [
    el("h2", { text: title }),
    note ? el("p", { className: "admin-note", text: note }) : null,
    body
  ]);
}

function barList(rows, { valueKey = "count", labelKey = "label" } = {}) {
  if (!rows.length) return el("p", { className: "admin-empty", text: "Nothing yet." });
  const max = Math.max(...rows.map((row) => row[valueKey]), 1);
  const list = el("ul", { className: "admin-bars" });
  for (const row of rows) {
    const meter = el("meter", { attrs: { min: "0", max: String(max), value: String(row[valueKey]), "aria-label": `${row[labelKey]}: ${row[valueKey]}` } });
    list.appendChild(el("li", {}, [el("span", { className: "admin-bar-label", text: row[labelKey] }), meter, el("strong", { text: row[valueKey] })]));
  }
  return list;
}

function render(stats) {
  content.replaceChildren();
  const totals = el("div", { className: "admin-totals" });
  for (const [label, value] of [
    ["Waitlist", stats.totals.waitlist],
    ["Partner requests", stats.totals.partnerRequests],
    ["Saved profiles", stats.totals.accounts ?? "n/a"],
    ["Decisions run", stats.totals.decisionsRun],
    ["Events, last 30 days", stats.totals.eventsLast30Days]
  ]) {
    totals.appendChild(el("div", { className: "admin-total" }, [el("span", { text: label }), el("strong", { text: value })]));
  }
  content.appendChild(totals);

  const funnelRows = stats.funnel.map((step) => ({ label: step.label, count: step.sessions }));
  content.appendChild(card("Signup funnel, last 30 days", "Unique sessions per step. Only visitors who allowed analytics are counted.", barList(funnelRows)));
  content.appendChild(card("What people ask about", "Decision questions grouped by topic.", barList(stats.questionTopics)));

  const grid = el("div", { className: "admin-grid" });
  grid.appendChild(card("Waitlist by stage", "", barList(stats.waitlistByStage)));
  grid.appendChild(card("Waitlist by age", "", barList(stats.waitlistByAge)));
  content.appendChild(grid);

  content.appendChild(card("Signups per week", "Waitlist and partner requests, week starting Monday.", barList(stats.waitlistByWeek)));

  const goals = el("ul", { className: "admin-quotes" });
  for (const item of stats.recentGoals) goals.appendChild(el("li", {}, [el("p", { text: item.goal }), el("small", { text: [item.stage, formatDate(item.when)].filter(Boolean).join(" · ") })]));
  content.appendChild(card("What waitlist members want help with", "Most recent first.", stats.recentGoals.length ? goals : el("p", { className: "admin-empty", text: "Nothing yet." })));

  const partners = el("ul", { className: "admin-quotes" });
  for (const item of stats.partnerRequests) partners.appendChild(el("li", {}, [el("p", { text: item.organization || "(no organization given)" }), el("small", { text: formatDate(item.when) })]));
  content.appendChild(card("School and employer requests", "Reply from your inbox; emails stay in Supabase.", stats.partnerRequests.length ? partners : el("p", { className: "admin-empty", text: "None yet." })));

  const feedback = el("ul", { className: "admin-quotes" });
  for (const item of stats.recentFeedback) feedback.appendChild(el("li", {}, [el("p", { text: item.message }), el("small", { text: [item.rating ? `${item.rating}/5` : "", item.page, formatDate(item.when)].filter(Boolean).join(" · ") })]));
  content.appendChild(card("Recent feedback", "", stats.recentFeedback.length ? feedback : el("p", { className: "admin-empty", text: "No feedback yet." })));

  content.appendChild(card("Most common events", "Last 30 days.", barList(stats.topEvents)));
  content.appendChild(el("p", { className: "admin-note", text: `Updated ${new Date(stats.generatedAt).toLocaleString("en-US")}` }));
}

async function load(secret) {
  statusLine.textContent = "Loading...";
  try {
    const response = await fetch("/api/admin/send_waitlist_update", { headers: { "x-pam-admin-secret": secret } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      sessionStorage.removeItem(SECRET_KEY);
      form.hidden = false;
      refreshButton.hidden = true;
      statusLine.textContent = "That secret didn't work.";
      return;
    }
    if (!response.ok || !payload.ok) {
      statusLine.textContent = payload.error || "Could not load stats.";
      return;
    }
    sessionStorage.setItem(SECRET_KEY, secret);
    form.hidden = true;
    refreshButton.hidden = false;
    statusLine.textContent = "";
    render(payload.stats);
  } catch (_error) {
    statusLine.textContent = "Network error. Try again.";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const secret = String(new FormData(form).get("secret") || "").trim();
  if (secret) load(secret);
});

refreshButton.addEventListener("click", () => {
  const secret = sessionStorage.getItem(SECRET_KEY);
  if (secret) load(secret);
});

const saved = sessionStorage.getItem(SECRET_KEY);
if (saved) load(saved);
