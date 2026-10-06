import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
const projectRef = 'mqxdjvsyckzocokuikmx', token = 'synthetic-private-management-canary';
const input = { projectRef, boundProjectRef: projectRef, providerToken: token };
const project = { id: projectRef, name: 'Cuevo', status: 'ACTIVE_HEALTHY', database: { host: `db.${projectRef}.supabase.co`, version: '17.11.0.002', postgres_engine: '17' } };
const pooler={identifier:projectRef,database_type:'PRIMARY',db_user:'postgres.'+projectRef,db_host:'aws-0-ap-southeast-1.pooler.supabase.com',db_port:6543,db_name:'postgres',pool_mode:'transaction'};
async function api() {
  let module: Record<string, unknown> = {};
  try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-provider.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.readHostedMigrationProvider, 'function');
  return module as typeof import('./hosted-migration-provider');
}
async function withFetch(implementation: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = implementation;
  try { await run(); } finally { globalThis.fetch = original; }
}
test('provider metadata binds official project and pooler configuration without returning connection strings or credentials', async () => {
  const { readHostedMigrationProvider } = await api(); let calls = 0;
  await withFetch(async (url, options) => {
    calls++; assert.ok([`https://api.supabase.com/v1/projects/${projectRef}`,`https://api.supabase.com/v1/projects/${projectRef}/config/database/pooler`].includes(String(url)));
    assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.ok(options?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(String(url).endsWith('/pooler')?[{...pooler,connection_string:token}]:{ ...project, private_unrelated: token }), { headers: { 'Content-Type': 'application/json' } });
  }, async () => {
    const before = Date.now(), result = await readHostedMigrationProvider(input);
    assert.equal(calls, 2); assert.equal(result.evidence, 'OFFICIAL_SUPABASE_PROJECT_METADATA');
    assert.ok(result.observedAtMs >= before && result.observedAtMs <= Date.now());
    assert.deepEqual(result.directEndpoint, { projectRef, kind: 'direct', host: project.database.host, port: 5432, database: 'postgres' });
    assert.deepEqual(result.sessionEndpoint,{projectRef,kind:'session-pooler',host:pooler.db_host,port:5432,database:'postgres'});
    assert.doesNotMatch(JSON.stringify(result), /canary|private_unrelated|dataApi|sslVerified|dispatchDisabled|postgres_engine/);
  });
});
test('foreign ambiguous replica host user database or unsupported pooler mode cannot bind session migration authority',async()=>{const{readHostedMigrationProvider}=await api();for(const patch of [{identifier:'a'.repeat(20)},{database_type:'READ_REPLICA'},{db_user:'postgres.other'},{db_host:'attacker.invalid'},{db_port:1234},{db_name:'other'},{pool_mode:'unknown'}])await withFetch(async(url)=>Response.json(String(url).endsWith('/pooler')?[{...pooler,...patch}]:project),async()=>assert.rejects(readHostedMigrationProvider(input)));});
test('foreign unhealthy unsupported or unknown provider identity cannot authorize a migration endpoint', async () => {
  const { readHostedMigrationProvider } = await api();
  for (const delta of [{ id: 'a'.repeat(20) }, { name: 'Other product' }, { status: 'INACTIVE' }, { database: { ...project.database, host: 'db.other.invalid' } }, { database: { ...project.database, postgres_engine: '16' } }, { database: { ...project.database, version: '16.3' } }, { database: null }]) {
    await withFetch(async () => new Response(JSON.stringify({ ...project, ...delta })), async () => assert.rejects(readHostedMigrationProvider(input), /requires review/));
  }
});
test('input hooks credential controls and unbound projects fail before any provider request', async () => {
  const { readHostedMigrationProvider } = await api(); let calls = 0, traps = 0;
  const getter = { ...input }; Object.defineProperty(getter, 'providerToken', { enumerable: true, get() { traps++; return token; } });
  const proxy = new Proxy(input, { get() { traps++; return token; } });
  await withFetch(async () => { calls++; throw Error(token); }, async () => {
    for (const value of [getter, proxy, { ...input, boundProjectRef: 'a'.repeat(20) }, { ...input, providerToken: token + '\n' }, { ...input, endpoint: 'https://evil.invalid' }, { ...input, providerToken: '' }]) await assert.rejects(readHostedMigrationProvider(value));
    assert.equal(calls, 0); assert.equal(traps, 0);
  });
});
test('provider transport and malformed or excessive response bodies remain private failures', async () => {
  const { readHostedMigrationProvider } = await api();
  for (const response of [new Response(token, { status: 403 }), new Response('{'), new Response(JSON.stringify({ ...project, noise: 'x'.repeat(65536) })), new Response('[]'), new Response(JSON.stringify(project), { headers: { 'Content-Length': '999999' } })]) {
    await withFetch(async () => response, async () => {
      await assert.rejects(readHostedMigrationProvider(input), error => error instanceof Error && /requires review/.test(error.message) && !error.message.includes(token));
    });
  }
  await withFetch(async () => { throw Error(token); }, async () => assert.rejects(readHostedMigrationProvider(input), error => error instanceof Error && !error.message.includes(token)));
});
test('a failed or endless body read cannot become a fresh project receipt and owned readers are cancelled', async () => {
  const { readHostedMigrationProvider } = await api(); let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(65537))); }, cancel() { cancelled = true; } }));
  await withFetch(async () => response, async () => assert.rejects(readHostedMigrationProvider(input)));
  assert.equal(cancelled, true);
  await withFetch(async () => new Response(new ReadableStream({ start(controller) { controller.error(Error(token)); } })), async () => assert.rejects(readHostedMigrationProvider(input), error => error instanceof Error && !error.message.includes(token)));
});

test('the request deadline covers a hanging body even when stream cancellation never settles', async context => {
  const { readHostedMigrationProvider } = await api(); let cancelled = false;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await withFetch(async () => new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } })), async () => {
      const pending = readHostedMigrationProvider(input);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      context.mock.timers.tick(15000);
      const result = await Promise.race([pending.then(() => 'unexpected-success', () => 'private-failure'), Promise.resolve().then(() => Promise.resolve()).then(() => 'still-pending')]);
      assert.equal(result, 'private-failure'); assert.equal(cancelled, true);
    });
  } finally { context.mock.timers.reset(); }
});

test('oversized provider headers refuse immediately even if transport cancellation never resolves', async () => {
  const { readHostedMigrationProvider } = await api(); let cancelled = false;
  await withFetch(async () => new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { headers: { 'Content-Length': '999999' } }), async () => {
    const pending = readHostedMigrationProvider(input);
    let result = 'pending'; void pending.then(() => { result = 'unexpected-success'; }, () => { result = 'private-failure'; });
    for (let index = 0; index < 20; index++) await Promise.resolve();
    assert.equal(result, 'private-failure'); assert.equal(cancelled, true);
  });
});
test('selected endpoint binds its reviewed recipe digest and never accepts a transaction port or another project',async()=>{const{readHostedMigrationProvider,requireCurrentHostedMigrationEndpoint}=await api();await withFetch(async url=>Response.json(String(url).endsWith('/pooler')?[pooler]:project),async()=>{const provider=await readHostedMigrationProvider(input),endpoint=provider.sessionEndpoint,fingerprint=createHash('sha256').update(canonicalReleaseExecutionJson(endpoint)).digest('hex');assert.deepEqual(requireCurrentHostedMigrationEndpoint(endpoint,provider,fingerprint),endpoint);for(const delta of [{port:6543},{host:'aws-0-other.pooler.supabase.com'},{projectRef:'a'.repeat(20)}])assert.throws(()=>requireCurrentHostedMigrationEndpoint({...endpoint,...delta},provider,fingerprint));assert.throws(()=>requireCurrentHostedMigrationEndpoint(endpoint,provider,'a'.repeat(64)));});});
