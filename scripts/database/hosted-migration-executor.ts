import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { readBackendReleaseAdmission } from '../verification/backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from '../verification/backend-release-contracts';
import { canonicalHostedMigrationPlan, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { prepareHostedMigrationConnection } from './hosted-migration-connection';
import { prepareHeldHostedMigrationStage, type HeldHostedMigrationStage, type HostedExecutionJournal, type HostedExecutionPorts, type HostedExecutionResult } from './hosted-migration-execution';
import { createHostedMigrationDatabase } from './hosted-migration-database';
import { createHostedMigrationNativeProcess } from './hosted-migration-native-process';
import { createHostedMigrationJournal } from './hosted-migration-journal';
import { createHostedMigrationDurableJournal } from './hosted-migration-durable-journal';
import { readHostedOperatorStorageInventory } from './hosted-operator-storage-inventory';
import { validateHostedOperatorStoragePolicy } from './hosted-operator-storage-policy';
import { admitHostedMigrationStageFiles } from './hosted-migration-stage-files';
import { verifyHostedMigrationHistory } from './hosted-migration-history';
import { readHostedMigrationProvider, hostedMigrationEndpointSchema, requireCurrentHostedMigrationEndpoint } from './hosted-migration-provider';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';

const failure = () => Error('Native migration composition requires review; contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/);
const stageId = z.enum(['prefix', 'native', 'pre-observability', 'remaining']);
const secret = z.string().min(1).max(24576).refine(value => value.trim().length > 0 && [...value].every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127));
const inputSchema = z.object({ repoRoot: z.string(), endpoint: hostedMigrationEndpointSchema, plan: z.unknown(), stage: z.unknown(), preparedApproval: z.unknown(), expected: z.unknown(), certificate: z.object({ path: z.string(), sha256: digest }).strict(), toolchainManifestPath: z.string(), operatorStoragePolicyPath: z.string(), journalStorageKey: z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_')), githubToken: secret, providerToken: secret, migrationPassword: secret, toolchain: z.record(z.string(), z.string()) }).strict();
const manifestSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_MIGRATION_TOOLCHAIN'), sourceSha: sha, treeSha: sha, sourceLockSha256: digest, cliVersion: z.literal('2.119.0'), platform: z.string(), cli: z.object({ shimSha256: digest, binarySha256: digest, sidecarSha256: digest }).strict() }).strict();
const identitySchema = z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), sourceSha: sha, treeSha: sha, planSha256: digest, stageId, stageSha256: digest, databaseUrl: z.string(), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/), certificateSha256: digest }).strict();
const ownerSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL'), identity: identitySchema }).strict();
const row = z.object({ name: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/), version: z.string().regex(/^\d{14}$/), sha256: digest }).strict();
const stageSchema = z.object({ id: stageId, workdir: z.string(), included: z.array(row).min(1).max(1000), pending: z.array(row).max(1000), expectedBeforeVersions: z.array(z.string().regex(/^\d{14}$/)).max(1000), expectedAfterVersions: z.array(z.string().regex(/^\d{14}$/)).max(1000), configSha256: digest, commandArgs: z.array(z.string()).max(30) }).strict();
const checkNames = ['foundation', 'rls', 'privateRelations', 'privateFunctions', 'runtimeRoles', 'nativeSourceBridge', 'curriculumLifecycle', 'dispatchInactive', 'analyticsInactive', 'recoveryCronInactive', 'transportPrivate'] as const;
const checksSchema = z.object(Object.fromEntries(checkNames.map(name => [name, z.boolean().nullable()])) as Record<typeof checkNames[number], z.ZodNullable<z.ZodBoolean>>).strict();
const postSchema = z.object({ observedAtMs: z.number().int().nonnegative(), stageId, checks: checksSchema }).strict();
const targetSchema = z.object({ observedAtMs: z.number().int().nonnegative(), operator: z.literal('postgres'), database: z.literal('postgres'), serverVersion: z.number().int().min(170000).max(179999), tls: z.object({ kind: z.literal('PEER_VERIFIED'), host: z.string(), certificateSha256: digest, peerCertificateSha256: digest, protocol: z.enum(['TLSv1.2', 'TLSv1.3']) }).strict(), historyPresent: z.boolean(), history: z.array(z.object({ version: z.string().regex(/^\d{14}$/), name: z.string(), statements: z.array(z.string()) }).strict()).max(1000), authUsers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), storageObjects: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), appSchemas: z.array(z.string()).max(3), runtimeRoles: z.array(z.string()).max(2), schools: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable() }).strict();
const observedTime = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const inventorySchema = z.object({ evidence: z.literal('VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY'), projectRef: z.string(), sourceSha: sha, treeSha: sha, approvalDigest: digest, ciRunId: z.string(), planSha256: digest, stageId, stageSha256: digest, expectedVersionsSha256: digest, observedAtMs: observedTime, startedAtMs: observedTime, bytesVerificationStartedAtMs: observedTime, bytesVerifiedAtMs: observedTime, countsVerifiedAtMs: observedTime, completedAtMs: observedTime, totalStorageObjects: z.number().int().nonnegative().max(1000), verifiedOperatorObjects: z.number().int().nonnegative().max(1000), applicationStorageObjects: z.literal(0), bucketMetadataSha256: digest, objectSetSha256: digest, remoteProjectSha256: digest, operations: z.array(z.object({ operation: digest, state: z.enum(['INTENT', 'COMMITTED', 'REQUIRES_REVIEW', 'OWNER_ONLY']), identitySha256: digest, chainSha256: digest, objectCount: z.number().int().min(1).max(4) }).strict()).max(1000) }).strict();

export type NativeHostedMigrationStageResult = { status: HostedExecutionResult['status']; evidence: 'NATIVE_ADAPTER_STAGE_EXECUTION'; schemaHistoryAtomic: false; hostedAcceptance: false; protocol: HostedExecutionResult | null; compositionCode: 'PREFLIGHT_UNCONFIRMED' | null };
export type NativeHostedMigrationAggregateResult = { status: HostedExecutionResult['status']; evidence: 'NATIVE_ADAPTER_AGGREGATE_EXECUTION'; schemaHistoryAtomic: false; hostedAcceptance: false; stages: NativeHostedMigrationStageResult[]; cleanupCode: 'LOCK_RELEASE_UNCONFIRMED' | null; compositionCode: 'PREFLIGHT_UNCONFIRMED' | null };
function own(value: unknown, depth = 0): unknown {
  if (depth > 15) throw failure();
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  if (Array.isArray(value) && (value.length > 5000 || Reflect.ownKeys(value).length !== value.length + 1)) throw failure();
  const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(value)) { if (Array.isArray(value) && key === 'length') continue; const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); Object.defineProperty(output, key, { value: own(field.value, depth + 1), enumerable: true }); }
  return output;
}
function git(root: string, args: string[], input?: string) {
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  return execFileSync('git', ['-C', root, ...args], { input, env, timeout: 15000, maxBuffer: 2 * 1024 * 1024, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
}
async function physical(root: string, path: string, kind: 'file' | 'directory') {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path || await realpath(root) !== root) throw failure();
  const part = relative(root, path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(piece => !piece || piece === '.' || piece === '..')) throw failure();
  let current = root; for (const [index, piece] of part.split(/[\\/]/).entries()) { current = join(current, piece); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index === part.split(/[\\/]/).length - 1 ? kind === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory() : !stat.isDirectory())) throw failure(); }
}
async function boundedFile(root: string, path: string, maximum: number) { await physical(root, path, 'file'); const before = await lstat(path); if (before.size > maximum) throw failure(); const bytes = await readFile(path); const after = await lstat(path); if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > maximum) throw failure(); return bytes; }
function fresh(value: number) { const now = Date.now(); if (!Number.isSafeInteger(value) || value > now || now - value > 30000) throw failure(); }
function same(left: unknown, right: unknown) { return canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right); }

/** Trusted operator-host composition only. It has no CLI entrypoint or injected
 * proof ports; durable cross-run CI retention and hosted acceptance are separate. */
async function executeNativeStages(value: unknown, aggregate: boolean): Promise<NativeHostedMigrationAggregateResult> {
  const output: NativeHostedMigrationAggregateResult = { status: 'REQUIRES_REVIEW', evidence: 'NATIVE_ADAPTER_AGGREGATE_EXECUTION', schemaHistoryAtomic: false, hostedAcceptance: false, stages: [], cleanupCode: null, compositionCode: 'PREFLIGHT_UNCONFIRMED' };
  try {
    const supplied = own(value) as Record<string, unknown>;
    const selected = aggregate ? inputSchema.omit({ stage: true }).extend({ stages: z.array(stageSchema).length(4) }).strict().parse(supplied) : inputSchema.parse(supplied);
    const stages = ('stages' in selected ? selected.stages : [stageSchema.parse((selected as z.infer<typeof inputSchema>).stage)]) as HostedMigrationWorkdirs['stages'];
    const input = selected, root = input.repoRoot, plan = JSON.parse(canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1).json) as HostedMigrationPlanV1;
    const expected = own(input.expected) as BackendReleaseExpected, prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }) as PreparedBackendReleaseIntent;
    const body = own(JSON.parse(prepared.canonicalJson)) as { expiresAt: string }; const expiresAtMs = Date.parse(body.expiresAt);
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now() || plan.source.sha !== expected.releaseSha || plan.source.tree !== expected.treeSha || plan.projectRef !== expected.targets.supabase.projectRef || canonicalHostedMigrationPlan(plan).sha256 !== expected.fingerprints.migrationPlanSha256 || plan.observedHistorySha256 !== expected.fingerprints.migrationHistorySha256) throw failure();
    const toolchain = async () => {
      const path = input.toolchainManifestPath, part = relative(join(root, '.local/hosted-release'), path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(piece => piece === '.' || piece === '..')) throw failure();
      const bytes = await boundedFile(root, path, 48 * 1024); if (hash(bytes) !== expected.fingerprints.migrationToolchainSha256) throw failure(); const manifest = manifestSchema.parse(own(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))));
      if (manifest.sourceSha !== expected.releaseSha || manifest.treeSha !== expected.treeSha || manifest.platform !== `${process.platform}-${process.arch}`) throw failure();
      const relativePath = relative(root, path).replaceAll('\\', '/'); if (git(root, ['check-ignore', '--no-index', '--stdin'], relativePath + '\n').toString().trim() !== relativePath || git(root, ['ls-files', '--cached', '--', relativePath]).length) throw failure();
      const lockBytes = git(root, ['show', expected.releaseSha + ':package-lock.json']); if (hash(lockBytes) !== manifest.sourceLockSha256) throw failure(); const lock = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(lockBytes)) as { lockfileVersion: number; packages: Record<string, { version?: string; integrity?: string; resolved?: string }> }; const platform = process.platform === 'win32' ? 'windows' : process.platform;
      for (const path of ['node_modules/supabase', `node_modules/@supabase/cli-${platform}-${process.arch}`]) { const row = lock.packages?.[path]; if (lock.lockfileVersion !== 3 || row?.version !== '2.119.0' || !row.integrity?.startsWith('sha512-') || !row.resolved?.startsWith('https://registry.npmjs.org/')) throw failure(); }
      return manifest;
    };
    const storagePolicy = async () => { const path = input.operatorStoragePolicyPath, part = relative(join(root, '.local/hosted-release'), path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(piece => !piece || piece === '.' || piece === '..')) throw failure(); const bytes = await boundedFile(root, path, 8192); if (hash(bytes) !== expected.fingerprints.operatorStoragePolicySha256) throw failure(); const relativePath = relative(root, path).replaceAll('\\', '/'); if (git(root, ['check-ignore', '--no-index', '--stdin'], relativePath + '\n').toString().trim() !== relativePath || git(root, ['ls-files', '--cached', '--', relativePath]).length) throw failure(); const policy = validateHostedOperatorStoragePolicy(new TextDecoder('utf8', { fatal: true }).decode(bytes), { sourceSha: expected.releaseSha, treeSha: expected.treeSha, projectRef: plan.projectRef }); if (policy.sha256 !== expected.fingerprints.operatorStoragePolicySha256) throw failure(); return policy; };
    const official = async () => { const result = await readBackendReleaseAdmission({ repoRoot: root, prepared, expected, githubToken: input.githubToken }); if (result.provenance !== 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' || result.approval.packageSha256 !== prepared.sha256 || result.expected.releaseSha !== expected.releaseSha || result.expected.treeSha !== expected.treeSha || result.expected.ciRunId !== expected.ciRunId || !same(result.expected.fingerprints, expected.fingerprints)) throw failure(); return result; };
    const provider = async () => { const result = await readHostedMigrationProvider({ projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, providerToken: input.providerToken }); fresh(result.observedAtMs); if (result.evidence !== 'OFFICIAL_SUPABASE_PROJECT_METADATA' || result.projectRef !== plan.projectRef || result.projectName.toLowerCase() !== 'cuevo' || result.projectStatus !== 'ACTIVE_HEALTHY' || result.directEndpoint.projectRef !== plan.projectRef || result.directEndpoint.host !== `db.${plan.projectRef}.supabase.co` || result.directEndpoint.kind !== 'direct' || result.directEndpoint.port !== 5432 || result.directEndpoint.database !== 'postgres') throw failure(); requireCurrentHostedMigrationEndpoint(input.endpoint,result,expected.fingerprints.migrationEndpointSha256); return result; };
    await official(); const currentProvider = await provider(), manifest = await toolchain(); await storagePolicy();
    const artifacts: Awaited<ReturnType<typeof admitHostedMigrationStageFiles>>[] = [];
    for (const stage of stages) {
      const artifact = await admitHostedMigrationStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage });
      if (artifact.planSha256 !== expected.fingerprints.migrationPlanSha256 || artifact.stageSha256 !== hash(JSON.stringify({ included: stage.included.map(row => ({ name: row.name, version: row.version, sha256: row.sha256 })), configSha256: stage.configSha256 }))) throw failure();
      artifacts.push(artifact);
    }
    if (aggregate) {
      const replay = replayPlan(artifacts[0].sources), boundary = replay.remaining.indexOf(posthogIntelligenceMigration);
      const groups = [replay.before, [replay.prerequisite], replay.remaining.slice(0, boundary), replay.remaining.slice(boundary)], rows = [...replay.before, replay.prerequisite, ...replay.remaining].map(name => ({ name, version: name.slice(0, 14), sha256: hash(artifacts[0].sources.find(source => source.name === name)!.bytes) }));
      const boundaries = groups.map((_, index) => groups.slice(0, index + 1).flat().length), ids = ['prefix', 'native', 'pre-observability', 'remaining'];
      if (boundary < 0 || !same(rows, plan.migrations) || plan.applied.length && !boundaries.includes(plan.applied.length) || new Set(stages.map(stage => stage.workdir)).size !== 4) throw failure();
      for (const [index, stage] of stages.entries()) {
        const included = rows.slice(0, Math.max(plan.applied.length, boundaries[index])), before = rows.slice(0, Math.max(plan.applied.length, index ? boundaries[index - 1] : 0)).map(row => row.version).sort();
        const pending = included.filter(row => !before.includes(row.version));
        if (stage.id !== ids[index] || !same(stage.included, included) || !same(stage.pending, pending) || !same(stage.expectedBeforeVersions, before) || !same(stage.expectedAfterVersions, included.map(row => row.version).sort()) || plan.stages[index].id !== ids[index] || !same(plan.stages[index].names, pending.map(row => row.name))) throw failure();
      }
    }
    const connection = prepareHostedMigrationConnection({ projectRef: plan.projectRef, repoRoot: root, endpoint: { ...requireCurrentHostedMigrationEndpoint(input.endpoint,currentProvider,expected.fingerprints.migrationEndpointSha256), provenance: 'CALLER_SUPPLIED_PROVIDER_METADATA' }, password: input.migrationPassword, certificate: { path: input.certificate.path, provenance: 'CALLER_SUPPLIED_OWNED_PATH' }, toolchain: input.toolchain });
    const database = await createHostedMigrationDatabase({ repoRoot: root, projectRef: plan.projectRef, databaseUrl: connection.publicRecipe.databaseUrl, certificate: input.certificate, password: input.migrationPassword });
    const consumed: HeldHostedMigrationStage[] = [];
    let held = false, entered = false, completed = false;
    const executeStage = async (stage: HostedMigrationWorkdirs['stages'][number], artifact: Awaited<ReturnType<typeof admitHostedMigrationStageFiles>>, current: { kind: 'HELD'; id: string; key: string }) => {
    const identity: HostedExecutionJournal['identity'] = { projectRef: plan.projectRef, sourceSha: expected.releaseSha, treeSha: expected.treeSha, planSha256: artifact.planSha256, stageId: stage.id, stageSha256: artifact.stageSha256, databaseUrl: connection.publicRecipe.databaseUrl, approvalDigest: prepared.sha256, ciRunId: expected.ciRunId, certificateSha256: input.certificate.sha256 };
    const journalRoot = join(root, '.local/hosted-release', 'journal-' + plan.projectRef + '-' + stage.id + '-' + hash(JSON.stringify(identity)).slice(0, 32));
    let phase: 'before' | 'after' = 'before', originalCommitted = false, confirmedIntent = false, journalReady = false;
    const live = () => { if (!held || database.signal.aborted) throw failure(); return current; };
    const priorJournals = async () => {
      live(); const releaseRoot = join(root, '.local/hosted-release'); await physical(root, releaseRoot, 'directory'); const names = await readdir(releaseRoot); if (names.length > 1000) throw failure();
      for (const name of names.filter(name => name.startsWith('journal-'))) { const path = join(releaseRoot, name); if (path === journalRoot && journalReady) continue; await physical(root, path, 'directory'); const owner = ownerSchema.parse(own(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(await boundedFile(root, join(path, 'owner.json'), 48 * 1024))))); const prior = await createHostedMigrationJournal({ repoRoot: root, journalRoot: path, identity: owner.identity }); const saved = await prior.readJournal(); live(); if (owner.identity.projectRef === plan.projectRef && (saved === null || (saved as HostedExecutionJournal).state !== 'COMMITTED')) throw failure(); }
    };
    const inventory = async (expectedVersions: string[]) => { live(); await storagePolicy(); const result = inventorySchema.parse(own(await readHostedOperatorStorageInventory({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, providerToken: input.providerToken, storageKey: input.journalStorageKey, identity, expectedVersions: [...expectedVersions] }))); live(); fresh(result.observedAtMs); fresh(result.completedAtMs); if (result.projectRef !== identity.projectRef || result.sourceSha !== identity.sourceSha || result.treeSha !== identity.treeSha || result.approvalDigest !== identity.approvalDigest || result.ciRunId !== identity.ciRunId || result.planSha256 !== identity.planSha256 || result.stageId !== identity.stageId || result.stageSha256 !== identity.stageSha256 || result.expectedVersionsSha256 !== hash(JSON.stringify([...expectedVersions].sort())) || result.totalStorageObjects !== result.verifiedOperatorObjects || result.operations.reduce((count, operation) => count + operation.objectCount, 0) !== result.verifiedOperatorObjects || new Set(result.operations.map(operation => operation.operation)).size !== result.operations.length || result.startedAtMs > result.bytesVerificationStartedAtMs || result.bytesVerificationStartedAtMs > result.bytesVerifiedAtMs || result.bytesVerifiedAtMs > result.countsVerifiedAtMs || result.countsVerifiedAtMs > result.completedAtMs || result.observedAtMs !== Math.min(result.bytesVerificationStartedAtMs, result.countsVerifiedAtMs)) throw failure(); const ownOperation = hash(JSON.stringify(identity)); for (const operation of result.operations) { if (operation.operation !== operation.identitySha256) throw failure(); if (operation.operation !== ownOperation && operation.state !== 'COMMITTED') throw failure(); if (operation.operation === ownOperation && (originalCommitted ? operation.state !== 'COMMITTED' : !confirmedIntent || operation.state !== 'INTENT')) throw failure(); } if ((originalCommitted || confirmedIntent) && !result.operations.some(operation => operation.operation === ownOperation)) throw failure(); return result; };
    const revalidate = async () => {
      const held = live(); await priorJournals(); const authority = await official(), currentProvider = await provider(); const officialObservedAt = Date.parse(authority.observedAt); fresh(officialObservedAt); const checkedToolchain = await toolchain(); if (!same(checkedToolchain, manifest)) throw failure(); const files = await admitHostedMigrationStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage }); live(); if (files.planSha256 !== identity.planSha256 || files.stageSha256 !== identity.stageSha256) throw failure();
      const target = targetSchema.parse(own(await database.observeTarget())); fresh(target.observedAtMs); live(); const expectedVersions = phase === 'before' ? stage.expectedBeforeVersions : stage.expectedAfterVersions; const storage = await inventory(expectedVersions);
      const history = verifyHostedMigrationHistory({ sources: files.sources, included: stage.included, expectedVersions, history: target.historyPresent ? target.history : null });
      if (!target.historyPresent && target.history.length || target.authUsers !== 0 || target.storageObjects !== storage.totalStorageObjects || target.schools !== (expectedVersions.length ? 0 : null) || !same([...target.appSchemas].sort(), expectedVersions.length ? ['app', 'authorization', 'internal'] : []) || !same([...target.runtimeRoles].sort(), expectedVersions.length ? ['cuevo_api', 'cuevo_worker'] : []) || target.tls.host !== new URL(identity.databaseUrl).hostname || target.tls.certificateSha256 !== identity.certificateSha256) throw failure();
      const post = postSchema.parse(own(await database.observeStage({ stageId: stage.id, expectedAfterVersions: [...expectedVersions] }))); fresh(post.observedAtMs); live(); if (post.stageId !== stage.id) throw failure();
      const capability: Record<typeof checkNames[number], boolean> = { foundation: expectedVersions.includes('20260930234201'), rls: expectedVersions.includes('20260930234201'), privateRelations: expectedVersions.includes('20260930234201'), privateFunctions: expectedVersions.includes('20260930234201'), runtimeRoles: expectedVersions.includes('20260930234201'), nativeSourceBridge: expectedVersions.includes('20261002021737'), curriculumLifecycle: expectedVersions.includes('20261002021206'), dispatchInactive: expectedVersions.includes('20261002122236'), analyticsInactive: expectedVersions.includes('20261002182213'), recoveryCronInactive: true, transportPrivate: expectedVersions.includes('20261005132902') };
      for (const name of checkNames) if (post.checks[name] !== (capability[name] ? true : null)) throw failure();
      // Complete official/source admission precedes these actual observations.
      // Cheap current artifact/lock checks cannot restamp their freshness.
      await storagePolicy(); const finalToolchain = await toolchain(); if (!same(finalToolchain, manifest)) throw failure();
      const finalFiles = await admitHostedMigrationStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage }); live();
      if (finalFiles.planSha256 !== identity.planSha256 || finalFiles.stageSha256 !== identity.stageSha256) throw failure();
      validatePreparedBackendReleaseIntent(prepared, { ...expected, now: Date.now() });
      fresh(officialObservedAt); fresh(currentProvider.observedAtMs); fresh(target.observedAtMs); fresh(post.observedAtMs); fresh(storage.observedAtMs);
      return { kind: 'ADMITTED', observedAtMs: Math.min(officialObservedAt, currentProvider.observedAtMs, target.observedAtMs, post.observedAtMs, storage.observedAtMs), source: { sha: expected.releaseSha, tree: expected.treeSha, currentMainSha: expected.releaseSha, ciRunId: expected.ciRunId }, project: { ref: plan.projectRef, host: target.tls.host, port: 5432, database: target.database, operator: target.operator }, approval: { purpose: 'BACKEND_SYNTHETIC_STAGING', digest: prepared.sha256, expiresAtMs }, artifact: { stageSha256: files.stageSha256 }, tls: { kind: 'PEER_VERIFIED', host: target.tls.host, certificateSha256: target.tls.certificateSha256 }, lock: { id: held.id, key: held.key }, history: history.history, postconditions: phase === 'after' ? 'SATISFIED' : 'NOT_CHECKED' };
    };
    await priorJournals(); const journal = await createHostedMigrationDurableJournal({ repoRoot: root, journalRoot, identity, projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, storageKey: input.journalStorageKey, providerToken: input.providerToken }); journalReady = true;
    const ports: Omit<HostedExecutionPorts, 'withLock'> = {
      now: Date.now,
      readJournal: async () => { live(); if (!journal) throw failure(); const saved = await journal.readJournal(); live(); if (!stage.pending.length && (saved === null || (saved as HostedExecutionJournal).state !== 'COMMITTED')) throw failure(); if (saved !== null && (saved as HostedExecutionJournal).state === 'COMMITTED') { phase = 'after'; originalCommitted = true; } return saved; },
      writeJournal: async value => { if (!journal) throw failure(); const receipt = await journal.writeJournal(value); if (receipt.kind === 'SYNCED' && receipt.sha256 === hash(JSON.stringify(value)) && value.state === 'INTENT') confirmedIntent = true; return receipt; }, revalidate,
      runCli: async (args, env) => {
        const held = live(); if (!stage.pending.length || phase !== 'before') throw failure();
        // The held-stage core's earlier admission may precede durable intent I/O.
        // Read actual source/history/target again immediately for this original CLI.
        const current = await revalidate(); live(); fresh(current.observedAtMs);
        if (current.source.sha !== identity.sourceSha || current.source.tree !== identity.treeSha || current.source.currentMainSha !== identity.sourceSha || current.source.ciRunId !== identity.ciRunId
          || current.project.ref !== identity.projectRef || current.project.host !== new URL(identity.databaseUrl).hostname || current.project.port !== 5432 || current.project.database !== 'postgres' || current.project.operator !== 'postgres'
          || current.approval.digest !== identity.approvalDigest || current.approval.expiresAtMs <= Date.now() || current.artifact.stageSha256 !== identity.stageSha256
          || current.tls.host !== current.project.host || current.tls.certificateSha256 !== identity.certificateSha256 || current.lock.id !== held.id || current.lock.key !== held.key
          || !same(current.history.map(row => row.version).sort(), stage.expectedBeforeVersions) || current.history.some(row => stage.included.find(source => source.version === row.version)?.sha256 !== row.sourceReceiptSha256)) throw failure();
        const processPort = await createHostedMigrationNativeProcess({ repoRoot: root, projectRef: plan.projectRef, workdir: stage.workdir, databaseUrl: connection.publicRecipe.databaseUrl, certificate: input.certificate, cli: manifest.cli, timeoutMs: 300000 },
          { signal: database.signal, notAfterMs: Math.min(current.observedAtMs + 30000, current.approval.expiresAtMs) });
        live(); fresh(current.observedAtMs); if (current.approval.expiresAtMs <= Date.now()) throw failure();
        const result = await processPort.runCli(args, env); live(); phase = 'after'; return result;
      },
    };
    const core = prepareHeldHostedMigrationStage({ prepared: { projectRef: plan.projectRef, sourceSha: expected.releaseSha, treeSha: expected.treeSha, planSha256: artifact.planSha256, stage }, connection, approvalDigest: prepared.sha256, repoRoot: root, ciRunId: expected.ciRunId, certificateSha256: input.certificate.sha256 }, ports);
    consumed.push(core); await core.run(current, () => held && !database.signal.aborted);
    output.stages.push({ status: core.result.status, evidence: 'NATIVE_ADAPTER_STAGE_EXECUTION', schemaHistoryAtomic: false, hostedAcceptance: false, protocol: core.result, compositionCode: null });
    return core.result.status;
    };
    try {
      const released = await database.withLock(`${plan.projectRef}:HOSTED_SCHEMA_MIGRATION`, async current => {
        if (entered) throw failure(); entered = true; held = true;
        try { for (const [index, stage] of stages.entries()) if (await executeStage(stage, artifacts[index], current) === 'REQUIRES_REVIEW') break; completed = true; }
        finally { held = false; }
      });
      if (!entered || !completed || released.kind !== 'RELEASED') throw failure();
    } catch {
      held = false;
      if (entered) { output.cleanupCode = 'LOCK_RELEASE_UNCONFIRMED'; for (const core of consumed) await core.releaseUnconfirmed(); }
      return structuredClone({ ...output, stages: output.stages.map(stage => ({ ...stage, status: stage.protocol?.status ?? stage.status })) });
    }
    output.compositionCode = null;
    output.status = output.stages.length !== stages.length || output.stages.some(stage => stage.status === 'REQUIRES_REVIEW') ? 'REQUIRES_REVIEW' : output.stages.every(stage => stage.status === 'NOOP') ? 'NOOP' : 'COMMITTED';
    return structuredClone(output);
  } catch { return output; }
}

/** Native single-stage compatibility path, using the same actual session owner. */
export async function executeNativeHostedMigrationStage(value: unknown): Promise<NativeHostedMigrationStageResult> {
  const result = await executeNativeStages(value, false);
  return result.stages[0] ?? { status: 'REQUIRES_REVIEW', evidence: 'NATIVE_ADAPTER_STAGE_EXECUTION', schemaHistoryAtomic: false, hostedAcceptance: false, protocol: null, compositionCode: 'PREFLIGHT_UNCONFIRMED' };
}

/** Four verified replay stages under one actual PostgreSQL session lock. */
export async function executeNativeHostedMigrations(value: unknown): Promise<NativeHostedMigrationAggregateResult> { return executeNativeStages(value, true); }
