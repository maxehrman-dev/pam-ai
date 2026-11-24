import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateResponse, validateSignup } from '../api/_lib/validate.js';
import { CONSENT_VERSION } from '../js/survey.js';
import responses from '../api/responses.js';
import signup from '../api/signup.js';

const ID = '3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f';
const good = () => ({
  submission_id: ID,
  consent: true,
  consent_version: CONSENT_VERSION,
  answers: { abortion: { value: 2, importance: 4 }, guns: { value: null, importance: 2 } },
  leadership: null,
  demographics: { age: '25-34', state: 'OH', registration: 'registered', party: 'independent', marital: 'married', household: '3', income: 'na' },
});

test('valid response becomes a minimal row with date only', () => {
  const r = validateResponse(good(), new Date('2026-11-24T15:30:00Z'));
  assert.equal(r.ok, true);
  assert.equal(r.row.updated_on, '2026-11-24');
  assert.equal(r.row.age, '25-34');
  assert.equal(r.row.income, 'na');
  assert.equal(r.row.state, 'OH');
  assert.equal(r.row.party, 'independent');
  assert.equal(r.row.marital, 'married');
  assert.ok(!('email' in r.row) && !('ip' in r.row) && !('created_at' in r.row));
});

test('response validation rejects bad input', () => {
  const cases = [
    [{ consent: false }, /Consent/],
    [{ consent_version: 'old' }, /Consent wording/],
    [{ submission_id: 'not-a-uuid' }, /submission id/],
    [{ answers: { mystery: { value: 1, importance: 2 } } }, /Unknown issue/],
    [{ answers: { abortion: { value: 7, importance: 2 } } }, /Invalid position/],
    [{ answers: { abortion: { value: null, importance: 2 } } }, /at least one/],
    [{ demographics: { age: '12-17' } }, /age/],
    [{ demographics: { state: 'ZZ' } }, /state/],
    [{ demographics: { party: 'whig' } }, /party/],
    [{ leadership: ['executive'] }, /leadership/],
  ];
  for (const [patch, re] of cases) {
    const r = validateResponse({ ...good(), ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.match(r.error, re);
  }
});

test('signup validation', () => {
  assert.deepEqual(validateSignup({ email: ' Voter@Example.com ', consent: true }).row.email, 'voter@example.com');
  assert.equal(validateSignup({ email: 'nope', consent: true }).ok, false);
  assert.equal(validateSignup({ email: 'a@b.co', consent: false }).ok, false);
});

/* ---- handlers, with Supabase mocked ---- */

let calls;
const realFetch = globalThis.fetch;
const env = { ...process.env };

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b || ''; },
    json() { return this.body ? JSON.parse(this.body) : null; },
  };
}
let ipCounter = 0;
function fakeReq(method, body, headers = {}) {
  ipCounter += 1;
  return {
    method, body,
    headers: { host: 'bc.test', 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ipCounter}`, ...headers },
  };
}

beforeEach(() => {
  calls = [];
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  delete process.env.BC_COLLECTION;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('rpc/bc_hit_limit')) return new Response('true', { status: 200 });
    return new Response('', { status: 201 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

test('POST /api/responses upserts the validated row', async () => {
  const res = fakeRes();
  await responses(fakeReq('POST', good()), res);
  assert.equal(res.statusCode, 200);
  const write = calls.find((c) => c.url.includes('bc_responses'));
  assert.ok(write.url.endsWith('bc_responses?on_conflict=submission_id'));
  assert.match(write.init.headers.Prefer, /merge-duplicates/);
  const row = JSON.parse(write.init.body);
  assert.equal(row.submission_id, ID);
  assert.equal(row.answers.abortion.importance, 4);
  // rate-limit keys never contain the raw IP
  for (const c of calls.filter((x) => x.url.includes('bc_hit_limit'))) assert.ok(!c.init.body.includes('10.0.0.'));
});

test('DELETE /api/responses removes by id', async () => {
  const res = fakeRes();
  await responses(fakeReq('DELETE', { submission_id: ID }), res);
  assert.equal(res.statusCode, 200);
  const del = calls.find((c) => c.init.method === 'DELETE');
  assert.ok(del.url.endsWith(`bc_responses?submission_id=eq.${ID}`));
});

test('cross-site, unconfigured, disabled and invalid requests are refused', async () => {
  let res = fakeRes();
  await responses(fakeReq('POST', good(), { origin: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 403);

  res = fakeRes();
  await responses(fakeReq('GET'), res);
  assert.equal(res.statusCode, 405);

  res = fakeRes();
  await responses(fakeReq('POST', { ...good(), consent: false }), res);
  assert.equal(res.statusCode, 400);

  process.env.BC_COLLECTION = 'off';
  res = fakeRes();
  await responses(fakeReq('POST', good()), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'disabled');

  delete process.env.BC_COLLECTION;
  delete process.env.SUPABASE_URL;
  calls = [];
  res = fakeRes();
  await responses(fakeReq('POST', good()), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'not_configured');
  assert.equal(calls.length, 0);
});

test('per-visitor burst limit returns 429', async () => {
  const headers = { 'x-forwarded-for': '10.9.9.9' };
  let last;
  for (let i = 0; i < 6; i += 1) {
    last = fakeRes();
    await signup(fakeReq('POST', { email: `v${i}@example.com`, consent: true }, headers), last);
  }
  assert.equal(last.statusCode, 429);
});

test('global daily cap returns 503 when the shared counter says no', async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('rpc/bc_hit_limit')) return new Response(init.body.includes(':global') ? 'false' : 'true', { status: 200 });
    return new Response('', { status: 201 });
  };
  const res = fakeRes();
  await signup(fakeReq('POST', { email: 'cap@example.com', consent: true }), res);
  assert.equal(res.statusCode, 503);
});

test('signup stores the email and ignores duplicates', async () => {
  const res = fakeRes();
  await signup(fakeReq('POST', { email: 'Voter@Example.com', consent: true }), res);
  assert.equal(res.statusCode, 200);
  const write = calls.find((c) => c.url.includes('bc_signups'));
  assert.match(write.init.headers.Prefer, /ignore-duplicates/);
  assert.equal(JSON.parse(write.init.body).email, 'voter@example.com');
});
