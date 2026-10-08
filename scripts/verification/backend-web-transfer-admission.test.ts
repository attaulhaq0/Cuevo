import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { canonicalReleaseExecutionJson } from './release-review';
import {prepareBackendReleaseIntent} from './backend-release-contracts';
import {ciRuntimeJobs,ciSourceJobs,ciDatabaseJob} from './verification-workflows';
import {readCanonicalRuntimeJobs} from './canonical-runtime-jobs';
import { backendWebTransferFixture, transferFixtureHash } from './backend-web-transfer-fixtures';
import { readBackendWebTransferArchive, validateCompletedBackendWebApproval,validateSelectedBackendWebTransfer } from './backend-web-transfer-admission';
import type { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { backendWebTransferProducerPaths,operatingBackendWebTransferProducerPaths,operatingBackendWebTransferEvidenceNames } from './backend-web-transfer';

const { yazl } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { yazl: { ZipFile: new () => { outputStream: Readable; addBuffer(bytes: Buffer, name: string, options?: object): void; end(): void } } };
async function archive(files: { name: string; bytes: Buffer; options?: object }[]) {
  const zip = new yazl.ZipFile(), chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((done, reject) => { zip.outputStream.on('data', chunk => chunks.push(chunk)); zip.outputStream.on('error', reject); zip.outputStream.on('end', () => done(Buffer.concat(chunks))); });
  for (const file of files) zip.addBuffer(file.bytes, file.name, file.options); zip.end(); return complete;
}

test('completed backend consumption has a separate read-only admission and bounded archive reader', async () => {
  const api = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-web-transfer-admission.ts')).href).catch(() => ({}));
  assert.equal(typeof api.readCompletedBackendWebTransferAdmission, 'function');
  assert.equal(typeof api.readBackendWebTransferArchive, 'function');
});

test('a completed success consumes its exact original founder receipt without rewriting the official run', () => {
  const { transfer, completedRun, approvals, now } = backendWebTransferFixture(), before = canonicalReleaseExecutionJson(completedRun);
  const admitted = validateCompletedBackendWebApproval(completedRun, approvals, transfer, now);
  assert.equal(admitted.backendRun.status, 'completed'); assert.equal(admitted.transfer.backendMutationAllowed, false);
  assert.equal(canonicalReleaseExecutionJson(completedRun), before);
  assert.equal(admitted.prepared.sha256, transfer.preparedApproval.sha256);
});
test('selected backend consumer defaults to customer evidence and refuses purpose substitution before admission',()=>{const fixture=backendWebTransferFixture();assert.equal(typeof validateSelectedBackendWebTransfer,'function');assert.equal(validateSelectedBackendWebTransfer(fixture.transfer,fixture.now,'customer-candidate').transfer.purpose,'CUEVO_COMPLETED_BACKEND_WEB_HANDOVER');assert.throws(()=>validateSelectedBackendWebTransfer(fixture.transfer,fixture.now,'operating-staging'));assert.throws(()=>validateSelectedBackendWebTransfer({...fixture.transfer,purpose:'CUEVO_OPERATING_BACKEND_WEB_HANDOVER'},fixture.now,'customer-candidate'));});

test('official whole-second timestamp serialization does not falsely reject original same-second chronology or extend expiry', () => {
  const { transfer, completedRun, approvals, now } = backendWebTransferFixture();
  transfer.exportedAt = new Date(Math.floor((now - 30000) / 1000) * 1000 + 900).toISOString();
  completedRun.updated_at = new Date(Math.floor(Date.parse(transfer.exportedAt) / 1000) * 1000).toISOString();
  assert.equal(validateCompletedBackendWebApproval(completedRun, approvals, transfer, now).backendRun.status, 'completed');
  completedRun.updated_at = new Date(Math.floor(Date.parse(transfer.exportedAt) / 1000) * 1000 - 1000).toISOString();
  assert.throws(() => validateCompletedBackendWebApproval(completedRun, approvals, transfer, now));
});

test('failure cancelled stale attempt or ambiguous generic and wrong-user approvals refuse completed consumption', () => {
  for (const mode of ['failure', 'active', 'attempt', 'source', 'repository', 'clock', 'generic', 'duplicate', 'user', 'environment', 'pending']) {
    const { transfer, completedRun, approvals, now } = backendWebTransferFixture();
    if (mode === 'failure') completedRun.conclusion = 'failure';
    if (mode === 'active') completedRun.status = 'in_progress';
    if (mode === 'attempt') completedRun.run_attempt = 2;
    if (mode === 'source') completedRun.head_sha = '0'.repeat(40);
    if (mode === 'repository') completedRun.repository.full_name = 'foreign/repo';
    if (mode === 'clock') completedRun.updated_at = new Date(now - 40000).toISOString();
    if (mode === 'generic') approvals[0].comment = 'approved';
    if (mode === 'duplicate') approvals.push({ ...approvals[0] });
    if (mode === 'user') approvals[0].user.login = 'another';
    if (mode === 'environment') approvals[0].environments[0].name = 'production';
    if (mode === 'pending') approvals[0].state = 'pending';
    assert.throws(() => validateCompletedBackendWebApproval(completedRun, approvals, transfer, now), /contents withheld/, mode);
  }
});

test('the actual locked ZIP reader verifies archive and JSON bytes before canonical decoding', async () => {
  const { transfer } = backendWebTransferFixture(), text = canonicalReleaseExecutionJson(transfer), bytes = Buffer.from(text), zip = await archive([{ name: 'web-transfer.json', bytes }]);
  assert.deepEqual(await readBackendWebTransferArchive(zip, transferFixtureHash(zip), transferFixtureHash(bytes)), transfer);
  await assert.rejects(readBackendWebTransferArchive(zip, '0'.repeat(64), transferFixtureHash(bytes)));
  await assert.rejects(readBackendWebTransferArchive(zip, transferFixtureHash(zip), '0'.repeat(64)));
});

test('extra entries paths symlinks encryption oversize and malformed JSON/UTF8 archives cannot be admitted', async () => {
  const { transfer } = backendWebTransferFixture(), bytes = Buffer.from(canonicalReleaseExecutionJson(transfer));
  const bad = [
    await archive([{ name: 'web-transfer.json', bytes }, { name: 'extra.json', bytes: Buffer.from('{}') }]),
    await archive([{ name: 'folder/web-transfer.json', bytes }]),
    await archive([{ name: 'web-transfer.json', bytes, options: { mode: 0o120777 } }]),
    await archive([{ name: 'web-transfer.json', bytes: Buffer.alloc(192 * 1024 + 1, 97) }]),
    await archive([{ name: 'web-transfer.json', bytes: Buffer.from('{"x":1,"x":2}') }]),
    await archive([{ name: 'web-transfer.json', bytes: Buffer.from([0xff]) }]),
    await archive([{ name: 'web-transfer.json', bytes: Buffer.from('{ "x": 1 }') }]),
  ];
  const encrypted = await archive([{ name: 'web-transfer.json', bytes }]);
  const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8); bad.push(encrypted);
  for (const zip of bad) await assert.rejects(readBackendWebTransferArchive(zip, transferFixtureHash(zip), transferFixtureHash(bytes)), /contents withheld/);
});

async function nativeReader() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.includes('/backend-web-transfer-admission.ts?controlled')) {
      const source = readFileSync(new URL(url.split('?')[0]), 'utf8').replace("process.platform !== 'linux'", 'false')
        .replace("!input.repoRoot.startsWith('/home/runner/work/')", 'false');
      return { format: 'module', shortCircuit: true, source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
    }
    return next(url, context);
  } });
  try { return await import(pathToFileURL(resolve(import.meta.dirname, 'backend-web-transfer-admission.ts')).href + '?controlled'); } finally { hooks.deregister(); }
}
async function officialFixture(run: (value: { input: Record<string, unknown>; responses: Map<string, unknown>; root: string; calls: string[] }) => Promise<void>, precision: 'ordinary' | 'same-second' = 'ordinary',operating=false) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-transfer-admission-')), oldFetch = globalThis.fetch;
  const keys = ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_WORKSPACE', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    await writeFile(join(root, '.gitattributes'), '* text eol=lf\n'); await writeFile(join(root, 'README.md'), 'Original source\n');
    for (const path of [...new Set([...backendWebTransferProducerPaths,...(operating?operatingBackendWebTransferProducerPaths:[])])]) { await mkdir(resolve(root, path, '..'), { recursive: true }); await writeFile(join(root, path), 'Controlled producer source\n'); }
    await mkdir(join(root, 'supabase/migrations'), { recursive: true }); await writeFile(join(root, 'supabase/migrations/20261001000000_fixture.sql'), 'select 1;\n');
    git('init', '--quiet'); git('add', '.'); git('-c', 'user.name=Controlled source', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'base');
    const baseSha = git('rev-parse', 'HEAD').toString().trim(); await writeFile(join(root, 'README.md'), 'Current source\n'); git('add', '.'); git('-c', 'user.name=Controlled source', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'current');
    const sourceSha = git('rev-parse', 'HEAD').toString().trim(), treeSha = git('rev-parse', 'HEAD^{tree}').toString().trim();
    const fixture = backendWebTransferFixture({ sourceSha, treeSha, baseSha, sourceManifestSha256: transferFixtureHash(git('ls-tree', '-r', '-z', sourceSha)), diffSha256: transferFixtureHash(git('diff', '--no-ext-diff', '--no-textconv', '--binary', baseSha, sourceSha, '--')) });
    for (const producer of fixture.transfer.producers) producer.sha256 = transferFixtureHash(readFileSync(join(root, producer.path)));
    const manifest = fixture.transfer.manifest as { database: { migrations: { version: string; sha256: string }[] } }; manifest.database.migrations[0].sha256 = transferFixtureHash(Buffer.from('select 1;\n'));
    fixture.transfer.manifestSha256 = transferFixtureHash(canonicalReleaseExecutionJson(manifest));
    if (precision === 'same-second') fixture.transfer.exportedAt = new Date(Math.floor((fixture.now - 30000) / 1000) * 1000 + 750).toISOString();
    const rawCi={...fixture.expected.ciRun,run_attempt:2};
    const runtimeJobs=Object.entries({...ciRuntimeJobs,...ciSourceJobs,'database-checks':ciDatabaseJob}).map(([name,contract],index)=>({id:100+index,name,run_id:31,run_attempt:2,head_sha:sourceSha,head_branch:'main',status:'completed',conclusion:'success',steps:contract.steps.map((step,number)=>({name:'name' in step?step.name:`Run ${'uses' in step?step.uses:step.run}`,number:number+1,status:'completed',conclusion:'success'}))}));
    const otherJobs=['codeql','secret-scan','required'].map((name,index)=>({id:200+index,name,run_id:31,run_attempt:2,head_sha:sourceSha,head_branch:'main',status:'completed',conclusion:'success',steps:[{name:'Required original work',number:1,status:'completed',conclusion:'success'}]}));
    const jobsResponse={total_count:runtimeJobs.length+otherJobs.length,jobs:[...runtimeJobs,...otherJobs]},canonical=await readCanonicalRuntimeJobs(rawCi,async path=>path==='actions/runs/31'?rawCi:jobsResponse),body=JSON.parse(fixture.transfer.preparedApproval.canonicalJson);
    fixture.transfer.preparedApproval=prepareBackendReleaseIntent({...body,canonicalRuntimeVerification:canonical},{...fixture.expected,canonicalRuntimeVerification:canonical});fixture.approvals[0].comment=fixture.transfer.preparedApproval.comment;
    let selected:unknown=fixture.transfer;
    if(operating){const full=fixture.transfer.manifest as {api:{deploymentUrl:string};database:{migrations:{version:string;sha256:string}[]};publicConfig:unknown},body=JSON.parse(fixture.transfer.preparedApproval.canonicalJson),digest='b'.repeat(64),receipt={version:1,purpose:'CUEVO_OPERATING_SYNTHETIC_STAGING_HANDOFF',repository:body.repository,sourceSha:sourceSha,treeSha,runId:'51',runAttempt:1,packageSha256:fixture.transfer.preparedApproval.sha256,observedAt:fixture.transfer.earliestProofAt,generation:'2',database:{projectRef:body.targets.supabase.projectRef,migrationCount:full.database.migrations.length,migrationManifestSha256:transferFixtureHash(canonicalReleaseExecutionJson([...full.database.migrations].sort((a,b)=>a.version.localeCompare(b.version)))),historySha256:digest,authIdentities:133,schools:2,permissionsVerified:true},api:{projectId:'prj_Api',teamId:'team_Cuevo',deploymentId:'dpl_Api',deploymentUrl:full.api.deploymentUrl,origin:body.targets.api.origin,artifactSha256:body.fingerprints.apiArtifactSha256,healthVerified:true,currentActorVerified:true,corsVerified:true},worker:{edgeId:'edge',edgeVersion:2,artifactSha256:body.fingerprints.edgeArtifactSha256,denoLockSha256:body.fingerprints.denoLockSha256,runtimeSha256:digest,generation:'2',operatingVerified:true,privateTransportVerified:true,admissionPaused:false},privateAccess:{dataApiDisabled:true,anonymousDenied:true,authenticatedDenied:true,serviceDenied:true,storageVerified:true,realtimeVerified:true},cleanup:{lockReleased:true,sessionsClosed:true,receiptSha256:digest},publicConfig:full.publicConfig,customerAcceptance:false,remainingAcceptance:['FULL_HOSTED_CUSTOMER_ACCEPTANCE','RESTORE_AND_OPERATIONAL_APPROVAL','CURRICULUM_RIGHTS_AND_SCHOOL_APPROVAL']};const producers=[];for(const path of operatingBackendWebTransferProducerPaths){const bytes=readFileSync(join(root,path));producers.push({path,sha256:transferFixtureHash(bytes)});}selected={...fixture.transfer,version:2,purpose:'CUEVO_OPERATING_BACKEND_WEB_HANDOVER',status:'EXPORTED_OPERATING_BACKEND_HANDOVER',manifest:receipt,manifestSha256:transferFixtureHash(canonicalReleaseExecutionJson(receipt)),receiptScope:'ORIGINAL_NATIVE_OPERATING_BACKEND_AND_CLEANUP',producers,evidence:operatingBackendWebTransferEvidenceNames.map(name=>({name,sha256:digest}))};}
    const text = canonicalReleaseExecutionJson(selected), zip = await archive([{ name: 'web-transfer.json', bytes: Buffer.from(text) }]);
    const artifact = { id: 71, name: 'cuevo-web-handover-51-1', size_in_bytes: zip.length, expired: false, digest: 'sha256:' + transferFixtureHash(zip), created_at: precision === 'same-second' ? new Date(Math.floor(Date.parse(fixture.transfer.exportedAt) / 1000) * 1000).toISOString() : new Date(fixture.now - 20000).toISOString(), expires_at: new Date(fixture.now + 86400000).toISOString(), workflow_run: { id: 51, head_branch: 'main', head_sha: sourceSha } };
    const environment = { id: 123, name: 'staging', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } };
    const responses = new Map<string, unknown>([
      ['actions/runs/51', fixture.completedRun], ['actions/artifacts/71', artifact], ['', { full_name: 'owner/repo', name: 'repo', owner: { id: 1, login: 'owner', type: 'User' } }],
      ['git/ref/heads/main', { object: { type: 'commit', sha: sourceSha } }], ['actions/runs/31', rawCi],['actions/runs/31/attempts/2/jobs?per_page=100&page=1',jobsResponse], ['environments/staging', environment],
      ['environments/staging/deployment-branch-policies', { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] }],
      ['branches/main/protection', { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] }, required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 0, require_last_push_approval: false } }],
      ['branches/main/protection/required_signatures', { enabled: true }], [`git/commits/${sourceSha}`, { sha: sourceSha, tree: { sha: treeSha }, verification: { verified: true, reason: 'valid', signature: 'controlled-signature', payload: 'controlled-payload' } }], ['actions/runs/51/approvals', fixture.approvals],
    ]);
    Object.assign(process.env, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_WORKSPACE: root, GITHUB_SHA: sourceSha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'owner/repo' });
    const calls: string[] = [];
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw)); assert.equal(options?.method ?? 'GET', 'GET'); calls.push(url.hostname + url.pathname);
      if (url.hostname === 'productionresultssafixture.blob.core.windows.net') { assert.equal(new Headers(options?.headers).get('authorization'), null); assert.equal(options?.redirect, 'error'); return new Response(new Uint8Array(zip)); }
      assert.equal(url.origin, 'https://api.github.com'); assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-github-canary');
      const path = url.pathname.replace('/repos/owner/repo', '').replace(/^\//, '')+url.search;
      if (path === 'actions/artifacts/71/zip') { assert.equal(options?.redirect, 'manual'); return new Response(null, { status: 302, headers: { location: 'https://productionresultssafixture.blob.core.windows.net/artifacts/archive?sig=controlled' } }); }
      assert.equal(options?.redirect, 'error'); if (!responses.has(path)) throw Error('Unexpected fixed path'); return Response.json(responses.get(path));
    };
    await run({ input: {...(operating?{handoff:'operating-staging'}:{}),repoRoot: root, githubToken: 'private-github-canary', releaseSha: sourceSha, ciRunId: '31', backendRunId: '51', backendRunAttempt: 1, artifactId: '71', transferSha256: transferFixtureHash(text), web: { teamId: 'team_Cuevo', projectId: 'prj_Web', target: 'preview' } }, responses, root, calls });
  } finally {
    globalThis.fetch = oldFetch; for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true });
  }
}

test('controlled official completed artifact source and review reader sends no token to the ZIP host', async () => {
  const api = await nativeReader(); await officialFixture(async fixture => {
    const result = await api.readCompletedBackendWebTransferAdmission(fixture.input);
    assert.equal(result.provenance, 'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE'); assert.equal(result.backendMutationAllowed, false); assert.equal(result.privateProofReexecuted, false);
    assert.equal(result.backendIdentity.artifactId, '71'); assert(!JSON.stringify(result).includes('private-github-canary'));
    assert.equal(result.originalEvidence.filter((row: { name: string }) => row.name === 'population-result.json').length, 1);
    assert(fixture.calls.includes('productionresultssafixture.blob.core.windows.net/artifacts/archive'));
  });
});
test('actual operating artifact admission preserves distinct purpose and refuses default full consumption',async()=>{const api=await nativeReader();await officialFixture(async fixture=>{const result=await api.readCompletedBackendWebTransferAdmission(fixture.input);assert.equal(result.purpose,'OPERATING_BACKEND_WEB_HANDOVER_CONSUMPTION');assert.equal(result.customerReady,false);assert.equal(result.privateProofReexecuted,false);assert.equal(result.backendIdentity.runId,'51');await assert.rejects(api.readCompletedBackendWebTransferAdmission({...fixture.input,handoff:'customer-candidate'}));},'ordinary',true);});
test('completed handover consumption rejects changed canonical runtime attempts or missing runtime jobs',async()=>{
 const api=await nativeReader();for(const mode of ['attempt','missing'])await officialFixture(async f=>{if(mode==='attempt'){const row=f.responses.get('actions/runs/31') as Record<string,unknown>;f.responses.set('actions/runs/31',{...row,run_attempt:3});}else{const path='actions/runs/31/attempts/2/jobs?per_page=100&page=1',row=f.responses.get(path) as {total_count:number;jobs:Record<string,unknown>[]};row.jobs=row.jobs.filter(job=>job.name!=='runtime-browser');row.total_count=row.jobs.length;}await assert.rejects(api.readCompletedBackendWebTransferAdmission(f.input));});
});

test('official artifact failure digest attempts source signatures review and tracked drift never pass', async () => {
  const api = await nativeReader();
  for (const mode of ['failed', 'attempt', 'archive-digest', 'artifact-name', 'source', 'signature', 'approval', 'tracked']) await officialFixture(async fixture => {
    const replace = (path: string, patch: object) => fixture.responses.set(path, { ...fixture.responses.get(path) as object, ...patch });
    if (mode === 'failed') replace('actions/runs/51', { conclusion: 'failure' });
    if (mode === 'attempt') replace('actions/runs/51', { run_attempt: 2 });
    if (mode === 'archive-digest') replace('actions/artifacts/71', { digest: 'sha256:' + '0'.repeat(64) });
    if (mode === 'artifact-name') replace('actions/artifacts/71', { name: 'foreign' });
    if (mode === 'source') replace('git/ref/heads/main', { object: { type: 'commit', sha: '0'.repeat(40) } });
    if (mode === 'signature') replace('branches/main/protection/required_signatures', { enabled: false });
    if (mode === 'approval') fixture.responses.set('actions/runs/51/approvals', []);
    if (mode === 'tracked') await writeFile(join(fixture.root, 'README.md'), 'Changed after freeze\n');
    await assert.rejects(api.readCompletedBackendWebTransferAdmission(fixture.input), /contents withheld/, mode);
  });
});

test('unknown artifact redirect is refused before sending credentials or requesting a foreign host', async () => {
  const api = await nativeReader(); await officialFixture(async fixture => {
    const original = globalThis.fetch;
    let location = '', zipRequests = 0;
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw));
      if (url.origin === 'https://api.github.com' && url.pathname === '/repos/owner/repo/actions/artifacts/71/zip') { zipRequests++; return new Response(null, { status: 302, headers: { location } }); }
      return original(raw, options);
    };
    for (location of ['https://foreign.example/archive?token=private-canary','https://productionresultssafixture.blob.core.windows.net.foreign.invalid/artifacts/archive?sig=controlled','https://productionresultssafixture.blob.core.windows.net@foreign.invalid/artifacts/archive?sig=controlled','https://foreign.invalid/productionresultssafixture.blob.core.windows.net/artifacts/archive?sig=controlled']) {
      const before = fixture.calls.length;
      await assert.rejects(api.readCompletedBackendWebTransferAdmission(fixture.input));
      assert(fixture.calls.slice(before).every(path => new URL('https://' + path).origin === 'https://api.github.com'));
    }
    assert.equal(zipRequests, 4);
  });
});

test('same-second export milliseconds and official artifact seconds retain honest order and genuine older artifacts refuse', async () => {
  const api = await nativeReader();
  await officialFixture(async fixture => { assert.equal((await api.readCompletedBackendWebTransferAdmission(fixture.input)).backendIdentity.artifactId, '71'); }, 'same-second');
  await officialFixture(async fixture => {
    const artifact = fixture.responses.get('actions/artifacts/71') as { created_at: string };
    artifact.created_at = new Date(Date.parse(artifact.created_at) - 1000).toISOString();
    await assert.rejects(api.readCompletedBackendWebTransferAdmission(fixture.input));
  }, 'same-second');
});
