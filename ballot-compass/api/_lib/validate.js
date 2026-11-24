import { readFileSync } from 'node:fs';
import { DEMOGRAPHIC_FIELDS, CONSENT_VERSION, isValidDemographic, isValidEmail } from '../../js/survey.js';

const issuesData = JSON.parse(readFileSync(new URL('../../data/issues.json', import.meta.url), 'utf8'));
const ISSUE_IDS = new Set(issuesData.issues.map((i) => i.id));
const TRAIT_IDS = issuesData.leadership_traits.map((t) => t.id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APP_VERSION = '0.2.0';

function fail(error) {
  return { ok: false, error };
}

export function isSubmissionId(id) {
  return typeof id === 'string' && UUID.test(id);
}

/** Validates a shared response and returns the exact row to store. Unknown fields are dropped. */
export function validateResponse(body, today = new Date()) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object.');
  if (!isSubmissionId(body.submission_id)) return fail('Invalid submission id.');
  if (body.consent !== true) return fail('Consent is required to share answers.');
  if (body.consent_version !== CONSENT_VERSION) return fail('Consent wording has changed. Reload the page and try again.');

  const answers = {};
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return fail('Answers are missing.');
  let answered = 0;
  for (const [id, a] of Object.entries(body.answers)) {
    if (!ISSUE_IDS.has(id)) return fail(`Unknown issue: ${id}`);
    if (!a || typeof a !== 'object') return fail(`Invalid answer for ${id}.`);
    const value = a.value === null ? null : a.value;
    if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= 4)) return fail(`Invalid position for ${id}.`);
    if (!(Number.isInteger(a.importance) && a.importance >= 1 && a.importance <= 4)) return fail(`Invalid importance for ${id}.`);
    if (value !== null) answered += 1;
    answers[id] = { value, importance: a.importance };
  }
  if (answered === 0) return fail('Answer at least one issue before sharing.');

  let leadership = null;
  if (body.leadership !== null && body.leadership !== undefined) {
    const l = body.leadership;
    if (!Array.isArray(l) || l.length !== TRAIT_IDS.length || !TRAIT_IDS.every((t) => l.includes(t))) return fail('Invalid leadership ranking.');
    leadership = l.slice();
  }

  const demo = body.demographics && typeof body.demographics === 'object' ? body.demographics : {};
  const row = {
    submission_id: body.submission_id.toLowerCase(),
    updated_on: today.toISOString().slice(0, 10),
    consent_version: CONSENT_VERSION,
    app_version: APP_VERSION,
    answers,
    leadership,
  };
  for (const f of DEMOGRAPHIC_FIELDS) {
    const v = demo[f.id] === undefined || demo[f.id] === '' ? null : demo[f.id];
    if (!isValidDemographic(f.id, v)) return fail(`Invalid value for ${f.id}.`);
    row[f.id] = v;
  }
  return { ok: true, row };
}

export function validateSignup(body) {
  if (!body || typeof body !== 'object') return fail('Request body must be a JSON object.');
  if (!isValidEmail(body.email)) return fail('Enter a valid email address.');
  if (body.consent !== true) return fail('Consent is required to sign up.');
  return { ok: true, row: { email: body.email.trim().toLowerCase(), consent_version: CONSENT_VERSION } };
}
