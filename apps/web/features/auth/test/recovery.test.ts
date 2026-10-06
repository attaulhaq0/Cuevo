import assert from 'node:assert/strict';
import test from 'node:test';
import { captureRecovery, parseRecoveryFragment, RecoveryError, RecoveryFlow, type RecoveryAuthPort } from '../recovery.ts';

const id = '29000000-0000-4000-8000-000000000011';
const userId = '29000000-0000-4000-8000-000000000012';
const schoolId = '29000000-0000-4000-8000-000000000013';
const secret = 'a'.repeat(64);
const hash = `#id=${id}&type=recovery&token_hash=private-redemption&admission_secret=${secret}`;
const fragment = { id, type: 'recovery' as const, tokenHash: 'private-redemption', admissionSecret: secret };
const user = { id: userId, email: 'learner@example.test', email_confirmed_at: '2026-10-03T00:00:00Z', is_anonymous: false };
const session = { access_token: 'private-access', user };
const authorized = { id, schoolId, userId, status: 'AUTHORIZED', revision: 1 };
const completed = { ...authorized, status: 'COMPLETED' };
const rejects = (kind: RecoveryError['kind']) => (error: unknown) => error instanceof RecoveryError && error.kind === kind && !error.message.includes('private');
function fixture(options: { otp?: unknown; currentUser?: unknown; currentSession?: unknown; authorize?: unknown; passwordUnknown?: boolean; completion?: { status: number; body: unknown }[]; signoutUnknown?: boolean; active?: () => boolean; hold?: Promise<void> } = {}) {
  const operations: string[] = []; const requests: { url: string; init: RequestInit }[] = [];
  const auth: RecoveryAuthPort = {
    verifyOtp: async input => { operations.push(`otp:${input.type}`); if (options.hold) await options.hold; return options.otp ?? { data: { user, session }, error: null }; },
    getSession: async () => ({ data: { session: options.currentSession ?? session }, error: null }),
    getUser: async () => ({ data: { user: options.currentUser ?? user }, error: null }),
    updateUser: async () => { operations.push('password'); if (options.passwordUnknown) throw Error('private provider'); return { data: { user }, error: null }; },
    signOut: async input => { operations.push(`signout:${input.scope}`); if (options.signoutUnknown) throw Error('private provider'); return { error: null }; },
  };
  let completionIndex = 0;
  const flow = new RecoveryFlow(fragment, { auth, apiUrl: 'http://localhost:4000', commandKey: 'same-recovery-key', isActive: options.active, fetch: async (url, init) => {
    requests.push({ url: String(url), init: init! });
    if (String(url).endsWith('/authorize')) return new Response(JSON.stringify(options.authorize ?? authorized));
    const response = options.completion?.[completionIndex++] ?? { status: 200, body: completed };
    return new Response(JSON.stringify(response.body), { status: response.status });
  } });
  return { flow, operations, requests };
}

test('recovery captures and strips fragment credentials before any provider work', () => {
  const paths: string[] = []; assert.deepEqual(captureRecovery({ hash, pathname: '/account/recovery', search: '' }, path => paths.push(path)), fragment); assert.deepEqual(paths, ['/account/recovery']);
  assert.throws(() => captureRecovery({ hash, pathname: '/account/recovery', search: '?token=private' }, path => paths.push(path)), rejects('invalid-link'));
  assert.equal(paths.length, 2);
});
test('recovery rejects wrong purpose, extra fields, duplicate keys and invalid credentials', () => {
  for (const value of ['', hash.replace('type=recovery', 'type=invite'), `${hash}&id=${id}`, `${hash}&role=admin`, hash.replace(id, 'invalid'), hash.replace('private-redemption', 'x'.repeat(4097)), hash.replace('private-redemption', '%00secret'), hash.replace('private-redemption', '%0Asecret'), hash.replace(secret, 'A'.repeat(64))]) assert.throws(() => parseRecoveryFragment(value), rejects('invalid-link'));
});
test('opening recovery and declining confirmation perform no verification or authorization', async () => {
  const value = fixture(); assert.deepEqual(value.operations, []); await assert.rejects(value.flow.continue(false), rejects('confirmation-required')); assert.deepEqual(value.requests, []);
});
test('deliberate recovery verifies the exact current account and uses only its strict purpose body', async () => {
  const value = fixture(); assert.deepEqual(await value.flow.continue(true), authorized); assert.deepEqual(value.operations, ['otp:recovery']);
  const request = value.requests[0]; assert.equal(request.url, 'http://localhost:4000/v1/account/recovery/authorize');
  assert.deepEqual(JSON.parse(String(request.init.body)), { id, admissionSecret: secret, confirmRecovery: true });
  const headers = new Headers(request.init.headers); assert.equal(headers.get('x-school-id'), null); assert.equal(headers.get('idempotency-key'), 'same-recovery-key'); assert.equal(headers.get('authorization'), 'Bearer private-access');
  assert.equal(request.init.credentials, 'omit'); assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.redirect, 'error');
});
test('current account mismatch, anonymous status and absent email confirmation deny authorization', async () => {
  for (const currentUser of [{ ...user, id: schoolId }, { ...user, is_anonymous: true }, { ...user, email_confirmed_at: null }]) { const value = fixture({ currentUser }); await assert.rejects(value.flow.continue(true), rejects('session-changed')); assert.deepEqual(value.requests, []); }
});
test('expired or uncertain recovery tokens cannot be blindly redeemed again', async () => {
  for (const [code, kind] of [['otp_expired', 'expired-link'], ['unknown', 'verification-unknown']] as const) {
    const value = fixture({ otp: { data: { user: null, session: null }, error: { code, message: 'private credential' } } });
    await assert.rejects(value.flow.continue(true), rejects(kind)); await assert.rejects(value.flow.continue(true), rejects(kind)); assert.equal(value.operations.length, 1); assert.deepEqual(value.requests, []);
  }
});
test('foreign, malformed and credential-bearing authorization receipts cannot enable password change', async () => {
  for (const response of [{ ...authorized, id: schoolId }, { ...authorized, userId: schoolId }, { ...authorized, admissionSecret: secret }, { ...authorized, status: 'COMPLETED' }, { ...authorized, revision: 2 }]) {
    const value = fixture({ authorize: response }); await assert.rejects(value.flow.continue(true), rejects('outcome-unknown')); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('confirmation-required'));
  }
});
test('concurrent continuation does not redeem the recovery token twice', async () => {
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; }); const value = fixture({ hold });
  const pending = value.flow.continue(true); await assert.rejects(value.flow.continue(true), rejects('busy')); release(); await pending; assert.deepEqual(value.operations, ['otp:recovery']);
});
test('password mutation needs authorized recovery and matching twelve to 128 character input', async () => {
  const value = fixture(); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('confirmation-required')); await value.flow.continue(true);
  await assert.rejects(value.flow.setPassword('short', 'short'), rejects('password-invalid')); await assert.rejects(value.flow.setPassword('a-secure-password', 'different-password'), rejects('password-invalid')); assert.equal(value.operations.includes('password'), false);
});
test('explicit password save completes its exact recovery before global session signout', async () => {
  const value = fixture(); await value.flow.continue(true); await value.flow.setPassword('a-secure-password', 'a-secure-password');
  assert.equal(value.flow.completionConfirmed, true); assert.equal(value.flow.signoutConfirmed, false);
  assert.deepEqual(JSON.parse(String(value.requests[1].init.body)), { id, confirmCompletion: true });
  assert.equal(new Headers(value.requests[1].init.headers).get('idempotency-key'), 'same-recovery-key');
  await value.flow.signOutAll(); assert.equal(value.flow.signoutConfirmed, true); assert.deepEqual(value.operations, ['otp:recovery', 'password', 'signout:global']);
});
test('unknown password mutation cannot repeat until the server confirms unchanged password', async () => {
  const value = fixture({ passwordUnknown: true, completion: [{ status: 409, body: { code: 'RECOVERY_PASSWORD_UNCHANGED' } }] });
  await value.flow.continue(true); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('password-unknown'));
  await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('reconciliation-required')); assert.equal(value.operations.filter(operation => operation === 'password').length, 1);
  await assert.rejects(value.flow.reconcileCompletion(), rejects('password-not-changed')); assert.equal(value.flow.canSetPassword, true);
});
test('unknown password mutation reconciles a changed password without another provider update', async () => {
  const value = fixture({ passwordUnknown: true }); await value.flow.continue(true); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('password-unknown'));
  await value.flow.reconcileCompletion(); assert.equal(value.flow.completionConfirmed, true); assert.equal(value.operations.filter(operation => operation === 'password').length, 1);
});
test('unrelated review denial and uncertain completion do not permit another password update', async () => {
  for (const completion of [{ status: 409, body: { code: 'RECOVERY_REQUIRES_REVIEW' } }, { status: 503, body: { code: 'UNKNOWN' } }]) {
    const value = fixture({ passwordUnknown: true, completion: [completion] }); await value.flow.continue(true); await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'));
    await assert.rejects(value.flow.reconcileCompletion()); assert.equal(value.flow.canSetPassword, false); assert.equal(value.flow.completionConfirmed, false);
  }
});
test('global signout failure never becomes completed signout or another password mutation', async () => {
  const value = fixture({ signoutUnknown: true }); await value.flow.continue(true); await value.flow.setPassword('a-secure-password', 'a-secure-password');
  await assert.rejects(value.flow.signOutAll(), rejects('signout-unknown')); assert.equal(value.flow.signoutConfirmed, false); assert.equal(value.flow.completionConfirmed, true);
});
test('leaving recovery during verification prevents later authorization or password work', async () => {
  let active = true; let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; }); const value = fixture({ active: () => active, hold });
  const pending = value.flow.continue(true); active = false; release(); await assert.rejects(pending, rejects('unavailable')); assert.deepEqual(value.requests, []);
});

test('unknown authorization retries its exact original body and key without another token redemption', async () => {
  const attempts: RequestInit[] = []; let verifications = 0;
  const auth: RecoveryAuthPort = { verifyOtp: async () => { verifications++; return { data: { user, session }, error: null }; }, getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), updateUser: async () => ({ data: { user }, error: null }), signOut: async () => ({ error: null }) };
  const flow = new RecoveryFlow(fragment, { auth, apiUrl: 'http://localhost:4000', commandKey: 'retained-key', fetch: async (_url, init) => { attempts.push(init!); if (attempts.length === 1) throw Error('private transport'); return new Response(JSON.stringify(authorized)); } });
  await assert.rejects(flow.continue(true), rejects('outcome-unknown')); await flow.continue(true);
  assert.equal(verifications, 1); assert.equal(attempts[0].body, attempts[1].body); assert.equal(new Headers(attempts[0].headers).get('idempotency-key'), new Headers(attempts[1].headers).get('idempotency-key'));
});

test('completion rejects foreign school and secret-bearing success without signout permission', async () => {
  for (const body of [{ ...completed, schoolId: userId }, { ...completed, token_hash: 'private-redemption' }, { ...completed, status: 'AUTHORIZED' }]) {
    const value = fixture({ completion: [{ status: 200, body }] }); await value.flow.continue(true);
    await assert.rejects(value.flow.setPassword('a-secure-password', 'a-secure-password'), rejects('completion-unknown')); assert.equal(value.flow.completionConfirmed, false); await assert.rejects(value.flow.signOutAll(), rejects('confirmation-required'));
  }
});

test('a deliberate global signout retry never repeats the completed password mutation', async () => {
  let signouts = 0; let updates = 0;
  const auth: RecoveryAuthPort = { verifyOtp: async () => ({ data: { user, session }, error: null }), getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), updateUser: async () => { updates++; return { data: { user }, error: null }; }, signOut: async input => { assert.equal(input.scope, 'global'); if (++signouts === 1) throw Error('private transport'); return { error: null }; } };
  const flow = new RecoveryFlow(fragment, { auth, apiUrl: 'http://localhost:4000', commandKey: 'retained-key', fetch: async url => new Response(JSON.stringify(String(url).endsWith('/authorize') ? authorized : completed)) });
  await flow.continue(true); await flow.setPassword('a-secure-password', 'a-secure-password'); await assert.rejects(flow.signOutAll(), rejects('signout-unknown')); await flow.signOutAll(); await flow.signOutAll();
  assert.equal(updates, 1); assert.equal(signouts, 2); assert.equal(flow.signoutConfirmed, true);
});

test('leaving during password update prevents scheduling completion after an in-flight mutation', async () => {
  let active = true; let release!: () => void; let entered!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); const updating = new Promise<void>(resolve => { entered = resolve; }); const requests: string[] = [];
  const auth: RecoveryAuthPort = { verifyOtp: async () => ({ data: { user, session }, error: null }), getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), updateUser: async () => { entered(); await held; return { data: { user }, error: null }; }, signOut: async () => ({ error: null }) };
  const flow = new RecoveryFlow(fragment, { auth, apiUrl: 'http://localhost:4000', commandKey: 'retained-key', isActive: () => active, fetch: async url => { requests.push(String(url)); return new Response(JSON.stringify(authorized)); } });
  await flow.continue(true); const pending = flow.setPassword('a-secure-password', 'a-secure-password');
  await updating; active = false; release(); await assert.rejects(pending, rejects('unavailable')); assert.equal(requests.length, 1);
});
