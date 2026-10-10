import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import { canonicalReleaseExecutionJson } from './release-review';
import {prepareBackendReleaseIntent} from './backend-release-contracts';
import {ciRuntimeJobs,ciSourceJobs,ciDatabaseJob} from './verification-workflows';
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
import {withCanonicalJobFixture}from'./canonical-source-job-fixtures';
import {spawnSync}from'node:child_process';
import {validateStagingHostContract,stagingHostContractSha256,type StagingHostContract} from './backend-staging-host-contract';

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
    if(url.endsWith('/canonical-runtime-jobs.ts?handover-consumer-fixture'))return{format:'module',shortCircuit:true,source:`import{createHash}from'node:crypto';export const consumerCanonicalCalls=[];export async function readCanonicalRuntimeJobs(run,github,artifact,purpose='CURRENT_SOURCE'){if(typeof artifact!=='function'||purpose!=='CURRENT_SOURCE')throw Error('Canonical source consumer contract refused');consumerCanonicalCalls.push({sourceSha:run.head_sha,runAttempt:run.run_attempt,purpose,artifactCallable:typeof artifact==='function'});const current=await github('actions/runs/'+run.id),jobs=await github('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page=1');if(current.head_sha!==run.head_sha||current.run_attempt!==run.run_attempt||current.conclusion!=='success'||jobs.jobs.some(row=>row.head_sha!==run.head_sha||row.run_attempt!==run.run_attempt||row.conclusion!=='success'))throw Error('Canonical source consumer metadata changed');return{runAttempt:run.run_attempt,jobsSha256:createHash('sha256').update(JSON.stringify({run,current,jobs})).digest('hex')};}export async function readCanonicalRuntimeJobsAndGuard(run,github,artifact,purpose){const proof=await readCanonicalRuntimeJobs(run,github,artifact,purpose),original=await github('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page=1');return{proof,assertOriginalValidity:()=>{},refreshOriginalMetadata:async()=>{if(JSON.stringify(await github('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page=1'))!==JSON.stringify(original))throw Error('Original job metadata changed');}};}`};
    if (url.includes('/backend-web-transfer-admission.ts?controlled')) {
      const source = readFileSync(new URL(url.split('?')[0]), 'utf8').replace("process.platform !== 'linux'", 'false')
        .replace("!input.repoRoot.startsWith('/home/runner/work/')", 'false').replace("from './canonical-runtime-jobs'", "from './canonical-runtime-jobs.ts?handover-consumer-fixture'");
      return { format: 'module', shortCircuit: true, source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
    }
    return next(url, context);
  } });
  try { return await import(pathToFileURL(resolve(import.meta.dirname, 'backend-web-transfer-admission.ts')).href + '?controlled'); } finally { hooks.deregister(); }
}
async function officialFixture(run: (value: { input: Record<string, unknown>; responses: Map<string, unknown>; root: string; calls: string[]; originalTransfer:unknown; expectedHost?:StagingHostContract }) => Promise<void>, precision: 'ordinary' | 'same-second' = 'ordinary',operating=false,hostMode?:'valid'|'string'|'source'|'private'|'target') {
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
    // This fixture isolates completed handover consumption. Genuine original
    // partition archive/source proof is exercised by canonical-source-jobs tests.
    const jobsResponse={total_count:runtimeJobs.length+otherJobs.length,jobs:[...runtimeJobs,...otherJobs]},canonical={runAttempt:rawCi.run_attempt,jobsSha256:transferFixtureHash(JSON.stringify({run:rawCi,current:rawCi,jobs:jobsResponse}))},body=JSON.parse(fixture.transfer.preparedApproval.canonicalJson);
    let expectedHost:StagingHostContract|undefined;
    if(hostMode){const settings=(rootDirectory:string|null,framework:string|null)=>({nodeVersion:'24.x',fluid:true,functionDefaultRegions:['sin1'],autoAssignCustomDomains:false,ssoDeploymentType:'all_except_custom_domains',rootDirectory,framework});expectedHost=validateStagingHostContract({version:1,purpose:'CUEVO_STAGING_HOST_CONTRACT',sourceSha,treeSha,deploymentEnvironment:'synthetic-staging',targets:body.targets,settings:{api:settings(null,null),web:settings('apps/web','nextjs'),supabase:{region:'ap-southeast-1',postgresEngine:'17',applicationConnection:{kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'}}},sourceBounds:{api:{node:'24',maxDurationSeconds:60,poolMax:10,connectionTimeoutMs:3000,idleTimeoutMs:10000,statementTimeoutMs:5000},worker:{poolMax:1,connectionTimeoutMs:3000,statementTimeoutMs:5000,processingDeadlineMs:20000,claimReserveMs:15000,eventLeaseSeconds:30,invocationLeaseSeconds:60,deliveryTimeoutMs:30000,recoveryIntervalSeconds:60}},capacity:{postgres:{maxConnections:60,superuserReservedConnections:3},sessionPoolerClientCeiling:{state:'UNKNOWN',value:null}},exposure:{audience:'PRIVATE_SYNTHETIC_OPERATORS',roleScope:'FIVE_REFERENCE_ROLES',gatewayPolicy:'EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN',clientAddressPolicy:'HOSTED_VERIFICATION_PENDING',fleetProtection:'NOT_VERIFIED'}});}
    fixture.transfer.preparedApproval=prepareBackendReleaseIntent({...body,canonicalRuntimeVerification:canonical,...(expectedHost?{stagingHostContract:expectedHost}:{})},{...fixture.expected,canonicalRuntimeVerification:canonical,...(expectedHost?{stagingHostContract:expectedHost}:{})});fixture.approvals[0].comment=fixture.transfer.preparedApproval.comment;
    if(hostMode&&hostMode!=='valid'){const altered=JSON.parse(fixture.transfer.preparedApproval.canonicalJson);if(hostMode==='string')altered.stagingHostContract='private-raw-canary';if(hostMode==='source')altered.stagingHostContract.sourceSha='f'.repeat(40);if(hostMode==='private')altered.stagingHostContract.privateToken='private-raw-canary';if(hostMode==='target')altered.stagingHostContract.targets.web.projectId='prj_Foreign';const canonicalJson=canonicalReleaseExecutionJson(altered),sha256=transferFixtureHash(canonicalJson);fixture.transfer.preparedApproval={...fixture.transfer.preparedApproval,canonicalJson,base64:Buffer.from(canonicalJson).toString('base64'),sha256,comment:`Cuevo backend staging admission approved: sha=${sourceSha}; run=51; attempt=1; package=sha256:${sha256}`};fixture.approvals[0].comment=fixture.transfer.preparedApproval.comment;}
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
    await run({ input: {...(operating?{handoff:'operating-staging'}:{}),repoRoot: root, githubToken: 'private-github-canary', releaseSha: sourceSha, ciRunId: '31', backendRunId: '51', backendRunAttempt: 1, artifactId: '71', transferSha256: transferFixtureHash(text), web: { teamId: 'team_Cuevo', projectId: 'prj_Web', target: 'preview' } }, responses, root, calls,originalTransfer:selected,...(expectedHost?{expectedHost}:{}) });
  } finally {
    globalThis.fetch = oldFetch; for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true });
  }
}

test('controlled official completed artifact source and review reader sends no token to the ZIP host', async () => {
  const api = await nativeReader(); await officialFixture(async fixture => {
    const cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),fs=createRequire(import.meta.url)('node:fs/promises') as typeof import('node:fs/promises'),originalExec=cp.execFileSync,originalRead=fs.readFile,commands:string[][]=[];let sourceByteReads=0;
    cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')commands.push([...args]);return originalExec(file,args,options as Parameters<typeof originalExec>[2]);}) as typeof originalExec;
    fs.readFile=(async(...args:Parameters<typeof originalRead>)=>{if(String(args[0])===join(fixture.root,'README.md'))sourceByteReads++;return originalRead(...args);}) as typeof originalRead;syncBuiltinESMExports();
    let result:Awaited<ReturnType<typeof api.readCompletedBackendWebTransferAdmission>>;
    try{result=await api.readCompletedBackendWebTransferAdmission(fixture.input);}finally{cp.execFileSync=originalExec;fs.readFile=originalRead;syncBuiltinESMExports();}
    assert.equal(commands.filter(args=>args.includes('--batch-check')).length,1,'one authentic full-source Git acquisition must cover completed handover observation');assert.equal(sourceByteReads,1,'original physical source bytes are acquired once');assert.ok(commands.filter(args=>args.at(-1)==='HEAD^{tree}').length>=2,'both later physical source boundaries remain current');
    assert.equal(result.provenance, 'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE'); assert.equal(result.backendMutationAllowed, false); assert.equal(result.privateProofReexecuted, false);
    assert.equal(result.backendIdentity.artifactId, '71'); assert(!JSON.stringify(result).includes('private-github-canary'));
    const observer=await import(pathToFileURL(resolve(import.meta.dirname,'canonical-runtime-jobs.ts')).href+'?handover-consumer-fixture');assert.equal(observer.consumerCanonicalCalls.length,1,'One full canonical acquisition is sufficient within the read-only handover admission.');assert.ok(observer.consumerCanonicalCalls.every((row:{purpose:string;artifactCallable:boolean})=>row.purpose==='CURRENT_SOURCE'&&row.artifactCallable));
    assert.equal(result.originalEvidence.filter((row: { name: string }) => row.name === 'population-result.json').length, 1);
    assert(fixture.calls.includes('productionresultssafixture.blob.core.windows.net/artifacts/archive'));
  });
});

test('completed transfer admission projects only the original approved host contract and digest without changing old transfer clocks',async()=>{
 const api=await nativeReader();await officialFixture(async fixture=>{
  const before=canonicalReleaseExecutionJson(fixture.originalTransfer),result=await api.readCompletedBackendWebTransferAdmission(fixture.input);
  assert.deepEqual(result.backendIdentity.stagingHostContract,fixture.expectedHost);assert.equal(result.backendIdentity.stagingHostContractSha256,stagingHostContractSha256(fixture.expectedHost));
  assert.ok(result.backendIdentity.stagingHostContract);
  assert.equal(result.backendIdentity.stagingHostContract.sourceSha,result.backendIdentity.sourceSha);assert.equal(result.backendIdentity.stagingHostContract.treeSha,result.backendIdentity.treeSha);
  const original=validateSelectedBackendWebTransfer(fixture.originalTransfer,Date.now());
  assert.equal(canonicalReleaseExecutionJson(fixture.originalTransfer),before);assert.equal(canonicalReleaseExecutionJson(result.publicConfig),canonicalReleaseExecutionJson(original.publicConfig));assert.equal(Object.hasOwn(result.backendIdentity,'currentHostSettings'),false);
 },'ordinary',false,'valid');
 await officialFixture(async fixture=>{const result=await api.readCompletedBackendWebTransferAdmission(fixture.input);assert.equal(Object.hasOwn(result.backendIdentity,'stagingHostContract'),false);assert.equal(Object.hasOwn(result.backendIdentity,'stagingHostContractSha256'),false);});
});

test('forged string private source and target host contract cannot become completed transfer authority',async()=>{
 const api=await nativeReader();for(const mode of['string','private','source','target']as const)await officialFixture(async fixture=>{await assert.rejects(api.readCompletedBackendWebTransferAdmission(fixture.input),error=>!String(error).includes('private-raw-canary'));},'ordinary',false,mode);
});

test('one canonical handover acquisition still refuses final approval controls artifacts and checkout drift',async()=>{
 const api=await nativeReader();
 for(const mode of ['approval','controls','artifact','source','hidden-source','own-expiry'])await officialFixture(async fixture=>{
  const originalClock=Date.now,artifactExpiry=originalClock()+60000;if(mode==='own-expiry')(fixture.responses.get('actions/artifacts/71')as{expires_at:string}).expires_at=new Date(artifactExpiry).toISOString();
  const original=globalThis.fetch,counts=new Map<string,number>();
  globalThis.fetch=async(raw,options)=>{const url=new URL(String(raw)),key=url.pathname+url.search,count=(counts.get(key)??0)+1;counts.set(key,count);
   if(mode==='approval'&&key.endsWith('/actions/runs/51/approvals')&&count===2)return Response.json([]);
   if(mode==='controls'&&key.endsWith('/branches/main/protection/required_signatures')&&count===2)return Response.json({enabled:false});
   if(mode==='artifact'&&key.endsWith('/actions/artifacts/71')&&count===2)return Response.json({...fixture.responses.get('actions/artifacts/71')as object,digest:'sha256:'+'0'.repeat(64)});
   if(mode==='source'&&key.endsWith('/actions/runs/51/approvals')&&count===2)await writeFile(join(fixture.root,'README.md'),'changed after final source scan\n');
   if(mode==='hidden-source'&&key.endsWith('/actions/runs/51/approvals')&&count===2){execFileSync('git',['-C',fixture.root,'update-index','--assume-unchanged','README.md'],{windowsHide:true,stdio:'ignore'});await writeFile(join(fixture.root,'README.md'),'hidden changed after final source scan\n');}
   if(mode==='own-expiry'&&key.endsWith('/actions/runs/51/approvals')&&count===3)Date.now=()=>artifactExpiry;
   return original(raw,options);
  };
  try{await assert.rejects(api.readCompletedBackendWebTransferAdmission(fixture.input),/contents withheld/,mode);}finally{Date.now=originalClock;}
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

test('current full transfer preserves provider evidence and requires its exact source owner without changing historical inventories',async()=>{const api=await import('./backend-web-transfer'),fixture=backendWebTransferFixture(),manifest=structuredClone(fixture.transfer.manifest) as {database:{projectRef:string;dataApi:Record<string,unknown>}},at=fixture.transfer.earliestProofAt,evidence={version:1,purpose:'CUEVO_DATA_API_CONFIGURATION_OBSERVATION',source:'SUPABASE_MANAGEMENT_POSTGREST_CONFIG',projectRef:manifest.database.projectRef,sourceSha:fixture.expected.releaseSha,treeSha:fixture.expected.treeSha,url:`https://api.supabase.com/v1/projects/${manifest.database.projectRef}/postgrest`,configurationState:'DISABLED',configurationValueSha256:transferFixtureHash(canonicalReleaseExecutionJson('')),metadataBasis:'SUPPLIED_CURRENT_METADATA_PORT',metadataObservedAt:at,observedAt:at,verifiedAt:at,expiresAt:new Date(Date.parse(at)+3600000).toISOString(),effectAuthority:false,hostedAcceptance:false};Object.assign(manifest.database.dataApi,{version:2,configurationObservation:{evidence,sha256:transferFixtureHash(canonicalReleaseExecutionJson(evidence))}});const transfer={...fixture.transfer,version:3,manifest,manifestSha256:transferFixtureHash(canonicalReleaseExecutionJson(manifest)),producers:[...fixture.transfer.producers,{path:'scripts/verification/data-api-configuration.ts',sha256:'a'.repeat(64)}]};assert.equal(api.validateBackendWebTransfer(transfer,fixture.now).transfer.version,3);assert.throws(()=>api.validateBackendWebTransfer({...transfer,producers:fixture.transfer.producers},fixture.now));assert.throws(()=>api.validateBackendWebTransfer({...transfer,version:1},fixture.now));assert.equal(api.validateBackendWebTransfer(fixture.transfer,fixture.now).transfer.version,1);});

const guardedArchiveFixtureSource=String.raw`
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{createRequire,registerHooks,syncBuiltinESMExports}from'node:module';
const input=JSON.parse(readFileSync(process.env.CUEVO_GUARDED_WEB_FIXTURE,'utf8')),hash=value=>createHash('sha256').update(value).digest('hex');
const cp=createRequire(input.fixtureUrl)('node:child_process'),nativeExec=cp.execFileSync;let fullSourceAcquisitions=0;cp.execFileSync=(file,args,options)=>{if(file==='git'&&args.includes('--batch-check')&&new Error().stack.includes('readBackendReleaseSourceEvidenceAndGuard'))fullSourceAcquisitions++;return nativeExec(file,args,options);};syncBuiltinESMExports();
registerHooks({load(url,context,next){if(url.endsWith('/backend-web-transfer-admission.ts'))return{format:'module',shortCircuit:true,source:input.admissionSource};return next(url,context);}});
const{readCanonicalRuntimeJobsAndGuard}=await import(input.canonicalUrl),{prepareBackendReleaseIntent}=await import(input.contractsUrl),{canonicalReleaseExecutionJson}=await import(input.reviewUrl),{backendWebTransferFixture}=await import(input.fixtureUrl),{backendWebTransferProducerPaths}=await import(input.transferUrl),{readWebBackendBridgeAndGuard,readWebBackendBridge}=await import(input.bridgeUrl),api=await import(input.admissionUrl);
let archiveReads=0,transferArchiveReads=0,refreshing=false;const get=async path=>path==='actions/runs/31'?input.run:path.includes('/jobs?')?{total_count:input.jobs.length,jobs:input.jobs}:path.includes('/artifacts?')?{total_count:input.artifacts.length,artifacts:input.artifacts}:path.startsWith('git/commits/')?{sha:input.run.head_sha,tree:{sha:input.tree}}:assert.fail('Unexpected canonical metadata');
const archive=async id=>{archiveReads++;return Buffer.from(input.archives[String(id)],'base64');};
const canonical=await readCanonicalRuntimeJobsAndGuard(input.run,get,archive);assert.equal(archiveReads,10);const proof=canonical.proof;archiveReads=0;
const fixture=backendWebTransferFixture({now:input.modes.includes('metadata-capture-expiry')?Date.now()-86400000+120000:Date.now(),sourceSha:input.run.head_sha,treeSha:input.tree,baseSha:input.run.head_sha,sourceManifestSha256:hash(execFileSync('git',['ls-tree','-r','-z',input.run.head_sha])),diffSha256:hash(Buffer.alloc(0))});
fixture.transfer.manifest.database.migrations=[{version:'20261001000000',sha256:hash(Buffer.from('select 1;\n'))}];fixture.transfer.producers=backendWebTransferProducerPaths.map(path=>({path,sha256:hash(readFileSync(path))}));fixture.transfer.manifestSha256=hash(canonicalReleaseExecutionJson(fixture.transfer.manifest));
const body=JSON.parse(fixture.transfer.preparedApproval.canonicalJson);fixture.transfer.preparedApproval=prepareBackendReleaseIntent({...body,canonicalRuntimeVerification:proof},{...fixture.expected,canonicalRuntimeVerification:proof});fixture.approvals[0].comment=fixture.transfer.preparedApproval.comment;
const raw=canonicalReleaseExecutionJson(fixture.transfer),zip=await inputZip(raw),artifact={id:901,name:'cuevo-web-handover-51-1',size_in_bytes:zip.length,expired:false,digest:'sha256:'+hash(zip),created_at:new Date(Date.parse(fixture.completedRun.updated_at)-10000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),workflow_run:{id:51,head_sha:input.run.head_sha,head_branch:'main'}};
const environment={id:123,name:'staging',can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:95836629,login:'attaulhaq0',type:'User'}}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},protection={allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},enforce_admins:{enabled:true},required_status_checks:{strict:true,contexts:['required']},required_pull_request_reviews:{dismiss_stale_reviews:true,require_code_owner_reviews:false,required_approving_review_count:0,require_last_push_approval:false}};
const responses={'actions/runs/51':fixture.completedRun,'actions/artifacts/901':artifact,'':{full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'User'}},'git/ref/heads/main':{object:{type:'commit',sha:input.run.head_sha}},'actions/runs/31':input.run,'environments/staging':environment,'environments/staging/deployment-branch-policies':{total_count:1,branch_policies:[{name:'main',type:'branch'}]},'branches/main/protection':protection,'branches/main/protection/required_signatures':{enabled:true},['git/commits/'+input.run.head_sha]:{sha:input.run.head_sha,tree:{sha:input.tree},verification:{verified:true,reason:'valid',signature:'controlled-signature',payload:'controlled-payload'}},'actions/runs/51/approvals':fixture.approvals};
const signals=[];globalThis.fetch=async(raw,options)=>{signals.push(options.signal);assert.equal(options.method,'GET');const url=new URL(String(raw)),path=url.pathname.replace('/repos/owner/repo/','');if(path.endsWith('/zip')){assert.equal(new Headers(options.headers).get('Authorization'),'Bearer private-github-canary');const id=Number(path.split('/').at(-2));archiveReads+=id===901?0:1;transferArchiveReads+=id===901?1:0;return new Response(new Uint8Array(id===901?zip:Buffer.from(input.archives[String(id)],'base64')));}
 const value=url.pathname==='/repos/owner/repo'?responses['']:path.includes('/jobs?')||url.search&&path.includes('/jobs')?{total_count:input.jobs.length,jobs:input.jobs}:path.endsWith('/artifacts')?{total_count:input.artifacts.length,artifacts:input.artifacts}:responses[path];assert(value,'Unexpected native metadata '+path);return Response.json(value);
};
Object.assign(process.env,{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_WORKSPACE:process.cwd(),GITHUB_SHA:input.run.head_sha,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'owner/repo'});
const bridgeInput={selection:{backendRunId:'51',backendRunAttempt:1,artifactId:'901',transferSha256:hash(raw)},repoRoot:process.cwd(),githubToken:'private-github-canary',releaseSha:input.run.head_sha,ciRunId:'31',environment:'staging',web:{teamId:'team_Cuevo',projectId:'prj_Web',target:'preview'}};
console.error('REAL_WEB_GUARDED_READER_ENTERED');const results=[],originalRun=input.run,originalJobs=structuredClone(input.jobs),originalArtifacts=structuredClone(input.artifacts),originalNow=Date.now,originalReadme=readFileSync('README.md'),originalTransferDigest=artifact.digest;
for(const mode of input.modes){console.error('GUARDED_MODE '+mode);input.mode=mode;archiveReads=0;transferArchiveReads=0;signals.length=0;fullSourceAcquisitions=0;
if(mode==='metadata-constructor-failure'){const selected={...bridgeInput.selection,repoRoot:bridgeInput.repoRoot,githubToken:bridgeInput.githubToken,releaseSha:bridgeInput.releaseSha,ciRunId:bridgeInput.ciRunId,web:bridgeInput.web};try{await assert.rejects(api.readCompletedBackendWebTransferMetadataAndGuard(selected));assert(signals.every(signal=>signal.aborted),'Failed metadata constructor must dispose its captured reader');results.push({mode,cleanupConfirmed:true});}finally{delete process.env.GITHUB_JOB;}continue;}if(mode==='metadata-capture-expiry'){const selected={...bridgeInput.selection,repoRoot:bridgeInput.repoRoot,githubToken:bridgeInput.githubToken,releaseSha:bridgeInput.releaseSha,ciRunId:bridgeInput.ciRunId,web:bridgeInput.web},held=await api.testReadCompletedBackendCapture(selected);let reached=false;cp.execFileSync=(file,args,options)=>{const answer=nativeExec(file,args,options);if(file==='git'&&args.includes('HEAD^{tree}')&&new Error().stack.includes('assertOriginalValidity')){reached=true;Date.now=()=>Date.parse(fixture.transfer.consumptionExpiresAt);}return answer;};syncBuiltinESMExports();try{assert.throws(()=>held.capture.assertOriginalValidity(),'Original transfer expiry must be checked after final captured physical scan');assert.equal(reached,true);results.push({mode,archiveReads,transferArchiveReads,cleanupConfirmed:true});}finally{held.capture.dispose();cp.execFileSync=nativeExec;syncBuiltinESMExports();Date.now=originalNow;}continue;}
if(mode.startsWith('metadata')){assert.equal(typeof api.readCompletedBackendWebTransferMetadataAndGuard,'function','Reusable completed metadata guard missing');const selected={...bridgeInput.selection,repoRoot:bridgeInput.repoRoot,githubToken:bridgeInput.githubToken,releaseSha:bridgeInput.releaseSha,ciRunId:bridgeInput.ciRunId,web:bridgeInput.web},guard=await api.readCompletedBackendWebTransferMetadataAndGuard(selected),{githubToken:unused,...binding}=selected;void unused;const original=canonicalReleaseExecutionJson(guard.admission);assert.equal(archiveReads,10);assert.equal(transferArchiveReads,1);assert.equal(api.consumeCompletedBackendWebTransferMetadataGuard(guard,binding),guard);
try{if(mode==='metadata-valid'){for(let index=0;index<4;index++)await guard.refreshOriginalMetadata();assert.equal(archiveReads,10);assert.equal(transferArchiveReads,1);assert.equal(canonicalReleaseExecutionJson(guard.admission),original);for(const foreign of[null,{},JSON.parse(JSON.stringify(guard.admission)),new Proxy(guard,{get(){throw Error('Private proxy');}})])assert.throws(()=>api.consumeCompletedBackendWebTransferMetadataGuard(foreign,binding));}
else{if(mode==='metadata-overlap'){const originalFetch=globalThis.fetch;let entered,release;const began=new Promise(done=>entered=done),gate=new Promise(done=>release=done);globalThis.fetch=async(raw,options)=>{if(String(raw).endsWith('/actions/runs/31')){entered();await gate;}return originalFetch(raw,options);};const first=guard.refreshOriginalMetadata();await began;await assert.rejects(guard.refreshOriginalMetadata());release();await assert.rejects(first);globalThis.fetch=originalFetch;}if(mode==='metadata-runtimeenv'){process.env.GITHUB_JOB='changed';}if(mode==='metadata-approval')responses['actions/runs/51/approvals']=[];if(mode==='metadata-producer')writeFileSync(backendWebTransferProducerPaths[0],'Changed producer bytes');if(mode==='metadata-expiry')Date.now=()=>Date.parse(artifact.expires_at);if(mode==='metadata-binding')assert.throws(()=>api.consumeCompletedBackendWebTransferMetadataGuard(guard,{...binding,transferSha256:'0'.repeat(64)}));if(mode==='metadata-mutated')guard.admission.backendIdentity.sourceSha='0'.repeat(40);await assert.rejects(guard.refreshOriginalMetadata());assert.throws(()=>guard.assertOriginalValidity());}results.push({mode,archiveReads,transferArchiveReads,cleanupConfirmed:true});}
finally{guard.dispose();await assert.rejects(guard.refreshOriginalMetadata());cp.execFileSync=(file,args,options)=>{if(file==='git'&&args.includes('--batch-check')&&new Error().stack.includes('readBackendReleaseSourceEvidenceAndGuard'))fullSourceAcquisitions++;return nativeExec(file,args,options);};syncBuiltinESMExports();Date.now=originalNow;responses['actions/runs/51/approvals']=fixture.approvals;if(mode==='metadata-runtimeenv')delete process.env.GITHUB_JOB;if(mode==='metadata-producer')writeFileSync(backendWebTransferProducerPaths[0],'controlled original producer\n');}continue;}
const held=await readWebBackendBridgeAndGuard(bridgeInput);assert.equal(archiveReads,10);assert.equal(fullSourceAcquisitions,1,'one exact source-owner acquisition remains distinct from canonical transitive Git reads');assert.equal(JSON.stringify(held.bridge).includes('token'),false);assert.equal(Object.keys(held.token).length,0);
try{if(input.mode==='valid'||input.mode==='standalone'){const consumed=await api.consumeCompletedBackendCanonical(held.token,input.run);assert.deepEqual(consumed,proof);assert.equal(archiveReads,10);await assert.rejects(api.consumeCompletedBackendCanonical(held.token,input.run));assert(signals.every(signal=>signal.aborted));if(input.mode==='standalone'){archiveReads=0;const ordinary=await readWebBackendBridge(bridgeInput);assert.deepEqual(ordinary,held.bridge);assert.equal(archiveReads,10);assert(signals.every(signal=>signal.aborted));}results.push({mode,archiveReads,shapeUnchanged:true,oneUse:true,cleanupConfirmed:true});}
else{if(input.mode==='attempt'){input.run={...input.run,run_attempt:3};responses['actions/runs/31']=input.run;}if(input.mode==='job')input.jobs[0].conclusion='failure';if(input.mode==='artifact')input.artifacts[0].digest='sha256:'+'0'.repeat(64);if(input.mode==='transfer')artifact.digest='sha256:'+'0'.repeat(64);if(input.mode==='source')writeFileSync('late-source.txt','changed source');if(input.mode==='hidden-source'){execFileSync('git',['update-index','--assume-unchanged','README.md']);writeFileSync('README.md','Hidden source changed after bridge');}if(input.mode==='expiry')Date.now=()=>Date.parse(artifact.expires_at);if(input.mode==='canonical-expiry')Date.now=()=>Date.parse(input.artifacts[0].expires_at);if(input.mode==='raw')input.run={...input.run,extra:'changed'};if(input.mode==='main')responses['git/ref/heads/main']={object:{type:'commit',sha:'0'.repeat(40)}};if(input.mode==='approval')responses['actions/runs/51/approvals']=[];if(input.mode==='controls')responses['branches/main/protection/required_signatures']={enabled:false};
 const token=input.mode==='forged'?Object.freeze({}):input.mode==='serialized'?JSON.parse(JSON.stringify(held.token)):held.token;await assert.rejects(api.consumeCompletedBackendCanonical(token,input.run));api.disposeCompletedBackendCanonical(held.token);assert(signals.every(signal=>signal.aborted));results.push({mode,denied:input.mode,archiveReads,cleanupConfirmed:true});}
}finally{api.disposeCompletedBackendCanonical(held.token);Date.now=originalNow;input.run=originalRun;input.jobs=structuredClone(originalJobs);input.artifacts=structuredClone(originalArtifacts);responses['actions/runs/31']=originalRun;responses['git/ref/heads/main']={object:{type:'commit',sha:originalRun.head_sha}};responses['actions/runs/51/approvals']=fixture.approvals;responses['branches/main/protection/required_signatures']={enabled:true};artifact.digest=originalTransferDigest;if(mode==='source')await(await import('node:fs/promises')).unlink('late-source.txt');if(mode==='hidden-source'){writeFileSync('README.md',originalReadme);execFileSync('git',['update-index','--no-assume-unchanged','README.md']);}}
}console.log(JSON.stringify(results));
async function inputZip(text){const{createRequire}=await import('node:module'),{yazl}=createRequire(input.fixtureUrl)('playwright-core/lib/utilsBundle'),archive=new yazl.ZipFile(),parts=[],done=new Promise((yes,no)=>{archive.outputStream.on('data',part=>parts.push(part));archive.outputStream.on('error',no);archive.outputStream.on('end',()=>yes(Buffer.concat(parts)));});archive.addBuffer(Buffer.from(text),'web-transfer.json');archive.end();return done;}
`;
async function runGuardedArchiveFixture(modes:readonly string[]){return withCanonicalJobFixture('runtime',()=>undefined,{additionalSources:[{path:'README.md',bytes:'Original guarded source\n'},...backendWebTransferProducerPaths.map(path=>({path,bytes:'controlled original producer\n'})),{path:'supabase/migrations/20261001000000_fixture.sql',bytes:'select 1;\n'}]},async({fixture,run,jobs,artifacts,archives,tree})=>{
 // The original canonical fixture controls discovery; actual Git/source and all
 // ten locked ZIP readers remain native. Fixed transport/platform substitutions
 // only allow the hosted reader to execute inside this local isolated checkout.
 const script=join(fixture.root,'.local/guarded-web.mjs'),input=join(fixture.root,'.local/guarded-web.json'),admissionSource=transformSync(((modes.includes('metadata-constructor-failure')?readFileSync(resolve(import.meta.dirname,'backend-web-transfer-admission.ts'),'utf8').replace('const held=await readCompletedBackendCapture(value);try{const admission:',"const held=await readCompletedBackendCapture(value);process.env.GITHUB_JOB='constructor-drift';try{const admission:"):readFileSync(resolve(import.meta.dirname,'backend-web-transfer-admission.ts'),'utf8'))+'\nexport{readCompletedBackendCapture as testReadCompletedBackendCapture};').replace("process.platform !== 'linux'",'false').replace("!input.repoRoot.startsWith('/home/runner/work/')",'false'),{loader:'ts',format:'esm'}).code;
 await writeFile(input,JSON.stringify({modes,run,jobs,artifacts,archives,tree,admissionSource,canonicalUrl:pathToFileURL(resolve('scripts/verification/canonical-runtime-jobs.ts')).href,contractsUrl:pathToFileURL(resolve('scripts/verification/backend-release-contracts.ts')).href,reviewUrl:pathToFileURL(resolve('scripts/verification/release-review.ts')).href,fixtureUrl:pathToFileURL(resolve('scripts/verification/backend-web-transfer-fixtures.ts')).href,transferUrl:pathToFileURL(resolve('scripts/verification/backend-web-transfer.ts')).href,bridgeUrl:pathToFileURL(resolve('scripts/verification/web-backend-bridge.ts')).href,admissionUrl:pathToFileURL(resolve('scripts/verification/backend-web-transfer-admission.ts')).href}));await writeFile(script,guardedArchiveFixtureSource);
 return spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(fixture.hook).href,script],{cwd:fixture.root,encoding:'utf8',env:{...process.env,CUEVO_CANONICAL_FIXTURE_CONFIG:fixture.hookInput,CUEVO_GUARDED_WEB_FIXTURE:input},timeout:180000});
});}
test('guarded web canonical ownership consumes ten actual archives and refuses drift forgery expiry without reacquisition',async()=>{
 const modes=['valid','attempt','job','artifact','transfer','source','hidden-source','expiry','canonical-expiry','raw','forged','serialized','main','approval','controls','standalone'],groups=[modes.slice(0,8),modes.slice(8)];const rows:{mode:string;archiveReads:number;cleanupConfirmed:boolean;denied?:string}[]=[];for(const group of groups){const result=await runGuardedArchiveFixture(group);assert.equal(result.status,0,result.stderr);const observed=JSON.parse(result.stdout)as typeof rows;assert.deepEqual(observed.map(row=>row.mode),group);rows.push(...observed);}assert.deepEqual(rows.map(row=>row.mode),modes);assert.equal(new Set(rows.map(row=>row.mode)).size,modes.length);
 for(const output of rows){assert.equal(output.archiveReads,10);assert.equal(output.cleanupConfirmed,true);if(!['valid','standalone'].includes(output.mode))assert.equal(output.denied,output.mode);}
});

test('reusable completed metadata guard acquires one transfer and ten canonical ZIPs while fresh metadata and denials remain',async()=>{const modes=['metadata-valid','metadata-approval','metadata-producer','metadata-expiry','metadata-binding','metadata-mutated','metadata-overlap','metadata-runtimeenv'],groups=[modes.slice(0,4),modes.slice(4)];const rows:{mode:string;archiveReads:number;transferArchiveReads:number}[]=[];for(const group of groups){const result=await runGuardedArchiveFixture(group);assert.equal(result.status,0,result.stderr);const observed=JSON.parse(result.stdout)as typeof rows;assert.deepEqual(observed.map(row=>row.mode),group);rows.push(...observed);}assert.deepEqual(rows.map(row=>row.mode),modes);assert.equal(new Set(rows.map(row=>row.mode)).size,modes.length);for(const row of rows){assert.equal(row.archiveReads,10);assert.equal(row.transferArchiveReads,1);}});

 test('captured completed transfer expiry is checked after actual physical scan',async()=>{const result=await runGuardedArchiveFixture(['metadata-capture-expiry']);assert.equal(result.status,0,result.stderr);});

 test('failed metadata constructor disposes its actual captured transport lifetime',async()=>{const result=await runGuardedArchiveFixture(['metadata-constructor-failure']);assert.equal(result.status,0,result.stderr);});
/** Reduced composition: actual native population observer, exporter, ZIP,
 * completed admission, web bridge and learning gate. The handover adapter below
 * substitutes unrelated full-handover gates and forwards only actual native
 * proof; this test does not claim full handover or browser acceptance. */
const installedPopulationLearningFixtureSource = String.raw`
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire, registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
const input = JSON.parse(readFileSync(process.env.CUEVO_POPULATION_LEARNING_FIXTURE, 'utf8'));
const root = process.cwd(), hash = value => createHash('sha256').update(value).digest('hex');
const clock = Date.parse('2026-10-10T13:00:00Z'), NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(value) { super(value === undefined ? clock : value); }
  static now() { return clock; }
};
delete process.env.NODE_OPTIONS;
const state = { nativeReads: 0, nativeSessionsClosed: 0, originalReads: 0,
  schemaWrites: 0, seedWrites: 0, authCreates: 0, apiUploads: 0, edgeUploads: 0,
  populationGateEntries: 0, webReadmits: 0, canonicalArchives: 0, transferArchives: 0, nonGithubGets: 0 };
globalThis.populationLearningGateEntered = () => { state.populationGateEntries++; };
const handles = new WeakMap();
let expected, prepared, populationInput, original, history, handoverBase;
globalThis.populationLearningAdmission = {
  prepare: async value => { const handle = Object.freeze({}); handles.set(handle,
    { binding: JSON.stringify({ repoRoot: value.repoRoot, expected: value.expected,
      prepared: value.prepared, effectScope: value.effectScope }), disposed: false }); return handle; },
  read: async (handle, value) => { const held = handles.get(handle);
    assert(held && !held.disposed); assert.equal(held.binding, JSON.stringify(value));
    return { expected, provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE',
      approval: { packageSha256: prepared.sha256 } }; },
  dispose: handle => { const held = handles.get(handle); assert(held && !held.disposed);
    held.disposed = true; }
};
const { transformSync } = createRequire(input.transferUrl)('esbuild');
let raceReplaced = false;
globalThis.populationLearningSavedFileRead = path => {
  if(input.mode!=='saved-file-race'||raceReplaced||!String(path).endsWith('web-handover-result.json'))return;
  const changed=JSON.parse(readFileSync(path,'utf8'));changed.installedPopulationVerification.original.manifestSha256='f'.repeat(64);
  writeFileSync(path,JSON.stringify(changed)+String.fromCharCode(10));raceReplaced=true;
};
const replaceOnce = (source, anchor, replacement) => {
  assert.equal(source.split(anchor).length - 1, 1, 'Exact test-only hook anchor changed: ' + anchor);
  return source.replace(anchor, replacement);
};
registerHooks({ load(url, context, next) {
  if (url === input.observerUrl) {
    let source = readFileSync(new URL(url), 'utf8');
    source = replaceOnce(source,
      "import { prepareNativeBackendReleaseAdmission, readNativeBackendReleaseAdmission, disposeNativeBackendReleaseAdmission, type NativeBackendAdmissionHandle } from '../verification/backend-release-admission';",
      "const prepareNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.prepare;const readNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.read;const disposeNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.dispose;");
    source = replaceOnce(source,
      "import { createHostedMigrationDatabase, hostedSyntheticSeedSha256, readOriginalSyntheticSeed } from './hosted-migration-database';",
      "import { hostedSyntheticSeedSha256, readOriginalSyntheticSeed } from './hosted-migration-database';const createHostedMigrationDatabase=(...args)=>globalThis.populationLearningDatabase(...args);");
    source = replaceOnce(source,
      "import { readHostedOperatorStorageInventory } from './hosted-operator-storage-inventory';",
      "const readHostedOperatorStorageInventory=(...args)=>globalThis.populationLearningStorage(...args);");
    return { format: 'module', shortCircuit: true,
      source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
  }
  if (url === input.transferUrl) {
    let source = readFileSync(new URL(url), 'utf8');
    source = replaceOnce(source,
      "import {prepareNativeBackendReleaseAdmission,readNativeBackendReleaseAdmission,disposeNativeBackendReleaseAdmission,type NativeBackendAdmissionHandle} from './backend-release-admission';",
      "const prepareNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.prepare;const readNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.read;const disposeNativeBackendReleaseAdmission=globalThis.populationLearningAdmission.dispose;");
    source = replaceOnce(source, 'const handover = await prepareBackendWebHandover(input,admissionHandle);',
      'const handover = await globalThis.populationLearningHandover(input,admissionHandle);');
    source = replaceOnce(source, 'const rechecked = await prepareBackendWebHandover(input);',
      'const rechecked = await globalThis.populationLearningHandover(input);');
    source = replaceOnce(source, "process.platform !== 'linux'", 'false');
    source = replaceOnce(source, "process.env.GITHUB_WORKSPACE !== root || !root.startsWith('/home/runner/work/')",
      'process.env.GITHUB_WORKSPACE !== root || false');
    source = replaceOnce(source, 'return bytes;' + String.fromCharCode(10) + '}',
      'globalThis.populationLearningSavedFileRead(path);return bytes;' + String.fromCharCode(10) + '}');
    return { format: 'module', shortCircuit: true,
      source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
  }
  if (url === input.admissionUrl) {
    let source = readFileSync(new URL(url), 'utf8');
    source = replaceOnce(source, "process.platform !== 'linux'", 'false');
    source = replaceOnce(source, "!input.repoRoot.startsWith('/home/runner/work/')", 'false');
    return { format: 'module', shortCircuit: true,
      source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
  }
  if (url === input.browserUrl) {
    let source = readFileSync(new URL(url), 'utf8');
    source = replaceOnce(source, "process.platform!=='linux'", 'false');
    source = replaceOnce(source, "!root.startsWith('/home/runner/work/')", 'false');
    return { format: 'module', shortCircuit: true,
      source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
  }
  if (url === input.learningUrl) {
    const gate = "if(requireCompletedBackendPopulationEvidence(admitted).receiptSha256!==input.populationReceiptSha256)throw failure();";
    let source = readFileSync(new URL(url), 'utf8');
    // Observe reachability only. Preserve the exact production condition and
    // refusal so an unrelated early denial cannot be reported as this RED.
    source = replaceOnce(source, gate, 'globalThis.populationLearningGateEntered();' + String.fromCharCode(10) + gate);
    return { format: 'module', shortCircuit: true,
      source: transformSync(source, { loader: 'ts', format: 'esm' }).code };
  }
  return next(url, context);
}});
const review = await import(input.reviewUrl);
const planOwner = await import(input.planUrl);
const installed = await import(input.installedUrl);
const observer = await import(input.observerUrl);
const { prepareBackendReleaseIntent } = await import(input.contractsUrl);
const { backendWebTransferFixture } = await import(input.fixtureUrl);
const canonical = await import(input.canonicalUrl);
const admission = await import(input.admissionUrl);
const bridge = await import(input.bridgeUrl);
const transfer = await import(input.transferUrl);
const { canonicalReleaseExecutionJson: json, canonicalReleaseReviewJson: reviewJson } = review;
const project = 'mqxdjvsyckzocokuikmx';
const endpoint = { projectRef: project, kind: 'direct', host: 'db.' + project + '.supabase.co',
  port: 5432, database: 'postgres' };
const manifest = JSON.parse(readFileSync('supabase/seed/identities.json', 'utf8'));
const id = (prefix, number) => prefix + String(number).padStart(12, '0');
const school = id('10000000-0000-4000-8000-', 1);
const denial = id('10000000-0000-4000-8000-', 2);
const actor = number => id('20000000-0000-4000-8000-', number);
const relation = (schoolId, fields) => ({ schoolId, ...fields, status: 'active',
  effectiveFrom: '2026-09-01 00:00:00+00', effectiveTo: null });
const population = { observedAtMs: clock, authUsers: [], population: {
  schools: [{ id: school, name: 'Cuevo Reference Academy – Doha', countryCode: 'QA',
    languages: ['en', 'ar'], status: 'active' }, { id: denial, name: 'Synthetic Isolation School',
    countryCode: 'QA', languages: ['en', 'ar'], status: 'active' }],
  people: manifest.actors.map(row => ({ schoolId: row.schoolId, actorId: row.actorId,
    displayName: row.displayName, synthetic: true })),
  memberships: manifest.actors.map((row, index) => ({ id: id('21000000-0000-4000-8000-', index + 1),
    ...relation(row.schoolId, { actorId: row.actorId, role: row.role }) })),
  academicYears: [1, 2].map(index => ({ schoolId: index === 1 ? school : denial,
    id: id('40000000-0000-4000-8000-', index), name: '2026–2027',
    startsOn: '2026-09-01', endsOn: '2027-07-01' })),
  terms: [1, 2].map(index => ({ schoolId: index === 1 ? school : denial,
    id: id('41000000-0000-4000-8000-', index), academicYearId: id('40000000-0000-4000-8000-', index),
    name: 'Autumn term', startsOn: '2026-09-01', endsOn: '2026-12-20' })),
  yearGroups: [1, 2, 3, 4, 5].map(index => ({ schoolId: index < 5 ? school : denial,
    id: id('42000000-0000-4000-8000-', index), name: index < 5 ? 'Year ' + index : 'Isolation Year Group',
    ordinal: index < 5 ? index : 1 })),
  classes: [1, 2, 3, 4, 5, 6, 7].map(index => ({ schoolId: index < 7 ? school : denial,
    id: id('30000000-0000-4000-8000-', index), academicYearId: id('40000000-0000-4000-8000-', index < 7 ? 1 : 2),
    yearGroupId: id('42000000-0000-4000-8000-', index < 7 ? (index - 1) % 4 + 1 : 5),
    name: ['Year 1 · Cedar', 'Year 2 · Maple', 'Year 3 · Willow', 'Year 4 · Oak',
      'Year 1 · Olive', 'Year 2 · Palm', 'Isolation Class'][index - 1], status: 'active' })),
  subjects: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(index => ({ schoolId: index < 9 ? school : denial,
    id: id('43000000-0000-4000-8000-', index), name: ['Mathematics', 'English', 'Arabic',
      'Science', 'Computing', 'Art', 'Physical Education', 'School Custom Project', 'Isolation Subject'][index - 1] })),
  enrollments: [...Array.from({ length: 60 }, (_, index) => relation(school,
    { classId: id('30000000-0000-4000-8000-', index % 6 + 1), studentActorId: actor(index + 12) })),
    relation(denial, { classId: id('30000000-0000-4000-8000-', 7), studentActorId: actor(133) })],
  teacherAssignments: Array.from({ length: 8 }, (_, index) => relation(school,
    { classId: id('30000000-0000-4000-8000-', index % 6 + 1),
      subjectId: id('43000000-0000-4000-8000-', index + 1), teacherActorId: actor(index + 4) })),
  parentRelationships: Array.from({ length: 60 }, (_, index) => relation(school,
    { parentActorId: actor(index + 72), studentActorId: actor(index + 12), relationshipType: 'guardian' })),
  entitlements: [...['school.context', 'learning', 'assessment', 'curriculum', 'learner.state',
    'improvement', 'school.operations', 'community', 'portfolio'].flatMap(code => [school, denial].map(schoolId =>
      ({ schoolId, code, enabled: true, effectiveFrom: '2026-09-01 00:00:00+00', effectiveTo: null }))),
    { schoolId: school, code: 'restricted.records', enabled: true,
      effectiveFrom: '2026-09-01 00:00:00+00', effectiveTo: null }],
  learnerStatePolicies: [{ schoolId: school, version: 1, developmentWindowDays: 14, approvedBy: actor(2) },
    { schoolId: denial, version: 1, developmentWindowDays: 14, approvedBy: actor(132) }],
  intelligencePolicies: [{ schoolId: school, version: 1, fixtureEnabled: true, liveEnabled: false, approvedBy: actor(2) },
    { schoolId: denial, version: 1, fixtureEnabled: true, liveEnabled: false, approvedBy: actor(132) }],
  schoolCustomVersions: [{ schoolId: school, id: id('60000000-0000-4000-8000-', 1),
    version: 'synthetic-school-1', sourceType: 'SCHOOL_AUTHORED', rightsStatus: 'PERMITTED', createdBy: actor(2) }],
  schoolCustomReferences: [{ schoolId: school, id: id('61000000-0000-4000-8000-', 1),
    versionId: id('60000000-0000-4000-8000-', 1), title: 'Synthetic school-authored explanation objective',
    description: 'Demonstration objective created by the synthetic school; not an official curriculum standard.',
    code: null, status: 'APPROVED', createdBy: actor(2), approvedBy: actor(2),
    approvedAt: '2026-10-01 00:00:00+00' }]
}};
let locked = false;
globalThis.populationLearningDatabase = async () => ({
  withLock: async (key, run) => { assert.equal(key, project + ':HOSTED_SCHEMA_MIGRATION');
    assert.equal(locked, false); locked = true;
    try { await run(); } finally { locked = false; state.nativeSessionsClosed++; }
    return { kind: 'RELEASED' }; },
  observe: async () => { assert(locked); return { operator: 'postgres', database: 'postgres',
    tls: { kind: 'PEER_VERIFIED', host: endpoint.host, certificateSha256: 'b'.repeat(64) },
    historyPresent: true, history: structuredClone(history) }; },
  observeStage: async () => { assert(locked); return { observedAtMs: clock,
    checks: { rls: true, privateStorage: true, transportPrivate: true, dispatchInactive: false,
      recoveryCronInactive: false } }; },
  observeSyntheticPopulation: async () => { assert(locked); return structuredClone(population); },
  readInstalledPopulation: async () => { assert(locked); state.originalReads++;
    return installed.readInstalledPopulationReceipt([{ state: 'COMPLETED',
      fingerprint: installed.installedPopulationFingerprint(original), response: structuredClone(original) }], project); },
  executeOriginalSyntheticSeed: async () => { state.seedWrites++; throw Error('No seed in installed observation'); }
});
globalThis.populationLearningStorage = async () => { assert(locked); return { observedAtMs: clock,
  applicationStorageObjects: 0, remoteProjectSha256: 'd'.repeat(64), operations: [] }; };
const setupGet = path => path === 'actions/runs/31' ? input.run :
  path.includes('/jobs?') ? { total_count: input.jobs.length, jobs: input.jobs } :
  path.includes('/artifacts?') ? { total_count: input.artifacts.length, artifacts: input.artifacts } :
  path.startsWith('git/commits/') ? { sha: input.run.head_sha, tree: { sha: input.tree } } :
  assert.fail('Unexpected canonical metadata ' + path);
const canonicalProof = await canonical.readCanonicalRuntimeJobsAndGuard(input.run, async path => setupGet(path),
  async artifactId => Buffer.from(input.archives[String(artifactId)], 'base64'));
const proof = canonicalProof.proof;
assert.equal(proof.runAttempt, 2);
const sources = planOwner.readCanonicalMigrationSources({ repoRoot: root,
  sourceSha: input.run.head_sha, treeSha: input.tree }).sources;
const initialPlan = planOwner.planHostedMigrations({ sources, source: { sha: input.run.head_sha, tree: input.tree },
  now: clock, target: { projectRef: project, boundProjectRef: project, projectName: 'Cuevo',
    projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', observedAt: new Date().toISOString(),
    authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY' } });
const plan = { ...initialPlan, mode: 'INCREMENTAL', applied: initialPlan.migrations.map(({ version, sha256 }) =>
  ({ version, sha256 })), pending: [], stages: initialPlan.stages.map(stage => ({ ...stage, names: [] })),
  observedHistorySha256: hash(JSON.stringify(initialPlan.migrations.map(row => row.version).sort())),
  priorCompletedRelease: { sourceSha: input.run.head_sha, treeSha: input.tree,
    migrationCount: initialPlan.migrations.length }, runtimeOnly: true };
const planDigest = planOwner.canonicalHostedMigrationPlan(plan).sha256;
history = plan.migrations.map(row => ({ version: row.version, name: row.name.slice(15, -4),
  statements: [Buffer.from(sources.find(source => source.name === row.name).bytes).toString('utf8').trim()] }));
const fixture = backendWebTransferFixture({ now: clock, sourceSha: input.run.head_sha, treeSha: input.tree,
  baseSha: input.run.head_sha, sourceManifestSha256: hash(execFileSync('git', ['ls-tree', '-r', '-z', input.run.head_sha])),
  diffSha256: hash(Buffer.alloc(0)) });
const body = JSON.parse(fixture.transfer.preparedApproval.canonicalJson);
const activation = { status: 'ACTIVATED_VERIFIED', observedAt: new Date(clock - 3600000).toISOString() };
const installedRuntime = { version: 1, purpose: 'CUEVO_INSTALLED_ACTIVE_RUNTIME',
  sourceSha: input.run.head_sha, treeSha: input.tree, originalRunId: '11', originalRunAttempt: 1,
  originalPackageSha256: 'a'.repeat(64), runtimeSha256: 'b'.repeat(64), apiDeploymentId: 'dpl_Api',
  apiUrl: 'https://cuevo-api-deployment.vercel.app', edgeId: 'edge-fixture', edgeVersion: 1,
  activationId: '10000000-0000-4000-8000-000000000002',
  vaultSecretName: 'cuevo_worker_10000000000040008000000000000002', jobId: 42,
  endpoint: body.targets.supabase.edgeOrigin, activationReceiptSha256: hash(json(activation)) };
const installedSource = { sourceSha: input.run.head_sha, treeSha: input.tree,
  seedSha256: installed.hostedSyntheticSeedSha256, manifestSha256: hash(json(manifest)),
  migrationCount: plan.migrations.length };
const fingerprints = { ...body.fingerprints, migrationPlanSha256: planDigest,
  migrationEndpointSha256: hash(json(endpoint)) };
const currentRuntime={version:2,purpose:'CUEVO_CURRENT_ACTIVE_RUNTIME',originalActivation:installedRuntime,
  current:{generation:'2',sourceSha:input.run.head_sha,treeSha:input.tree,runId:'21',runAttempt:1,packageSha256:'9'.repeat(64),runtimeSha256:installedRuntime.runtimeSha256,apiArtifactSha256:fingerprints.apiArtifactSha256,edgeArtifactSha256:fingerprints.edgeArtifactSha256,denoLockSha256:fingerprints.denoLockSha256,migrationSetSha256:'8'.repeat(64),compatibilitySha256:'7'.repeat(64),apiDeploymentId:installedRuntime.apiDeploymentId,apiUrl:installedRuntime.apiUrl,edgeId:installedRuntime.edgeId,edgeVersion:installedRuntime.edgeVersion},activationReceiptSha256:installedRuntime.activationReceiptSha256,stateSha256:'e'.repeat(64)};
const selectedRuntime=input.mode==='current-runtime'?{currentRuntime}:{installedRuntime};
expected = { ...fixture.expected, ciRun: input.run, canonicalRuntimeVerification: proof,
  fingerprints, ...selectedRuntime, installedSource, executionScope: 'installed-runtime' };
prepared = prepareBackendReleaseIntent({ ...body, fingerprints, ...selectedRuntime, installedSource,
  executionScope: 'installed-runtime', canonicalRuntimeVerification: proof }, expected);
original = installed.installedPopulationReceiptSchema.parse({ version: 1,
  purpose: 'CUEVO_INSTALLED_SYNTHETIC_POPULATION', projectRef: project,
  sourceSha: installedSource.sourceSha, treeSha: installedSource.treeSha,
  seedSha256: installedSource.seedSha256, manifestSha256: installedSource.manifestSha256 });
const originalText = json(original);
populationInput = { repoRoot: root, endpoint, expected, preparedApproval: prepared,
  githubToken: 'private-github-canary', providerToken: 'private-provider-canary',
  journalStorageKey: 'private-journal-canary', operatorStoragePolicyPath: 'unused-policy.json',
  certificate: { path: 'unused-ca.pem', sha256: 'b'.repeat(64) }, migrationPassword: 'private-migration-canary',
  plan, stageIdentity: { projectRef: project, sourceSha: input.run.head_sha, treeSha: input.tree,
    planSha256: planDigest, stageId: 'remaining', stageSha256: 'c'.repeat(64),
    databaseUrl: 'postgresql://postgres@' + endpoint.host + ':5432/postgres?sslmode=verify-full',
    approvalDigest: prepared.sha256, ciRunId: '31', certificateSha256: 'b'.repeat(64) } };
const output = fixture.transfer.manifest;
output.database.migrations = plan.migrations.map(({ version, sha256 }) => ({ version, sha256 }));
const at = output.verifiedAt, config = { version: 1,
  purpose: 'CUEVO_DATA_API_CONFIGURATION_OBSERVATION', source: 'SUPABASE_MANAGEMENT_POSTGREST_CONFIG',
  projectRef: project, sourceSha: input.run.head_sha, treeSha: input.tree,
  url: 'https://api.supabase.com/v1/projects/' + project + '/postgrest',
  configurationState: 'DISABLED', configurationValueSha256: hash(json('')),
  metadataBasis: 'SUPPLIED_CURRENT_METADATA_PORT', metadataObservedAt: at, observedAt: at, verifiedAt: at,
  expiresAt: new Date(Date.parse(at) + 3600000).toISOString(), effectAuthority: false, hostedAcceptance: false };
const { validateDisabledDataApiConfigurationEvidence } = await import(new URL('./data-api-configuration.ts', input.transferUrl).href);
assert.equal(validateDisabledDataApiConfigurationEvidence(config, { projectRef: project,
  sourceSha: input.run.head_sha, treeSha: input.tree, now: clock }).basis, 'SUPABASE_MANAGEMENT_POSTGREST_CONFIG');
output.database.dataApi = { ...output.database.dataApi, version: 2,
  configurationObservation: { evidence: config, sha256: hash(json(config)) } };
const outputDigest = hash(reviewJson(output));
const folder = join(root, '.local/hosted-release');
mkdirSync(folder, { recursive: true });
const write = (name, value, lf = false) => writeFileSync(join(folder, name),
  lf ? JSON.stringify(value) + String.fromCharCode(10) : json(value));
write('web-handover-manifest.json', output); write('web-handover-public.json', output.publicConfig);
handoverBase = { status: 'PREPARED_STAGING_MANIFEST', pendingGates: [],
  manifestPath: join(folder, 'web-handover-manifest.json'), publicConfigurationPath: join(folder, 'web-handover-public.json'),
  manifestSha256: outputDigest, receiptScope: 'BOUNDED_NATIVE_BACKUP_ISOLATED_DATABASE_SESSION_AND_OWNED_PRIVATE_BYTES',
  restorationLimitations: [], activationAllowed: false, hostedAcceptance: false };
let latestNativeProof;
globalThis.populationLearningHandover = async () => {
  // Explicit reduced-core adapter: unrelated full handover gates use fixture
  // manifest metadata. Population proof ALWAYS comes from the actual observer.
  latestNativeProof = await observer.revalidateInstalledBackendState(populationInput);
  state.nativeReads++;
  assert.equal(latestNativeProof.installedPopulationSha256, hash(originalText));
  assert.equal(json(latestNativeProof.original), originalText);
  assert.equal(latestNativeProof.history.length, plan.migrations.length);
  assert.equal(latestNativeProof.observedAt, new Date(clock).toISOString());
  // The baseline observer has no version-two projection. If the real owner
  // gains it, forward it unchanged; never fabricate future proof in this test.
  return { ...handoverBase, ...(latestNativeProof.installedPopulationVerification ?
    { installedPopulationVerification: latestNativeProof.installedPopulationVerification } : {}) };
};
for (const name of transfer.backendWebTransferEvidenceNames('dpl_Api', true, input.mode==='current-runtime'))
  if (!['web-handover-result.json', 'runtime-resume-result.json', 'web-settings-result.json'].includes(name))
    write(name, { observedAt: at, status: 'VERIFIED' }, true);
write('runtime-resume-result.json', input.mode==='current-runtime'?{status:'CURRENT_RUNTIME_REVALIDATED',sourceSha:input.run.head_sha,treeSha:input.tree,runId:'51',runAttempt:1,packageSha256:prepared.sha256,sourceProcessed:true,scheduledRecoveryVerified:true,nativeExecutionVerified:true,privateTransportVerified:true,lockReleased:true,sessionClosed:true,current:currentRuntime,observedAt:at}:{ status: 'INSTALLED_RUNTIME_REVALIDATED',
  sourceSha: input.run.head_sha, runId: '51', runAttempt: 1, packageSha256: prepared.sha256,
  nativeExecutionVerified: true, lockReleased: true, original: installedRuntime,
  activation, cleanup: { lockReleased: true, sessionsClosed: true }, observedAt: at }, true);
write('web-settings-result.json', { purpose: 'CUEVO_STAGING_PUBLIC_WEB_SETTINGS',
  status: 'WEB_PUBLIC_SETTINGS_CONFIRMED', operation: 'NOOP', sourceSha: input.run.head_sha,
  runId: '51', runAttempt: 1, packageSha256: prepared.sha256, manifestSha256: outputDigest,
  webProjectId: 'prj_Web', teamId: 'team_Cuevo', observedAt: at,
  settingsSha256: fixture.transfer.settings.settingsSha256, pendingGates: [],
  hostedAcceptance: false, canonicalReceipt: null }, true);
const bundle = { purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected, preparedApproval: prepared };
write('backend-bundle.json', bundle);
const responses = {
  '': { full_name: 'owner/repo', name: 'repo', owner: { id: 1, login: 'owner', type: 'User' } },
  'git/ref/heads/main': { object: { type: 'commit', sha: input.run.head_sha } },
  'actions/runs/31': input.run,
  'environments/staging': { id: 123, name: 'staging', can_admins_bypass: false,
    protection_rules: [{ type: 'required_reviewers', prevent_self_review: false,
      reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } },
  'environments/staging/deployment-branch-policies': { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] },
  'branches/main/protection': { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
    enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] },
    required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false,
      required_approving_review_count: 0, require_last_push_approval: false } },
  'branches/main/protection/required_signatures': { enabled: true },
  ['git/commits/' + input.run.head_sha]: { sha: input.run.head_sha, tree: { sha: input.tree },
    verification: { verified: true, reason: 'valid', signature: 'controlled-signature', payload: 'controlled-payload' } }
};
let transferZip, transferArtifact;
globalThis.fetch = async (raw, options) => {
  assert.equal(options.method, 'GET'); const url = new URL(String(raw));
  if (url.origin === 'https://api.supabase.com') {
    state.nonGithubGets++; assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer private-provider-canary');
    if (url.pathname.endsWith('/config/database/pooler')) return Response.json([{
      identifier: project, database_type: 'PRIMARY', db_user: 'postgres.' + project,
      db_host: 'aws-0-ap-southeast-1.pooler.supabase.com', db_port: 5432,
      db_name: 'postgres', pool_mode: 'session' }]);
    assert.equal(url.pathname, '/v1/projects/' + project);
    return Response.json({ id: project, name: 'Cuevo', status: 'ACTIVE_HEALTHY',
      database: { host: endpoint.host, version: '17.4', postgres_engine: '17' } });
  }
  assert.equal(url.origin, 'https://api.github.com');
  assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer private-github-canary');
  const path = url.pathname.replace('/repos/owner/repo/', '');
  if (path.endsWith('/zip')) {
    const artifactId = Number(path.split('/').at(-2));
    if (artifactId === 901) { state.transferArchives++; return new Response(new Uint8Array(transferZip)); }
    state.canonicalArchives++;
    return new Response(new Uint8Array(Buffer.from(input.archives[String(artifactId)], 'base64')));
  }
  const value = url.pathname === '/repos/owner/repo' ? responses[''] :
    path.includes('/jobs') ? { total_count: input.jobs.length, jobs: input.jobs } :
    path.endsWith('/artifacts') ? { total_count: input.artifacts.length, artifacts: input.artifacts } : responses[path];
  assert(value, 'Unexpected metadata ' + path); return Response.json(value);
};
Object.assign(process.env, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_WORKSPACE: root, GITHUB_SHA: input.run.head_sha, GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1' });
const savedHandover = await globalThis.populationLearningHandover();
write('web-handover-result.json', savedHandover, true);
const savedBytes = readFileSync(join(folder, 'web-handover-result.json'));
let exported;
try {
  exported = await transfer.exportBackendWebTransfer({ repoRoot: root, bundleSha256: hash(json(bundle)),
    githubToken: 'private-github-canary', vercelToken: 'private-vercel-canary',
    installedOperator: { providerToken: 'private-provider-canary', journalStorageKey: 'private-journal-canary',
      migrationPassword: 'private-migration-canary' } });
} catch (error) {
  console.error(JSON.stringify({ fixturePhase: 'EXPORTER_SETUP_REFUSAL', nativeReads: state.nativeReads,
    nativeSessionsClosed: state.nativeSessionsClosed, originalReads: state.originalReads }));
  if(input.mode==='saved-file-race'){assert.equal(raceReplaced,true);assert.equal(createRequire(input.transferUrl)('node:fs').existsSync(join(folder,'web-transfer.json')),false);console.log(JSON.stringify({phase:'SAVED_FILE_RACE_REFUSED',raceReplaced:true}));process.exit(0);}
  throw error;
}
if(input.mode==='saved-file-race')assert.fail('Changed saved population result must refuse export before web-transfer creation');
const transferBytes = readFileSync(exported.transferPath);
assert.equal(hash(transferBytes), exported.transferSha256);
const parsed = transfer.validateBackendWebTransfer(JSON.parse(transferBytes.toString('utf8')), clock);
assert.equal(parsed.transfer.evidence.some(row => row.name === 'population-result.json'), false);
assert.equal(parsed.transfer.evidence.find(row => row.name === 'web-handover-result.json').sha256, hash(savedBytes));
assert.equal(readFileSync(join(folder, 'web-handover-result.json')).equals(savedBytes), true);
const { yazl } = createRequire(input.transferUrl)('playwright-core/lib/utilsBundle');
const zip = new yazl.ZipFile(), pieces = [];
const zipped = new Promise((yes, no) => { zip.outputStream.on('data', chunk => pieces.push(chunk));
  zip.outputStream.on('error', no); zip.outputStream.on('end', () => yes(Buffer.concat(pieces))); });
zip.addBuffer(transferBytes, 'web-transfer.json'); zip.end(); transferZip = await zipped;
assert.deepEqual(await admission.readBackendWebTransferArchive(transferZip, hash(transferZip),
  exported.transferSha256), JSON.parse(transferBytes.toString('utf8')));
fixture.approvals[0].comment = prepared.comment;
responses['actions/runs/51'] = { ...fixture.completedRun, updated_at: new Date(clock).toISOString() };
transferArtifact = { id: 901, name: 'cuevo-web-handover-51-1', size_in_bytes: transferZip.length,
  expired: false, digest: 'sha256:' + hash(transferZip), created_at: new Date(clock).toISOString(),
  expires_at: new Date(clock + 86400000).toISOString(),
  workflow_run: { id: 51, head_sha: input.run.head_sha, head_branch: 'main' } };
responses['actions/artifacts/901'] = transferArtifact;
responses['actions/runs/51/approvals'] = fixture.approvals;
const selection = { backendRunId: '51', backendRunAttempt: 1, artifactId: '901',
  transferSha256: exported.transferSha256 };
const admitted = await bridge.readWebBackendBridge({ selection, repoRoot: root,
  githubToken: 'private-github-canary', releaseSha: input.run.head_sha, ciRunId: '31',
  environment: 'staging', web: { teamId: 'team_Cuevo', projectId: 'prj_Web', target: 'preview' } });
assert.equal(admitted.purpose, 'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION');
assert.equal(admitted.backendIdentity.transferSha256, exported.transferSha256);
assert.equal(admitted.backendIdentity.artifactSha256, hash(transferZip));
assert.equal(admitted.originalEvidence.some(row => row.name === 'population-result.json'), false);
assert.equal(admitted.publicConfig.api.kind, 'vercel');
assert.equal(admitted.publicConfig.worker.kind, 'supabase-edge');
assert.notDeepEqual(admitted.publicConfig, output.publicConfig);
assert.deepEqual({ apiUrl: admitted.publicConfig.apiUrl, supabaseUrl: admitted.publicConfig.supabaseUrl,
  supabasePublishableKey: admitted.publicConfig.supabasePublishableKey }, output.publicConfig);
const admittedPopulation = admitted.populationEvidence;
if (admittedPopulation) {
  assert.equal(admittedPopulation.kind, 'INSTALLED_POPULATION_REVALIDATION');
  assert.equal(admittedPopulation.receiptSha256, hash(savedBytes));
  assert.equal(admittedPopulation.verification.originalSha256, hash(originalText));
}
Object.assign(process.env, { GITHUB_RUN_ID: '81', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'web-release',
  GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/release.yml@refs/heads/main', RELEASE_ENVIRONMENT: 'staging' });
const learning = await import(input.learningUrl);
const result = await learning.verifyHostedLearningLoop({ repoRoot: root, releaseSha: input.run.head_sha,
  ciRunId: '31', ...selection, populationReceiptSha256: hash(savedBytes),
  web: { teamId: 'team_Cuevo', projectId: 'prj_Web', target: 'preview' },
  webDeployment: { id: 'dpl_Web', url: 'https://cuevo-web-deployment.vercel.app' },
  selectedActorIds: { admin: actor(1), coordinator: actor(2), teacher: actor(4), student: actor(12), parent: actor(72) },
  githubToken: 'private-github-canary', vercelToken: 'private-vercel-canary',
  syntheticPassword: 'protected-synthetic-password' }, {
    readmitWeb: async () => { state.webReadmits++; throw Error('STOP_AT_FIRST_CURRENT_WEB_READMIT'); }
  });
assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.roleSessions, 0);
assert.equal(result.canonicalReceipt, null); assert.equal(json(original), originalText);
assert.equal(state.populationGateEntries, 1,
  'The actual learning entry must reach its unchanged population evidence condition');
assert.equal(state.nativeReads, 3); assert.equal(state.nativeSessionsClosed, 3);
assert.equal(state.originalReads, 6); assert.equal(state.canonicalArchives, 20);
assert.equal(state.transferArchives, 2); assert.equal(state.schemaWrites + state.seedWrites +
  state.authCreates + state.apiUploads + state.edgeUploads, 0);
console.log(JSON.stringify({ phase: 'REAL_INSTALLED_TRANSFER_EXPORTED_AND_ADMITTED',
  populationGateEntries: state.populationGateEntries,
  readmitWebCalls: state.webReadmits, resultStatus: result.status, state,
  originalPopulationSha256: latestNativeProof.installedPopulationSha256,
  exportedProofFileSha256: hash(savedBytes), transferSha256: exported.transferSha256,
  savedBytesUnchanged: readFileSync(join(folder, 'web-handover-result.json')).equals(savedBytes),
  fullHandoverGatesSubstituted: true }));
`;
async function runInstalledPopulationLearningFixture(mode:'valid'|'saved-file-race'|'current-runtime') {
  const migrationPaths = [
    'supabase/migrations/20261002021129_current_school_schedule_projection.sql',
    'supabase/migrations/20261002021206_curriculum_context_lifecycle.sql',
    'supabase/migrations/20261002021737_native_academic_source_identity.sql',
    'supabase/migrations/20261002204500_posthog_environment_claim.sql',
    'supabase/migrations/20261002195537_posthog_intelligence_observability.sql',
  ];
  const sourcePaths = [...new Set([...backendWebTransferProducerPaths,
    'scripts/verification/data-api-configuration.ts', 'scripts/database/hosted-synthetic-population.ts',
    'scripts/database/hosted-installed-state.ts', 'scripts/database/hosted-migration-database.ts',
    ...migrationPaths, 'supabase/seed/identities.json'])];
  const additionalSources = sourcePaths.map(path => ({ path, bytes: readFileSync(resolve(path), 'utf8') }));
  await withCanonicalJobFixture('runtime', () => undefined, { additionalSources }, async context => {
    const root = context.fixture.root;
    const script = join(root, '.local/installed-population-learning.mjs');
    const inputPath = join(root, '.local/installed-population-learning.json');
    const url = (path: string) => pathToFileURL(resolve(path)).href;
    await writeFile(inputPath, JSON.stringify({ mode,run: context.run, jobs: context.jobs,
      artifacts: context.artifacts, archives: context.archives, tree: context.tree,
      observerUrl: url('scripts/database/hosted-synthetic-population.ts'),
      planUrl: url('scripts/database/hosted-migration-plan.ts'),
      installedUrl: url('scripts/database/hosted-installed-state.ts'),
      reviewUrl: url('scripts/verification/release-review.ts'),
      contractsUrl: url('scripts/verification/backend-release-contracts.ts'),
      fixtureUrl: url('scripts/verification/backend-web-transfer-fixtures.ts'),
      canonicalUrl: url('scripts/verification/canonical-runtime-jobs.ts'),
      transferUrl: url('scripts/verification/backend-web-transfer.ts'),
      admissionUrl: url('scripts/verification/backend-web-transfer-admission.ts'),
      bridgeUrl: url('scripts/verification/web-backend-bridge.ts'),
      browserUrl: url('scripts/verification/backend-hosted-browser.ts'),
      learningUrl: url('scripts/verification/backend-hosted-learning-loop.ts') }));
    await writeFile(script, installedPopulationLearningFixtureSource);
    const child = spawnSync(process.execPath, [
      '--import', url('node_modules/tsx/dist/loader.mjs'),
      '--import', pathToFileURL(context.fixture.hook).href, script,
    ], { cwd: root, encoding: 'utf8', env: { ...process.env,
      CUEVO_CANONICAL_FIXTURE_CONFIG: context.fixture.hookInput,
      CUEVO_POPULATION_LEARNING_FIXTURE: inputPath } });
    assert.equal(child.status, 0, child.stderr);
    const observation = JSON.parse(child.stdout.trim()) as {
      phase: string; populationGateEntries: number; readmitWebCalls: number; savedBytesUnchanged: boolean;
      fullHandoverGatesSubstituted: boolean;
    };
    if(mode==='saved-file-race'){assert.equal(observation.phase,'SAVED_FILE_RACE_REFUSED');return;}
    assert.equal(observation.phase, 'REAL_INSTALLED_TRANSFER_EXPORTED_AND_ADMITTED');
    assert.equal(observation.savedBytesUnchanged, true);
    assert.equal(observation.fullHandoverGatesSubstituted, true);
    assert.equal(observation.populationGateEntries, 1,
      'Only a reached unchanged population evidence condition can establish this RED');
    // RED on85b: actual installed transfer and native proof pass, but the real
    // learning owner refuses its absent population-result row before this port.
    assert.equal(observation.readmitWebCalls, 1,
      'A valid installed full transfer with actual native population proof must reach current web admission');
  });
}
test('native installed population proof reaches learning admission through its exact completed transfer',async()=>runInstalledPopulationLearningFixture('valid'));
test('a replaced saved installed population result refuses export before transfer creation',async()=>runInstalledPopulationLearningFixture('saved-file-race'));
test('same-source current runtime population proof reaches learning through the current transfer',async()=>runInstalledPopulationLearningFixture('current-runtime'));
