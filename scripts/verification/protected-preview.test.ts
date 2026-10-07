import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import { mock } from 'node:test';
import { syncBuiltinESMExports } from 'node:module';

const secret = 'private-url-specific-preview-canary';
const binding = { owner: 'api' as const, repository: 'owner/repo', releaseSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), runId: '31', runAttempt: 1, packageSha256: 'c'.repeat(64), artifactSha256: 'd'.repeat(64), teamId: 'team_current', projectId: 'prj_current', deploymentId: 'dpl_current', origin: 'https://current-source.vercel.app' };
async function subject() { const api = await import(pathToFileURL(resolve(import.meta.dirname, 'protected-preview.ts')).href).catch(() => ({})); assert.equal(typeof api.createProtectedPreview, 'function'); return api as typeof import('./protected-preview'); }
async function fixture(run: (value: { root: string; now: number; writes: () => number; admit: () => Promise<void>; setMode: (mode: string) => void }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-preview-capability-')), original = globalThis.fetch;
  let now = Date.now(), writes = 0, mode = 'protected', admits = 0;
  execFileSync('git',['init','--quiet',root]); await writeFile(join(root, '.gitignore'), '.local/\n'); await mkdir(join(root, '.local/hosted-release'), { recursive: true });
  globalThis.fetch = async (raw, options) => {
    const url = new URL(String(raw)); assert.equal(url.origin, 'https://api.vercel.com'); assert.equal(options?.redirect, 'error'); assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-provider-token-canary');
    if (url.pathname.startsWith('/v9/projects/')) return Response.json({ id: binding.projectId, accountId: binding.teamId, ssoProtection: mode === 'none' ? null : { deploymentType: 'all_except_custom_domains' } });
    if (url.pathname.startsWith('/v13/deployments/')) return Response.json({ id: binding.deploymentId, projectId: mode === 'foreign' ? 'prj_foreign' : binding.projectId, ownerId: binding.teamId, url: new URL(binding.origin).hostname, readyState: 'READY', target: 'preview', meta: { cuevoCommitSha: binding.releaseSha } });
    assert.equal(url.pathname, '/aliases/dpl_current/protection-bypass'); assert.equal(options?.method, 'PATCH');
    const intent = JSON.parse(await readFile(join(root, '.local/hosted-release/protected-preview-api-intent.json'), 'utf8')); assert.equal(intent.binding.deploymentId, binding.deploymentId); assert.ok(admits >= 2);
    const body = JSON.parse(String(options?.body)); assert.ok(body.ttl > 0 && body.ttl <= 3600); writes++;
    if (mode === 'unknown') throw Error(secret); if (mode === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid' } });
    if (mode === 'expire') now += 6000;
    return Response.json({ value: secret });
  };
  try { await run({ root, get now() { return now; }, writes: () => writes, admit: async () => { admits++; }, setMode: value => { mode = value; } }); }
  finally { globalThis.fetch = original; await rm(root, { recursive: true, force: true }); }
}

test('verified protected preview stores a private original capability and supplies a header only to the exact immutable origin', async () => {
  const api = await subject(); await fixture(async f => {
    const receipt = await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now });
    assert.equal(receipt.status, 'CONFIRMED'); assert.equal(f.writes(), 1); assert.equal(JSON.stringify(receipt).includes(secret), false);
    assert.deepEqual(await api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/health/ready' }, { now: () => f.now }), { 'x-vercel-protection-bypass': secret });
    for (const url of ['https://api.vercel.com/v1/project', 'https://current-source.vercel.app.foreign.invalid/v1/me', 'https://foreign.vercel.app/v1/me', 'https://project.supabase.co/auth/v1/token', 'https://current-source.vercel.app:443/v1/me', 'https://user@current-source.vercel.app/v1/me']) await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding, url }, { now: () => f.now }));
    await assert.rejects(api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now })); assert.equal(f.writes(), 1);
    const safe = await readFile(join(f.root, '.local/hosted-release/protected-preview-api-result.json'), 'utf8'); assert.equal(safe.includes(secret), false);
  });
});

test('unprotected verified project needs no capability while foreign metadata or uncertain creation cannot authorize use or repeat PATCH', async () => {
  const api = await subject(); for (const mode of ['none', 'foreign', 'unknown']) await fixture(async f => {
    f.setMode(mode); const result = await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now });
    assert.equal(result.status, mode === 'none' ? 'NONE' : 'REQUIRES_REVIEW');
    if (mode === 'none') assert.deepEqual(await api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/' }, { now: () => f.now }), {});
    else await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/' }, { now: () => f.now }));
    if (mode === 'unknown') { assert.equal(f.writes(), 1); await assert.rejects(api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now })); assert.equal(f.writes(), 1); }
  });
});

test('original expiry and private file tampering refuse without refreshing a capability or exposing its value', async () => {
  const api = await subject(); await fixture(async f => {
    f.setMode('expire'); const result = await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 5000).toISOString() }, { admit: f.admit, now: () => f.now }); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(f.writes(), 1);
  });
  await fixture(async f => {
    await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now });
    const file = join(f.root, '.local/hosted-release/protected-preview-api-private.json'), value = JSON.parse(await readFile(file, 'utf8')); value.binding.projectId = 'prj_foreign'; await writeFile(file, JSON.stringify(value));
    await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/v1/me' }, { now: () => f.now }));
  });
});

test('expired capability and different source/run receipts cannot supply headers, and provider redirects retain an unknown original operation', async () => {
 const api = await subject(); await fixture(async f => {
  const expires = f.now + 5000; await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(expires).toISOString() }, { admit: f.admit, now: () => f.now });
  await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/health/live' }, { now: () => expires }));
  for (const changed of [{ ...binding, releaseSha: 'e'.repeat(40) }, { ...binding, runAttempt: 2 }, { ...binding, deploymentId: 'dpl_other' }]) await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding: changed, url: binding.origin + '/' }, { now: () => f.now }));
 });
 await fixture(async f => { f.setMode('redirect'); const result = await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 3600000).toISOString() }, { admit: f.admit, now: () => f.now }); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(f.writes(), 1); await assert.rejects(api.protectedPreviewHeaders({ repoRoot: f.root, binding, url: binding.origin + '/' }, { now: () => f.now })); });
});

test('original approval expiring during durable intent sync cannot issue a capability PATCH', async () => {
  const api = await subject(); await fixture(async f => {
    const originalOpen = fsPromises.open; let diskClock = f.now;
    const open = mock.method(fsPromises, 'open', async (...args: Parameters<typeof fsPromises.open>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('protected-preview-api-intent.json')) { const sync = handle.sync.bind(handle); handle.sync = async () => { await sync(); diskClock += 6000; }; }
      return handle;
    }); syncBuiltinESMExports();
    try { const result = await api.createProtectedPreview({ repoRoot: f.root, binding, vercelToken: 'private-provider-token-canary', approvalExpiresAt: new Date(f.now + 5000).toISOString() }, { admit: f.admit, now: () => diskClock }); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(f.writes(), 0); }
    finally { open.mock.restore(); syncBuiltinESMExports(); }
  });
});
