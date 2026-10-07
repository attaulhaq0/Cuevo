import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { HostedExecutionJournal } from './hosted-migration-execution';
import { planHostedMigrations, canonicalHostedMigrationPlan, readCanonicalMigrationSources, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { prepareHostedOperatorStoragePolicy } from './hosted-operator-storage-policy';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import { canonicalReleaseExecutionJson } from '../verification/release-review';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const ref = 'mqxdjvsyckzocokuikmx', secret = 'private-native-composition-canary';
type State = { events: string[]; journal: HostedExecutionJournal | null; journals: Map<string, HostedExecutionJournal | null>; after: boolean; lost: boolean; failures: string[]; input?: Record<string, unknown>; sources: { name: string; bytes: Uint8Array }[]; stage?: Record<string, unknown>; controller: AbortController; commands: number; phaseVersions: string[][]; seenIntent: boolean; driftFiles: boolean; aggregate?: boolean; nativeProducer?: boolean; nativePeerAuthorized?: boolean; nativeSignal?: AbortSignal; nativeTargetKeys?: string[][] };
const state: State = { events: [], journal: null, journals: new Map(), after: false, lost: false, failures: [], sources: [], controller: new AbortController(), commands: 0, phaseVersions: [], seenIntent: false, driftFiles: false };
let canonicalSources: State['sources'] | undefined;

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
  'backend-release-admission.ts': 'export const readBackendReleaseAdmission=globalThis.nativeCompositionFixture.admission;',
  'backend-release-contracts.ts': 'export const validatePreparedBackendReleaseIntent=globalThis.nativeCompositionFixture.prepared;',
  'hosted-migration-provider.ts': 'export const readHostedMigrationProvider=globalThis.nativeCompositionFixture.provider;',
  'hosted-migration-stage-files.ts': 'export const admitHostedMigrationStageFiles=globalThis.nativeCompositionFixture.files;',
  'hosted-migration-database.ts': 'export const createHostedMigrationDatabase=globalThis.nativeCompositionFixture.database;',
  'hosted-migration-native-process.ts': 'export const createHostedMigrationNativeProcess=globalThis.nativeCompositionFixture.process;',
  'hosted-migration-journal.ts': 'export const createHostedMigrationJournal=globalThis.nativeCompositionFixture.journal;',
  'hosted-migration-durable-journal.ts': 'export const createHostedMigrationDurableJournal=globalThis.nativeCompositionFixture.durable;',
  'hosted-operator-storage-inventory.ts': 'export const readHostedOperatorStorageInventory=globalThis.nativeCompositionFixture.inventory;',
};
registerHooks({ resolve(specifier, context, next) { if (specifier.endsWith('/hosted-migration-provider')) return { shortCircuit: true, url: new URL('./hosted-migration-provider.ts', context.parentURL).href }; return next(specifier, context); }, load(url, context, next) { if (/\/node_modules\/pg\/(?:lib\/index\.js|esm\/index\.mjs)$/.test(url.replaceAll('\\', '/'))) return { format: 'module', shortCircuit: true, source: 'export const Client=globalThis.nativeObserverTransportClient;export default{Client};' }; const name = url.split('/').at(-1)!; if(name==='hosted-migration-provider.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace('async function readHostedMigrationProvider(value) {','async function readHostedMigrationProvider(value) { return globalThis.nativeCompositionFixture.provider(value);')};if (replacements[name]) return { format: 'module', shortCircuit: true, source: replacements[name] }; if (name === 'hosted-migration-executor.ts') return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code }; return next(url, context); } });
const clone = <T,>(value: T): T => structuredClone(value);
const fail = (name: string) => { if (state.failures.includes(name)) throw Error(secret); };
const versions = () => (state.stage![state.after ? 'expectedAfterVersions' : 'expectedBeforeVersions'] as string[]);
function rawHistory() { return versions().map(version => { const source = state.sources.find(row => row.name.startsWith(version))!; const text = new TextDecoder().decode(source.bytes).trim(); return { version, name: source.name.slice(15, -4), statements: text ? [text] : [] }; }); }
function storageCount() { return state.aggregate ? [...state.journals.values()].reduce((count, journal) => count + (journal ? journal.state === 'INTENT' ? 2 : 3 : 0), 0) : state.journal ? state.journal.state === 'INTENT' ? 2 : 3 : 0; }
function target() { return { observedAtMs: state.failures.includes('older-target') ? Date.now() - 25000 : Date.now(), operator: 'postgres', database: 'postgres', serverVersion: 170011, tls: { kind: 'PEER_VERIFIED', host: (state.input!.endpoint as {host:string}).host, certificateSha256: 'a'.repeat(64), peerCertificateSha256: 'b'.repeat(64), protocol: 'TLSv1.3' }, historyPresent: versions().length > 0, history: rawHistory(), authUsers: state.failures.includes('population') ? 1 : 0, storageObjects: storageCount() + (state.failures.includes('inventory-foreign-intent') ? 2 : 0), appSchemas: versions().length ? ['app', 'authorization', 'internal'] : [], runtimeRoles: versions().length ? ['cuevo_api', 'cuevo_worker'] : [], schools: versions().length ? 0 : null }; }
function checks() { const current = versions(), has = (prefix: string) => current.includes(prefix); return { foundation: current.length ? true : null, rls: current.length ? true : null, privateRelations: current.length ? true : null, privateFunctions: current.length ? true : null, runtimeRoles: current.length ? true : null, nativeSourceBridge: has('20261002021737') ? true : null, curriculumLifecycle: has('20261002021206') ? true : null, dispatchInactive: has('20261002122236') ? true : null, analyticsInactive: has('20261002182213') ? true : null, recoveryCronInactive: true, transportPrivate: has('20261005132902') ? true : null }; }
Object.assign(globalThis, { nativeCompositionFixture: {
  prepared: (value: unknown) => clone(value),
  admission: async () => { state.events.push('official'); if (state.failures.includes('slow-official')) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(31000); fail('official'); if (state.seenIntent) fail('official-after-intent'); if (state.stage?.id === 'native') fail('native-approval-drift'); return { expected: clone(state.input!.expected), approval: { purpose: 'BACKEND_SYNTHETIC_STAGING', state: 'approved', packageSha256: (state.input!.preparedApproval as { sha256: string }).sha256 }, observedAt: new Date(Date.now()).toISOString(), provenance: 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' }; },
  provider: async () => { state.events.push('provider'); fail('provider'); return { evidence: 'OFFICIAL_SUPABASE_PROJECT_METADATA', observedAtMs: Date.now(), projectRef: ref, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', directEndpoint: { projectRef: ref, kind: 'direct', host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres' },sessionEndpoint:{projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'} }; },
  files: async (input: { stage: Record<string, unknown> }) => { state.events.push('files'); fail('files'); if (state.aggregate && state.stage?.id !== input.stage.id) { state.stage = clone(input.stage); state.after = false; } if (state.driftFiles) throw Error(secret); const rows = input.stage.included as { name: string; version: string; sha256: string }[]; return { evidence: 'VERIFIED_GIT_AND_PHYSICAL_STAGE', sources: state.sources, stageSha256: hash(JSON.stringify({ included: rows.map(row => ({ name: row.name, version: row.version, sha256: row.sha256 })), configSha256: input.stage.configSha256 })), planSha256: canonicalHostedMigrationPlan(state.input!.plan as Parameters<typeof canonicalHostedMigrationPlan>[0]).sha256 }; },
  database: async (input: Parameters<typeof import('./hosted-migration-database').createHostedMigrationDatabase>[0]) => {
    if (state.nativeProducer) {
      // A distinct module URL bypasses only this file's database-factory mock;
      // the production observer source is loaded without rewriting its body.
      const nativeUrl = pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-database.ts')); nativeUrl.search = '?native-observer-contract';
      const owner = await import(nativeUrl.href) as typeof import('./hosted-migration-database');
      const database = await owner.createHostedMigrationDatabase(input); state.nativeSignal = database.signal;
      return { ...database, withLock: async (key: string, run: Parameters<typeof database.withLock>[1]) => { state.events.push('lock'); const receipt = await database.withLock(key, run); state.events.push('unlock'); return receipt; }, observeTarget: async () => { state.events.push('target'); const result = await database.observeTarget(); state.nativeTargetKeys!.push(Object.keys(result).sort()); return result; }, observeStage: async (value: Parameters<typeof database.observeStage>[0]) => { state.events.push('postconditions'); state.phaseVersions.push(clone(value.expectedAfterVersions)); return database.observeStage(value); } };
    }
    return { signal: state.controller.signal, withLock: async (key: string, run: (lease: unknown) => Promise<void>) => { state.events.push('lock'); fail('lock'); try { await run({ kind: 'HELD', key, id: 'native-current-lease' }); state.events.push('unlock'); fail('unlock'); return { kind: 'RELEASED' }; } finally { state.controller.abort(); } }, observeTarget: async () => { state.events.push('target'); fail('target'); if (state.lost) { state.controller.abort(); throw Error(secret); } const result = target(); return state.after && state.failures.includes('after-history') ? { ...result, history: [] } : result; }, observeStage: async (value: { stageId: string; expectedAfterVersions: string[] }) => { state.events.push('postconditions'); state.phaseVersions.push(clone(value.expectedAfterVersions)); assert.deepEqual(value.expectedAfterVersions, versions()); const result = checks(); return { observedAtMs: Date.now(), stageId: value.stageId, checks: { ...result, ...(state.failures.includes('postconditions') || state.after && state.failures.includes('after-postconditions') ? { rls: false } : {}) } }; } };
  },
  process: async (_value: unknown, options: { signal: AbortSignal; notAfterMs: number }) => ({ runCli: async (args: string[], env: Record<string, string>) => { state.events.push('cli'); state.commands++; assert.equal(options.signal, state.nativeProducer ? state.nativeSignal : state.controller.signal); assert.ok(Number.isSafeInteger(options.notAfterMs) && options.notAfterMs > Date.now() && options.notAfterMs <= Date.now() + 30000); assert.equal(env.PGPASSWORD, secret); assert.equal(args.some(arg => arg.includes(secret)), false); assert.ok(args.includes('--skip-vault')); fail('cli'); if (state.failures.includes('native-timeout') && state.stage!.id === 'native') return { kind: 'TIMEOUT' }; state.after = true; return state.failures.includes('timeout') ? { kind: 'TIMEOUT' } : { kind: 'EXITED', exitCode: 0 }; } }),
  journal: async ({ journalRoot }: { journalRoot: string }) => ({ readJournal: async () => { state.events.push('journal-read'); fail('journal-read'); return clone(state.journals.get(journalRoot) ?? state.journal); }, writeJournal: async (value: HostedExecutionJournal) => { state.events.push('journal:' + value.state); if (value.state === 'INTENT') state.seenIntent = true; state.journal = clone(value); state.journals.set(journalRoot, clone(value)); return state.failures.includes('journal-sync') ? { kind: 'UNCONFIRMED' } : { kind: 'SYNCED', sha256: hash(JSON.stringify(value)) }; } }),
  durable: async (input: { journalRoot: string; storageKey: string; providerToken: string; identity: HostedExecutionJournal['identity'] }) => { state.events.push('durable'); assert.equal(input.storageKey, 'journal-only-credential-canary'); assert.equal(input.providerToken, secret); if (state.aggregate) { state.journal = state.journals.get(input.journalRoot) ?? null; await mkdir(input.journalRoot, { recursive: true }); await writeFile(join(input.journalRoot, 'owner.json'), JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', identity: input.identity })); } const journal = (globalThis as unknown as { nativeCompositionFixture: { journal: (input: { journalRoot: string }) => Promise<unknown> } }).nativeCompositionFixture.journal; return journal(input); },
  inventory: async (input: { identity: HostedExecutionJournal['identity']; expectedVersions: string[]; storageKey: string }) => { state.events.push('inventory'); fail('inventory'); assert.equal(input.storageKey, 'journal-only-credential-canary'); assert.deepEqual(input.expectedVersions, versions()); if (state.phaseVersions.length === 2) { if (state.failures.includes('inventory-file-drift')) state.driftFiles = true; if (state.failures.includes('inventory-policy-drift')) await writeFile(state.input!.operatorStoragePolicyPath as string, '{}'); if (state.failures.includes('inventory-toolchain-drift')) await writeFile(state.input!.toolchainManifestPath as string, '{}'); } if (state.failures.includes('late-file-drift') && state.phaseVersions.length === 1) state.driftFiles = true; if (state.failures.includes('lost-during-inventory')) state.controller.abort(); const foreign = state.failures.includes('inventory-foreign-intent') ? 2 : 0, now = Date.now(); if (state.failures.includes('late-inventory-clock') && state.phaseVersions.length === 1) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(31000); if (state.failures.includes('older-target')) (globalThis as unknown as { nativeCompositionAdvanceClock?: (milliseconds: number) => void }).nativeCompositionAdvanceClock?.(10000); return { evidence: 'VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY', projectRef: ref, sourceSha: input.identity.sourceSha, treeSha: input.identity.treeSha, approvalDigest: input.identity.approvalDigest, ciRunId: input.identity.ciRunId, planSha256: input.identity.planSha256, stageId: input.identity.stageId, stageSha256: input.identity.stageSha256, expectedVersionsSha256: hash(JSON.stringify([...input.expectedVersions].sort())), observedAtMs: state.failures.includes('old-inventory') ? now - 31000 : now, startedAtMs: now, bytesVerificationStartedAtMs: now, bytesVerifiedAtMs: now, countsVerifiedAtMs: now, completedAtMs: now, totalStorageObjects: storageCount() + foreign + (state.failures.includes('count-mismatch') ? 1 : 0), verifiedOperatorObjects: storageCount() + foreign, applicationStorageObjects: state.failures.includes('application-storage') ? 1 : 0, bucketMetadataSha256: '1'.repeat(64), objectSetSha256: '2'.repeat(64), remoteProjectSha256: '3'.repeat(64), operations: state.aggregate ? [...state.journals.values()].filter((journal): journal is HostedExecutionJournal => journal !== null).map(journal => ({ operation: hash(JSON.stringify(journal.identity)), state: journal.state, identitySha256: hash(JSON.stringify(journal.identity)), chainSha256: '4'.repeat(64), objectCount: journal.state === 'INTENT' ? 2 : 3 })) : [...(state.journal ? [{ operation: hash(JSON.stringify(input.identity)), state: state.journal.state, identitySha256: hash(JSON.stringify(input.identity)), chainSha256: '4'.repeat(64), objectCount: state.failures.includes('inventory-sum') ? 1 : storageCount() }] : []), ...(foreign ? [{ operation: '5'.repeat(64), state: 'INTENT', identitySha256: '5'.repeat(64), chainSha256: '6'.repeat(64), objectCount: 2 }] : [])] }; },
} });

async function api() { let module: Record<string, unknown> = {}; try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-executor.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; } assert.equal(typeof module.executeNativeHostedMigrationStage, 'function', 'native stage composition export must exist'); return module as typeof import('./hosted-migration-executor'); }
function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); }
async function fixture(run: (input: Record<string, unknown>, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-native-composition-'));
  try {
    Object.assign(state, { events: [], journal: null, journals: new Map(), after: false, lost: false, failures: [], controller: new AbortController(), commands: 0, phaseVersions: [], seenIntent: false, driftFiles: false, aggregate: false, nativeProducer: false, nativePeerAuthorized: true, nativeSignal: undefined, nativeTargetKeys: [] });
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
