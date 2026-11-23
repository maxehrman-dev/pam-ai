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

const STORAGE_KEY = 'ballot-compass:v1';
const STATUSES = ['Declared', 'Exploring', 'Undecided', 'Says not running', 'Declined'];
const PARTIES = ['Republican', 'Democratic'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const IMPORTANCE_HINTS = {
  1: 'Counts once in the weighted average.',
  2: 'Counts twice in the weighted average.',
  3: 'Counts three times in the weighted average.',
  4: 'Counts four times, and any candidate two or more steps away from your position is flagged.',
};

const state = {
  issues: [],
  traits: [],
  candidates: [],
  meta: {},
  scaleNote: '',
  answers: {},
  leadership: { ranking: null, skipped: false },
  filters: { party: 'all', status: 'all' },
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
  return '<span class="tag tag-verify">Needs verification</span>';
}

function sourceCell(pos) {
  if (!pos || (!pos.source_url && !pos.source_label)) {
    return `<span class="muted">No source: position not on record</span>${pos && pos.needs_verification ? `<span class="source-tags">${verifyTag()}</span>` : ''}`;
  }
  const url = safeUrl(pos.source_url);
  const label = esc(pos.source_label || 'Source');
  const link = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>` : `<span class="muted">${label || 'No source'}</span>`;
  const tags = [];
  if (pos.provenance) tags.push(`<span class="tag tag-prov">${esc(pos.provenance)}</span>`);
  if (pos.needs_verification) tags.push(verifyTag());
  const date = pos.source_date ? `<span class="cell-sub">${esc(fmtDate(pos.source_date))}</span>` : '';
  return `${link}${date}${tags.length ? `<span class="source-tags">${tags.join('')}</span>` : ''}`;
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
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: state.answers, leadership: state.leadership }));
  } catch {
    /* storage unavailable: answers live only for this page view */
  }
}

function clearAll() {
  state.answers = {};
  state.leadership = { ranking: null, skipped: false };
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ---------- data stamp ---------- */

function renderStamp() {
  const m = state.meta;
  const html = m.last_reviewed
    ? `Data last reviewed: <strong>${esc(fmtDate(m.last_reviewed))}</strong>${m.reviewed_by ? ` by ${esc(m.reviewed_by)}` : ''}.`
    : `Data last reviewed: <strong>Not yet reviewed</strong>. Seed data compiled ${esc(fmtDate(m.seeded))}; every position needs verification.`;
  document.querySelectorAll('[data-stamp]').forEach((el) => { el.innerHTML = html; });
}

function seedNotice() {
  if (state.meta.last_reviewed) return '';
  return `<div class="notice notice-flag">
    <p><strong>Positions are not yet verified.</strong> This seed data covers public records and statements through mid-2026, before the November 2026 elections, and has not been checked by an editor. Check the source links before relying on any position.</p>
  </div>`;
}

/* ---------- views ---------- */

function viewIntro() {
  const total = state.issues.length;
  const next = firstUnvisitedIndex();
  const started = Object.keys(state.answers).length > 0;
  let primary;
  if (!started) {
    primary = '<a class="btn btn-primary" href="#/q/1">Start</a>';
  } else if (next === -1) {
    primary = '<a class="btn btn-primary" href="#/results">View your results</a><button type="button" class="btn" data-start-over>Start over</button>';
  } else {
    primary = `<a class="btn btn-primary" href="#/q/${next + 1}">Continue with issue ${next + 1} of ${total}</a><button type="button" class="btn" data-start-over>Start over</button>`;
  }

  return {
    title: null,
    html: `
    <div class="intro">
      <div>
        <p class="kicker">2028 presidential field &middot; issue comparison</p>
        <h1 tabindex="-1">Compare your views with the 2028 presidential contenders</h1>
        <p class="lede">Ballot Compass asks where you stand on ${total} policy issues and how much each one matters to you, then compares your answers with the public records and statements of ${state.candidates.length} possible candidates from both parties. Each candidate's alignment score is a weighted average of how close their position is to yours on the issues you answered. Issues where a candidate's position is unknown are left out of that score, and every result says how many issues it is based on.</p>
        <div class="actions">${primary}<a href="#/methodology">Methodology</a></div>
      </div>
      <aside aria-labelledby="before-h">
        <h2 id="before-h" class="h3">Before you begin</h2>
        <ul class="fact-list">
          <li><strong>About 10 minutes.</strong> One issue per screen. You can skip any issue.</li>
          <li><strong>Sourced.</strong> Each candidate position has a plain-English summary, a source link, a date, and a note on whether it comes from a recent statement or the record.</li>
          <li><strong>Private.</strong> No account and no tracking. Your answers stay in this browser.</li>
          <li><strong>Not an endorsement.</strong> The tool shows where each candidate agrees and differs with you. The decision is yours.</li>
        </ul>
      </aside>
    </div>
    <div class="measure mt-lg">${seedNotice()}</div>`,
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
      <span class="option-text">${esc(p.label)}</span>
    </label>`).join('');

  return {
    title: `${issue.title} (issue ${n} of ${total})`,
    html: `
    <div class="measure">
      <div class="progress">
        <div class="progress-label"><span>Issue ${n} of ${total}</span><span>${answeredCount()} answered</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="${pct}"></div></div>
      </div>
      <form id="q-form" data-issue="${esc(issue.id)}" data-n="${n}" novalidate>
        <div class="question-head">
          <h1 tabindex="-1">${esc(issue.title)}</h1>
          <p class="question-text">${esc(issue.question)}</p>
        </div>
        <details class="background">
          <summary>Background</summary>
          <div class="bg-body">${issue.background.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
        </details>
        <p class="form-error" id="q-error" role="alert"></p>
        <fieldset aria-describedby="q-error">
          <legend>Which position is closest to yours?</legend>
          <div class="options">
            ${options}
            <label class="option option-skip">
              <input type="radio" name="position" value="skip" ${isSkip ? 'checked' : ''}>
              <span class="option-text">No opinion / skip this issue</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="importance" id="imp-fs" ${isSkip ? 'disabled' : ''}>
          <legend>How much does this issue matter to you?</legend>
          <div class="importance-row">
            <label for="imp">Importance</label>
            <output id="imp-out" for="imp" class="importance-value">${importanceLabel(imp)}</output>
          </div>
          <input type="range" id="imp" name="importance" min="1" max="4" step="1" value="${imp}" aria-valuetext="${importanceLabel(imp)}" aria-describedby="imp-hint">
          <div class="importance-scale" aria-hidden="true"><span>Low</span><span>Medium</span><span>High</span><span>Dealbreaker</span></div>
          <p class="importance-hint" id="imp-hint">${isSkip ? 'Not used for skipped issues.' : IMPORTANCE_HINTS[imp]}</p>
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
      hint.textContent = skip ? 'Not used for skipped issues.' : IMPORTANCE_HINTS[Number(range.value)];
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
    location.hash = n > 1 ? `#/q/${n - 1}` : '#/';
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
    location.hash = n < state.issues.length ? `#/q/${n + 1}` : '#/leadership';
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
        <div class="progress-label"><span>Optional section</span><span>${answeredCount()} of ${state.issues.length} issues answered</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" data-width="100"></div></div>
      </div>
      <h1 tabindex="-1">Leadership style <span class="muted">(optional)</span></h1>
      <p class="question-text">Rank these qualities from most to least important to you.</p>
      <p class="muted">Your ranking appears as a separate section of your results. It never changes any candidate's policy alignment score, and Ballot Compass does not rate candidates on these qualities.</p>
      <ol class="rank-list" id="rank-list" aria-label="Leadership qualities, most important first">${rankListHtml(ranking)}</ol>
      <p class="small muted">Use the arrow buttons to reorder. Position 1 is most important.</p>
      <div class="actions actions-split">
        <button type="button" class="btn" data-l-back>Back</button>
        <span class="actions actions-inline">
          <button type="button" class="btn" data-l-skip>Skip this section</button>
          <button type="button" class="btn btn-primary" data-l-save>Save ranking and see results</button>
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
  document.querySelector('[data-l-back]').addEventListener('click', () => { location.hash = `#/q/${state.issues.length}`; });
  document.querySelector('[data-l-skip]').addEventListener('click', () => {
    state.leadership = { ranking: null, skipped: true };
    save();
    location.hash = '#/results';
  });
  document.querySelector('[data-l-save]').addEventListener('click', () => {
    state.leadership = { ranking: ranking.slice(), skipped: false };
    save();
    location.hash = '#/results';
  });
}

/* ----- results ----- */

function bestByParty(ranked, party) {
  return ranked.find((r) => r.candidate.party === party && r.result.alignment !== null) || null;
}

function basisText(result) {
  return `Based on ${result.scored} of the ${result.answered} issue${result.answered === 1 ? '' : 's'} you answered`;
}

function issueListItems(rows, emptyText) {
  if (!rows.length) return `<li class="muted">${esc(emptyText)}</li>`;
  return rows.map((r) => {
    const issue = issueById(r.issueId);
    const extra = r.dealbreaker ? ' &middot; Dealbreaker' : '';
    return `<li><span>${esc(issue.title)}</span><span class="chip-level">${esc(r.level)}${extra}</span></li>`;
  }).join('');
}

function resultCard(entry, rank) {
  const { candidate: c, result: r } = entry;
  const agree = r.rows.filter((x) => x.level === 'Agree').sort((a, b) => b.weight - a.weight);
  const differ = r.rows
    .filter((x) => x.level === 'Partial' || x.level === 'Disagree')
    .sort((a, b) => (b.gap - a.gap) || (b.weight - a.weight));
  const unknown = r.rows.filter((x) => x.level === 'Unknown');
  const scoreBlock = r.alignment === null
    ? `<p class="score-num" aria-label="No alignment score">&mdash;</p><p class="score-basis">Not enough data: none of your answered issues has a known position for this candidate.</p>`
    : `<p class="score-num">${r.alignment}%<span class="sr-only"> alignment</span></p>
       <div class="score-bar" aria-hidden="true"><span data-width="${r.alignment}"></span></div>
       <p class="score-basis">${basisText(r)}</p>`;
  const lowCoverage = r.alignment !== null && r.scored < Math.ceil(r.answered / 2)
    ? '<p class="caution">Limited data: this score covers fewer than half of the issues you answered.</p>' : '';
  const flags = r.dealbreakers.length
    ? `<p class="flags-line">${r.dealbreakers.map((id) => dealbreakerFlag(`Dealbreaker conflict: ${issueById(id).title}`)).join('')}</p>` : '';

  return `<li class="result-card">
    <div class="result-top">
      <span class="result-rank" aria-hidden="true">${rank}</span>
      <div>
        <h3 class="result-name"><a href="#/candidate/${esc(c.id)}">${esc(c.name)}</a></h3>
        <p class="result-meta">${partyTag(c.party)} ${esc(c.current_role)}</p>
        <p class="result-meta">Status: ${statusText(c)}</p>
      </div>
      <div class="result-score">${scoreBlock}</div>
      <div class="result-body">
        <p class="tally"><span>Agree: <strong>${r.counts.Agree}</strong></span><span>Partial: <strong>${r.counts.Partial}</strong></span><span>Disagree: <strong>${r.counts.Disagree}</strong></span><span>Unknown: <strong>${r.counts.Unknown}</strong></span></p>
        <div class="agree-differ">
          <div><h4>Where you agree</h4><ul class="issue-chips">${issueListItems(agree, 'No exact matches among scored issues')}</ul></div>
          <div><h4>Where you differ</h4><ul class="issue-chips">${issueListItems(differ, 'No differences among scored issues')}</ul></div>
        </div>
        ${flags}
        ${lowCoverage}
        ${unknown.length ? `<p class="small muted mt-sm">No known position on: ${unknown.map((u) => esc(issueById(u.issueId).title)).join(', ')}.</p>` : ''}
        <div class="card-actions">
          <a href="#/candidate/${esc(c.id)}">Issue-by-issue table for ${esc(c.name)}</a>
          <a href="#/compare?a=${esc(c.id)}">Compare with another candidate</a>
        </div>
      </div>
    </div>
  </li>`;
}

function filtered(ranked) {
  return ranked.filter((e) => (state.filters.party === 'all' || e.candidate.party === state.filters.party)
    && (state.filters.status === 'all' || e.candidate.status === state.filters.status));
}

function resultsListHtml(ranked) {
  const list = filtered(ranked);
  const count = `<p class="result-count" id="result-count">Showing ${list.length} of ${ranked.length} candidates, ranked by alignment.</p>`;
  if (!list.length) return `${count}<p>No candidates match these filters.</p>`;
  return `${count}<ol class="result-list" aria-labelledby="ranked-h">${list.map((e) => resultCard(e, ranked.indexOf(e) + 1)).join('')}</ol>`;
}

function leadershipSection() {
  const traitLabel = (id) => state.traits.find((t) => t.id === id).label;
  let intro;
  if (state.leadership.ranking) {
    intro = `<p>Your ranking, most important first:</p>
      <ol>${state.leadership.ranking.map((id) => `<li>${esc(traitLabel(id))}</li>`).join('')}</ol>`;
  } else {
    intro = `<p class="muted">${state.leadership.skipped ? 'You skipped this section.' : 'You have not ranked leadership qualities.'} <a href="#/leadership" class="no-print">Rank them now</a></p>`;
  }
  const rows = state.candidates.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `
    <tr>
      <th scope="row">${esc(c.name)} <span class="cell-sub">${partyTag(c.party)}</span></th>
      <td data-label="Executive experience">${esc(c.background.executive_experience || 'None in elected or appointed executive office')}</td>
      <td data-label="Legislative experience">${esc(c.background.legislative_experience || 'None')}</td>
    </tr>`).join('');
  return `<section aria-labelledby="lead-h" class="section-gap">
    <h2 id="lead-h">Leadership style <span class="muted">(not scored)</span></h2>
    <p>This section is separate from the policy comparison above and does not affect any alignment score. Ballot Compass does not rate candidates on leadership qualities. Bipartisan record, independence from party and communication style are judgments for you to make; the table lists only factual experience.</p>
    ${intro}
    <div class="table-wrap">
      <table class="data stack">
        <caption>Experience, by candidate (alphabetical)</caption>
        <thead><tr><th scope="col">Candidate</th><th scope="col">Executive experience</th><th scope="col">Legislative experience</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function answersAppendix() {
  const rows = state.issues.map((issue) => {
    const a = state.answers[issue.id];
    const label = a ? (a.value === null ? 'Skipped' : positionLabel(issue, a.value)) : 'Not answered';
    const imp = a && a.value !== null ? importanceLabel(a.importance) : '';
    return `<tr><th scope="row">${esc(issue.title)}</th><td data-label="Your position">${esc(label)}</td><td data-label="Importance">${esc(imp)}</td></tr>`;
  }).join('');
  return `<section aria-labelledby="your-answers-h" class="section-gap">
    <h2 id="your-answers-h">Your answers</h2>
    <div class="table-wrap"><table class="data stack">
      <thead><tr><th scope="col">Issue</th><th scope="col">Your position</th><th scope="col">Importance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

function viewResults() {
  const answered = answeredCount();
  if (!answered) {
    return {
      title: 'Your results',
      html: `<div class="measure">
        <h1 tabindex="-1">Your results</h1>
        <p>You have not answered any issues yet, so there is nothing to compare. Answer at least one issue to see how each candidate's positions line up with yours.</p>
        <div class="actions"><a class="btn btn-primary" href="#/q/1">Start</a><a href="#/methodology">Methodology</a></div>
      </div>`,
    };
  }
  const ranked = rankCandidates(state.answers, state.candidates, state.issues);
  const bestR = bestByParty(ranked, 'Republican');
  const bestD = bestByParty(ranked, 'Democratic');
  const partyCell = (label, e) => `<div><dt>${esc(label)}</dt><dd>${e ? `<a href="#/candidate/${esc(e.candidate.id)}">${esc(e.candidate.name)}</a>, ${e.result.alignment}% <span class="small muted">(${e.result.scored} of ${e.result.answered} issues)</span>` : '<span class="muted">Not enough data</span>'}</dd></div>`;
  const dealbreakers = state.issues.filter((i) => state.answers[i.id] && state.answers[i.id].value !== null && state.answers[i.id].importance === DEALBREAKER).length;
  const total = state.issues.length;

  return {
    title: 'Your results',
    html: `
    <div class="print-only">
      <p><strong>Ballot Compass: your results</strong>, generated ${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}. For your own reference.</p>
    </div>
    <div class="results-head">
      <div>
        <h1 tabindex="-1">Your results</h1>
        <p>You answered ${answered} of ${total} issues${dealbreakers ? ` and marked ${dealbreakers} as a dealbreaker` : ''}. <a href="#/q/1" class="no-print">Edit my answers</a></p>
      </div>
    </div>
    <div class="notice"><p><strong>Alignment reflects only the issues you answered and weighted. It is not a prediction or an endorsement.</strong></p></div>
    ${seedNotice()}
    <div class="toolbar">
      <a class="btn" href="#/compare">Compare two candidates</a>
      <button type="button" class="btn" data-print>Export as PDF</button>
      <span class="small muted">Opens your browser's print dialog; choose "Save as PDF".</span>
    </div>
    <dl class="party-summary" aria-label="Highest alignment in each party">
      ${partyCell('Highest alignment among Republicans', bestR)}
      ${partyCell('Highest alignment among Democrats', bestD)}
    </dl>
    <h2 id="ranked-h">All candidates</h2>
    <div class="filters">
      <label>Party
        <select id="f-party">
          <option value="all">All parties</option>
          ${PARTIES.map((p) => `<option value="${p}" ${state.filters.party === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </label>
      <label>Status
        <select id="f-status">
          <option value="all">All statuses</option>
          ${STATUSES.map((s) => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="result-region">${resultsListHtml(ranked)}</div>
    ${leadershipSection()}
    ${answersAppendix()}`,
    after: () => wireResults(ranked),
  };
}

function wireResults(ranked) {
  const region = document.getElementById('result-region');
  const update = () => {
    region.innerHTML = resultsListHtml(ranked);
    applyWidths(region);
    announce(document.getElementById('result-count').textContent);
  };
  document.getElementById('f-party').addEventListener('change', (e) => { state.filters.party = e.target.value; update(); });
  document.getElementById('f-status').addEventListener('change', (e) => { state.filters.status = e.target.value; update(); });
  document.querySelector('[data-print]').addEventListener('click', () => window.print());
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
    ? '<p>Answer the issue questions to see your alignment with this candidate. <a href="#/q/1">Start</a></p>'
    : r.alignment === null
      ? `<p><strong>No alignment score.</strong> None of the ${r.answered} issues you answered has a known position for ${esc(c.name)}.</p>`
      : `<p class="tight"><span class="score-num">${r.alignment}%</span> alignment</p>
         <p class="tight">${basisText(r)}</p>
         <p class="tight muted">Agree ${r.counts.Agree} &middot; Partial ${r.counts.Partial} &middot; Disagree ${r.counts.Disagree} &middot; Unknown ${r.counts.Unknown}</p>`;

  const rows = r.rows.map((row) => {
    const issue = issueById(row.issueId);
    const pos = c.positions[row.issueId];
    const a = state.answers[row.issueId];
    const yours = !a ? '<span class="muted">Not answered</span>' : a.value === null ? '<span class="muted">Skipped</span>' : esc(positionLabel(issue, a.value));
    const impNote = a && a.value !== null ? `<span class="importance-note">Importance: ${esc(importanceLabel(a.importance))}</span>` : '';
    const coded = isValidValue(pos && pos.value)
      ? `<span class="cell-sub">Coded as: ${esc(positionLabel(issue, pos.value))}</span>`
      : '<span class="cell-sub">Not scored for this candidate.</span>';
    const theirs = `${esc(pos ? pos.summary : 'No clear public position found.')}${coded}`;
    return `<tr class="${row.dealbreaker ? 'row-flagged' : ''}">
      <th scope="row">${esc(issue.title)}${impNote}</th>
      <td data-label="Your position">${yours}</td>
      <td data-label="Their position">${theirs}</td>
      <td data-label="Source" class="source-cell">${sourceCell(pos)}</td>
      <td data-label="Match">${matchBadge(row.level)}${row.dealbreaker ? `<span class="cell-sub">${dealbreakerFlag('Dealbreaker')}</span>` : ''}</td>
    </tr>`;
  }).join('');

  return {
    title: c.name,
    html: `
    <a class="back-link no-print" href="#/results">&larr; Back to all results</a>
    <div class="profile-head">
      <p class="kicker">Candidate</p>
      <h1 tabindex="-1">${esc(c.name)}</h1>
      <p class="result-meta">${partyTag(c.party)} ${esc(c.current_role)}</p>
    </div>
    <div class="measure"><p>${esc(c.bio)}</p></div>
    <dl class="profile-facts">
      <div><dt>Age</dt><dd>${age === null ? 'Unknown' : age}</dd></div>
      <div><dt>2028 status</dt><dd>${statusText(c)}<span class="cell-sub">${esc(c.status_note || '')}</span>${c.status_needs_verification ? `<span class="source-tags">${verifyTag()}</span>` : ''}</dd></div>
      <div><dt>Sources</dt><dd>${profileUrl ? `<a href="${esc(profileUrl)}" target="_blank" rel="noopener noreferrer">Profile<span class="sr-only"> (opens in a new tab)</span></a>` : ''}${statusUrl ? ` &middot; <a href="${esc(statusUrl)}" target="_blank" rel="noopener noreferrer">2028 field<span class="sr-only"> (opens in a new tab)</span></a>` : ''}</dd></div>
    </dl>
    <div class="score-summary">${summary}</div>
    ${r.dealbreakers.length ? `<div class="notice notice-flag"><p>${dealbreakerFlag('Dealbreaker conflict')} ${esc(c.name)}'s position is two or more steps from yours on an issue you marked as a dealbreaker: ${r.dealbreakers.map((d) => esc(issueById(d).title)).join(', ')}.</p></div>` : ''}
    <div class="table-wrap">
      <table class="data stack">
        <caption>Issue by issue: you and ${esc(c.name)}</caption>
        <thead><tr>
          <th scope="col">Issue</th><th scope="col">Your position</th><th scope="col">Their position</th><th scope="col">Source</th><th scope="col">Match</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="small muted">Match levels: Agree means the same position; Partial means one step apart; Disagree means two or more steps apart; Unknown means no clear position, so the issue is not scored.</p>
    <div class="actions no-print"><a class="btn" href="#/compare?a=${esc(c.id)}">Compare with another candidate</a><a href="#/results">Back to all results</a></div>`,
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

function viewCompare(params) {
  let aId = params.get('a');
  let bId = params.get('b');
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
    <p class="tight h3"><a href="#/candidate/${esc(c.id)}">${esc(c.name)}</a> ${partyTag(c.party)}</p>
    <p class="tight small muted">Status: ${statusText(c)}</p>
    ${any ? (r.alignment === null ? '<p class="tight mt-xs">No alignment score: no overlap with your answers.</p>'
      : `<p class="tight mt-xs"><span class="score-num">${r.alignment}%</span> alignment</p><p class="tight small muted">${basisText(r)}${r.dealbreakers.length ? ` &middot; ${r.dealbreakers.length} dealbreaker conflict${r.dealbreakers.length > 1 ? 's' : ''}` : ''}</p>`)
    : ''}
  </div>`;

  const posCell = (c, row) => {
    const pos = c.positions[row.issueId];
    const known = pos && isValidValue(pos.value);
    const url = pos ? safeUrl(pos.source_url) : null;
    const src = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source, ${esc(fmtDate(pos.source_date))}<span class="sr-only"> (opens in a new tab)</span></a>` : '';
    const badge = any ? `<span class="cell-sub">${matchBadge(row.level)}${row.dealbreaker ? ` ${dealbreakerFlag('Dealbreaker')}` : ''}</span>` : '';
    return `${esc(pos ? pos.summary : 'No clear public position found.')}${known ? '' : '<span class="cell-sub">Not scored.</span>'}${badge}<span class="cell-sub">${src}${pos && pos.provenance ? ` &middot; ${esc(pos.provenance)}` : ''}</span>`;
  };

  const rows = state.issues.map((issue, i) => {
    const a = state.answers[issue.id];
    const yours = !a ? '<span class="muted">Not answered</span>' : a.value === null ? '<span class="muted">Skipped</span>' : `${esc(positionLabel(issue, a.value))}<span class="importance-note">Importance: ${esc(importanceLabel(a.importance))}</span>`;
    const rowA = ra.rows[i];
    const rowB = rb.rows[i];
    return `<tr class="${rowA.dealbreaker || rowB.dealbreaker ? 'row-flagged' : ''}">
      <th scope="row">${esc(issue.title)}</th>
      <td data-label="Your position">${yours}</td>
      <td data-label="${esc(A.name)}">${posCell(A, rowA)}</td>
      <td data-label="${esc(B.name)}">${posCell(B, rowB)}</td>
    </tr>`;
  }).join('');

  return {
    title: `Compare ${A.name} and ${B.name}`,
    html: `
    <h1 tabindex="-1">Compare two candidates</h1>
    ${any ? '' : '<p class="muted">You have not answered any issues, so only the candidates\' positions are shown. <a href="#/q/1">Answer the issues</a> to see match levels.</p>'}
    <div class="compare-pickers no-print">
      <label for="cmp-a">First candidate<select id="cmp-a">${candidateOptions(A.id)}</select></label>
      <label for="cmp-b">Second candidate<select id="cmp-b">${candidateOptions(B.id)}</select></label>
    </div>
    <div class="compare-scores">${scoreCell(A, ra)}${scoreCell(B, rb)}</div>
    <div class="table-wrap">
      <table class="data stack">
        <caption>${esc(A.name)} and ${esc(B.name)}, issue by issue</caption>
        <thead><tr><th scope="col">Issue</th><th scope="col">Your position</th><th scope="col">${esc(A.name)}</th><th scope="col">${esc(B.name)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="small muted">All seeded positions need verification. Follow the source links before relying on any of them.</p>`,
    after: () => {
      const go = (which, value) => {
        const next = { a: A.id, b: B.id, [which]: value };
        if (next.a === next.b) next[which === 'a' ? 'b' : 'a'] = which === 'a' ? A.id : B.id;
        keepFocusSelector = `#cmp-${which}`;
        location.hash = `#/compare?a=${encodeURIComponent(next.a)}&b=${encodeURIComponent(next.b)}`;
      };
      document.getElementById('cmp-a').addEventListener('change', (e) => go('a', e.target.value));
      document.getElementById('cmp-b').addEventListener('change', (e) => go('b', e.target.value));
    },
  };
}

/* ----- methodology ----- */

function viewMethodology() {
  const m = state.meta;
  const reviewed = m.last_reviewed ? fmtDate(m.last_reviewed) : 'Not yet reviewed by a human editor';
  const issueList = state.issues.map((i) => `<li>${esc(i.title)}</li>`).join('');
  return {
    title: 'Methodology',
    html: `
    <article class="prose">
      <p class="kicker">How Ballot Compass works</p>
      <h1 tabindex="-1">Methodology</h1>
      <p class="lede">Ballot Compass compares your stated positions with each candidate's coded positions, issue by issue. This page explains the formula, the weighting, how positions were coded, and what the tool cannot tell you.</p>
      <nav class="toc" aria-label="On this page"><ol>
        <li><a href="#m-scale" data-anchor>The issue scales</a></li>
        <li><a href="#m-formula" data-anchor>Scoring formula</a></li>
        <li><a href="#m-weight" data-anchor>Weighting and dealbreakers</a></li>
        <li><a href="#m-coverage" data-anchor>Coverage and unknowns</a></li>
        <li><a href="#m-coding" data-anchor>How positions were coded</a></li>
        <li><a href="#m-status" data-anchor>Candidate status</a></li>
        <li><a href="#m-leadership" data-anchor>Leadership style</a></li>
        <li><a href="#m-data" data-anchor>Data and updates</a></li>
        <li><a href="#m-limits" data-anchor>Limitations</a></li>
        <li><a href="#m-privacy" data-anchor>Privacy</a></li>
      </ol></nav>

      <h2 id="m-scale" tabindex="-1">The issue scales</h2>
      <p>Each of the ${state.issues.length} issues has five positions arranged along a single policy spectrum, numbered 0 to 4. ${esc(state.scaleNote)} Each position is written so that people who hold it would accept the wording. You can also choose "No opinion / skip" on any issue.</p>
      <ol>${issueList}</ol>

      <h2 id="m-formula" tabindex="-1">Scoring formula</h2>
      <p>For each issue, the match between you and a candidate depends on how many steps apart your positions are:</p>
      <p class="formula">match = 1 &minus; |your position &minus; candidate position| &divide; 4

same position        &rarr; 1.00  (Agree)
one step apart       &rarr; 0.75  (Partial)
two steps apart      &rarr; 0.50  (Disagree)
three steps apart    &rarr; 0.25  (Disagree)
opposite ends        &rarr; 0.00  (Disagree)</p>
      <p>A candidate's alignment is the weighted average of those matches across the issues that can be scored, shown as a percentage:</p>
      <p class="formula">alignment = &Sigma;(weight &times; match) &divide; &Sigma;(weight)</p>
      <p><strong>Example.</strong> You answer two issues: one High (weight 3) where you and a candidate agree (match 1.00), and one Low (weight 1) where you are two steps apart (match 0.50). Alignment = (3 &times; 1.00 + 1 &times; 0.50) &divide; (3 + 1) = 0.875, shown as 88%.</p>

      <h2 id="m-weight" tabindex="-1">Weighting and dealbreakers</h2>
      <ul>
        <li>Low = weight 1</li>
        <li>Medium = weight 2 (the default)</li>
        <li>High = weight 3</li>
        <li>Dealbreaker = weight 4, plus a visible flag on any candidate whose position is two or more steps from yours on that issue</li>
      </ul>
      <p>A dealbreaker flag does not remove a candidate from the list or change the ranking beyond its weight. It is there so a conflict on an issue you care most about is never hidden inside an average.</p>

      <h2 id="m-coverage" tabindex="-1">Coverage and unknowns</h2>
      <p>Two kinds of issues are left out of a candidate's score: issues you skipped, and issues where the candidate has no clear public position. Ballot Compass does not guess. Every score shows its coverage, for example "Based on 9 of the 14 issues you answered". Scores based on fewer than half of your answered issues carry a "Limited data" note. Candidates with less public record, such as governors with little foreign-policy history, will have lower coverage, and their scores should be read with that in mind.</p>
      <p>Candidates are ranked by alignment, then by coverage, then alphabetically. The results page always shows the highest-aligned candidate in each party, and both parties appear in the full list unless you filter them out.</p>

      <h2 id="m-coding" tabindex="-1">How positions were coded</h2>
      <p>For each candidate and issue, a researcher reads the candidate's statements, votes, signed laws and official actions, writes a one-sentence plain-English summary, and assigns the closest of the five positions. Each coded position records:</p>
      <ul>
        <li>a summary of what the candidate said or did;</li>
        <li>a source link and the date of the statement or action;</li>
        <li>a provenance tag: <strong>Stated 2026</strong> for a statement made in 2026, or <strong>Record</strong> for past votes, laws, official actions or older statements;</li>
        <li>a <strong>Needs verification</strong> tag until a human editor has checked the source.</li>
      </ul>
      <p>When a candidate's view does not fit the scale (for example, a senator who supports Israel but opposes all foreign aid on principle), the issue is marked unknown and explained in the summary rather than forced onto the scale. Where a candidate's record and recent statements conflict, the summary says so, and the more recent statement is coded.</p>
      <p>Governors' positions are often coded from state laws they signed. A state law is evidence of a candidate's views, but a governor's state record does not always say what they would do as president.</p>

      <h2 id="m-status" tabindex="-1">Candidate status</h2>
      <p>Each candidate has one of five statuses, with the date of the most recent statement it is based on:</p>
      <ul>
        <li><strong>Declared</strong>: has formally announced a campaign.</li>
        <li><strong>Exploring</strong>: has formed an exploratory committee or said they are actively preparing a run.</li>
        <li><strong>Undecided</strong>: has not announced a decision either way.</li>
        <li><strong>Says not running</strong>: has said they do not plan to run, without ruling it out entirely.</li>
        <li><strong>Declined</strong>: has definitively ruled out a run.</li>
      </ul>

      <h2 id="m-leadership" tabindex="-1">Leadership style</h2>
      <p>The optional leadership question asks you to rank five qualities. Your ranking is shown in its own section of the results and is never mixed into the policy score. Ballot Compass does not rate candidates on these qualities; it lists only factual executive and legislative experience.</p>

      <h2 id="m-data" tabindex="-1">Data and updates</h2>
      <p><strong>Data last reviewed:</strong> ${esc(reviewed)}.<br><strong>Seed data compiled:</strong> ${esc(fmtDate(m.seeded))}.</p>
      <p>${esc(m.coverage_note || '')}</p>
      <p>Candidate data is kept in a single editable file, <code>data/candidates.json</code>, separate from the application code. Corrections are made by editing that file, checking the source, setting the entry's verification flag to false, and updating the review date.</p>

      <h2 id="m-limits" tabindex="-1">Limitations</h2>
      <ul>
        <li>Five positions cannot capture every nuance. Two people coded the same may still disagree on details.</li>
        <li>Some issues mix more than one question (for example, how strict abortion law should be and whether states or Congress should decide). The scale orders the most common combinations, but your view may not fit neatly.</li>
        <li>Candidates change positions, and statements made as a senator, governor or cabinet member may not predict what they would do as president.</li>
        <li>Coverage differs across candidates. A high score based on few issues is less informative than a moderate score based on many.</li>
        <li>Alignment measures stated policy agreement only. It does not measure competence, character, electability or likelihood of keeping promises.</li>
        <li>The seed data has not yet been verified by a human editor and may contain errors.</li>
      </ul>
      <p><strong>Alignment reflects only the issues you answered and weighted. It is not a prediction or an endorsement.</strong></p>

      <h2 id="m-privacy" tabindex="-1">Privacy</h2>
      <p>There are no accounts, cookies, analytics or third-party requests. Your answers are saved in your browser's local storage so you can come back to them, and are never sent anywhere. "Clear my answers" at the bottom of every page deletes them. "Export as PDF" uses your browser's own print dialog.</p>
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
    html: '<div class="measure"><h1 tabindex="-1">Page not found</h1><p>That page does not exist. <a href="#/">Go to the start</a> or <a href="#/results">view your results</a>.</p></div>',
  };
}

/* ---------- router ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
}

function applyWidths(root = main) {
  root.querySelectorAll('[data-width]').forEach((el) => {
    const w = Math.max(0, Math.min(100, Number(el.dataset.width) || 0));
    el.style.width = `${w}%`;
  });
}

function updateNav(head) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === head) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function render() {
  const { parts, params } = parseRoute();
  const [head, arg] = parts;
  let view;
  switch (head) {
    case undefined: view = viewIntro(); break;
    case 'q': view = viewQuestion(Number.parseInt(arg, 10)); break;
    case 'leadership': view = viewLeadership(); break;
    case 'results': view = viewResults(); break;
    case 'candidate': view = viewCandidate(arg); break;
    case 'compare': view = viewCompare(params); break;
    case 'methodology': view = viewMethodology(); break;
    default: view = viewNotFound();
  }
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

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-clear]')) {
    if (window.confirm('Clear all your answers from this browser? This cannot be undone.')) {
      clearAll();
      state.filters = { party: 'all', status: 'all' };
      if (location.hash === '' || location.hash === '#/') render(); else location.hash = '#/';
      announce('Your answers were cleared.');
    }
  }
  if (e.target.closest('[data-start-over]')) {
    if (window.confirm('Start over? This clears the answers saved in this browser.')) {
      clearAll();
      location.hash = '#/q/1';
    }
  }
});

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
