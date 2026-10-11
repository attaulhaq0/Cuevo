import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from './release-review';
import { prepareBackendReleaseIntent, type BackendReleaseExpected } from './backend-release-contracts';
import { planHostedMigrations, canonicalHostedMigrationPlan, readHistoricalMigrationSources } from '../database/hosted-migration-plan';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { canonicalReleaseReviewJson } from './release-review';
import {validateReleaseManifest} from './cicd-contracts';
import {z} from 'zod';
import { installedPopulationVerificationV2Schema, validateInstalledPopulationVerificationV2 } from '../database/hosted-synthetic-population';
import { hostedSyntheticSeedSha256 } from '../database/hosted-migration-database';
let admissions = 0;
let installedNativeReads=0;
Object.assign(globalThis,{handoverInstalledNative:async()=>{installedNativeReads++;throw Error('Observed installed history changed');},handoverInstalledAuth:async()=>({status:'REQUIRES_REVIEW'})});
Object.assign(globalThis, { handoverFixtureAdmission: async () => { admissions++; return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' }; }, handoverFixtureSources: [{ name: '20261001000000_fixture.sql', bytes: Buffer.from('select 1;') }] });
registerHooks({ load(url, context, next) { if (url.endsWith('/backend-web-handover.ts')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace("import {prepareNativeBackendReleaseAdmission,readNativeBackendReleaseAdmission,disposeNativeBackendReleaseAdmission,type NativeBackendAdmissionHandle} from './backend-release-admission';","const prepareNativeBackendReleaseAdmission=async()=>Object.freeze({});const readNativeBackendReleaseAdmission=(...args)=>globalThis.handoverFixtureAdmission(...args);const disposeNativeBackendReleaseAdmission=()=>undefined;").replace("import {readBackendActivationExecutionAdmission,readBackendRuntimeInitializationAdmission} from './backend-release-admission';", 'const readBackendReleaseAdmission=globalThis.handoverFixtureAdmission;const readBackendActivationExecutionAdmission=async()=>({activationStepVerified:true});const readBackendRuntimeInitializationAdmission=async()=>({initializationStepVerified:true});').replace("import { canonicalHostedMigrationPlan, readCanonicalMigrationSources, type HostedMigrationPlanV1 } from '../database/hosted-migration-plan';", "import {canonicalHostedMigrationPlan} from '../database/hosted-migration-plan';const readCanonicalMigrationSources=()=>({sources:globalThis.handoverFixtureSources});").replace("import { installedPopulationVerificationSchema, revalidateInstalledBackendState } from '../database/hosted-synthetic-population';", "import {installedPopulationVerificationSchema} from '../database/hosted-synthetic-population';const revalidateInstalledBackendState=(...args)=>globalThis.handoverInstalledNative(...args);").replace("import { revalidateInstalledSyntheticAuth } from '../database/hosted-synthetic-auth';", "const revalidateInstalledSyntheticAuth=(...args)=>globalThis.handoverInstalledAuth(...args);").replace("import {revalidateActiveRuntime,revalidateCurrentRuntime} from './backend-runtime-resume';", "const revalidateActiveRuntime=(...args)=>globalThis.handoverActiveRuntime(...args);const revalidateCurrentRuntime=(...args)=>globalThis.handoverActiveRuntime(...args);").replace('now: Date.now() });', 'now: Date.parse("2026-10-06T12:05:00Z") });'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const subject = await import('./backend-web-handover').catch(() => ({})) as typeof import('./backend-web-handover');
const digest = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const sha = 'a'.repeat(40), projectRef = 'mqxdjvsyckzocokuikmx', at = '2026-10-06T12:00:00Z', now = Date.parse('2026-10-06T12:05:00Z');
const binding = { repository: 'attaulhaq0/Cuevo', sourceSha: sha, ciRunId: '31', runId: '51', runAttempt: 1, packageSha256: 'b'.repeat(64), runtimeSha256: 'c'.repeat(64), apiDeploymentId: 'dpl_Api', apiDeploymentUrl: 'https://cuevo-api-deployment.vercel.app', apiOrigin: 'https://cuevo-api.vercel.app', apiProjectId: 'prj_Api', teamId: 'team_Cuevo', webProjectId: 'prj_Web', webOrigin: 'https://cuevo-beta.vercel.app', projectRef, edgeId: 'edge-fixture', edgeVersion: 1, apiArtifactSha256: 'd'.repeat(64), edgeArtifactSha256: 'e'.repeat(64), denoLockSha256: 'f'.repeat(64), supabasePublishableKey: 'sb_publishable_controlled_public_key', migrations: [{ version: '20261001000000', sha256: '1'.repeat(64) }] };

test('handover bundle consumer keeps historical v1 and admits only exact current v2 runtime capability',()=>{
 assert.equal(typeof subject.parseBackendWebHandoverBundle,'function');const root=resolve(import.meta.dirname,'../..'),expected={repository:binding.repository,releaseSha:sha,treeSha:'b'.repeat(40),ciRunId:'31',executionScope:'complete-backend',canonicalRuntimeVerification:{runAttempt:2},fingerprints:{apiArtifactSha256:binding.apiArtifactSha256,edgeArtifactSha256:binding.edgeArtifactSha256,denoLockSha256:binding.denoLockSha256}};
 const common={purpose:'CUEVO_BACKEND_RELEASE_EXECUTION',repoRoot:root,expected,preparedApproval:{},plan:{},migrationEndpoint:{projectRef,kind:'direct',host:'db.'+projectRef+'.supabase.co',port:5432,database:'postgres'},stages:[{},{},{},{}],toolchainManifestPath:'fixture',operatorStoragePolicyPath:'fixture'};
 const legacy={...common,version:1,artifacts:{apiRoot:'owned-api',edgeRoot:'owned-edge'}};assert.equal(subject.parseBackendWebHandoverBundle(legacy,root,now).version,1);
 const provenance={repository:binding.repository,sourceSha:sha,treeSha:expected.treeSha,runId:'31',runAttempt:2,artifactId:'81',archiveSha256:'1'.repeat(64),receiptSha256:'2'.repeat(64),sourceLockSha256:'3'.repeat(64),producerJobId:'91',producerJobsSha256:'4'.repeat(64),observedAt:at,expiresAt:'2026-10-07T12:00:00Z'},delivery={kind:'CI_RUNTIME_ARTIFACTS',apiRoot:'owned-api',edgeRoot:'owned-edge',provenance},v2={...common,version:2,delivery};assert.equal(subject.parseBackendWebHandoverBundle(v2,root,now).version,2);
 const observation={...v2,expected:{...expected,executionScope:'installed-runtime'},delivery:{kind:'RUNTIME_OBSERVATION',apiRoot:null,edgeRoot:null,apiArtifactSha256:binding.apiArtifactSha256,edgeArtifactSha256:binding.edgeArtifactSha256,denoLockSha256:binding.denoLockSha256}};assert.equal(subject.parseBackendWebHandoverBundle(observation,root,now).version,2);
 for(const changed of [{...v2,delivery:{...delivery,provenance:{...provenance,sourceSha:'f'.repeat(40)}}},{...v2,delivery:{...delivery,provenance:{...provenance,runAttempt:1}}},{...v2,delivery:{...delivery,provenance:{...provenance,expiresAt:at}}},{...observation,delivery:{...observation.delivery,edgeArtifactSha256:'0'.repeat(64)}},{...v2,expected:{...expected,executionScope:'schema-and-accounts'},delivery:{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null}},{...v2,artifacts:legacy.artifacts}])assert.throws(()=>subject.parseBackendWebHandoverBundle(changed,root,now));
});
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
test('active continuation retains historical activation while requiring fresh current native proof and prerequisite health',()=>{
 const rows=completeFixtures(),oldRun='41',oldPackage='a'.repeat(64);rows.activation.runId=oldRun;rows.activation.packageSha256=oldPackage;rows.activationCleanup.runId=oldRun;rows.activationCleanup.resultSha256=digest(rows.activation);
 rows.provider.status='DEPLOYED_ACTIVE_REVALIDATED';rows.provider.mutation='NOT_ATTEMPTED';rows.provider.api.healthVerified=false;rows.provider.edge.customAuthenticationVerified=false;rows.provider.edge.state='ACTIVE';
 const proof={status:'INSTALLED_RUNTIME_REVALIDATED',sourceSha:binding.sourceSha,runId:binding.runId,runAttempt:binding.runAttempt,packageSha256:binding.packageSha256,nativeExecutionVerified:true,lockReleased:true,observedAt:at};Object.assign(rows,{activeRuntime:proof});
 const context={...binding,originalActivation:{runId:oldRun,runAttempt:binding.runAttempt,packageSha256:oldPackage,receiptSha256:digest(rows.activation)}};
 const verified=subject.validateBackendWebHandoverReceipts(rows,context,now);assert.equal(verified.pendingGates.length,0);if(verified.manifest)assert.equal(verified.manifest.verifiedAt,at);
 proof.nativeExecutionVerified=false;assert.ok(subject.validateBackendWebHandoverReceipts(rows,context,now).pendingGates.includes('SIGNED_WORKER_AND_TERMINAL_CLEANUP'));proof.nativeExecutionVerified=true;rows.prerequisites.apiReady=false;assert.ok(subject.validateBackendWebHandoverReceipts(rows,context,now).pendingGates.includes('ROLE_AND_ENDPOINT_DENIALS'));
});

test('full current-generation handover requires native signed source and full recovery restore without relabeling original activation',()=>{
 const rows=completeFixtures(),generation={generation:'2',sourceSha:binding.sourceSha,treeSha:'b'.repeat(40),runtimeSha256:binding.runtimeSha256,apiDeploymentId:binding.apiDeploymentId,apiUrl:binding.apiDeploymentUrl,edgeId:binding.edgeId,edgeVersion:binding.edgeVersion,apiArtifactSha256:binding.apiArtifactSha256,edgeArtifactSha256:binding.edgeArtifactSha256,denoLockSha256:binding.denoLockSha256},currentProof={status:'CURRENT_RUNTIME_REVALIDATED',sourceSha:binding.sourceSha,treeSha:generation.treeSha,runId:binding.runId,runAttempt:binding.runAttempt,packageSha256:binding.packageSha256,current:{current:generation,stateSha256:'9'.repeat(64)},generation:'2',admissionPaused:false,privateTransportVerified:true,nativeExecutionVerified:true,positiveWakeVerified:true,duplicateWakeDenied:true,staleGenerationDenied:true,sourceProcessed:true,scheduledRecoveryVerified:true,lockReleased:true,sessionClosed:true,observedAt:at};
 rows.provider.status='DEPLOYED_ACTIVE_REVALIDATED';rows.provider.mutation='NOT_ATTEMPTED';rows.provider.api.healthVerified=false;rows.provider.edge.customAuthenticationVerified=false;rows.provider.edge.state='ACTIVE';Object.assign(rows,{activeRuntime:currentProof});
 const context={...binding,currentRuntime:{treeSha:generation.treeSha,generation:'2',stateSha256:'9'.repeat(64)}};
 const result=subject.validateBackendWebHandoverReceipts(rows,context,now);assert.equal(result.pendingGates.length,0);assert.ok(result.manifest);assert.equal(result.manifest?.worker.queueRecoveryVerified,true);for(const change of['sourceProcessed','scheduledRecoveryVerified','lockReleased','privateTransportVerified']){const changed={...currentProof,[change]:false};assert.ok(subject.validateBackendWebHandoverReceipts({...rows,activeRuntime:changed},context,now).pendingGates.includes('SIGNED_WORKER_AND_TERMINAL_CLEANUP'));}assert.equal(subject.validateBackendWebHandoverReceipts({...rows,fullRecovery:null},context,now).manifest,null);
 for(const field of['sourceSha','treeSha','apiArtifactSha256'] as const){const changed={...currentProof,current:{...currentProof.current,current:{...generation,[field]:'f'.repeat(field==='apiArtifactSha256'?64:40)}}};assert.ok(subject.validateBackendWebHandoverReceipts({...rows,activeRuntime:changed},context,now).pendingGates.includes('SIGNED_WORKER_AND_TERMINAL_CLEANUP'),field);}
});

test('retained runtime component remains operating staging while full customer handover is explicitly deferred',()=>{
 const context={...binding,currentRuntime:{treeSha:'b'.repeat(40),generation:'2',stateSha256:'9'.repeat(64),componentSource:{sourceSha:'c'.repeat(40),treeSha:'d'.repeat(40)}}};
 const result=subject.validateBackendWebHandoverReceipts(completeFixtures(),context,now);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.manifest,null);assert.deepEqual(result.pendingGates,['FULL_RETAINED_COMPONENT_CUSTOMER_HANDOVER_UNSUPPORTED']);assert.equal(result.hostedAcceptance,false);
});

test('actual operating native guard accepts only exact retained component and current executor tuples',async()=>{
 const source=await readFile(resolve(import.meta.dirname,'backend-web-handover.ts'),'utf8'),start=source.indexOf('const requireNative='),end=source.indexOf('\n  const identity=requireNative(native)',start);assert.ok(start>0&&end>start);
 const code=transformSync(source.slice(start,end)+';requireNative(native);',{loader:'ts',format:'cjs'}).code,identity={sourceSha:'b'.repeat(40),treeSha:'c'.repeat(40),executorSourceSha:sha,executorTreeSha:'d'.repeat(40),generation:'2',runtimeSha256:'e'.repeat(64),apiArtifactSha256:'1'.repeat(64),edgeArtifactSha256:'2'.repeat(64),denoLockSha256:'3'.repeat(64),apiDeploymentId:'dpl_Exact',apiUrl:'https://exact.vercel.app',edgeId:'edge-exact',edgeVersion:2},expected={releaseSha:sha,treeSha:'d'.repeat(40),releaseRunId:'51',runAttempt:1,currentRuntime:{current:identity}};
 const proof={status:'CURRENT_RUNTIME_REVALIDATED',current:{current:identity},nativeExecutionVerified:true,positiveWakeVerified:true,duplicateWakeDenied:true,staleGenerationDenied:true,privateTransportVerified:true,admissionPaused:false,lockReleased:true,sessionClosed:true,receiptSha256:'4'.repeat(64),sourceSha:sha,treeSha:expected.treeSha,runId:'51',runAttempt:1,packageSha256:'5'.repeat(64),observedAt:new Date().toISOString(),generation:'2'};
 for(const change of['valid','source','tree','executor','artifact','native','paused']){const currentIdentity={...identity},native={...proof,current:{current:currentIdentity}};if(change==='source')currentIdentity.sourceSha='f'.repeat(40);if(change==='tree')currentIdentity.treeSha='f'.repeat(40);if(change==='executor')currentIdentity.executorTreeSha='f'.repeat(40);if(change==='artifact')currentIdentity.apiArtifactSha256='f'.repeat(64);if(change==='native')native.nativeExecutionVerified=false;if(change==='paused')native.admissionPaused=true;const run=()=>runInNewContext(code,{expected,prepared:{sha256:proof.packageSha256},runtime:{runtimeSha256:identity.runtimeSha256},fingerprints:{apiArtifactSha256:identity.apiArtifactSha256,edgeArtifactSha256:identity.edgeArtifactSha256,denoLockSha256:identity.denoLockSha256},native,current:()=>undefined,Date,fail:()=>Error('Native component requires review')});if(change==='valid')assert.equal(run().sourceSha,identity.sourceSha);else assert.throws(run,change);}
});
test('installed committed stage checks planned bytes endpoint and certificate before consuming its journal',async()=>{
 const source=await readFile(resolve(import.meta.dirname,'backend-web-handover.ts'),'utf8'),start=source.indexOf('const plannedStage=z.object',source.indexOf("const protocol=z.object({commitment:z.literal('CONFIRMED')")),end=source.indexOf('\n          const identity=',start),guard=transformSync('(async()=>{'+source.slice(start,end)+';return true;})()',{loader:'ts',format:'cjs'}).code;
 assert.ok(start>0&&end>start);const included=[{name:'20261001000000_fixture.sql',version:'20261001000000',sha256:'1'.repeat(64)}],configSha256='2'.repeat(64),certificate=Buffer.from('certificate'),expectedHash=createHash('sha256').update(JSON.stringify({included,configSha256})).digest('hex');
 for(const mode of ['valid','stage','endpoint','certificate']){
  const identity={stageSha256:mode==='stage'?'3'.repeat(64):expectedHash,databaseUrl:mode==='endpoint'?'postgresql://postgres@foreign.invalid:5432/postgres?sslmode=verify-full':'postgresql://postgres@db.fixture.supabase.co:5432/postgres?sslmode=verify-full',certificateSha256:mode==='certificate'?'4'.repeat(64):createHash('sha256').update(certificate).digest('hex')};
  const run=runInNewContext(guard,{z,digest:z.string().regex(/^[a-f0-9]{64}$/),bundle:{stages:[{included,configSha256}],migrationEndpoint:{kind:'direct',host:'db.fixture.supabase.co'}},index:0,protocol:{identity},plan:{projectRef:'fixture'},root:'fixture',directory:'fixture',join:(...parts:string[])=>parts.join('/'),URL,hash:(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex'),file:async()=>certificate,fail:()=>Error('Required scope refused')});
  if(mode==='valid')assert.equal(await run,true);else await assert.rejects(run,mode);
 }
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
  const invoke = (manifest: unknown, config: unknown) => runInNewContext(code + ';persistHandoverOutputs(root,manifest,config)', { ...fs, join, relative, isAbsolute, resolve, Buffer, JSON, Date,validateReleaseManifest,canonicalReleaseReviewJson, hash: (value: string) => createHash('sha256').update(value).digest('hex'), fail: () => Error('Review required'), root, manifest, config });
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

test('fresh native readback preserves the original handover clock and refuses changed expired or future output',async()=>{
 const source=readFileSync(resolve(import.meta.dirname,'backend-web-handover.ts'),'utf8'),start=source.indexOf('async function file('),end=source.indexOf('export type BackendWebHandoverResult',start),code=transformSync(source.slice(start,end),{loader:'ts',format:'cjs'}).code,fs=await import('node:fs/promises'),root=await mkdtemp(join(tmpdir(),'cuevo-handover-clock-'));await mkdir(join(root,'.local/hosted-release'),{recursive:true});
 const Clock=class extends Date{static override now(){return now;}},invoke=(manifest:unknown,config:unknown)=>runInNewContext(code+';persistHandoverOutputs(root,manifest,config)',{...fs,join,relative,isAbsolute,resolve,Buffer,JSON,Date:Clock,validateReleaseManifest,canonicalReleaseReviewJson,hash:(value:string)=>createHash('sha256').update(value).digest('hex'),fail:()=>Error('Review required'),root,manifest,config});
 try{const original=subject.validateBackendWebHandoverReceipts(completeFixtures(),binding,now).manifest!;assert(original);const first=await invoke(original,original.publicConfig),originalBytes=await readFile(first.manifestPath);const fresh={...original,verifiedAt:new Date(Date.parse(original.verifiedAt)+1000).toISOString()};const second=await invoke(fresh,fresh.publicConfig);assert.equal(second.manifestSha256,first.manifestSha256);assert((await readFile(first.manifestPath)).equals(originalBytes));await assert.rejects(invoke({...fresh,ciRunId:'999'},fresh.publicConfig));await assert.rejects(invoke({...fresh,verifiedAt:new Date(now-7200000).toISOString()},fresh.publicConfig));await assert.rejects(invoke({...fresh,verifiedAt:new Date(now+1000).toISOString()},fresh.publicConfig));assert((await readFile(first.manifestPath)).equals(originalBytes));}finally{await rm(root,{recursive:true,force:true});}
});

test('native collection reports missing backend receipts without creating a manifest or making provider calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-handover-')), previous = globalThis.fetch; admissions = 0; let network = 0;
  try {
    globalThis.fetch = async () => { network++; throw Error('No provider request may run without deployment receipt'); };
    const source = { sha, tree: '4'.repeat(40) }, target = { projectRef, boundProjectRef: projectRef, projectName: 'cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY', observedAt: at };
    const realRoot = resolve(import.meta.dirname, '../..'), currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: realRoot, encoding: 'utf8' }).trim(), currentTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: realRoot, encoding: 'utf8' }).trim();
    const sources = readHistoricalMigrationSources(realRoot,currentSha,currentTree);
    Object.assign(globalThis, { handoverFixtureSources: sources });
    const plan = planHostedMigrations({ sources, source, target, now }), migration = canonicalHostedMigrationPlan(plan);
    const targets = { web: { teamId: binding.teamId, projectId: binding.webProjectId, origin: binding.webOrigin, target: 'preview' }, api: { teamId: binding.teamId, projectId: binding.apiProjectId, origin: binding.apiOrigin, target: 'preview' }, supabase: { projectRef, authOrigin: 'https://' + projectRef + '.supabase.co', edgeOrigin: 'https://' + projectRef + '.supabase.co/functions/v1/cuevo-worker' } };
    const fingerprints = { sourceManifestSha256: '1'.repeat(64), diffSha256: '2'.repeat(64), migrationPlanSha256: migration.sha256, migrationHistorySha256: '3'.repeat(64), migrationToolchainSha256: '4'.repeat(64), migrationEndpointSha256: digest({ projectRef,kind:'direct',host:'db.'+projectRef+'.supabase.co',port:5432,database:'postgres' }), operatorStoragePolicySha256: '5'.repeat(64), apiArtifactSha256: binding.apiArtifactSha256, edgeArtifactSha256: binding.edgeArtifactSha256, denoLockSha256: binding.denoLockSha256 };
    const reviews = [{ category: 'source-spec-code', taskId: 'source', reportSha256: '6'.repeat(64), evidenceSha256: '7'.repeat(64) }, { category: 'qa-regression-operations', taskId: 'qa', reportSha256: '8'.repeat(64), evidenceSha256: '9'.repeat(64) }];
    const identity = { repository: binding.repository, releaseSha: sha, treeSha: source.tree, baseSha: '5'.repeat(40), ciRunId: '31', releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: 'staging', deploymentEnvironment: 'synthetic-staging',canonicalRuntimeVerification:{runAttempt:1,jobsSha256:'e'.repeat(64)} };
    const expected = { ...identity, targets, fingerprints, reviews, now, currentMainSha: sha, ciRun: { id: 31, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: binding.repository } }, backendRun: { id: 51, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress', conclusion: null, path: '.github/workflows/backend-release.yml', repository: { full_name: binding.repository } } };
    const prepared = prepareBackendReleaseIntent({ ...identity, targets, fingerprints, version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', preparedAt: at, expiresAt: '2026-10-07T12:00:00Z', reviews: reviews.map(row => ({ ...row, releaseSha: sha, treeSha: source.tree, baseSha: identity.baseSha, sourceManifestSha256: fingerprints.sourceManifestSha256, diffSha256: fingerprints.diffSha256, reviewedAt: at })) }, expected);
    const bundle = { version: 1, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected, preparedApproval: prepared, plan, migrationEndpoint: {projectRef,kind:'direct',host:'db.'+projectRef+'.supabase.co',port:5432,database:'postgres'}, stages: [{}, {}, {}, {}], toolchainManifestPath: 'fixture', operatorStoragePolicyPath: 'fixture', artifacts: { apiRoot: 'fixture', edgeRoot: 'fixture' } };
    const directory = join(root, '.local/hosted-release'); await mkdir(directory, { recursive: true });
    const text = canonicalReleaseExecutionJson(bundle); await writeFile(join(directory, 'backend-bundle.json'), text);
    const result = await subject.prepareBackendWebHandover({ repoRoot: root, bundleSha256: createHash('sha256').update(text).digest('hex'), githubToken: 'controlled-gh', vercelToken: 'controlled-vercel-token' });
    assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.manifestPath, null); assert.equal(network, 0);
    assert.ok(result.pendingGates.includes('RUNTIME_CONFIGURATION')); assert.ok(result.pendingGates.includes('FULL_WORKER_RECOVERY')); assert.ok(result.pendingGates.includes('DATABASE_BACKUP_RESTORE'));
    assert.equal(admissions, 1); await assert.rejects(access(join(directory, 'web-handover-manifest.json')));
    const installedSource={sourceSha:sha,treeSha:source.tree,seedSha256:'7be612e9a30e916ec4b460a2ae14a2796cb3f4f542cbdec8f7db2f49c95d9903',manifestSha256:'6'.repeat(64),migrationCount:plan.migrations.length};
    const installedExpected={...expected,installedSource},originalBody=JSON.parse(prepared.canonicalJson),installedPrepared=prepareBackendReleaseIntent({...originalBody,installedSource},installedExpected),installedBundle={...bundle,expected:installedExpected,preparedApproval:installedPrepared};
    const installedText=canonicalReleaseExecutionJson(installedBundle);await writeFile(join(directory,'backend-bundle.json'),installedText);await writeFile(join(directory,'database-ca.pem'),'-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----');
    const included=plan.migrations.map(row=>({name:row.name,version:row.version,sha256:row.sha256})),stageHash=createHash('sha256').update(JSON.stringify({included,configSha256:'7'.repeat(64)})).digest('hex'),certificateHash=createHash('sha256').update(await readFile(join(directory,'database-ca.pem'))).digest('hex');
    installedBundle.stages=['prefix','native','pre-observability','remaining'].map(stageId=>({id:stageId,included,pending:[],configSha256:'7'.repeat(64)}));await writeFile(join(directory,'backend-bundle.json'),canonicalReleaseExecutionJson(installedBundle));
    await writeFile(join(directory,'schema-result.json'),canonicalReleaseExecutionJson({status:'NOOP',cleanupCode:null,compositionCode:null,stages:['prefix','native','pre-observability','remaining'].map(stageId=>({status:'NOOP',protocol:null,installedVerification:{version:1,purpose:'CUEVO_INSTALLED_MIGRATION_REVALIDATION',identity:{projectRef,sourceSha:sha,treeSha:source.tree,planSha256:migration.sha256,stageId,stageSha256:stageHash,databaseUrl:'postgresql://postgres@db.'+projectRef+'.supabase.co:5432/postgres?sslmode=verify-full',approvalDigest:installedPrepared.sha256,ciRunId:'31',certificateSha256:certificateHash},historySha256:'8'.repeat(64),remoteProjectSha256:'9'.repeat(64),installedPopulationSha256:'a'.repeat(64),observedAt:at}}))}));
    installedNativeReads=0;
    const currentBundleBytes=await readFile(join(directory,'backend-bundle.json')),installedResult=await subject.prepareBackendWebHandover({repoRoot:root,bundleSha256:createHash('sha256').update(currentBundleBytes).digest('hex'),githubToken:'controlled-gh',vercelToken:'controlled-vercel-token',installedOperator:{providerToken:'controlled-provider-token',journalStorageKey:'controlled-journal-token',migrationPassword:'controlled-migration-token'}});
    assert.ok(installedResult.pendingGates.includes('NATIVE_SCHEMA_AND_JOURNALS'));assert.equal(installedNativeReads,1);assert.equal(installedResult.manifestPath,null);
    await writeFile(join(directory,'backend-bundle.json'),text);
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

test('full handover binds provider configuration without marking historical activation manual evidence false',()=>{const rows=completeFixtures(),evidence={version:1,purpose:'CUEVO_DATA_API_CONFIGURATION_OBSERVATION',source:'SUPABASE_MANAGEMENT_POSTGREST_CONFIG',projectRef,sourceSha:sha,treeSha:'b'.repeat(40),url:`https://api.supabase.com/v1/projects/${projectRef}/postgrest`,configurationState:'DISABLED',configurationValueSha256:digest(''),metadataBasis:'SUPPLIED_CURRENT_METADATA_PORT',metadataObservedAt:at,observedAt:at,verifiedAt:at,expiresAt:'2026-10-06T13:00:00Z',effectAuthority:false,hostedAcceptance:false};const result=subject.validateBackendWebHandoverReceipts({...rows,configuration:evidence},{...binding,treeSha:'b'.repeat(40)},now);assert.equal(result.status,'READY_FOR_FRONTEND_REVIEW');assert.equal(result.manifest?.database.dataApi.version,2);assert.equal(rows.activation.configurationEvidenceObservedManual,true);for(const patch of[{configurationState:'UNKNOWN'},{sourceSha:'f'.repeat(40)},{treeSha:'f'.repeat(40)}])assert.equal(subject.validateBackendWebHandoverReceipts({...rows,configuration:{...evidence,...patch}},{...binding,treeSha:'b'.repeat(40)},now).status,'REQUIRES_REVIEW');});

type FullHandoverMode = 'valid' | 'changed-original' | 'missing-projection' | 'unknown-projection-field' | 'unreleased-projection' | 'enabled-configuration' | 'missing-configuration' | 'changed-deployment';
async function withFullInstalledHandover<T>(run: (fixture: {
  invoke: (mode?: FullHandoverMode) => Promise<Awaited<ReturnType<typeof subject.prepareBackendWebHandover>>>;
  advance: (milliseconds: number) => void;
  reads: () => { population: number; auth: number; runtime: number; admissions: number; providerGets: string[] };
  projection: unknown;
  directory: string;
  originalTime: number;
}) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-full-installed-handover-')), directory = join(root, '.local/hosted-release');
  const globals = globalThis as unknown as Record<string, unknown>, keys = ['handoverFixtureAdmission', 'handoverFixtureSources', 'handoverInstalledNative', 'handoverInstalledAuth', 'handoverActiveRuntime'];
  const previous = Object.fromEntries(keys.map(key => [key, globals[key]])), previousFetch = globalThis.fetch, previousNow = Date.now;
  let clock = now, mode: FullHandoverMode = 'valid', populationReads = 0, authReads = 0, runtimeReads = 0, admissionReads = 0;
  const providerGets: string[] = [];
  try {
    Date.now = () => clock;
    await mkdir(directory, { recursive: true });
    const realRoot = resolve(import.meta.dirname, '../..'), sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: realRoot, encoding: 'utf8' }).trim(), treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: realRoot, encoding: 'utf8' }).trim();
    const sources = readHistoricalMigrationSources(realRoot, sourceSha, treeSha);
    const migrations = sources.map(source => ({ version: source.name.slice(0, 14), sha256: createHash('sha256').update(source.bytes).digest('hex') }));
    const target = { projectRef, boundProjectRef: projectRef, projectName: 'cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', authUsers: 133, storageObjects: 0, appSchemas: ['app', 'internal', 'authorization'], migrationVersions: migrations.map(row => row.version), dispatchDisabled: true, population: 'GUARDED_SYNTHETIC', observedAt: at };
    const plan = planHostedMigrations({ sources, source: { sha: sourceSha, tree: treeSha }, target, priorReceipt: { projectRef, sourceSha, treeSha, migrations, completedSourceMigrationCount: migrations.length }, now });
    assert.equal(plan.pending.length, 0);
    const planned = canonicalHostedMigrationPlan(plan), endpoint = { projectRef, kind: 'direct', host: 'db.' + projectRef + '.supabase.co', port: 5432, database: 'postgres' };
    const targets = { web: { teamId: binding.teamId, projectId: binding.webProjectId, origin: binding.webOrigin, target: 'preview' }, api: { teamId: binding.teamId, projectId: binding.apiProjectId, origin: binding.apiOrigin, target: 'preview' }, supabase: { projectRef, authOrigin: 'https://' + projectRef + '.supabase.co', edgeOrigin: 'https://' + projectRef + '.supabase.co/functions/v1/cuevo-worker' } };
    const common = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: projectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: binding.webOrigin, SUPABASE_URL: targets.supabase.authOrigin, POSTHOG_CAPTURE_MODE: 'DISABLED' };
    const certificate = '-----BEGIN CERTIFICATE-----\ncontrolled\n-----END CERTIFICATE-----';
    const runtime = { version: 1, purpose: 'CUEVO_HOSTED_RUNTIME_CONFIGURATION', sourceSha, projectRef, webOrigin: binding.webOrigin, api: { ...common, DATABASE_URL: 'postgresql://cuevo_api:controlled-api@db.' + projectRef + '.supabase.co:5432/postgres', CUEVO_DATABASE_TLS_CA: certificate, SUPABASE_PUBLISHABLE_KEY: binding.supabasePublishableKey, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_controlled_local_fixture', API_ALLOWED_ORIGIN: binding.webOrigin, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, edge: { ...common, CUEVO_WORKER_DATABASE_URL: 'postgresql://cuevo_worker:controlled-worker@db.' + projectRef + '.supabase.co:5432/postgres', CUEVO_WORKER_TLS_CA: certificate, CUEVO_WORKER_EXECUTION_MODE: 'synthetic-staging', CUEVO_WORKER_WAKE_KEY: '' } };
    const runtimeSha256 = digest(runtime), rows = completeFixtures();
    const originalRunId = '41', originalPackageSha256 = 'a'.repeat(64);
    Object.assign(rows.activation, { sourceSha, runtimeSha256, runId: originalRunId, packageSha256: originalPackageSha256 });
    Object.assign(rows.activationCleanup, { sourceSha, runId: originalRunId, resultSha256: digest(rows.activation) });
    const installedRuntime = { version: 1, purpose: 'CUEVO_INSTALLED_ACTIVE_RUNTIME', sourceSha, treeSha, originalRunId, originalRunAttempt: 1, originalPackageSha256, runtimeSha256, apiDeploymentId: binding.apiDeploymentId, apiUrl: binding.apiDeploymentUrl, edgeId: binding.edgeId, edgeVersion: 1, activationId: '93000000-0000-4000-8000-000000000006', vaultSecretName: 'cuevo_worker_93000000000040008000000000000006', jobId: 1, endpoint: targets.supabase.edgeOrigin, activationReceiptSha256: digest(rows.activation) };
    const manifest = JSON.parse(await readFile(join(realRoot, 'supabase/seed/identities.json'), 'utf8'));
    const installedSource = { sourceSha, treeSha, seedSha256: hostedSyntheticSeedSha256, manifestSha256: digest(manifest), migrationCount: plan.migrations.length };
    const fingerprints = { sourceManifestSha256: '1'.repeat(64), diffSha256: '2'.repeat(64), migrationPlanSha256: planned.sha256, migrationHistorySha256: '3'.repeat(64), migrationToolchainSha256: '4'.repeat(64), migrationEndpointSha256: digest(endpoint), operatorStoragePolicySha256: '5'.repeat(64), apiArtifactSha256: binding.apiArtifactSha256, edgeArtifactSha256: binding.edgeArtifactSha256, denoLockSha256: binding.denoLockSha256 };
    const reviews = [{ category: 'source-spec-code', taskId: 'source', reportSha256: '6'.repeat(64), evidenceSha256: '7'.repeat(64) }, { category: 'qa-regression-operations', taskId: 'qa', reportSha256: '8'.repeat(64), evidenceSha256: '9'.repeat(64) }];
    const identity = { repository: binding.repository, releaseSha: sourceSha, treeSha, baseSha: '5'.repeat(40), ciRunId: '31', releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: 'staging', deploymentEnvironment: 'synthetic-staging', executionScope: 'installed-runtime', installedSource, installedRuntime, canonicalRuntimeVerification: { runAttempt: 1, jobsSha256: 'e'.repeat(64) } };
    const expected = { ...identity, targets, fingerprints, reviews, now, currentMainSha: sourceSha, ciRun: { id: 31, head_sha: sourceSha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: binding.repository } }, backendRun: { id: 51, run_attempt: 1, head_sha: sourceSha, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress', conclusion: null, path: '.github/workflows/backend-release.yml', repository: { full_name: binding.repository } } };
    const prepared = prepareBackendReleaseIntent({ ...identity, targets, fingerprints, version: 2, purpose: 'BACKEND_SYNTHETIC_STAGING', preparedAt: at, expiresAt: '2026-10-07T12:00:00Z', reviews: reviews.map(row => ({ ...row, releaseSha: sourceSha, treeSha, baseSha: identity.baseSha, sourceManifestSha256: fingerprints.sourceManifestSha256, diffSha256: fingerprints.diffSha256, reviewedAt: at })) }, expected);
    const original = { version: 1, purpose: 'CUEVO_INSTALLED_SYNTHETIC_POPULATION', projectRef, sourceSha, treeSha, seedSha256: installedSource.seedSha256, manifestSha256: installedSource.manifestSha256 };
    const originalSha256 = digest(original), history = migrations.map(row => ({ version: row.version, sourceReceiptSha256: row.sha256 })), historySha256 = digest(history), remoteProjectSha256 = '8'.repeat(64);
    const projection = validateInstalledPopulationVerificationV2({ version: 2, purpose: 'INSTALLED_POPULATION_REVALIDATED', original, originalSha256, currentSourceSha: sourceSha, currentTreeSha: treeSha, projectRef, planSha256: planned.sha256, approvalDigest: prepared.sha256, ciRunId: '31', runId: '51', runAttempt: 1, historySha256, remoteProjectSha256, runtime: { kind: 'ORIGINAL_ACTIVE_RUNTIME', activationReceiptSha256: installedRuntime.activationReceiptSha256 }, observedAt: at, cleanup: { kind: 'RELEASED' } }, expected as BackendReleaseExpected, prepared.sha256);
    const privateIdentity = digest({ purpose: 'PRE_ACTIVATION', sourceSha, projectRef, apiDeployment: { url: binding.apiDeploymentUrl, id: binding.apiDeploymentId }, runtimeSha256 });
    Object.assign(rows.privateIntent, { identitySha256: privateIdentity }); Object.assign(rows.privateProof, { identitySha256: privateIdentity });
    Object.assign(rows.provider, { status: 'DEPLOYED_ACTIVE_REVALIDATED', mutation: 'NOT_ATTEMPTED' }); Object.assign(rows.provider.edge, { state: 'ACTIVE' });
    Object.assign(rows.configuration, { sourceSha });
    const producerPaths = ['scripts/verification/backend-hosted-fault-recovery-native.ts', 'scripts/verification/backend-hosted-database-restore.ts'];
    for (const path of producerPaths) { const bytes = await readFile(join(realRoot, path)); await mkdir(join(root, 'scripts/verification'), { recursive: true }); await writeFile(join(root, path), bytes); }
    const archive = Buffer.from('Controlled local restore archive bytes; no hosted restore acceptance.');
    Object.assign(rows.fullRecovery, { sourceSha, runtimeSha256, packageSha256: prepared.sha256, producerSha256: createHash('sha256').update(await readFile(join(root, producerPaths[0]))).digest('hex') });
    Object.assign(rows.fullRecoveryProvisional, { ...rows.fullRecovery, lockReleased: false });
    Object.assign(rows.fullRecoveryCleanup, { sourceSha, provisionalSha256: digest(rows.fullRecoveryProvisional), resultSha256: digest(rows.fullRecovery) });
    Object.assign(rows.databaseRestore, { sourceSha, runtimeSha256, packageSha256: prepared.sha256, producer: { path: producerPaths[1], sha256: createHash('sha256').update(await readFile(join(root, producerPaths[1]))).digest('hex') }, archiveSha256: createHash('sha256').update(archive).digest('hex') });
    Object.assign(rows.databaseRestoreCleanup, { sourceSha, resultSha256: digest(rows.databaseRestore) });
    const included = plan.migrations.map(({ name, version, sha256 }) => ({ name, version, sha256 })), stages = ['prefix', 'native', 'pre-observability', 'remaining'].map(id => ({ id, included, pending: [], configSha256: '7'.repeat(64) }));
    const bundle = { version: 2, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected, preparedApproval: prepared, plan, migrationEndpoint: endpoint, stages, toolchainManifestPath: 'fixture', operatorStoragePolicyPath: 'fixture', delivery: { kind: 'RUNTIME_OBSERVATION', apiRoot: null, edgeRoot: null, apiArtifactSha256: binding.apiArtifactSha256, edgeArtifactSha256: binding.edgeArtifactSha256, denoLockSha256: binding.denoLockSha256 } };
    const bundleText = canonicalReleaseExecutionJson(bundle), prefix = 'private-probe-pre-activation-' + binding.apiDeploymentId;
    const files: Record<string, unknown> = { 'backend-bundle.json': bundle, 'runtime-private.json': runtime, 'provider-result.json': rows.provider, 'prerequisites-result.json': rows.prerequisites, [prefix + '-intent.json']: rows.privateIntent, [prefix + '-result.json']: rows.privateProof, [prefix + '-asset.json']: { identitySha256: privateIdentity, assetId: rows.privateProof.result.storageProbe.assetId, objectPath: rows.privateProof.result.storageProbe.objectPath }, [prefix + '-room.json']: { identitySha256: privateIdentity, roomId: rows.privateProof.result.realtimeProbe.roomId }, 'data-api-configuration.json': rows.configuration, 'worker-activation-result.json': rows.activation, 'worker-activation-cleanup.json': rows.activationCleanup, 'worker-fault-recovery-result.json': rows.fullRecovery, 'worker-fault-recovery-provisional.json': rows.fullRecoveryProvisional, 'worker-fault-recovery-cleanup.json': rows.fullRecoveryCleanup, 'database-restore-result.json': rows.databaseRestore, 'database-restore-cleanup.json': rows.databaseRestoreCleanup };
    for (const [name, value] of Object.entries(files)) await writeFile(join(directory, name), canonicalReleaseExecutionJson(value));
    await writeFile(join(directory, 'database-ca.pem'), certificate); await writeFile(join(directory, 'database-restore-private.dump'), archive);
    globals.handoverFixtureSources = sources;
    globals.handoverFixtureAdmission = async () => { admissionReads++; return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE', observedAt: at, approval: { packageSha256: prepared.sha256 }, expected }; };
    globals.handoverInstalledNative = async (input: { stageIdentity: unknown; preparedApproval: { sha256: string }; expected: unknown }, admission: unknown) => {
      populationReads++; assert.ok(admission); assert.equal(input.preparedApproval.sha256, prepared.sha256); assert.deepEqual(input.expected, expected);
      assert.deepEqual(input.stageIdentity, { projectRef, sourceSha, treeSha, planSha256: planned.sha256, stageId: 'remaining', stageSha256: createHash('sha256').update(JSON.stringify({ included, configSha256: '7'.repeat(64) })).digest('hex'), databaseUrl: 'postgresql://postgres@db.' + projectRef + '.supabase.co:5432/postgres?sslmode=verify-full', approvalDigest: prepared.sha256, ciRunId: '31', certificateSha256: createHash('sha256').update(certificate).digest('hex') });
      const observed = { history, historySha256, remoteProjectSha256, installedPopulationSha256: originalSha256, original, observedAt: at, installedPopulationVerification: projection };
      if (populationReads === 2 && mode === 'changed-original') return { ...observed, original: { ...original, manifestSha256: 'f'.repeat(64) } };
      if (populationReads === 2 && mode === 'missing-projection') { const { installedPopulationVerification: _proof, ...withoutProjection } = observed; void _proof; return withoutProjection; }
      if (populationReads === 2 && mode === 'unknown-projection-field') return { ...observed, installedPopulationVerification: { ...projection, extraAuthority: true } };
      if (populationReads === 2 && mode === 'unreleased-projection') return { ...observed, installedPopulationVerification: { ...projection, cleanup: { kind: 'UNCONFIRMED' } } };
      return observed;
    };
    globals.handoverInstalledAuth = async (input: { originalKey: string }, admission: unknown) => { authReads++; assert.ok(admission); assert.equal(input.originalKey, 'cuevo-initial-hosted-synthetic-auth'); return { status: 'CONFIRMED', evidence: 'NATIVE_HOSTED_SYNTHETIC_AUTH', confirmed: 133, receiptSha256: '9'.repeat(64), cleanupCode: null, hostedAcceptance: false }; };
    globals.handoverActiveRuntime = async (input: { preparedApproval: { sha256: string }; runtimeConfig: unknown }, admission: unknown) => { runtimeReads++; assert.ok(admission); assert.equal(input.preparedApproval.sha256, prepared.sha256); assert.deepEqual(input.runtimeConfig, runtime); return { configurationObservation: null, status: 'INSTALLED_RUNTIME_REVALIDATED', purpose: 'CUEVO_ACTIVE_RUNTIME_CONTINUATION', sourceSha, runId: '51', runAttempt: 1, packageSha256: prepared.sha256, original: installedRuntime, activation: rows.activation, cleanup: rows.activationCleanup, observedAt: new Date(clock).toISOString(), nativeExecutionVerified: true, lockReleased: true, hostedAcceptance: false }; };
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw)); assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error'); assert.equal(options?.credentials, 'omit'); assert.equal(options?.cache, 'no-store'); providerGets.push(url.toString());
      const isSupabase = url.origin === 'https://api.supabase.com'; assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer ' + (isSupabase ? 'controlled-provider-token' : 'controlled-vercel-token'));
      let value: unknown;
      if (isSupabase && url.pathname === '/v1/projects/' + projectRef + '/postgrest' && !url.search) value = mode === 'missing-configuration' ? {} : { db_schema: mode === 'enabled-configuration' ? 'public' : '' };
      else if (url.origin === 'https://api.vercel.com' && url.search === '?teamId=' + binding.teamId) {
        const owner = url.pathname.includes(binding.apiProjectId) ? targets.api : targets.web;
        if (url.pathname === '/v9/projects/' + owner.projectId) value = { id: owner.projectId, accountId: owner.teamId, rootDirectory: owner.projectId === binding.webProjectId ? 'apps/web' : null };
        else if (url.pathname === '/v9/projects/' + owner.projectId + '/domains') value = { domains: [{ name: new URL(owner.origin).hostname, projectId: owner.projectId, verified: true }], pagination: { next: null } };
        else if (url.pathname === '/v13/deployments/' + binding.apiDeploymentId) value = { id: binding.apiDeploymentId, projectId: mode === 'changed-deployment' ? binding.webProjectId : binding.apiProjectId, ownerId: binding.teamId, url: new URL(binding.apiDeploymentUrl).hostname, readyState: 'READY', target: null, meta: { cuevoCommitSha: sourceSha } };
        else if (url.pathname === '/v2/deployments/' + binding.apiDeploymentId + '/aliases') value = { aliases: [{ alias: new URL(binding.apiOrigin).hostname }], pagination: { next: null } };
      }
      assert.notEqual(value, undefined, 'Unexpected provider GET: ' + url); const response = Response.json(value); Object.defineProperty(response, 'url', { value: url.toString() }); return response;
    };
    return await run({ directory, projection, originalTime: now, advance: milliseconds => { clock += milliseconds; }, reads: () => ({ population: populationReads, auth: authReads, runtime: runtimeReads, admissions: admissionReads, providerGets: [...providerGets] }), invoke: async nextMode => { mode = nextMode ?? 'valid'; populationReads = 0; authReads = 0; runtimeReads = 0; admissionReads = 0; providerGets.length = 0; return subject.prepareBackendWebHandover({ repoRoot: root, bundleSha256: createHash('sha256').update(bundleText).digest('hex'), githubToken: 'controlled-gh', vercelToken: 'controlled-vercel-token', installedOperator: { providerToken: 'controlled-provider-token', journalStorageKey: 'controlled-journal-token', migrationPassword: 'controlled-migration-token' } }); } });
  } finally { Date.now = previousNow; globalThis.fetch = previousFetch; for (const key of keys) { if (previous[key] === undefined) delete globals[key]; else globals[key] = previous[key]; } await rm(root, { recursive: true, force: true }); }
}

test('actual full installed handover captures strict population proof and reuses original same-time bytes', async t => {
  await withFullInstalledHandover(async fixture => {
    const first = await fixture.invoke(); assert.equal(first.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(first.pendingGates)); assert.deepEqual(first.pendingGates, []);
    const captured = subject.parseInstalledPopulationHandoverResult(first); assert.deepEqual(captured.installedPopulationVerification, fixture.projection); assert.equal(captured.activationAllowed, false); assert.equal(captured.hostedAcceptance, false);
    assert.deepEqual({ ...fixture.reads(), providerGets: undefined }, { population: 2, auth: 1, runtime: 1, admissions: 4, providerGets: undefined });
    const before = await readFile(first.manifestPath!), publicBefore = await readFile(first.publicConfigurationPath!); assert.equal(createHash('sha256').update(before).digest('hex'), first.manifestSha256);
    const second = await fixture.invoke(); assert.equal(second.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(second.pendingGates)); assert.equal(second.manifestSha256, first.manifestSha256); assert((await readFile(second.manifestPath!)).equals(before)); assert((await readFile(second.publicConfigurationPath!)).equals(publicBefore));
    assert.equal(fixture.reads().providerGets.length, 8);
    t.diagnostic(JSON.stringify({ scenario: 'full-installed-positive-and-same-time-reuse', observedAt: new Date(fixture.originalTime).toISOString(), result: captured.status, manifestSha256: first.manifestSha256, projectionSha256: digest(installedPopulationVerificationV2Schema.parse(captured.installedPopulationVerification)), reads: fixture.reads() }));
  });
});

test('actual full installed handover refuses a changed original population or missing strict projection', async t => {
  for (const mode of ['changed-original', 'missing-projection', 'unknown-projection-field', 'unreleased-projection'] as const) await withFullInstalledHandover(async fixture => {
    const result = await fixture.invoke(mode); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.ok(result.pendingGates.includes('SYNTHETIC_POPULATION_AND_AUTH')); assert.equal(result.manifestPath, null); assert.equal(result.publicConfigurationPath, null); assert.equal(result.manifestSha256, null); assert.equal(result.activationAllowed, false); assert.equal(result.hostedAcceptance, false);
    await assert.rejects(access(join(fixture.directory, 'web-handover-manifest.json'))); await assert.rejects(access(join(fixture.directory, 'web-handover-public.json')));
    t.diagnostic(JSON.stringify({ scenario: mode, observedAt: new Date(fixture.originalTime).toISOString(), status: result.status, pendingGates: result.pendingGates, reads: fixture.reads() }));
  });
});

test('actual full installed handover later-time reentry preserves original output after fresh observations', async t => {
  await withFullInstalledHandover(async fixture => {
    const first = await fixture.invoke(); assert.equal(first.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(first.pendingGates)); const before = await readFile(first.manifestPath!), publicBefore = await readFile(first.publicConfigurationPath!);
    fixture.advance(1000); const second = await fixture.invoke();
    t.diagnostic(JSON.stringify({ scenario: 'later-time-valid-reentry', originalTime: new Date(fixture.originalTime).toISOString(), reentryTime: new Date(fixture.originalTime + 1000).toISOString(), firstStatus: first.status, secondStatus: second.status, pendingGates: second.pendingGates, manifestSha256: first.manifestSha256, originalManifestPreserved: (await readFile(first.manifestPath!)).equals(before), originalPublicPreserved: (await readFile(first.publicConfigurationPath!)).equals(publicBefore), reads: fixture.reads() }));
    assert.equal(second.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(second.pendingGates)); assert.equal(second.manifestSha256, first.manifestSha256); assert((await readFile(second.manifestPath!)).equals(before)); assert((await readFile(second.publicConfigurationPath!)).equals(publicBefore));
    assert.equal(fixture.reads().providerGets.filter(url => url.endsWith('/postgrest')).length, 2); assert.equal(fixture.reads().admissions, 4);
  });
});

test('actual full installed handover reentry refuses changed current configuration and deployment', async t => {
  for (const mode of ['enabled-configuration', 'missing-configuration', 'changed-deployment'] as const) await withFullInstalledHandover(async fixture => {
    const first = await fixture.invoke(); assert.equal(first.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(first.pendingGates));
    const before = await readFile(first.manifestPath!), publicBefore = await readFile(first.publicConfigurationPath!); fixture.advance(1000);
    const result = await fixture.invoke(mode); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.manifestPath, null); assert.equal(result.publicConfigurationPath, null); assert.equal(result.manifestSha256, null); assert.equal(result.activationAllowed, false); assert.equal(result.hostedAcceptance, false);
    assert.ok(result.pendingGates.includes(mode === 'changed-deployment' ? 'CURRENT_PROJECT_ORIGIN_AND_DEPLOYMENT' : 'SOURCE_OR_NATIVE_RECEIPT_REQUIRES_REVIEW'));
    assert((await readFile(first.manifestPath!)).equals(before)); assert((await readFile(first.publicConfigurationPath!)).equals(publicBefore));
    t.diagnostic(JSON.stringify({ scenario: mode, status: result.status, pendingGates: result.pendingGates, originalManifestPreserved: true, originalPublicPreserved: true, reads: fixture.reads() }));
  });
});

test('actual full installed handover reentry refuses expired or changed saved observation and public output', async t => {
  for (const mode of ['expired-observation', 'changed-project', 'changed-tree', 'changed-digest', 'changed-public'] as const) await withFullInstalledHandover(async fixture => {
    const first = await fixture.invoke(); assert.equal(first.status, 'PREPARED_STAGING_MANIFEST', JSON.stringify(first.pendingGates));
    const manifest = JSON.parse(await readFile(first.manifestPath!, 'utf8')), observation = manifest.database.dataApi.configurationObservation;
    if (mode === 'expired-observation') { observation.evidence.expiresAt = new Date(fixture.originalTime + 500).toISOString(); observation.sha256 = digest(observation.evidence); }
    else if (mode === 'changed-project') { observation.evidence.projectRef = 'a'.repeat(20); observation.evidence.url = 'https://api.supabase.com/v1/projects/' + 'a'.repeat(20) + '/postgrest'; observation.sha256 = digest(observation.evidence); }
    else if (mode === 'changed-tree') { observation.evidence.treeSha = 'f'.repeat(40); observation.sha256 = digest(observation.evidence); }
    else if (mode === 'changed-digest') observation.sha256 = 'f'.repeat(64);
    else await writeFile(first.publicConfigurationPath!, canonicalReleaseReviewJson({ ...manifest.publicConfig, apiUrl: 'https://wrong.vercel.app' }));
    if (mode !== 'changed-public') await writeFile(first.manifestPath!, canonicalReleaseReviewJson(manifest));
    const before = await readFile(first.manifestPath!), publicBefore = await readFile(first.publicConfigurationPath!); fixture.advance(1000);
    const result = await fixture.invoke(); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.ok(result.pendingGates.includes('SOURCE_OR_NATIVE_RECEIPT_REQUIRES_REVIEW')); assert.equal(result.manifestPath, null); assert.equal(result.publicConfigurationPath, null); assert.equal(result.manifestSha256, null); assert.equal(result.activationAllowed, false); assert.equal(result.hostedAcceptance, false);
    assert((await readFile(first.manifestPath!)).equals(before)); assert((await readFile(first.publicConfigurationPath!)).equals(publicBefore)); assert.equal(fixture.reads().providerGets.filter(url => url.endsWith('/postgrest')).length, 2);
    t.diagnostic(JSON.stringify({ scenario: mode, status: result.status, pendingGates: result.pendingGates, savedManifestPreserved: true, savedPublicPreserved: true, reads: fixture.reads() }));
  });
});
