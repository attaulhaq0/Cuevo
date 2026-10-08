import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { readCanonicalMigrationSources, planHostedMigrations, canonicalHostedMigrationPlan, type MigrationSource } from './hosted-migration-plan';
import type { admitHostedMigrationStageFiles } from './hosted-migration-stage-files';
import { createHostedMigrationWorkdirs } from './hosted-migration-workdirs';
import type { SyntheticAuthSeedManifest, SyntheticAuthSeedReceipt } from '../seed-auth';

const ref = 'mqxdjvsyckzocokuikmx', secret = 'sb_secret_native-auth-private-canary', root = resolve(import.meta.dirname, '../..'), rawManifest = await readFile(join(root, 'supabase/seed/identities.json')), manifest = JSON.parse(rawManifest.toString('utf8')) as SyntheticAuthSeedManifest;
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(), sources = readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }).sources;
// A distinct module identity keeps the production file port intercepted while these two source cases execute its real implementation.
const { admitHostedMigrationStageFiles: admitActualStageFiles } = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-stage-files.ts')).href + '?actual-auth-inventory-fixture') as { admitHostedMigrationStageFiles: typeof admitHostedMigrationStageFiles };
type State = { events: string[]; users: Map<string, ReturnType<typeof user>>; receipt: SyntheticAuthSeedReceipt | null; failures: string[]; posts: number; held: boolean; loseAck: boolean; controller: AbortController; input: Record<string, unknown>; path: string; sources: MigrationSource[]; attemptIdentities: unknown[]; actualFiles: boolean; recoveryPermit: object; recoveryAdmissions: number; recoveryAssertions: number; recoveryValid: boolean };
let state: State;
const user = (actor: SyntheticAuthSeedManifest['actors'][number]) => ({ id: actor.actorId, email: actor.email, is_anonymous: false, user_metadata: { synthetic: true }, email_confirmed_at: '2026-10-06T00:00:00Z', created_at: '2026-10-06T00:00:00Z', aud: 'authenticated', role: 'authenticated' });
const fail = (name: string) => { if (state.failures.includes(name)) throw Error(secret); };
Object.assign(globalThis, { nativeAuthFixture: {
  prepared: (value: unknown) => { fail('prepared'); return value; },
  admission: async (value: { expected: unknown; prepared: { sha256: string } }) => { state.events.push('admission'); fail('admission'); return { expected: value.expected, approval: { packageSha256: value.prepared.sha256 }, provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' }; },
  provider: async () => ({ observedAtMs: Date.now(), projectRef: ref, directEndpoint: { projectRef: ref, kind: 'direct', host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres' },sessionEndpoint:{projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'} }),
  files: async (input: Parameters<typeof admitActualStageFiles>[0]) => { state.events.push('files'); fail('files'); const result=state.actualFiles ? await admitActualStageFiles(input) : { sources: state.sources };if(state.failures.includes('slow-source'))(globalThis as unknown as {nativeAuthFixture:{advanceSourceClock:()=>void}}).nativeAuthFixture.advanceSourceClock();return result; },
  reference: () => { fail('mixed'); },
  // The issuer is controlled here; real native authority is covered separately.
  recoveryAssertion: (permit:unknown,identity:{projectRef:string;sourceSha:string;approvalDigest:string},purpose:string) => { state.recoveryAssertions++;assert.equal(permit,state.recoveryPermit);assert.equal(identity.projectRef,ref);assert.equal(identity.sourceSha,(state.input.expected as {releaseSha:string}).releaseSha);assert.equal(identity.approvalDigest,'b'.repeat(64));assert.equal(purpose,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');if(!state.held||!state.recoveryValid)throw Error('Controlled native consumption became stale'); },
  database: async () => ({ signal: state.controller.signal,
    admitSchemaContinuation: async (request:{consumption:string}) => { assert.equal(state.held,true);assert.equal(request.consumption,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');state.recoveryAdmissions++;state.recoveryPermit=Object.freeze({});state.recoveryValid=true;return state.recoveryPermit; },
    withLock: async (key: string, run: (lease: unknown) => Promise<void>) => { assert.equal(key, ref + ':HOSTED_SCHEMA_MIGRATION'); state.held = true; state.events.push('lock'); try { await run({ kind: 'HELD', id: 'native-auth-lease', key }); } finally { state.held = false; } return { kind: state.failures.includes('unlock') ? 'RELEASE_UNCONFIRMED' : 'RELEASED' }; },
    observe: async () => { fail('history'); return { operator: 'postgres', database: 'postgres', tls: { kind: 'PEER_VERIFIED', host: (state.input.endpoint as {host:string}).host, certificateSha256: 'a'.repeat(64) }, historyPresent: true, history: state.sources.map(source => { const text = new TextDecoder().decode(source.bytes).trim(); return { version: source.name.slice(0, 14), name: source.name.slice(15, -4), statements: text ? [text] : [] }; }) }; },
    observeStage: async () => ({ observedAtMs: Date.now(), checks: { foundation: true, rls: true, privateRelations: true, privateFunctions: true, runtimeRoles: true, nativeSourceBridge: true, curriculumLifecycle: true, dispatchInactive: !state.failures.includes('active'), analyticsInactive: true, recoveryCronInactive: true, transportPrivate: true } }),
    observeSyntheticPopulation: async () => {
      fail('population');if(state.failures.includes('stale-consumption')&&state.recoveryAdmissions>=2)state.recoveryValid=false; const people = manifest.actors.map(actor => ({ schoolId: actor.schoolId, actorId: actor.actorId, displayName: actor.displayName, synthetic: true })); if (state.failures.includes('mixed')) people[0].synthetic = false;
      return { observedAtMs: Date.now(), population: { schools: [{ id: manifest.schoolId, name: 'Cuevo Reference Academy – Doha', countryCode: 'QA', languages: ['en', 'ar'], status: 'active' }, { id: manifest.denialSchoolId, name: 'Synthetic Isolation School', countryCode: 'QA', languages: ['en', 'ar'], status: 'active' }], people, memberships: manifest.actors.map(actor => ({ id: '21000000-0000-4000-8000-' + actor.actorId.slice(-12), schoolId: actor.schoolId, actorId: actor.actorId, role: actor.role, status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null })) }, authUsers: [...state.users.values()].map(row => ({ id: row.id, email: row.email, emailConfirmedAt: row.email_confirmed_at, synthetic: row.user_metadata.synthetic, isAnonymous: row.is_anonymous, deletedAt: null, bannedUntil: null })) };
    },
    readAuthSeedAttempt: async (identity: unknown) => { state.attemptIdentities.push(structuredClone(identity)); state.events.push('read-attempt'); fail('receipt-read'); return structuredClone(state.receipt); },
    readInstalledPopulation:async()=>{const expected=state.input.expected as {releaseSha:string;treeSha:string};return{version:1,purpose:'CUEVO_INSTALLED_SYNTHETIC_POPULATION',sourceSha:expected.releaseSha,treeSha:expected.treeSha,projectRef:ref,seedSha256:'7be612e9a30e916ec4b460a2ae14a2796cb3f4f542cbdec8f7db2f49c95d9903',manifestSha256:createHash('sha256').update(canonicalReleaseExecutionJson(manifest)).digest('hex')};},
    persistAuthSeedAttempt: async (identity: unknown, receipt: SyntheticAuthSeedReceipt) => { state.attemptIdentities.push(structuredClone(identity)); assert.equal(state.held, true); state.events.push('persist:' + receipt.actors.filter(actor => actor.state === 'INTENT').length); state.receipt = structuredClone(receipt); if (state.failures.includes('persist')) throw Error(secret); },
  }),
} });
const replacements: Record<string, string> = { 'backend-release-admission.ts': 'export const readBackendReleaseAdmission=globalThis.nativeAuthFixture.admission;', 'backend-release-contracts.ts': 'export const validatePreparedBackendReleaseIntent=globalThis.nativeAuthFixture.prepared;', 'hosted-migration-provider.ts': 'export const readHostedMigrationProvider=globalThis.nativeAuthFixture.provider;', 'hosted-migration-stage-files.ts': 'export const admitHostedMigrationStageFiles=globalThis.nativeAuthFixture.files;', 'hosted-migration-database.ts': 'export const createHostedMigrationDatabase=globalThis.nativeAuthFixture.database;export const assertNativeSchemaRecoveryConsumption=globalThis.nativeAuthFixture.recoveryAssertion;', 'hosted-reference-population.ts': 'export const validateHostedReferencePopulation=globalThis.nativeAuthFixture.reference;' };
// Native observations and the separately tested full reference mapping are
// intercepted. Real SDK, seed core, current Auth-subset validation, connection
// configuration, raw-history and HTTP/body/source guards execute.
registerHooks({ resolve(specifier, context, next) { const name = specifier.split('/').at(-1); if (name && replacements[name + '.ts']) return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true }; return next(specifier, context); }, load(url, context, next) { const name = url.split('/').at(-1)!; if(name==='hosted-migration-provider.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace('async function readHostedMigrationProvider(value) {','async function readHostedMigrationProvider(value) { return globalThis.nativeAuthFixture.provider(value);')};if (replacements[name]) return { format: 'module', shortCircuit: true, source: replacements[name] }; if (name === 'hosted-synthetic-auth.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
async function api() { return await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-synthetic-auth.ts')).href) as typeof import('./hosted-synthetic-auth'); }
async function fixture(run: (input: Record<string, unknown>) => Promise<void>, additionalSources: MigrationSource[] = [], actualFiles = false) {
  const path = await mkdtemp(join(tmpdir(), 'cuevo-native-auth-')), originalFetch = globalThis.fetch;
  try {
    await writeFile(join(path, '.gitignore'), '.local/\n'); await mkdir(join(path, 'supabase/seed'), { recursive: true }); await writeFile(join(path, 'supabase/seed/identities.json'), rawManifest);
    const fixtureSources = [...sources, ...additionalSources];
    if (actualFiles) { await mkdir(join(path, 'supabase/migrations')); for (const source of fixtureSources) await writeFile(join(path, 'supabase/migrations', source.name), source.bytes); }
    const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); git('init', '--quiet'); git('config', 'core.autocrlf', 'false'); git('add', '.'); git('-c', 'user.name=Auth fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'source');
    const sourceSha = git('rev-parse', 'HEAD'), treeSha = git('rev-parse', 'HEAD^{tree}'), now = Date.now(), plan = planHostedMigrations({ sources: fixtureSources, source: { sha: sourceSha, tree: treeSha }, now, target: { projectRef: ref, boundProjectRef: ref, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', observedAt: new Date(now).toISOString(), authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY' } });
    await mkdir(join(path, '.local/hosted-release'), { recursive: true });
    const finalStage = actualFiles ? (await createHostedMigrationWorkdirs({ repoRoot: path, sourceSha, treeSha, plan, outputRoot: join(path, '.local/hosted-release') })).stages.at(-1)! : { id: 'remaining', included: plan.migrations };
    const expected = { releaseSha: sourceSha, treeSha, fingerprints: { migrationPlanSha256: canonicalHostedMigrationPlan(plan).sha256 }, targets: { supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co` } } }, preparedApproval = { sha256: 'b'.repeat(64) };
    const endpoint={projectRef:ref,kind:'direct',host:`db.${ref}.supabase.co`,port:5432,database:'postgres'}; const input = { endpoint, repoRoot: path, expected, preparedApproval, githubToken: secret, providerToken: secret, certificate: { path: join(path, '.local/hosted-release/ca.pem'), sha256: 'a'.repeat(64) }, migrationPassword: secret, plan, finalStage, authProvisioningKey: secret, syntheticPassword: 'native-synthetic-password-private', originalKey: 'cuevo-initial-hosted-synthetic-auth' };
    (input.expected as {fingerprints:Record<string,string>}).fingerprints.migrationEndpointSha256=createHash('sha256').update(canonicalReleaseExecutionJson(endpoint)).digest('hex');state = { events: [], users: new Map(), receipt: null, failures: [], posts: 0, held: false, loseAck: false, controller: new AbortController(), input, path, sources: fixtureSources, attemptIdentities: [], actualFiles, recoveryPermit:{},recoveryAdmissions:0,recoveryAssertions:0,recoveryValid:false };
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw)); assert.equal(options?.redirect, 'error');
      if (url.origin === 'https://api.supabase.com') { assert.equal(url.pathname, `/v1/projects/${ref}/database/query`); assert.equal(options?.method, 'POST'); assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer ' + secret); assert.deepEqual(Object.keys(JSON.parse(String(options?.body))), ['query']); return Response.json([{ authUsers: state.users.size + (state.failures.includes('count') ? 1 : 0) }]); }
      assert.equal(url.origin, `https://${ref}.supabase.co`); const headers = new Headers(options?.headers); assert.equal(headers.get('apikey'), secret); assert.equal(headers.has('Authorization'), false); assert.equal(state.held, true);
      if (options?.method === 'POST') { assert.equal(url.pathname, '/auth/v1/admin/users'); assert.ok(state.receipt); const body = JSON.parse(String(options.body)), actor = manifest.actors.find(row => row.actorId === body.id)!; assert.equal(state.receipt!.actors.find(row => row.actorId === body.id)!.state, 'INTENT'); assert.deepEqual(body, { id: actor.actorId, email: actor.email, password: input.syntheticPassword, email_confirm: true, user_metadata: { synthetic: true } }); state.posts++; state.events.push('post'); state.users.set(actor.actorId, user(actor)); if (state.loseAck) { state.loseAck = false; throw Error(secret); } return Response.json(user(actor)); }
      assert.equal(options?.method, 'GET'); const id = url.pathname.split('/').at(-1)!; const found = state.users.get(id); return found ? Response.json(found) : Response.json({ code: 'user_not_found', message: 'User not found' }, { status: 404, headers: { 'X-Supabase-Api-Version': '2024-01-01' } });
    };
    await run(input);
  } finally { globalThis.fetch = originalFetch; await rm(path, { recursive: true, force: true }); }
}
test('native hosted Auth uses one accepted seed core and actual SDK fixed create after durable intent, then all133 readback', async () => { const { provisionHostedSyntheticAuth } = await api(); await fixture(async input => { const result = await provisionHostedSyntheticAuth(input); assert.equal(result.status, 'CONFIRMED'); assert.equal(result.created, 133); assert.equal(result.confirmed, 133); assert.equal(state.posts, 133); assert.equal(state.receipt?.status, 'CONFIRMED'); assert.ok(state.events.indexOf('persist:1') < state.events.indexOf('post')); assert.equal(JSON.stringify(result).includes(secret), false); const original = structuredClone(state.receipt), persists = state.events.filter(event => event.startsWith('persist')).length; const repeated = await provisionHostedSyntheticAuth(input); assert.equal(repeated.status, 'CONFIRMED'); assert.equal(repeated.created, 0); assert.equal(repeated.receiptSha256, result.receiptSha256); assert.equal(state.posts, 133); assert.equal(state.events.filter(event => event.startsWith('persist')).length, persists); assert.deepEqual(state.receipt, original); }); });
test('history activecontrols mixedpopulation and count disagreement refuse before native Auth POST', async () => { const { provisionHostedSyntheticAuth } = await api(); for (const failure of ['files', 'history', 'active', 'mixed', 'count', 'admission']) await fixture(async input => { state.failures = [failure]; assert.equal((await provisionHostedSyntheticAuth(input)).status, 'REQUIRES_REVIEW'); assert.equal(state.posts, 0); }); });

test('slow exact source proof refreshes official authority after it without extending an old observation',async()=>{
 const {provisionHostedSyntheticAuth}=await api(),realNow=Date.now;let clock=realNow();
 try{Date.now=()=>clock;await fixture(async input=>{const owner=(globalThis as unknown as {nativeAuthFixture:{advanceSourceClock?:()=>void}}).nativeAuthFixture;state.failures=['slow-source'];owner.advanceSourceClock=()=>{clock+=31000;};
  try{const result=await provisionHostedSyntheticAuth(input);assert.equal(result.status,'CONFIRMED');assert.equal(state.posts,133);assert(state.events.filter(row=>row==='admission').length>1);}finally{delete owner.advanceSourceClock;}
 });}finally{Date.now=realNow;}
});
test('lost create acknowledgement persists original intent and later exact identity reconciles with no duplicate', async () => { const { provisionHostedSyntheticAuth } = await api(); await fixture(async input => { state.loseAck = true; assert.equal((await provisionHostedSyntheticAuth(input)).status, 'OUTCOME_UNKNOWN'); assert.equal(state.posts, 1); assert.equal(state.receipt?.actors[0].state, 'OUTCOME_UNKNOWN'); const result = await provisionHostedSyntheticAuth(input); assert.equal(result.status, 'CONFIRMED'); assert.equal(state.posts, 133); }); });

test('a freshly approved installed continuation preserves original Auth identity through partial reconciliation',async()=>{
 const {provisionHostedSyntheticAuth}=await api();await fixture(async input=>{
  state.loseAck=true;assert.equal((await provisionHostedSyntheticAuth(input)).status,'OUTCOME_UNKNOWN');const original=structuredClone(state.attemptIdentities[0]);
  const previous=input.expected as {releaseSha:string;treeSha:string;fingerprints:Record<string,string>};const oldSha=previous.releaseSha,oldTree=previous.treeSha;
  await writeFile(join(state.path,'continuation.md'),'Current approved continuation\n');execFileSync('git',['-C',state.path,'add','.']);execFileSync('git',['-C',state.path,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','continuation']);
  previous.releaseSha=execFileSync('git',['-C',state.path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();previous.treeSha=execFileSync('git',['-C',state.path,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
  const plan=input.plan as {source:{sha:string;tree:string};mode:string};plan.source={sha:previous.releaseSha,tree:previous.treeSha};plan.mode='INCREMENTAL';previous.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(plan as Parameters<typeof canonicalHostedMigrationPlan>[0]).sha256;
  Object.assign(previous,{installedSource:{sourceSha:oldSha,treeSha:oldTree,seedSha256:'7be612e9a30e916ec4b460a2ae14a2796cb3f4f542cbdec8f7db2f49c95d9903',manifestSha256:createHash('sha256').update(canonicalReleaseExecutionJson(manifest)).digest('hex'),migrationCount:state.sources.length}});
  const result=await provisionHostedSyntheticAuth(input);assert.equal(result.status,'CONFIRMED');assert.equal(state.posts,133);assert.ok(state.attemptIdentities.every(identity=>canonicalReleaseExecutionJson(identity)===canonicalReleaseExecutionJson(original)));
 });
});
test('installed Auth continuation cannot replace the original key',async()=>{
 const subject=await api();await fixture(async input=>{const expected=input.expected as {releaseSha:string;treeSha:string};Object.assign(expected,{installedSource:{sourceSha:expected.releaseSha,treeSha:expected.treeSha,manifestSha256:createHash('sha256').update(canonicalReleaseExecutionJson(manifest)).digest('hex')}});input.originalKey='replacement-auth-key';const result=await subject.provisionHostedSyntheticAuth(input);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.posts,0);});
});
test('completed resumed schema can provision the newly confirmed current-source seed through the original Auth key',async()=>{
 const subject=await api();await fixture(async input=>{const expected=input.expected as {releaseSha:string;treeSha:string;fingerprints:Record<string,string>};Object.assign(expected,{installedSchema:{sourceSha:expected.releaseSha,treeSha:expected.treeSha,migrationCount:123}});const plan=input.plan as {mode:string};plan.mode='INCREMENTAL';expected.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(plan as Parameters<typeof canonicalHostedMigrationPlan>[0]).sha256;const result=await subject.provisionHostedSyntheticAuth(input);assert.equal(result.status,'CONFIRMED');assert.equal(result.confirmed,133);assert.equal(state.posts,133);assert.ok(state.attemptIdentities.every(identity=>(identity as {sourceSha:string}).sourceSha===expected.releaseSha));});
});
test('handover Auth observation requires original complete receipt and exact current accounts with no creation',async()=>{
 const subject=await api();assert.equal(typeof subject.revalidateInstalledSyntheticAuth,'function');await fixture(async input=>{
  assert.equal((await subject.provisionHostedSyntheticAuth(input)).status,'CONFIRMED');const previous=input.expected as {releaseSha:string;treeSha:string};Object.assign(previous,{installedSource:{sourceSha:previous.releaseSha,treeSha:previous.treeSha,manifestSha256:createHash('sha256').update(canonicalReleaseExecutionJson(manifest)).digest('hex')}});
  const readOnly={...input};delete readOnly.authProvisioningKey;delete readOnly.syntheticPassword;const posts=state.posts;const result=await subject.revalidateInstalledSyntheticAuth(readOnly);assert.equal(result.status,'CONFIRMED');assert.equal(result.confirmed,133);assert.equal(state.posts,posts);
  state.users.delete(manifest.actors[0].actorId);assert.equal((await subject.revalidateInstalledSyntheticAuth(readOnly)).status,'REQUIRES_REVIEW');assert.equal(state.posts,posts);
 });
});
test('an uncertain original actor absent from Auth is never recreated and persistence lost acknowledgement stops before POST', async () => { const { provisionHostedSyntheticAuth } = await api(); await fixture(async input => { state.loseAck = true; await provisionHostedSyntheticAuth(input); state.users.clear(); assert.equal((await provisionHostedSyntheticAuth(input)).status, 'OUTCOME_UNKNOWN'); assert.equal(state.posts, 1); }); await fixture(async input => { state.failures = ['persist']; const result = await provisionHostedSyntheticAuth(input); assert.equal(result.status, 'OUTCOME_UNKNOWN'); assert.equal(state.posts, 0); }); });
test('input getters extra proof changed manifest and unconfirmed unlock remain refused without secret output', async () => { const { provisionHostedSyntheticAuth } = await api(); await fixture(async input => { let traps = 0; assert.equal((await provisionHostedSyntheticAuth({ ...input, get authProvisioningKey() { traps++; return secret; } })).status, 'REQUIRES_REVIEW'); assert.equal((await provisionHostedSyntheticAuth({ ...input, verified: true })).status, 'REQUIRES_REVIEW'); assert.equal(traps, 0); assert.equal(state.posts, 0); await writeFile(join(state.path, 'supabase/seed/identities.json'), '{}'); assert.equal((await provisionHostedSyntheticAuth(input)).status, 'REQUIRES_REVIEW'); }); await fixture(async input => { for (const actor of manifest.actors) state.users.set(actor.actorId, user(actor)); state.failures = ['unlock']; const result = await provisionHostedSyntheticAuth(input); assert.equal(result.status, 'OUTCOME_UNKNOWN'); assert.equal(result.cleanupCode, 'LOCK_RELEASE_UNCONFIRMED'); assert.equal(JSON.stringify(result).includes(secret), false); }); });
test('native Auth read-only confirmation uses the selected session host and changed endpoint cannot create an actor',async()=>{const{provisionHostedSyntheticAuth}=await api();await fixture(async input=>{const endpoint={projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'};input.endpoint=endpoint;(input.expected as {fingerprints:Record<string,string>}).fingerprints.migrationEndpointSha256=createHash('sha256').update(canonicalReleaseExecutionJson(endpoint)).digest('hex');for(const actor of manifest.actors)state.users.set(actor.actorId,user(actor));assert.equal((await provisionHostedSyntheticAuth(input)).status,'CONFIRMED');assert.equal(state.posts,0);input.endpoint={...endpoint,port:6543};assert.equal((await provisionHostedSyntheticAuth(input)).status,'REQUIRES_REVIEW');assert.equal(state.posts,0);});});
test('an appended canonical migration retains full source admission and original Auth attempt identity without a fixed final count', async () => {
  const { provisionHostedSyntheticAuth } = await api();
  const additional = { name: '20261007000000_appended_auth_inventory_fixture.sql', bytes: Buffer.from('-- Source-only appended inventory fixture; never executed.\nselect 1;\n') };
  await fixture(async input => {
    state.actualFiles = true;
    const plan = input.plan as ReturnType<typeof planHostedMigrations>;
    assert.equal(plan.migrations.length, sources.length + 1);
    assert.equal(plan.stages[0].names.length, 123); assert.equal(plan.stages[1].names.length, 1); assert.equal(plan.stages[2].names.length, 56);
    assert.equal((await provisionHostedSyntheticAuth(input)).status, 'CONFIRMED');
    assert.equal(state.posts, 133); assert.ok(state.events.indexOf('files') < state.events.indexOf('post'));
    const originalReceipt = structuredClone(state.receipt), originalIdentity = structuredClone(state.attemptIdentities[0]);
    assert.ok(state.attemptIdentities.every(identity => canonicalReleaseExecutionJson(identity) === canonicalReleaseExecutionJson(originalIdentity)));
    const repeated = await provisionHostedSyntheticAuth(input);
    assert.equal(repeated.status, 'CONFIRMED'); assert.equal(repeated.created, 0); assert.equal(state.posts, 133); assert.deepEqual(state.receipt, originalReceipt);
    assert.ok(state.attemptIdentities.every(identity => canonicalReleaseExecutionJson(identity) === canonicalReleaseExecutionJson(originalIdentity)));
  }, [additional], true);
});
test('a self-consistent shortened final plan cannot admit Auth before exact canonical files and history', async () => {
  const { provisionHostedSyntheticAuth } = await api();
  await fixture(async input => {
    state.actualFiles = true;
    const original = input.plan as ReturnType<typeof planHostedMigrations>;
    const observedAt = Date.now();
    const shortened = planHostedMigrations({ sources: state.sources.slice(0, -1), source: original.source, now: observedAt, target: { projectRef: ref, boundProjectRef: ref, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', observedAt: new Date(observedAt).toISOString(), authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY' } });
    input.plan = shortened;
    input.finalStage = { ...(input.finalStage as object), included: shortened.migrations, pending: shortened.pending, expectedAfterVersions: shortened.migrations.map(row => row.version).sort() };
    (input.expected as { fingerprints: Record<string, string> }).fingerprints.migrationPlanSha256 = canonicalHostedMigrationPlan(shortened).sha256;
    assert.equal((await provisionHostedSyntheticAuth(input)).status, 'REQUIRES_REVIEW'); assert.equal(state.posts, 0); assert.equal(state.receipt, null); assert.deepEqual(state.events, ['files']);
  }, [], true);
});


test('schema recovery consumption is reasserted after the final native count before Auth create',async()=>{
 const {provisionHostedSyntheticAuth}=await api();
 for(const stale of [false,true])await fixture(async input=>{
  Object.assign(input.expected as object,{schemaRecovery:{}});input.schemaRecoveryExport={};input.journalStorageKey=secret;
  if(stale)state.failures=['stale-consumption'];else state.loseAck=true;
  const result=await provisionHostedSyntheticAuth(input);
  assert.ok(state.recoveryAdmissions>=2,'last create reaches current native admission');
  assert.ok(state.recoveryAssertions>=1,'consumer asserts opaque consumption permit');
  assert.equal(state.posts,stale?0:1);assert.equal(result.status,'OUTCOME_UNKNOWN','seed core retains the original actor intent when create cannot be confirmed');
  assert.ok(state.receipt,'original durable actor intent remains retained');
 });
});
