// Ballot Compass data review tool. Runs entirely in the browser: it reads the
// published JSON, lets a reviewer correct and check entries, and downloads the
// updated file to commit. Nothing is sent anywhere.

const DRAFT_KEY = 'ballot-compass:editor-draft:v1';
const STATUSES = ['Declared', 'Exploring', 'Undecided', 'Says not running', 'Declined'];
const PROVENANCE = ['Record', 'Stated 2026'];
const DATE_RE = /^\d{4}(-\d{2}){0,2}$/;

let data;
let issues;
const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function counts() {
  let total = 0;
  let done = 0;
  for (const c of data.candidates) {
    total += 1; // status
    if (!c.status_needs_verification) done += 1;
    for (const p of Object.values(c.positions)) {
      total += 1;
      if (!p.needs_verification) done += 1;
    }
  }
  return { total, done };
}

function updateProgress() {
  const { total, done } = counts();
  $('ed-progress').textContent = `${done} of ${total} entries checked`;
}

function valueOptions(issue, current) {
  const opts = [`<option value="" ${current === null ? 'selected' : ''}>Unknown (not scored)</option>`];
  for (const p of issue.positions) {
    opts.push(`<option value="${p.value}" ${current === p.value ? 'selected' : ''}>${p.value}: ${esc(p.label)}</option>`);
  }
  return opts.join('');
}

function statusCard(c) {
  return `<article class="ed-card" data-kind="status" data-cand="${esc(c.id)}">
    <h3>${esc(c.name)} <span class="muted">&middot; 2028 status</span></h3>
    <div class="ed-grid">
      <label>Status <select data-field="status">${STATUSES.map((s) => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Date of latest statement <input type="text" data-field="status_date" value="${esc(c.status_date)}" placeholder="YYYY-MM-DD"></label>
      <label class="ed-wide">Note <input type="text" data-field="status_note" value="${esc(c.status_note)}"></label>
      <label class="ed-wide">Current role <input type="text" data-field="current_role" value="${esc(c.current_role)}"></label>
      <label class="ed-wide">Campaign site <input type="url" data-field="campaign_url" value="${esc(c.links?.campaign_url || '')}" placeholder="https://"></label>
    </div>
    <label class="consent ed-check"><input type="checkbox" data-field="checked" ${c.status_needs_verification ? '' : 'checked'}> <span>Checked</span></label>
  </article>`;
}

function positionCard(c, issue) {
  const p = c.positions[issue.id];
  return `<article class="ed-card" data-kind="position" data-cand="${esc(c.id)}" data-issue="${esc(issue.id)}">
    <h3>${esc(c.name)} <span class="muted">&middot; ${esc(issue.title)}</span></h3>
    <div class="ed-grid">
      <label class="ed-wide">Position <select data-field="value">${valueOptions(issue, p.value)}</select></label>
      <label class="ed-wide">Summary <textarea data-field="summary" rows="2">${esc(p.summary)}</textarea></label>
      <label class="ed-wide">Source URL <input type="url" data-field="source_url" value="${esc(p.source_url || '')}" placeholder="https://"></label>
      <label>Source label <input type="text" data-field="source_label" value="${esc(p.source_label || '')}"></label>
      <label>Source date <input type="text" data-field="source_date" value="${esc(p.source_date || '')}" placeholder="YYYY-MM-DD"></label>
      <label>Provenance <select data-field="provenance"><option value="">None</option>${PROVENANCE.map((v) => `<option ${p.provenance === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    ${p.source_url ? `<p class="small"><a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">Open source</a></p>` : ''}
    <p class="form-error" data-error></p>
    <label class="consent ed-check"><input type="checkbox" data-field="checked" ${p.needs_verification ? '' : 'checked'}> <span>Checked</span></label>
  </article>`;
}

function render() {
  const candId = $('ed-cand').value;
  const todo = $('ed-show').value === 'todo';
  const cands = data.candidates.filter((c) => candId === 'all' || c.id === candId);
  const html = [];
  for (const c of cands) {
    if (!todo || c.status_needs_verification) html.push(statusCard(c));
    for (const issue of issues) {
      if (!todo || c.positions[issue.id].needs_verification) html.push(positionCard(c, issue));
    }
  }
  $('ed-list').innerHTML = html.length ? html.join('') : '<p>Nothing left to check here.</p>';
  updateProgress();
}

function validate(card, p) {
  const errors = [];
  if (p.value !== null && !p.source_url) errors.push('A scored position needs a source URL.');
  if (p.source_url && !/^https:\/\//.test(p.source_url)) errors.push('Use an https:// source URL.');
  if (p.source_date && !DATE_RE.test(p.source_date)) errors.push('Date must be YYYY, YYYY-MM or YYYY-MM-DD.');
  if (p.value !== null && !p.provenance) errors.push('Pick a provenance.');
  card.querySelector('[data-error]').textContent = errors.join(' ');
  return errors.length === 0;
}

function onChange(e) {
  const el = e.target;
  const card = el.closest('.ed-card');
  if (!card || !el.dataset.field) return;
  const c = data.candidates.find((x) => x.id === card.dataset.cand);
  const field = el.dataset.field;

  if (card.dataset.kind === 'status') {
    if (field === 'checked') c.status_needs_verification = !el.checked;
    else if (field === 'campaign_url') c.links = { ...(c.links || {}), campaign_url: el.value.trim() || null };
    else c[field] = el.value.trim();
  } else {
    const p = c.positions[card.dataset.issue];
    if (field === 'checked') {
      if (el.checked && !validate(card, p)) { el.checked = false; return; }
      p.needs_verification = !el.checked;
    } else if (field === 'value') {
      p.value = el.value === '' ? null : Number(el.value);
    } else {
      p[field] = el.value.trim() || null;
    }
    if (field !== 'checked') {
      // Any edit to a checked entry needs re-checking.
      p.needs_verification = true;
      card.querySelector('[data-field="checked"]').checked = false;
      validate(card, p);
    }
  }
  saveDraft();
  updateProgress();
}

function download() {
  const out = structuredClone(data);
  if ($('ed-stamp').checked) {
    out.meta.last_reviewed = new Date().toISOString().slice(0, 10);
    out.meta.reviewed_by = $('ed-reviewer').value.trim() || null;
  }
  const blob = new Blob([`${JSON.stringify(out, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'candidates.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function boot() {
  const [cRes, iRes] = await Promise.all([fetch('data/candidates.json'), fetch('data/issues.json')]);
  const published = await cRes.json();
  issues = (await iRes.json()).issues;
  const draft = loadDraft();
  data = draft && draft.meta && draft.meta.seeded === published.meta.seeded ? draft : published;

  $('ed-cand').innerHTML = `<option value="all">All candidates</option>${data.candidates
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`;
  $('ed-cand').addEventListener('change', render);
  $('ed-show').addEventListener('change', render);
  $('ed-list').addEventListener('change', onChange);
  $('ed-download').addEventListener('click', download);
  $('ed-reset').addEventListener('click', () => {
    if (!window.confirm('Discard all your edits in this browser?')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    data = structuredClone(published);
    render();
  });
  render();
}

boot().catch(() => {
  $('ed-list').innerHTML = '<p>Could not load the data files. Serve this folder over HTTP.</p>';
});
