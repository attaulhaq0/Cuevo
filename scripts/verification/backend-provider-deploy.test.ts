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
import { canonicalReleaseReviewJson } from './release-review';
import { validateProviderDeploymentTransition } from '../database/hosted-provider-state';
import type { ProviderDeploymentState } from '../database/hosted-provider-state';

const sha = 'a'.repeat(40), ref = 'mqxdjvsyckzocokuikmx', hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex'), ca = '-----BEGIN CERTIFICATE-----\nfixture-ca\n-----END CERTIFICATE-----';
const operator = { databaseUrl: `postgresql://postgres@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`, certificate: { path: '/fixture/database-ca.pem', sha256: hash(ca) }, password: 'private-operator-password' };
let journal: unknown | null = null, journalFailure = false, posture = 'inactive', postureReads = 0, activateAfter = 0;
type ProviderTestFixture = { failure?: Error; database?: unknown };
const fixtureState = () => (globalThis as unknown as { providerDeployFixture: ProviderTestFixture }).providerDeployFixture;
const expected = { releaseSha: sha, targets: { web: { origin: 'https://cuevo-web.vercel.app' }, api: { projectId: 'prj_Api', teamId: 'team_Cuevo', origin: 'https://cuevo-api.vercel.app', target: 'preview' }, supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co`, edgeOrigin: `https://${ref}.supabase.co/functions/v1/cuevo-worker` } }, fingerprints: {} } as BackendReleaseExpected;
const runtime = () => { const common = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: ref, CUEVO_SYNTHETIC_WEB_ORIGIN: expected.targets.web.origin, SUPABASE_URL: expected.targets.supabase.authOrigin, POSTHOG_CAPTURE_MODE: 'DISABLED' }; return { version: 1, purpose: 'CUEVO_HOSTED_RUNTIME_CONFIGURATION', sourceSha: sha, projectRef: ref, webOrigin: expected.targets.web.origin, api: { ...common, DATABASE_URL: `postgresql://cuevo_api:api-private-password@db.${ref}.supabase.co:5432/postgres`, CUEVO_DATABASE_TLS_CA: ca, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_sourcefixturekey', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_api_only_private_canary', API_ALLOWED_ORIGIN: expected.targets.web.origin, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, edge: { ...common, CUEVO_WORKER_DATABASE_URL: `postgresql://cuevo_worker:worker-private-password@db.${ref}.supabase.co:5432/postgres`, CUEVO_WORKER_TLS_CA: ca, CUEVO_WORKER_EXECUTION_MODE: 'synthetic-staging', CUEVO_WORKER_WAKE_KEY: '' } }; };
let admissions = 0, denied = false;
Object.assign(globalThis, { providerDeployFixture: { admission: async () => { admissions++; if (denied) throw Error('private-gh-token'); return {}; }, prepared: (value: unknown) => value, cli: async () => 'https://cuevo-api-fixture.vercel.app' } });
Object.assign(fixtureState(), { database: async () => ({ signal: new AbortController().signal, observe: async()=>({operator:'postgres',database:'postgres',tls:{kind:'PEER_VERIFIED',host:'db.'+ref+'.supabase.co',certificateSha256:operator.certificate.sha256},historyPresent:true,history:[{version:'20260101000000',name:'provider_posture_fixture',statements:['select 1;']}]}), observeStage: async()=>({observedAtMs:(++postureReads,Date.now()),checks:{foundation:true,rls:true,privateRelations:true,privateFunctions:true,runtimeRoles:true,nativeSourceBridge:true,curriculumLifecycle:true,dispatchInactive:activateAfter&&postureReads>=activateAfter?false:posture==='active'?false:posture==='unknown'?null:true,analyticsInactive:true,recoveryCronInactive:posture!=='cron',transportPrivate:true}}), withLock: async (_key: string, run: () => Promise<void>) => { await run(); return { kind: 'RELEASED' }; }, readProviderDeploymentState: async () => structuredClone(journal), persistProviderDeploymentState: async (input: { expectedSha256: string | null; value: unknown }) => { if (journalFailure) throw Error('Journal unavailable'); assert.equal(input.expectedSha256, journal === null ? null : hash(canonicalReleaseReviewJson(journal))); validateProviderDeploymentTransition(journal, input.value, ref); journal = structuredClone(input.value); } }) });
registerHooks({ resolve(specifier, context, next) { if (specifier.endsWith('/backend-release-admission') || specifier.endsWith('/backend-release-contracts')) return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true }; return next(specifier, context); }, load(url, context, next) { const name = url.split('/').at(-1); if (name === 'hosted-migration-database.ts') return { format: 'module', shortCircuit: true, source: 'export const createHostedMigrationDatabase=globalThis.providerDeployFixture.database;' }; if (name === 'hosted-migration-plan.ts') return {format:'module',shortCircuit:true,source:'export const readCanonicalMigrationSources=()=>({sources:[{name:"20260101000000_provider_posture_fixture.sql",bytes:new TextEncoder().encode("select 1;")}]});'}; if (name === 'hosted-migration-provider.ts') return { format: 'module', shortCircuit: true, source: 'export const readHostedMigrationProvider=async()=>({});export const requireCurrentHostedMigrationEndpoint=input=>input;' }; if (name === 'backend-preview-transport.ts') return { format: 'module', shortCircuit: true, source: 'export const createBackendPreviewTransport=async()=>({status:"CONFIRMED"});export const backendPreviewHeaders=async input=>new URL(input.url).origin===new URL(input.apiDeployment.url).origin?{"x-vercel-protection-bypass":"private-gateway-canary"}:{};' };  if (name === 'backend-release-admission.ts') return { format: 'module', shortCircuit: true, source: 'export const readBackendReleaseAdmission=globalThis.providerDeployFixture.admission;' }; if (name === 'backend-release-contracts.ts') return { format: 'module', shortCircuit: true, source: 'export const validatePreparedBackendReleaseIntent=globalThis.providerDeployFixture.prepared;' }; if (name === 'backend-provider-deploy.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('await apiCli(root, built.api, expected, input.vercelToken, operationSha256, database.signal)', 'await globalThis.providerDeployFixture.cli()').replace('catch { return result; }', 'catch (error) { globalThis.providerDeployFixture.failure=error; return result; }'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const api = () => import(pathToFileURL(resolve(import.meta.dirname, 'backend-provider-deploy.ts')).href) as Promise<typeof import('./backend-provider-deploy')>;
async function fixture(run: (input: Parameters<Awaited<ReturnType<typeof api>>['prepareBackendProviderDeployment']>[0]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-provider-artifacts-')); admissions = 0; denied = false; journal = null; journalFailure = false; posture='inactive';postureReads=0;activateAfter=0;
  try {
    await writeFile(join(root, 'package-lock.json'), '{}'); execFileSync('git', ['init', '--quiet', root]); execFileSync('git', ['-C', root, 'add', 'package-lock.json']); execFileSync('git', ['-C', root, '-c', 'user.name=Artifact fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Locked source']);
    const apiRoot = join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot = join(root, '.local/edge-artifacts/cuevo-worker'); await mkdir(join(apiRoot, '.vercel/output'), { recursive: true }); await mkdir(edgeRoot, { recursive: true });
    const apiFiles = [{ path: '.vercel/output/config.json', bytes: JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api/index' }] }) }, { path: 'api/index.mjs', bytes: 'compiled-api' }];
    for (const file of apiFiles) { await mkdir(resolve(apiRoot, file.path, '..'), { recursive: true }); await writeFile(join(apiRoot, file.path), file.bytes); }
    const files = apiFiles.map(file => ({ path: file.path, sha256: hash(file.bytes) })), apiArtifact = { schemaVersion: 1, service: 'api', sourceLockSha256: hash('{}'), delivery: 'vercel-node-function', node: '24', entrypoint: 'api/index.mjs', prebuiltOutput: '.vercel/output', prebuiltSha256: hash(JSON.stringify(files.filter(row => row.path.startsWith('.vercel/output/')))), files };
    await writeFile(join(apiRoot, 'artifact.json'), JSON.stringify(apiArtifact, null, 2)); const edgeFiles = [{ path: 'index.ts', bytes: 'compiled-worker' }, { path: 'deno.json', bytes: '{}' }, { path: 'deno.lock', bytes: 'source-locked-deno' }];
    for (const file of edgeFiles) await writeFile(join(edgeRoot, file.path), file.bytes); const edgeArtifact = { schemaVersion: 1, service: 'cuevo-worker', sourceLockSha256: hash('{}'), runtime: 'deno', entrypoint: 'index.ts', imports: ['npm:pg@8.23.1'], denoLockSha256: hash('source-locked-deno'), files: edgeFiles.map(file => ({ path: file.path, sha256: hash(file.bytes) })) }; await writeFile(join(edgeRoot, 'artifact.json'), JSON.stringify(edgeArtifact, null, 2));
    await run({ repoRoot: root, expected: { ...expected, treeSha: 'b'.repeat(40), releaseRunId: '51', runAttempt: 1, fingerprints: { ...expected.fingerprints, apiArtifactSha256: hash(JSON.stringify(apiArtifact)), edgeArtifactSha256: hash(JSON.stringify(edgeArtifact)), denoLockSha256: edgeArtifact.denoLockSha256 } }, preparedApproval: { sha256: 'b'.repeat(64) } as never, githubToken: 'private-gh-token', apiArtifactRoot: apiRoot, edgeArtifactRoot: edgeRoot, runtimeConfig: runtime() });
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
        if (url.pathname === '/v10/projects/prj_Api/env') { if (options?.method === 'POST') { envs.push(...JSON.parse(String(options.body))); assert.ok(envs.every(env => env.type === 'encrypted' && env.target.join() === 'preview')); return Response.json({ created: envs, failed: [] }); } assert.equal(url.searchParams.get('decrypt'), 'true'); return Response.json({ envs: envs.map(env => ({ ...env, id: 'env_' + env.key })) }); }
        if (url.pathname.startsWith('/v13/deployments/')) return Response.json({ id: 'dpl_exact', projectId: 'prj_Api', ownerId: 'team_Cuevo', url: 'cuevo-api-fixture.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: sha, cuevoArtifactSha256: input.expected.fingerprints.apiArtifactSha256, cuevoProviderOperation: hash(canonicalReleaseReviewJson((journal as ProviderDeploymentState).operations.at(-1)!.identity)) } });
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
    try { const result = await deployBackendProviders({ ...input, operator, vercelToken: token, providerToken: provider }); assert.equal(result.status, 'DEPLOYED_INACTIVE'); assert.equal(result.api?.deploymentId, 'dpl_exact'); assert.equal(result.edge?.state, 'INACTIVE'); assert.equal(result.edge?.customAuthenticationVerified, true); assert.equal(JSON.stringify(result).includes(token) || JSON.stringify(result).includes(provider) || JSON.stringify(result).includes('api-private-password'), false); assert.ok(calls.indexOf('POST:/v10/projects/prj_Api/env') < calls.indexOf(`POST:/v1/projects/${ref}/functions/deploy`)); const intent = canonicalReleaseReviewJson(journal); assert.equal(intent.includes(token) || intent.includes(provider) || intent.includes('private-password'), false); } finally { globalThis.fetch = originalFetch; }
  });
});
test('an existing API environment or lost first environment acknowledgement cannot upload artifacts or repeat the uncertain write', async () => {
  const { deployBackendProviders } = await api();
  for (const mode of ['existing', 'existing-edge', 'existing-secrets', 'unknown']) await fixture(async input => {
    await mkdir(join(input.repoRoot, '.local/hosted-release'), { recursive: true }); const originalFetch = globalThis.fetch; let posts = 0;
    globalThis.fetch = async (raw, options) => { const url = new URL(String(raw));
      if (url.pathname === '/v9/projects/prj_Api') return Response.json({ id: 'prj_Api', accountId: 'team_Cuevo' });
      if (url.pathname === '/v10/projects/prj_Api/env') { if (options?.method === 'POST') { posts++; throw Error('private uncertain provider acknowledgement'); } return Response.json({ envs: mode === 'existing' ? [{ id: 'env_existing', key: 'DATABASE_URL', target: ['preview'] }] : [] }); }
      if (url.pathname.endsWith('/functions')) return Response.json(mode === 'existing-edge' ? [{ slug: 'cuevo-worker' }] : []);
      if (url.pathname.endsWith('/secrets')) return Response.json(mode === 'existing-secrets' ? [{ name: 'CUEVO_WORKER_WAKE_KEY', value: 'foreign' }] : []);
      throw Error('No provider upload is permitted');
    };
    try { const value = { ...input, operator, vercelToken: 'private-vercel-token-provider-fixture', providerToken: 'private-supabase-token-provider-fixture' }, first = await deployBackendProviders(value); assert.equal(first.status, 'REQUIRES_REVIEW'); assert.equal(first.api, null); assert.equal(first.edge, null); assert.equal(posts, mode === 'unknown' ? 1 : 0); if (mode === 'unknown') { assert.equal((await deployBackendProviders(value)).status, 'REQUIRES_REVIEW'); assert.equal(posts, 1); } } finally { globalThis.fetch = originalFetch; }
  });
});

test('confirmed phases and lost settings acknowledgements survive a fresh runner without duplicate effects; unknown uploads refuse', async () => {
  const { deployBackendProviders } = await api();
  for (const recovery of ['confirmed', 'environment-intent', 'secrets-intent', 'api-intent', 'edge-intent', 'changed-source', 'next-source'])
  await fixture(async input => {
    await mkdir(join(input.repoRoot, '.local/hosted-release'), { recursive: true });
    const recipients = runtime(), apiEnvs = Object.entries(recipients.api).map(([key, value]) => ({ id: 'env_' + key, key, value, type: 'encrypted', target: ['preview'], comment: 'Cuevo source-bound synthetic runtime ' + sha }));
    const savedIdentity = { sourceSha: sha, treeSha: 'b'.repeat(40), apiArtifactSha256: input.expected.fingerprints.apiArtifactSha256, edgeArtifactSha256: input.expected.fingerprints.edgeArtifactSha256, denoLockSha256: input.expected.fingerprints.denoLockSha256, runtimeSha256: hash(canonicalReleaseReviewJson(recipients)), teamId: 'team_Cuevo', projectId: 'prj_Api', originalRunId: '50', originalRunAttempt: 1, originalPackageSha256: 'b'.repeat(64) };
    journal = { version: 1, purpose: 'CUEVO_PRIVATE_PROVIDER_DEPLOYMENT_STATE', projectRef: ref, operations: [{ identity: savedIdentity, phases: [
      { name: 'API_ENVIRONMENT', state: 'CONFIRMED', receipt: { kind: 'API_ENVIRONMENT', keysSha256: hash(canonicalReleaseReviewJson(Object.keys(recipients.api).sort())), valuesSha256: hash(canonicalReleaseReviewJson(recipients.api)), variables: apiEnvs.map(row => ({ key: row.key, id: row.id, valueSha256: hash(row.value) })).sort((a, b) => a.key.localeCompare(b.key)) } },
      { name: 'API_DEPLOYMENT', state: 'CONFIRMED', receipt: { kind: 'API_DEPLOYMENT', deploymentId: 'dpl_exact', url: 'https://cuevo-api-fixture.vercel.app' } },
      { name: 'EDGE_SECRETS', state: 'CONFIRMED', receipt: { kind: 'EDGE_SECRETS', valuesSha256: hash(canonicalReleaseReviewJson(Object.fromEntries(Object.entries(recipients.edge).filter(([key]) => key !== 'SUPABASE_URL')))), variables: Object.entries(recipients.edge).filter(([key]) => key !== 'SUPABASE_URL').map(([name, value]) => ({ name, valueSha256: hash(value) })).sort((a, b) => a.name.localeCompare(b.name)) } },
      { name: 'EDGE_DEPLOYMENT', state: 'CONFIRMED', receipt: { kind: 'EDGE_DEPLOYMENT', id: 'edge-exact', version: 1 } },
    ] }] };
    const savedJournal = journal as ProviderDeploymentState;
    if (recovery.endsWith('-intent')) {
      const index = recovery === 'environment-intent' ? 0 : recovery === 'api-intent' ? 1 : recovery === 'secrets-intent' ? 2 : 3;
      savedJournal.operations[0].phases = savedJournal.operations[0].phases.slice(0, index + 1);
      savedJournal.operations[0].phases[index] = { name: savedJournal.operations[0].phases[index].name, state: 'INTENT', receipt: null };
    }
    if (recovery === 'changed-source') input.runtimeConfig = { ...recipients, sourceSha: 'c'.repeat(40) };
    if (recovery === 'next-source') { input.expected.releaseSha = 'c'.repeat(40); input.expected.treeSha = 'd'.repeat(40); input.runtimeConfig = { ...recipients, sourceSha: input.expected.releaseSha }; }
    const original = globalThis.fetch; let posts = 0, settingsPosts = 0, deployPosts = 0, secretsPresent = recovery !== 'environment-intent';
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw)); if (options?.method === 'POST') posts++;
      if (url.pathname === '/v9/projects/prj_Api') return Response.json({ id: 'prj_Api', accountId: 'team_Cuevo' });
      if (url.pathname === '/v10/projects/prj_Api/env') {
        if (options?.method === 'POST') { assert.equal(url.searchParams.get('upsert'), 'true'); settingsPosts++; const updated = JSON.parse(String(options.body)); for (const row of apiEnvs) row.comment = updated.find((next: {key:string}) => next.key === row.key).comment; return Response.json({ failed: [] }); }
        return Response.json({ envs: apiEnvs });
      }
      if (url.pathname.startsWith('/v13/deployments/')) return Response.json({ id: 'dpl_exact', projectId: 'prj_Api', ownerId: 'team_Cuevo', url: 'cuevo-api-fixture.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: input.expected.releaseSha, cuevoArtifactSha256: savedIdentity.apiArtifactSha256, cuevoProviderOperation: hash(canonicalReleaseReviewJson((journal as ProviderDeploymentState).operations.at(-1)!.identity)) } });
      if (url.pathname.endsWith('/secrets')) { if (options?.method === 'POST') { settingsPosts++; secretsPresent = true; return new Response(null, { status: 201 }); } return Response.json(secretsPresent ? Object.entries(recipients.edge).filter(([key]) => key !== 'SUPABASE_URL').map(([name, value]) => ({ name, value: hash(value) })) : []); }
      if (url.pathname.endsWith('/functions')) return Response.json(recovery === 'next-source' ? [{ id: 'edge-exact', slug: 'cuevo-worker', version: 1 }] : []);
      if (url.pathname.endsWith('/functions/deploy')) { deployPosts++; return Response.json({ id: 'edge-exact', slug: 'cuevo-worker', status: 'ACTIVE', version: recovery === 'next-source' ? 2 : 1, verify_jwt: false }); }
      if (url.pathname.endsWith('/functions/cuevo-worker')) return Response.json({ id: 'edge-exact', slug: 'cuevo-worker', status: 'ACTIVE', version: recovery === 'next-source' ? 2 : 1, verify_jwt: false });
      if (url.origin === 'https://cuevo-api-fixture.vercel.app') return Response.json({ status: 'ok', service: 'cuevo-api' });
      if (url.origin === `https://${ref}.supabase.co`) return Response.json({ code: 'WORKER_AUTH_REQUIRED' }, { status: 401 });
      throw Error('Unexpected reconciliation request');
    };
    try {
      const result = await deployBackendProviders({ ...input, operator, vercelToken: 'private-vercel-token-provider-fixture', providerToken: 'private-supabase-token-provider-fixture' });
      const refused = ['api-intent', 'edge-intent', 'changed-source'].includes(recovery);
      assert.equal(result.status, refused ? 'REQUIRES_REVIEW' : 'DEPLOYED_INACTIVE', recovery + ': ' + String(fixtureState().failure?.stack));
      assert.equal(settingsPosts, recovery === 'next-source' ? 2 : recovery === 'environment-intent' ? 1 : 0, 'confirmed/reconciled settings never write again');
      assert.equal(deployPosts, ['environment-intent', 'secrets-intent', 'next-source'].includes(recovery) ? 1 : 0, 'only previously unattempted Edge upload runs');
      if (recovery === 'confirmed') assert.equal(posts, 1, 'only unsigned denial probe posts');
      if (refused) assert.equal(posts, 0, 'unknown uploads or changed runtime never mutate');
    }
    finally { globalThis.fetch = original; }
  });
});

test('missing native operator and unconfirmed durable intent cannot send provider mutation', async () => {
  const { deployBackendProviders } = await api();
  for (const mode of ['missing-operator', 'journal-failed']) await fixture(async input => {
    const original = globalThis.fetch; let posts = 0;
    globalThis.fetch = async (raw, options) => {
      if (options?.method === 'POST') posts++;
      const url = new URL(String(raw));
      if (url.pathname === '/v9/projects/prj_Api') return Response.json({ id: 'prj_Api', accountId: 'team_Cuevo' });
      if (url.pathname === '/v10/projects/prj_Api/env') return Response.json({ envs: [] });
      throw Error('No provider write permitted');
    };
    journalFailure = mode === 'journal-failed';
    try {
      const value = { ...input, vercelToken: 'private-vercel-token-provider-fixture', providerToken: 'private-supabase-token-provider-fixture', ...(mode === 'missing-operator' ? {} : { operator }) };
      assert.equal((await deployBackendProviders(value as never)).status, 'REQUIRES_REVIEW'); assert.equal(posts, 0);
    } finally { globalThis.fetch = original; }
  });
});

test('active unknown or scheduled native dispatch posture refuses provider changes before durable intent',async()=>{
 const {deployBackendProviders}=await api();
 for(const observed of ['active','unknown','cron'])await fixture(async input=>{
  posture=observed;const original=globalThis.fetch;let posts=0;
  globalThis.fetch=async(raw,options)=>{if(options?.method==='POST')posts++;const url=new URL(String(raw));if(url.pathname==='/v9/projects/prj_Api')return Response.json({id:'prj_Api',accountId:'team_Cuevo'});if(url.pathname==='/v10/projects/prj_Api/env')return Response.json({envs:[]});if(url.pathname.endsWith('/functions')||url.pathname.endsWith('/secrets'))return Response.json([]);throw Error('No provider effect permitted');};
  try{const result=await deployBackendProviders({...input,operator,vercelToken:'private-vercel-token-provider-fixture',providerToken:'private-supabase-token-provider-fixture'});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(posts,0);assert.equal(journal,null);}finally{globalThis.fetch=original;}
 });
});

test('native posture drift after initial admission refuses the first provider setting',async()=>{
 const {deployBackendProviders}=await api();await fixture(async input=>{
  activateAfter=3;const original=globalThis.fetch;let posts=0;
  globalThis.fetch=async(raw,options)=>{if(options?.method==='POST')posts++;const url=new URL(String(raw));if(url.pathname==='/v9/projects/prj_Api')return Response.json({id:'prj_Api',accountId:'team_Cuevo'});if(url.pathname==='/v10/projects/prj_Api/env')return Response.json({envs:[]});if(url.pathname.endsWith('/functions')||url.pathname.endsWith('/secrets'))return Response.json([]);throw Error('No provider effect permitted');};
  try{const result=await deployBackendProviders({...input,operator,vercelToken:'private-vercel-token-provider-fixture',providerToken:'private-supabase-token-provider-fixture'});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(posts,0);assert.ok(postureReads>=3);}finally{globalThis.fetch=original;}
 });
});
