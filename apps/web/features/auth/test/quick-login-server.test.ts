import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { boundedQuickLoginBody, quickLoginTarget, testingQuickLogin } from '../server/quick-login.ts';
const root = resolve(import.meta.dirname, '../../../../..');
const manifest = JSON.parse(await readFile(resolve(root, 'supabase/seed/identities.json'), 'utf8')) as { synthetic: boolean; schoolId: string; actors: { actorId: string; schoolId: string; role: string; email: string }[] };
const accounts = manifest.actors.map(actor => ({ ...actor, password: 'fictional-secret-password' }));
const env = { CUEVO_TEST_QUICK_LOGIN: '1', HOSTNAME: '127.0.0.1', PORT: '54131', CUEVO_TEST_LOGIN_ACCOUNTS_FILE: resolve(root, '.local/test-accounts.json'), NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:57421', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', NODE_ENV: 'production' };
function request(body?: unknown, extra: Record<string, string> = {}) { return new Request('http://127.0.0.1:54131/api/testing/quick-login', { method: body === undefined ? 'GET' : 'POST', headers: { host: '127.0.0.1:54131', ...(body === undefined ? {} : { origin: 'http://127.0.0.1:54131', 'content-type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
function io(patch: { accounts?: unknown; manifest?: unknown; session?: unknown } = {}) { let calls = 0; return { get calls() { return calls; }, cwd: () => root, entry: () => resolve(root, 'apps/web/.next/standalone/apps/web/server.js'), standaloneConfig: () => JSON.stringify({ output: 'standalone', repoRoot: root }), real: async (path: string) => path, read: async (path: string) => path.endsWith('identities.json') ? JSON.stringify(patch.manifest ?? manifest) : JSON.stringify(patch.accounts ?? accounts), fetch: (async (_url, options) => { calls++; const sent = JSON.parse(String(options?.body)); const actor = accounts.find(actor => actor.email === sent.email)!; return Response.json(patch.session ?? { access_token: 'real-session-token', refresh_token: 'real-refresh-token', user: { id: actor.actorId, email: actor.email, is_anonymous: false, email_confirmed_at: '2026-10-01T00:00:00Z' } }); }) as typeof fetch }; }

test('explicit local review accepts production build only with exact origins and synthetic flag; hosted or forwarded requests remain absent', () => {
  assert.ok(quickLoginTarget(request(), env));
  for (const patch of [{ HOSTNAME: undefined }, { HOSTNAME: '0.0.0.0' }, { CUEVO_TEST_QUICK_LOGIN: undefined }, { CUEVO_TEST_QUICK_LOGIN: 'false' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }]) assert.equal(quickLoginTarget(request(), { ...env, ...patch }), null);
  assert.ok(quickLoginTarget(request(undefined, { 'x-forwarded-host': '127.0.0.1:54131', 'x-forwarded-proto': 'http', 'x-forwarded-port': '54131', 'x-forwarded-for': '::1' }), env));
  for (const extra of [{ forwarded: 'host=127.0.0.1' }, { 'x-forwarded-host': 'remote.example' }, { 'x-forwarded-for': '192.0.2.1' }, { host: 'localhost:3000' }] as Record<string,string>[]) assert.equal(quickLoginTarget(request(undefined, extra), env), null);
  assert.equal(quickLoginTarget(request({ role: 'student' }, { origin: 'http://localhost:3000' }), env), null);
  const nativeAlias = new Request('http://localhost:54131/api/testing/quick-login', request({ role: 'student' }));
  assert.ok(quickLoginTarget(nativeAlias, env));
  assert.equal(quickLoginTarget(nativeAlias, { ...env, PORT: '3000' }), null);
  const dev = new Request('http://127.0.0.1:3000/api/testing/quick-login', { headers: { host: 'localhost:3000' } });
  assert.ok(quickLoginTarget(dev, { ...env, PORT: '3000', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321' }));
});

test('disabled availability does no file/provider work and enabled availability returns fixed roles without identity or credential values', async () => {
  const never = { ...io(), read: async () => { throw Error('must not read'); } };
  assert.equal((await testingQuickLogin(request(), { ...env, CUEVO_TEST_QUICK_LOGIN: undefined }, never)).status, 200);
  assert.equal((await testingQuickLogin(request({ role: 'student' }), { ...env, CUEVO_TEST_QUICK_LOGIN: undefined }, never)).status, 404);
  const response = await testingQuickLogin(request(), env, io());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  const body = await response.text(); assert.equal(body.includes('fictional-secret'), false); assert.equal(body.includes('synthetic-001'), false); assert.deepEqual(JSON.parse(body), { available: true, roles: ['admin', 'coordinator', 'teacher', 'student', 'parent'] });
});

test('hosted deployment never admits local presentation or reads its credentials even with testing flags set', async () => {
  for (const hosted of [{ VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' }, { VERCEL_URL: 'cuevo.vercel.app' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging' }]) {
    let privateReads = 0, providerCalls = 0;
    const dependencies = { ...io(), read: async () => { privateReads++; throw Error('Private demo file must stay local'); }, fetch: (async () => { providerCalls++; throw Error('Demo Auth must stay local'); }) as typeof fetch };
    const deployment = { ...env, ...hosted, CUEVO_TEST_DEMO_GUIDE_FILE: resolve(root, '.local/demo-guide.json') };
    const availability = await testingQuickLogin(request(), deployment, dependencies);
    assert.equal(availability.status, 200); assert.deepEqual(await availability.json(), { available: false });
    const login = await testingQuickLogin(request({ role: 'student' }), deployment, dependencies);
    assert.equal(login.status, 404); assert.deepEqual(await login.json(), { available: false });
    assert.equal(privateReads, 0); assert.equal(providerCalls, 0);
  }
});

test('strict role command uses the manifested actor and returns only the actual provider tokens', async () => {
  const source = io(); const response = await testingQuickLogin(request({ role: 'student' }), env, source);
  assert.equal(response.status, 200); assert.equal(source.calls, 1);
  assert.deepEqual(await response.json(), { role: 'student', session: { access_token: 'real-session-token', refresh_token: 'real-refresh-token' } });
  for (const body of [{ role: 'owner' }, { role: 'student', email: 'other@example.test' }, { actorId: accounts[0].actorId }, []]) { const source = io(); assert.equal((await testingQuickLogin(request(body), env, source)).status, 400); assert.equal(source.calls, 0); }
});
test('an invalid optional presentation guide never removes the verified quick-login controls',async()=>{const response=await testingQuickLogin(request(),{...env,CUEVO_TEST_DEMO_GUIDE_FILE:resolve(root,'.local/demo-guide.json')},io());assert.equal(response.status,200);assert.deepEqual(await response.json(),{available:true,roles:['admin','coordinator','teacher','student','parent']});});

test('optional guide actors match the fixed quick-login actors and another valid learner only omits the guide', async () => {
  const roles = ['admin', 'coordinator', 'teacher', 'student', 'parent'] as const;
  const records = ['courseId', 'lessonId', 'activityId', 'proposalId', 'baselineSubmissionId', 'baselineResultId', 'followupResultId', 'assignedPracticeId', 'measuredPracticeId', 'outcomeId', 'portfolioId', 'periodId', 'roomId'];
  const guide = { version: 1, schoolId: manifest.actors[0].schoolId, actors: Object.fromEntries(roles.map(role => [role, manifest.actors.find(actor => actor.role === role && actor.schoolId === manifest.actors[0].schoolId)!.actorId])), records: Object.fromEntries(records.map((key, index) => [key, 'ce000000-0000-4000-8000-' + String(index + 1).padStart(12, '0')])) };
  const configured = { ...env, CUEVO_TEST_DEMO_GUIDE_FILE: resolve(root, '.local/demo-guide.json') };
  const source = (value: unknown) => { const original = io(); return { ...original, read: async (path: string) => path.endsWith('demo-guide.json') ? JSON.stringify(value) : original.read(path) }; };
  const response = await testingQuickLogin(request(), configured, source(guide));
  assert.deepEqual(await response.json(), { available: true, roles, guide });
  const other = manifest.actors.find(actor => actor.role === 'student' && actor.schoolId === guide.schoolId && actor.actorId !== guide.actors.student)!;
  const mismatch = await testingQuickLogin(request(), configured, source({ ...guide, actors: { ...guide.actors, student: other.actorId } }));
  assert.deepEqual(await mismatch.json(), { available: true, roles });
});

test('unknown, changed, duplicate or escaped account sources cannot issue a provider login', async () => {
  const cases = [io({ accounts: accounts.slice(0, 5) }), io({ accounts: [...accounts.slice(1), accounts[1]] }), io({ accounts: accounts.map((actor, index) => index === 0 ? { ...actor, actorId: 'unmanifested' } : actor) }), io({ manifest: { ...manifest, synthetic: false } })];
  for (const source of cases) { assert.equal((await testingQuickLogin(request({ role: 'student' }), env, source)).status, 503); assert.equal(source.calls, 0); }
  const source = io(); assert.equal((await testingQuickLogin(request({ role: 'student' }), { ...env, CUEVO_TEST_LOGIN_ACCOUNTS_FILE: resolve(root, '../outside.json') }, source)).status, 503); assert.equal(source.calls, 0);
});

test('mismatched, anonymous or unconfirmed provider identity stays unavailable without raw errors or sessions', async () => {
  const student = accounts.find(actor => actor.role === 'student')!;
  for (const user of [{ id: accounts[0].actorId, email: accounts[0].email, is_anonymous: false, email_confirmed_at: 'now' }, { id: student.actorId, email: student.email, is_anonymous: true, email_confirmed_at: 'now' }]) {
    const response = await testingQuickLogin(request({ role: 'student' }), env, io({ session: { access_token: 'private-token', refresh_token: 'private-refresh', user } }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { available: false });
  }
});

test('forged local headers cannot enable a wildcard or unknown web binding', async () => {
  const forged = request({ role: 'admin' }, { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': '127.0.0.1:54131', 'x-forwarded-port': '54131', 'x-forwarded-proto': 'http' });
  for (const HOSTNAME of ['0.0.0.0', undefined]) { const source = io(); assert.equal((await testingQuickLogin(forged, { ...env, HOSTNAME }, source)).status, 404); assert.equal(source.calls, 0); }
});

test('byte-bounded body rejects oversized chunked input and stalled streams without waiting for cancellation', async () => {
  const streamed = (stream: ReadableStream<Uint8Array>) => new Request(request({ role: 'student' }), { body: stream, duplex: 'half' } as RequestInit);
  const large = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(257)); } });
  await assert.rejects(boundedQuickLoginBody(streamed(large)));
  const stalled = new ReadableStream<Uint8Array>({ cancel() { return new Promise(() => {}); } });
  const start = Date.now(); await assert.rejects(boundedQuickLoginBody(streamed(stalled))); assert.ok(Date.now() - start < 1800);
});

test('empty confirmation timestamps and oversized or empty provider tokens are rejected', async () => {
  const student = accounts.find(actor => actor.role === 'student')!;
  const session = { access_token: 'token', refresh_token: 'refresh', user: { id: student.actorId, email: student.email, is_anonymous: false, email_confirmed_at: '2026-10-01T00:00:00Z' } };
  for (const value of [{ ...session, user: { ...session.user, email_confirmed_at: '' } }, { ...session, access_token: '' }, { ...session, access_token: 'a'.repeat(16385) }, { ...session, refresh_token: 'r'.repeat(4097) }]) {
    const response = await testingQuickLogin(request({ role: 'student' }), env, io({ session: value })); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { available: false });
  }
});

test('only the exact managed standalone entry and same repository config admit private credential reads', async () => {
  for (const patch of [{ entry: () => resolve(root, 'node_modules/next/dist/bin/next') }, { entry: () => undefined }, { standaloneConfig: () => JSON.stringify({ output: 'standalone', repoRoot: resolve(root, '../other') }) }, { standaloneConfig: () => JSON.stringify({ output: 'export', repoRoot: root }) }, { standaloneConfig: () => undefined }]) {
    const source = io(); let credentialReads = 0;
    const dependency = { ...source, ...patch, read: async (path: string) => { if (!path.endsWith('identities.json')) credentialReads++; return source.read(path); } };
    const response = await testingQuickLogin(request({ role: 'admin' }), env, dependency);
    assert.equal(response.status, 503); assert.equal(source.calls, 0); assert.equal(credentialReads, 0);
  }
  const source = io(); assert.equal((await testingQuickLogin(request({ role: 'admin' }), env, source)).status, 200); assert.equal(source.calls, 1);
});
