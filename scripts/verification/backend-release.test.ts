import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalReleaseReviewJson } from './release-review';

const secret = 'private-backend-phase-canary';
const state = { events: [] as string[], failApproval: false, status: 'COMMITTED',privateStatus:'PRIVATE_PROBES_CONFIRMED', activationStatus:'ACTIVATED_SIGNED_SOURCE_VERIFIED',recoveryStatus:'FAULT_RECOVERY_VERIFIED',restoreStatus:'VERIFIED',originStatus:'API_ORIGIN_BOUND',handoverStatus:'PREPARED_STAGING_MANIFEST',webStatus:'WEB_PUBLIC_SETTINGS_CONFIRMED',transferFailure:false, bundle: {} as Record<string, unknown> };
const replacements: Record<string, string> = {
  'backend-release-prepare.ts': 'export const prepareNativeBackendRelease=globalThis.backendPhaseFixture.prepare;',
  'backend-release-admission.ts': 'export const readBackendReleaseAdmission=globalThis.backendPhaseFixture.admission;',
  'backend-release-contracts.ts': 'export const validatePreparedBackendReleaseIntent=globalThis.backendPhaseFixture.validate;',
  'hosted-operator-storage-bootstrap.ts': 'export const createHostedOperatorStorageBootstrap=globalThis.backendPhaseFixture.bootstrap;',
  'hosted-migration-executor.ts': 'export const executeNativeHostedMigrations=globalThis.backendPhaseFixture.schema;',
  'hosted-synthetic-population.ts': 'export const seedHostedSyntheticPopulation=globalThis.backendPhaseFixture.population;',
  'hosted-synthetic-auth.ts': 'export const provisionHostedSyntheticAuth=globalThis.backendPhaseFixture.auth;',
  'hosted-migration-database.ts': 'export const createHostedMigrationDatabase=globalThis.backendPhaseFixture.database;',
  'backend-runtime-resume.ts':'export const readActiveRuntimeConfiguration=globalThis.backendPhaseFixture.readRuntime;export const revalidateActiveRuntime=globalThis.backendPhaseFixture.resume;',
  'backend-preview-transport.ts':'export const createBackendPreviewTransport=globalThis.backendPhaseFixture.preview;',
  'backend-provider-deploy.ts': 'export const deployBackendProviders=globalThis.backendPhaseFixture.deploy;',
  'backend-hosted-verification.ts': 'export const verifyHostedBackendPrerequisites=globalThis.backendPhaseFixture.verify;',
  'backend-hosted-private.ts': 'export const verifyHostedPrivateAccess=globalThis.backendPhaseFixture.private;',
  'backend-hosted-activation.ts': 'export const activateHostedWorker=globalThis.backendPhaseFixture.activate;',
  'backend-hosted-fault-recovery-native.ts':'export const verifyNativeWorkerFaultRecovery=globalThis.backendPhaseFixture.recovery;',
  'backend-web-handover.ts':'export const prepareBackendWebHandover=globalThis.backendPhaseFixture.handover;',
  'backend-hosted-database-restore.ts':'export const verifyNativeHostedDatabaseRestore=globalThis.backendPhaseFixture.restore;',
  'backend-api-origin.ts':'export const bindBackendApiOrigin=globalThis.backendPhaseFixture.origin;',
  'backend-web-settings.ts':'export const configureBackendWebSettings=globalThis.backendPhaseFixture.webSettings;',
  'backend-web-transfer.ts':'export const exportBackendWebTransfer=globalThis.backendPhaseFixture.webTransfer;',
};
registerHooks({ resolve(specifier, context, next) {
  const name = specifier.split('/').at(-1)!;
  if (replacements[name + '.ts']) return { shortCircuit: true, url: new URL(specifier + '.ts', context.parentURL).href };
  return next(specifier, context);
}, load(url, context, next) {
  const name = url.split('/').at(-1)!;
  if (replacements[name]) return { format: 'module', shortCircuit: true, source: replacements[name] };
  if (name === 'backend-release.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code };
  return next(url, context);
} });
(globalThis as unknown as { backendPhaseFixture: object }).backendPhaseFixture = {
  readRuntime:async()=>{state.events.push('read-runtime');return{runtimeConfig:{},original:{}};},
  resume:async()=>{state.events.push('resume');return{status:'INSTALLED_RUNTIME_REVALIDATED',nativeExecutionVerified:true,lockReleased:true,original:{apiDeploymentId:'dpl_exact',apiUrl:'https://cuevo-api.vercel.app',edgeId:'edge-exact',edgeVersion:1}};},
  preview:async()=>{state.events.push('preview');return{status:'CONFIRMED'};},
  webTransfer:async(input:{repoRoot:string;vercelToken:string})=>{state.events.push('web-transfer');assert.equal(input.vercelToken,secret);if(state.transferFailure)throw Error('Original handover missing');return{transferPath:join(input.repoRoot,'.local/hosted-release/web-transfer.json'),transferSha256:'c'.repeat(64),manifestSha256:'b'.repeat(64),backendRunId:'51',backendRunAttempt:1,hostedAcceptance:false};},
  webSettings:async(input:{vercelToken:string})=>{state.events.push('web-settings');assert.equal(input.vercelToken,secret);return{status:state.webStatus,canonicalReceipt:'{}',pendingGates:state.webStatus==='REQUIRES_REVIEW'?['SOURCE']:[],hostedAcceptance:false};},
  origin:async(input:{syntheticPassword:string;vercelToken:string})=>{state.events.push('origin');assert.equal(input.syntheticPassword,'protected-synthetic-pilot-password');assert.equal(input.vercelToken,secret);return{status:state.originStatus,healthVerified:true,currentActorVerified:true,corsVerified:true,sessionsClosed:true,canonicalReceipt:'{}',hostedAcceptance:false};},
  restore:async(input:{operatorPassword:string;operatorDatabaseUrl:string;apiDeployment:{id:string;url:string}})=>{state.events.push('restore');assert.equal(input.operatorPassword,secret);assert.equal(new URL(input.operatorDatabaseUrl).password,'');assert.equal(input.apiDeployment.id,'dpl_exact');return{status:state.restoreStatus,recoveryVerified:state.restoreStatus==='VERIFIED',cleanupConfirmed:true,sessionsClosed:true,lockReleased:true,canonicalReceipt:'{}',hostedAcceptance:false};},
  handover:async(input:{repoRoot:string;bundleSha256:string;vercelToken:string})=>{state.events.push('handover');assert.equal(input.vercelToken,secret);assert.match(input.bundleSha256,/^[a-f0-9]{64}$/);return{status:state.handoverStatus,manifestPath:join(input.repoRoot,'.local/hosted-release/web-handover-manifest.json'),manifestSha256:'b'.repeat(64),publicConfigurationPath:join(input.repoRoot,'.local/hosted-release/web-handover-public.json'),pendingGates:state.handoverStatus==='REQUIRES_REVIEW'?['DATABASE_BACKUP_RESTORE']:[],hostedAcceptance:false};},
  recovery:async(input:{operatorDatabaseUrl:string;operatorPassword:string})=>{state.events.push('recovery');assert.equal(input.operatorPassword,secret);assert.equal(new URL(input.operatorDatabaseUrl).password,'');return{status:state.recoveryStatus,expiredLeaseRecoveryVerified:true,eventRetryVerified:true,dispatchBackoffVerified:true,cleanupStatus:'RELEASED',sessionsClosed:true,lockReleased:true,ownedControlVerified:true,canonicalReceipt:'{}',hostedAcceptance:false};},
  activate:async(input:{operatorDatabaseUrl:string;operatorPassword:string;dataApiConfigurationEvidence:{artifactPath:string;source:string;enabled:boolean};privateReceipt:{status:string}})=>{state.events.push('activate');assert.equal(input.operatorPassword,secret);assert.equal(new URL(input.operatorDatabaseUrl).username,'postgres');assert.equal(new URL(input.operatorDatabaseUrl).password,'');assert.equal(input.privateReceipt.status,'PRIVATE_PROBES_CONFIRMED');assert.ok(input.dataApiConfigurationEvidence.artifactPath.endsWith('data-api-configuration.json'));assert.equal(input.dataApiConfigurationEvidence.source,'AUTHENTICATED_DASHBOARD');assert.equal(input.dataApiConfigurationEvidence.enabled,false);return{status:state.activationStatus,sourceProcessed:true,duplicateWakeDenied:true,originalCommandReplayed:true,recoveryScheduled:true,scheduledRecoveryVerified:true,recoveryVerified:false,sessionsClosed:true,hostedAcceptance:false,canonicalReceipt:'{}'};},
  prepare: async (input: Record<string, unknown>) => { state.events.push('prepare'); assert.equal(input.providerToken, secret); return { ...state.bundle, preparedApproval: { canonicalJson: '{}', comment: 'Source-bound package comment' }, bundlePath: join(input.repoRoot as string, '.local/hosted-release/backend-bundle.json'), bundleSha256: digest(JSON.stringify(state.bundle)) }; },
  validate: (prepared: unknown) => prepared,
  admission: async () => { state.events.push('approval'); if (state.failApproval) throw Error(secret); return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE', approval: { state: 'approved' } }; },
  bootstrap: async (input: Record<string, unknown>) => { state.events.push('bucket'); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input, 'migrationPassword'), false); return { bootstrap: async () => ({ status: 'CREATED_CONFIRMED', mutation: 'CONFIRMED' }) }; },
  schema: async (input: Record<string, unknown>) => { state.events.push('schema'); assert.equal(input.migrationPassword, secret); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input.toolchain as object, 'SUPABASE_ACCESS_TOKEN'), false); return { status: state.status, schemaHistoryAtomic: false, hostedAcceptance: false }; },
  population: async () => { state.events.push('population'); return { status: state.status === 'COMMITTED' ? 'POPULATED_CONFIRMED' : 'REQUIRES_REVIEW', commitment: 'CONFIRMED', hostedAcceptance: false }; },
  auth: async (input: Record<string, unknown>) => { state.events.push('auth'); assert.equal(input.authProvisioningKey, secret); assert.equal(input.syntheticPassword, 'protected-synthetic-pilot-password'); assert.equal(Object.hasOwn(input, 'journalStorageKey'), false); return { status: 'CONFIRMED', created: 133, confirmed: 133, hostedAcceptance: false }; },
  database: async () => ({ withLock: async (_key: string, run: () => Promise<void>) => { await run(); return { kind: 'RELEASED' }; }, prepareRuntimeCredentials:async()=>{state.events.push('roles');return{api:'a'.repeat(64),worker:'b'.repeat(64)};}, provisionInitialRuntimeRoles: async (input: {apiPassword64hex:string;workerPassword64hex:string}) => { state.events.push('roles'); assert.match(input.apiPassword64hex,/^[a-f0-9]{64}$/); assert.match(input.workerPassword64hex,/^[a-f0-9]{64}$/); return {status:'CONFIRMED',apiLogin:true,workerLogin:true}; }, executeReferenceScenarioSource: async () => { state.events.push('reference'); return { status: 'CONFIRMED' }; } }),
  deploy: async (input: {runtimeConfig:{api:{DATABASE_URL:string};edge:{CUEVO_WORKER_DATABASE_URL:string}}}) => {state.events.push('deploy');assert.equal(new URL(input.runtimeConfig.api.DATABASE_URL).username,'cuevo_api');assert.equal(new URL(input.runtimeConfig.edge.CUEVO_WORKER_DATABASE_URL).username,'cuevo_worker');return{status:'DEPLOYED_INACTIVE',hostedAcceptance:false};},
  verify: async () => {state.events.push('verify');return{status:'PREREQUISITES_OBSERVED',activationAllowed:false,hostedAcceptance:false};},
  private: async(input:{vercelToken:string;syntheticPassword:string})=>{state.events.push('private');assert.equal(input.vercelToken,secret);assert.equal(input.syntheticPassword,'protected-synthetic-pilot-password');return{status:state.privateStatus,restrictedDatabaseGrants:true,privateStorage:true,privateRealtime:state.privateStatus==='PRIVATE_PROBES_CONFIRMED',sessionsClosed:true,activationAllowed:false,hostedAcceptance:false};},
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function subject() {
  let api: Record<string, unknown> = {};
  try { api = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-release.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof api.runBackendReleasePhase, 'function', 'backend workflow has an executable owner');
  return api as typeof import('./backend-release');
}
async function fixture(run: (root: string, env: Record<string, string>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-backend-phase-'));
  try {
    await mkdir(join(root, '.local/hosted-release'), { recursive: true });
    state.events = []; state.failApproval = false; state.status = 'COMMITTED';state.privateStatus='PRIVATE_PROBES_CONFIRMED';state.activationStatus='ACTIVATED_SIGNED_SOURCE_VERIFIED';state.recoveryStatus='FAULT_RECOVERY_VERIFIED';state.restoreStatus='VERIFIED';state.originStatus='API_ORIGIN_BOUND';state.handoverStatus='PREPARED_STAGING_MANIFEST';state.webStatus='WEB_PUBLIC_SETTINGS_CONFIRMED';
    const sha = 'a'.repeat(40);
    state.bundle = { version: 1, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION', repoRoot: root, expected: { repository: 'attaulhaq0/Cuevo', releaseSha: sha, releaseRunId: '51', runAttempt: 1, ciRunId: '31', environmentName: 'staging', deploymentEnvironment: 'synthetic-staging', targets: {supabase:{projectRef:'mqxdjvsyckzocokuikmx'}} }, preparedApproval: {}, plan: {}, stages: [], toolchainManifestPath: join(root, '.local/hosted-release/toolchain.json'), operatorStoragePolicyPath: join(root, '.local/hosted-release/operator-policy.json'), artifacts: { apiRoot: join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot: join(root, '.local/edge-artifacts/cuevo-worker') } };
    state.bundle.migrationEndpoint={projectRef:'mqxdjvsyckzocokuikmx',kind:'direct',host:'db.mqxdjvsyckzocokuikmx.supabase.co',port:5432,database:'postgres'};
    (state.bundle.expected as {fingerprints:object}).fingerprints={migrationEndpointSha256:digest(canonicalReleaseReviewJson(state.bundle.migrationEndpoint))};
    const path = join(root, '.local/hosted-release/backend-bundle.json'); await writeFile(path, canonicalReleaseReviewJson(state.bundle));
    const env = { GITHUB_REPOSITORY: 'attaulhaq0/Cuevo', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_PATH: join(root, 'event.json'), GH_TOKEN: secret, SUPABASE_ACCESS_TOKEN: secret, CUEVO_BACKEND_BUNDLE_PATH: path, CUEVO_BACKEND_BUNDLE_SHA256: digest(canonicalReleaseReviewJson(state.bundle)), CUEVO_BACKEND_RELEASE_INPUT_JSON: '{}', GITHUB_OUTPUT: join(root, 'output.txt'), GITHUB_STEP_SUMMARY: join(root, 'summary.md'), CUEVO_MIGRATION_DATABASE_PASSWORD: secret, CUEVO_RELEASE_JOURNAL_STORAGE_KEY: secret, CUEVO_DATABASE_TLS_CA: '-----BEGIN CERTIFICATE-----\nFixture certificate\n-----END CERTIFICATE-----', PATH: process.env.PATH ?? '' };
    await run(root, env);
  } finally { assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}
test('failed official approval cannot reach bucket or schema even with configured private credentials', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { state.failApproval = true; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env }), error => error instanceof Error && !error.message.includes(secret)); assert.deepEqual(state.events, ['approval']); });
});

test('focused schema and account approval cannot reach deployment activation or frontend consumers', async () => {
  const api = await subject();
  for (const mode of ['deploy', 'verify', 'verify-private', 'activate', 'verify-recovery', 'verify-restore', 'bind-api', 'handover', 'configure-web', 'export-web-handover'] as const) {
    await fixture(async (repoRoot, env) => {
      (state.bundle.expected as Record<string, unknown>).stagingVerification = { scope: 'SCHEMA_AND_SYNTHETIC_AUTH', runAttempt: 1, jobsSha256: 'a'.repeat(64) };
      (state.bundle.expected as Record<string, unknown>).executionScope = 'schema-and-accounts';
      await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH, canonicalReleaseReviewJson(state.bundle));
      env.CUEVO_BACKEND_BUNDLE_SHA256 = digest(canonicalReleaseReviewJson(state.bundle));
      await assert.rejects(api.runBackendReleasePhase({ mode, repoRoot, env }));
      assert.deepEqual(state.events, []);
    });
  }
});

test('canonical CI schema-only approval also cannot reach provider or frontend consumers', async () => {
  const api = await subject();
  await fixture(async (repoRoot, env) => {
    (state.bundle.expected as Record<string, unknown>).executionScope = 'schema-and-accounts';
    await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH, canonicalReleaseReviewJson(state.bundle));
    env.CUEVO_BACKEND_BUNDLE_SHA256 = digest(canonicalReleaseReviewJson(state.bundle));
    for (const mode of ['deploy', 'activate', 'handover', 'export-web-handover'] as const) await assert.rejects(api.runBackendReleasePhase({ mode, repoRoot, env }));
    assert.deepEqual(state.events, []);
  });
});

test('backend handover export consumes current approval and writes only fixed public handover identity',async()=>{
 const api=await subject();for(const kind of ['confirmed','missing','approval'])await fixture(async(repoRoot,env)=>{
  env.VERCEL_TOKEN=secret;env.GITHUB_OUTPUT=join(repoRoot,'transfer-output');state.transferFailure=kind==='missing';state.failApproval=kind==='approval';
  try{
   if(kind==='confirmed'){
    const result=await api.runBackendReleasePhase({mode:'export-web-handover',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','web-transfer']);
    const output=await readFile(env.GITHUB_OUTPUT,'utf8');assert.match(output,/^transfer-sha256=c{64}\nmanifest-sha256=b{64}\n$/);assert.doesNotMatch(output,/private-backend-phase-canary|password|token|runtime/);
   }else{await assert.rejects(api.runBackendReleasePhase({mode:'export-web-handover',repoRoot,env}));assert.deepEqual(state.events,kind==='approval'?['approval']:['approval','web-transfer']);}
  }finally{state.transferFailure=false;}
 });
});
test('provider deployment reads confirmed private runtime inputs without returning any credential',async()=>{
  const api=await subject();await fixture(async(repoRoot,env)=>{
    const expected=state.bundle.expected as {targets:{supabase:{projectRef:string}};releaseSha:string};
    Object.assign(expected.targets,{web:{origin:'https://cuevo-beta.vercel.app'}});await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));env.VERCEL_TOKEN=secret;
    await writeFile(join(repoRoot,'.local/hosted-release/auth-result.json'),JSON.stringify({status:'CONFIRMED',confirmed:133}));await writeFile(join(repoRoot,'.local/hosted-release/reference-result.json'),JSON.stringify({status:'CONFIRMED',cleanup:'RELEASED'}));
    (globalThis as unknown as {backendPhaseProviderKeys:object}).backendPhaseProviderKeys={};const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json([{name:'default',type:'publishable',api_key:'sb_publishable_sourcefixturekey'},{name:'default',type:'secret',api_key:'sb_secret_api_runtime_private'}]);
    try{const result=await api.runBackendReleasePhase({mode:'deploy',repoRoot,env});assert.equal(result.status,'DEPLOYED_INACTIVE');assert.deepEqual(state.events,['approval','approval','roles','deploy']);assert.equal(JSON.stringify(result).includes(secret),false);}finally{globalThis.fetch=originalFetch;}
  });
});
test('schema workflow consumes complete configuration only after admission and retains native uncertainty', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { state.status = 'REQUIRES_REVIEW'; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env })); assert.deepEqual(state.events, ['approval', 'bucket', 'schema']); const receipt = JSON.parse(await readFile(join(repoRoot, '.local/hosted-release/schema-result.json'), 'utf8')); assert.equal(receipt.status, 'REQUIRES_REVIEW'); assert.equal(receipt.hostedAcceptance, false); assert.equal(JSON.stringify(receipt).includes(secret), false); });
});
test('missing database credential refuses before any provider mutation; changed package and foreign run refuse before admission', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { delete env.CUEVO_MIGRATION_DATABASE_PASSWORD; await assert.rejects(api.runBackendReleasePhase({ mode: 'bootstrap-schema', repoRoot, env })); assert.deepEqual(state.events, ['approval']); });
  for (const patch of [{ CUEVO_BACKEND_BUNDLE_SHA256: '0'.repeat(64) }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REPOSITORY: 'fork/Cuevo' }]) await fixture(async (repoRoot, env) => { await assert.rejects(api.runBackendReleasePhase({ mode: 'approval', repoRoot, env: { ...env, ...patch } })); assert.deepEqual(state.events, []); });
});
test('preparation refuses database storage or Vercel deployment credentials and accepts metadata token only', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => { await assert.rejects(api.runBackendReleasePhase({ mode: 'prepare', repoRoot, env })); assert.deepEqual(state.events, []); delete env.CUEVO_MIGRATION_DATABASE_PASSWORD; delete env.CUEVO_RELEASE_JOURNAL_STORAGE_KEY; delete env.CUEVO_DATABASE_TLS_CA; await api.runBackendReleasePhase({ mode: 'prepare', repoRoot, env }); assert.deepEqual(state.events, ['prepare']); assert.equal((await readFile(env.GITHUB_OUTPUT, 'utf8')).includes(secret), false); });
});
test('initial population and Auth remain ordered after confirmed schema and use the protected pilot password', async () => {
  const api = await subject(); await fixture(async (repoRoot, env) => {
    env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';
    await writeFile(join(repoRoot, '.local/hosted-release/schema-result.json'), JSON.stringify({ status: 'COMMITTED', hostedAcceptance: false }));
    const result = await api.runBackendReleasePhase({ mode: 'provision', repoRoot, env });
    assert.equal(result.status, 'CONFIRMED'); assert.deepEqual(state.events, ['approval', 'population', 'auth', 'approval', 'reference']);
    assert.equal((await readFile(join(repoRoot, '.local/hosted-release/auth-result.json'), 'utf8')).includes(secret), false);
  });
  await fixture(async (repoRoot, env) => {
    await writeFile(join(repoRoot, '.local/hosted-release/schema-result.json'), JSON.stringify({ status: 'REQUIRES_REVIEW' }));
    await assert.rejects(api.runBackendReleasePhase({ mode: 'provision', repoRoot, env })); assert.deepEqual(state.events, ['approval']);
  });
});
test('hosted verification records observed prerequisites without granting activation or customer acceptance',async()=>{
 const api=await subject();await fixture(async(repoRoot,env)=>{env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');await writeFile(join(repoRoot,'.local/hosted-release/provider-result.json'),JSON.stringify({status:'DEPLOYED_INACTIVE',api:{url:'https://cuevo-api.vercel.app',deploymentId:'dpl_exact'},edge:{id:'edge-exact',version:1}}));const result=await api.runBackendReleasePhase({mode:'verify',repoRoot,env});assert.equal('activationAllowed' in result ? result.activationAllowed : undefined,false);assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','verify']);});
});
test('private access phase requires confirmed prerequisite receipt and retains unknown private outcomes',async()=>{
 const api=await subject();for(const status of ['PRIVATE_PROBES_CONFIRMED','REQUIRES_REVIEW'])await fixture(async(repoRoot,env)=>{env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');await writeFile(join(repoRoot,'.local/hosted-release/provider-result.json'),JSON.stringify({status:'DEPLOYED_INACTIVE',api:{url:'https://cuevo-api.vercel.app',deploymentId:'dpl_exact'},edge:{id:'edge-exact',version:1}}));await writeFile(join(repoRoot,'.local/hosted-release/prerequisites-result.json'),JSON.stringify({status:'PREREQUISITES_OBSERVED',apiReady:true,roleSessions:5,crossSchoolDenied:true,worker:{missingSignatureDenied:true,malformedSignatureDenied:true,staleSignatureDenied:true}}));state.privateStatus=status;if(status==='PRIVATE_PROBES_CONFIRMED'){const result=await api.runBackendReleasePhase({mode:'verify-private',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.equal('activationAllowed' in result ? result.activationAllowed : undefined,false);}else await assert.rejects(api.runBackendReleasePhase({mode:'verify-private',repoRoot,env}));assert.deepEqual(state.events,['approval','private']);const receipt=JSON.parse(await readFile(join(repoRoot,'.local/hosted-release/private-access-result.json'),'utf8'));assert.equal(receipt.status,status);assert.equal(JSON.stringify(receipt).includes(secret),false);});
 await fixture(async(repoRoot,env)=>{env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/prerequisites-result.json'),JSON.stringify({status:'REQUIRES_REVIEW'}));await assert.rejects(api.runBackendReleasePhase({mode:'verify-private',repoRoot,env}));assert.deepEqual(state.events,['approval']);});
});
test('a session endpoint is part of the package and changed endpoint bytes cannot reach credential consumers',async()=>{const api=await subject();await fixture(async(repoRoot,env)=>{const endpoint={projectRef:'mqxdjvsyckzocokuikmx',kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'};state.bundle.migrationEndpoint=endpoint;(state.bundle.expected as {fingerprints:object}).fingerprints={migrationEndpointSha256:digest(canonicalReleaseReviewJson(endpoint))};await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));await api.runBackendReleasePhase({mode:'approval',repoRoot,env});assert.deepEqual(state.events,['approval']);state.events=[];endpoint.host='aws-0-other.pooler.supabase.com';await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));await assert.rejects(api.runBackendReleasePhase({mode:'approval',repoRoot,env}));assert.deepEqual(state.events,[]);});});

test('activation requires current exact Data API observation and confirmed private prerequisites before its consumer',async()=>{
  const api=await subject();for(const mode of ['confirmed','missing','stale','private','activation'])await fixture(async(repoRoot,env)=>{
    env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';
    await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');await writeFile(join(repoRoot,'.local/hosted-release/provider-result.json'),JSON.stringify({status:'DEPLOYED_INACTIVE',api:{url:'https://cuevo-api.vercel.app',deploymentId:'dpl_exact'},edge:{id:'edge-exact',version:1}}));
    await writeFile(join(repoRoot,'.local/hosted-release/prerequisites-result.json'),JSON.stringify({status:'PREREQUISITES_OBSERVED',apiReady:true,roleSessions:5,crossSchoolDenied:true}));await writeFile(join(repoRoot,'.local/hosted-release/private-access-result.json'),JSON.stringify({status:mode==='private'?'REQUIRES_REVIEW':'PRIVATE_PROBES_CONFIRMED',sessionsClosed:true,restrictedDatabaseGrants:true,privateStorage:true,privateRealtime:true}));
    if(mode!=='missing')env.CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON=canonicalReleaseReviewJson({sourceSha:env.GITHUB_SHA,dataApi:'DISABLED',observer:'Founder delegated operator observation',status:'OBSERVED_PROVIDER_UI',visibleText:'Data API is disabled',observedAt:new Date(Date.now()-(mode==='stale'?7200000:0)).toISOString(),projectRef:'mqxdjvsyckzocokuikmx',source:'https://supabase.com/dashboard/project/mqxdjvsyckzocokuikmx/integrations/data_api/settings'});
    if(mode==='activation')state.activationStatus='REQUIRES_REVIEW';
    if(mode==='confirmed'){const result=await api.runBackendReleasePhase({mode:'activate',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.equal('recoveryVerified' in result?result.recoveryVerified:undefined,false);assert.deepEqual(state.events,['approval','activate']);}
    else{await assert.rejects(api.runBackendReleasePhase({mode:'activate',repoRoot,env}));assert.deepEqual(state.events,mode==='activation'?['approval','activate']:['approval']);}
  });
});

test('native recovery phase preserves unknown outcome and validates source before its credential consumer',async()=>{
  const api=await subject();for(const kind of ['confirmed','unverified','approval'])await fixture(async(repoRoot,env)=>{
    env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');state.recoveryStatus=kind==='unverified'?'REQUIRES_REVIEW':'FAULT_RECOVERY_VERIFIED';state.failApproval=kind==='approval';
    if(kind==='confirmed'){const result=await api.runBackendReleasePhase({mode:'verify-recovery',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','recovery']);}
    else{await assert.rejects(api.runBackendReleasePhase({mode:'verify-recovery',repoRoot,env}));assert.deepEqual(state.events,kind==='approval'?['approval']:['approval','recovery']);}
  });
});

test('frontend handover preserves missing backend gates as failure with a retained safe result',async()=>{
  const api=await subject();for(const kind of ['confirmed','missing','approval'])await fixture(async(repoRoot,env)=>{
    env.VERCEL_TOKEN=secret;state.handoverStatus=kind==='missing'?'REQUIRES_REVIEW':'PREPARED_STAGING_MANIFEST';state.failApproval=kind==='approval';
    if(kind==='confirmed'){const result=await api.runBackendReleasePhase({mode:'handover',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','handover']);}
    else await assert.rejects(api.runBackendReleasePhase({mode:'handover',repoRoot,env}));
    if(kind==='missing'){const result=JSON.parse(await readFile(join(repoRoot,'.local/hosted-release/web-handover-result.json'),'utf8'));assert.equal(result.status,'REQUIRES_REVIEW');assert.deepEqual(result.pendingGates,['DATABASE_BACKUP_RESTORE']);}
  });
});

test('database restore consumer is bound to the admitted API and cannot promote an unverified restore',async()=>{
  const api=await subject();for(const kind of ['verified','review','approval'])await fixture(async(repoRoot,env)=>{
    env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');await writeFile(join(repoRoot,'.local/hosted-release/provider-result.json'),JSON.stringify({status:'DEPLOYED_INACTIVE',api:{url:'https://cuevo-api.vercel.app',deploymentId:'dpl_exact'}}));state.restoreStatus=kind==='review'?'REQUIRES_REVIEW':'VERIFIED';state.failApproval=kind==='approval';
    if(kind==='verified'){const result=await api.runBackendReleasePhase({mode:'verify-restore',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','restore']);}
    else{await assert.rejects(api.runBackendReleasePhase({mode:'verify-restore',repoRoot,env}));assert.deepEqual(state.events,kind==='approval'?['approval']:['approval','restore']);}
  });
});

test('fixed staging origin binding consumes only current runtime and preserves failed verification',async()=>{
  const api=await subject();for(const kind of ['verified','review','approval'])await fixture(async(repoRoot,env)=>{
    env.VERCEL_TOKEN=secret;env.CUEVO_SYNTHETIC_PILOT_PASSWORD='protected-synthetic-pilot-password';await writeFile(join(repoRoot,'.local/hosted-release/runtime-private.json'),'{}');state.originStatus=kind==='review'?'REQUIRES_REVIEW':'API_ORIGIN_BOUND';state.failApproval=kind==='approval';
    if(kind==='verified'){const result=await api.runBackendReleasePhase({mode:'bind-api',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','origin']);}
    else{await assert.rejects(api.runBackendReleasePhase({mode:'bind-api',repoRoot,env}));assert.deepEqual(state.events,kind==='approval'?['approval']:['approval','origin']);}
  });
});

test('public frontend settings cannot bypass current backend approval or missing handover evidence',async()=>{
  const api=await subject();for(const kind of ['confirmed','review','approval'])await fixture(async(repoRoot,env)=>{env.VERCEL_TOKEN=secret;state.webStatus=kind==='review'?'REQUIRES_REVIEW':'WEB_PUBLIC_SETTINGS_CONFIRMED';state.failApproval=kind==='approval';
    if(kind==='confirmed'){const result=await api.runBackendReleasePhase({mode:'configure-web',repoRoot,env});assert.equal(result.hostedAcceptance,false);assert.deepEqual(state.events,['approval','web-settings']);}
    else{await assert.rejects(api.runBackendReleasePhase({mode:'configure-web',repoRoot,env}));assert.deepEqual(state.events,kind==='approval'?['approval']:['approval','web-settings']);}
  });
});


test('installed runtime cannot repeat migration population provider deployment or worker activation',async()=>{const api=await subject();for(const mode of ['bootstrap-schema','provision','deploy','activate'] as const)await fixture(async(repoRoot,env)=>{(state.bundle.expected as Record<string,unknown>).executionScope='installed-runtime';(state.bundle.expected as Record<string,unknown>).installedRuntime={sourceSha:env.GITHUB_SHA};await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));await assert.rejects(api.runBackendReleasePhase({mode,repoRoot,env}));assert.deepEqual(state.events,[]);});});

test('installed schema continues through the existing migration owner without empty-target bucket bootstrap',async()=>{const api=await subject();await fixture(async(repoRoot,env)=>{(state.bundle.expected as Record<string,unknown>).installedSchema={sourceSha:env.GITHUB_SHA,treeSha:'b'.repeat(40),migrationCount:123};await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));const result=await api.runBackendReleasePhase({mode:'bootstrap-schema',repoRoot,env});assert.equal(result.status,'COMMITTED');assert.deepEqual(state.events,['approval','schema']);});});

test('active runtime provider metadata remains unverified until hosted checks run and resumption creates no deployment',async()=>{const api=await subject();await fixture(async(repoRoot,env)=>{const expected=state.bundle.expected as Record<string,unknown>;expected.executionScope='installed-runtime';expected.installedRuntime={sourceSha:env.GITHUB_SHA};expected.fingerprints={...(expected.fingerprints as object),apiArtifactSha256:'a'.repeat(64),edgeArtifactSha256:'b'.repeat(64),denoLockSha256:'c'.repeat(64)};await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));env.VERCEL_TOKEN=secret;env.CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON=canonicalReleaseReviewJson({sourceSha:env.GITHUB_SHA,dataApi:'DISABLED',observer:'Founder',status:'OBSERVED_PROVIDER_UI',visibleText:'Data API is disabled',observedAt:new Date().toISOString(),projectRef:'mqxdjvsyckzocokuikmx',source:'https://supabase.com/dashboard/project/mqxdjvsyckzocokuikmx/integrations/data_api/settings'});const result=await api.runBackendReleasePhase({mode:'resume-runtime',repoRoot,env});assert.equal(result.status,'INSTALLED_RUNTIME_REVALIDATED');assert.deepEqual(state.events,['approval','read-runtime','resume','preview']);const provider=JSON.parse(await readFile(join(repoRoot,'.local/hosted-release/provider-result.json'),'utf8'));assert.equal(provider.status,'DEPLOYED_ACTIVE_REVALIDATED');assert.equal(provider.mutation,'NOT_ATTEMPTED');assert.equal(provider.api.healthVerified,false);assert.equal(provider.edge.customAuthenticationVerified,false);assert.equal(JSON.stringify(provider).includes(secret),false);assert.equal(await readFile(join(repoRoot,'.local/hosted-release/database-ca.pem'),'utf8'),env.CUEVO_DATABASE_TLS_CA);});});
