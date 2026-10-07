import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backendWebTransferFixture, transferFixtureHash } from './backend-web-transfer-fixtures';
import { validateBackendWebTransfer, readBackendWebTransferFile, exportBackendWebTransfer, backendWebTransferProducerPaths, backendWebTransferEvidenceNames } from './backend-web-transfer';
import { canonicalReleaseExecutionJson } from './release-review';
import {prepareBackendReleaseIntent} from './backend-release-contracts';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';

test('completed backend transfer exports only a source-bound canonical public file', async () => {
  const api = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-web-transfer.ts')).href).catch(() => ({}));
  assert.equal(typeof api.exportBackendWebTransfer, 'function');
  assert.equal(typeof api.validateBackendWebTransfer, 'function');
});

test('original successful export retains its proof clocks after mutation expiry without granting a new operation', () => {
  const fixture = backendWebTransferFixture(), initial = validateBackendWebTransfer(fixture.transfer, fixture.now);
  const later = validateBackendWebTransfer(fixture.transfer, fixture.now + 2 * 3600000);
  assert.equal(later.transfer.exportedAt, initial.transfer.exportedAt);
  assert.equal(later.transfer.privateProofReexecuted, false);
  assert.equal(later.transfer.backendMutationAllowed, false);
  assert.equal(later.transfer.customerReady, false);
  assert.throws(() => validateBackendWebTransfer(fixture.transfer, fixture.now + 86400000));
});
test('active completed transfer keeps original activation identity but consumes only fresh continuation evidence clocks',()=>{
 const f=backendWebTransferFixture(),body=JSON.parse(f.transfer.preparedApproval.canonicalJson),installedRuntime={version:1,purpose:'CUEVO_INSTALLED_ACTIVE_RUNTIME',sourceSha:body.releaseSha,treeSha:body.treeSha,originalRunId:'11',originalRunAttempt:1,originalPackageSha256:'a'.repeat(64),runtimeSha256:'b'.repeat(64),apiDeploymentId:'dpl_Api',apiUrl:'https://cuevo-api-deployment.vercel.app',edgeId:'edge-fixture',edgeVersion:1,activationId:'10000000-0000-4000-8000-000000000002',vaultSecretName:'cuevo_worker_10000000000040008000000000000002',jobId:42,endpoint:body.targets.supabase.edgeOrigin,activationReceiptSha256:'c'.repeat(64)},installedSource={sourceSha:body.releaseSha,treeSha:body.treeSha,seedSha256:'7be612e9a30e916ec4b460a2ae14a2796cb3f4f542cbdec8f7db2f49c95d9903',manifestSha256:'d'.repeat(64),migrationCount:230};
 f.transfer.preparedApproval=prepareBackendReleaseIntent({...body,installedRuntime,installedSource,executionScope:'installed-runtime'},{...f.expected,installedRuntime,installedSource,executionScope:'installed-runtime'});
 f.transfer.evidence=backendWebTransferEvidenceNames('dpl_Api',true).map(name=>({name,sha256:transferFixtureHash(name)}));
 const proof=validateBackendWebTransfer(f.transfer,f.now);assert.equal(proof.body.installedRuntime?.originalRunId,'11');assert.equal(proof.transfer.earliestProofAt,f.transfer.earliestProofAt);assert.equal(proof.transfer.evidence.some(row=>row.name==='worker-activation-intent.json'),false);assert.equal(proof.transfer.evidence.some(row=>row.name==='runtime-resume-result.json'),true);
 f.transfer.evidence.push({name:'worker-activation-result.json',sha256:'0'.repeat(64)});assert.throws(()=>validateBackendWebTransfer(f.transfer,f.now));
});

test('missing producer and evidence or altered manifest clocks and public settings are refused', () => {
  for (const mode of ['producer', 'evidence', 'manifest', 'settings', 'future', 'expired-export', 'age', 'clock-rewrite', 'private-field', 'claim', 'package', 'artifact-fingerprint', 'foreign-proof-url']) {
    const { transfer, now } = backendWebTransferFixture();
    if (mode === 'producer') transfer.producers.pop();
    if (mode === 'evidence') transfer.evidence[0].name = 'runtime-private.json';
    if (mode === 'manifest') transfer.manifestSha256 = '0'.repeat(64);
    if (mode === 'settings') transfer.settings.settingsSha256 = '0'.repeat(64);
    if (mode === 'future') transfer.exportedAt = new Date(now + 10000).toISOString();
    if (mode === 'expired-export') transfer.originalMutationExpiresAt = new Date(now - 40000).toISOString();
    if (mode === 'age') transfer.earliestProofAt = new Date(now - 2 * 3600000).toISOString();
    if (mode === 'clock-rewrite') transfer.consumptionExpiresAt = new Date(now + 2 * 86400000).toISOString();
    if (mode === 'private-field') Object.assign(transfer, { runtimePrivate: { password: 'private-canary' } });
    if (mode === 'claim') Object.assign(transfer, { privateProofReexecuted: true });
    if (mode === 'package') transfer.preparedApproval.comment = 'generic approval';
    if (mode === 'artifact-fingerprint' || mode === 'foreign-proof-url') {
      const manifest = transfer.manifest as { api: { artifactSha256: string; evidenceUrl: string } };
      if (mode === 'artifact-fingerprint') manifest.api.artifactSha256 = '0'.repeat(64); else manifest.api.evidenceUrl = 'https://github.com/foreign/repo/actions/runs/999';
      transfer.manifestSha256 = transferFixtureHash(canonicalReleaseExecutionJson(manifest));
    }
    assert.throws(() => validateBackendWebTransfer(transfer, now), /contents withheld/, mode);
  }
});

test('accessor inputs cannot execute and malformed or oversized canonical data fails without disclosure', () => {
  const { transfer, now } = backendWebTransferFixture(); let calls = 0;
  assert.throws(() => validateBackendWebTransfer({ ...transfer, get manifest() { calls++; return transfer.manifest; } }, now));
  assert.equal(calls, 0);
  assert.throws(() => validateBackendWebTransfer({ ...transfer, extra: 'private-canary'.repeat(200000) }, now), error => error instanceof Error && !error.message.includes('private-canary'));
});

test('physical transfer reads refuse symlink hardlink/outside/oversized files and never call a provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-transfer-files-'));
  try {
    const folder = join(root, '.local/hosted-release'); await mkdir(folder, { recursive: true }); const file = join(folder, 'web-transfer.json'); await writeFile(file, '{}');
    assert.equal((await readBackendWebTransferFile(root, file)).toString(), '{}');
    await assert.rejects(readBackendWebTransferFile(root, file, 1));
    await assert.rejects(readBackendWebTransferFile(root, join(root, '..', 'outside.json')));
    const alias = join(root, 'alias'); await symlink(folder, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(readBackendWebTransferFile(root, join(alias, 'web-transfer.json')));
    const hardlink = join(folder, 'linked.json'); await link(file, hardlink); await assert.rejects(readBackendWebTransferFile(root, hardlink));
    const original = globalThis.fetch; let requests = 0; globalThis.fetch = async () => { requests++; throw Error('must not run'); };
    try { await assert.rejects(exportBackendWebTransfer({ repoRoot: root, bundleSha256: '0'.repeat(64), githubToken: 'private-gh-canary', vercelToken: 'private-vercel-canary' })); assert.equal(requests, 0); } finally { globalThis.fetch = original; }
  } finally { await rm(root, { recursive: true, force: true }); }
});

type FixtureGlobals = typeof globalThis & { transferAdmissionFixture?: () => Promise<unknown>; transferHandoverFixture?: () => Promise<unknown> };
async function exporter() {
  const hook = registerHooks({ load(url, context, next) {
    if (url.includes('/backend-web-transfer.ts?controlled-export')) {
      const source = readFileSync(new URL(url.split('?')[0]), 'utf8')
        .replace("import { readBackendReleaseAdmission } from './backend-release-admission';", 'const readBackendReleaseAdmission=(...args)=>globalThis.transferAdmissionFixture(...args);')
        .replace("import { prepareBackendWebHandover } from './backend-web-handover';", 'const prepareBackendWebHandover=(...args)=>globalThis.transferHandoverFixture(...args);')
        .replace("process.platform !== 'linux'", 'false').replace("!root.startsWith('/home/runner/work/')", 'false');
      return { format: 'module', shortCircuit: true, source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
    }
    return next(url, context);
  } });
  try { return await import(pathToFileURL(resolve(import.meta.dirname, 'backend-web-transfer.ts')).href + '?controlled-export'); } finally { hook.deregister(); }
}
async function exportFixture(mode: 'normal' | 'handover' | 'admission' | 'settings' | 'cleanup' | 'original', run: (input: unknown, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-transfer-export-')), folder = join(root, '.local/hosted-release'), fixture = backendWebTransferFixture();
  const envs = ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_WORKSPACE', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'];
  const previous = Object.fromEntries(envs.map(key => [key, process.env[key]])), globals = globalThis as FixtureGlobals;
  try {
    await mkdir(folder, { recursive: true });
    const write = (name: string, value: unknown) => writeFile(join(folder, name), canonicalReleaseExecutionJson(value));
    const bundle = { purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected: fixture.expected, preparedApproval: fixture.transfer.preparedApproval };
    await write('backend-bundle.json', bundle); await write('web-handover-manifest.json', fixture.transfer.manifest);
    const manifest = fixture.transfer.manifest as { publicConfig: unknown };
    await write('web-handover-public.json', manifest.publicConfig);
    for (const name of backendWebTransferEvidenceNames('dpl_Api')) {
      const record = { observedAt: fixture.transfer.earliestProofAt, status: 'VERIFIED', privateSourceCanary: 'private-synthetic-must-not-transfer' };
      // backend-release.record uses JSON.stringify+LF; activation uses canonical+LF.
      await writeFile(join(folder, name), (name.startsWith('worker-activation') ? canonicalReleaseExecutionJson(record) : JSON.stringify(record)) + '\n');
    }
    await write('web-settings-result.json', { purpose: 'CUEVO_STAGING_PUBLIC_WEB_SETTINGS', status: mode === 'settings' ? 'REQUIRES_REVIEW' : 'WEB_PUBLIC_SETTINGS_CONFIRMED', operation: 'NOOP', sourceSha: fixture.expected.releaseSha, runId: '51', runAttempt: 1, packageSha256: fixture.transfer.preparedApproval.sha256, manifestSha256: fixture.transfer.manifestSha256, webProjectId: 'prj_Web', teamId: 'team_Cuevo', observedAt: fixture.transfer.settings.observedAt, settingsSha256: fixture.transfer.settings.settingsSha256, pendingGates: [], hostedAcceptance: false, canonicalReceipt: null });
    if (mode === 'cleanup') await rm(join(folder, 'database-restore-cleanup.json'));
    if (mode === 'original') await writeFile(join(folder, 'web-transfer.json'), 'original retained bytes');
    for (const path of backendWebTransferProducerPaths) { await mkdir(resolve(root, path, '..'), { recursive: true }); await writeFile(join(root, path), 'Controlled reviewed producer\n'); }
    globals.transferAdmissionFixture = async () => { if (mode === 'admission') throw Error('private-provider-canary'); return { expected: fixture.expected }; };
    globals.transferHandoverFixture = async () => ({ status: mode === 'handover' ? 'REQUIRES_REVIEW' : 'PREPARED_STAGING_MANIFEST', pendingGates: mode === 'handover' ? ['FRESH_PRIVATE_SOURCE_AND_CLEANUP'] : [], manifestPath: join(folder, 'web-handover-manifest.json'), publicConfigurationPath: join(folder, 'web-handover-public.json'), manifestSha256: fixture.transfer.manifestSha256 });
    Object.assign(process.env, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_WORKSPACE: root, GITHUB_SHA: fixture.expected.releaseSha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1' });
    await run({ repoRoot: root, bundleSha256: transferFixtureHash(canonicalReleaseExecutionJson(bundle)), githubToken: 'private-gh-canary', vercelToken: 'private-vercel-canary' }, root);
  } finally {
    for (const key of envs) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    delete globals.transferAdmissionFixture; delete globals.transferHandoverFixture; assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true });
  }
}

test('controlled actual exporter reuses native gate and never copies private proof bytes or operational credentials', async () => {
  const api = await exporter(); await exportFixture('normal', async (input, root) => {
    const result = await api.exportBackendWebTransfer(input), text = await readFile(result.transferPath, 'utf8');
    assert.equal(result.transferSha256, transferFixtureHash(text)); assert.equal(result.hostedAcceptance, false);
    assert.doesNotMatch(text, /private-synthetic-must-not-transfer|private-gh-canary|private-vercel-canary|runtime-private|database-ca|\.dump/);
    const admitted = validateBackendWebTransfer(JSON.parse(text), Date.now()); assert.equal(admitted.transfer.evidence.length, backendWebTransferEvidenceNames('dpl_Api').length);
    assert.equal(result.transferPath, join(root, '.local/hosted-release/web-transfer.json'));
    await assert.rejects(api.exportBackendWebTransfer(input)); assert.equal(await readFile(result.transferPath, 'utf8'), text);
  });
});

test('failed native handover missing cleanup or settings cannot export and original uncertain output is retained', async () => {
  const api = await exporter();
  for (const mode of ['handover', 'admission', 'settings', 'cleanup', 'original'] as const) await exportFixture(mode, async (input, root) => {
    await assert.rejects(api.exportBackendWebTransfer(input), /contents withheld/, mode);
    if (mode === 'original') assert.equal(await readFile(join(root, '.local/hosted-release/web-transfer.json'), 'utf8'), 'original retained bytes');
  });
});
