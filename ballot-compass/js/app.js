import {
  IMPORTANCE,
  DEFAULT_IMPORTANCE,
  DEALBREAKER,
  importanceLabel,
  isValidValue,
  rankCandidates,
  scoreCandidate,
  countAnswered,
} from './scoring.js';
import {
  CONSENT_VERSION,
  DEMOGRAPHIC_FIELDS,
  PREFER_NOT,
  isValidDemographic,
  isValidEmail,
  newSubmissionId,
} from './survey.js';
import { buildMatchers, termify as termifyText, validTerms } from './glossary.js';

const STORAGE_KEY = 'ballot-compass:v1';

function emptyProfile() {
  return Object.fromEntries(DEMOGRAPHIC_FIELDS.map((f) => [f.id, null]));
}
// Preview mode (e.g. a hosted demo with no server): no sharing, sign-up or print, and the page says so.
const PREVIEW = document.querySelector('meta[name="bc-mode"][content="preview"]') !== null;
const STATUSES = ['Declared', 'Exploring', 'Undecided', 'Says not running', 'Declined'];
const PARTIES = ['Republican', 'Democratic'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const IMPORTANCE_HINTS = {
  1: '',
  2: '',
  3: '',
  4: 'Candidates 2+ steps away get flagged.',
};

const state = {
  issues: [],
  traits: [],
  candidates: [],
  meta: {},
  markets: null,
  profile: emptyProfile(),
  share: null, // { id, sharedOn } once answers have been shared anonymously
  signedUp: false,
  flash: null, // one-time message shown on the next results render
  scaleNote: '',
  answers: {},
  leadership: { ranking: null, skipped: false },
  filters: { party: 'all', status: 'all', sort: 'alignment' },
};

const main = document.getElementById('main');
const live = document.querySelector('[data-live]');
let firstRender = true;
let keepFocusSelector = null;

/* ---------- helpers ---------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function fmtDate(value) {
  if (!value) return 'Date unknown';
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  if (!mo) return y;
  const month = MONTHS[Number(mo) - 1];
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

function ageFrom(birth) {
  const b = new Date(`${birth}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

function announce(message) {
  live.textContent = '';
  window.setTimeout(() => { live.textContent = message; }, 30);
}

function issueById(id) {
  return state.issues.find((i) => i.id === id);
}

function candidateById(id) {
  return state.candidates.find((c) => c.id === id);
}

function positionLabel(issue, value) {
  if (!isValidValue(value)) return null;
  const p = issue.positions.find((x) => x.value === value);
  return p ? p.label : null;
}

function partyTag(party) {
  const slug = party === 'Republican' ? 'republican' : party === 'Democratic' ? 'democratic' : 'other';
  return `<span class="tag tag-party-${slug}"><span class="sr-only">Party: </span>${esc(party)}</span>`;
}

function statusText(c) {
  return `${esc(c.status)}, as of ${esc(fmtDate(c.status_date))}`;
}

function matchBadge(level) {
  return `<span class="match match-${level.toLowerCase()}">${esc(level)}</span>`;
}

function dealbreakerFlag(text = 'Dealbreaker conflict') {
  return `<span class="flag">${esc(text)}</span>`;
}

function verifyTag() {
  return '<span class="tag tag-verify">Unverified</span>';
}

const OLD_SOURCE_YEARS = 4;

function isOldSource(date) {
  const year = Number(String(date || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 && new Date().getFullYear() - year > OLD_SOURCE_YEARS;
}

function sourceCell(pos) {
  if (!pos || (!pos.source_url && !pos.source_label)) return '<span class="muted">None on record</span>';
  const url = safeUrl(pos.source_url);
  const label = esc(pos.source_label || 'Source');
  const link = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>` : `<span class="muted">${label || 'No source'}</span>`;
  const tags = [];
  if (pos.provenance) tags.push(`<span class="tag tag-prov">${esc(pos.provenance)}</span>`);
  if (isOldSource(pos.source_date)) tags.push('<span class="tag tag-old">Older record</span>');
  if (pos.needs_verification) tags.push(verifyTag());
  const date = pos.source_date ? `<span class="cell-sub">${esc(fmtDate(pos.source_date))}</span>` : '';
  return `${link}${date}${tags.length ? `<span class="source-tags">${tags.join('')}</span>` : ''}`;
}

function externalLink(url, label) {
  const u = safeUrl(url);
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="sr-only"> (opens in a new tab)</span></a>` : '';
}

/* ---------- links and prediction markets ---------- */

function websiteLinks(c) {
  const l = c.links || {};
  const links = [];
  if (l.campaign_url) links.push(externalLink(l.campaign_url, 'Campaign site'));
  if (l.official_url) links.push(externalLink(l.official_url, 'Official site'));
  if (!l.campaign_url) links.push('<span class="muted">No campaign site yet</span>');
  return links.join(' &middot; ');
}

const MARKET_LABELS = {
  nomination_republican: 'Republican nomination',
  nomination_democratic: 'Democratic nomination',
  presidency: 'Presidency',
};

/** Kalshi prices are dollars on a $1 contract, so a price reads directly as a percentage chance. */
function fmtOdds(p) {
  if (p === null || p === undefined) return 'No trades';
  const pct = p * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`;
}

function fmtTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown time';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function marketsIntro() {
  const m = state.markets;
  const days = Math.floor((Date.now() - new Date(m.fetched_at).getTime()) / 86400000);
  const when = new Date(m.fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `<p class="small muted">What ${externalLink(m.source_url, m.source)} traders think will happen, as of ${esc(when)}${days >= 7 ? ` (${days} days old)` : ''}. Not polls, not endorsements, not part of your score.</p>`;
}

function nominationKey(c) {
  return c.party === 'Republican' ? 'nomination_republican' : 'nomination_democratic';
}

function candidateMarketSection(c) {
  const m = state.markets;
  if (!m) return '';
  const entry = m.candidates[c.id] || {};
  const parts = [];
  if (entry.nomination && m.events[nominationKey(c)]) {
    parts.push(`<strong>${esc(fmtOdds(entry.nomination.last))}</strong> to win the ${esc(MARKET_LABELS[nominationKey(c)])} (${externalLink(m.events[nominationKey(c)].url, 'market')})`);
  }
  if (entry.presidency && m.events.presidency) {
    parts.push(`<strong>${esc(fmtOdds(entry.presidency.last))}</strong> to win the presidency (${externalLink(m.events.presidency.url, 'market')})`);
  }
  if (!parts.length) return '';
  return `<section class="section-gap" aria-labelledby="mkt-h">
    <h2 id="mkt-h" class="h3">Market odds <span class="muted">(not scored)</span></h2>
    <p class="tight">${parts.join(' &middot; ')}</p>
    ${marketsIntro()}
  </section>`;
}

function marketsPanel() {
  const m = state.markets;
  if (!m) return '';
  const rows = state.candidates.slice()
    .sort((a, b) => a.party.localeCompare(b.party)
      || (((m.candidates[b.id] || {}).nomination || {}).last ?? -1) - (((m.candidates[a.id] || {}).nomination || {}).last ?? -1)
      || a.name.localeCompare(b.name))
    .map((c) => {
      const e = m.candidates[c.id] || {};
      return `<tr>
        <th scope="row"><a href="#candidate-${esc(c.id)}">${esc(c.name)}</a> ${partyTag(c.party)}</th>
        <td data-label="Nomination">${e.nomination ? esc(fmtOdds(e.nomination.last)) : '<span class="muted">&ndash;</span>'}</td>
        <td data-label="Presidency">${e.presidency ? esc(fmtOdds(e.presidency.last)) : '<span class="muted">&ndash;</span>'}</td>
      </tr>`;
    }).join('');
  const others = (m.uncovered || []).filter((u) => u.market !== 'presidency').map((u) => `${esc(u.name)} ${esc(fmtOdds(u.last))}`);
  return `<section class="section-gap no-print">
    <details class="fold">
      <summary><h2 id="mkts-h">Market odds <span class="muted">(not scored)</span></h2></summary>
      ${marketsIntro()}
      <div class="table-wrap"><table class="data stack odds-table">
        <caption class="sr-only">Kalshi odds by candidate, grouped by party</caption>
        <thead><tr><th scope="col">Candidate</th><th scope="col">Nomination</th><th scope="col">Presidency</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${others.length ? `<p class="small muted">Also on Kalshi, not covered here: ${others.join(', ')}.</p>` : ''}
    </details>
  </section>`;
}

function answeredCount() {
  return countAnswered(state.answers, state.issues);
}

function hasAnyAnswers() {
  return answeredCount() > 0;
}

function firstUnvisitedIndex() {
  return state.issues.findIndex((i) => !(i.id in state.answers));
}

/* ---------- storage (browser only) ---------- */

function sanitizeAnswers(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const issue of state.issues) {
    const a = raw[issue.id];
    if (!a || typeof a !== 'object') continue;
    const value = isValidValue(a.value) ? a.value : null;
    const importance = IMPORTANCE.some((i) => i.value === a.importance) ? a.importance : DEFAULT_IMPORTANCE;
    out[issue.id] = { value, importance };
  }
  return out;
}

function sanitizeLeadership(raw) {
  const ids = state.traits.map((t) => t.id);
  if (!raw || typeof raw !== 'object') return { ranking: null, skipped: false };
  const ranking = Array.isArray(raw.ranking)
    && raw.ranking.length === ids.length
    && ids.every((id) => raw.ranking.includes(id)) ? raw.ranking.slice() : null;
  return { ranking, skipped: Boolean(raw.skipped) && !ranking };
}

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.answers = sanitizeAnswers(data.answers);
    state.leadership = sanitizeLeadership(data.leadership);
    const prof = data.profile && typeof data.profile === 'object' ? data.profile : {};
    for (const f of DEMOGRAPHIC_FIELDS) state.profile[f.id] = isValidDemographic(f.id, prof[f.id]) && prof[f.id] ? prof[f.id] : null;
    const sh = data.share;
    state.share = sh && typeof sh.id === 'string' && /^[0-9a-f-]{36}$/i.test(sh.id) ? { id: sh.id, sharedOn: String(sh.sharedOn || '') } : null;
    state.signedUp = data.signedUp === true;
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: state.answers, leadership: state.leadership, profile: state.profile, share: state.share, signedUp: state.signedUp }));
  } catch {
    /* storage unavailable: answers live only for this page view */
  }
}

function clearAll({ keepShareId = false } = {}) {
  const share = keepShareId ? state.share : null;
  state.answers = {};
  state.leadership = { ranking: null, skipped: false };
  state.profile = emptyProfile();
  state.share = share;
  state.signedUp = false;
  state.flash = null;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  if (share) save();
}

/* ---------- optional sharing (same-origin API; see api/) ---------- */

async function postJson(path, body, method = 'POST') {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: 'omit',
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON reply, e.g. a static host with no API */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    window.clearTimeout(timer);
  }
}

function shareFailureText(r) {
  if (r.data && r.data.code === 'not_configured') return 'Sharing is not switched on yet, so nothing was sent.';
  if (r.data && r.data.code === 'disabled') return 'Sharing is paused right now, so nothing was sent.';
  if (r.status === 0 || r.status === 404 || r.status === 405 || r.status === 501) return 'Sharing is not available on this copy of Ballot Compass, so nothing was sent.';
  if (r.data && r.data.error) return `${r.data.error} Nothing was sent.`;
  return 'Your answers could not be shared right now. Nothing was sent.';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- data stamp ---------- */

function renderStamp() {
  const m = state.meta;
  const html = m.last_reviewed
    ? `Data last reviewed: <strong>${esc(fmtDate(m.last_reviewed))}</strong>`
    : 'Data last reviewed: <strong>not yet</strong> (draft)';
  document.querySelectorAll('[data-stamp]').forEach((el) => { el.innerHTML = html; });
}

function seedNotice() {
  if (state.meta.last_reviewed) return '';
  return '<p class="draft-note"><strong>Draft data.</strong> Positions aren\'t verified yet. Check sources before relying on them.</p>';
}

/* ---------- glossary: tap a dotted term to see what it means ---------- */

let glossary = [];
let glossaryMatchers = [];

function setGlossary(terms) {
  glossary = validTerms(terms);
  glossaryMatchers = buildMatchers(glossary);
}

function termify(text) {
  return termifyText(text, glossaryMatchers);
}

let termCard = null;
let termOwner = null;

function closeTerm({ restoreFocus = false } = {}) {
  if (!termCard || termCard.hidden) return;
  termCard.hidden = true;
  if (termOwner) {
    termOwner.setAttribute('aria-expanded', 'false');
    if (restoreFocus) termOwner.focus();
  }
  termOwner = null;
}

function openTerm(btn) {
  const entry = glossary.find((g) => g.id === btn.dataset.term);
  if (!entry) return;
  if (!termCard) {
    termCard = document.createElement('div');
    termCard.id = 'term-card';
    termCard.className = 'term-card';
    termCard.setAttribute('role', 'status');
    termCard.hidden = true;
    document.body.append(termCard);
  }
  if (termOwner) termOwner.setAttribute('aria-expanded', 'false');
  termCard.innerHTML = `<strong>${esc(entry.term)}</strong> ${esc(entry.definition)}`;
  termCard.hidden = false;
  termOwner = btn;
  btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  const width = Math.min(352, document.documentElement.clientWidth - 32);
  const left = Math.max(16, Math.min(r.left, document.documentElement.clientWidth - width - 16));
  termCard.style.width = `${width}px`;
  termCard.style.left = `${left + window.scrollX}px`;
  termCard.style.top = `${r.bottom + window.scrollY + 6}px`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.term');
  if (btn) {
    e.preventDefault();
    if (termOwner === btn) closeTerm(); else openTerm(btn);
    return;
  }
  if (termCard && !termCard.hidden && !e.target.closest('#term-card')) closeTerm();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTerm({ restoreFocus: true });
});
window.addEventListener('resize', () => closeTerm());

/* ---------- views ---------- */

function viewIntro() {
  const total = state.issues.length;
  const next = firstUnvisitedIndex();
  const started = Object.keys(state.answers).length > 0;
  let primary;
  if (!started) {
    primary = '<a class="btn btn-primary" href="#profile">Start</a>';
  } else if (next === -1) {
    primary = '<a class="btn btn-primary" href="#results">View your results</a><button type="button" class="btn" data-start-over>Start over</button>';
  } else {
    primary = `<a class="btn btn-primary" href="#q-${next + 1}">Continue (${next + 1} of ${total})</a><button type="button" class="btn" data-start-over>Start over</button>`;
  }

  return {
    title: null,
    html: `
    <div class="intro measure">
      <p class="kicker">2028 presidential field</p>
      <h1 tabindex="-1">See where the 2028 contenders stand on what matters to you</h1>
      <p class="lede">Answer ${total} issues. Compare yourself with ${state.candidates.length} possible candidates from both parties, issue by issue, with sources.</p>
      <ul class="meta-row">
        <li>About 8 minutes</li>
        <li>Skip anything</li>
        <li>No account</li>
      </ul>
      <div class="actions">${primary}<a href="#how-it-works">How scoring works</a></div>
      ${seedNotice()}
    </div>`,
  };
}

function viewQuestion(n) {
  const total = state.issues.length;
  if (!Number.isInteger(n) || n < 1 || n > total) return viewNotFound();
  const issue = state.issues[n - 1];
  const ans = state.answers[issue.id];
  const selected = ans ? (ans.value === null ? 'skip' : String(ans.value)) : '';
  const imp = ans ? ans.importance : DEFAULT_IMPORTANCE;
  const pct = Math.round(((n - 1) / total) * 100);
  const isSkip = selected === 'skip';

  const options = issue.positions.map((p) => `
    <label class="option">
      <input type="radio" name="position" value="${p.value}" ${selected === String(p.value) ? 'checked' : ''}>
      <span class="option-text">${termify(p.label)}</span>
    </label>`).join('');

  return {
    title: `${issue.title} (issue ${n} of ${total})`,
    html: `
    <div class="measure">
      <div class="progress">
        <div class="progress-label"><span>${n} of ${total}</span><a href="#review">All issues</a></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="${pct}"></div></div>
      </div>
      <form id="q-form" data-issue="${esc(issue.id)}" data-n="${n}" novalidate>
        <div class="question-head">
          <h1 tabindex="-1">${esc(issue.title)}</h1>
          <p class="question-text">${termify(issue.question)}</p>
        </div>
        <details class="background">
          <summary>Background</summary>
          <div class="bg-body">${issue.background.map((s) => `<p>${termify(s)}</p>`).join('')}</div>
        </details>
        <p class="form-error" id="q-error" role="alert"></p>
        <fieldset aria-describedby="q-error">
          <legend class="sr-only">Which position is closest to yours?</legend>
          <div class="options">
            ${options}
            <label class="option option-skip">
              <input type="radio" name="position" value="skip" ${isSkip ? 'checked' : ''}>
              <span class="option-text">No opinion / skip</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="importance" id="imp-fs" ${isSkip ? 'disabled' : ''}>
          <legend id="imp-legend">How much does it matter?</legend>
          <output id="imp-out" for="imp" class="importance-value">${importanceLabel(imp)}</output>
          <input type="range" id="imp" name="importance" min="1" max="4" step="1" value="${imp}" aria-labelledby="imp-legend" aria-valuetext="${importanceLabel(imp)}" aria-describedby="imp-hint">
          <div class="importance-scale" aria-hidden="true"><span>Low</span><span>Medium</span><span>High</span><span>Dealbreaker</span></div>
          <p class="importance-hint" id="imp-hint">${isSkip ? '' : IMPORTANCE_HINTS[imp]}</p>
        </fieldset>
        <div class="actions actions-split">
          <button type="button" class="btn" data-q-back>Back</button>
          <button type="submit" class="btn btn-primary">${n === total ? 'Continue' : 'Next issue'}</button>
        </div>
      </form>
    </div>`,
    after: wireQuestion,
  };
}

function readQuestionForm(form) {
  const checked = form.querySelector('input[name="position"]:checked');
  const importance = Number(form.querySelector('#imp').value);
  if (!checked) return null;
  return { value: checked.value === 'skip' ? null : Number(checked.value), importance };
}

function wireQuestion() {
  const form = document.getElementById('q-form');
  const issueId = form.dataset.issue;
  const n = Number(form.dataset.n);
  const range = form.querySelector('#imp');
  const out = form.querySelector('#imp-out');
  const hint = form.querySelector('#imp-hint');
  const impFs = form.querySelector('#imp-fs');
  const error = form.querySelector('#q-error');

  form.addEventListener('change', (e) => {
    if (e.target.name === 'position') {
      error.textContent = '';
      const skip = e.target.value === 'skip';
      impFs.disabled = skip;
      hint.textContent = skip ? '' : IMPORTANCE_HINTS[Number(range.value)];
    }
  });
  range.addEventListener('input', () => {
    const label = importanceLabel(Number(range.value));
    out.textContent = label;
    range.setAttribute('aria-valuetext', label);
    hint.textContent = IMPORTANCE_HINTS[Number(range.value)];
  });
  form.querySelector('[data-q-back]').addEventListener('click', () => {
    const a = readQuestionForm(form);
    if (a) { state.answers[issueId] = a; save(); }
    location.hash = n > 1 ? `#q-${n - 1}` : '#profile';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = readQuestionForm(form);
    if (!a) {
      error.textContent = 'Choose a position, or choose "No opinion / skip this issue".';
      form.querySelector('input[name="position"]').focus();
      return;
    }
    state.answers[issueId] = a;
    save();
    location.hash = n < state.issues.length ? `#q-${n + 1}` : '#leadership';
  });
}

function currentRanking() {
  return state.leadership.ranking ? state.leadership.ranking.slice() : state.traits.map((t) => t.id);
}

function rankListHtml(ranking) {
  return ranking.map((id, i) => {
    const t = state.traits.find((x) => x.id === id);
    const label = esc(t.label);
    return `<li class="rank-item" data-trait="${esc(id)}">
      <span class="rank-num" aria-hidden="true">${i + 1}</span>
      <span>${label}</span>
      <span class="rank-controls">
        <button type="button" class="btn" data-move="up" data-id="${esc(id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${label} up">&uarr;</button>
        <button type="button" class="btn" data-move="down" data-id="${esc(id)}" ${i === ranking.length - 1 ? 'disabled' : ''} aria-label="Move ${label} down">&darr;</button>
      </span>
    </li>`;
  }).join('');
}

function viewLeadership() {
  const ranking = currentRanking();
  return {
    title: 'Leadership style (optional)',
    html: `
    <div class="measure">
      <div class="progress">
        <div class="progress-label"><span>Optional</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="100"></div></div>
      </div>
      <h1 tabindex="-1">Leadership style</h1>
      <p class="question-text">Rank what matters most to you. Not scored.</p>
      <ol class="rank-list" id="rank-list" aria-label="Leadership qualities, most important first">${rankListHtml(ranking)}</ol>
      <div class="actions actions-split">
        <button type="button" class="btn" data-l-back>Back</button>
        <span class="actions actions-inline">
          <button type="button" class="btn" data-l-skip>Skip</button>
          <button type="button" class="btn btn-primary" data-l-save>Continue</button>
        </span>
      </div>
    </div>`,
    after: wireLeadership,
  };
}

function wireLeadership() {
  let ranking = currentRanking();
  const list = document.getElementById('rank-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const dir = btn.dataset.move;
    const i = ranking.indexOf(id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ranking.length) return;
    [ranking[i], ranking[j]] = [ranking[j], ranking[i]];
    list.innerHTML = rankListHtml(ranking);
    let target = list.querySelector(`[data-move="${dir}"][data-id="${CSS.escape(id)}"]`);
    if (target && target.disabled) target = list.querySelector(`[data-move="${dir === 'up' ? 'down' : 'up'}"][data-id="${CSS.escape(id)}"]`);
    if (target) target.focus();
    const t = state.traits.find((x) => x.id === id);
    announce(`${t.label} moved to position ${j + 1} of ${ranking.length}.`);
  });
  document.querySelector('[data-l-back]').addEventListener('click', () => { location.hash = `#q-${state.issues.length}`; });
  document.querySelector('[data-l-skip]').addEventListener('click', () => {
    state.leadership = { ranking: null, skipped: true };
    save();
    location.hash = '#about-you';
  });
  document.querySelector('[data-l-save]').addEventListener('click', () => {
    state.leadership = { ranking: ranking.slice(), skipped: false };
    save();
    location.hash = '#about-you';
  });
}

/* ----- optional profile: a little at the start, the rest just before results ----- */

function profileFields(step) {
  const p = state.profile;
  return DEMOGRAPHIC_FIELDS.filter((f) => f.step === step).map((f) => `
    <div class="field">
      <label for="d-${f.id}">${esc(f.label)}</label>
      <select id="d-${f.id}" name="${f.id}">
        <option value="">Choose</option>
        ${f.options.map((o) => `<option value="${esc(o.value)}" ${p[f.id] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        <option value="${PREFER_NOT.value}" ${p[f.id] === PREFER_NOT.value ? 'selected' : ''}>${PREFER_NOT.label}</option>
      </select>
    </div>`).join('');
}

function saveProfileOnChange(form) {
  form.addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT' && e.target.name in state.profile) {
      state.profile[e.target.name] = e.target.value || null;
      save();
    }
  });
}

function profileSummary() {
  const parts = DEMOGRAPHIC_FIELDS.filter((f) => f.step === 'start' && state.profile[f.id] && state.profile[f.id] !== PREFER_NOT.value)
    .map((f) => f.options.find((o) => o.value === state.profile[f.id]).label);
  return parts.length
    ? `<p class="small muted">${parts.map(esc).join(' &middot; ')} &middot; <a href="#profile">Edit</a></p>`
    : '<p class="small muted"><a href="#profile">Add your state and age</a></p>';
}

function viewProfile() {
  return {
    title: 'About you',
    html: `
    <div class="measure">
      <div class="progress">
        <div class="progress-label"><span>Optional</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="0"></div></div>
      </div>
      <h1 tabindex="-1">First, about you</h1>
      <p class="question-text">Two quick questions. They stay in your browser unless you choose to share at the end.</p>
      <form id="profile-form" novalidate>
        <fieldset>
          <legend class="sr-only">About you</legend>
          <div class="field-grid">${profileFields('start')}</div>
        </fieldset>
        <div class="actions actions-split">
          <a class="btn" href="#start">Back</a>
          <span class="actions actions-inline">
            <a class="btn" href="#q-1">Skip</a>
            <button type="submit" class="btn btn-primary">Continue</button>
          </span>
        </div>
      </form>
    </div>`,
    after: () => {
      const form = document.getElementById('profile-form');
      saveProfileOnChange(form);
      form.addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#q-1'; });
    },
  };
}

function viewAboutYou() {
  const fields = profileFields('end');
  const email = state.signedUp || PREVIEW
    ? ''
    : `<div class="field">
        <label for="d-email">Email for updates <span class="muted">(optional)</span></label>
        <input type="email" id="d-email" name="email" autocomplete="email" inputmode="email" spellcheck="false" aria-describedby="email-hint">
        <p class="field-hint" id="email-hint">Kept apart from your answers. Unsubscribe anytime.</p>
      </div>`;
  return {
    title: 'About you (optional)',
    html: `
    <div class="measure">
      <div class="progress">
        <div class="progress-label"><span>Last step &middot; optional</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="100"></div></div>
      </div>
      <h1 tabindex="-1">A few more about you</h1>
      <p class="question-text">Share anonymously to help show what voters want. You'll see results either way.</p>
      ${profileSummary()}
      ${PREVIEW ? '<p class="draft-note"><strong>Preview.</strong> Sharing is off here, so nothing is sent.</p>' : ''}
      ${state.share ? `<p class="small muted">Shared ${esc(fmtDate(state.share.sharedOn))}. Sharing again updates it.</p>` : ''}
      <form id="about-form" novalidate>
        <p class="form-error" id="a-error" role="alert"></p>
        <fieldset>
          <legend class="sr-only">About you</legend>
          <div class="field-grid">${fields}</div>
        </fieldset>
        ${email}
        <label class="consent" ${PREVIEW ? 'hidden' : ''}>
          <input type="checkbox" id="d-consent" ${state.share ? 'checked' : ''}>
          <span>Share my answers anonymously. We publish totals only and never sell responses. <a href="#how-it-works">Details</a></span>
        </label>
        <div class="actions actions-split">
          <button type="button" class="btn" data-a-back>Back</button>
          <span class="actions actions-inline">
            <button type="button" class="btn" data-a-skip>Skip</button>
            <button type="submit" class="btn btn-primary" data-a-share>${PREVIEW ? 'See results' : 'Share and see results'}</button>
          </span>
        </div>
      </form>
    </div>`,
    after: wireAboutYou,
  };
}

function wireAboutYou() {
  const form = document.getElementById('about-form');
  const error = document.getElementById('a-error');
  const shareBtn = form.querySelector('[data-a-share]');
  saveProfileOnChange(form);
  form.querySelector('[data-a-back]').addEventListener('click', () => { location.hash = '#leadership'; });
  form.querySelector('[data-a-skip]').addEventListener('click', () => {
    state.flash = null;
    location.hash = '#results';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (PREVIEW) {
      state.flash = { kind: 'warn', text: 'Preview: nothing was sent.' };
      location.hash = '#results';
      return;
    }
    const consent = form.querySelector('#d-consent');
    const emailInput = form.querySelector('#d-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!consent.checked) {
      error.textContent = 'Tick the box to share, or choose Skip.';
      consent.focus();
      return;
    }
    if (email && !isValidEmail(email)) {
      error.textContent = 'Check that email address, or leave it blank.';
      emailInput.focus();
      return;
    }
    if (answeredCount() === 0) {
      error.textContent = 'Answer at least one issue before sharing.';
      return;
    }
    shareBtn.disabled = true;
    shareBtn.textContent = 'Sharing...';
    form.setAttribute('aria-busy', 'true');

    const id = state.share ? state.share.id : newSubmissionId();
    const r = await postJson('api/responses', {
      submission_id: id,
      consent: true,
      consent_version: CONSENT_VERSION,
      answers: state.answers,
      leadership: state.leadership.ranking,
      demographics: state.profile,
    });
    const messages = [];
    let kind = 'ok';
    if (r.ok) {
      state.share = { id, sharedOn: todayIso() };
      messages.push('Thanks. Shared anonymously.');
    } else {
      kind = 'warn';
      messages.push(shareFailureText(r));
    }
    if (email) {
      const s = await postJson('api/signup', { email, consent: true });
      if (s.ok) { state.signedUp = true; messages.push('You\'re on the updates list.'); } else if (r.ok) {
        kind = 'warn';
        messages.push('Your email couldn\'t be saved right now.');
      }
    }
    state.flash = { kind, text: messages.join(' ') };
    save();
    location.hash = '#results';
  });
}

function engageBox() {
  const share = state.share
    ? `<p class="small muted">Shared ${esc(fmtDate(state.share.sharedOn))}. <a href="#about-you">Update</a></p>`
    : '<p><a class="btn" href="#about-you">Add your answers to the public tally</a> <span class="small muted">Anonymous, optional</span></p>';
  const signup = state.signedUp || PREVIEW ? '' : `
    <form id="su-form" class="inline-form" novalidate>
      <label for="su-email" class="sr-only">Email address for updates</label>
      <input type="email" id="su-email" autocomplete="email" inputmode="email" spellcheck="false" placeholder="Email for updates">
      <button class="btn btn-primary" type="submit">Get updates</button>
    </form>
    <p class="form-status" id="su-status" role="status"></p>`;
  return `<section class="engage-box no-print" aria-label="Share and get updates">${share}${signup}</section>`;
}

function wireSignup() {
  const form = document.getElementById('su-form');
  if (!form) return;
  const status = document.getElementById('su-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('#su-email');
    const email = input.value.trim();
    if (!isValidEmail(email)) {
      status.textContent = 'Enter a valid email address.';
      input.focus();
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    const r = await postJson('api/signup', { email, consent: true });
    btn.disabled = false;
    if (r.ok) {
      state.signedUp = true;
      save();
      form.remove();
      status.textContent = 'You\'re on the updates list.';
    } else {
      status.textContent = shareFailureText(r).replace('so nothing was sent.', 'so your email wasn\'t saved.').replace('Nothing was sent.', 'Your email wasn\'t saved.');
    }
  });
}

/* ----- results ----- */

function bestByParty(ranked, party) {
  return ranked.find((r) => r.candidate.party === party && r.result.alignment !== null) || null;
}

function issueNames(rows) {
  return rows.map((r) => {
    const title = esc(issueById(r.issueId).title);
    if (r.dealbreaker) return `<span class="flag-inline">${title}<span class="sr-only"> (dealbreaker)</span></span>`;
    return r.level === 'Partial' ? `${title} <span class="muted">(partial)</span>` : title;
  }).join(', ');
}

function resultCard(entry) {
  const { candidate: c, result: r } = entry;
  const agree = r.rows.filter((x) => x.level === 'Agree').sort((a, b) => b.weight - a.weight);
  const differ = r.rows
    .filter((x) => x.level === 'Partial' || x.level === 'Disagree')
    .sort((a, b) => (Number(b.dealbreaker) - Number(a.dealbreaker)) || (b.gap - a.gap) || (b.weight - a.weight));
  const score = r.alignment === null
    ? '<p class="score-num" aria-label="No score">&ndash;</p><p class="score-basis">No overlap</p>'
    : `<p class="score-num">${r.alignment}%<span class="sr-only"> alignment</span></p>
       <p class="score-basis">${r.scored} of ${r.answered} issues${r.range ? `<br><span class="range-note">could be ${r.range.low}&ndash;${r.range.high}%</span>` : ''}</p>`;
  // Solid to the lowest possible score, a light band up to the highest, a tick at the current score.
  const bar = r.alignment === null ? '' : `<div class="score-bar" aria-hidden="true">
      <span class="bar-fill" data-width="${r.range ? r.range.low : r.alignment}"></span>
      ${r.range ? `<span class="bar-range" data-left="${r.range.low}" data-width="${r.range.high - r.range.low}"></span><span class="bar-tick" data-left="${r.alignment}"></span>` : ''}
    </div>`;
  return `<li class="result-card">
    <div class="rc-head">
      <div>
        <h3 class="result-name"><a href="#candidate-${esc(c.id)}">${esc(c.name)}</a></h3>
        <p class="result-meta">${partyTag(c.party)} ${esc(c.status)} <span class="muted">&middot; ${esc(fmtDate(c.status_date))}</span></p>
      </div>
      <div class="result-score">${score}</div>
    </div>
    ${bar}
    <dl class="ad-lines">
      <div><dt>Agree</dt><dd>${agree.length ? issueNames(agree) : '<span class="muted">None</span>'}</dd></div>
      <div><dt>Differ</dt><dd>${differ.length ? issueNames(differ) : '<span class="muted">None</span>'}</dd></div>
    </dl>
  </li>`;
}

function filtered(ranked) {
  return ranked.filter((e) => (state.filters.party === 'all' || e.candidate.party === state.filters.party)
    && (state.filters.status === 'all' || e.candidate.status === state.filters.status));
}

function rankedNow() {
  return rankCandidates(state.answers, state.candidates, state.issues, state.filters.sort);
}

function resultsListHtml() {
  const ranked = rankedNow();
  const list = filtered(ranked);
  const count = `<p class="sr-only" id="result-count">Showing ${list.length} of ${ranked.length} candidates.</p>`;
  if (!list.length) return `${count}<p>No candidates match.</p>`;
  return `${count}<ol class="result-list" aria-labelledby="ranked-h">${list.map((e) => resultCard(e)).join('')}</ol>`;
}

function leadershipSection() {
  const traitLabel = (id) => state.traits.find((t) => t.id === id).label;
  const mine = state.leadership.ranking
    ? `<p>Your priorities: ${state.leadership.ranking.map((id, i) => `${i + 1}. ${esc(traitLabel(id))}`).join(' &middot; ')}</p>`
    : '<p class="muted">Not ranked. <a href="#leadership">Rank them</a></p>';
  const rows = state.candidates.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `
    <tr>
      <th scope="row">${esc(c.name)}</th>
      <td data-label="Executive">${esc(c.background.executive_experience || 'None')}</td>
      <td data-label="Legislative">${esc(c.background.legislative_experience || 'None')}</td>
    </tr>`).join('');
  return `<section class="section-gap no-print">
    <details class="fold">
      <summary><h2 id="lead-h">Leadership style <span class="muted">(not scored)</span></h2></summary>
      ${mine}
      <p class="small muted">We list experience only. The rest is your call.</p>
      <div class="table-wrap"><table class="data stack">
        <caption class="sr-only">Experience by candidate</caption>
        <thead><tr><th scope="col">Candidate</th><th scope="col">Executive</th><th scope="col">Legislative</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </details>
  </section>`;
}

function answersAppendix() {
  const rows = state.issues.map((issue) => {
    const a = state.answers[issue.id];
    const label = a ? (a.value === null ? 'Skipped' : positionLabel(issue, a.value)) : 'Not answered';
    const imp = a && a.value !== null ? importanceLabel(a.importance) : '';
    return `<tr><th scope="row">${esc(issue.title)}</th><td>${esc(label)}</td><td>${esc(imp)}</td></tr>`;
  }).join('');
  return `<section class="print-only section-gap">
    <h2>Your answers</h2>
    <table class="data">
      <thead><tr><th scope="col">Issue</th><th scope="col">Your position</th><th scope="col">Importance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function viewResults() {
  const answered = answeredCount();
  if (!answered) {
    return {
      title: 'Your results',
      html: `<div class="measure">
        <h1 tabindex="-1">Your results</h1>
        <p>Answer at least one issue to see results.</p>
        <div class="actions"><a class="btn btn-primary" href="#q-1">Start</a></div>
      </div>`,
    };
  }
  const ranked = rankedNow();
  const bestR = bestByParty(ranked, 'Republican');
  const bestD = bestByParty(ranked, 'Democratic');
  const partyCell = (label, e) => `<div><dt>${esc(label)}</dt><dd>${e ? `<a href="#candidate-${esc(e.candidate.id)}">${esc(e.candidate.name)}</a> ${e.result.alignment}%` : '<span class="muted">Not enough data</span>'}</dd></div>`;
  const flash = state.flash;
  state.flash = null;
  const flashHtml = flash ? `<p class="flash ${flash.kind === 'warn' ? 'flash-warn' : ''}" role="status">${esc(flash.text)}</p>` : '';
  const select = (id, label, options, current) => `<label>${label}
      <select id="${id}">${options.map(([v, t]) => `<option value="${esc(v)}" ${current === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    </label>`;

  return {
    title: 'Your results',
    html: `
    <div class="print-only">
      <p><strong>Ballot Compass</strong>, ${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
    </div>
    <div class="results-head">
      <h1 tabindex="-1">Your results</h1>
      <p class="results-sub">${answered} of ${state.issues.length} issues &middot; <a href="#review" class="no-print">Edit answers</a></p>
    </div>
    ${flashHtml}
    <p class="note-line">Alignment reflects only the issues you answered and weighted. It is not a prediction or an endorsement.${state.meta.last_reviewed ? '' : ' <span class="draft-inline">Draft data, not yet verified.</span>'}</p>
    <dl class="party-summary" aria-label="Closest candidate in each party">
      ${partyCell('Closest Republican', bestR)}
      ${partyCell('Closest Democrat', bestD)}
    </dl>
    <h2 id="ranked-h" class="sr-only">All candidates</h2>
    <div class="filters">
      ${select('f-party', 'Party', [['all', 'All'], ...PARTIES.map((p) => [p, p])], state.filters.party)}
      ${select('f-status', 'Status', [['all', 'All'], ...STATUSES.map((s) => [s, s])], state.filters.status)}
      ${select('f-sort', 'Sort by', [['alignment', 'Alignment'], ['coverage', 'Issues covered']], state.filters.sort)}
      <span class="filter-links"><a href="#compare">Compare two</a>${PREVIEW ? '' : '<button type="button" class="btn-link" data-print>Save as PDF</button>'}</span>
    </div>
    <div id="result-region">${resultsListHtml()}</div>
    ${engageBox()}
    ${marketsPanel()}
    ${leadershipSection()}
    ${answersAppendix()}`,
    after: wireResults,
  };
}

function wireResults() {
  const region = document.getElementById('result-region');
  const update = () => {
    region.innerHTML = resultsListHtml();
    applyWidths(region);
    announce(document.getElementById('result-count').textContent);
  };
  document.getElementById('f-party').addEventListener('change', (e) => { state.filters.party = e.target.value; update(); });
  document.getElementById('f-status').addEventListener('change', (e) => { state.filters.status = e.target.value; update(); });
  document.getElementById('f-sort').addEventListener('change', (e) => { state.filters.sort = e.target.value; update(); });
  const printBtn = document.querySelector('[data-print]');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  wireSignup();
}

/* ----- review all answers ----- */

function viewReview() {
  const rows = state.issues.map((issue, i) => {
    const a = state.answers[issue.id];
    const pos = !a ? '<span class="muted">Not answered</span>' : a.value === null ? '<span class="muted">Skipped</span>' : esc(positionLabel(issue, a.value));
    const imp = a && a.value !== null ? `<span class="tag tag-prov">${esc(importanceLabel(a.importance))}</span>` : '';
    return `<li class="review-row">
      <a href="#q-${i + 1}" class="review-link">
        <span class="review-title">${esc(issue.title)} ${imp}</span>
        <span class="review-pos">${pos}</span>
      </a>
    </li>`;
  }).join('');
  return {
    title: 'Your answers',
    html: `<div class="measure">
      <h1 tabindex="-1">Your answers</h1>
      <p class="muted">Tap an issue to change it.</p>
      <ul class="review-list">${rows}</ul>
      <div class="actions"><a class="btn btn-primary" href="#results">See results</a></div>
    </div>`,
  };
}

/* ----- candidate detail ----- */

function viewCandidate(id) {
  const c = candidateById(id);
  if (!c) return viewNotFound();
  const r = scoreCandidate(state.answers, c, state.issues);
  const age = ageFrom(c.birth_date);
  const profileUrl = safeUrl(c.profile_url);
  const statusUrl = safeUrl(c.status_source_url);

  const summary = r.answered === 0
    ? '<p class="tight"><a href="#q-1">Answer the issues</a> to see your match.</p>'
    : r.alignment === null
      ? '<p class="tight">No score: no known positions on the issues you answered.</p>'
      : `<p class="tight"><span class="score-num">${r.alignment}%</span> <span class="muted">${r.scored} of ${r.answered} issues${r.range ? ` &middot; could be ${r.range.low}&ndash;${r.range.high}%` : ''}</span></p>`;

  const rows = r.rows.map((row) => {
    const issue = issueById(row.issueId);
    const pos = c.positions[row.issueId];
    const a = state.answers[row.issueId];
    const yours = !a ? '<span class="muted">Not answered</span>' : a.value === null ? '<span class="muted">Skipped</span>' : termify(positionLabel(issue, a.value));
    const impNote = a && a.value !== null && a.importance >= 3 ? `<span class="importance-note">${esc(importanceLabel(a.importance))}</span>` : '';
    const theirs = termify(pos ? pos.summary : 'No clear public position.');
    return `<tr class="${row.dealbreaker ? 'row-flagged' : ''}">
      <th scope="row">${esc(issue.title)}${impNote}</th>
      <td data-label="You">${yours}</td>
      <td data-label="${esc(c.name)}">${theirs}</td>
      <td data-label="Source" class="source-cell">${sourceCell(pos)}</td>
      <td data-label="Match">${matchBadge(row.level)}${row.dealbreaker ? `<span class="cell-sub">${dealbreakerFlag('Dealbreaker')}</span>` : ''}</td>
    </tr>`;
  }).join('');

  return {
    title: c.name,
    html: `
    <a class="back-link no-print" href="#results">&larr; Results</a>
    <div class="profile-head">
      <h1 tabindex="-1">${esc(c.name)}</h1>
      <p class="result-meta">${partyTag(c.party)} ${esc(c.current_role)}${age === null ? '' : ` &middot; ${age}`}</p>
      <p class="result-meta"><strong>${esc(c.status)}</strong> <span class="muted">(${esc(fmtDate(c.status_date))})</span>: ${esc(c.status_note || '')}</p>
      <p class="result-meta link-row">${websiteLinks(c)}</p>
    </div>
    <div class="score-summary">${summary}
      ${r.dealbreakers.length ? `<p class="tight">${dealbreakerFlag(`Dealbreaker conflict: ${r.dealbreakers.map((d) => issueById(d).title).join(', ')}`)}</p>` : ''}
    </div>
    <div class="table-wrap">
      <table class="data stack">
        <caption class="sr-only">Issue by issue: you and ${esc(c.name)}</caption>
        <thead><tr>
          <th scope="col">Issue</th><th scope="col">You</th><th scope="col">${esc(c.name)}</th><th scope="col">Source</th><th scope="col">Match</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${candidateMarketSection(c)}
    <p class="small muted">Background: ${profileUrl ? externalLink(profileUrl, 'profile') : ''}${statusUrl ? ` &middot; ${externalLink(statusUrl, '2028 field')}` : ''}</p>
    <div class="actions no-print"><a class="btn" href="#compare-${esc(c.id)}">Compare</a></div>`,
  };
}

/* ----- compare ----- */

function defaultCompare(aId) {
  const ranked = hasAnyAnswers() ? rankCandidates(state.answers, state.candidates, state.issues) : null;
  const pick = (party, exclude) => {
    if (ranked) {
      const e = ranked.find((x) => x.candidate.party === party && x.candidate.id !== exclude && x.result.alignment !== null);
      if (e) return e.candidate.id;
    }
    const c = state.candidates.find((x) => x.party === party && x.id !== exclude);
    return c ? c.id : state.candidates.find((x) => x.id !== exclude).id;
  };
  const a = candidateById(aId) ? aId : pick('Republican');
  const aParty = candidateById(a).party;
  const b = pick(aParty === 'Republican' ? 'Democratic' : 'Republican', a);
  return { a, b };
}

function candidateOptions(selectedId) {
  return PARTIES.map((party) => `<optgroup label="${party}">${state.candidates
    .filter((c) => c.party === party)
    .slice().sort((x, y) => x.name.localeCompare(y.name))
    .map((c) => `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}

function viewCompare(aParam, bParam) {
  let aId = aParam || null;
  let bId = bParam || null;
  if (!candidateById(aId) || !candidateById(bId) || aId === bId) {
    const d = defaultCompare(aId);
    aId = d.a;
    if (!candidateById(bId) || bId === aId) bId = d.b;
  }
  const A = candidateById(aId);
  const B = candidateById(bId);
  const ra = scoreCandidate(state.answers, A, state.issues);
  const rb = scoreCandidate(state.answers, B, state.issues);
  const any = hasAnyAnswers();

  const scoreCell = (c, r) => `<div>
    <p class="tight h3"><a href="#candidate-${esc(c.id)}">${esc(c.name)}</a> ${partyTag(c.party)}</p>
    <p class="tight small muted">${esc(c.status)} (${esc(fmtDate(c.status_date))})</p>
    ${any ? (r.alignment === null ? '<p class="tight mt-xs muted">No overlap with your answers</p>'
      : `<p class="tight mt-xs"><span class="score-num">${r.alignment}%</span> <span class="small muted">${r.scored} of ${r.answered} issues${r.range ? ` &middot; could be ${r.range.low}&ndash;${r.range.high}%` : ''}</span></p>${r.dealbreakers.length ? `<p class="tight">${dealbreakerFlag(`Dealbreaker: ${r.dealbreakers.map((d) => issueById(d).title).join(', ')}`)}</p>` : ''}`)
    : ''}
  </div>`;

  const posCell = (c, row) => {
    const pos = c.positions[row.issueId];
    const url = pos ? safeUrl(pos.source_url) : null;
    const src = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(fmtDate(pos.source_date))}<span class="sr-only"> source (opens in a new tab)</span></a>` : '';
    const badge = any ? `${matchBadge(row.level)}${row.dealbreaker ? ` ${dealbreakerFlag('Dealbreaker')}` : ''} ` : '';
    return `${termify(pos ? pos.summary : 'No clear public position.')}<span class="cell-sub">${badge}${src}</span>`;
  };

  const rows = state.issues.map((issue, i) => {
    const a = state.answers[issue.id];
    const yours = !a ? '<span class="muted">Not answered</span>' : a.value === null ? '<span class="muted">Skipped</span>' : termify(positionLabel(issue, a.value));
    const rowA = ra.rows[i];
    const rowB = rb.rows[i];
    return `<tr class="${rowA.dealbreaker || rowB.dealbreaker ? 'row-flagged' : ''}">
      <th scope="row">${esc(issue.title)}</th>
      <td data-label="You">${yours}</td>
      <td data-label="${esc(A.name)}">${posCell(A, rowA)}</td>
      <td data-label="${esc(B.name)}">${posCell(B, rowB)}</td>
    </tr>`;
  }).join('');

  return {
    title: `Compare ${A.name} and ${B.name}`,
    html: `
    <h1 tabindex="-1">Compare</h1>
    ${any ? '' : '<p class="muted"><a href="#q-1">Answer the issues</a> to see how each matches you.</p>'}
    <div class="compare-pickers no-print">
      <label for="cmp-a">Candidate 1<select id="cmp-a">${candidateOptions(A.id)}</select></label>
      <label for="cmp-b">Candidate 2<select id="cmp-b">${candidateOptions(B.id)}</select></label>
    </div>
    <div class="compare-scores">${scoreCell(A, ra)}${scoreCell(B, rb)}</div>
    <div class="table-wrap">
      <table class="data stack">
        <caption class="sr-only">${esc(A.name)} and ${esc(B.name)}, issue by issue</caption>
        <thead><tr><th scope="col">Issue</th><th scope="col">You</th><th scope="col">${esc(A.name)}</th><th scope="col">${esc(B.name)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${seedNotice()}`,
    after: () => {
      const go = (which, value) => {
        const next = { a: A.id, b: B.id, [which]: value };
        if (next.a === next.b) next[which === 'a' ? 'b' : 'a'] = which === 'a' ? A.id : B.id;
        keepFocusSelector = `#cmp-${which}`;
        location.hash = `#compare-${next.a}--${next.b}`;
      };
      document.getElementById('cmp-a').addEventListener('change', (e) => go('a', e.target.value));
      document.getElementById('cmp-b').addEventListener('change', (e) => go('b', e.target.value));
    },
  };
}

/* ----- methodology ----- */

function viewMethodology() {
  const m = state.meta;
  const reviewed = m.last_reviewed ? fmtDate(m.last_reviewed) : 'not yet';
  const sections = [
    ['m-score', 'Scoring'], ['m-coding', 'How positions are coded'], ['m-status', 'Status'],
    ['m-limits', 'Limitations'], ['m-markets', 'Market odds'], ['m-privacy', 'Privacy and sharing'],
    ...(glossary.length ? [['m-terms', 'Terms explained']] : []),
  ];
  const terms = glossary.slice().sort((x, y) => x.term.localeCompare(y.term))
    .map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd></div>`).join('');
  return {
    title: 'Methodology',
    html: `
    <article class="prose">
      <h1 tabindex="-1">How it works</h1>
      <nav class="toc" aria-label="On this page"><ol>${sections.map(([id, t]) => `<li><a href="#${id}" data-anchor>${t}</a></li>`).join('')}</ol></nav>

      <h2 id="m-score" tabindex="-1">Scoring</h2>
      <p>Each issue has five positions, numbered 0 to 4 along one spectrum. The numbers order positions; they don't mean left or right.</p>
      <p class="formula">match     = 1 &minus; |you &minus; candidate| &divide; 4
alignment = &Sigma;(weight &times; match) &divide; &Sigma;(weight)</p>
      <p>Weights: Low 1, Medium 2, High 3, Dealbreaker 4. On a Dealbreaker issue, any candidate 2 or more steps away is flagged.</p>
      <p>Same position is <strong>Agree</strong>, one step apart is <strong>Partial</strong>, two or more is <strong>Disagree</strong>.</p>
      <p>Skipped issues, and issues where a candidate has no clear position, are left out. Each score says how many issues it covers. <strong>"Could be"</strong> shows the range the score could move to if those unknown positions were filled in, from all disagree to all agree.</p>
      <p>Example: you agree on a High issue (3 &times; 1.0) and are two steps apart on a Low one (1 &times; 0.5). (3 + 0.5) &divide; 4 = 88%.</p>

      <h2 id="m-coding" tabindex="-1">How positions are coded</h2>
      <p>Each position has a one-line summary, a source and a date. <strong>Record</strong> means past votes, laws or older statements; <strong>Stated 2026</strong> means a 2026 statement. <strong>Unverified</strong> means no editor has checked the source yet. <strong>Older record</strong> marks sources more than ${OLD_SOURCE_YEARS} years old.</p>
      <p>If a view doesn't fit the scale, it's left unscored and the summary explains why. Governors are often coded from state laws they signed, which may not predict what they'd do as president.</p>
      <p>Data last reviewed: <strong>${esc(reviewed)}</strong>. Draft compiled ${esc(fmtDate(m.seeded))}, from records through mid-2026.</p>

      <h2 id="m-status" tabindex="-1">Status</h2>
      <p><strong>Declared</strong> (announced), <strong>Exploring</strong> (actively preparing), <strong>Undecided</strong>, <strong>Says not running</strong> (not ruled out) or <strong>Declined</strong> (ruled out), each dated to the latest statement.</p>

      <h2 id="m-limits" tabindex="-1">Limitations</h2>
      <ul>
        <li>Five positions can't capture every nuance.</li>
        <li>Candidates change positions, and past roles may not predict a presidency.</li>
        <li>Some candidates have far less public record, so their scores rest on fewer issues.</li>
        <li>Alignment measures policy agreement only: not competence, character or electability.</li>
        <li>Leadership style is never scored.</li>
      </ul>
      <p><strong>Alignment reflects only the issues you answered and weighted. It is not a prediction or an endorsement.</strong></p>

      <h2 id="m-markets" tabindex="-1">Market odds</h2>
      <p>Odds come from Kalshi, a regulated prediction market. A contract pays $1 if the outcome happens, so a 23-cent price reads as a 23% chance. They show what traders expect, not what you agree with, and are never part of your score. Ballot Compass has no relationship with Kalshi.${state.markets ? ` Snapshot taken ${esc(fmtTimestamp(state.markets.fetched_at))}.` : ''}</p>

      <h2 id="m-privacy" tabindex="-1">Privacy and sharing</h2>
      <p>No accounts, tracking cookies or analytics. Your answers stay in this browser unless you choose to share them.</p>
      <p><strong>Sharing is optional.</strong> You can share your answers, plus any profile questions you answered: state, age range, voter registration, party leaning, marital status, household size and income range. Each one can be skipped, and you see your results either way. Shared answers are stored without your name, email, IP address or exact time, under a random code only your browser keeps. We publish only totals and never sell or share individual responses.</p>
      <p><strong>Updates list.</strong> Your email is kept on a separate list, never linked to your answers. Unsubscribe anytime.</p>
      <p><strong>Deleting.</strong> "Clear my answers" removes your answers from this browser and deletes any shared copy. Our host keeps standard request logs.</p>
      ${terms ? `<h2 id="m-terms" tabindex="-1">Terms explained</h2>
      <p class="muted">Tap any dotted-underlined term in the questions or candidate pages to see these.</p>
      <dl class="glossary">${terms}</dl>` : ''}
    </article>`,
    after: () => {
      main.querySelectorAll('[data-anchor]').forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(a.getAttribute('href').slice(1));
        if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }); }
      }));
    },
  };
}

function viewNotFound() {
  return {
    title: 'Page not found',
    html: '<div class="measure"><h1 tabindex="-1">Page not found</h1><p>That page does not exist. <a href="#start">Go to the start</a> or <a href="#results">view your results</a>.</p></div>',
  };
}

/* ---------- router ---------- */

/**
 * Routes are plain hash names (#results, #q-3, #candidate-ossoff, #compare-vance--harris)
 * so links survive being shared from hosts that only pass simple #names.
 * Older #/path links still resolve.
 */
function parseRoute() {
  let raw = '';
  try { raw = decodeURIComponent(location.hash.replace(/^#/, '')); } catch { raw = ''; }
  if (raw.startsWith('/')) {
    const [path, query = ''] = raw.slice(1).split('?');
    const [head, arg] = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query);
    if (head === 'compare') return { head, a: params.get('a'), b: params.get('b') };
    return { head: head === 'methodology' ? 'how-it-works' : head, arg };
  }
  if (!raw || raw === 'start') return { head: undefined };
  if (raw.startsWith('m-')) return { head: 'how-it-works', anchor: raw };
  const m = /^(q|candidate|compare)-(.+)$/.exec(raw);
  if (m && m[1] === 'compare') {
    const [a, b] = m[2].split('--');
    return { head: 'compare', a, b };
  }
  if (m) return { head: m[1], arg: m[2] };
  return { head: raw };
}

function applyWidths(root = main) {
  const pct = (v) => `${Math.max(0, Math.min(100, Number(v) || 0))}%`;
  root.querySelectorAll('[data-width]').forEach((el) => { el.style.width = pct(el.dataset.width); });
  root.querySelectorAll('[data-left]').forEach((el) => { el.style.left = pct(el.dataset.left); });
}

function updateNav(head) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === head) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function render() {
  const { head, arg, a, b } = parseRoute();
  let view;
  switch (head) {
    case undefined: view = viewIntro(); break;
    case 'q': view = viewQuestion(Number.parseInt(arg, 10)); break;
    case 'leadership': view = viewLeadership(); break;
    case 'about-you': view = viewAboutYou(); break;
    case 'profile': view = viewProfile(); break;
    case 'review': view = viewReview(); break;
    case 'results': view = viewResults(); break;
    case 'candidate': view = viewCandidate(arg); break;
    case 'compare': view = viewCompare(a, b); break;
    case 'how-it-works': view = viewMethodology(); break;
    default: view = viewNotFound();
  }
  closeTerm();
  main.innerHTML = `<div class="wrap">${view.html}</div>`;
  document.title = view.title ? `${view.title} | Ballot Compass` : 'Ballot Compass';
  updateNav(head);
  applyWidths();
  if (view.after) view.after();

  if (keepFocusSelector) {
    const el = main.querySelector(keepFocusSelector);
    keepFocusSelector = null;
    if (el) { el.focus(); return; }
  }
  window.scrollTo(0, 0);
  if (!firstRender) {
    const h1 = main.querySelector('h1');
    if (h1) h1.focus();
  }
  firstRender = false;
}

/* ---------- global events ---------- */

/** In-page confirmation. Native confirm() and alert() are blocked in some hosts, so never use them. */
function askConfirm({ title, body, confirmLabel }) {
  const dlg = document.getElementById('confirm-dialog');
  dlg.querySelector('[data-confirm-title]').textContent = title;
  dlg.querySelector('[data-confirm-body]').textContent = body;
  dlg.querySelector('[data-confirm-yes]').textContent = confirmLabel;
  dlg.querySelector('[data-confirm-error]').textContent = '';
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
  });
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('.skip-link')) {
    e.preventDefault();
    main.focus();
    return;
  }
  if (e.target.closest('[data-clear]')) clearAnswers();
  if (e.target.closest('[data-start-over]')) {
    const ok = await askConfirm({ title: 'Start over?', body: 'This clears the answers saved in this browser.', confirmLabel: 'Start over' });
    if (ok) {
      // Keep the share code so sharing again replaces the earlier copy instead of adding a duplicate.
      clearAll({ keepShareId: true });
      location.hash = '#q-1';
    }
  }
});

async function clearAnswers() {
  const shared = state.share;
  const ok = await askConfirm({
    title: 'Clear your answers?',
    body: shared ? 'This removes them from this browser and deletes the anonymous copy you shared.' : 'This removes them from this browser.',
    confirmLabel: 'Clear answers',
  });
  if (!ok) return;
  if (shared) {
    const r = await postJson('api/responses', { submission_id: shared.id }, 'DELETE');
    if (!r.ok) {
      announce('Your shared copy could not be deleted right now, so nothing was cleared. Try again later.');
      const flash = document.createElement('p');
      flash.className = 'flash flash-warn';
      flash.setAttribute('role', 'alert');
      flash.textContent = 'Your shared copy could not be deleted right now, so nothing was cleared. Try again later.';
      main.querySelector('.wrap').prepend(flash);
      return;
    }
  }
  clearAll();
  state.filters = { party: 'all', status: 'all', sort: 'alignment' };
  if (!parseRoute().head) render(); else location.hash = '#start';
  announce(shared ? 'Your answers and your shared copy were deleted.' : 'Your answers were cleared.');
}

window.addEventListener('hashchange', render);

async function boot() {
  try {
    const [issuesRes, candRes] = await Promise.all([fetch('data/issues.json'), fetch('data/candidates.json')]);
    if (!issuesRes.ok || !candRes.ok) throw new Error('Data files could not be loaded.');
    const issuesData = await issuesRes.json();
    const candData = await candRes.json();
    state.issues = issuesData.issues;
    state.traits = issuesData.leadership_traits;
    state.scaleNote = issuesData.scale_note || '';
    state.candidates = candData.candidates;
    state.meta = candData.meta || {};
    try {
      const gRes = await fetch('data/glossary.json');
      if (gRes.ok) setGlossary((await gRes.json()).terms);
    } catch { /* no glossary: terms simply aren't underlined */ }
    // Market prices are an optional, same-origin snapshot. The app works without them.
    try {
      const mRes = await fetch('data/markets.json');
      if (mRes.ok) {
        const m = await mRes.json();
        if (m && m.candidates && m.events && m.fetched_at) state.markets = m;
      }
    } catch { /* no market snapshot: the section is simply hidden */ }
  } catch {
    main.innerHTML = `<div class="wrap measure"><h1>Data could not be loaded</h1>
      <p>Ballot Compass loads its candidate data from files next to this page. If you opened <code>index.html</code> directly from disk, serve the folder over HTTP instead, for example with <code>python3 -m http.server</code>, and open the address it prints.</p></div>`;
    document.querySelectorAll('[data-stamp]').forEach((el) => { el.textContent = 'Data not loaded.'; });
    return;
  }
  loadSaved();
  renderStamp();
  render();
}

boot();
