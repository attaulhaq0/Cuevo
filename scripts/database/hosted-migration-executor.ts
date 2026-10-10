import {validateSchemaRecoveryCompletionExport} from '../verification/backend-schema-completion-admission';
import {hostedMigrationNativeDiagnosticsSchema,type HostedMigrationNativeDiagnostics} from './hosted-migration-diagnostics';
import {reconciliationTemplateFingerprint} from './hosted-schema-reconciliation';
import {parseOriginalNativeIntentTemplate,originalNativeIntentFingerprint,validateOriginalNativeIntentPackageCompatibility} from './hosted-original-native-intent';
import {parseOriginalChildRecoveryTemplate,originalChildCatalogueReferenceSchema,originalChildRecoveryFingerprint,validateOriginalChildRecoveryPackageCompatibility} from './hosted-original-child-recovery';
import {prepareHostedSchemaRecoveryCompletion,type HostedSchemaRecoveryCompletion} from './hosted-schema-recovery-completion';
import type {ReconciliationReceipt} from './hosted-schema-reconciliation';
import {unknownPrefixCataloguePolicySha256} from './hosted-schema-reconciliation-policy';
import cataloguePolicy from './unknown-prefix-catalogue-policy.json';
import {createHostedMigrationBatchWorkdirs,type HostedMigrationBatchWorkdir} from './hosted-migration-workdirs';
import {admitHostedMigrationBatchFiles} from './hosted-migration-stage-files';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import {readBackendReleaseAdmission,prepareNativeBackendReleaseAdmission,readNativeBackendReleaseAdmission,disposeNativeBackendReleaseAdmission,type NativeBackendAdmissionHandle} from '../verification/backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from '../verification/backend-release-contracts';
import { canonicalHostedMigrationPlan, verifyCompletedMigrationPrefix, verifyPriorSchemaPrefix, readVerifiedPriorSchemaSources, readHistoricalMigrationSources, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { prepareHostedMigrationConnection } from './hosted-migration-connection';
import { prepareHeldHostedMigrationStage,prepareHeldOriginalNativeIntentStage,type NativeOriginalIntentExecution, type HeldHostedMigrationStage } from './hosted-migration-execution';
import {originalIntentExecutionSchema,hostedExecutionJournalSchema,parseHostedExecutionJournal,type HostedExecutionJournal,type HostedExecutionPorts,type HostedExecutionResult} from './hosted-migration-journal-contracts';
import { createHostedMigrationDatabase,assertNativeReconciliationPermit,readNativeMigrationPermitAuthority,readNativeSchemaStageAdmission,readNativeOriginalIntentExecutionBinding,type NativeReconciliationPermit } from './hosted-migration-database';
import { createHostedMigrationNativeProcess,HostedMigrationNativePreparationError } from './hosted-migration-native-process';
import { createHostedMigrationJournal } from './hosted-migration-journal';
import { createHostedMigrationDurableJournal } from './hosted-migration-durable-journal';
import { readHostedOperatorStorageInventory } from './hosted-operator-storage-inventory';
import { validateHostedOperatorStoragePolicy } from './hosted-operator-storage-policy';
import { admitHostedMigrationStageFiles,admitInstalledMigrationStageMetadata } from './hosted-migration-stage-files';
import { verifyHostedMigrationHistory } from './hosted-migration-history';
import { readHostedMigrationProvider, hostedMigrationEndpointSchema, requireCurrentHostedMigrationEndpoint } from './hosted-migration-provider';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import { validateHostedReferencePopulation } from './hosted-reference-population';

const failure = () => Error('Native migration composition requires review; contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/);
const stageId = z.enum(['prefix', 'native', 'pre-observability', 'remaining']);
const secret = z.string().min(1).max(24576).refine(value => value.trim().length > 0 && [...value].every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127));
const originalEvidenceSchema=z.object({selectionPath:z.string(),selectionSha256:digest,resultArchivePath:z.string(),resultArchiveSha256:digest,packageArchivePath:z.string(),packageArchiveSha256:digest}).strict();
const inputSchema = z.object({ repoRoot: z.string(), endpoint: hostedMigrationEndpointSchema, plan: z.unknown(), stage: z.unknown(), preparedApproval: z.unknown(), expected: z.unknown(),schemaRecoveryExport:z.unknown().optional(),schemaRecoverySelection:z.unknown().optional(),originalNativeIntentTemplate:z.unknown().optional(),originalNativeIntentEvidence:originalEvidenceSchema.optional(),originalChildRecoveryTemplate:z.unknown().optional(),originalChildCatalogueReference:originalChildCatalogueReferenceSchema.optional(),originalChildRecoveryEvidence:originalEvidenceSchema.optional(), certificate: z.object({ path: z.string(), sha256: digest }).strict(), toolchainManifestPath: z.string(), operatorStoragePolicyPath: z.string(), journalStorageKey: z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_')), githubToken: secret, providerToken: secret, migrationPassword: secret, toolchain: z.record(z.string(), z.string()) }).strict();
const manifestSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_MIGRATION_TOOLCHAIN'), sourceSha: sha, treeSha: sha, sourceLockSha256: digest, cliVersion: z.literal('2.119.0'), platform: z.string(), cli: z.object({ shimSha256: digest, binarySha256: digest, sidecarSha256: digest }).strict() }).strict();
const identitySchema = z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), sourceSha: sha, treeSha: sha, planSha256: digest, stageId, stageSha256: digest, databaseUrl: z.string(), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/), certificateSha256: digest }).strict();
const ownerSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL'), identity: identitySchema }).strict();
const row = z.object({ name: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/), version: z.string().regex(/^\d{14}$/), sha256: digest }).strict();
const stageSchema = z.object({ id: stageId, workdir: z.string(), included: z.array(row).min(1).max(1000), pending: z.array(row).max(1000), expectedBeforeVersions: z.array(z.string().regex(/^\d{14}$/)).max(1000), expectedAfterVersions: z.array(z.string().regex(/^\d{14}$/)).max(1000), configSha256: digest, commandArgs: z.array(z.string()).max(30),materialization:z.enum(['SQL_FILES','METADATA_ONLY']).optional() }).strict();
const checkNames = ['foundation', 'rls', 'privateRelations', 'privateFunctions', 'runtimeRoles', 'nativeSourceBridge', 'curriculumLifecycle', 'dispatchInactive', 'analyticsInactive', 'recoveryCronInactive', 'transportPrivate'] as const;
const checksSchema = z.object(Object.fromEntries(checkNames.map(name => [name, z.boolean().nullable()])) as Record<typeof checkNames[number], z.ZodNullable<z.ZodBoolean>>).strict();
const postSchema = z.object({ observedAtMs: z.number().int().nonnegative(), stageId, checks: checksSchema }).strict();
const targetSchema = z.object({ observedAtMs: z.number().int().nonnegative(), operator: z.literal('postgres'), database: z.literal('postgres'), serverVersion: z.number().int().min(170000).max(179999), tls: z.object({ kind: z.literal('PEER_VERIFIED'), host: z.string(), certificateSha256: digest, peerCertificateSha256: digest, protocol: z.enum(['TLSv1.2', 'TLSv1.3']) }).strict(), historyPresent: z.boolean(), history: z.array(z.object({ version: z.string().regex(/^\d{14}$/), name: z.string(), statements: z.array(z.string()) }).strict()).max(1000), authUsers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), storageObjects: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), appSchemas: z.array(z.string()).max(3), runtimeRoles: z.array(z.string()).max(2), schools: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable() }).strict();
const observedTime = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const inventorySchema = z.object({ evidence: z.literal('VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY'), projectRef: z.string(), sourceSha: sha, treeSha: sha, approvalDigest: digest, ciRunId: z.string(), planSha256: digest, stageId, stageSha256: digest, expectedVersionsSha256: digest, observedAtMs: observedTime, startedAtMs: observedTime, bytesVerificationStartedAtMs: observedTime, bytesVerifiedAtMs: observedTime, countsVerifiedAtMs: observedTime, completedAtMs: observedTime, totalStorageObjects: z.number().int().nonnegative().max(1000), verifiedOperatorObjects: z.number().int().nonnegative().max(1000), applicationStorageObjects: z.literal(0), bucketMetadataSha256: digest, objectSetSha256: digest, remoteProjectSha256: digest, operations: z.array(z.object({ operation: digest, state: z.enum(['INTENT', 'COMMITTED', 'REQUIRES_REVIEW', 'OWNER_ONLY']), identity:identitySchema.optional(), identitySha256: digest, chainSha256: digest, objectCount: z.number().int().min(1).max(4) }).strict()).max(1000) }).strict();

const admissionPhases=['STORAGE_CAPABILITY','PRIOR_JOURNALS','OFFICIAL_AUTHORITY','PROVIDER','TOOLCHAIN','SOURCE_FILES','TARGET','OPERATOR_INVENTORY','HISTORY_AND_SCOPE','POPULATION','POSTCONDITIONS','FINAL_SOURCE','FINAL_FRESHNESS'] as const;
type AdmissionFailure={phase:typeof admissionPhases[number];durationMs:number;agesMs:{official:number|null;provider:number|null;target:number|null;postconditions:number|null;inventory:number|null}};
const initialJournalReadFailureSchema=z.object({boundary:z.enum(['BEFORE_JOURNAL_CONSTRUCTION','FIRST_JOURNAL_READ']),phase:z.enum(['NATIVE_ADMISSION_RENEWAL','ORIGINAL_JOURNAL_CONSTRUCTION','ORIGINAL_JOURNAL_READ']),durationMs:z.number().int().min(0).max(86400000),startedAtMs:observedTime.optional(),completedAtMs:observedTime.optional()}).strict();
type InitialJournalReadFailure=z.infer<typeof initialJournalReadFailureSchema>;
const compositionPhases=['INPUT','PREPARED','RECOVERY_SCOPE','PRIOR_SOURCE','PLAN_BINDING','OFFICIAL_AUTHORITY','PROVIDER','TOOLCHAIN','STORAGE_POLICY','STAGE_FILES','CONNECTION_RECIPE','DATABASE_FACTORY','LEASE','RECONCILIATION','CONTINUATION','STAGE_CORE','INSTALLED_SCHEMA_MARKER','COMPLETION'] as const;
const processFailureSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_NATIVE_MIGRATION_PREPARATION_FAILURE'),phase:z.enum(['SUPERVISOR','BASE','BUILD','IMAGE','CREATE','INSPECT']),ownerId:z.uuid(),cleanup:z.enum(['UNCONFIRMED','CONFIRMED_STOPPED'])}).strict();
const compositionFailureSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_MIGRATION_COMPOSITION_FAILURE'),phase:z.enum(compositionPhases),durationMs:z.number().int().min(0).max(86400000),leaseCallbackEntered:z.boolean(),native:hostedMigrationNativeDiagnosticsSchema.nullable(),process:processFailureSchema.optional(),processCleanup:z.literal('UNCONFIRMED').optional()}).strict();
type CompositionFailure=z.infer<typeof compositionFailureSchema>;
const committedSchemaSnapshotSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_ACKNOWLEDGED_SCHEMA_COMMIT'),protocol:z.object({status:z.literal('COMMITTED'),commitment:z.literal('CONFIRMED'),schemaHistoryAtomic:z.literal(false),evidence:z.literal('SUPPLIED_PORT_EXECUTION_ONLY'),execution:z.literal('INJECTED_PORTS'),primaryCode:z.null(),journalCode:z.null(),cleanupCode:z.null(),identity:identitySchema,originalIntentExecution:originalIntentExecutionSchema.optional()}).strict().superRefine((value,context)=>{if(value.originalIntentExecution&&!hostedExecutionJournalSchema.safeParse({version:2,identity:value.identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:value.originalIntentExecution}).success)context.addIssue({code:'custom',message:'Original native execution linkage requires review.'});}),journalAcknowledgement:z.object({kind:z.literal('SYNCED'),sha256:digest}).strict(),completedAt:z.null()}).strict();
type CommittedSchemaSnapshot=z.infer<typeof committedSchemaSnapshotSchema>;
export const hostedMigrationChildExecutionSchema=z.object({index:z.number().int().positive().max(1000),batchSha256:digest,beforeCount:z.number().int().nonnegative().max(1000),afterCount:z.number().int().positive().max(1000),beforeHistorySha256:digest,afterHistorySha256:digest,cli:z.object({kind:z.literal('EXITED'),exitCode:z.literal(0)}).strict(),exitedAtMs:observedTime,receipt:z.enum(['UNCONFIRMED','CONFIRMED'])}).strict().superRefine((value,context)=>{if(value.afterCount<=value.beforeCount||value.afterCount-value.beforeCount>20)context.addIssue({code:'custom',message:'Original child exit requires its bounded source transition.'});});
export type HostedMigrationChildExecution=z.infer<typeof hostedMigrationChildExecutionSchema>;
type InstalledSchemaMarkerFailure={version:1;purpose:'CUEVO_INSTALLED_SCHEMA_MARKER_OUTCOME';status:'UNKNOWN'};
export type NativeHostedMigrationStageResult = { status: HostedExecutionResult['status']; evidence: 'NATIVE_ADAPTER_STAGE_EXECUTION'; schemaHistoryAtomic: false; hostedAcceptance: false; protocol: HostedExecutionResult | null; compositionCode: 'PREFLIGHT_UNCONFIRMED' | null;compositionFailure?:CompositionFailure; admissionFailure?:AdmissionFailure;initialJournalReadFailure?:InitialJournalReadFailure;committedSchema?:CommittedSchemaSnapshot;installedSchemaMarker?:InstalledSchemaMarkerFailure;recoveryCompletion?:HostedSchemaRecoveryCompletion;childExecutions?:HostedMigrationChildExecution[];installedVerification?: {version:1;purpose:'CUEVO_INSTALLED_MIGRATION_REVALIDATION';identity:HostedExecutionJournal['identity'];historySha256:string;remoteProjectSha256:string;installedPopulationSha256?:string;observedAt:string} };
export type NativeHostedMigrationAggregateResult = { status: HostedExecutionResult['status']; evidence: 'NATIVE_ADAPTER_AGGREGATE_EXECUTION'; schemaHistoryAtomic: false; hostedAcceptance: false; stages: NativeHostedMigrationStageResult[]; cleanupCode: 'LOCK_RELEASE_UNCONFIRMED' | null; compositionCode: 'PREFLIGHT_UNCONFIRMED' | null;compositionFailure?:CompositionFailure;recoveryCompletion?:HostedSchemaRecoveryCompletion };
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
function committedSchemaSnapshot(protocol:HostedExecutionResult,journalAcknowledgement:{kind:'SYNCED';sha256:string}|undefined):CommittedSchemaSnapshot{
  // This is an original acknowledged protocol fact, not a completion receipt.
  // The core did not record a historical completion clock; it remains unknown.
  const parsed=committedSchemaSnapshotSchema.parse(own({version:1,purpose:'CUEVO_ACKNOWLEDGED_SCHEMA_COMMIT',protocol,journalAcknowledgement,completedAt:null}));
  if(parsed.protocol.originalIntentExecution){Object.freeze(parsed.protocol.originalIntentExecution.currentExecutionIdentity);Object.freeze(parsed.protocol.originalIntentExecution);}
  Object.freeze(parsed.protocol.identity);Object.freeze(parsed.protocol);Object.freeze(parsed.journalAcknowledgement);return Object.freeze(parsed);
}

/** Trusted operator-host composition only. It has no CLI entrypoint or injected
 * proof ports; durable cross-run CI retention and hosted acceptance are separate. */
async function executeNativeStages(value: unknown, aggregate: boolean): Promise<NativeHostedMigrationAggregateResult> {
  const output: NativeHostedMigrationAggregateResult = { status: 'REQUIRES_REVIEW', evidence: 'NATIVE_ADAPTER_AGGREGATE_EXECUTION', schemaHistoryAtomic: false, hostedAcceptance: false, stages: [], cleanupCode: null, compositionCode: 'PREFLIGHT_UNCONFIRMED' };
  const began=performance.now();let admissionHandle:NativeBackendAdmissionHandle|undefined;
  let compositionPhase:typeof compositionPhases[number]='INPUT',leaseCallbackEntered=false,databaseDiagnostics:(()=>unknown)|undefined,processFailure:z.infer<typeof processFailureSchema>|undefined,processCleanupUnconfirmed=false;
  const retainFailure=()=>{
    let native:HostedMigrationNativeDiagnostics|null=null;
    try{const value=databaseDiagnostics?.();if(value!==undefined)native=hostedMigrationNativeDiagnosticsSchema.parse(own(value));}catch{/* Unavailable diagnostics remain unknown. */}
    const elapsed=performance.now()-began;
    // Preserve the first composition failure even if cleanup subsequently fails.
    // A monotonic duration is diagnostic metadata, never a freshness clock.
    output.compositionFailure??=compositionFailureSchema.parse({version:1,purpose:'CUEVO_MIGRATION_COMPOSITION_FAILURE',phase:compositionPhase,durationMs:Number.isFinite(elapsed)?Math.min(86400000,Math.max(0,Math.trunc(elapsed))):0,leaseCallbackEntered,native:null});
    output.compositionFailure.native=native;
    if(processFailure)output.compositionFailure.process=processFailure;
    if(processCleanupUnconfirmed)output.compositionFailure.processCleanup='UNCONFIRMED';
  };
  try {
    const supplied = own(value) as Record<string, unknown>;
    const selected = aggregate ? inputSchema.omit({ stage: true }).extend({ stages: z.array(stageSchema).length(4) }).strict().parse(supplied) : inputSchema.parse(supplied);
    const stages = ('stages' in selected ? selected.stages : [stageSchema.parse((selected as z.infer<typeof inputSchema>).stage)]) as HostedMigrationWorkdirs['stages'];
    const input = selected, root = input.repoRoot, plan = JSON.parse(canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1).json) as HostedMigrationPlanV1;
    if(plan.runtimeOnly)throw failure();
    compositionPhase='PREPARED';const expected = own(input.expected) as BackendReleaseExpected&{installedSchema?:{sourceSha:string;treeSha:string;migrationCount:number}}, prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }) as PreparedBackendReleaseIntent;
    const metadataOnly=stages.some(stage=>stage.materialization==='METADATA_ONLY');
    if(metadataOnly&&(!aggregate||stages.some(stage=>stage.materialization!=='METADATA_ONLY'||stage.pending.length)||expected.executionScope!=='complete-backend'||!expected.installedSource||expected.installedSchema||!plan.priorCompletedRelease||plan.pending.length||plan.applied.length!==plan.migrations.length||plan.stages.some(stage=>stage.names.length)||plan.reconciliationTemplate||expected.installedSource.migrationCount!==plan.migrations.length))throw failure();
    const admitStageFiles=metadataOnly?admitInstalledMigrationStageMetadata:admitHostedMigrationStageFiles;
    const installedSchema=expected.installedSchema;
    const reconciliation=plan.reconciliationTemplate;
    const continuation=expected.schemaRecovery,originalTemplate=plan.reconciliationTemplate??(input.schemaRecoveryExport?validateSchemaRecoveryCompletionExport(input.schemaRecoveryExport,Date.now()).template:undefined);
    const selectedOriginalIntent=input.originalNativeIntentTemplate===undefined?undefined:parseOriginalNativeIntentTemplate(input.originalNativeIntentTemplate);
    const selectedOriginalChild=input.originalChildRecoveryTemplate===undefined?undefined:parseOriginalChildRecoveryTemplate(input.originalChildRecoveryTemplate);
    compositionPhase='RECOVERY_SCOPE';if(continuation&&(reconciliation||!input.schemaRecoveryExport||continuation.completionExportSha256!==hash(canonicalReleaseExecutionJson(input.schemaRecoveryExport))))throw failure();
    if(Boolean(selectedOriginalIntent)!==Boolean(input.originalNativeIntentEvidence)||Boolean(selectedOriginalIntent)!==Boolean(expected.originalNativeIntentRecovery))throw failure();
    if(selectedOriginalIntent&&(!aggregate||metadataOnly||expected.executionScope!=='schema-and-accounts'||!continuation||reconciliation||!installedSchema||installedSchema.migrationCount!==123||plan.applied.length!==123||!same(expected.originalNativeIntentRecovery,originalNativeIntentFingerprint(selectedOriginalIntent))))throw failure();
    if(Boolean(selectedOriginalChild)!==Boolean(input.originalChildRecoveryEvidence)||Boolean(selectedOriginalChild)!==Boolean(input.originalChildCatalogueReference)||Boolean(selectedOriginalChild)!==Boolean(expected.originalChildRecovery)||Boolean(selectedOriginalChild)!==Boolean(plan.originalChildRecovery))throw failure();
    if(selectedOriginalChild&&(!aggregate||metadataOnly||selectedOriginalIntent||expected.executionScope!=='schema-and-accounts'||!continuation||reconciliation||installedSchema?.migrationCount!==124||plan.applied.length!==144||!same(expected.originalChildRecovery,{...originalChildRecoveryFingerprint(selectedOriginalChild),catalogueReferenceSha256:hash(canonicalReleaseExecutionJson(input.originalChildCatalogueReference))})||!same(plan.originalChildRecovery!.template,selectedOriginalChild)||!same(plan.originalChildRecovery!.catalogueReference,input.originalChildCatalogueReference)))throw failure();
    if(reconciliation){if(expected.executionScope!=='reconcile-schema'||!same(expected.reconciledPrefix,reconciliationTemplateFingerprint(reconciliation))||!installedSchema||installedSchema.migrationCount!==120||aggregate||stages.length!==1||stages[0].id!=='prefix'||stages[0].pending.length!==3)throw failure();}else if(expected.executionScope==='reconcile-schema')throw failure();
    if(installedSchema&&(expected.installedSource||!plan.priorSchemaRelease||!same(installedSchema,plan.priorSchemaRelease)))throw failure();
    compositionPhase='PRIOR_SOURCE';const verifiedPriorSource=installedSchema?readVerifiedPriorSchemaSources(root,plan):null;
    const originalSchemaBlobs=new Map<string,Uint8Array>();
    const originalSchemaSource=installedSchema?(()=>{if(!verifiedPriorSource)throw failure();for(const source of verifiedPriorSource)originalSchemaBlobs.set(source.name,source.bytes);return replayPlan([...originalSchemaBlobs].map(([name,bytes])=>({name,bytes})));})():undefined;
    compositionPhase='PLAN_BINDING';const body = own(JSON.parse(prepared.canonicalJson)) as { expiresAt: string }; const expiresAtMs = Date.parse(body.expiresAt);
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
    const requireOfficial = (result:Awaited<ReturnType<typeof readBackendReleaseAdmission>>) => { if (result.provenance !== 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' || result.approval.packageSha256 !== prepared.sha256 || result.expected.releaseSha !== expected.releaseSha || result.expected.treeSha !== expected.treeSha || result.expected.ciRunId !== expected.ciRunId || !same(result.expected.fingerprints, expected.fingerprints)) throw failure(); return result; };
    const admissionBinding={effectScope:'SCHEMA_AND_SYNTHETIC_AUTH' as const,repoRoot:root,prepared,expected};const official = async () => {if(!admissionHandle)throw failure();return requireOfficial(await readNativeBackendReleaseAdmission(admissionHandle,admissionBinding));};
    const provider = async () => { const result = await readHostedMigrationProvider({ projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, providerToken: input.providerToken }); fresh(result.observedAtMs); if (result.evidence !== 'OFFICIAL_SUPABASE_PROJECT_METADATA' || result.projectRef !== plan.projectRef || result.projectName.toLowerCase() !== 'cuevo' || result.projectStatus !== 'ACTIVE_HEALTHY' || result.directEndpoint.projectRef !== plan.projectRef || result.directEndpoint.host !== `db.${plan.projectRef}.supabase.co` || result.directEndpoint.kind !== 'direct' || result.directEndpoint.port !== 5432 || result.directEndpoint.database !== 'postgres') throw failure(); requireCurrentHostedMigrationEndpoint(input.endpoint,result,expected.fingerprints.migrationEndpointSha256); return result; };
    compositionPhase='OFFICIAL_AUTHORITY';admissionHandle=await prepareNativeBackendReleaseAdmission({...admissionBinding,githubToken:input.githubToken});await official();compositionPhase='PROVIDER';const currentProvider = await provider();compositionPhase='TOOLCHAIN';const manifest = await toolchain();compositionPhase='STORAGE_POLICY';await storagePolicy();
    if(selectedOriginalIntent){
      const evidence=input.originalNativeIntentEvidence!;
      for(const[path,digest,maximum]of [[evidence.selectionPath,evidence.selectionSha256,8192],[evidence.resultArchivePath,evidence.resultArchiveSha256,2*1024*1024],[evidence.packageArchivePath,evidence.packageArchiveSha256,32*1024*1024]] as const){const part=relative(join(root,'.local/hosted-release'),path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();const bytes=await boundedFile(root,path,maximum),tracked=relative(root,path).replaceAll('\\','/');if(hash(bytes)!==digest||git(root,['check-ignore','--no-index','--stdin'],tracked+'\n').toString().trim()!==tracked||git(root,['ls-files','--cached','--',tracked]).length)throw failure();}
      if(evidence.selectionSha256!==hash(canonicalReleaseExecutionJson(selectedOriginalIntent.selection))||!same(JSON.parse((await boundedFile(root,evidence.selectionPath,8192)).toString('utf8')),selectedOriginalIntent.selection)||evidence.resultArchiveSha256!==selectedOriginalIntent.selection.resultArchiveSha256||evidence.packageArchiveSha256!==selectedOriginalIntent.selection.packageArchiveSha256)throw failure();
      validateOriginalNativeIntentPackageCompatibility(selectedOriginalIntent,{version:2,delivery:{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null},expected,plan,stages,migrationEndpoint:input.endpoint,toolchain:manifest});
    }
    if(selectedOriginalChild){const evidence=input.originalChildRecoveryEvidence!;for(const[path,digest,maximum]of [[evidence.selectionPath,evidence.selectionSha256,8192],[evidence.resultArchivePath,evidence.resultArchiveSha256,2*1024*1024],[evidence.packageArchivePath,evidence.packageArchiveSha256,32*1024*1024]] as const){const part=relative(join(root,'.local/hosted-release'),path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();const bytes=await boundedFile(root,path,maximum),tracked=relative(root,path).replaceAll('\\','/');if(hash(bytes)!==digest||git(root,['check-ignore','--no-index','--stdin'],tracked+'\n').toString().trim()!==tracked||git(root,['ls-files','--cached','--',tracked]).length)throw failure();}if(evidence.selectionSha256!==hash(canonicalReleaseExecutionJson(selectedOriginalChild.selection))||!same(JSON.parse((await boundedFile(root,evidence.selectionPath,8192)).toString('utf8')),selectedOriginalChild.selection)||evidence.resultArchiveSha256!==selectedOriginalChild.selection.resultArchiveSha256||evidence.packageArchiveSha256!==selectedOriginalChild.selection.packageArchiveSha256)throw failure();validateOriginalChildRecoveryPackageCompatibility(selectedOriginalChild,{version:2,delivery:{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null},expected,plan,stages,migrationEndpoint:input.endpoint,toolchain:manifest,originalChildCatalogueReference:input.originalChildCatalogueReference});}
    const artifacts: Awaited<ReturnType<typeof admitStageFiles>>[] = [];
    for (const stage of stages) {
      compositionPhase='STAGE_FILES';const artifact = await admitStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage });
      if (artifact.planSha256 !== expected.fingerprints.migrationPlanSha256 || artifact.stageSha256 !== hash(JSON.stringify({ included: stage.included.map(row => ({ name: row.name, version: row.version, sha256: row.sha256 })), configSha256: stage.configSha256 }))) throw failure();
      artifacts.push(artifact);
    }
    if (aggregate) {
      const replay = replayPlan(artifacts[0].sources), boundary = replay.remaining.indexOf(posthogIntelligenceMigration);
      const groups = [replay.before, [replay.prerequisite], replay.remaining.slice(0, boundary), replay.remaining.slice(boundary)], rows = [...replay.before, replay.prerequisite, ...replay.remaining].map(name => ({ name, version: name.slice(0, 14), sha256: hash(artifacts[0].sources.find(source => source.name === name)!.bytes) }));
      const boundaries = groups.map((_, index) => groups.slice(0, index + 1).flat().length), ids = ['prefix', 'native', 'pre-observability', 'remaining'];
      if (boundary < 0 || !same(rows, plan.migrations) || plan.applied.length && !boundaries.includes(plan.applied.length) && !plan.originalChildRecovery && !(plan.priorSchemaRelease?verifyPriorSchemaPrefix(root,plan):verifyCompletedMigrationPrefix(root,plan)) || new Set(stages.map(stage => stage.workdir)).size !== 4) throw failure();
      for (const [index, stage] of stages.entries()) {
        const included = rows.slice(0, Math.max(plan.applied.length, boundaries[index])), before = rows.slice(0, Math.max(plan.applied.length, index ? boundaries[index - 1] : 0)).map(row => row.version).sort();
        const pending = included.filter(row => !before.includes(row.version));
        if (stage.id !== ids[index] || !same(stage.included, included) || !same(stage.pending, pending) || !same(stage.expectedBeforeVersions, before) || !same(stage.expectedAfterVersions, included.map(row => row.version).sort()) || plan.stages[index].id !== ids[index] || !same(plan.stages[index].names, pending.map(row => row.name))) throw failure();
      }
    }
    compositionPhase='CONNECTION_RECIPE';const connection = prepareHostedMigrationConnection({ projectRef: plan.projectRef, repoRoot: root, endpoint: { ...requireCurrentHostedMigrationEndpoint(input.endpoint,currentProvider,expected.fingerprints.migrationEndpointSha256), provenance: 'CALLER_SUPPLIED_PROVIDER_METADATA' }, password: input.migrationPassword, certificate: { path: input.certificate.path, provenance: 'CALLER_SUPPLIED_OWNED_PATH' }, toolchain: input.toolchain });
    compositionPhase='DATABASE_FACTORY';const database = await createHostedMigrationDatabase({ repoRoot: root, projectRef: plan.projectRef, databaseUrl: connection.publicRecipe.databaseUrl, certificate: input.certificate, password: input.migrationPassword });
    const diagnosticMethod=Object.getOwnPropertyDescriptor(database,'getDiagnostics');
    if(diagnosticMethod&&'value'in diagnosticMethod&&typeof diagnosticMethod.value==='function')databaseDiagnostics=()=>diagnosticMethod.value.call(database);
    const consumed: HeldHostedMigrationStage[] = [];
    let held = false, entered = false, completed = false, installedSchemaMarkerFailed = false;
    let reconciliationPermit:NativeReconciliationPermit|undefined,reconciliationReceipt:ReconciliationReceipt|undefined;
    const executeStage = async (stage: HostedMigrationWorkdirs['stages'][number], artifact: Awaited<ReturnType<typeof admitStageFiles>>, current: { kind: 'HELD'; id: string; key: string }) => {
    const identity: HostedExecutionJournal['identity'] = { projectRef: plan.projectRef, sourceSha: expected.releaseSha, treeSha: expected.treeSha, planSha256: artifact.planSha256, stageId: stage.id, stageSha256: artifact.stageSha256, databaseUrl: connection.publicRecipe.databaseUrl, approvalDigest: prepared.sha256, ciRunId: expected.ciRunId, certificateSha256: input.certificate.sha256 };
    const originalIntent=stage.id==='native'?selectedOriginalIntent:undefined,journalIdentity=originalIntent?.originalIdentity??identity;
    let originalExecution:NativeOriginalIntentExecution|undefined;
    let batches:HostedMigrationBatchWorkdir[]|undefined;
    let activeBatch:HostedMigrationBatchWorkdir|undefined,batchPhase:'before'|'after'='before';
    const journalRoot = join(root, '.local/hosted-release', 'journal-' + plan.projectRef + '-' + stage.id + '-' + hash(JSON.stringify(journalIdentity)).slice(0, 32));
    let phase: 'before' | 'after' = 'before', originalCommitted = false, confirmedIntent = false, journalReady = false;
    let committedAcknowledgement:{kind:'SYNCED';sha256:string}|undefined;
    const live = () => { if (!held || database.signal.aborted) throw failure(); return current; };
    const selectedIntentFacts=()=>{
      if(!selectedOriginalIntent||!reconciliationPermit)return null;const facts=assertNativeReconciliationPermit(reconciliationPermit,identity).selectedOriginalIntent;
      if(!facts||!same(facts.identity,selectedOriginalIntent.originalIdentity)||facts.ownerSha256!==selectedOriginalIntent.ownerSha256||facts.record1Sha256!==selectedOriginalIntent.record1Sha256||facts.payloadSha256!==selectedOriginalIntent.originalIntentSha256)throw failure();return facts;
    };
    const selectedLocalIntent=async(path:string,ownerBytes:Buffer,saved:unknown)=>{
      const facts=selectedIntentFacts();if(!facts||!selectedOriginalIntent||path!==join(root,'.local/hosted-release','journal-'+plan.projectRef+'-native-'+selectedOriginalIntent.originalOperationSha256.slice(0,32))||!same((saved as HostedExecutionJournal)?.identity,facts.identity)||(saved as HostedExecutionJournal)?.version!==1||(saved as HostedExecutionJournal)?.state!=='INTENT'||hash(JSON.stringify(saved))!==facts.payloadSha256||!ownerBytes.equals(Buffer.from(selectedOriginalIntent.ownerJson))||!same((await readdir(path)).sort(),['owner.json','000001.record.json'].sort())||!(await boundedFile(root,join(path,'000001.record.json'),48*1024)).equals(Buffer.from(selectedOriginalIntent.record1Json)))return false;return true;
    };
    const priorJournals = async () => {
      live(); const releaseRoot = join(root, '.local/hosted-release'); await physical(root, releaseRoot, 'directory'); const names = await readdir(releaseRoot); if (names.length > 1000) throw failure();
      for (const name of names.filter(name => name.startsWith('journal-'))) { const path = join(releaseRoot, name); if (path === journalRoot && journalReady) continue; await physical(root, path, 'directory'); const ownerBytes=await boundedFile(root,join(path,'owner.json'),48*1024),owner = ownerSchema.parse(own(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(ownerBytes)))); const prior = await createHostedMigrationJournal({ repoRoot: root, journalRoot: path, identity: owner.identity }); const saved = await prior.readJournal(); live(); if (owner.identity.projectRef === plan.projectRef && (saved === null || (saved as HostedExecutionJournal).state !== 'COMMITTED')) {if(await selectedLocalIntent(path,ownerBytes,saved))continue;const permit=reconciliationPermit?assertNativeReconciliationPermit(reconciliationPermit,identity):null;const child=permit?.selectedOriginalChild;if(child&&selectedOriginalChild&&saved&&(saved as HostedExecutionJournal).state==='REQUIRES_REVIEW'&&same(owner.identity,child.identity)&&ownerBytes.equals(Buffer.from(selectedOriginalChild.ownerJson))){if(!same((await readdir(path)).sort(),['owner.json','000001.record.json','000002.record.json'].sort()))throw failure();for(const[index,text]of selectedOriginalChild.recordJson.entries())if(!(await boundedFile(root,join(path,String(index+1).padStart(6,'0')+'.record.json'),48*1024)).equals(Buffer.from(text)))throw failure();continue;}if(!permit||!saved||(saved as HostedExecutionJournal).state!=='REQUIRES_REVIEW'||!same(owner.identity,permit.originalIdentity)||!originalTemplate||!ownerBytes.equals(Buffer.from(originalTemplate.ownerJson)))throw failure();if(!same((await readdir(path)).sort(),['owner.json','000001.record.json','000002.record.json'].sort()))throw failure();for(const[index,text]of originalTemplate.recordJson.entries())if(!(await boundedFile(root,join(path,String(index+1).padStart(6,'0')+'.record.json'),48*1024)).equals(Buffer.from(text)))throw failure();} }
    };
    const validateInventory = (result:z.infer<typeof inventorySchema>,expectedVersions:string[]) => { live(); fresh(result.observedAtMs); fresh(result.completedAtMs); if (result.projectRef !== identity.projectRef || result.sourceSha !== identity.sourceSha || result.treeSha !== identity.treeSha || result.approvalDigest !== identity.approvalDigest || result.ciRunId !== identity.ciRunId || result.planSha256 !== identity.planSha256 || result.stageId !== identity.stageId || result.stageSha256 !== identity.stageSha256 || result.expectedVersionsSha256 !== hash(JSON.stringify([...expectedVersions].sort())) || result.totalStorageObjects !== result.verifiedOperatorObjects || result.operations.reduce((count, operation) => count + operation.objectCount, 0) !== result.verifiedOperatorObjects || new Set(result.operations.map(operation => operation.operation)).size !== result.operations.length || result.startedAtMs > result.bytesVerificationStartedAtMs || result.bytesVerificationStartedAtMs > result.bytesVerifiedAtMs || result.bytesVerifiedAtMs > result.countsVerifiedAtMs || result.countsVerifiedAtMs > result.completedAtMs || result.observedAtMs !== Math.min(result.bytesVerificationStartedAtMs, result.countsVerifiedAtMs)) throw failure(); const ownOperation = hash(JSON.stringify(journalIdentity)); for (const operation of result.operations) { if (operation.operation !== operation.identitySha256||operation.identity&&operation.identitySha256!==hash(JSON.stringify(operation.identity))) throw failure(); if (operation.operation !== ownOperation && operation.state !== 'COMMITTED') {const permit=reconciliationPermit?assertNativeReconciliationPermit(reconciliationPermit,identity):null;const selected=selectedIntentFacts(),selectedMatch=selected&&selectedOriginalIntent&&operation.state==='INTENT'&&operation.operation===selectedOriginalIntent.originalOperationSha256&&operation.chainSha256===hash(selectedOriginalIntent.ownerJson+selectedOriginalIntent.record1Json)&&operation.objectCount===2&&same(operation.identity,selected.identity);const childMatch=permit?.selectedOriginalChild&&operation.state==='REQUIRES_REVIEW'&&operation.operation===permit.selectedOriginalChild.operationSha256&&operation.chainSha256===permit.selectedOriginalChild.chainSha256&&operation.objectCount===3&&same(operation.identity,permit.selectedOriginalChild.identity);if(!selectedMatch&&!childMatch&&(!permit||operation.state!=='REQUIRES_REVIEW'||operation.operation!==permit.originalOperationSha256||operation.chainSha256!==permit.originalChainSha256||operation.objectCount!==3||!same(operation.identity,permit.originalIdentity)))throw failure();} if (operation.operation === ownOperation && (originalCommitted ? operation.state !== 'COMMITTED' : (!confirmedIntent&&!originalIntent) || operation.state !== 'INTENT')) throw failure(); } if ((originalCommitted || confirmedIntent) && !result.operations.some(operation => operation.operation === ownOperation)) throw failure();
      if(installedSchema&&!reconciliation){
        // Every applied stage has a byte-verified original remote COMMITTED
        // journal. Matching SQL history never substitutes for that receipt.
        const historicalReplay=originalSchemaSource!,historicalStop=historicalReplay.remaining.indexOf(posthogIntelligenceMigration),boundaries=[historicalReplay.before.length,historicalReplay.before.length+1,historicalReplay.before.length+1+historicalStop,originalSchemaBlobs.size],ids=['prefix','native','pre-observability','remaining'];
        // The historical whole-source boundary may be shorter than today's
        // final stage after an append. Its remaining-stage receipt is required.
        for(const[index,count]of boundaries.entries()){
          if(count>installedSchema.migrationCount)break;
          const included=plan.migrations.slice(0,count),stageHash=hash(JSON.stringify({included:included.map(row=>({name:row.name,version:row.version,sha256:row.sha256})),configSha256:stage.configSha256}));
          let covered=false;
          for(const operation of result.operations){
            const original=operation.identity;if(operation.state!=='COMMITTED'||!original||original.projectRef!==plan.projectRef||original.stageId!==ids[index]||original.stageSha256!==stageHash)continue;
            try{
              if(original.sourceSha===installedSchema.sourceSha){if(original.treeSha!==installedSchema.treeSha||included.some(row=>hash(originalSchemaBlobs.get(row.name)!)!==row.sha256))continue;}
              else{git(root,['merge-base','--is-ancestor',original.sourceSha,installedSchema.sourceSha]);const sources=readHistoricalMigrationSources(root,original.sourceSha,original.treeSha);if(included.some(row=>hash(sources.find(source=>source.name===row.name)?.bytes??new Uint8Array())!==row.sha256))continue;}
              covered=true;break;
            }catch{/* Unrelated or changed original source cannot cover this stage. */}
          }
          if(!covered)throw failure();
        }
      }
      return result; };
    const inventory = async (expectedVersions: string[]) => { live(); await storagePolicy(); const result = inventorySchema.parse(own(await readHostedOperatorStorageInventory({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, providerToken: input.providerToken, storageKey: input.journalStorageKey, identity, expectedVersions: [...expectedVersions], ...(activeBatch?{batchStage:stage,batchIndex:activeBatch.index,reconciliationPermit}:{}), ...((plan.priorCompletedRelease||plan.priorSchemaRelease)?{plan}: {}) }))); return validateInventory(result,expectedVersions); };
    let admissionFailure:AdmissionFailure|undefined;
    let initialJournalReadFailure:InitialJournalReadFailure|undefined;
    const expectedCurrentVersions=()=>activeBatch?(batchPhase==='before'?activeBatch.expectedBeforeVersions:activeBatch.expectedAfterVersions):(phase==='before'?stage.expectedBeforeVersions:stage.expectedAfterVersions);
    const initialJournalOperation=async<T>(boundary:InitialJournalReadFailure['boundary'],phase:InitialJournalReadFailure['phase'],operation:()=>Promise<T>):Promise<T>=>{
      const startedAtMs=Date.now(),started=performance.now();
      try{return await operation();}catch{
        const completedAtMs=Date.now(),clocksKnown=Number.isSafeInteger(startedAtMs)&&startedAtMs>=0&&Number.isSafeInteger(completedAtMs)&&completedAtMs>=startedAtMs;
        const elapsed=clocksKnown?completedAtMs-startedAtMs:performance.now()-started;
        initialJournalReadFailure??=initialJournalReadFailureSchema.parse({boundary,phase,durationMs:Number.isFinite(elapsed)?Math.min(86400000,Math.max(0,Math.trunc(elapsed))):0,...(clocksKnown?{startedAtMs,completedAtMs}:{})});
        throw failure();
      }
    };
    const renewJournalAdmission=async()=>{
      live();if(!reconciliationPermit)return;
      // Journal guards need the existing current native/official pair. The
      // complete execution cohort remains owned by the later revalidation.
      if(continuation)await database.refreshSchemaContinuation(reconciliationPermit,identity,expectedCurrentVersions());
      else await database.refreshReconciliationPermit(reconciliationPermit,identity,phase==='before'?120:123);
      live();requireOfficial(readNativeMigrationPermitAuthority(reconciliationPermit,identity));
    };
    const revalidate = async () => {
      const began=Date.now(),observations:Record<keyof AdmissionFailure['agesMs'],number|null>={official:null,provider:null,target:null,postconditions:null,inventory:null};let phaseName:AdmissionFailure['phase']='STORAGE_CAPABILITY';
      try{
      await database.requireInstalledSchemaStorage();live();
      const initialFiles=async()=>{
        phaseName='TOOLCHAIN';const checkedToolchain=await toolchain();if(!same(checkedToolchain,manifest))throw failure();
        phaseName='SOURCE_FILES';const files=await admitStageFiles({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage});live();if(files.planSha256!==identity.planSha256||files.stageSha256!==identity.stageSha256)throw failure();return files;
      };
      // Preparatory immutable reads precede renewed native observations. The
      // complete final byte checks below still detect changes during admission.
      let files=reconciliationPermit?await initialFiles():undefined;
      if(reconciliationPermit){phaseName='OFFICIAL_AUTHORITY';await database.refreshSchemaStageAdmission(reconciliationPermit,identity,expectedCurrentVersions());live();}
      const cohort=reconciliationPermit?readNativeSchemaStageAdmission(reconciliationPermit,identity,expectedCurrentVersions()):null;
      const held = live();phaseName='PRIOR_JOURNALS'; await priorJournals();phaseName='OFFICIAL_AUTHORITY';const authority = reconciliationPermit ? requireOfficial(readNativeMigrationPermitAuthority(reconciliationPermit,identity)) : await official();const officialObservedAt=Date.parse(authority.observedAt);observations.official=officialObservedAt;fresh(officialObservedAt);phaseName='PROVIDER';const currentProvider=cohort?.provider??await provider();fresh(currentProvider.observedAtMs);requireCurrentHostedMigrationEndpoint(input.endpoint,currentProvider,expected.fingerprints.migrationEndpointSha256);observations.provider=currentProvider.observedAtMs;
      files??=await initialFiles();
      phaseName='TARGET';
      const target = targetSchema.parse(own(cohort?.target??await database.observeTarget())); observations.target=target.observedAtMs;fresh(target.observedAtMs); live(); const expectedVersions = expectedCurrentVersions();
      const installed=expected.installedSource;
      phaseName='OPERATOR_INVENTORY';const storage=cohort?inventorySchema.parse(own(cohort.inventory)):await inventory(expectedVersions);if(cohort)validateInventory(storage,expectedVersions);observations.inventory=storage.observedAtMs;
      phaseName='HISTORY_AND_SCOPE';
      const history = verifyHostedMigrationHistory({ sources: files.sources, included: stage.included, expectedVersions, history: target.historyPresent ? target.history : null });
      if (!target.historyPresent && target.history.length || (!installed&&target.authUsers!==0) || target.storageObjects!==storage.totalStorageObjects || target.schools !== (installed?2:expectedVersions.length?0:null) || !same([...target.appSchemas].sort(), expectedVersions.length ? ['app', 'authorization', 'internal'] : []) || !same([...target.runtimeRoles].sort(), expectedVersions.length ? ['cuevo_api', 'cuevo_worker'] : []) || target.tls.host !== new URL(identity.databaseUrl).hostname || target.tls.certificateSha256 !== identity.certificateSha256) throw failure();
      phaseName='POPULATION';if(installed){const receipt=await database.readInstalledPopulation();if(receipt.sourceSha!==installed.sourceSha||receipt.treeSha!==installed.treeSha||receipt.manifestSha256!==installed.manifestSha256)throw failure();const manifest=JSON.parse(await readFile(join(root,'supabase/seed/identities.json'),'utf8'));validateHostedReferencePopulation(await database.observeSyntheticPopulation(),manifest);if(target.authUsers>133)throw failure();}
      phaseName='POSTCONDITIONS';const post = postSchema.parse(own(cohort?.post??await database.observeStage({ stageId: stage.id, expectedAfterVersions: [...expectedVersions] })));observations.postconditions=post.observedAtMs; fresh(post.observedAtMs); live(); if (post.stageId !== stage.id) throw failure();
      const capability: Record<typeof checkNames[number], boolean> = { foundation: expectedVersions.includes('20260930234201'), rls: expectedVersions.includes('20260930234201'), privateRelations: expectedVersions.includes('20260930234201'), privateFunctions: expectedVersions.includes('20260930234201'), runtimeRoles: expectedVersions.includes('20260930234201'), nativeSourceBridge: expectedVersions.includes('20261002021737'), curriculumLifecycle: expectedVersions.includes('20261002021206'), dispatchInactive: expectedVersions.includes('20261002122236'), analyticsInactive: expectedVersions.includes('20261002182213'), recoveryCronInactive: true, transportPrivate: expectedVersions.includes('20261005132902') };
      for (const name of checkNames) if (post.checks[name] !== (capability[name] ? true : null)) throw failure();
      // Complete official/source admission precedes these actual observations.
      // Final complete source/artifact validation never restamps the earlier observations.
      phaseName='FINAL_SOURCE';await storagePolicy(); const finalToolchain = await toolchain(); if (!same(finalToolchain, manifest)) throw failure();
      const finalFiles = await admitStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage }); live();
      if (finalFiles.planSha256 !== identity.planSha256 || finalFiles.stageSha256 !== identity.stageSha256) throw failure();
      validatePreparedBackendReleaseIntent(prepared, { ...expected, now: Date.now() });
      phaseName='FINAL_FRESHNESS';fresh(officialObservedAt); fresh(currentProvider.observedAtMs); fresh(target.observedAtMs); fresh(post.observedAtMs);fresh(storage.observedAtMs);
      return { kind: 'ADMITTED', observedAtMs: Math.min(officialObservedAt, currentProvider.observedAtMs, target.observedAtMs, post.observedAtMs, storage.observedAtMs), source: { sha: expected.releaseSha, tree: expected.treeSha, currentMainSha: expected.releaseSha, ciRunId: expected.ciRunId }, project: { ref: plan.projectRef, host: target.tls.host, port: 5432, database: target.database, operator: target.operator }, approval: { purpose: 'BACKEND_SYNTHETIC_STAGING', digest: prepared.sha256, expiresAtMs }, artifact: { stageSha256: files.stageSha256 }, tls: { kind: 'PEER_VERIFIED', host: target.tls.host, certificateSha256: target.tls.certificateSha256 }, lock: { id: held.id, key: held.key }, history: history.history, postconditions: phase === 'after'||activeBatch&&batchPhase==='after' ? 'SATISFIED' : 'NOT_CHECKED' };
      }catch{if(!admissionPhases.includes(phaseName))throw failure();const now=Date.now(),bounded=(value:number)=>Math.min(86400000,Math.max(0,Number.isFinite(value)?Math.floor(value):0));admissionFailure={phase:phaseName,durationMs:bounded(now-began),agesMs:Object.fromEntries(Object.entries(observations).map(([key,time])=>[key,time===null?null:bounded(now-time)])) as AdmissionFailure['agesMs']};throw failure();}
    };
    if(!stage.pending.length&&(expected.installedSource||installedSchema)){
      let observed:Awaited<ReturnType<typeof revalidate>>;try{observed=await revalidate();}catch{output.stages.push({status:'REQUIRES_REVIEW',evidence:'NATIVE_ADAPTER_STAGE_EXECUTION',schemaHistoryAtomic:false,hostedAcceptance:false,protocol:null,compositionCode:'PREFLIGHT_UNCONFIRMED',...(admissionFailure?{admissionFailure}:{})});throw failure();}const original=expected.installedSource?await database.readInstalledPopulation():null;
      const remote=reconciliationPermit?readNativeSchemaStageAdmission(reconciliationPermit,identity,stage.expectedAfterVersions).inventory:await inventory(stage.expectedAfterVersions);
      fresh(observed.observedAtMs);fresh(remote.observedAtMs);
      output.stages.push({status:'NOOP',evidence:'NATIVE_ADAPTER_STAGE_EXECUTION',schemaHistoryAtomic:false,hostedAcceptance:false,protocol:null,compositionCode:null,
        installedVerification:{version:1,purpose:'CUEVO_INSTALLED_MIGRATION_REVALIDATION',identity,historySha256:hash(canonicalReleaseExecutionJson(observed.history)),remoteProjectSha256:remote.remoteProjectSha256,...(original?{installedPopulationSha256:hash(canonicalReleaseExecutionJson(original))}:{}),observedAt:new Date(Math.min(observed.observedAtMs,remote.observedAtMs)).toISOString()}});
      return 'NOOP';
    }
    if(metadataOnly)throw failure();
    // Prepare exact stopped execution containers before intent and any current
    // observation window. No hosted SQL effect occurs during this preparation.
    const preparedProcesses=new Map<string,Awaited<ReturnType<typeof createHostedMigrationNativeProcess>>>();
    const disposeProcesses=async()=>{const outcomes=await Promise.allSettled([...preparedProcesses.values()].map(port=>port.dispose()));if(outcomes.some(outcome=>outcome.status==='rejected')){processCleanupUnconfirmed=true;throw failure();}};
    const prepareProcess=async(workdir:string,included:{name:string;sha256:string}[])=>{
      let port:Awaited<ReturnType<typeof createHostedMigrationNativeProcess>>;
      try{port=await createHostedMigrationNativeProcess({repoRoot:root,projectRef:plan.projectRef,workdir,databaseUrl:connection.publicRecipe.databaseUrl,certificate:input.certificate,cli:manifest.cli,delivery:{included:included.map(({name,sha256})=>({name,sha256})),configSha256:stage.configSha256},timeoutMs:300000},{signal:database.signal,privateEnvironment:connection.privateEnvironment});}catch(error){if(error instanceof HostedMigrationNativePreparationError)processFailure=processFailureSchema.parse(own(error.evidence));throw failure();}
      preparedProcesses.set(workdir,port);live();const expectedDigest=hash(JSON.stringify({included:included.map(({name,sha256})=>({name,sha256})),configSha256:stage.configSha256,certificateSha256:input.certificate.sha256,cli:manifest.cli}));if(port.prepared.deliverySha256!==expectedDigest||!/^sha256:[a-f0-9]{64}$/.test(port.prepared.imageId))throw failure();
    };
    try{
      if(continuation&&stage.pending.length>20)batches=(await createHostedMigrationBatchWorkdirs({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage,outputRoot:join(root,'.local/hosted-release')})).batches;
      if(stage.pending.length){
        if(batches)for(const batch of batches){
          const checked=await admitHostedMigrationBatchFiles({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage,batch});live();if(checked.stageSha256!==identity.stageSha256||checked.planSha256!==identity.planSha256||checked.batchSha256!==batch.batchSha256)throw failure();
          await prepareProcess(batch.workdir,batch.cumulativeIncluded);
        }else await prepareProcess(stage.workdir,stage.included);
      }
    }catch{
      // No journal or CLI consumer exists in this preparation block. Keep a
      // later stage's refusal separate from the held database lease outcome
      // and the acknowledged SQL of earlier stages. Disposal still drains all
      // prepared siblings and retains any unknown process cleanup explicitly.
      try{await disposeProcesses();}catch{processCleanupUnconfirmed=true;}
      retainFailure();output.stages.push({status:'REQUIRES_REVIEW',evidence:'NATIVE_ADAPTER_STAGE_EXECUTION',schemaHistoryAtomic:false,hostedAcceptance:false,protocol:null,compositionCode:'PREFLIGHT_UNCONFIRMED',compositionFailure:output.compositionFailure});return 'REQUIRES_REVIEW';
    }
    try{
    let journal:Awaited<ReturnType<typeof createHostedMigrationDurableJournal>>;
    try{
      if(originalIntent){
        if(!reconciliationPermit)throw failure();originalExecution=await database.admitOriginalNativeIntent(reconciliationPermit,identity);const binding=readNativeOriginalIntentExecutionBinding(originalExecution);live();
        if(!same(binding.journalIdentity,journalIdentity)||!same(binding.currentExecutionIdentity,identity)||binding.link.templateSha256!==originalNativeIntentFingerprint(originalIntent).templateSha256)throw failure();
        // A fresh checkout retains the exact selected original bytes. Exclusive
        // creation never replaces an existing owner, intent or uncertain chain.
        await physical(root,join(root,'.local/hosted-release'),'directory');const relativeRoot=relative(root,journalRoot).replaceAll('\\','/'),probe=relativeRoot+'/owner.json';if(git(root,['check-ignore','--no-index','--stdin'],probe+'\n').toString().trim()!==probe||git(root,['ls-files','--cached','--',relativeRoot]).length)throw failure();
        let absent=false;try{await lstat(journalRoot);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();absent=true;}
        if(absent){await mkdir(journalRoot,{mode:0o700});await physical(root,journalRoot,'directory');for(const[name,bytes]of [['owner.json',originalIntent.ownerJson],['000001.record.json',originalIntent.record1Json]] as const){const handle=await open(join(journalRoot,name),'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}for(const path of [journalRoot,join(root,'.local/hosted-release'),join(root,'.local'),root]){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}}
        if(!await selectedLocalIntent(journalRoot,await boundedFile(root,join(journalRoot,'owner.json'),48*1024),JSON.parse(originalIntent.record1Json).payload))throw failure();
      }
      // Stopped-process preparation may outlive the earlier native pair. Renew
      // before both prior-journal and durable-construction permit consumers.
      if(reconciliationPermit)await initialJournalOperation('BEFORE_JOURNAL_CONSTRUCTION','NATIVE_ADMISSION_RENEWAL',renewJournalAdmission);
      journal=await initialJournalOperation('BEFORE_JOURNAL_CONSTRUCTION','ORIGINAL_JOURNAL_CONSTRUCTION',async()=>{await priorJournals();return createHostedMigrationDurableJournal({ repoRoot: root, journalRoot, identity:journalIdentity, projectRef: plan.projectRef, boundProjectRef: expected.targets.supabase.projectRef, storageKey: input.journalStorageKey, providerToken: input.providerToken,...(reconciliationPermit?{reconciliationPermit}:{}) });});journalReady=true;
    }catch{
      output.stages.push({status:'REQUIRES_REVIEW',evidence:'NATIVE_ADAPTER_STAGE_EXECUTION',schemaHistoryAtomic:false,hostedAcceptance:false,protocol:null,compositionCode:'PREFLIGHT_UNCONFIRMED',...(initialJournalReadFailure?{initialJournalReadFailure}:{})});throw failure();
    }
    const childExecutions:HostedMigrationChildExecution[]=[];let childPostAdmissionPending=false;
    let firstJournalRead=true;
    const ports: Omit<HostedExecutionPorts, 'withLock'> = {
      now: Date.now,
      readJournal: async () => {
        const initial=firstJournalRead;firstJournalRead=false;
        if(initial&&reconciliationPermit)await initialJournalOperation('FIRST_JOURNAL_READ','NATIVE_ADMISSION_RENEWAL',renewJournalAdmission);
        const read=async()=>{live();if(!journal)throw failure();const saved=await journal.readJournal();live();if(originalIntent){if(!originalExecution||!saved||(saved as HostedExecutionJournal).version!==1||(saved as HostedExecutionJournal).state!=='INTENT'||hash(JSON.stringify(saved))!==originalIntent.originalIntentSha256)throw failure();readNativeOriginalIntentExecutionBinding(originalExecution,'LIVE');confirmedIntent=true;}if(!stage.pending.length&&(saved===null||(saved as HostedExecutionJournal).state!=='COMMITTED'))throw failure();if(saved!==null&&(saved as HostedExecutionJournal).state==='COMMITTED'){phase='after';originalCommitted=true;}return saved;};
        return initial?initialJournalOperation('FIRST_JOURNAL_READ','ORIGINAL_JOURNAL_READ',read):read();
      },
      writeJournal: async value => { if (!journal) throw failure();
        if(!same(value.identity,journalIdentity)||originalIntent&&(value.version!==2||!originalExecution||value.originalIntentExecution.templateSha256!==originalNativeIntentFingerprint(originalIntent).templateSha256||!same(value.originalIntentExecution.currentExecutionIdentity,identity)))throw failure();
        // A complete earlier admission can be followed by inventory and intent
        // preparation I/O. Recheck actual native authority immediately before
        // the bounded immutable journal operation; safety review remains usable
        // after execution authority has been lost.
        if(reconciliationPermit&&value.state!=='REQUIRES_REVIEW'){
          if(continuation)await database.refreshSchemaContinuation(reconciliationPermit,identity,expectedCurrentVersions());
          else await database.refreshReconciliationPermit(reconciliationPermit,identity,phase==='before'?120:123);
          live();requireOfficial(readNativeMigrationPermitAuthority(reconciliationPermit,identity));
        }
        const receipt = await journal.writeJournal(value); if (receipt.kind === 'SYNCED' && receipt.sha256 === hash(JSON.stringify(value))) {
          if(value.state==='COMMITTED')committedAcknowledgement={kind:'SYNCED',sha256:receipt.sha256};
          if(value.state==='INTENT'){confirmedIntent = true;if(continuation&&reconciliationPermit)await database.ownSchemaContinuationIntent(reconciliationPermit,identity);}
        } return receipt; }, revalidate,
      runCli: async (args, env) => {
        const held = live(); if (!stage.pending.length || phase !== 'before') throw failure();
        await database.requireInstalledSchemaStorage();live();
        // The selected original operation needs a create-only durable fence
        // before any possible launch. A lost outcome cannot be replayed from
        // another checkout merely because migration history still reads123.
        if(originalExecution){await database.reserveOriginalNativeIntentAttempt(originalExecution);live();}
        // The held-stage core's earlier admission may precede durable intent I/O.
        // Read actual source/history/target again immediately for this original CLI.
        const current = await revalidate(); live(); fresh(current.observedAtMs);
        if (current.source.sha !== identity.sourceSha || current.source.tree !== identity.treeSha || current.source.currentMainSha !== identity.sourceSha || current.source.ciRunId !== identity.ciRunId
          || current.project.ref !== identity.projectRef || current.project.host !== new URL(identity.databaseUrl).hostname || current.project.port !== 5432 || current.project.database !== 'postgres' || current.project.operator !== 'postgres'
          || current.approval.digest !== identity.approvalDigest || current.approval.expiresAtMs <= Date.now() || current.artifact.stageSha256 !== identity.stageSha256
          || current.tls.host !== current.project.host || current.tls.certificateSha256 !== identity.certificateSha256 || current.lock.id !== held.id || current.lock.key !== held.key
          || !same(current.history.map(row => row.version).sort(), stage.expectedBeforeVersions) || current.history.some(row => stage.included.find(source => source.version === row.version)?.sha256 !== row.sourceReceiptSha256)) throw failure();
        if(batches){
          let previousVersions=stage.expectedBeforeVersions;
          for(const batch of batches){
            activeBatch=batch;batchPhase='before';if(!same(batch.expectedBeforeVersions,previousVersions)||batch.pending.length>20||!batch.pending.length)throw failure();
            const admitted=await admitHostedMigrationBatchFiles({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage,batch});live();if(admitted.stageSha256!==identity.stageSha256||admitted.planSha256!==identity.planSha256||admitted.batchSha256!==batch.batchSha256)throw failure();
            const before=await revalidate();live();fresh(before.observedAtMs);
            const processPort=preparedProcesses.get(batch.workdir);if(!processPort)throw failure();
            const finalBatch=await admitHostedMigrationBatchFiles({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage,batch});live();fresh(before.observedAtMs);if(finalBatch.batchSha256!==admitted.batchSha256||finalBatch.manifestSha256!==admitted.manifestSha256||finalBatch.stageSha256!==identity.stageSha256||before.approval.expiresAtMs<=Date.now())throw failure();
            const childArgs=['db','push','--db-url',connection.publicRecipe.databaseUrl,'--include-all','--skip-vault','--workdir',batch.workdir,'--yes','--output-format','json'],result=await processPort.runCli(childArgs,env,{notAfterMs:Math.min(before.observedAtMs+30000,before.approval.expiresAtMs)});if(result.kind==='EXITED'&&result.exitCode===0){childExecutions.push(hostedMigrationChildExecutionSchema.parse({index:batch.index,batchSha256:batch.batchSha256,beforeCount:batch.expectedBeforeVersions.length,afterCount:batch.expectedAfterVersions.length,beforeHistorySha256:hash(canonicalReleaseExecutionJson(batch.cumulativeIncluded.slice(0,batch.expectedBeforeVersions.length).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),afterHistorySha256:hash(canonicalReleaseExecutionJson(batch.cumulativeIncluded.map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cli:result,exitedAtMs:Date.now(),receipt:'UNCONFIRMED'}));childPostAdmissionPending=true;}live();if(result.kind!=='EXITED'||result.exitCode!==0)return result;
            batchPhase='after';const after=await revalidate();live();fresh(after.observedAtMs);if(!reconciliationPermit)throw failure();await database.persistSchemaBatchPrefix(reconciliationPermit,identity,batch.index,{observedAtMs:before.observedAtMs,history:batch.cumulativeIncluded.slice(0,batch.expectedBeforeVersions.length).map(row=>({version:row.version,sourceReceiptSha256:row.sha256}))});childExecutions.at(-1)!.receipt='CONFIRMED';childPostAdmissionPending=false;previousVersions=batch.expectedAfterVersions;
          }
          activeBatch=undefined;phase='after';return{kind:'EXITED',exitCode:0};
        }
        const processPort=preparedProcesses.get(stage.workdir);if(!processPort)throw failure();
        live(); fresh(current.observedAtMs); if (current.approval.expiresAtMs <= Date.now()) throw failure();
        const result = await processPort.runCli(args, env,{notAfterMs:Math.min(current.observedAtMs+30000,current.approval.expiresAtMs)}); live(); phase = 'after'; return result;
      },
    };
    const coreInput={ prepared: { projectRef: plan.projectRef, sourceSha: expected.releaseSha, treeSha: expected.treeSha, planSha256: artifact.planSha256, stage }, connection, approvalDigest: prepared.sha256, repoRoot: root, ciRunId: expected.ciRunId, certificateSha256: input.certificate.sha256 };
    if(originalExecution)readNativeOriginalIntentExecutionBinding(originalExecution,'LIVE');
    const core=originalExecution?await prepareHeldOriginalNativeIntentStage(coreInput,ports,originalExecution):prepareHeldHostedMigrationStage(coreInput,ports);
    consumed.push(core); await core.run(current, () => held && !database.signal.aborted);if(childPostAdmissionPending&&admissionFailure&&core.result.primaryCode==='CLI_UNCONFIRMED')core.result.primaryCode='POSTCONDITION_UNCONFIRMED';
    let acknowledgedSchema:CommittedSchemaSnapshot|undefined;
    if(core.result.acknowledgedCommit){const acknowledged=parseHostedExecutionJournal(core.result.acknowledgedCommit);if(acknowledged.state!=='COMMITTED'||!committedAcknowledgement||committedAcknowledgement.sha256!==hash(JSON.stringify(acknowledged))||!same(acknowledged.identity,journalIdentity))throw failure();acknowledgedSchema=committedSchemaSnapshot({status:'COMMITTED',commitment:'CONFIRMED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',execution:'INJECTED_PORTS',primaryCode:null,journalCode:null,cleanupCode:null,identity:acknowledged.identity,...(acknowledged.version===2?{originalIntentExecution:acknowledged.originalIntentExecution}:{})},committedAcknowledgement);}
    else if(core.result.status==='COMMITTED')acknowledgedSchema=committedSchemaSnapshot(core.result,committedAcknowledgement);
    output.stages.push({ status: core.result.status, evidence: 'NATIVE_ADAPTER_STAGE_EXECUTION', schemaHistoryAtomic: false, hostedAcceptance: false, protocol: core.result, compositionCode: null,...(childExecutions.length?{childExecutions:structuredClone(childExecutions)}:{}),...(admissionFailure?{admissionFailure}:{}),...(initialJournalReadFailure?{initialJournalReadFailure}:{}),...(acknowledgedSchema?{committedSchema:acknowledgedSchema}:{}) });
    return core.result.status;
    }finally{await disposeProcesses();}
    };
    try {
      compositionPhase='LEASE';const released = await database.withLock(`${plan.projectRef}:HOSTED_SCHEMA_MIGRATION`, async current => {
        if (entered) throw failure(); entered = true; held = true;leaseCallbackEntered=true;
        if(reconciliation){compositionPhase='RECONCILIATION';const result=await database.reconcileUnknownPrefix({template:reconciliation,expectedApproval:{packageSha256:prepared.sha256,runId:expected.releaseRunId,runAttempt:expected.runAttempt,sourceSha:expected.releaseSha,treeSha:expected.treeSha,ciRunId:expected.ciRunId,templateSha256:expected.reconciledPrefix!.templateSha256,expiresAtMs},expected,prepared,admissionHandle,githubToken:input.githubToken,providerToken:input.providerToken,storageKey:input.journalStorageKey});reconciliationPermit=result.permit;reconciliationReceipt=result.receipt;}
        if(continuation){compositionPhase='CONTINUATION';reconciliationPermit=await database.admitSchemaContinuation({completionExport:input.schemaRecoveryExport,expected,prepared,plan,admissionHandle,githubToken:input.githubToken,providerToken:input.providerToken,storageKey:input.journalStorageKey,...(selectedOriginalIntent?{originalNativeIntentTemplate:selectedOriginalIntent}:{}),...(selectedOriginalChild?{originalChildRecoveryTemplate:selectedOriginalChild,originalChildCatalogueReference:input.originalChildCatalogueReference}:{}),...(input.schemaRecoverySelection?{selection:input.schemaRecoverySelection}:{})});}
        try { for (const [index, stage] of stages.entries()) {
          compositionPhase='STAGE_CORE';const outcome=await executeStage(stage,artifacts[index],current);if(outcome==='REQUIRES_REVIEW')break;
          if(outcome==='COMMITTED'){
            // Save only confirmed original stage progress under this same held
            // operator lease. Later approval still re-admits remote journals.
            if(!held||database.signal.aborted)throw failure();
            compositionPhase='INSTALLED_SCHEMA_MARKER';
            try{await database.persistInstalledSchema({version:1,purpose:'CUEVO_INSTALLED_SCHEMA_STAGE',projectRef:plan.projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,migrationCount:stage.included.length,migrations:stage.included.map(({version,sha256})=>({version,sha256})),stageId:stage.id,stageSha256:artifacts[index].stageSha256});}
            catch{
              // SQL and its immutable journal were already acknowledged. A lost
              // marker write/readback is separate from actual native cleanup.
              // Stop here, returning normally so the native owner drains/releases.
              const result=output.stages.at(-1)!;result.status='REQUIRES_REVIEW';result.installedSchemaMarker={version:1,purpose:'CUEVO_INSTALLED_SCHEMA_MARKER_OUTCOME',status:'UNKNOWN'};
              installedSchemaMarkerFailed=true;retainFailure();break;
            }
            compositionPhase='STAGE_CORE';
          }
        }
          if(aggregate&&output.stages.length===stages.length&&output.stages.every(stage=>['COMMITTED','NOOP'].includes(stage.status))){
            await official();const target=await database.observeTarget();verifyHostedMigrationHistory({sources:artifacts.at(-1)!.sources,included:plan.migrations,expectedVersions:plan.migrations.map(row=>row.version).sort(),history:target.historyPresent?target.history:null});
            await database.persistInstalledMigrations({version:1,purpose:'CUEVO_COMPLETED_INSTALLED_MIGRATIONS',projectRef:plan.projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,migrationCount:plan.migrations.length,migrations:plan.migrations.map(({version,sha256})=>({version,sha256}))});
          }
          completed = true;
        }
        finally { held = false; }
      });
      if (!entered || !completed || released.kind !== 'RELEASED') throw failure();
      if(installedSchemaMarkerFailed)retainFailure();
      compositionPhase='COMPLETION';if(reconciliation&&reconciliationReceipt&&output.stages.length===1&&output.stages[0].status==='COMMITTED'&&output.stages[0].protocol?.identity){const completedAtMs=Date.now(),recoveryIdentity=output.stages[0].protocol.identity,migrations=reconciliation.stageRows,body={version:1,purpose:'CUEVO_HOSTED_SCHEMA_RECOVERY_COMPLETION',status:'PREFIX123_CONFIRMED',repository:expected.repository,sourceSha:expected.releaseSha,treeSha:expected.treeSha,projectRef:plan.projectRef,ciRunId:expected.ciRunId,recoveryRunId:expected.releaseRunId,runAttempt:expected.runAttempt,packageSha256:prepared.sha256,originalOperationSha256:reconciliationReceipt.originalOperationSha256,originalChainSha256:reconciliationReceipt.originalChainSha256,partialReceiptSha256:reconciliationReceipt.receiptSha256,recoveryIdentity,migrationCount:123,migrations,migrationManifestSha256:hash(canonicalReleaseExecutionJson(migrations)),historySha256:hash(canonicalReleaseExecutionJson(migrations.map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cataloguePolicySha256:unknownPrefixCataloguePolicySha256,catalogueSha256:cataloguePolicy.completedPrefix.expected.catalogueSha256,completedAt:new Date(completedAtMs).toISOString(),cleanup:{kind:'RELEASED'}};output.recoveryCompletion=prepareHostedSchemaRecoveryCompletion(body,{repository:expected.repository,template:reconciliation,partialReceiptSha256:reconciliationReceipt.receiptSha256,recoveryIdentity,packageSha256:prepared.sha256,now:completedAtMs});output.stages[0].recoveryCompletion=output.recoveryCompletion;}
    } catch {
      retainFailure();held = false;
      if (entered) { output.cleanupCode = 'LOCK_RELEASE_UNCONFIRMED'; for (const core of consumed) await core.releaseUnconfirmed(); }
      retainFailure();
      return structuredClone({ ...output, stages: output.stages.map(stage => ({ ...stage, status: stage.installedSchemaMarker?'REQUIRES_REVIEW':stage.protocol?.status ?? stage.status })) });
    }
    output.compositionCode = null;
    output.status = output.stages.length !== stages.length || output.stages.some(stage => stage.status === 'REQUIRES_REVIEW') ? 'REQUIRES_REVIEW' : output.stages.every(stage => stage.status === 'NOOP') ? 'NOOP' : 'COMMITTED';
    return structuredClone(output);
  } catch {retainFailure();return output; }finally{if(admissionHandle)disposeNativeBackendReleaseAdmission(admissionHandle);}
}

/** Native single-stage compatibility path, using the same actual session owner. */
export async function executeNativeHostedMigrationStage(value: unknown): Promise<NativeHostedMigrationStageResult> {
  const result = await executeNativeStages(value, false);
  const stage=result.stages[0]??{status:'REQUIRES_REVIEW' as const,evidence:'NATIVE_ADAPTER_STAGE_EXECUTION' as const,schemaHistoryAtomic:false as const,hostedAcceptance:false as const,protocol:null,compositionCode:'PREFLIGHT_UNCONFIRMED' as const};
  return {...stage,...(result.compositionFailure?{compositionFailure:result.compositionFailure}:{})};
}

/** Four verified replay stages under one actual PostgreSQL session lock. */
export async function executeNativeHostedMigrations(value: unknown): Promise<NativeHostedMigrationAggregateResult> { return executeNativeStages(value, true); }
