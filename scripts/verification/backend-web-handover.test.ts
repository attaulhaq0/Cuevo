import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from './release-review';
import { prepareBackendReleaseIntent } from './backend-release-contracts';
import { planHostedMigrations, canonicalHostedMigrationPlan, readCanonicalMigrationSources } from '../database/hosted-migration-plan';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { canonicalReleaseReviewJson } from './release-review';
let admissions = 0;
Object.assign(globalThis, { handoverFixtureAdmission: async () => { admissions++; return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' }; }, handoverFixtureSources: [{ name: '20261001000000_fixture.sql', bytes: Buffer.from('select 1;') }] });
registerHooks({ load(url, context, next) { if (url.endsWith('/backend-web-handover.ts')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace("import { readBackendReleaseAdmission } from './backend-release-admission';", 'const readBackendReleaseAdmission=globalThis.handoverFixtureAdmission;').replace("import { canonicalHostedMigrationPlan, readCanonicalMigrationSources, type HostedMigrationPlanV1 } from '../database/hosted-migration-plan';", "import {canonicalHostedMigrationPlan} from '../database/hosted-migration-plan';const readCanonicalMigrationSources=()=>({sources:globalThis.handoverFixtureSources});").replace('now: Date.now() });', 'now: Date.parse("2026-10-06T12:05:00Z") });'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const subject = await import('./backend-web-handover').catch(() => ({})) as typeof import('./backend-web-handover');
const digest = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const sha = 'a'.repeat(40), projectRef = 'mqxdjvsyckzocokuikmx', at = '2026-10-06T12:00:00Z', now = Date.parse('2026-10-06T12:05:00Z');
const binding = { repository: 'attaulhaq0/Cuevo', sourceSha: sha, ciRunId: '31', runId: '51', runAttempt: 1, packageSha256: 'b'.repeat(64), runtimeSha256: 'c'.repeat(64), apiDeploymentId: 'dpl_Api', apiDeploymentUrl: 'https://cuevo-api-deployment.vercel.app', apiOrigin: 'https://cuevo-api.vercel.app', apiProjectId: 'prj_Api', teamId: 'team_Cuevo', webProjectId: 'prj_Web', webOrigin: 'https://cuevo-beta.vercel.app', projectRef, edgeId: 'edge-fixture', edgeVersion: 1, apiArtifactSha256: 'd'.repeat(64), edgeArtifactSha256: 'e'.repeat(64), denoLockSha256: 'f'.repeat(64), supabasePublishableKey: 'sb_publishable_controlled_public_key', migrations: [{ version: '20261001000000', sha256: '1'.repeat(64) }] };
function fixtures() {
  const identity = { sourceSha: sha, projectRef, runId: '51', runAttempt: 1, packageSha256: binding.packageSha256, runtimeSha256: binding.runtimeSha256, apiDeploymentId: binding.apiDeploymentId };
  const privateIdentity = digest({ purpose: 'PRE_ACTIVATION', sourceSha: sha, projectRef, apiDeployment: { url: binding.apiDeploymentUrl, id: binding.apiDeploymentId }, runtimeSha256: binding.runtimeSha256 });
  const activation = { ...identity, purpose: 'CUEVO_HOSTED_WORKER_ACTIVATION', status: 'ACTIVATED_SIGNED_SOURCE_VERIFIED', phase: 'FINAL', observedAt: at, sourceProcessed: true, duplicateWakeDenied: true, originalCommandReplayed: true, recoveryScheduled: true, scheduledRecoveryVerified: true, recoveryVerified: false, configurationEvidenceObservedManual: true, sessionsClosed: true, keyOperation: 'CONFIRMED', dispatchOperation: 'CONFIRMED', edgeVersion: 1, hostedAcceptance: false, canonicalReceipt: null };
  return {
    provider: { status: 'DEPLOYED_INACTIVE', purpose: 'CUEVO_BACKEND_PROVIDER_DEPLOYMENT', mutation: 'ATTEMPTED', hostedAcceptance: false, api: { deploymentId: binding.apiDeploymentId, url: binding.apiDeploymentUrl, artifactSha256: binding.apiArtifactSha256, metadataVerified: true, healthVerified: true }, edge: { id: binding.edgeId, version: 1, artifactSha256: binding.edgeArtifactSha256, denoLockSha256: binding.denoLockSha256, customAuthenticationVerified: true, state: 'INACTIVE' } },
    prerequisites: { status: 'PREREQUISITES_OBSERVED', apiReady: true, roleSessions: 5, crossSchoolDenied: true, dataApi: { anonymousRestDenied: true, authenticatedRestDenied: true, serviceRestDenied: true, graphqlDenied: true, rpcDenied: true }, worker: { missingSignatureDenied: true, malformedSignatureDenied: true, staleSignatureDenied: true } },
    privateIntent: { purpose: 'PRE_ACTIVATION', identitySha256: privateIdentity, createdAt: at },
    privateProof: { identitySha256: privateIdentity, createdAt: at, verifiedAt: at, result: { status: 'PRIVATE_PROBES_CONFIRMED', freshProof: true, restrictedDatabaseGrants: true, privateStorage: true, privateRealtime: true, storageProbe: { assetId: '93000000-0000-4000-8000-000000000001', objectPath: 'school/actor/asset', retired: true, removed: true }, realtimeProbe: { roomId: '93000000-0000-4000-8000-000000000002', closed: true }, sessionsClosed: true, activationAllowed: false, hostedAcceptance: false } },
    configuration: { sourceSha: sha, projectRef, dataApi: 'DISABLED', observer: 'Authenticated operator', status: 'OBSERVED_PROVIDER_UI', visibleText: 'Data API is disabled', observedAt: at, source: 'https://supabase.com/dashboard/project/' + projectRef + '/integrations/data_api/settings' },
    activation, activationCleanup: { purpose: 'CUEVO_HOSTED_WORKER_ACTIVATION_CLEANUP', sourceSha: sha, projectRef, runId: '51', runAttempt: 1, status: activation.status, lockReleased: true, sessionsClosed: true, resultSha256: digest(activation), observedAt: at },
    fullRecovery: { ...identity, observedAt: at, purpose: 'CUEVO_HOSTED_WORKER_FAULT_RECOVERY', evidence: 'NATIVE_HOSTED_OWNER', producerPath: 'scripts/verification/backend-hosted-fault-recovery-native.ts', producerSha256: '2'.repeat(64), edgeVersion: 1, status: 'FAULT_RECOVERY_VERIFIED', basis: 'ORIGINAL_WORKER_LEASE_RETRY_REVIEW_BACKOFF', expiredLeaseRecoveryVerified: true, eventRetryVerified: true, dispatchBackoffVerified: true, originalKey: 'source-bound-fault', eventIds: ['93000000-0000-4000-8000-000000000003'], faultInjectionBasis: 'EXACT_SYNTHETIC_REQUESTED_GENERATION', ownedControlVerified: true, sessionsClosed: true, lockReleased: true, dispatchDisabledOnFailure: null, cleanupStatus: 'RELEASED', hostedAcceptance: false, canonicalReceipt: null },
    databaseRestore: { ...identity, observedAt: at, purpose: 'CUEVO_HOSTED_DATABASE_RESTORE', evidence: 'NATIVE_HOSTED_OWNER', producer: { path: 'scripts/verification/backend-hosted-database-restore.ts', sha256: '3'.repeat(64) }, status: 'VERIFIED', backupVerified: true, restoredDatabaseVerified: true, restoredRestrictedGrantsVerified: true, restoredRlsVerified: true, restoredAuthVerified: true, restoredPrivateStorageVerified: true, recoveryVerified: true, cleanupConfirmed: true, hostedAcceptance: false, archiveSha256: '4'.repeat(64), catalogueSha256: '5'.repeat(64), fingerprints: [{ table: 'app.people', rows: 133, sha256: '6'.repeat(64) }], scratchImage: 'public.ecr.aws/supabase/postgres@sha256:' + '7'.repeat(64), operationalExclusions: ['pg_cron/cron', 'pg_net/net'], sourceSnapshot: 'native-snapshot', assetId: '93000000-0000-4000-8000-000000000005', assetRetired: true, assetRemoved: true, sessionsClosed: true, lockReleased: true, limitations: ['Bounded isolated database/session and owned private byte restore; not managed provider disaster/PITR/OAuth/SMTP/JWT configuration restore.'], canonicalReceipt: null },
  };
}
function completeFixtures() {
  const rows = fixtures();
  const provisional = { ...rows.fullRecovery, lockReleased: false };
  return { ...rows, fullRecoveryProvisional: provisional, fullRecoveryCleanup: { purpose: 'CUEVO_HOSTED_WORKER_FAULT_RECOVERY_CLEANUP', sourceSha: sha, projectRef, runId: '51', runAttempt: 1, status: rows.fullRecovery.status, sessionsClosed: true, lockReleased: true, cleanupStatus: 'RELEASED', provisionalSha256: digest(provisional), resultSha256: digest(rows.fullRecovery), observedAt: at }, databaseRestoreCleanup: { purpose: 'CUEVO_HOSTED_DATABASE_RESTORE_CLEANUP', sourceSha: sha, projectRef, runId: '51', runAttempt: 1, status: rows.databaseRestore.status, cleanupConfirmed: true, sessionsClosed: true, lockReleased: true, assetRetired: true, assetRemoved: true, resultSha256: digest(rows.databaseRestore), observedAt: at } };
}

test('missing native full recovery or database restore never promotes scheduled recovery to release evidence', () => {
  assert.equal(typeof subject.validateBackendWebHandoverReceipts, 'function');
  const receipts = completeFixtures();
  const result = subject.validateBackendWebHandoverReceipts({ ...receipts, fullRecovery: null, databaseRestore: null }, binding, now);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.manifest, null);
  assert.deepEqual(result.pendingGates, ['FULL_WORKER_RECOVERY', 'DATABASE_BACKUP_RESTORE']);
  assert.equal(result.hostedAcceptance, false); assert.equal(result.activationAllowed, false);
});

test('complete controlled receipt contracts produce only the strict staging manifest and public configuration', () => {
  const result = subject.validateBackendWebHandoverReceipts(completeFixtures(), binding, now);
  assert.equal(result.status, 'READY_FOR_FRONTEND_REVIEW'); assert.deepEqual(result.pendingGates, []);
  assert.equal(result.manifest?.database.recoveryVerified, true); assert.equal(result.manifest?.worker.queueRecoveryVerified, true);
  assert.equal(result.manifest?.publicConfig.apiUrl, binding.apiOrigin);
  assert.equal(result.manifest?.api.deploymentUrl, binding.apiDeploymentUrl);
  assert.equal(result.manifest?.approval.reviewer, 'attaulhaq0');
  assert.ok('restorationLimitations' in result && result.restorationLimitations.some(value => value.includes('not managed provider disaster')));
  const later = subject.validateBackendWebHandoverReceipts(completeFixtures(), binding, now + 60000);
  assert.equal(later.manifest?.verifiedAt, at);
  assert.equal(canonicalReleaseReviewJson(later.manifest), canonicalReleaseReviewJson(result.manifest), 'Fresh admission never refreshes a persisted proof timestamp');
  assert.doesNotMatch(JSON.stringify(result), /password|secret_|operatorDatabase/);
});

test('stale private flags wrong cleanup identity and incomplete fault evidence refuse final manifest', () => {
  for (const change of ['private-stale', 'cleanup-hash', 'fault-cleanup', 'fault-provisional', 'fault-lease', 'restore-auth', 'configuration-clock', 'activation-project', 'private-after-activation']) {
    const rows = completeFixtures();
    if (change === 'private-stale') rows.privateProof.result.freshProof = false;
    if (change === 'cleanup-hash') rows.activationCleanup.resultSha256 = '0'.repeat(64);
    if (change === 'fault-cleanup') rows.fullRecoveryCleanup.resultSha256 = '0'.repeat(64);
    if (change === 'fault-provisional') rows.fullRecoveryProvisional.originalKey = 'other-source';
    if (change === 'fault-lease') rows.fullRecovery.expiredLeaseRecoveryVerified = false;
    if (change === 'restore-auth') rows.databaseRestore.restoredAuthVerified = false;
    if (change === 'configuration-clock') rows.configuration.observedAt = '2026-10-04T12:00:00Z';
    if (change === 'activation-project') rows.activation.projectRef = 'abcdefghijklmnopqrst';
    if (change === 'private-after-activation') rows.privateProof.verifiedAt = '2026-10-06T12:01:00Z';
    const result = subject.validateBackendWebHandoverReceipts(rows, binding, now);
    assert.equal(result.status, 'REQUIRES_REVIEW', change); assert.equal(result.manifest, null, change);
  }
});

test('future native-producer metadata cannot contain unknown credential or authority fields', () => {
  const rows = completeFixtures();
  const result = subject.validateBackendWebHandoverReceipts({ ...rows, databaseRestore: { ...rows.databaseRestore, operatorPassword: 'private-canary' } }, binding, now);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.ok(result.pendingGates.includes('DATABASE_BACKUP_RESTORE'));
  assert.doesNotMatch(JSON.stringify(result), /private-canary/);
});

test('the current scheduled-only result cannot substitute for a native full-fault producer receipt', () => {
  const rows = completeFixtures();
  const result = subject.validateBackendWebHandoverReceipts({ ...rows, fullRecovery: { status: 'SCHEDULED_RECOVERY_VERIFIED', scheduledRecoveryVerified: true, eventRetryVerified: false, expiredLeaseRecoveryVerified: false, dispatchBackoffVerified: false, hostedAcceptance: false } }, binding, now);
  assert.ok(result.pendingGates.includes('FULL_WORKER_RECOVERY')); assert.equal(result.manifest, null);
});

test('re-admitted handover outputs reuse only the exact complete pair and retain conflicts without rewriting', async () => {
  const source = readFileSync(resolve(import.meta.dirname, 'backend-web-handover.ts'), 'utf8'), start = source.indexOf('async function file('), end = source.indexOf('export type BackendWebHandoverResult', start);
  const code = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code;
  const root = await mkdtemp(join(tmpdir(), 'cuevo-handover-output-')), directory = join(root, '.local/hosted-release'); await mkdir(directory, { recursive: true });
  const fs = await import('node:fs/promises');
  const invoke = (manifest: unknown, config: unknown) => runInNewContext(code + ';persistHandoverOutputs(root,manifest,config)', { ...fs, join, relative, isAbsolute, resolve, Buffer, canonicalReleaseReviewJson, hash: (value: string) => createHash('sha256').update(value).digest('hex'), fail: () => Error('Review required'), root, manifest, config });
  try {
    const manifest = { version: 2, value: 'source-bound' }, config = { apiUrl: binding.apiOrigin };
    const first = await invoke(manifest, config), manifestPath = join(directory, 'web-handover-manifest.json'), publicPath = join(directory, 'web-handover-public.json');
    const before = await readFile(manifestPath), publicBefore = await readFile(publicPath);
    const second = await invoke(manifest, config); assert.equal(second.manifestSha256, first.manifestSha256); assert.ok((await readFile(manifestPath)).equals(before));
    await writeFile(publicPath, canonicalReleaseReviewJson({ apiUrl: 'https://wrong.example' }));
    await assert.rejects(invoke(manifest, config)); assert.ok((await readFile(manifestPath)).equals(before));
    await rm(publicPath); await assert.rejects(invoke(manifest, config)); assert.ok((await readFile(manifestPath)).equals(before));
    await writeFile(publicPath, publicBefore); await invoke(manifest, config);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native collection reports missing backend receipts without creating a manifest or making provider calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-handover-')), previous = globalThis.fetch; admissions = 0; let network = 0;
  try {
    globalThis.fetch = async () => { network++; throw Error('No provider request may run without deployment receipt'); };
    const source = { sha, tree: '4'.repeat(40) }, target = { projectRef, boundProjectRef: projectRef, projectName: 'cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY', observedAt: at };
    const realRoot = resolve(import.meta.dirname, '../..'), currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: realRoot, encoding: 'utf8' }).trim(), currentTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: realRoot, encoding: 'utf8' }).trim();
    const sources = readCanonicalMigrationSources({ repoRoot: realRoot, sourceSha: currentSha, treeSha: currentTree }).sources;
    Object.assign(globalThis, { handoverFixtureSources: sources });
    const plan = planHostedMigrations({ sources, source, target, now }), migration = canonicalHostedMigrationPlan(plan);
    const targets = { web: { teamId: binding.teamId, projectId: binding.webProjectId, origin: binding.webOrigin, target: 'preview' }, api: { teamId: binding.teamId, projectId: binding.apiProjectId, origin: binding.apiOrigin, target: 'preview' }, supabase: { projectRef, authOrigin: 'https://' + projectRef + '.supabase.co', edgeOrigin: 'https://' + projectRef + '.supabase.co/functions/v1/cuevo-worker' } };
    const fingerprints = { sourceManifestSha256: '1'.repeat(64), diffSha256: '2'.repeat(64), migrationPlanSha256: migration.sha256, migrationHistorySha256: '3'.repeat(64), migrationToolchainSha256: '4'.repeat(64), migrationEndpointSha256: digest({ endpoint: 'controlled' }), operatorStoragePolicySha256: '5'.repeat(64), apiArtifactSha256: binding.apiArtifactSha256, edgeArtifactSha256: binding.edgeArtifactSha256, denoLockSha256: binding.denoLockSha256 };
    const reviews = [{ category: 'source-spec-code', taskId: 'source', reportSha256: '6'.repeat(64), evidenceSha256: '7'.repeat(64) }, { category: 'qa-regression-operations', taskId: 'qa', reportSha256: '8'.repeat(64), evidenceSha256: '9'.repeat(64) }];
    const identity = { repository: binding.repository, releaseSha: sha, treeSha: source.tree, baseSha: '5'.repeat(40), ciRunId: '31', releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: 'staging', deploymentEnvironment: 'synthetic-staging' };
    const expected = { ...identity, targets, fingerprints, reviews, now, currentMainSha: sha, ciRun: { id: 31, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: binding.repository } }, backendRun: { id: 51, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress', conclusion: null, path: '.github/workflows/backend-release.yml', repository: { full_name: binding.repository } } };
    const prepared = prepareBackendReleaseIntent({ ...identity, targets, fingerprints, version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', preparedAt: at, expiresAt: '2026-10-07T12:00:00Z', reviews: reviews.map(row => ({ ...row, releaseSha: sha, treeSha: source.tree, baseSha: identity.baseSha, sourceManifestSha256: fingerprints.sourceManifestSha256, diffSha256: fingerprints.diffSha256, reviewedAt: at })) }, expected);
    const bundle = { version: 1, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected, preparedApproval: prepared, plan, migrationEndpoint: { endpoint: 'controlled' }, stages: [{}, {}, {}, {}], toolchainManifestPath: 'fixture', operatorStoragePolicyPath: 'fixture', artifacts: { apiRoot: 'fixture', edgeRoot: 'fixture' } };
    const directory = join(root, '.local/hosted-release'); await mkdir(directory, { recursive: true });
    const text = canonicalReleaseExecutionJson(bundle); await writeFile(join(directory, 'backend-bundle.json'), text);
    const result = await subject.prepareBackendWebHandover({ repoRoot: root, bundleSha256: createHash('sha256').update(text).digest('hex'), githubToken: 'controlled-gh', vercelToken: 'controlled-vercel-token' });
    assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.manifestPath, null); assert.equal(network, 0);
    assert.ok(result.pendingGates.includes('RUNTIME_CONFIGURATION')); assert.ok(result.pendingGates.includes('FULL_WORKER_RECOVERY')); assert.ok(result.pendingGates.includes('DATABASE_BACKUP_RESTORE'));
    assert.equal(admissions, 1); await assert.rejects(access(join(directory, 'web-handover-manifest.json')));
    const common = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: projectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: binding.webOrigin, SUPABASE_URL: targets.supabase.authOrigin, POSTHOG_CAPTURE_MODE: 'DISABLED' };
    const runtime = { version: 1, purpose: 'CUEVO_HOSTED_RUNTIME_CONFIGURATION', sourceSha: sha, projectRef, webOrigin: binding.webOrigin, api: { ...common, DATABASE_URL: 'postgresql://cuevo_api:controlled-api@db.' + projectRef + '.supabase.co:5432/postgres', CUEVO_DATABASE_TLS_CA: '-----BEGIN CERTIFICATE-----\ncontrolled\n-----END CERTIFICATE-----', SUPABASE_PUBLISHABLE_KEY: binding.supabasePublishableKey, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_controlled_local_fixture', API_ALLOWED_ORIGIN: binding.webOrigin, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, edge: { ...common, CUEVO_WORKER_DATABASE_URL: 'postgresql://cuevo_worker:controlled-worker@db.' + projectRef + '.supabase.co:5432/postgres', CUEVO_WORKER_TLS_CA: '-----BEGIN CERTIFICATE-----\ncontrolled\n-----END CERTIFICATE-----', CUEVO_WORKER_EXECUTION_MODE: 'synthetic-staging', CUEVO_WORKER_WAKE_KEY: '' } };
    await writeFile(join(directory, 'runtime-private.json'), canonicalReleaseExecutionJson(runtime));
    await writeFile(join(directory, 'provider-result.json'), JSON.stringify(completeFixtures().provider) + '\n');
    globalThis.fetch = async (raw, options) => {
      network++; assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
      const url = new URL(String(raw));
      if (url.pathname.endsWith('/domains')) { const api = url.pathname.includes(binding.apiProjectId); return Response.json({ domains: [{ name: new URL(api ? binding.apiOrigin : binding.webOrigin).hostname, projectId: api ? binding.apiProjectId : binding.webProjectId, verified: true }], pagination: { next: null } }); }
      if (url.pathname.startsWith('/v9/projects/')) { const api = url.pathname.includes(binding.apiProjectId); return Response.json({ id: api ? binding.apiProjectId : binding.webProjectId, accountId: binding.teamId, rootDirectory: api ? null : 'apps/web' }); }
      if (url.pathname.endsWith('/aliases')) return Response.json({ aliases: [{ alias: 'wrong-project-alias.vercel.app' }], pagination: { next: null } });
      return Response.json({ id: binding.apiDeploymentId, projectId: binding.apiProjectId, ownerId: binding.teamId, url: new URL(binding.apiDeploymentUrl).hostname, readyState: 'READY', target: null, meta: { cuevoCommitSha: sha } });
    };
    const changedAlias = await subject.prepareBackendWebHandover({ repoRoot: root, bundleSha256: createHash('sha256').update(text).digest('hex'), githubToken: 'controlled-gh', vercelToken: 'controlled-vercel-token' });
    assert.equal(changedAlias.status, 'REQUIRES_REVIEW'); assert.ok(changedAlias.pendingGates.includes('CURRENT_PROJECT_ORIGIN_AND_DEPLOYMENT'));
    assert.ok(network > 0); assert.equal(changedAlias.manifestPath, null);
  } finally { globalThis.fetch = previous; await rm(root, { recursive: true, force: true }); }
});
