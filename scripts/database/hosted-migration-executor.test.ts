import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks,createRequire,syncBuiltinESMExports } from 'node:module';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { HostedExecutionJournal } from './hosted-migration-execution';
import { planHostedMigrations, canonicalHostedMigrationPlan, readCanonicalMigrationSources, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { prepareHostedOperatorStoragePolicy } from './hosted-operator-storage-policy';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { hostedSyntheticSeedSha256, installedPopulationFingerprint, readInstalledPopulationReceipt, type InstalledPopulationReceipt } from './hosted-installed-state';
import type { HostedSyntheticPopulationObservation } from './hosted-reference-population';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const ref = 'mqxdjvsyckzocokuikmx', secret = 'private-native-composition-canary';
type State = { events: string[]; journal: HostedExecutionJournal | null; journals: Map<string, HostedExecutionJournal | null>; after: boolean; lost: boolean; failures: string[]; input?: Record<string, unknown>; sources: { name: string; bytes: Uint8Array }[]; stage?: Record<string, unknown>; controller: AbortController; commands: number; phaseVersions: string[][]; seenIntent: boolean; driftFiles: boolean; aggregate?: boolean; nativeProducer?: boolean; nativePeerAuthorized?: boolean; nativeSignal?: AbortSignal; nativeTargetKeys?: string[][];installed?:InstalledPopulationReceipt };
const state: State = { events: [], journal: null, journals: new Map(), after: false, lost: false, failures: [], sources: [], controller: new AbortController(), commands: 0, phaseVersions: [], seenIntent: false, driftFiles: false };

test('reconciliation scope cannot use the ordinary aggregate lane or missing exact recovery template',async()=>{
 const module=await api();await fixture(async input=>{const changed={...input,expected:{...(input.expected as object),executionScope:'reconcile-schema'}};const result=await module.executeNativeHostedMigrations(aggregateInput(changed));assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.seenIntent,false);});
});
test('original intent recovery refuses unpaired template evidence and selector-free claims before native consumers',async()=>{
 const module=await api();await fixture(async input=>{for(const fields of [{originalNativeIntentTemplate:{}},{originalNativeIntentEvidence:{selectionPath:'outside',selectionSha256:'1'.repeat(64),resultArchivePath:'outside',resultArchiveSha256:'2'.repeat(64),packageArchivePath:'outside',packageArchiveSha256:'3'.repeat(64)}},{expected:{...(input.expected as object),originalNativeIntentRecovery:{}}}]){const result=await module.executeNativeHostedMigrations({...aggregateInput(input),...fields});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.seenIntent,false);assert.equal(result.stages.length,0);}});
});
let canonicalSources: State['sources'] | undefined;

test('prospective child exit metadata is strict bounded evidence and cannot claim schema commitment',async()=>{
 const subject=await api(),value={index:1,batchSha256:'a'.repeat(64),beforeCount:124,afterCount:144,beforeHistorySha256:'b'.repeat(64),afterHistorySha256:'c'.repeat(64),cli:{kind:'EXITED',exitCode:0},exitedAtMs:1000,receipt:'UNCONFIRMED'};assert.deepEqual(subject.hostedMigrationChildExecutionSchema.parse(value),value);for(const patch of[{afterCount:145},{afterCount:124},{cli:{kind:'EXITED',exitCode:1}},{exitedAtMs:Number.MAX_SAFE_INTEGER+1},{receipt:'COMMITTED'},{privateConsole:secret}])assert.throws(()=>subject.hostedMigrationChildExecutionSchema.parse({...value,...patch}));
});

/** Transport-only fake for the unchanged database owner. Its real identity,
 * TLS, target observation and held-session checks feed the real executor. */
class ObserverTransportClient extends EventEmitter {
  connection = { stream: {
    encrypted: true, authorized: true, getProtocol: () => 'TLSv1.3',
    getPeerCertificate: () => ({ raw: Buffer.from('controlled-peer-certificate'), subjectaltname: `DNS:${(state.input!.endpoint as { host: string }).host}` }),
  } };
  async connect() { this.connection.stream.authorized = state.nativePeerAuthorized !== false; }
  async query(query: string | { text: string }) {
    const sql = typeof query === 'string' ? query : query.text;
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.includes('pg_advisory_unlock')) return { rows: [{ released: true }] };
    if (sql.includes('CUEVO_NATIVE_QUIESCENCE')) return { rows: [{ quiescent: true }] };
    if (sql.includes('session_user')) return { rows: [{ operator: 'postgres', database: 'postgres', ssl: true, serverVersion: 170011 }] };
    if (sql.includes('CUEVO_TARGET_COUNTS')) return { rows: [{ authUsers: 0, storageObjects: storageCount(), appSchemas: state.after ? ['app', 'authorization', 'internal'] : [], runtimeRoles: state.after ? ['cuevo_api', 'cuevo_worker'] : [], schoolsPresent: state.after }] };
    if (sql.includes('CUEVO_TARGET_SCHOOLS')) return { rows: [{ schools: 0 }] };
    if (sql.includes('CUEVO_STAGE_BASE')) return { rows: [{ foundation: true, rls: true, privateRelations: true, privateFunctions: true, runtimeRoles: true }] };
    if (sql.includes('CUEVO_RECOVERY_CRON_PRESENCE')) return { rows: [{ present: false }] };
    if (sql.includes("to_regclass('supabase_migrations.schema_migrations')")) return { rows: [{ historyPresent: state.after }] };
    if (sql.includes('from supabase_migrations.schema_migrations')) return { rows: rawHistory() };
    throw Error('Unexpected controlled native observer query');
  }
  async end() { this.emit('end'); }
}
Object.assign(globalThis, { nativeObserverTransportClient: ObserverTransportClient });

// Only native I/O imports are intercepted in this test module. The real protocol,
// connection preparation, raw-history verifier, filesystem and factory run.
const replacements: Record<string, string> = {
  'backend-release-admission.ts':"const handles=new WeakSet();export const readBackendReleaseAdmission=globalThis.nativeCompositionFixture.admission;export const prepareNativeBackendReleaseAdmission=async()=>{const handle=Object.freeze({});handles.add(handle);return handle;};export const readNativeBackendReleaseAdmission=async(handle,binding)=>{if(!handles.has(handle))throw Error('Unavailable controlled admission handle');return globalThis.nativeCompositionFixture.admission(binding);};export const disposeNativeBackendReleaseAdmission=handle=>handles.delete(handle);",
  'backend-release-contracts.ts': "export * from './backend-release-contracts.ts?actual-fingerprint-validator';export const validatePreparedBackendReleaseIntent=globalThis.nativeCompositionFixture.prepared;",
  'hosted-migration-provider.ts': 'export const readHostedMigrationProvider=globalThis.nativeCompositionFixture.provider;',
  'hosted-migration-stage-files.ts': 'export const admitHostedMigrationStageFiles=globalThis.nativeCompositionFixture.files;export const admitInstalledMigrationStageMetadata=globalThis.nativeCompositionFixture.metadata;export const admitHostedMigrationBatchFiles=()=>{throw Error("No batch in ordinary adapter fixture");};',
  'hosted-migration-database.ts': 'export const createHostedMigrationDatabase=globalThis.nativeCompositionFixture.database;export const assertNativeReconciliationPermit=()=>{throw Error("Unregistered controlled permit");};export const readNativeMigrationPermitAuthority=()=>{throw Error("Unregistered controlled permit authority");};export const readNativeSchemaStageAdmission=()=>{throw Error("Ordinary fixture must not consume a native cohort");};export const readNativeOriginalIntentExecutionBinding=()=>{throw Error("No original intent in ordinary fixture");};',
  'hosted-migration-native-process.ts': 'export class HostedMigrationNativePreparationError extends Error{constructor(evidence){super("Private original failure");this.evidence=evidence;}};export const createHostedMigrationNativeProcess=globalThis.nativeCompositionFixture.process;',
  'hosted-migration-journal.ts': 'export const createHostedMigrationJournal=globalThis.nativeCompositionFixture.journal;',
  'hosted-migration-durable-journal.ts': 'export const createHostedMigrationDurableJournal=globalThis.nativeCompositionFixture.durable;',
  'hosted-operator-storage-inventory.ts': 'export const readHostedOperatorStorageInventory=globalThis.nativeCompositionFixture.inventory;',
};
registerHooks({ resolve(specifier, context, next) { if (specifier.endsWith('/hosted-migration-provider')) return { shortCircuit: true, url: pathToFileURL(resolve(import.meta.dirname,'hosted-migration-provider.ts')).href+'?controlled-ordinary-executor-provider' }; return next(specifier, context); }, load(url, context, next) { if (/\/node_modules\/pg\/(?:lib\/index\.js|esm\/index\.mjs)$/.test(url.replaceAll('\\', '/'))) return { format: 'module', shortCircuit: true, source: 'export const Client=globalThis.nativeObserverTransportClient;export default{Client};' }; const name = url.split('/').at(-1)!; if(url.includes('?controlled-ordinary-executor-provider'))return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace('async function readHostedMigrationProvider(value) {','async function readHostedMigrationProvider(value) { return globalThis.nativeCompositionFixture.provider(value);')};if (replacements[name]) return { format: 'module', shortCircuit: true, source: replacements[name] }; if (name === 'hosted-migration-executor.ts') return { format: 'module', shortCircuit: true, source: transformSync(process.env.CUEVO_HISTORICAL_ORDER_CONTROL==='before-change'?execFileSync('git',['show','HEAD:scripts/database/hosted-migration-executor.ts'],{cwd:resolve(import.meta.dirname,'../..'),encoding:'utf8',windowsHide:true}):readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const clone = <T,>(value: T): T => structuredClone(value);
const fail = (name: string) => { if (state.failures.includes(name)) throw Error(secret); };
const versions = () => (state.stage![state.after ? 'expectedAfterVersions' : 'expectedBeforeVersions'] as string[]);
function rawHistory() { return versions().map(version => { const source = state.sources.find(row => row.name.startsWith(version))!; const text = new TextDecoder().decode(source.bytes).trim(); return { version, name: source.name.slice(15, -4), statements: text ? [text] : [] }; }); }
function storageCount() { return state.aggregate ? [...state.journals.values()].reduce((count, journal) => count + (journal ? journal.state === 'INTENT' ? 2 : 3 : 0), 0) : state.journal ? state.journal.state === 'INTENT' ? 2 : 3 : 0; }
function target() { return { observedAtMs: state.failures.includes('older-target') ? Date.now() - 25000 : Date.now(), operator: 'postgres', database: 'postgres', serverVersion: 170011, tls: { kind: 'PEER_VERIFIED', host: (state.input!.endpoint as {host:string}).host, certificateSha256: 'a'.repeat(64), peerCertificateSha256: 'b'.repeat(64), protocol: 'TLSv1.3' }, historyPresent: versions().length > 0, history: rawHistory(), authUsers: state.failures.includes('population') ? 1 : state.installed?133:0, storageObjects: storageCount() + (state.failures.includes('inventory-foreign-intent') ? 2 : 0), appSchemas: versions().length ? ['app', 'authorization', 'internal'] : [], runtimeRoles: versions().length ? ['cuevo_api', 'cuevo_worker'] : [], schools: state.installed?2:versions().length ? 0 : null }; }
function checks() { const current = versions(), has = (prefix: string) => current.includes(prefix); return { foundation: current.length ? true : null, rls: current.length ? true : null, privateRelations: current.length ? true : null, privateFunctions: current.length ? true : null, runtimeRoles: current.length ? true : null, nativeSourceBridge: has('20261002021737') ? true : null, curriculumLifecycle: has('20261002021206') ? true : null, dispatchInactive: has('20261002122236') ? true : null, analyticsInactive: has('20261002182213') ? true : null, recoveryCronInactive: true, transportPrivate: has('20261005132902') ? true : null }; }
Object.assign(globalThis, { nativeCompositionFixture: {
  metadata:async(input:{stage:Record<string,unknown>})=>{state.events.push('metadata');return (globalThis as unknown as {nativeCompositionFixture:{files:(input:unknown)=>Promise<unknown>}}).nativeCompositionFixture.files(input);},
  prepared: (value: unknown) => clone(value),
  admission: async () => { state.events.push('official'); if (state.failures.includes('slow-official')) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(31000); fail('official'); if (state.seenIntent) fail('official-after-intent'); if (state.stage?.id === 'native') fail('native-approval-drift'); return { expected: clone(state.input!.expected), approval: { purpose: 'BACKEND_SYNTHETIC_STAGING', state: 'approved', packageSha256: (state.input!.preparedApproval as { sha256: string }).sha256 }, observedAt: new Date(Date.now()).toISOString(), provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' }; },
  provider: async () => { state.events.push('provider'); fail('provider'); return { evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA', observedAtMs: Date.now(), projectRef: ref, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', directEndpoint: { projectRef: ref, kind: 'direct', host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres' },sessionEndpoint:{projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'} }; },
  files: async (input: { stage: Record<string, unknown> }) => { state.events.push('files'); fail('files'); if (state.aggregate && state.stage?.id !== input.stage.id) { state.stage = clone(input.stage); state.after = false; } if (state.driftFiles) throw Error(secret); const rows = input.stage.included as { name: string; version: string; sha256: string }[]; return { evidence: 'VERIFIED_GIT_AND_PHYSICAL_STAGE', sources: state.sources, stageSha256: hash(JSON.stringify({ included: rows.map(row => ({ name: row.name, version: row.version, sha256: row.sha256 })), configSha256: input.stage.configSha256 })), planSha256: canonicalHostedMigrationPlan(state.input!.plan as Parameters<typeof canonicalHostedMigrationPlan>[0]).sha256 }; },
  database: async (input: Parameters<typeof import('./hosted-migration-database').createHostedMigrationDatabase>[0]) => {
    fail('database-factory');
    const persistInstalledSchema=async(value:{migrationCount:number;migrations:{version:string;sha256:string}[];sourceSha:string;treeSha:string;stageId:string;stageSha256:string})=>{state.events.push('installed-schema:'+value.stageId);fail('installed-schema');const current=state.stage!;assert.equal(state.after,true);assert.equal(state.journal?.state,'COMMITTED');assert.equal(value.sourceSha,(state.input!.plan as HostedMigrationPlanV1).source.sha);assert.equal(value.stageId,current.id);assert.equal(value.migrationCount,(current.included as unknown[]).length);assert.deepEqual(value.migrations,(current.included as {version:string;sha256:string}[]).map(({version,sha256})=>({version,sha256})));};
    const persistInstalledMigrations=async(value:{migrationCount:number;migrations:{version:string;sha256:string}[];sourceSha:string;treeSha:string})=>{state.events.push('installed-migrations');fail('installed-migrations');const plan=state.input!.plan as HostedMigrationPlanV1;if(!state.installed){assert.equal(state.after,true);assert.equal(state.journals.size,4);assert.ok([...state.journals.values()].every(row=>row?.state==='COMMITTED'));}else{assert.equal(plan.pending.length,0);assert.equal(state.commands,0);assert.equal(state.journals.size,0);}assert.equal(value.sourceSha,plan.source.sha);assert.equal(value.treeSha,plan.source.tree);assert.equal(value.migrationCount,plan.migrations.length);assert.deepEqual(value.migrations,plan.migrations.map(({version,sha256})=>({version,sha256})));assert.deepEqual(versions(),plan.migrations.map(row=>row.version).sort());};
    if (state.nativeProducer) {
      // A distinct module URL bypasses only this file's database-factory mock;
      // the production observer source is loaded without rewriting its body.
      const nativeUrl = pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-database.ts')); nativeUrl.search = '?native-observer-contract';
      const owner = await import(nativeUrl.href) as typeof import('./hosted-migration-database');
      const database = await owner.createHostedMigrationDatabase(input); state.nativeSignal = database.signal;
      return { ...database,requireInstalledSchemaStorage:async()=>{state.events.push("schema-storage");fail("schema-storage");},persistInstalledSchema, withLock: async (key: string, run: Parameters<typeof database.withLock>[1]) => { state.events.push('lock'); const receipt = await database.withLock(key, run); state.events.push('unlock'); return receipt; }, observeTarget: async () => { state.events.push('target'); const result = await database.observeTarget(); state.nativeTargetKeys!.push(Object.keys(result).sort()); return result; }, observeStage: async (value: Parameters<typeof database.observeStage>[0]) => { state.events.push('postconditions'); state.phaseVersions.push(clone(value.expectedAfterVersions)); return database.observeStage(value); } };
    }
    return { signal: state.controller.signal,requireInstalledSchemaStorage:async()=>{state.events.push("schema-storage");fail("schema-storage");},persistInstalledSchema,persistInstalledMigrations, readInstalledPopulation:async()=>{state.events.push('installed-receipt');fail('installed-receipt');const receipt=clone(state.installed!);if(state.failures.includes('installed-source'))receipt.sourceSha='0'.repeat(40);return readInstalledPopulationReceipt([{fingerprint:installedPopulationFingerprint(receipt),state:'COMPLETED',response:receipt}],ref);},observeSyntheticPopulation:async()=>{state.events.push('population-read');return referencePopulation();}, withLock: async (key: string, run: (lease: unknown) => Promise<void>) => { state.events.push('lock'); fail('lock'); try { await run({ kind: 'HELD', key, id: 'native-current-lease' }); state.events.push('unlock'); fail('unlock'); return { kind: 'RELEASED' }; } finally { state.controller.abort(); } }, observeTarget: async () => { state.events.push('target'); fail('target'); if (state.lost) { state.controller.abort(); throw Error(secret); } const result = target(); return state.after && state.failures.includes('after-history') ? { ...result, history: [] } : result; }, observeStage: async (value: { stageId: string; expectedAfterVersions: string[] }) => { state.events.push('postconditions'); state.phaseVersions.push(clone(value.expectedAfterVersions)); assert.deepEqual(value.expectedAfterVersions, versions()); const result = checks(); return { observedAtMs: Date.now(), stageId: value.stageId, checks: { ...result, ...(state.failures.includes('postconditions') || state.after && state.failures.includes('after-postconditions') ? { rls: false } : {}) } }; } };
  },
  process: async (_value: {delivery:{included:{name:string;sha256:string}[];configSha256:string};certificate:{sha256:string};cli:unknown}, options: { signal: AbortSignal; privateEnvironment: Record<string,string> }) => { state.events.push('process-prepare'); if(state.failures.includes('prepared-failure')){const module=await import('./hosted-migration-native-process');throw new module.HostedMigrationNativePreparationError({version:1,purpose:'CUEVO_NATIVE_MIGRATION_PREPARATION_FAILURE',phase:'CREATE',ownerId:'ffffffff-ffff-4fff-afff-ffffffffffff',cleanup:'UNCONFIRMED'});} fail('process-prepare'); if(state.failures.includes('slow-process-prepare'))(globalThis as unknown as {nativeCompositionAdvanceClock?:(ms:number)=>void}).nativeCompositionAdvanceClock?.(40000); return {prepared:{imageId:'sha256:'+'1'.repeat(64),deliverySha256:hash(JSON.stringify({included:_value.delivery.included,configSha256:_value.delivery.configSha256,certificateSha256:_value.certificate.sha256,cli:_value.cli}))}, dispose:async()=>{state.events.push('process-dispose');fail('process-dispose');},runCli: async (args: string[], env: Record<string, string>, launch: {notAfterMs:number}) => { state.events.push('cli'); state.commands++; assert.equal(options.signal, state.nativeProducer ? state.nativeSignal : state.controller.signal); assert.ok(Number.isSafeInteger(launch.notAfterMs) && launch.notAfterMs > Date.now() && launch.notAfterMs <= Date.now() + 30000); assert.equal(env.PGPASSWORD, secret); assert.equal(args.some(arg => arg.includes(secret)), false); assert.ok(args.includes('--skip-vault')); fail('cli'); if (state.failures.includes('native-timeout') && state.stage!.id === 'native') return { kind: 'TIMEOUT' }; state.after = true; return state.failures.includes('timeout') ? { kind: 'TIMEOUT' } : { kind: 'EXITED', exitCode: 0 }; } }; },
  journal: async ({ journalRoot }: { journalRoot: string }) => ({ readJournal: async () => { state.events.push('journal-read'); fail('journal-read'); return clone(state.journals.get(journalRoot) ?? state.journal); }, writeJournal: async (value: HostedExecutionJournal) => { state.events.push('journal:' + value.state); if (value.state === 'INTENT') state.seenIntent = true; state.journal = clone(value); state.journals.set(journalRoot, clone(value)); return state.failures.includes('journal-sync') ? { kind: 'UNCONFIRMED' } : { kind: 'SYNCED', sha256: hash(JSON.stringify(value)) }; } }),
  durable: async (input: { journalRoot: string; storageKey: string; providerToken: string; identity: HostedExecutionJournal['identity'] }) => { state.events.push('durable'); assert.equal(input.storageKey, 'journal-only-credential-canary'); assert.equal(input.providerToken, secret); if (state.aggregate) { state.journal = state.journals.get(input.journalRoot) ?? null; await mkdir(input.journalRoot, { recursive: true }); await writeFile(join(input.journalRoot, 'owner.json'), JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', identity: input.identity })); } const journal = (globalThis as unknown as { nativeCompositionFixture: { journal: (input: { journalRoot: string }) => Promise<unknown> } }).nativeCompositionFixture.journal; return journal(input); },
  inventory: async (input: { identity: HostedExecutionJournal['identity']; expectedVersions: string[]; storageKey: string }) => { state.events.push('inventory'); fail('inventory'); assert.equal(input.storageKey, 'journal-only-credential-canary'); assert.deepEqual(input.expectedVersions, versions()); if (state.phaseVersions.length === 2) { if (state.failures.includes('inventory-file-drift')) state.driftFiles = true; if (state.failures.includes('inventory-policy-drift')) await writeFile(state.input!.operatorStoragePolicyPath as string, '{}'); if (state.failures.includes('inventory-toolchain-drift')) await writeFile(state.input!.toolchainManifestPath as string, '{}'); } if (state.failures.includes('late-file-drift') && state.phaseVersions.length === 1) state.driftFiles = true; if (state.failures.includes('lost-during-inventory')) state.controller.abort(); const foreign = state.failures.includes('inventory-foreign-intent') ? 2 : 0, now = Date.now(); if (state.failures.includes('late-inventory-clock') && state.phaseVersions.length === 1) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(31000); if (state.failures.includes('older-target')) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(10000); return { evidence: 'VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY', projectRef: ref, sourceSha: input.identity.sourceSha, treeSha: input.identity.treeSha, approvalDigest: input.identity.approvalDigest, ciRunId: input.identity.ciRunId, planSha256: input.identity.planSha256, stageId: input.identity.stageId, stageSha256: input.identity.stageSha256, expectedVersionsSha256: hash(JSON.stringify([...input.expectedVersions].sort())), observedAtMs: state.failures.includes('old-inventory') ? now - 31000 : now, startedAtMs: now, bytesVerificationStartedAtMs: now, bytesVerifiedAtMs: now, countsVerifiedAtMs: now, completedAtMs: now, totalStorageObjects: storageCount() + foreign + (state.failures.includes('count-mismatch') ? 1 : 0), verifiedOperatorObjects: storageCount() + foreign, applicationStorageObjects: state.failures.includes('application-storage') ? 1 : 0, bucketMetadataSha256: '1'.repeat(64), objectSetSha256: '2'.repeat(64), remoteProjectSha256: '3'.repeat(64), operations: state.aggregate ? [...state.journals.values()].filter((journal): journal is HostedExecutionJournal => journal !== null).map(journal => ({ operation: hash(JSON.stringify(journal.identity)), state: journal.state, identity:journal.identity, identitySha256: hash(JSON.stringify(journal.identity)), chainSha256: '4'.repeat(64), objectCount: journal.state === 'INTENT' ? 2 : 3 })) : [...(state.journal ? [{ operation: hash(JSON.stringify(state.journal.identity)), state: state.journal.state, identity:state.journal.identity, identitySha256: hash(JSON.stringify(state.journal.identity)), chainSha256: '4'.repeat(64), objectCount: state.failures.includes('inventory-sum') ? 1 : storageCount() }] : []), ...(foreign ? [{ operation: '5'.repeat(64), state: 'INTENT', identitySha256: '5'.repeat(64), chainSha256: '6'.repeat(64), objectCount: 2 }] : [])] }; },
} });

async function api() { let module: Record<string, unknown> = {}; try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-executor.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; } assert.equal(typeof module.executeNativeHostedMigrationStage, 'function', 'native stage composition export must exist'); return module as typeof import('./hosted-migration-executor'); }
function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); }
async function fixture(run: (input: Record<string, unknown>, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-native-composition-'));
  try {
    Object.assign(state, { events: [], journal: null, journals: new Map(), after: false, lost: false, failures: [], controller: new AbortController(), commands: 0, phaseVersions: [], seenIntent: false, driftFiles: false, aggregate: false, nativeProducer: false, nativePeerAuthorized: true, nativeSignal: undefined, nativeTargetKeys: [],installed:undefined });
    const repository = resolve(import.meta.dirname, '../..'), sha = git(repository, 'rev-parse', 'HEAD'), tree = git(repository, 'rev-parse', 'HEAD^{tree}'); canonicalSources ??= readCanonicalMigrationSources({ repoRoot: repository, sourceSha: sha, treeSha: tree }).sources; state.sources = canonicalSources;
    await mkdir(join(root, '.local/hosted-release'), { recursive: true }); await writeFile(join(root, '.gitignore'), '.local/\n');
    const lock = { lockfileVersion: 3, packages: { '': { devDependencies: { supabase: '2.119.0' } }, 'node_modules/supabase': { version: '2.119.0', integrity: 'sha512-canonical', resolved: 'https://registry.npmjs.org/supabase/-/supabase-2.119.0.tgz' }, [`node_modules/@supabase/cli-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`]: { version: '2.119.0', integrity: 'sha512-platform', resolved: 'https://registry.npmjs.org/@supabase/cli-platform.tgz' } } }; const lockBytes = JSON.stringify(lock) + '\n'; await writeFile(join(root, 'package-lock.json'), lockBytes); git(root, 'init', '--quiet'); git(root, 'add', '.'); git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Source');
    const sourceSha = git(root, 'rev-parse', 'HEAD'), treeSha = git(root, 'rev-parse', 'HEAD^{tree}'), now = Date.now(); const plan = planHostedMigrations({ sources: state.sources, source: { sha: sourceSha, tree: treeSha }, now, target: { projectRef: ref, boundProjectRef: ref, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging', observedAt: new Date(now).toISOString(), authUsers: 0, storageObjects: 0, appSchemas: [], migrationVersions: [], dispatchDisabled: true, population: 'EMPTY' } });
    const included = plan.migrations.slice(0, plan.stages[0].names.length).map(({ name, version, sha256 }) => ({ name, version, sha256 })); const stage = { id: 'prefix', workdir: join(root, '.local/hosted-release/migration-fixture/prefix'), included, pending: included, expectedBeforeVersions: [], expectedAfterVersions: included.map(row => row.version).sort(), configSha256: 'c'.repeat(64), commandArgs: [] }; state.stage = stage;
    const manifest = { version: 1, purpose: 'CUEVO_HOSTED_MIGRATION_TOOLCHAIN', sourceSha, treeSha, sourceLockSha256: hash(lockBytes), cliVersion: '2.119.0', platform: `${process.platform}-${process.arch}`, cli: { shimSha256: 'd'.repeat(64), binarySha256: 'e'.repeat(64), sidecarSha256: 'f'.repeat(64) } }; const manifestPath = join(root, '.local/hosted-release/toolchain-fixture.json'), manifestBytes = JSON.stringify(manifest) + '\n'; await writeFile(manifestPath, manifestBytes, { mode: 0o600 });
    const policy = prepareHostedOperatorStoragePolicy({ sourceSha, treeSha, projectRef: ref }), operatorStoragePolicyPath = join(root, '.local/hosted-release/operator-policy.json'); await writeFile(operatorStoragePolicyPath, policy.canonicalJson, { mode: 0o600 });
    const expected = { releaseSha: sourceSha, treeSha, currentMainSha: sourceSha, ciRunId: '31', targets: { supabase: { projectRef: ref } }, fingerprints: { migrationPlanSha256: canonicalHostedMigrationPlan(plan).sha256, migrationHistorySha256: plan.observedHistorySha256, migrationToolchainSha256: hash(manifestBytes), operatorStoragePolicySha256: policy.sha256 }, now }; const body = { ...expected, purpose: 'BACKEND_SYNTHETIC_STAGING', expiresAt: new Date(now + 3600000).toISOString() }; const canonicalJson = JSON.stringify(body); const preparedApproval = { status: 'PREPARED_ONLY', canonicalJson, sha256: hash(canonicalJson), base64: Buffer.from(canonicalJson).toString('base64'), comment: 'controlled official exact package' };
    const endpoint={projectRef:ref,kind:'direct',host:`db.${ref}.supabase.co`,port:5432,database:'postgres'};(expected.fingerprints as Record<string,string>).migrationEndpointSha256=hash(canonicalReleaseExecutionJson(endpoint));const input = { repoRoot: root, endpoint, plan, stage, preparedApproval, expected, certificate: { path: join(root, '.local/hosted-release/ca.pem'), sha256: 'a'.repeat(64) }, toolchainManifestPath: manifestPath, operatorStoragePolicyPath, journalStorageKey: 'journal-only-credential-canary', githubToken: secret, providerToken: secret, migrationPassword: secret, toolchain: {} }; state.input = input; await run(input, root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('native factory wires exact fresh authority, durable intent, one CLI and current after-state without upgrading protocol evidence', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'COMMITTED', JSON.stringify({ result, events: state.events })); assert.equal(result.protocol?.evidence, 'SUPPLIED_PORT_EXECUTION_ONLY'); assert.equal(result.schemaHistoryAtomic, false); assert.equal(result.hostedAcceptance, false); assert.equal(state.commands, 1); assert.deepEqual(state.phaseVersions, [state.stage!.expectedBeforeVersions, state.stage!.expectedBeforeVersions, state.stage!.expectedBeforeVersions, state.stage!.expectedAfterVersions]); assert.ok(state.events.indexOf('journal:INTENT') < state.events.indexOf('cli')); assert.ok(state.events.lastIndexOf('postconditions') < state.events.indexOf('journal:COMMITTED')); assert.equal(JSON.stringify(result).includes(secret), false); }); });
test('missing durable partial-stage storage refuses before original intent or migration CLI',async()=>{const subject=await api();await fixture(async input=>{state.failures=['schema-storage'];const result=await subject.executeNativeHostedMigrationStage(input);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.events.includes('cli'),false);assert.equal(state.events.includes('journal:INTENT'),false);});});
test('active installed read-only plan cannot enter schema executor provider or credential consumers',async()=>{const subject=await api();await fixture(async input=>{const plan=input.plan as HostedMigrationPlanV1;const applied=plan.migrations;plan.mode='INCREMENTAL';plan.applied=applied.map(({version,sha256})=>({version,sha256}));plan.pending=[];plan.stages=plan.stages.map(stage=>({...stage,names:[]}));plan.observedHistorySha256=hash(JSON.stringify(applied.map(row=>row.version).sort()));plan.priorCompletedRelease={sourceSha:plan.source.sha,treeSha:plan.source.tree,migrationCount:applied.length};plan.runtimeOnly=true;(input.expected as {fingerprints:Record<string,string>}).fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(plan).sha256;const result=await subject.executeNativeHostedMigrationStage(input);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.events.length,0);});});
test('real native observer reaches the strict executor before original intent and preserves denied TLS', async () => {
  const { executeNativeHostedMigrationStage } = await api();
  for (const trustedPeer of [true, false]) await fixture(async input => {
    state.nativeProducer = true; state.nativePeerAuthorized = trustedPeer;
    const certificate = input.certificate as { path: string; sha256: string };
    const ca = '-----BEGIN CERTIFICATE-----\ncontrolled native observer certificate\n-----END CERTIFICATE-----\n';
    await writeFile(certificate.path, ca, { mode: 0o600 }); certificate.sha256 = hash(ca);
    const result = await executeNativeHostedMigrationStage(input);
    if (!trustedPeer) {
      assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0);
      assert.equal(state.events.includes('journal:INTENT'), false); assert.equal(state.nativeTargetKeys!.length, 0);
      assert.equal(result.compositionFailure?.phase,'LEASE');
      assert.equal(result.compositionFailure?.leaseCallbackEntered,false);
      assert.equal(result.compositionFailure?.native?.failurePhase,'TLS');
      assert.equal(result.compositionFailure?.native?.session,'CLOSED_CONFIRMED');
      assert.equal(result.compositionFailure?.native?.lease,'NOT_ATTEMPTED');
      assert.equal(result.compositionFailure?.native?.partialReceipt,'NOT_ATTEMPTED');
      return;
    }
    assert.equal(result.status, 'COMMITTED', JSON.stringify({ result, events: state.events, nativeTargetKeys: state.nativeTargetKeys }));
    assert.equal(state.commands, 1); assert.equal(result.protocol?.commitment, 'CONFIRMED');
    assert.equal(result.hostedAcceptance, false); assert.equal(result.schemaHistoryAtomic, false);
    assert.equal(state.nativeTargetKeys!.length, 4);
    for (const keys of state.nativeTargetKeys!) assert.deepEqual(keys, ['appSchemas', 'authUsers', 'database', 'history', 'historyPresent', 'observedAtMs', 'operator', 'runtimeRoles', 'schools', 'serverVersion', 'storageObjects', 'tls']);
    assert.ok(state.events.indexOf('target') < state.events.indexOf('journal:INTENT'));
    assert.ok(state.events.indexOf('journal:INTENT') < state.events.indexOf('cli'));
    assert.ok(state.events.lastIndexOf('postconditions') < state.events.indexOf('journal:COMMITTED'));
    assert.equal(state.events.filter(event => event === 'lock').length, 1);
    assert.equal(state.events.filter(event => event === 'unlock').length, 1);
  });
});

test('single-stage composition refusals retain exact bounded phases and no supplied error contents',async()=>{
 const subject=await api();
 for(const[mode,phase]of [['official','OFFICIAL_AUTHORITY'],['provider','PROVIDER'],['files','STAGE_FILES'],['database-factory','DATABASE_FACTORY'],['lock','LEASE']]as const)await fixture(async input=>{
  state.failures=[mode];const result=await subject.executeNativeHostedMigrationStage(input),diagnostic=result.compositionFailure;
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.protocol,null);assert.equal(result.compositionCode,'PREFLIGHT_UNCONFIRMED');
  assert.equal(diagnostic?.phase,phase);assert.equal(diagnostic?.leaseCallbackEntered,false);assert.equal(diagnostic?.native,null);
  assert.equal(diagnostic?.version,1);assert.equal(diagnostic?.purpose,'CUEVO_MIGRATION_COMPOSITION_FAILURE');
  assert.ok(Number.isInteger(diagnostic?.durationMs));assert.ok(diagnostic!.durationMs>=0&&diagnostic!.durationMs<=86400000);
  assert.deepEqual(Object.keys(diagnostic!).sort(),['durationMs','leaseCallbackEntered','native','phase','purpose','version']);
  assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(state.commands,0);assert.equal(state.seenIntent,false);
 });
 await fixture(async input=>{
  let reads=0;const invalid={...input,get migrationPassword(){reads++;return secret;}};
  const getterResult=await subject.executeNativeHostedMigrationStage(invalid);assert.equal(reads,0);assert.equal(getterResult.compositionFailure?.phase,'INPUT');
  const proxyResult=await subject.executeNativeHostedMigrationStage(new Proxy(input,{get(){throw Error(secret);}}));assert.equal(proxyResult.compositionFailure?.phase,'INPUT');assert.equal(state.events.length,0);
 });
});

test('single-stage cleanup failure keeps composition diagnostic beside consumed-stage uncertainty',async()=>{
 const subject=await api();await fixture(async input=>{
  state.failures=['timeout','unlock'];const result=await subject.executeNativeHostedMigrationStage(input);
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.protocol?.commitment,'UNKNOWN');assert.equal(result.protocol?.cleanupCode,'LOCK_RELEASE_UNCONFIRMED');
  assert.equal(result.compositionFailure?.phase,'STAGE_CORE');assert.equal(result.compositionFailure?.leaseCallbackEntered,true);assert.equal(result.compositionFailure?.native,null);
  assert.equal(state.commands,1);assert.equal(JSON.stringify(result.compositionFailure).includes(secret),false);
 });
});
test('accessor, supplied readiness and unapproved toolchain fingerprints cannot reach native consumers', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { let reads = 0; const getter = { ...input, get migrationPassword() { reads++; return secret; } }; assert.equal((await executeNativeHostedMigrationStage(getter)).status, 'REQUIRES_REVIEW'); assert.equal(reads, 0); assert.equal(state.commands, 0); const extra = { ...input, satisfied: true }; assert.equal((await executeNativeHostedMigrationStage(extra)).status, 'REQUIRES_REVIEW'); await writeFile(input.toolchainManifestPath as string, '{}'); assert.equal((await executeNativeHostedMigrationStage(input)).status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); }); });
test('unavailable provider, nonempty initial target and actual false postconditions refuse before intent or CLI', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['provider', 'population', 'postconditions']) await fixture(async input => { state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.events.includes('journal:INTENT'), false); }); });
test('timeout and lock cleanup failure retain unknown commitment and separate protocol errors without retry', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { state.failures = ['timeout', 'unlock']; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.protocol?.commitment, 'UNKNOWN'); assert.equal(result.protocol?.primaryCode, 'CLI_UNCONFIRMED'); assert.equal(result.protocol?.cleanupCode, 'LOCK_RELEASE_UNCONFIRMED'); assert.equal(state.commands, 1); assert.equal(JSON.stringify(result).includes(secret), false); }); });
test('same-project unresolved prior journal blocks a changed source or approval rather than allocating another intent', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async (input, root) => { const directory = join(root, '.local/hosted-release/journal-prior-attempt'); await mkdir(directory); const identity = { projectRef: ref, sourceSha: '1'.repeat(40), treeSha: '2'.repeat(40), planSha256: '3'.repeat(64), stageId: 'prefix', stageSha256: '4'.repeat(64), databaseUrl: `postgresql://postgres@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`, approvalDigest: '5'.repeat(64), ciRunId: '30', certificateSha256: '6'.repeat(64) }; await writeFile(join(directory, 'owner.json'), JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', identity })); state.journals.set(directory, { version: 1, identity, state: 'INTENT', schemaHistoryAtomic: false, evidence: 'SUPPLIED_PORT_EXECUTION_ONLY' } as HostedExecutionJournal); const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.events.includes('journal:INTENT'), false); }); });
test('empty pending stage cannot invoke a fresh CLI without a confirmed original journal', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { state.stage!.pending = []; state.stage!.expectedBeforeVersions = state.stage!.expectedAfterVersions; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.events.includes('cli'), false); }); });
test('confirmed original journal reconciles exact after-state as NOOP without a second CLI', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { assert.equal((await executeNativeHostedMigrationStage(input)).status, 'COMMITTED'); state.controller = new AbortController(); state.phaseVersions = []; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'NOOP'); assert.equal(state.commands, 1); assert.deepEqual(state.phaseVersions, [state.stage!.expectedAfterVersions]); state.controller = new AbortController(); state.failures = ['after-history']; assert.equal((await executeNativeHostedMigrationStage(input)).status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 1); }); });
test('authority changed after intent and a late physical artifact drift cannot reach CLI', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['official-after-intent', 'late-file-drift']) await fixture(async input => { state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); }); });
test('actual history or postconditions lost after CLI cannot publish a COMMITTED journal', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['after-history', 'after-postconditions']) await fixture(async input => { state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.protocol?.commitment, 'UNKNOWN'); assert.equal(state.commands, 1); assert.equal(state.journal?.state, 'REQUIRES_REVIEW'); assert.equal(state.events.includes('journal:COMMITTED'), false); }); });
test('lost native lease and unconfirmed durable journal both stop before CLI', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['lost', 'journal-sync']) await fixture(async input => { if (failure === 'lost') state.lost = true; else state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); }); });
test('unknown journal ownership and unapproved source lock refuse without journal replacement', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['owner', 'source-lock']) await fixture(async (input, root) => { if (failure === 'owner') { const directory = join(root, '.local/hosted-release/journal-corrupt'); await mkdir(directory); await writeFile(join(directory, 'owner.json'), JSON.stringify({ version: 1, purpose: 'OTHER_PURPOSE', identity: {} })); } else { const manifestPath = input.toolchainManifestPath as string, manifest = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(manifestPath, 'utf8'))) as Record<string, unknown>; manifest.sourceLockSha256 = '0'.repeat(64); const bytes = JSON.stringify(manifest) + '\n'; await writeFile(manifestPath, bytes); (input.expected as { fingerprints: { migrationToolchainSha256: string } }).fingerprints.migrationToolchainSha256 = hash(bytes); } const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.events.includes('journal:INTENT'), false); }); });
test('final whole-stage postconditions require current transport privacy rather than historical guard availability', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { const plan = input.plan as HostedMigrationPlanV1; const included = plan.migrations.map(({ name, version, sha256 }) => ({ name, version, sha256 })); state.stage!.id = 'remaining'; state.stage!.included = included; state.stage!.pending = included; state.stage!.expectedAfterVersions = included.map(row => row.version).sort(); input.stage = state.stage; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'COMMITTED', JSON.stringify(result)); assert.equal(state.commands, 1); assert.deepEqual(state.phaseVersions.at(-1), state.stage!.expectedAfterVersions); }); });
test('operator inventory and exact policy cannot be omitted, stale or treated as an arbitrary Storage exclusion', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['inventory', 'old-inventory', 'count-mismatch', 'application-storage', 'inventory-sum', 'policy']) await fixture(async input => { if (failure === 'policy') await writeFile(input.operatorStoragePolicyPath as string, '{}'); else state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); }); });
test('physical stage, policy or toolchain mutation during final inventory await cannot reach CLI', async () => { const { executeNativeHostedMigrationStage } = await api(); for (const failure of ['inventory-file-drift', 'inventory-policy-drift', 'inventory-toolchain-drift']) await fixture(async input => { state.failures = [failure]; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); }); });
test('earlier inventory and database observations cannot be refreshed after late pre-CLI source verification', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { const originalNow = Date.now; let now = originalNow(); Date.now = () => now; Object.assign(globalThis, { nativeCompositionAdvanceClock: (milliseconds: number) => { now += milliseconds; } }); try { state.failures = ['late-inventory-clock']; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); } finally { Date.now = originalNow; delete (globalThis as unknown as { nativeCompositionAdvanceClock?: () => void }).nativeCompositionAdvanceClock; } }); });
test('matching committed journal cannot become NOOP when inventory discovers another unresolved operation', async () => { const { executeNativeHostedMigrationStage } = await api(); await fixture(async input => { assert.equal((await executeNativeHostedMigrationStage(input)).status, 'COMMITTED'); state.controller = new AbortController(); state.failures = ['inventory-foreign-intent']; const result = await executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 1); }); });

function aggregateInput(input: Record<string, unknown>) {
 const plan = input.plan as HostedMigrationPlanV1, replay = replayPlan(state.sources), boundary = replay.remaining.indexOf(posthogIntelligenceMigration);
 const groups = [replay.before, [replay.prerequisite], replay.remaining.slice(0, boundary), replay.remaining.slice(boundary)];
 const stages = groups.map((_, index) => {
  const included = plan.migrations.slice(0, groups.slice(0, index + 1).flat().length);
  const before = plan.migrations.slice(0, groups.slice(0, index).flat().length).map(row => row.version).sort();
  return { id: ['prefix', 'native', 'pre-observability', 'remaining'][index], workdir: join(input.repoRoot as string, '.local/hosted-release/migration-fixture', plan.stages[index].id), included, pending: included.filter(row => !before.includes(row.version)), expectedBeforeVersions: before, expectedAfterVersions: included.map(row => row.version).sort(), configSha256: 'c'.repeat(64), commandArgs: [] };
 });
 state.aggregate = true; state.stage = stages[0]; const common = { ...input }; delete common.stage; return { ...common, stages };
}

const referenceManifest=JSON.parse(readFileSync('supabase/seed/identities.json','utf8')) as {actors:{actorId:string;schoolId:string;role:string;displayName:string}[]};
function referencePopulation():HostedSyntheticPopulationObservation{
 const id=(prefix:string,index:number)=>prefix+String(index).padStart(12,'0'),school=id('10000000-0000-4000-8000-',1),denial=id('10000000-0000-4000-8000-',2),actor=(index:number)=>id('20000000-0000-4000-8000-',index);
 const relation=(schoolId:string,fields:Record<string,unknown>)=>({schoolId,...fields,status:'active',effectiveFrom:'2026-09-01T00:00:00.000Z',effectiveTo:null});
 return{observedAtMs:Date.now(),authUsers:[],population:{
  schools:[{id:school,name:'Cuevo Reference Academy – Doha',countryCode:'QA',languages:['en','ar'],status:'active'},{id:denial,name:'Synthetic Isolation School',countryCode:'QA',languages:['en','ar'],status:'active'}],
  people:referenceManifest.actors.map(row=>({schoolId:row.schoolId,actorId:row.actorId,displayName:row.displayName,synthetic:true})),memberships:referenceManifest.actors.map((row,index)=>({id:id('21000000-0000-4000-8000-',index+1),...relation(row.schoolId,{actorId:row.actorId,role:row.role})})),
  academicYears:[1,2].map(index=>({schoolId:index===1?school:denial,id:id('40000000-0000-4000-8000-',index),name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-07-01'})),terms:[1,2].map(index=>({schoolId:index===1?school:denial,id:id('41000000-0000-4000-8000-',index),academicYearId:id('40000000-0000-4000-8000-',index),name:'Autumn term',startsOn:'2026-09-01',endsOn:'2026-12-20'})),yearGroups:[1,2,3,4,5].map(index=>({schoolId:index<5?school:denial,id:id('42000000-0000-4000-8000-',index),name:index<5?'Year '+index:'Isolation Year Group',ordinal:index<5?index:1})),
  classes:[1,2,3,4,5,6,7].map(index=>({schoolId:index<7?school:denial,id:id('30000000-0000-4000-8000-',index),academicYearId:id('40000000-0000-4000-8000-',index<7?1:2),yearGroupId:id('42000000-0000-4000-8000-',index<7?(index-1)%4+1:5),name:['Year 1 · Cedar','Year 2 · Maple','Year 3 · Willow','Year 4 · Oak','Year 1 · Olive','Year 2 · Palm','Isolation Class'][index-1],status:'active'})),subjects:[1,2,3,4,5,6,7,8,9].map(index=>({schoolId:index<9?school:denial,id:id('43000000-0000-4000-8000-',index),name:['Mathematics','English','Arabic','Science','Computing','Art','Physical Education','School Custom Project','Isolation Subject'][index-1]})),
  enrollments:[...Array.from({length:60},(_,index)=>relation(school,{classId:id('30000000-0000-4000-8000-',index%6+1),studentActorId:actor(index+12)})),relation(denial,{classId:id('30000000-0000-4000-8000-',7),studentActorId:actor(133)})],teacherAssignments:Array.from({length:8},(_,index)=>relation(school,{classId:id('30000000-0000-4000-8000-',index%6+1),subjectId:id('43000000-0000-4000-8000-',index+1),teacherActorId:actor(index+4)})),parentRelationships:Array.from({length:60},(_,index)=>relation(school,{parentActorId:actor(index+72),studentActorId:actor(index+12),relationshipType:'guardian'})),
  entitlements:[...['school.context','learning','assessment','curriculum','learner.state','improvement','school.operations','community','portfolio'].flatMap(code=>[school,denial].map(schoolId=>({schoolId,code,enabled:true,effectiveFrom:'2026-09-01T00:00:00.000Z',effectiveTo:null}))),{schoolId:school,code:'restricted.records',enabled:true,effectiveFrom:'2026-09-01T00:00:00.000Z',effectiveTo:null}],learnerStatePolicies:[{schoolId:school,version:1,developmentWindowDays:14,approvedBy:actor(2)},{schoolId:denial,version:1,developmentWindowDays:14,approvedBy:actor(132)}],intelligencePolicies:[{schoolId:school,version:1,fixtureEnabled:true,liveEnabled:false,approvedBy:actor(2)},{schoolId:denial,version:1,fixtureEnabled:true,liveEnabled:false,approvedBy:actor(132)}],
  schoolCustomVersions:[{schoolId:school,id:id('60000000-0000-4000-8000-',1),version:'synthetic-school-1',sourceType:'SCHOOL_AUTHORED',rightsStatus:'PERMITTED',createdBy:actor(2)}],schoolCustomReferences:[{schoolId:school,id:id('61000000-0000-4000-8000-',1),versionId:id('60000000-0000-4000-8000-',1),title:'Synthetic school-authored explanation objective',description:'Demonstration objective created by the synthetic school; not an official curriculum standard.',code:null,status:'APPROVED',createdBy:actor(2),approvedBy:actor(2),approvedAt:'2026-10-01T00:00:00.000Z'}]
 }};
}
async function populatedContinuationInput(input:Record<string,unknown>,root:string,delta:boolean){
 const initial=input.plan as HostedMigrationPlanV1,priorSha=initial.source.sha,priorTree=initial.source.tree;
 await mkdir(join(root,'supabase/seed'),{recursive:true});await writeFile(join(root,'supabase/seed/identities.json'),JSON.stringify(referenceManifest));
 state.installed={version:1,purpose:'CUEVO_INSTALLED_SYNTHETIC_POPULATION',projectRef:ref,sourceSha:priorSha,treeSha:priorTree,seedSha256:hostedSyntheticSeedSha256,manifestSha256:hash(JSON.stringify(referenceManifest))};
 state.sources=[...state.sources,...(delta?[{name:'20261009123000_native_completed_delta.sql',bytes:Buffer.from('begin; select 1; commit;\n')}]:[])];
 const target={projectRef:ref,boundProjectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(Date.now()).toISOString(),authUsers:133,storageObjects:0,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version),dispatchDisabled:true,population:'GUARDED_SYNTHETIC'};
 const priorReceipt={projectRef:ref,sourceSha:priorSha,treeSha:priorTree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length};
 const plan=planHostedMigrations({sources:state.sources,source:initial.source,target,priorReceipt,now:Date.now()});input.plan=plan;
 const expected=input.expected as {fingerprints:Record<string,string>;installedSource?:unknown};expected.installedSource=clone(state.installed);expected.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(plan).sha256;expected.fingerprints.migrationHistorySha256=plan.observedHistorySha256;
 const rows=plan.migrations,stage={id:'remaining',workdir:join(root,'.local/hosted-release/migration-fixture/remaining'),included:rows,pending:plan.pending,expectedBeforeVersions:initial.migrations.map(row=>row.version).sort(),expectedAfterVersions:rows.map(row=>row.version).sort(),configSha256:'c'.repeat(64),commandArgs:[]};input.stage=stage;state.stage=stage;return input;
}

test('populated completed-source no-pending continuation observes original receipt and preserves unresolved prior journals',async()=>{
 const module=await api();for(const failure of [undefined,'installed-source','unknown-prior'])await fixture(async(input,root)=>{
  await populatedContinuationInput(input,root,false);
  if(failure==='installed-source')state.failures=['installed-source'];
  if(failure==='unknown-prior'){const path=join(root,'.local/hosted-release/journal-prior-unknown');await mkdir(path);const identity={projectRef:ref,sourceSha:'1'.repeat(40),treeSha:'2'.repeat(40),planSha256:'3'.repeat(64),stageId:'remaining',stageSha256:'4'.repeat(64),databaseUrl:`postgresql://postgres@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,approvalDigest:'5'.repeat(64),ciRunId:'30',certificateSha256:'6'.repeat(64)};await writeFile(join(path,'owner.json'),JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity}));state.journals.set(path,{version:1,identity,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'} as HostedExecutionJournal);}
  const result=await module.executeNativeHostedMigrationStage(input);assert.equal(result.status,failure?'REQUIRES_REVIEW':'NOOP',JSON.stringify({failure,result,events:state.events}));assert.equal(state.commands,0);assert.equal(result.hostedAcceptance,false);
  if(!failure){assert.ok(result.installedVerification);assert.equal(result.installedVerification.identity.sourceSha,(input.plan as HostedMigrationPlanV1).source.sha);assert.equal(result.installedVerification.installedPopulationSha256,hash(canonicalReleaseExecutionJson(state.installed)));assert.equal(result.installedVerification.remoteProjectSha256,'3'.repeat(64));assert.match(result.installedVerification.historySha256,/^[a-f0-9]{64}$/);assert.equal(result.protocol,null);assert.ok(state.events.includes('inventory'));}
 });
});

test('first activation installed metadata still executes complete native no-op admission without SQL processes or new intent',async()=>{
 const subject=await api();for(const failure of [undefined,'installed-receipt','installed-source','target','postconditions','inventory-foreign-intent','old-inventory','late-file-drift','missing-installed-source','wrong-scope','pending-plan','mixed-stage']as const)await fixture(async(input,root)=>{
  await populatedContinuationInput(input,root,failure==='pending-plan');
  const expected=input.expected as {executionScope?:string;installedSource?:unknown};expected.executionScope=failure==='wrong-scope'?'schema-and-accounts':'complete-backend';
  if(failure==='missing-installed-source')delete expected.installedSource;
  if(failure&&['installed-receipt','installed-source','target','postconditions','inventory-foreign-intent','old-inventory','late-file-drift'].includes(failure))state.failures=[failure];
  const value=aggregateInput(input),rows=(input.plan as HostedMigrationPlanV1).migrations;
  if(expected.installedSource)(expected.installedSource as {migrationCount:number}).migrationCount=rows.length;
  value.stages=value.stages.map(stage=>({...stage,materialization:'METADATA_ONLY',included:rows,pending:[],expectedBeforeVersions:rows.map(row=>row.version).sort(),expectedAfterVersions:rows.map(row=>row.version).sort()}));
  if(failure==='mixed-stage')Object.assign(value.stages[0],{materialization:'SQL_FILES'});
  state.stage=(value.stages as Record<string,unknown>[])[0];
  const result=await subject.executeNativeHostedMigrations(value);
  assert.equal(result.status,failure?'REQUIRES_REVIEW':'NOOP',JSON.stringify({failure,result,events:state.events}));
  assert.equal(state.commands,0);assert.equal(state.seenIntent,false);assert.equal(state.events.includes('process-prepare'),false);
  if(!failure){assert.equal(result.stages.length,4);assert.ok(result.stages.every(stage=>!!stage.installedVerification&&stage.protocol===null));assert.ok(state.events.includes('metadata'));assert.ok(state.events.includes('installed-receipt'));assert.ok(state.events.includes('population-read'));assert.ok(state.events.includes('inventory'));assert.ok(state.events.includes('unlock'));}
  else if(['missing-installed-source','wrong-scope','pending-plan','mixed-stage'].includes(failure))assert.equal(state.events.includes('database'),false);
 });
});

test('populated pending delta refuses foreign unresolved remote operator effects before allocating a new CLI',async()=>{
 const module=await api();await fixture(async(input,root)=>{
  await populatedContinuationInput(input,root,true);state.failures=['inventory-foreign-intent'];
  const result=await module.executeNativeHostedMigrationStage(input);assert.equal(result.status,'REQUIRES_REVIEW',JSON.stringify({result,events:state.events}));assert.equal(state.commands,0);assert.equal(state.events.includes('journal:INTENT'),false);
 });
});

test('fresh approval resumes a committed partial schema after expiry without population or a replacement applied-stage journal',async()=>{
 const module=await api();await fixture(async(input,root)=>{
  await mkdir(join(root,'supabase/migrations'),{recursive:true});for(const row of state.sources)await writeFile(join(root,'supabase/migrations',row.name),row.bytes);await writeFile(join(root,'.gitattributes'),'supabase/migrations/* -text\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Original exact schema source');
  const admittedSource={sha:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}')},basePlan=input.plan as HostedMigrationPlanV1;basePlan.source=admittedSource;
  const baseExpected=input.expected as {releaseSha:string;treeSha:string;currentMainSha:string;fingerprints:Record<string,string>};baseExpected.releaseSha=admittedSource.sha;baseExpected.treeSha=admittedSource.tree;baseExpected.currentMainSha=admittedSource.sha;baseExpected.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(basePlan).sha256;
  const toolchain=JSON.parse(readFileSync(input.toolchainManifestPath as string,'utf8'));toolchain.sourceSha=admittedSource.sha;toolchain.treeSha=admittedSource.tree;const toolchainBytes=JSON.stringify(toolchain)+'\n';await writeFile(input.toolchainManifestPath as string,toolchainBytes);baseExpected.fingerprints.migrationToolchainSha256=hash(toolchainBytes);const policy=prepareHostedOperatorStoragePolicy({sourceSha:admittedSource.sha,treeSha:admittedSource.tree,projectRef:ref});await writeFile(input.operatorStoragePolicyPath as string,policy.canonicalJson);baseExpected.fingerprints.operatorStoragePolicySha256=policy.sha256;
  const first=await module.executeNativeHostedMigrationStage(input);assert.equal(first.status,'COMMITTED');const initial=input.plan as HostedMigrationPlanV1,applied=initial.migrations.slice(0,initial.stages[0].names.length),priorJournal=clone(state.journal!);
  assert.ok(state.events.indexOf('journal:COMMITTED')<state.events.indexOf('installed-schema:prefix'));assert.ok(state.events.indexOf('installed-schema:prefix')<state.events.indexOf('unlock'));
  assert.equal(priorJournal.state,'COMMITTED');const oldCommands=state.commands,oldJournals=state.journals.size;
  const expiredJson=JSON.stringify({...baseExpected,purpose:'BACKEND_SYNTHETIC_STAGING',expiresAt:new Date(Date.now()-1).toISOString()});input.preparedApproval={status:'PREPARED_ONLY',canonicalJson:expiredJson,sha256:hash(expiredJson),base64:Buffer.from(expiredJson).toString('base64'),comment:'expired original approval'};state.controller=new AbortController();assert.equal((await module.executeNativeHostedMigrationStage(input)).status,'REQUIRES_REVIEW');assert.equal(state.commands,oldCommands);
  const continued=planHostedMigrations({sources:state.sources,source:initial.source,target:{projectRef:ref,boundProjectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(Date.now()).toISOString(),authUsers:0,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:applied.map(row=>row.version),dispatchDisabled:true,population:'SCHEMA_ONLY'},priorReceipt:{projectRef:ref,sourceSha:initial.source.sha,treeSha:initial.source.tree,migrations:applied.map(({version,sha256})=>({version,sha256}))},now:Date.now()});
  input.plan=continued;const expected=input.expected as {ciRunId:string;fingerprints:Record<string,string>;installedSchema?:unknown};expected.ciRunId='32';expected.installedSchema={sourceSha:initial.source.sha,treeSha:initial.source.tree,migrationCount:applied.length};expected.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(continued).sha256;expected.fingerprints.migrationHistorySha256=continued.observedHistorySha256;
  const body={...expected,purpose:'BACKEND_SYNTHETIC_STAGING',expiresAt:new Date(Date.now()+3600000).toISOString()};const canonicalJson=JSON.stringify(body);input.preparedApproval={status:'PREPARED_ONLY',canonicalJson,sha256:hash(canonicalJson),base64:Buffer.from(canonicalJson).toString('base64'),comment:'fresh approval after prior source expiry'};
  const stage={id:'prefix',workdir:join(root,'.local/hosted-release/migration-fixture/resumed-prefix'),included:applied,pending:[],expectedBeforeVersions:applied.map(row=>row.version).sort(),expectedAfterVersions:applied.map(row=>row.version).sort(),configSha256:'c'.repeat(64),commandArgs:[]};input.stage=stage;state.stage=stage;state.after=false;state.controller=new AbortController();state.seenIntent=false;state.events=[];
  const cp=createRequire(import.meta.url)('node:child_process')as typeof import('node:child_process'),nativeExec=cp.execFileSync,calls:string[][]=[];
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);return nativeExec(file,args,options as Parameters<typeof execFileSync>[2]);})as typeof execFileSync;syncBuiltinESMExports();
  let result:Awaited<ReturnType<typeof module.executeNativeHostedMigrationStage>>;
  try{result=await module.executeNativeHostedMigrationStage(input);assert.equal(calls.filter(args=>args.includes('--batch')).length,1,'initial installed prefix verification supplies its actual original bytes without a second acquisition');}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
  assert.equal(result.status,'NOOP',JSON.stringify({result,events:state.events}));assert.equal(state.commands,oldCommands);assert.equal(state.journals.size,oldJournals);assert.deepEqual(state.journal,priorJournal);assert.equal(result.installedVerification?.installedPopulationSha256,undefined);assert.ok(result.installedVerification);assert.equal(state.events.includes('installed-receipt'),false);
  assert.equal(state.events.some(event=>event.startsWith('installed-schema:')),false);
  for(const uncertainty of ['INTENT','wrong-stage']){
   state.controller=new AbortController();const changed=clone(priorJournal);if(uncertainty==='INTENT')changed.state='INTENT';else changed.identity.stageSha256='0'.repeat(64);state.journal=changed;state.events=[];
   const refused=await module.executeNativeHostedMigrationStage(input);assert.equal(refused.status,'REQUIRES_REVIEW');assert.equal(state.commands,oldCommands);assert.equal(state.events.includes('cli'),false);
  }
 });
});

test('partial pre-observability continuation uses original nonlexical stage180 receipts and never requests another CLI',async()=>{const module=await api();await fixture(async(input,root)=>{
 await mkdir(join(root,'supabase/migrations'),{recursive:true});for(const row of state.sources)await writeFile(join(root,'supabase/migrations',row.name),row.bytes);await writeFile(join(root,'.gitattributes'),'supabase/migrations/* -text\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Actual nonlexical historical schema');
 const initial=input.plan as HostedMigrationPlanV1;initial.source={sha:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}')};const replay=replayPlan(state.sources),stop=replay.remaining.indexOf(posthogIntelligenceMigration),count=replay.before.length+1+stop;assert.equal(count,180);const applied=initial.migrations.slice(0,count),priorReceipt={projectRef:ref,sourceSha:initial.source.sha,treeSha:initial.source.tree,migrations:applied.map(({version,sha256})=>({version,sha256}))};
 const plan=planHostedMigrations({sources:state.sources,source:initial.source,target:{projectRef:ref,boundProjectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date().toISOString(),authUsers:0,storageObjects:9,appSchemas:['app','authorization','internal'],migrationVersions:applied.map(row=>row.version),dispatchDisabled:true,population:'SCHEMA_ONLY'},priorReceipt,now:Date.now()});input.plan=plan;const expected=input.expected as {releaseSha:string;treeSha:string;currentMainSha:string;ciRunId:string;installedSchema?:unknown;fingerprints:Record<string,string>};Object.assign(expected,{releaseSha:plan.source.sha,treeSha:plan.source.tree,currentMainSha:plan.source.sha,ciRunId:'32',installedSchema:plan.priorSchemaRelease});expected.fingerprints.migrationPlanSha256=canonicalHostedMigrationPlan(plan).sha256;expected.fingerprints.migrationHistorySha256=plan.observedHistorySha256;
 const manifest=JSON.parse(readFileSync(input.toolchainManifestPath as string,'utf8'));Object.assign(manifest,{sourceSha:plan.source.sha,treeSha:plan.source.tree});const manifestBytes=JSON.stringify(manifest)+'\n';await writeFile(input.toolchainManifestPath as string,manifestBytes);expected.fingerprints.migrationToolchainSha256=hash(manifestBytes);const policy=prepareHostedOperatorStoragePolicy({sourceSha:plan.source.sha,treeSha:plan.source.tree,projectRef:ref});await writeFile(input.operatorStoragePolicyPath as string,policy.canonicalJson);expected.fingerprints.operatorStoragePolicySha256=policy.sha256;
 const configSha256='c'.repeat(64),stage={id:'pre-observability',workdir:join(root,'.local/hosted-release/migration-fixture/pre-observability'),included:applied,pending:[],expectedBeforeVersions:applied.map(row=>row.version).sort(),expectedAfterVersions:applied.map(row=>row.version).sort(),configSha256,commandArgs:[]};input.stage=stage;state.stage=stage;state.aggregate=true;
 for(const[index,size]of [123,124,180].entries()){const included=plan.migrations.slice(0,size),identity={projectRef:ref,sourceSha:plan.source.sha,treeSha:plan.source.tree,planSha256:'a'.repeat(64),stageId:['prefix','native','pre-observability'][index] as HostedExecutionJournal['identity']['stageId'],stageSha256:hash(JSON.stringify({included:included.map(({name,version,sha256})=>({name,version,sha256})),configSha256})),databaseUrl:`postgresql://postgres@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,approvalDigest:'b'.repeat(64),ciRunId:'31',certificateSha256:'a'.repeat(64)};state.journals.set('original-'+index,{version:1,identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'} as HostedExecutionJournal);}
 const result=await module.executeNativeHostedMigrationStage(input);assert.equal(result.status,'NOOP',JSON.stringify({result,events:state.events}));assert.equal(state.commands,0);assert.equal(state.events.some(event=>event.startsWith('installed-schema:')),false);
});});

test('aggregate installed marker failure stops later SQL stages and aggregate marker without false cleanup review',async()=>{
 const module=await api();await fixture(async input=>{
  state.failures=['installed-schema'];const result=await module.executeNativeHostedMigrations(aggregateInput(input));
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.stages.length,1);assert.equal(result.stages[0].status,'REQUIRES_REVIEW');assert.equal(result.stages[0].protocol?.status,'COMMITTED');assert.equal(result.stages[0].protocol?.commitment,'CONFIRMED');assert.equal(result.stages[0].committedSchema?.completedAt,null);
  assert.equal(result.stages[0].installedSchemaMarker?.status,'UNKNOWN');assert.equal(result.compositionFailure?.phase,'INSTALLED_SCHEMA_MARKER');assert.equal(result.cleanupCode,null);assert.equal(result.recoveryCompletion,undefined);assert.equal(result.stages[0].recoveryCompletion,undefined);
  assert.equal(state.commands,1);assert.deepEqual(state.events.filter(event=>event.startsWith('installed-schema:')),['installed-schema:prefix']);assert.equal(state.events.includes('installed-migrations'),false);assert.deepEqual(state.events.filter(event=>event.startsWith('journal:')),['journal:INTENT','journal:COMMITTED']);assert.equal(state.events.filter(event=>event==='unlock').length,1);
 });
});

test('aggregate advances four canonical cumulative stages within one actual native lock callback', async () => {
 const module = await api(); assert.equal(typeof module.executeNativeHostedMigrations, 'function');
 await fixture(async input => {
  const aggregate = aggregateInput(input), transfer = JSON.parse(canonicalReleaseExecutionJson(aggregate)), result = await module.executeNativeHostedMigrations(transfer);
  assert.equal(result.status, 'COMMITTED', JSON.stringify({ result, events: state.events }));
  assert.equal(result.stages.length, 4); assert.equal(state.commands, 4);
  assert.equal(state.events.filter(event => event === 'lock').length, 1); assert.equal(state.events.filter(event => event === 'unlock').length, 1);
  assert.equal(state.events.at(-1), 'unlock'); assert.equal(result.schemaHistoryAtomic, false); assert.equal(result.hostedAcceptance, false);
  assert.deepEqual(state.phaseVersions.filter((_, index) => index % 4 === 3), aggregate.stages.map(stage => stage.expectedAfterVersions));
  assert.equal(JSON.stringify(result).includes(secret), false);
 });
});
test('reviewed session endpoint runs the same four canonical stages without losing project binding or native lease',async()=>{const module=await api();await fixture(async input=>{const endpoint={projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'};input.endpoint=endpoint;(input.expected as {fingerprints:Record<string,string>}).fingerprints.migrationEndpointSha256=hash(canonicalReleaseExecutionJson(endpoint));const result=await module.executeNativeHostedMigrations(JSON.parse(canonicalReleaseExecutionJson(aggregateInput(input))));assert.equal(result.status,'COMMITTED',JSON.stringify(result));assert.equal(state.commands,4);assert.ok(result.stages.every(stage=>stage.protocol?.identity?.databaseUrl===`postgresql://postgres.${ref}@${endpoint.host}:5432/postgres?sslmode=verify-full`));assert.equal(state.events.filter(event=>event==='lock').length,1);});});

test('aggregate refuses missing reordered or forged cumulative stages before native lock or CLI consumption', async () => {
 const module = await api(); assert.equal(typeof module.executeNativeHostedMigrations, 'function');
 for (const mode of ['missing', 'order', 'history'] as const) await fixture(async input => {
  const aggregate = aggregateInput(input);
  if (mode === 'missing') aggregate.stages.pop(); else if (mode === 'order') aggregate.stages.reverse(); else aggregate.stages[1].expectedBeforeVersions = [];
  assert.equal((await module.executeNativeHostedMigrations(aggregate)).status, 'REQUIRES_REVIEW');
  assert.equal(state.events.includes('lock'), false); assert.equal(state.commands, 0);
 });
});

test('aggregate terminal native uncertainty prevents all later stages and retains the original journal', async () => {
 const module = await api(); assert.equal(typeof module.executeNativeHostedMigrations, 'function');
 await fixture(async input => {
  const aggregate = aggregateInput(input); state.failures = ['native-timeout']; const result = await module.executeNativeHostedMigrations(aggregate);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 2); assert.equal(result.stages.length, 2);
  assert.equal(result.stages[1].protocol?.commitment, 'UNKNOWN'); assert.equal(state.journal?.state, 'REQUIRES_REVIEW');
  state.controller = new AbortController(); state.failures = [];
  assert.equal((await module.executeNativeHostedMigrations(aggregate)).status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 2);
 });
});

test('aggregate lock release uncertainty demotes every consumed stage and retains review journals', async () => {
 const module = await api(); assert.equal(typeof module.executeNativeHostedMigrations, 'function');
 await fixture(async input => {
  state.failures = ['unlock']; const result = await module.executeNativeHostedMigrations(aggregateInput(input));
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.cleanupCode, 'LOCK_RELEASE_UNCONFIRMED');
  assert.equal(result.stages.length, 4); assert.ok(result.stages.every(stage => stage.status === 'REQUIRES_REVIEW' && stage.protocol?.cleanupCode === 'LOCK_RELEASE_UNCONFIRMED'));
  assert.ok([...state.journals.values()].every(journal => journal?.state === 'REQUIRES_REVIEW'));
 });
});

test('aggregate re-admits current approval before the second stage rather than trusting first-stage success', async () => {
 const module = await api();
 await fixture(async input => {
  state.failures = ['native-approval-drift']; const result = await module.executeNativeHostedMigrations(aggregateInput(input));
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 1);
  assert.equal(result.stages[0].status, 'COMMITTED'); assert.equal(result.stages[1].status, 'REQUIRES_REVIEW');
  assert.equal(result.stages[1].protocol?.commitment, 'NOT_ATTEMPTED');
 });
});

async function withMigrationClock(run: () => Promise<void>) {
 const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
 Object.assign(globalThis, { nativeCompositionAdvanceClock: (milliseconds: number) => { now += milliseconds; } });
 try { await run(); } finally { Date.now = originalNow; delete (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock; }
}

test('slow complete official source admission reacquires current observations for original CLI and after-state', async () => {
 const module = await api(); await fixture(async input => withMigrationClock(async () => {
  state.failures = ['slow-official']; const result = await module.executeNativeHostedMigrationStage(input);
  assert.equal(result.status, 'COMMITTED', JSON.stringify({ result, events: state.events })); assert.equal(state.commands, 1);
  assert.equal(result.protocol?.commitment, 'CONFIRMED'); assert.equal(state.journal?.state, 'COMMITTED');
  state.controller = new AbortController(); state.phaseVersions = [];
  const replay = await module.executeNativeHostedMigrationStage(input); assert.equal(replay.status, 'NOOP'); assert.equal(state.commands, 1);
 }));
});

test('slow complete source admission permits all four original stages under one retained session lease', async () => {
 const module = await api(); await fixture(async input => withMigrationClock(async () => {
  state.failures = ['slow-official']; const result = await module.executeNativeHostedMigrations(aggregateInput(input));
  assert.equal(result.status, 'COMMITTED', JSON.stringify({ result, events: state.events })); assert.equal(state.commands, 4);
  assert.equal(result.stages.length, 4); assert.ok(result.stages.every(stage => stage.protocol?.commitment === 'CONFIRMED'));
  assert.equal(state.events.filter(event => event === 'lock').length, 1); assert.equal(state.events.filter(event => event === 'unlock').length, 1);
 }));
});

test('older actual target observation expires during later inventory instead of receiving a new admission clock', async () => {
 const module = await api(); await fixture(async input => withMigrationClock(async () => {
  state.failures = ['older-target']; const result = await module.executeNativeHostedMigrationStage(input);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.events.includes('cli'), false);
 }));
});

test('failed admission reports only its allowlisted phase and original observation ages before any intent',async()=>{
 const subject=await api();await fixture(async input=>withMigrationClock(async()=>{
  state.failures=['older-target'];const result=await subject.executeNativeHostedMigrationStage(input);
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.events.includes('journal:INTENT'),false);
  assert.ok(result.admissionFailure);assert.equal(result.admissionFailure.phase,'FINAL_FRESHNESS');assert.ok(result.admissionFailure.agesMs.target!==null&&result.admissionFailure.agesMs.target>30000);
  assert.equal(JSON.stringify(result.admissionFailure).includes(secret),false);assert.deepEqual(Object.keys(result.admissionFailure).sort(),['agesMs','durationMs','phase']);
 }));
});

test('admission diagnostics classify capability inventory and scope refusals while successful evidence has no failure fields',async()=>{
 const subject=await api();
 for(const [mode,phase]of [['schema-storage','STORAGE_CAPABILITY'],['count-mismatch','OPERATOR_INVENTORY'],['population','HISTORY_AND_SCOPE']]as const)await fixture(async input=>{
  state.failures=[mode];const result=await subject.executeNativeHostedMigrationStage(input);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.admissionFailure?.phase,phase);assert.equal(state.commands,0);assert.equal(state.events.includes('journal:INTENT'),false);assert.deepEqual(Object.keys(result.admissionFailure??{}).sort(),['agesMs','durationMs','phase']);assert.equal(JSON.stringify(result.admissionFailure).includes(secret),false);
 });
 await fixture(async input=>{const result=await subject.executeNativeHostedMigrationStage(input);assert.equal(result.status,'COMMITTED');assert.equal(result.admissionFailure,undefined);});
});

test('native session loss during fresh inventory stops the original CLI', async () => {
 const module = await api(); await fixture(async input => { state.failures = ['lost-during-inventory'];
  const result = await module.executeNativeHostedMigrationStage(input); assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0);
 });
});

test('slow admission followed by unavailable actual after-state preserves original unknown journal without another CLI', async () => {
 const module = await api(); await fixture(async input => withMigrationClock(async () => {
  state.failures = ['slow-official', 'after-history']; const result = await module.executeNativeHostedMigrationStage(input);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.protocol?.commitment, 'UNKNOWN'); assert.equal(state.commands, 1);
  assert.equal(state.journal?.state, 'REQUIRES_REVIEW'); state.controller = new AbortController(); state.failures = ['slow-official'];
  const retry = await module.executeNativeHostedMigrationStage(input); assert.equal(retry.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 1);
 }));
});

test('all native executable preparation finishes before intent and renewed current CLI evidence, and is disposed before lease release',async()=>{
 const subject=await api();await fixture(async input=>withMigrationClock(async()=>{
  state.failures=['slow-process-prepare'];const result=await subject.executeNativeHostedMigrationStage(input);
  assert.equal(result.status,'COMMITTED',JSON.stringify({result,events:state.events}));assert.equal(state.commands,1);
  assert.equal(state.events.filter(event=>event==='process-prepare').length,1);assert.ok(state.events.indexOf('process-prepare')<state.events.indexOf('journal:INTENT'));
  assert.ok(state.events.indexOf('process-dispose')>state.events.indexOf('cli'));assert.ok(state.events.indexOf('process-dispose')<state.events.indexOf('unlock'));
 }));
});
test('unknown prepared cleanup refuses confirmed release while retaining the original native result',async()=>{
 const subject=await api();await fixture(async input=>{
  state.failures=['process-dispose'];const result=await subject.executeNativeHostedMigrationStage(input);
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,1);assert.ok(state.events.includes('process-dispose'));assert.equal(result.compositionFailure?.processCleanup,'UNCONFIRMED');assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(result.committedSchema?.protocol.status,'COMMITTED');assert.equal(result.committedSchema?.protocol.commitment,'CONFIRMED');assert.equal(result.committedSchema?.protocol.cleanupCode,null);assert.equal(result.committedSchema?.completedAt,null);assert.equal(result.installedSchemaMarker,undefined);assert.equal(result.recoveryCompletion,undefined);
 });
});
test('native preparation failure retains only original resource identity and explicit unknown cleanup',async()=>{
 const subject=await api();await fixture(async input=>{
  state.failures=['prepared-failure'];const result=await subject.executeNativeHostedMigrationStage(input);
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.events.includes('journal:INTENT'),false);
  assert.deepEqual(result.compositionFailure?.process,{version:1,purpose:'CUEVO_NATIVE_MIGRATION_PREPARATION_FAILURE',phase:'CREATE',ownerId:'ffffffff-ffff-4fff-afff-ffffffffffff',cleanup:'UNCONFIRMED'});
  assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(JSON.stringify(result).includes('Private original failure'),false);
 });
});

test('metadata-only stage cannot allocate native consumers or migration execution',async()=>{
 const subject=await api();await fixture(async input=>{
  const result=await subject.executeNativeHostedMigrationStage({...input,stage:{...(input.stage as object),materialization:'METADATA_ONLY'}});
  assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.protocol,null);assert.equal(state.commands,0);assert.equal(state.seenIntent,false);assert.equal(state.events.length,0);
 });
});
