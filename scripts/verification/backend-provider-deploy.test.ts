import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import type { BackendReleaseExpected } from './backend-release-contracts';

const sha = 'a'.repeat(40), ref = 'mqxdjvsyckzocokuikmx', hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex'), ca = '-----BEGIN CERTIFICATE-----\nfixture-ca\n-----END CERTIFICATE-----';
const expected = { releaseSha: sha, targets: { web: { origin: 'https://cuevo-web.vercel.app' }, api: { projectId: 'prj_Api', teamId: 'team_Cuevo', origin: 'https://cuevo-api.vercel.app', target: 'preview' }, supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co`, edgeOrigin: `https://${ref}.supabase.co/functions/v1/cuevo-worker` } }, fingerprints: {} } as BackendReleaseExpected;
const runtime = () => { const common = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: ref, CUEVO_SYNTHETIC_WEB_ORIGIN: expected.targets.web.origin, SUPABASE_URL: expected.targets.supabase.authOrigin, POSTHOG_CAPTURE_MODE: 'DISABLED' }; return { version: 1, purpose: 'CUEVO_HOSTED_RUNTIME_CONFIGURATION', sourceSha: sha, projectRef: ref, webOrigin: expected.targets.web.origin, api: { ...common, DATABASE_URL: `postgresql://cuevo_api:api-private-password@db.${ref}.supabase.co:5432/postgres`, CUEVO_DATABASE_TLS_CA: ca, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_sourcefixturekey', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_api_only_private_canary', API_ALLOWED_ORIGIN: expected.targets.web.origin, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, edge: { ...common, CUEVO_WORKER_DATABASE_URL: `postgresql://cuevo_worker:worker-private-password@db.${ref}.supabase.co:5432/postgres`, CUEVO_WORKER_TLS_CA: ca, CUEVO_WORKER_EXECUTION_MODE: 'synthetic-staging', CUEVO_WORKER_WAKE_KEY: '' } }; };
let admissions = 0, denied = false;
Object.assign(globalThis, { providerDeployFixture: { admission: async () => { admissions++; if (denied) throw Error('private-gh-token'); return {}; }, prepared: (value: unknown) => value, cli: async () => 'https://cuevo-api-fixture.vercel.app' } });
registerHooks({ resolve(specifier, context, next) { if (specifier.endsWith('/backend-release-admission') || specifier.endsWith('/backend-release-contracts')) return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true }; return next(specifier, context); }, load(url, context, next) { const name = url.split('/').at(-1); if (name === 'backend-preview-transport.ts') return { format: 'module', shortCircuit: true, source: 'export const createBackendPreviewTransport=async()=>({status:"CONFIRMED"});export const backendPreviewHeaders=async input=>new URL(input.url).origin===new URL(input.apiDeployment.url).origin?{"x-vercel-protection-bypass":"private-gateway-canary"}:{};' };  if (name === 'backend-release-admission.ts') return { format: 'module', shortCircuit: true, source: 'export const readBackendReleaseAdmission=globalThis.providerDeployFixture.admission;' }; if (name === 'backend-release-contracts.ts') return { format: 'module', shortCircuit: true, source: 'export const validatePreparedBackendReleaseIntent=globalThis.providerDeployFixture.prepared;' }; if (name === 'backend-provider-deploy.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('await apiCli(root, built.api, expected, input.vercelToken)', 'await globalThis.providerDeployFixture.cli()'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const api = () => import(pathToFileURL(resolve(import.meta.dirname, 'backend-provider-deploy.ts')).href) as Promise<typeof import('./backend-provider-deploy')>;
async function fixture(run: (input: Parameters<Awaited<ReturnType<typeof api>>['prepareBackendProviderDeployment']>[0]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-provider-artifacts-')); admissions = 0; denied = false;
  try {
    await writeFile(join(root, 'package-lock.json'), '{}'); execFileSync('git', ['init', '--quiet', root]); execFileSync('git', ['-C', root, 'add', 'package-lock.json']); execFileSync('git', ['-C', root, '-c', 'user.name=Artifact fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Locked source']);
    const apiRoot = join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot = join(root, '.local/edge-artifacts/cuevo-worker'); await mkdir(join(apiRoot, '.vercel/output'), { recursive: true }); await mkdir(edgeRoot, { recursive: true });
    const apiFiles = [{ path: '.vercel/output/config.json', bytes: JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api/index' }] }) }, { path: 'api/index.mjs', bytes: 'compiled-api' }];
    for (const file of apiFiles) { await mkdir(resolve(apiRoot, file.path, '..'), { recursive: true }); await writeFile(join(apiRoot, file.path), file.bytes); }
    const files = apiFiles.map(file => ({ path: file.path, sha256: hash(file.bytes) })), apiArtifact = { schemaVersion: 1, service: 'api', sourceLockSha256: hash('{}'), delivery: 'vercel-node-function', node: '24', entrypoint: 'api/index.mjs', prebuiltOutput: '.vercel/output', prebuiltSha256: hash(JSON.stringify(files.filter(row => row.path.startsWith('.vercel/output/')))), files };
    await writeFile(join(apiRoot, 'artifact.json'), JSON.stringify(apiArtifact, null, 2)); const edgeFiles = [{ path: 'index.ts', bytes: 'compiled-worker' }, { path: 'deno.json', bytes: '{}' }, { path: 'deno.lock', bytes: 'source-locked-deno' }];
    for (const file of edgeFiles) await writeFile(join(edgeRoot, file.path), file.bytes); const edgeArtifact = { schemaVersion: 1, service: 'cuevo-worker', sourceLockSha256: hash('{}'), runtime: 'deno', entrypoint: 'index.ts', imports: ['npm:pg@8.23.1'], denoLockSha256: hash('source-locked-deno'), files: edgeFiles.map(file => ({ path: file.path, sha256: hash(file.bytes) })) }; await writeFile(join(edgeRoot, 'artifact.json'), JSON.stringify(edgeArtifact, null, 2));
    await run({ repoRoot: root, expected: { ...expected, releaseRunId: '51', runAttempt: 1, fingerprints: { ...expected.fingerprints, apiArtifactSha256: hash(JSON.stringify(apiArtifact)), edgeArtifactSha256: hash(JSON.stringify(edgeArtifact)), denoLockSha256: edgeArtifact.denoLockSha256 } }, preparedApproval: { sha256: 'b'.repeat(64) } as never, githubToken: 'private-gh-token', apiArtifactRoot: apiRoot, edgeArtifactRoot: edgeRoot, runtimeConfig: runtime() });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('runtime recipients keep API storage and restricted DSNs private, fixture generation explicit, Edge inactive and provider-injected Auth origin separate', async () => { const { prepareHostedRuntimeRecipients } = await api(), recipients = prepareHostedRuntimeRecipients(runtime(), expected); assert.equal(recipients.api.AI_GENERATION_MODE, 'FIXTURE'); assert.equal(recipients.edge.CUEVO_WORKER_WAKE_KEY, ''); assert.equal(Object.keys(recipients.edge).some(key => key.startsWith('SUPABASE_')), false); assert.equal(recipients.edgeInjectedSupabaseOrigin, expected.targets.supabase.authOrigin); assert.equal(Object.hasOwn(recipients.edge, 'SUPABASE_SERVICE_ROLE_KEY'), false); });
test('runtime source project role CA liveAI analytics and extra operator credentials refuse without exposing values', async () => { const { prepareHostedRuntimeRecipients } = await api(); for (const mode of ['source', 'project', 'role', 'ca', 'AI', 'analytics', 'operator', 'shared-password']) { const value = runtime(); if (mode === 'source') value.sourceSha = 'c'.repeat(40); if (mode === 'project') value.projectRef = 'a'.repeat(20); if (mode === 'role') value.api.DATABASE_URL = value.api.DATABASE_URL.replace('cuevo_api:', 'postgres:'); if (mode === 'ca') value.edge.CUEVO_WORKER_TLS_CA = 'other'; if (mode === 'AI') value.api.AI_GENERATION_MODE = 'LIVE'; if (mode === 'analytics') value.edge.POSTHOG_CAPTURE_MODE = 'LIVE_SYNTHETIC'; if (mode === 'operator') Object.assign(value.api, { SUPABASE_ACCESS_TOKEN: 'private-provider-token' }); if (mode === 'shared-password') value.edge.CUEVO_WORKER_DATABASE_URL = value.edge.CUEVO_WORKER_DATABASE_URL.replace('worker-private-password', 'api-private-password'); assert.throws(() => prepareHostedRuntimeRecipients(value, expected), error => error instanceof Error && !error.message.includes('private')); } });
test('provider preparation verifies exact physical API prebuilt and Edge files without outputting runtime values', async () => { const { prepareBackendProviderDeployment } = await api(); await fixture(async input => { const result = await prepareBackendProviderDeployment(input); assert.equal(result.status, 'PREPARED_ONLY'); assert.equal(result.edgeWorker, 'INACTIVE'); assert.equal(result.hostedAcceptance, false); assert.equal(admissions, 2); assert.equal(JSON.stringify(result).includes('private') || JSON.stringify(result).includes(ca), false); }); });
test('provider preparation admits a complete wide artifact inventory while retaining unlisted-file and byte-drift denial', async () => {
  const { prepareBackendProviderDeployment } = await api();
  await fixture(async input => {
    const manifestPath = join(input.apiArtifactRoot, 'artifact.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const directory = 'artifact-files', content = 'source-bound artifact fixture\n';
    await mkdir(join(input.apiArtifactRoot, directory));
    const paths = Array.from({ length: 8000 }, (_, index) => directory + '/' + String(index).padStart(5, '0') + '-' + 'bounded-artifact-'.repeat(8) + '.txt');
    await Promise.all(paths.map(path => writeFile(join(input.apiArtifactRoot, path), content)));
    manifest.files.push(...paths.map(path => ({ path, sha256: hash(content) })));
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    input.expected.fingerprints.apiArtifactSha256 = hash(JSON.stringify(manifest));
    assert.ok(Buffer.byteLength(JSON.stringify(['artifact.json', ...manifest.files.map((row: { path: string }) => row.path)].sort())) > 1024 * 1024);
    assert.ok(manifest.files.length < 20000);
    assert.ok(paths.length * Buffer.byteLength(content) < 128 * 1024 * 1024);
    const result = await prepareBackendProviderDeployment(input);
    assert.equal(result.status, 'PREPARED_ONLY'); assert.equal(result.edgeWorker, 'INACTIVE'); assert.equal(result.hostedAcceptance, false);
    await writeFile(join(input.apiArtifactRoot, 'unlisted.txt'), 'unexpected artifact');
    await assert.rejects(prepareBackendProviderDeployment(input));
    await rm(join(input.apiArtifactRoot, 'unlisted.txt'));
    await writeFile(join(input.apiArtifactRoot, paths.at(-1)!), 'changed artifact bytes');
    await assert.rejects(prepareBackendProviderDeployment(input));
  });
});
test('changed artifact bytes unexpected file and wrong fingerprint refuse after source admission without provider action', async () => { const { prepareBackendProviderDeployment } = await api(); for (const mode of ['bytes', 'extra', 'hash']) await fixture(async input => { if (mode === 'bytes') await writeFile(join(input.edgeArtifactRoot, 'index.ts'), 'changed'); if (mode === 'extra') await writeFile(join(input.apiArtifactRoot, 'unexpected.txt'), 'extra'); if (mode === 'hash') input.expected.fingerprints.apiArtifactSha256 = '0'.repeat(64); await assert.rejects(prepareBackendProviderDeployment(input)); }); });
test('failed official admission and input getters cannot disclose runtime secrets or admit provider package', async () => { const { prepareBackendProviderDeployment } = await api(); await fixture(async input => { denied = true; await assert.rejects(prepareBackendProviderDeployment(input), /requires review/); let reads = 0; await assert.rejects(prepareBackendProviderDeployment({ ...input, get githubToken() { reads++; return 'private-gh-token'; } })); assert.equal(reads, 0); const text = await readFile(join(input.apiArtifactRoot, 'artifact.json'), 'utf8'); assert.equal(text.includes('private-gh-token'), false); }); });

test('initial provider consumer binds encrypted preview environment, exact Edge multipart files and inactive denial with private tokens', async () => {
  const { deployBackendProviders } = await api(); await fixture(async input => {
    await mkdir(join(input.repoRoot, '.local/hosted-release'), { recursive: true }); const originalFetch = globalThis.fetch, calls: string[] = [], envs: { key: string; target: string[]; type: string; value: string }[] = [], secrets: { name: string; value: string }[] = [];
    const token = 'private-vercel-token-provider-fixture', provider = 'private-supabase-token-provider-fixture';
    globalThis.fetch = async (raw, options) => { const url = new URL(String(raw)); calls.push((options?.method ?? 'GET') + ':' + url.pathname); const gateway = new Headers(options?.headers).get('x-vercel-protection-bypass'); assert.equal(gateway, url.origin === 'https://cuevo-api-fixture.vercel.app' ? 'private-gateway-canary' : null); if (url.origin === 'https://cuevo-api-fixture.vercel.app' && url.pathname !== '/health/live' && url.pathname !== '/health/ready') assert.match(new Headers(options?.headers).get('Authorization') ?? '', /^Bearer /); assert.equal(options?.redirect, 'error');
      if (url.origin === 'https://api.vercel.com') { assert.equal(url.searchParams.get('teamId'), expected.targets.api.teamId); assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer ' + token);
        if (url.pathname === '/v9/projects/prj_Api') return Response.json({ id: 'prj_Api', accountId: 'team_Cuevo' });
        if (url.pathname === '/v10/projects/prj_Api/env') { if (options?.method === 'POST') { envs.push(...JSON.parse(String(options.body))); assert.ok(envs.every(env => env.type === 'encrypted' && env.target.join() === 'preview')); return Response.json({ created: envs, failed: [] }); } assert.equal(url.searchParams.get('decrypt'), 'false'); return Response.json({ envs: envs.map(env => ({ key: env.key, target: env.target, type: env.type, id: 'env_' + env.key })) }); }
        if (url.pathname.startsWith('/v13/deployments/')) return Response.json({ id: 'dpl_exact', projectId: 'prj_Api', ownerId: 'team_Cuevo', url: 'cuevo-api-fixture.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: sha } });
      }
      if (url.origin === 'https://api.supabase.com') { assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer ' + provider);
        if (url.pathname.endsWith('/functions')) return Response.json([]);
        if (url.pathname.endsWith('/secrets')) { if (options?.method === 'POST') { secrets.push(...JSON.parse(String(options.body))); assert.ok(secrets.every(secret => !secret.name.startsWith('SUPABASE_'))); return new Response(null, { status: 201 }); } return Response.json(secrets.map(secret => ({ name: secret.name, value: hash(secret.value) }))); }
        if (url.pathname.endsWith('/functions/deploy')) { assert.equal(url.searchParams.get('slug'), 'cuevo-worker'); assert.ok(options?.body instanceof FormData); const body = options.body; const files = body.getAll('file') as File[]; assert.deepEqual(files.map(file => file.name), ['index.ts', 'deno.json', 'deno.lock']); assert.equal(await files[0].text(), 'compiled-worker'); assert.deepEqual(JSON.parse(String(body.get('metadata'))), { entrypoint_path: 'index.ts', import_map_path: 'deno.json', verify_jwt: false, name: 'cuevo-worker' }); return Response.json({ id: 'edge-exact', slug: 'cuevo-worker', status: 'ACTIVE', version: 1, verify_jwt: false }, { status: 201 }); }
        if (url.pathname.endsWith('/functions/cuevo-worker')) return Response.json({ id: 'edge-exact', slug: 'cuevo-worker', status: 'ACTIVE', version: 1, verify_jwt: false });
      }
      if (url.origin === 'https://cuevo-api-fixture.vercel.app') return Response.json({ status: 'ok', service: 'cuevo-api' });
      if (url.origin === `https://${ref}.supabase.co`) { assert.equal(new Headers(options?.headers).has('Authorization'), false); return Response.json({ code: 'WORKER_AUTH_REQUIRED' }, { status: 401 }); }
      throw Error('Unexpected fixed provider request');
    };
    try { const result = await deployBackendProviders({ ...input, vercelToken: token, providerToken: provider }); assert.equal(result.status, 'DEPLOYED_INACTIVE'); assert.equal(result.api?.deploymentId, 'dpl_exact'); assert.equal(result.edge?.state, 'INACTIVE'); assert.equal(result.edge?.customAuthenticationVerified, true); assert.equal(JSON.stringify(result).includes(token) || JSON.stringify(result).includes(provider) || JSON.stringify(result).includes('api-private-password'), false); assert.ok(calls.indexOf('POST:/v10/projects/prj_Api/env') < calls.indexOf(`POST:/v1/projects/${ref}/functions/deploy`)); const intent = await readFile(join(input.repoRoot, '.local/hosted-release/provider-deployment-intent.json'), 'utf8'); assert.equal(intent.includes(token) || intent.includes(provider) || intent.includes('private-password'), false); } finally { globalThis.fetch = originalFetch; }
  });
});
test('an existing API environment or lost first environment acknowledgement cannot upload artifacts or repeat the uncertain write', async () => {
  const { deployBackendProviders } = await api();
  for (const mode of ['existing', 'unknown']) await fixture(async input => {
    await mkdir(join(input.repoRoot, '.local/hosted-release'), { recursive: true }); const originalFetch = globalThis.fetch; let posts = 0;
    globalThis.fetch = async (raw, options) => { const url = new URL(String(raw));
      if (url.pathname === '/v9/projects/prj_Api') return Response.json({ id: 'prj_Api', accountId: 'team_Cuevo' });
      if (url.pathname === '/v10/projects/prj_Api/env') { if (options?.method === 'POST') { posts++; throw Error('private uncertain provider acknowledgement'); } return Response.json({ envs: mode === 'existing' ? [{ id: 'env_existing', key: 'DATABASE_URL', target: ['preview'] }] : [] }); }
      if (url.pathname.endsWith('/functions') || url.pathname.endsWith('/secrets')) return Response.json([]);
      throw Error('No provider upload is permitted');
    };
    try { const value = { ...input, vercelToken: 'private-vercel-token-provider-fixture', providerToken: 'private-supabase-token-provider-fixture' }, first = await deployBackendProviders(value); assert.equal(first.status, 'REQUIRES_REVIEW'); assert.equal(first.api, null); assert.equal(first.edge, null); assert.equal(posts, mode === 'unknown' ? 1 : 0); if (mode === 'unknown') { assert.equal((await deployBackendProviders(value)).status, 'REQUIRES_REVIEW'); assert.equal(posts, 1); } } finally { globalThis.fetch = originalFetch; }
  });
});
