import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { EventEmitter } from 'node:events';

const ref = 'mqxdjvsyckzocokuikmx', auth = `https://${ref}.supabase.co`, apiOrigin = 'https://cuevo-api-fixture.vercel.app', bytes = await readFile(resolve(import.meta.dirname, '../../supabase/seed/identities.json')), manifest = JSON.parse(bytes.toString('utf8')) as { schoolId: string; denialSchoolId: string; actors: { actorId: string; role: string; email: string }[] }, assetId = '93000000-0000-4000-8000-000000000001', roomId = '93000000-0000-4000-8000-000000000002';
let mode = 'normal', admissions = 0;
const runtime = { api: { DATABASE_URL: `postgresql://cuevo_api:api-fixture@db.${ref}.supabase.co:5432/postgres`, CUEVO_DATABASE_TLS_CA: 'fixtureca', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' }, edge: { CUEVO_WORKER_DATABASE_URL: `postgresql://cuevo_worker:worker-fixture@db.${ref}.supabase.co:5432/postgres`, CUEVO_WORKER_TLS_CA: 'fixtureca' } };
Object.assign(globalThis, { privateVerifyFixture: { admission: async () => { admissions++; if (mode === 'admission') throw Error('private error'); }, runtime: () => runtime, prepared: (value: unknown) => value, restricted: async () => mode !== 'database', join: async (_auth: string, _key: string, token: string, topic: string) => mode === 'realtime' ? 'UNKNOWN' : token.endsWith('student') && topic.startsWith('cuevo:' + manifest.schoolId) ? 'SUBSCRIBED' : 'DENIED' } });
registerHooks({ resolve(specifier, context, next) { if (['backend-release-admission', 'backend-release-contracts', 'backend-provider-deploy'].some(name => specifier.endsWith('/' + name))) return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true }; return next(specifier, context); }, load(url, context, next) { const name = url.split('/').at(-1); if (name === 'backend-release-admission.ts') return { format: 'module', shortCircuit: true, source: 'export const readBackendReleaseAdmission=globalThis.privateVerifyFixture.admission;' }; if (name === 'backend-release-contracts.ts') return { format: 'module', shortCircuit: true, source: 'export const validatePreparedBackendReleaseIntent=globalThis.privateVerifyFixture.prepared;' }; if (name === 'backend-provider-deploy.ts') return { format: 'module', shortCircuit: true, source: 'export const prepareHostedRuntimeRecipients=globalThis.privateVerifyFixture.runtime;' }; if (name === 'backend-hosted-private.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replaceAll('await restricted(', 'await globalThis.privateVerifyFixture.restricted(').replaceAll('await privateJoin(', 'await globalThis.privateVerifyFixture.join('), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const api = () => import(pathToFileURL(resolve(import.meta.dirname, 'backend-hosted-private.ts')).href) as Promise<typeof import('./backend-hosted-private')>;
async function fixture(selected: string, run: (input: Record<string, unknown>, calls: string[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-private-verify-')), previous = globalThis.fetch, calls: string[] = []; mode = selected; admissions = 0;
  try {
    await mkdir(join(root, 'supabase/seed'), { recursive: true }); await writeFile(join(root, 'supabase/seed/identities.json'), bytes); let content = '', hash = '';
    const input = { repoRoot: root, expected: { releaseSha: 'a'.repeat(40), targets: { api: { projectId: 'prj_Api', teamId: 'team_Cuevo' }, supabase: { projectRef: ref, authOrigin: auth } } }, preparedApproval: {}, githubToken: 'private-fixture-gh', vercelToken: 'private-fixture-vercel-token', providerToken: 'private-fixture-provider', runtimeConfig: {}, apiDeployment: { url: apiOrigin, id: 'dpl_fixture' }, syntheticPassword: 'private-fixture-synthetic-password' };
    globalThis.fetch = async (raw, options) => { const url = new URL(String(raw)); calls.push((options?.method ?? 'GET') + ':' + url.pathname); assert.equal(options?.redirect, 'error');
      if (url.origin === 'https://api.vercel.com') return Response.json({ id: 'dpl_fixture', projectId: 'prj_Api', ownerId: 'team_Cuevo', url: new URL(apiOrigin).hostname, readyState: 'READY', meta: { cuevoCommitSha: 'a'.repeat(40) } });
      if (url.pathname === '/storage/v1/bucket/learner-private') return Response.json({ id: 'learner-private', name: 'learner-private', public: mode === 'bucket', file_size_limit: 524288, allowed_mime_types: ['text/plain', 'image/png', 'image/jpeg', 'application/pdf'] });
      if (url.pathname === '/auth/v1/token') { const actor = manifest.actors.find(actor => actor.email === JSON.parse(String(options?.body)).email)!; return Response.json({ access_token: 'current-private-session-' + actor.role, user: { id: actor.actorId, email: actor.email } }); }
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
      if (url.pathname === '/v1/assets') { const body = JSON.parse(String(options?.body)); hash = body.sha256; return Response.json({ id: assetId, ownerId: body.ownerId, sha256: hash, state: 'STAGED', objectPath: manifest.schoolId + '/' + body.ownerId + '/' + assetId }); }
      if (url.pathname.endsWith('/finalize')) { content = Buffer.from(JSON.parse(String(options?.body)).contentBase64, 'base64').toString('utf8'); return Response.json({ id: assetId, state: 'AVAILABLE' }); }
      if (url.pathname.endsWith('/download')) { const token = new Headers(options?.headers).get('Authorization'); if (token?.endsWith('parent')) return Response.json({ code: 'FORBIDDEN' }, { status: 403 }); return new Response(content); }
      if (url.pathname.startsWith('/storage/v1/object/learner-private/')) return Response.json({ message: 'denied' }, { status: new Headers(options?.headers).get('apikey') === 'sb_secret_fixture' ? 404 : mode === 'storage-open' ? 200 : 403 });
      if (url.pathname.endsWith('/retire')) return Response.json({ id: assetId, state: 'RETIRED' });
      if (url.pathname === '/storage/v1/object/learner-private' && options?.method === 'DELETE') return Response.json([{ name: manifest.schoolId + '/' + manifest.actors.find(actor => actor.role === 'student')!.actorId + '/' + assetId }]);
      if (url.pathname === '/v1/community/rooms') { assert.deepEqual(JSON.parse(String(options?.body)).memberIds, [manifest.actors.find(actor => actor.role === 'student')!.actorId]); return Response.json({ id: roomId }); }
      if (url.pathname.endsWith('/lifecycle')) { const body = JSON.parse(String(options?.body)); assert.equal(body.confirmChange, true); assert.equal(body.state, 'CLOSED'); return Response.json(mode === 'wrong-close' ? { id: assetId, revision: 2, status: 'CLOSED' } : { id: roomId, revision: 2, status: 'CLOSED' }); }
      throw Error('Unexpected fixed private endpoint');
    };
    await run(input, calls);
  } finally { globalThis.fetch = previous; await rm(root, { recursive: true, force: true }); }
}
test('private probes use normal source commands and exact cleanup while preserving incomplete activation authority', async () => { const { verifyHostedPrivateAccess } = await api(); await fixture('normal', async (input, calls) => { const result = await verifyHostedPrivateAccess(input); assert.equal(result.status, 'PRIVATE_PROBES_CONFIRMED'); assert.equal(result.privateStorage, true); assert.equal(result.privateRealtime, true); assert.equal(result.storageProbe?.retired, true); assert.equal(result.storageProbe?.removed, true); assert.equal(result.realtimeProbe?.closed, true); assert.equal(calls.filter(call => call.endsWith('/auth/v1/logout')).length, 3); assert.equal(result.activationAllowed, false); assert.equal(result.hostedAcceptance, false); assert.equal(result.freshProof, true); assert.equal(admissions, 2); }); });
test('public bucket open direct bytes unavailable Realtime and failed admission never pass private verification', async () => { const { verifyHostedPrivateAccess } = await api(); for (const mode of ['bucket', 'storage-open', 'realtime', 'admission', 'wrong-close']) await fixture(mode, async (input, calls) => { const result = await verifyHostedPrivateAccess(input); assert.equal(result.status, 'REQUIRES_REVIEW'); if (mode === 'admission') assert.equal(calls.length, 0); if (mode === 'realtime') assert.equal(result.realtimeProbe?.closed, true); if (mode === 'wrong-close') assert.equal(result.realtimeProbe?.closed, false); }); });
test('a retained uncertain private probe cannot mint a new original command or repeat provider mutations',async()=>{const {verifyHostedPrivateAccess}=await api();await fixture('normal',async(input,calls)=>{await mkdir(join(String(input.repoRoot),'.local/hosted-release'),{recursive:true});await writeFile(join(String(input.repoRoot),'.local/hosted-release/private-probe-dpl_fixture-intent.json'),JSON.stringify({state:'INTENT',originalKey:'private-existing-uncertain'}));const result=await verifyHostedPrivateAccess(input);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(calls.some(call=>call.startsWith('POST:')),false);});});
test('a successful private probe persists original identity and exact cleanup receipt without credentials',async()=>{const {verifyHostedPrivateAccess}=await api();await fixture('normal',async(input)=>{const result=await verifyHostedPrivateAccess(input);assert.equal(result.status,'PRIVATE_PROBES_CONFIRMED');const intent=await readFile(join(String(input.repoRoot),'.local/hosted-release/private-probe-dpl_fixture-intent.json'),'utf8'),receipt=await readFile(join(String(input.repoRoot),'.local/hosted-release/private-probe-dpl_fixture-result.json'),'utf8');assert.equal(JSON.parse(intent).apiDeploymentId,'dpl_fixture');assert.equal(JSON.parse(receipt).result.storageProbe.assetId,assetId);assert.equal(JSON.parse(receipt).result.realtimeProbe.closed,true);for(const text of[intent,receipt])assert.doesNotMatch(text,/private-fixture-synthetic-password|sb_secret_fixture|current-private-session/);const cached=await verifyHostedPrivateAccess(input);assert.equal(cached.status,'PRIVATE_PROBES_CONFIRMED');});});
test('cached flags require exact cleanup receipts and valid verification time before admission',async()=>{const {verifyHostedPrivateAccess}=await api();for(const change of ['cleanup','clock','missing'])await fixture('normal',async(input,calls)=>{assert.equal((await verifyHostedPrivateAccess(input)).status,'PRIVATE_PROBES_CONFIRMED');const path=join(String(input.repoRoot),'.local/hosted-release/private-probe-dpl_fixture-result.json'),saved=JSON.parse(await readFile(path,'utf8'));if(change==='cleanup')saved.result.storageProbe.removed=false;if(change==='clock')saved.verifiedAt='not-a-date';if(change==='missing')delete saved.result.realtimeProbe;await writeFile(path,JSON.stringify(saved));calls.length=0;assert.equal((await verifyHostedPrivateAccess(input)).status,'REQUIRES_REVIEW');assert.equal(calls.some(call=>call.startsWith('POST:')),false);});});

test('initial receipt replay stays idempotent but never becomes a fresh pre-activation proof', async () => {
  const { verifyHostedPrivateAccess } = await api();
  await fixture('normal', async (input, calls) => {
    const first = await verifyHostedPrivateAccess(input); assert.equal(first.freshProof, true);
    const receiptPath = join(String(input.repoRoot), '.local/hosted-release/private-probe-dpl_fixture-result.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    // Retain a complete prior receipt whose timestamps are demonstrably earlier
    // than the pre-activation call. Time alone never upgrades it to fresh.
    receipt.verifiedAt = new Date(Date.now() - 1000).toISOString();
    receipt.createdAt = new Date(Date.now() - 2000).toISOString();
    delete receipt.result.freshProof; // Complete pre-extension historical receipt.
    const intentPath = join(String(input.repoRoot), '.local/hosted-release/private-probe-dpl_fixture-intent.json');
    const intent = JSON.parse(await readFile(intentPath, 'utf8')); intent.createdAt = receipt.createdAt;
    await writeFile(intentPath, JSON.stringify(intent)); await writeFile(receiptPath, JSON.stringify(receipt));
    calls.length = 0;
    const cached = await verifyHostedPrivateAccess(input);
    assert.equal(cached.status, 'PRIVATE_PROBES_CONFIRMED'); assert.equal(cached.freshProof, false);
    assert.equal(calls.some(call => call.startsWith('POST:')), false);
    calls.length = 0;
    const before = Date.now(), current = await verifyHostedPrivateAccess({ ...input, purpose: 'PRE_ACTIVATION' });
    assert.equal(current.status, 'PRIVATE_PROBES_CONFIRMED'); assert.equal(current.freshProof, true);
    assert.ok(calls.some(call => call === 'POST:/v1/assets'));
    const saved = JSON.parse(await readFile(join(String(input.repoRoot), '.local/hosted-release/private-probe-pre-activation-dpl_fixture-result.json'), 'utf8'));
    assert.ok(Date.parse(saved.verifiedAt) >= before);
    const preIntent = JSON.parse(await readFile(join(String(input.repoRoot), '.local/hosted-release/private-probe-pre-activation-dpl_fixture-intent.json'), 'utf8'));
    assert.equal(preIntent.purpose, 'PRE_ACTIVATION'); assert.notEqual(preIntent.identitySha256, intent.identitySha256);
    calls.length = 0;
    const retry = await verifyHostedPrivateAccess({ ...input, purpose: 'PRE_ACTIVATION' });
    assert.equal(retry.status, 'REQUIRES_REVIEW'); assert.equal(retry.freshProof, false);
    assert.equal(calls.some(call => call.startsWith('POST:')), false);
  });
});

test('a prior uncertain pre-activation intent refuses every retry without a replacement key or mutations', async () => {
  const { verifyHostedPrivateAccess } = await api();
  await fixture('normal', async (input, calls) => {
    const directory = join(String(input.repoRoot), '.local/hosted-release'); await mkdir(directory, { recursive: true });
    const path = join(directory, 'private-probe-pre-activation-dpl_fixture-intent.json');
    const original = JSON.stringify({ purpose: 'PRE_ACTIVATION', state: 'INTENT', originalKey: 'original-pre-activation-uncertain' });
    await writeFile(path, original);
    const result = await verifyHostedPrivateAccess({ ...input, purpose: 'PRE_ACTIVATION' });
    assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.freshProof, false);
    assert.equal(calls.some(call => call.startsWith('POST:')), false); assert.equal(await readFile(path, 'utf8'), original);
  });
});

test('invalid proof purposes and failed cleanup can never report a fresh positive proof', async () => {
  const { verifyHostedPrivateAccess } = await api();
  await fixture('normal', async (input, calls) => {
    const result = await verifyHostedPrivateAccess({ ...input, purpose: 'UNKNOWN' });
    assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.freshProof, false); assert.deepEqual(calls, []);
  });
  await fixture('wrong-close', async input => {
    const result = await verifyHostedPrivateAccess({ ...input, purpose: 'PRE_ACTIVATION' });
    assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.freshProof, false);
    assert.equal(result.realtimeProbe?.closed, false);
  });
});
test('the unchanged private join classifies only an exact authorization reply as denied and transport errors as unknown', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'backend-hosted-private.ts'), 'utf8'), start = source.indexOf('async function privateJoin('), end = source.indexOf('\n/**', start), method = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code, topic = 'cuevo:' + manifest.schoolId + ':room:' + roomId;
  for (const [message, expected] of [['connection lost', 'UNKNOWN'], ['You do not have permissions to read from this Channel topic: ' + topic, 'DENIED'], ['You do not have permissions to read from this Channel topic: wrong-topic', 'UNKNOWN']] as const) {
    let removed = false;
    const createClient = () => ({ channel: () => { const channel = { on: (_type: string, _filter: unknown, _callback: unknown) => channel, subscribe: (callback: (status: string, error: Error) => void) => callback('CHANNEL_ERROR', Error(message)) }; return channel; }, realtime: { setAuth: async () => undefined, disconnect: () => undefined }, removeChannel: async () => { removed = true; } });
    const result = await runInNewContext(method + '; privateJoin(auth,key,token,topic)', { createClient, auth, key: 'sb_publishable_fixture', token: 'private-token', topic, setTimeout, clearTimeout }); assert.equal(result, expected); assert.equal(removed, true);
  }
});
test('the actual restricted-client method handles idle errors and end events around awaited queries without raw error leakage', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'backend-hosted-private.ts'), 'utf8'), start = source.indexOf('async function restricted('), end = source.indexOf('\nasync function privateJoin(', start), method = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code;
  for (const selected of ['normal', 'error-on-connect', 'end-on-identity', 'error-on-denial', 'close-error', 'query-error', 'wrong-tls']) {
    const queries: string[] = []; let closed = false, listeners = false;
    class ControlledClient extends EventEmitter {
      connection = { stream: { encrypted: true, authorized: selected !== 'wrong-tls', getPeerCertificate: () => ({}) } };
      async connect() { listeners = this.listenerCount('error') > 0 && this.listenerCount('end') > 0; if (selected === 'error-on-connect') this.emit('error', Error('private-driver-error-canary')); }
      async query(sql: string) {
        queries.push(sql);
        if (selected === 'query-error') throw Error('private-driver-error-canary');
        if (sql.includes('current_user')) { if (selected === 'end-on-identity') this.emit('end'); return { rows: [{ role: 'cuevo_worker', sessionRole: 'cuevo_worker', database: 'postgres', restricted: true }] }; }
        if (selected === 'error-on-denial') this.emit('error', Error('private-driver-error-canary'));
        const denial = Object.assign(Error('private-denial-canary'), { code: '42501' }); throw denial;
      }
      async end() { closed = true; if (selected === 'close-error') throw Error('private-close-canary'); this.emit('end'); }
    }
    let result: unknown, error: unknown;
    try { result = await runInNewContext(method + ';restricted(dsn,ca,role)', { Client: ControlledClient, URL, checkServerIdentity: () => undefined, failure: () => Error('Hosted private verification requires review; contents withheld.'), dsn: 'postgresql://cuevo_worker:fixture@db.example:5432/postgres', ca: 'fixture', role: 'cuevo_worker' }); } catch (caught) { error = caught; }
    assert.equal(listeners, true, selected); assert.equal(closed, true, selected);
    if (selected === 'normal') { assert.equal(result, true); assert.equal(error, undefined); }
    else { assert.ok(error, selected); assert.doesNotMatch(String(error), /private-driver-error-canary|private-denial-canary|private-close-canary/); }
    if (selected === 'error-on-connect' || selected === 'wrong-tls') assert.equal(queries.length, 0);
    if (selected === 'end-on-identity') assert.equal(queries.length, 1);
    if (selected === 'error-on-denial') assert.equal(queries.length, 2);
  }
});
