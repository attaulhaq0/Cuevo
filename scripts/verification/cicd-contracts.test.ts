import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateWorkflows, safeEvidence, validateCiRun, validateReleaseManifest, vercelTarget, validateVercelDeployment } from './cicd-contracts';

const sha = 'a'.repeat(40); const digest = 'b'.repeat(64); const now = Date.parse('2026-10-02T12:00:00Z');
const manifest = () => ({
  version: 1, environment: 'staging', commitSha: sha, ciRunId: '42', verifiedAt: '2026-10-02T11:00:00Z',
  api: { origin: 'https://api.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
  worker: { kind: 'container', origin: 'https://worker.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
  database: { projectRef: 'stageproject', migrations: [{ version: '20261002074258', sha256: digest }], grantsVerified: true, rlsVerified: true, privateStorageVerified: true, privateRealtimeVerified: true, recoveryVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
  approval: { reviewer: 'school-owner', basis: 'SYNTHETIC_STAGING', evidenceUrl: 'https://github.com/owner/repo/issues/3' },
  publicConfig: { apiUrl: 'https://api.stage.example.com', supabaseUrl: 'https://stageproject.supabase.co', supabasePublishableKey: 'sb_publishable_public-only-value' },
});
const context = { sha, environment: 'staging', ciRunId: '42', now, migrations: [{ version: '20261002074258', sha256: digest }] };
const edgeManifest = () => ({
  ...manifest(),
  worker: { kind: 'supabase-edge', commitSha: sha, projectRef: 'stageproject', functionName: 'cuevo-worker', artifactSha256: digest, denoLockSha256: 'd'.repeat(64), authVerified: true, queueRecoveryVerified: true, roleGrantsVerified: true, transportPrivateVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
});
const vercelApiManifest = () => ({
  ...edgeManifest(),
  api: { kind: 'vercel', origin: 'https://api.stage.example.com', commitSha: sha, projectId: 'prj_cuevoApi', teamId: 'team_cuevo', deploymentId: 'dpl_cuevoApi', deploymentUrl: 'https://cuevo-api-build.vercel.app', target: 'preview', artifactSha256: digest, metadataVerified: true, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
});

test('API admission names the Vercel runtime and verified deployment identity without inventing a container digest', () => {
  const value = vercelApiManifest(); const admitted = validateReleaseManifest(value, context);
  assert.deepEqual(admitted.api, value.api);
  assert.equal(Object.hasOwn(admitted.api, 'imageDigest'), false);
  assert.equal(validateReleaseManifest(manifest(), context).api.kind, 'container');
  for (const fields of [
    { kind: 'unknown' }, { imageDigest: `sha256:${digest}` }, { metadataVerified: false }, { healthVerified: false },
    { commitSha: 'c'.repeat(40) }, { projectId: 'not-a-project' }, { teamId: 'wrong-team' }, { deploymentId: 'wrong-deployment' },
    { artifactSha256: 'not-a-hash' }, { target: 'production' }, { deploymentUrl: 'https://other.example.com' },
  ]) assert.throws(() => validateReleaseManifest({ ...value, api: { ...value.api, ...fields } }, context));
  for (const field of ['metadataVerified', 'projectId', 'teamId', 'deploymentId', 'deploymentUrl', 'artifactSha256']) {
    const api: Record<string, unknown> = { ...value.api }; delete api[field];
    assert.throws(() => validateReleaseManifest({ ...value, api }, context));
  }
});

const bash = process.platform === 'win32' ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe'].find(existsSync) : '/bin/bash';
test('actual required-status Bash rejects every failed, cancelled or skipped required job', { skip: !bash }, async () => {
  const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): { jobs: { required: { steps: { run: string }[] } } } };
  const workflow = yaml.load(await readFile('.github/workflows/ci.yml', 'utf8'));
  const command = workflow.jobs.required.steps[0].run;
  const execute = (event: 'push' | 'pull_request', fields: Record<string, string> = {}) => {
    const result = spawnSync(bash!, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', command], {
      env: { ...process.env, BASH_ENV: '', FAST: 'success', TECHNICAL: 'success', CODEQL: 'success', DEPENDENCY: event === 'push' ? 'skipped' : 'success', GITHUB_EVENT_NAME: event, ...fields },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    return result.status;
  };
  assert.equal(execute('push'), 0); assert.equal(execute('pull_request'), 0);
  for (const event of ['push', 'pull_request'] as const) for (const job of ['FAST', 'TECHNICAL', 'CODEQL']) for (const state of ['failure', 'cancelled', 'skipped']) {
    assert.notEqual(execute(event, { [job]: state }), 0, `${event} ${job} ${state} must fail the required status`);
  }
  assert.notEqual(execute('pull_request', { DEPENDENCY: 'skipped' }), 0);
  assert.notEqual(execute('pull_request', { DEPENDENCY: 'failure' }), 0);
  assert.notEqual(execute('push', { DEPENDENCY: 'success' }), 0);
});

test('staging application environment uses supported Vercel preview consistently', () => {
  assert.equal(vercelTarget('staging'), 'preview'); assert.equal(vercelTarget('production'), 'production');
  assert.throws(() => vercelTarget('unapproved'));
});

test('raw Vercel deployment must match exact project, team, target, URL and SHA metadata', () => {
  const url = 'https://cuevo-build.vercel.app'; const expected = { sha, projectId: 'prj_cuevo', teamId: 'team_cuevo', target: 'preview', url };
  const deployment = { id: 'dpl_cuevo', projectId: 'prj_cuevo', ownerId: 'team_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: sha } };
  validateVercelDeployment(deployment, expected);
  for (const fields of [{ ownerId: 'team_other' }, { projectId: 'prj_other' }, { meta: { cuevoCommitSha: 'c'.repeat(40) } }, { meta: undefined }, { target: 'production' }, { readyState: 'BUILDING' }, { url: 'other.vercel.app' }]) {
    assert.throws(() => validateVercelDeployment({ ...deployment, ...fields }, expected));
  }
  // CLI inspect summary omits ownership/metadata and is not sufficient evidence.
  assert.throws(() => validateVercelDeployment({ id: 'dpl_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: 'preview' }, expected));
});

test('release admission requires exact verified commit, dependency images and complete migration/security evidence', () => {
  assert.equal(validateReleaseManifest(manifest(), context).apiUrl, 'https://api.stage.example.com');
  for (const mutate of [
    (m: ReturnType<typeof manifest>) => { m.api.commitSha = 'c'.repeat(40); },
    (m: ReturnType<typeof manifest>) => { m.worker.healthVerified = false; },
    (m: ReturnType<typeof manifest>) => { m.database.rlsVerified = false; },
    (m: ReturnType<typeof manifest>) => { m.database.migrations = []; },
    (m: ReturnType<typeof manifest>) => { m.publicConfig.apiUrl = 'https://other.example.com'; },
    (m: ReturnType<typeof manifest>) => { m.publicConfig.supabaseUrl = 'http://localhost:56321'; },
    (m: ReturnType<typeof manifest>) => { m.verifiedAt = '2026-09-30T12:00:00Z'; },
    (m: ReturnType<typeof manifest>) => { m.approval.basis = 'PRODUCTION_APPROVED'; },
  ]) { const value = manifest(); mutate(value); assert.throws(() => validateReleaseManifest(value, context)); }
  assert.throws(() => validateReleaseManifest({ ...manifest(), secrets: { token: 'not-public' } }, context));
  assert.throws(() => validateReleaseManifest(manifest(), { ...context, environment: 'production' }));
});

test('release admission preserves a container worker descriptor and its readiness origin', () => {
  const admitted = validateReleaseManifest(manifest(), context);
  assert.deepEqual(admitted.worker, manifest().worker);
  assert.equal(admitted.workerOrigin, 'https://worker.stage.example.com');
});

test('release admission accepts Edge attestations without inventing a container origin', () => {
  const admitted = validateReleaseManifest(edgeManifest(), context);
  assert.deepEqual(admitted.worker, edgeManifest().worker);
  assert.equal(Object.hasOwn(admitted, 'workerOrigin'), false);
});

test('release admission rejects a worker whose execution kind is missing or unknown', () => {
  const worker: Record<string, unknown> = { ...manifest().worker }; delete worker.kind;
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker }, context));
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker: { ...worker, kind: 'unknown' } }, context));
});

test('Edge admission requires every authentication, queue, role and transport proof', () => {
  for (const field of ['authVerified', 'queueRecoveryVerified', 'roleGrantsVerified', 'transportPrivateVerified'] as const) {
    const value = edgeManifest(); value.worker[field] = false;
    assert.throws(() => validateReleaseManifest(value, context), `${field}=false must fail`);
    const worker: Record<string, unknown> = { ...edgeManifest().worker }; delete worker[field];
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker }, context), `missing ${field} must fail`);
  }
});

test('Edge admission binds project, function, source and locked dependency identity', () => {
  for (const fields of [
    { projectRef: 'otherproject' }, { projectRef: 'stage-project' }, { commitSha: 'c'.repeat(40) }, { functionName: 'another-worker' },
    { artifactSha256: `sha256:${digest}` }, { artifactSha256: 'B'.repeat(64) }, { denoLockSha256: 'd'.repeat(63) }, { denoLockSha256: 'not-a-lock-hash' },
  ]) assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker: { ...edgeManifest().worker, ...fields } }, context));
  for (const field of ['artifactSha256', 'denoLockSha256', 'projectRef', 'functionName', 'evidenceUrl']) {
    const worker: Record<string, unknown> = { ...edgeManifest().worker }; delete worker[field];
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker }, context));
  }
});

test('worker admission rejects mixed container and Edge execution fields', () => {
  for (const fields of [{ origin: 'https://worker.stage.example.com' }, { imageDigest: `sha256:${digest}` }, { healthVerified: true }]) {
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker: { ...edgeManifest().worker, ...fields } }, context));
  }
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker: { ...manifest().worker, projectRef: 'stageproject' } }, context));
});

test('worker attestations expire after 24 hours and cannot be future dated', () => {
  for (const value of [manifest(), edgeManifest()]) {
    assert.doesNotThrow(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-01T12:00:00.000Z' }, context));
    assert.throws(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-01T11:59:59.999Z' }, context));
    assert.throws(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-02T12:00:00.001Z' }, context));
  }
});

const verifyRelease = async (value: ReturnType<typeof manifest> | ReturnType<typeof edgeManifest> | ReturnType<typeof vercelApiManifest>, options: { savedWorker?: Record<string, unknown>; savedApi?: Record<string, unknown>; verifyAt?: number; workerReady?: boolean; apiDeployment?: Record<string, unknown> } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-release-contract-'));
  try {
    const releaseDirectory = join(directory, '.local/cicd-release'); await mkdir(releaseDirectory, { recursive: true });
    const migrationDirectory = join(directory, 'supabase/migrations'); await mkdir(migrationDirectory, { recursive: true });
    const sql = '-- synthetic release contract migration\n';
    await writeFile(join(migrationDirectory, '20261002074258_contract.sql'), sql);
    value.database.migrations = [{ version: '20261002074258', sha256: createHash('sha256').update(sql).digest('hex') }];
    await writeFile(join(releaseDirectory, 'deployment.json'), JSON.stringify({ url: 'https://cuevo-build.vercel.app', commitSha: sha }));
    const script = (mode: 'manifest' | 'verify') => `
      process.argv[2] = '${mode}';
      Date.now = () => ${mode === 'manifest' ? now : options.verifyAt ?? now};
      globalThis.fetch = async input => {
        const url = String(input); console.log('FETCH ' + url);
        if (url === 'https://api.vercel.com/v13/deployments/cuevo-build.vercel.app?teamId=team_cuevo') return new Response(JSON.stringify({ id: 'dpl_cuevo', projectId: 'prj_cuevo', ownerId: 'team_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: '${sha}' } }));
        if (url === 'https://api.vercel.com/v13/deployments/dpl_cuevoApi?teamId=team_cuevo') return new Response(JSON.stringify({ id: 'dpl_cuevoApi', projectId: 'prj_cuevoApi', ownerId: 'team_cuevo', url: 'cuevo-api-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: '${sha}' }, ...${JSON.stringify(options.apiDeployment ?? {})} }));
        if (url === 'https://cuevo-build.vercel.app' || url === 'https://api.stage.example.com/health/ready') return new Response(null, { status: 200 });
        if (url === 'https://worker.stage.example.com/health/ready') return new Response(null, { status: ${options.workerReady === false ? 503 : 200} });
        throw Error('Unexpected network request');
      };
      await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/cicd-release.ts')).href)});
    `;
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, RELEASE_SHA: sha, RELEASE_ENVIRONMENT: 'staging', VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo', VERCEL_TOKEN: 'synthetic-verification-token' };
    const execute = (mode: 'manifest' | 'verify', extra: Record<string, string> = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, '--input-type=module', '--eval', script(mode)], { cwd: directory, env: { ...env, ...extra }, encoding: 'utf8', timeout: 20000 });
    const admission = execute('manifest', { CI_RUN_ID: '42', RELEASE_MANIFEST: JSON.stringify(value) });
    assert.equal(admission.error, undefined); assert.equal(admission.status, 0, admission.stderr);
    if (options.savedWorker || options.savedApi) {
      const path = join(releaseDirectory, 'public.json');
      const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      await writeFile(path, JSON.stringify({ ...receipt, ...(options.savedWorker ? { worker: options.savedWorker } : {}), ...(options.savedApi ? { api: options.savedApi } : {}) }));
    }
    // The actual workflow supplies neither manifest nor CI run ID again in its verify step.
    return execute('verify');
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()), 'release test cleanup must stay in the temporary directory');
    assert.ok(basename(directory).startsWith('cuevo-release-contract-'), 'release test cleanup requires its own directory prefix');
    await rm(directory, { recursive: true, force: true });
  }
};

test('release verify reads exact API deployment metadata and refuses changed host ownership or source before readiness', async () => {
  const passed = await verifyRelease(vercelApiManifest()); assert.equal(passed.status, 0, passed.stderr);
  assert.ok(passed.stdout.includes('FETCH https://api.vercel.com/v13/deployments/dpl_cuevoApi?teamId=team_cuevo'));
  for (const apiDeployment of [{ id: 'dpl_other' }, { projectId: 'prj_other' }, { ownerId: 'team_other' }, { meta: { cuevoCommitSha: 'c'.repeat(40) } }, { readyState: 'ERROR' }, { url: 'other-api.vercel.app' }, { target: 'production' }]) {
    const rejected = await verifyRelease(vercelApiManifest(), { apiDeployment }); assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout.includes('FETCH https://api.stage.example.com/health/ready'), false);
  }
  const modified = await verifyRelease(vercelApiManifest(), { savedApi: { ...vercelApiManifest().api, deploymentId: 'dpl_changed' } });
  assert.equal(modified.status, 1); assert.equal(modified.stdout.includes('FETCH '), false);
});

test('release verify fetches container readiness and refuses an unavailable worker', async () => {
  const ready = await verifyRelease(manifest()); assert.equal(ready.error, undefined); assert.equal(ready.status, 0, ready.stderr);
  assert.ok(ready.stdout.includes('FETCH https://worker.stage.example.com/health/ready'));
  const unavailable = await verifyRelease(manifest(), { workerReady: false }); assert.equal(unavailable.status, 1);
});

test('release verify consumes admitted Edge attestations without any worker request', async () => {
  const result = await verifyRelease(edgeManifest()); assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split(/\r?\n/).filter(line => line.startsWith('FETCH ')), [
    'FETCH https://api.vercel.com/v13/deployments/cuevo-build.vercel.app?teamId=team_cuevo',
    'FETCH https://cuevo-build.vercel.app', 'FETCH https://api.stage.example.com/health/ready',
  ]);
  assert.ok(result.stdout.includes('Edge worker security/queue evidence remains admitted attestations'));
});

test('release verify rejects expired Edge evidence or a modified admitted worker before network checks', async () => {
  const expired = await verifyRelease(edgeManifest(), { verifyAt: now + 86400000 }); assert.equal(expired.status, 1);
  assert.equal(expired.stdout.includes('FETCH '), false);
  for (const savedWorker of [{ ...edgeManifest().worker, kind: 'unknown' }, { ...edgeManifest().worker, authVerified: false }]) {
    const modified = await verifyRelease(edgeManifest(), { savedWorker }); assert.equal(modified.status, 1);
    assert.equal(modified.stdout.includes('FETCH '), false);
  }
});

test('successful CI proof is restricted to this repository main push, exact SHA and canonical workflow', () => {
  const run = { id: 42, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'owner/repo' } };
  validateCiRun(run, { sha, repository: 'owner/repo', ciRunId: '42' });
  for (const fields of [{ event: 'pull_request' }, { conclusion: 'failure' }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'fork/repo' } }]) {
    assert.throws(() => validateCiRun({ ...run, ...fields }, { sha, repository: 'owner/repo', ciRunId: '42' }));
  }
});

test('safe evidence exports only validated counts, statuses and hashes without source output or fixture secrets', () => {
  const result = safeEvidence({ status: 'FAILED', rows: [{ name: 'integration', exitCode: 1, required: true, durationMs: 1000, raw: 'secret', failure: 'private pupil answer' }] }, [{ path: 'apps/api/src/main.ts', sha256: digest }], { sha, runId: '42' });
  assert.deepEqual(result.rows, [{ name: 'integration', exitCode: 1, durationMs: 1000 }]);
  assert.equal(JSON.stringify(result).includes('private pupil'), false); assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.throws(() => safeEvidence({ status: 'VERIFIED', rows: [{ name: '../../.env.local', exitCode: 0, durationMs: 1 }] }, [], { sha, runId: '42' }));
  assert.throws(() => safeEvidence({ status: 'FAILED', rows: [{ name: 'private-password-value', exitCode: 1, durationMs: 1 }] }, [], { sha, runId: '42' }));
});

test('workflow guard consumes YAML structure and rejects changed deployment trust or unsafe artifact boundaries', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8'); const release = await readFile('.github/workflows/release.yml', 'utf8');
  assert.deepEqual(validateWorkflows(ci, release), []);
  assert.ok(validateWorkflows(ci.replace('chromium firefox webkit', 'chromium'), release).some(issue => issue.includes('engines')));
  assert.ok(validateWorkflows(ci.replace('timeout-minutes: 90', 'timeout-minutes: 30'), release).some(issue => issue.includes('budget')));
  assert.ok(validateWorkflows(ci.replace('path: .local/cicd-safe/', 'path: .local/'), release).some(issue => issue.includes('artifact')));
  assert.ok(validateWorkflows(ci, release.replace('cancel-in-progress: false', 'cancel-in-progress: true')).some(issue => issue.includes('release concurrency')));
  assert.ok(validateWorkflows(ci, release.replace("github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'")).some(issue => issue.includes('main')));
  assert.ok(validateWorkflows(ci.replace('on: [push, pull_request, workflow_dispatch]', 'on: [pull_request_target]'), release).some(issue => issue.includes('Privileged')));
  assert.ok(validateWorkflows(ci, release.replace('needs: release-admission', 'needs: other-job')).some(issue => issue.includes('admission')));
  assert.ok(validateWorkflows(ci, release.replace('name: ${{ inputs.environment }}', 'name: unprotected')).some(issue => issue.includes('environment')));
});
