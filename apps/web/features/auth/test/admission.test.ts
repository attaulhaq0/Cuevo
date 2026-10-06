import assert from 'node:assert/strict';
import test from 'node:test';
import { AdmissionFlow, AdmissionError, captureAdmission, parseAdmissionFragment, type AdmissionAuthPort } from '../admission.ts';

const requestId = '29000000-0000-4000-8000-000000000001';
const userId = '29000000-0000-4000-8000-000000000002';
const schoolId = '29000000-0000-4000-8000-000000000003';
const secret = 'a'.repeat(64);
const hash = `#id=${requestId}&type=invite&token_hash=private-provider-token&admission_secret=${secret}`;
const invitation = { id: requestId, type: 'invite' as const, tokenHash: 'private-provider-token', admissionSecret: secret };
const user = { id: userId, email: 'learner@example.test', email_confirmed_at: '2026-10-03T00:00:00Z', is_anonymous: false };
const session = { access_token: 'private-session-token', user };
const receipt = { id: requestId, schoolId, userId, role: 'student', status: 'CLAIMED', revision: 1 };
function fixture(options: { response?: unknown; status?: number; failFetch?: boolean; otp?: unknown; currentUser?: unknown; currentSession?: unknown; password?: unknown; hold?: Promise<void> } = {}) {
  const calls: { operation: string; input?: unknown }[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const auth: AdmissionAuthPort = {
    verifyOtp: async input => { calls.push({ operation: 'otp', input }); return options.otp ?? { data: { user, session }, error: null }; },
    getSession: async () => { calls.push({ operation: 'session' }); return { data: { session: options.currentSession ?? session }, error: null }; },
    getUser: async token => { calls.push({ operation: 'user', input: token }); return { data: { user: options.currentUser ?? user }, error: null }; },
    updateUser: async input => { calls.push({ operation: 'password', input }); return options.password ?? { data: { user }, error: null }; },
  };
  const flow = new AdmissionFlow(invitation, { auth, apiUrl: 'http://localhost:4000', commandKey: 'original-admission-key', fetch: async (url, init) => { requests.push({ url: String(url), init: init! }); if (options.hold) await options.hold; if (options.failFetch) throw Error('private transport detail'); return new Response(JSON.stringify(Object.hasOwn(options, 'response') ? options.response : receipt), { status: options.status ?? 200 }); } });
  return { flow, calls, requests };
}
const rejects = (kind: AdmissionError['kind']) => (error: unknown) => error instanceof AdmissionError && error.kind === kind && !error.message.includes('private');

test('fragment capture removes all URL credentials before parsing or provider work', () => {
  const removed: string[] = [];
  assert.deepEqual(captureAdmission({ hash, pathname: '/account/admission', search: '' }, path => removed.push(path)), invitation);
  assert.deepEqual(removed, ['/account/admission']);
  assert.throws(() => captureAdmission({ hash: '#bad=private-token', pathname: '/account/admission', search: '' }, path => removed.push(path)), rejects('invalid-link'));
  assert.deepEqual(removed, ['/account/admission', '/account/admission']);
});
test('fragment parser rejects duplicates, extras, wrong purpose, IDs and unbounded credentials', () => {
  for (const value of ['', `${hash}&id=${requestId}`, `${hash}&schoolId=${schoolId}`, hash.replace('type=invite', 'type=recovery'), hash.replace(requestId, 'bad'), hash.replace(secret, 'A'.repeat(64)), hash.replace('private-provider-token', ''), hash.replace('private-provider-token', 'x'.repeat(4097)), hash.replace('private-provider-token', '%0Asecret'), hash.replace('private-provider-token', '%00secret'), hash.replace('private-provider-token', '%7Fsecret')]) assert.throws(() => parseAdmissionFragment(value), rejects('invalid-link'));
  assert.throws(() => captureAdmission({ hash, pathname: '/account/admission', search: '?token=private' }, () => {}), rejects('invalid-link'));
});
test('constructing and opening an admission never verifies OTP or claims before explicit confirmation', async () => {
  const value = fixture(); assert.deepEqual(value.calls, []); assert.deepEqual(value.requests, []);
  await assert.rejects(value.flow.continue(false), rejects('confirmation-required')); assert.deepEqual(value.calls, []); assert.deepEqual(value.requests, []);
});
test('deliberate admission verifies current account and posts only the purpose body without a selected school', async () => {
  const value = fixture(); assert.deepEqual(await value.flow.continue(true), receipt);
  assert.deepEqual(value.calls[0], { operation: 'otp', input: { token_hash: 'private-provider-token', type: 'invite' } });
  const request = value.requests[0]; assert.equal(request.url, 'http://localhost:4000/v1/account/school-admission/claim');
  const headers = new Headers(request.init.headers); assert.equal(headers.get('authorization'), 'Bearer private-session-token'); assert.equal(headers.get('idempotency-key'), 'original-admission-key'); assert.equal(headers.get('x-school-id'), null);
  assert.equal(request.init.credentials, 'omit'); assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.redirect, 'error');
  assert.deepEqual(JSON.parse(String(request.init.body)), { id: requestId, admissionSecret: secret, confirmAdmission: true });
  assert.ok(!String(request.init.body).includes('private-provider-token')); assert.deepEqual(await value.flow.continue(true), receipt); assert.equal(value.requests.length, 1);
});
test('claim uncertainty retains the original key and verifies only the same account on deliberate retry', async () => {
  let attempts = 0;
  const auth: AdmissionAuthPort = { verifyOtp: async () => { attempts++; return { data: { user, session }, error: null }; }, getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), updateUser: async () => ({ data: { user }, error: null }) };
  const requests: RequestInit[] = []; const flow = new AdmissionFlow(invitation, { auth, apiUrl: 'http://localhost:4000', commandKey: 'same-key', fetch: async (_url, init) => { requests.push(init!); if (requests.length === 1) throw Error('private network'); return new Response(JSON.stringify(receipt)); } });
  await assert.rejects(flow.continue(true), rejects('outcome-unknown')); assert.deepEqual(await flow.continue(true), receipt); assert.equal(attempts, 1);
  assert.equal(new Headers(requests[0].headers).get('idempotency-key'), new Headers(requests[1].headers).get('idempotency-key')); assert.equal(requests[0].body, requests[1].body);
});
test('uncertain OTP cannot retry redemption or attach an unrelated preexisting session', async () => {
  const value = fixture({ otp: { data: { user: null, session: null }, error: { code: 'unavailable', message: 'private token' } } });
  await assert.rejects(value.flow.continue(true), rejects('verification-unknown')); await assert.rejects(value.flow.continue(true), rejects('verification-unknown')); assert.equal(value.calls.filter(call => call.operation === 'otp').length, 1); assert.deepEqual(value.requests, []);
});
test('expired OTP is reported separately without exposing provider text or attempting claim', async () => {
  const value = fixture({ otp: { data: { user: null, session: null }, error: { code: 'otp_expired', message: 'private token' } } }); await assert.rejects(value.flow.continue(true), rejects('expired-link')); assert.deepEqual(value.requests, []);
});
test('current wrong user, anonymous or unconfirmed account cannot claim', async () => {
  for (const currentUser of [{ ...user, id: schoolId }, { ...user, is_anonymous: true }, { ...user, email_confirmed_at: null }]) { const value = fixture({ currentUser }); await assert.rejects(value.flow.continue(true), rejects('session-changed')); assert.deepEqual(value.requests, []); }
  const value = fixture({ currentSession: { ...session, user: { ...user, id: schoolId } } }); await assert.rejects(value.flow.continue(true), rejects('session-changed')); assert.deepEqual(value.requests, []);
});
test('malformed, foreign or credential-bearing successful claim receipts never grant UI success', async () => {
  for (const response of [null, { ...receipt, id: schoolId }, { ...receipt, userId: schoolId }, { ...receipt, role: 'owner' }, { ...receipt, status: 'REQUESTED' }, { ...receipt, admissionSecret: secret }]) { const value = fixture({ response }); await assert.rejects(value.flow.continue(true), rejects('outcome-unknown')); }
});
test('denied and review HTTP responses remain distinct from uncertain transport outcome', async () => {
  for (const status of [403, 409]) { const value = fixture({ status, response: { code: 'ACCOUNT_REQUIRES_REVIEW', message: 'private token' } }); await assert.rejects(value.flow.continue(true), rejects('requires-review')); }
});
test('concurrent Continue cannot redeem or claim twice while original work remains unsettled', async () => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); const value = fixture({ hold: held }); const running = value.flow.continue(true); void running.catch(() => undefined);
  await assert.rejects(value.flow.continue(true), rejects('busy')); release(); await assert.doesNotReject(running); assert.equal(value.requests.length, 1);
});
test('password setup requires confirmed admission, matching strong input and exact current user', async () => {
  const value = fixture(); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('confirmation-required'));
  await value.flow.continue(true); await assert.rejects(value.flow.setPassword('short', 'short'), rejects('password-invalid')); await assert.rejects(value.flow.setPassword('a-secure-password', 'different-password'), rejects('password-invalid'));
  await value.flow.setPassword('a-secure-password', 'a-secure-password'); assert.deepEqual(value.calls.filter(call => call.operation === 'password'), [{ operation: 'password', input: { password: 'a-secure-password' } }]); assert.equal(value.flow.passwordConfirmed, true);
});
test('password provider uncertainty never produces password confirmation', async () => {
  const value = fixture({ password: { data: { user: { ...user, id: schoolId } }, error: null } }); await value.flow.continue(true); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('password-unknown')); assert.equal(value.flow.passwordConfirmed, false);
});
test('leaving admission during OTP verification prevents a new current-account or claim operation', async () => {
  let active = true; let release!: (value: unknown) => void; const held = new Promise(resolve => { release = resolve; }); const operations: string[] = [];
  const flow = new AdmissionFlow(invitation, { apiUrl: 'http://localhost:4000', isActive: () => active, auth: { verifyOtp: async () => held, getSession: async () => { operations.push('session'); return { data: { session }, error: null }; }, getUser: async () => ({ data: { user }, error: null }), updateUser: async () => ({ data: { user }, error: null }) }, fetch: async () => { operations.push('claim'); return new Response(JSON.stringify(receipt)); } });
  const running = flow.continue(true); active = false; release({ data: { user, session }, error: null }); await assert.rejects(running, rejects('unavailable')); assert.deepEqual(operations, []);
});
