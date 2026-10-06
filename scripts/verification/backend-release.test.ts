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
const state = { events: [] as string[], failApproval: false, status: 'COMMITTED', bundle: {} as Record<string, unknown> };
const replacements: Record<string, string> = {
  'backend-release-prepare.ts': 'export const prepareNativeBackendRelease=globalThis.backendPhaseFixture.prepare;',
  'backend-release-admission.ts': 'export const readBackendReleaseAdmission=globalThis.backendPhaseFixture.admission;',
  'backend-release-contracts.ts': 'export const validatePreparedBackendReleaseIntent=globalThis.backendPhaseFixture.validate;',
  'hosted-operator-storage-bootstrap.ts': 'export const createHostedOperatorStorageBootstrap=globalThis.backendPhaseFixture.bootstrap;',
  'hosted-migration-executor.ts': 'export const executeNativeHostedMigrations=globalThis.backendPhaseFixture.schema;',
  'hosted-synthetic-population.ts': 'export const seedHostedSyntheticPopulation=globalThis.backendPhaseFixture.population;',
  'hosted-synthetic-auth.ts': 'export const provisionHostedSyntheticAuth=globalThis.backendPhaseFixture.auth;',
  'hosted-migration-database.ts': 'export const createHostedMigrationDatabase=globalThis.backendPhaseFixture.database;',
  'backend-provider-deploy.ts': 'export const deployBackendProviders=globalThis.backendPhaseFixture.deploy;',
  'backend-hosted-verification.ts': 'export const verifyHostedBackendPrerequisites=globalThis.backendPhaseFixture.verify;',
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
  prepare: async (input: Record<string, unknown>) => { state.events.push('prepare'); assert.equal(input.providerToken, secret); return { ...state.bundle, preparedApproval: { canonicalJson: '{}', comment: 'Source-bound package comment' }, bundlePath: join(input.repoRoot as string, '.local/hosted-release/backend-bundle.json'), bundleSha256: digest(JSON.stringify(state.bundle)) }; },
  validate: (prepared: unknown) => prepared,
  admission: async () => { state.events.push('approval'); if (state.failApproval) throw Error(secret); return { provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE', approval: { state: 'approved' } }; },
  bootstrap: async (input: Record<string, unknown>) => { state.events.push('bucket'); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input, 'migrationPassword'), false); return { bootstrap: async () => ({ status: 'CREATED_CONFIRMED', mutation: 'CONFIRMED' }) }; },
  schema: async (input: Record<string, unknown>) => { state.events.push('schema'); assert.equal(input.migrationPassword, secret); assert.equal(input.journalStorageKey, secret); assert.equal(Object.hasOwn(input.toolchain as object, 'SUPABASE_ACCESS_TOKEN'), false); return { status: state.status, schemaHistoryAtomic: false, hostedAcceptance: false }; },
  population: async () => { state.events.push('population'); return { status: state.status === 'COMMITTED' ? 'POPULATED_CONFIRMED' : 'REQUIRES_REVIEW', commitment: 'CONFIRMED', hostedAcceptance: false }; },
  auth: async (input: Record<string, unknown>) => { state.events.push('auth'); assert.equal(input.authProvisioningKey, secret); assert.equal(input.syntheticPassword, 'protected-synthetic-pilot-password'); assert.equal(Object.hasOwn(input, 'journalStorageKey'), false); return { status: 'CONFIRMED', created: 133, confirmed: 133, hostedAcceptance: false }; },
  database: async () => ({ withLock: async (_key: string, run: () => Promise<void>) => { await run(); return { kind: 'RELEASED' }; }, provisionInitialRuntimeRoles: async (input: {apiPassword64hex:string;workerPassword64hex:string}) => { state.events.push('roles'); assert.match(input.apiPassword64hex,/^[a-f0-9]{64}$/); assert.match(input.workerPassword64hex,/^[a-f0-9]{64}$/); return {status:'CONFIRMED',apiLogin:true,workerLogin:true}; }, executeReferenceScenarioSource: async () => { state.events.push('reference'); return { status: 'CONFIRMED' }; } }),
  deploy: async (input: {runtimeConfig:{api:{DATABASE_URL:string};edge:{CUEVO_WORKER_DATABASE_URL:string}}}) => {state.events.push('deploy');assert.equal(new URL(input.runtimeConfig.api.DATABASE_URL).username,'cuevo_api');assert.equal(new URL(input.runtimeConfig.edge.CUEVO_WORKER_DATABASE_URL).username,'cuevo_worker');return{status:'DEPLOYED_INACTIVE',hostedAcceptance:false};},
  verify: async () => {state.events.push('verify');return{status:'PREREQUISITES_OBSERVED',activationAllowed:false,hostedAcceptance:false};},
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
    state.events = []; state.failApproval = false; state.status = 'COMMITTED';
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
test('provider deployment reads confirmed private runtime inputs without returning any credential',async()=>{
  const api=await subject();await fixture(async(repoRoot,env)=>{
    const expected=state.bundle.expected as {targets:{supabase:{projectRef:string}};releaseSha:string};
    Object.assign(expected.targets,{web:{origin:'https://cuevo-beta.vercel.app'}});await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));env.VERCEL_TOKEN=secret;
    await writeFile(join(repoRoot,'.local/hosted-release/runtime-roles-result.json'),JSON.stringify({status:'CONFIRMED',apiLogin:true,workerLogin:true}));await writeFile(join(repoRoot,'.local/hosted-release/reference-result.json'),JSON.stringify({status:'CONFIRMED',cleanup:'RELEASED'}));
    await writeFile(join(repoRoot,'.local/hosted-release/runtime-role-passwords.json'),JSON.stringify({purpose:'INITIAL_RESTRICTED_RUNTIME_CREDENTIALS',sourceSha:expected.releaseSha,projectRef:expected.targets.supabase.projectRef,api:'a'.repeat(64),worker:'b'.repeat(64)}));
    (globalThis as unknown as {backendPhaseProviderKeys:object}).backendPhaseProviderKeys={};const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json([{name:'default',type:'publishable',api_key:'sb_publishable_sourcefixturekey'},{name:'default',type:'secret',api_key:'sb_secret_api_runtime_private'}]);
    try{const result=await api.runBackendReleasePhase({mode:'deploy',repoRoot,env});assert.equal(result.status,'DEPLOYED_INACTIVE');assert.deepEqual(state.events,['approval','deploy']);assert.equal(JSON.stringify(result).includes(secret),false);}finally{globalThis.fetch=originalFetch;}
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
    assert.equal(result.status, 'CONFIRMED'); assert.deepEqual(state.events, ['approval', 'population', 'auth', 'approval', 'roles', 'reference']);
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
test('a session endpoint is part of the package and changed endpoint bytes cannot reach credential consumers',async()=>{const api=await subject();await fixture(async(repoRoot,env)=>{const endpoint={projectRef:'mqxdjvsyckzocokuikmx',kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'};state.bundle.migrationEndpoint=endpoint;(state.bundle.expected as {fingerprints:object}).fingerprints={migrationEndpointSha256:digest(canonicalReleaseReviewJson(endpoint))};await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));await api.runBackendReleasePhase({mode:'approval',repoRoot,env});assert.deepEqual(state.events,['approval']);state.events=[];endpoint.host='aws-0-other.pooler.supabase.com';await writeFile(env.CUEVO_BACKEND_BUNDLE_PATH,canonicalReleaseReviewJson(state.bundle));env.CUEVO_BACKEND_BUNDLE_SHA256=digest(canonicalReleaseReviewJson(state.bundle));await assert.rejects(api.runBackendReleasePhase({mode:'approval',repoRoot,env}));assert.deepEqual(state.events,[]);});});
