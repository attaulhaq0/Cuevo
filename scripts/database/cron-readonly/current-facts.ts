import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { decideRecovery, type RecoveryDecision } from './recovery-policy.mjs';

export const currentFactsQuerySha256 = '3ad74ef8bd309742c7c61e311df1ca0e4447a6d55fc446e8c3766ada762041e5';
export const currentFactsEndpoint = 'https://api.supabase.com/v1/projects/mqxdjvsyckzocokuikmx/database/query';
const project = 'mqxdjvsyckzocokuikmx', operationId = '80390cdc-1e28-4107-9020-253cd7d8a588';
const operationSha256 = 'ea7827b30f43ff850ef46ae562d5ca1aacabbdaffc84752fa62de9660f5f6a42';
const sourceUnitSha256 = 'd8dc3ac3106299866b142096bfb5b85edec2f076831774a4222d26a48d130a8d';
const migrationSha256 = 'b4e4692ae0bced49d5510d5079603055ccf48f7d4ba8e26f7a5251a3c6cf3b40';
const procedureMd5 = 'cf62507076e7a1b907f661e693c847f2';
const schema = 'cuevo_probe_80390cdc1e2841079020', jobName = `cuevo-commit-timeout-${operationId}`;
const command = `CALL ${schema}.run_probe('${operationSha256}');`;
const roles = ['PUBLIC', 'anon', 'authenticated', 'service_role', 'cuevo_api', 'cuevo_worker', 'authenticator'];
const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const columnPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
const runStatuses = new Set(['starting', 'connecting', 'sending', 'running', 'succeeded', 'failed']);
const knownIssues = new Set(['PROBE_SCHEMA_ABSENT_CURRENT_OBSERVATION_ONLY', 'EXTRA_OWNED_SCHEMA_OBJECTS', 'OWNED_OBJECT_MISSING_OR_IDENTITY_CONFLICT', 'OBJECT_INVENTORY_TRUNCATED', 'COLUMN_INVENTORY_TRUNCATED', 'ORIGINAL_CONTROL_COLUMN_SHAPE_CONFLICT', 'ACL_INVENTORY_OVER_BOUND', 'EXCLUDED_ROLE_ABSENT_PRIVILEGES_UNKNOWN', 'EXCLUDED_ROLE_OR_PUBLIC_EFFECTIVE_PRIVILEGE_CONFLICT', 'CONTROL_INHERITANCE_CONFLICT', 'STORED_OR_CURRENT_PROBE_IDENTITY_CONFLICT', 'STORED_JOB_ID_UNKNOWN', 'CONTROL_ROW_COUNT_OR_SIZE_UNKNOWN', 'CONTROL_ABSENT_OR_UNSAFE_SHAPE', 'CRON_JOB_INHERITANCE_CONFLICT', 'CRON_RUN_HISTORY_INHERITANCE_CONFLICT', 'OWNED_JOB_ABSENT_EXTRA_OR_CONFLICTING', 'STORED_SCHEDULE_JOB_CONFLICT', 'CRON_JOB_ABSENT_OR_NATIVE_OWNERSHIP_TYPE_POLICY_DRIFT', 'OWNED_RUNS_TRUNCATED', 'OWNED_RUN_IDENTITY_OR_RETURN_TRUNCATION_CONFLICT', 'RUN_HISTORY_OR_ORIGINAL_JOB_BINDING_UNKNOWN', 'OWNED_BACKEND_CENSUS_UNKNOWN_OR_TRUNCATED']);
export type CollectorActor = { sessionUser: string; currentUser: string; role: string; database: string; sessionUserOid: string; currentUserOid: string; operatorRoleOid: string; databaseOid: string; superuser: boolean; ssl: boolean; backendPid: number; backendStart: string };
export type CollectorRoleRow = { setrole: number; setdatabase: number; setconfig: string[] };
export type CollectorSetting = { roleOid: string; databaseOid: string; rowPresent: boolean; entries: string[] | null; rawRow: CollectorRoleRow | null };
export type CollectorGrant = { grantor_oid: string; grantor: string; grantee_oid: string; grantee: string; grantable: boolean; privileges: string[] };
export type CollectorObjectAcl = { kind: string; oid: string; rawAcl: string[] | null; normalizedAcl: string[]; grants: CollectorGrant[] };
export type CollectorColumnAcl = Omit<CollectorObjectAcl, 'kind' | 'oid'> & { number: number; name: string; typeOid: string };
export type CollectorRelation = { oid: string; name: string; kind: string; owner: string; ownerOid: string; rawAcl: string[] | null };
export type CollectorInventory = { [key: string]: unknown; namespaceName: string; namespaceOid: string; namespaceOwner: string; namespaceOwnerOid: string; tableName: string; tableOid: string; tableOwner: string; tableOwnerOid: string; tableRls: boolean; tableForceRls: boolean; procedureName: string; procedureOid: string; procedureOwner: string; procedureOwnerOid: string; procedureKind: string; procedureIdentityArguments: string; procedureConfig: string[] | null; procedureMd5: string; invoker: boolean; relations: CollectorRelation[]; procedures: Record<string, unknown>[]; types: Record<string, unknown>[]; namespaceDependencies: Record<string, unknown>[]; constraints: Record<string, unknown>[]; triggerCount: number; policyCount: number; extraObjects: boolean };
export type CollectorProbe = { operation_id: string; operation_sha256: string; source_unit_sha256: string; migration_sha256: string; procedure_source_md5: string; procedure_oid: string; command: string; job_name: string; job_id: string; phase: string; old_role_row_present: boolean; old_role_settings: string[] | null; armed_role_settings: string[] | null; prepared_schedule: string; armed_schedule: string | null; armed_at: string | null; started_at: string | null; expires_at: string | null; run_id: string | null; backend_pid: number | null; backend_start: string | null };
export type CollectorJob = { jobId: string; jobName: string; command: string; username: string; database: string; host: string; port: number; schedule: string; active: boolean };
export type CollectorRun = { runId: string; jobId: string; jobPid: number | null; status: string; startTime: string | null; endTime: string | null; command: string; username: string; database: string; privateReturnMessage: string | null; returnMessageCharacters: number | null; returnMessageBytes: number | null; returnMessageTruncated: boolean | null };
export type CollectorBackend = { pid: number; backendStart: string; username: string; database: string; state: string; backendType: string; queryVisible: boolean; queryMatchesRecordedCommand: boolean; matchesOriginalPidAndBackendStart: boolean; associatedRunIds: string[]; ownershipAmbiguous: boolean };
export type CollectorPrivacy = { role: string; roleOid: string | null; rolePresent: boolean; schemaUsage: boolean | null; schemaCreate: boolean | null; procedureExecute: boolean | null; tablePrivileges: Record<string, boolean | null>; anyColumnPrivileges: Record<string, boolean | null> };
export type CollectorFacts = { [key: string]: unknown; kind: string; expectedProject: string; projectIdentityFromSql: null; operationId: string; statementAt: string; readStartedAt: string; readCompletedAt: string; transactionStartedAt: string; actor: CollectorActor; setting: CollectorSetting; probeRows: CollectorProbe[] | null; inventory: CollectorInventory | null; objectAcls: CollectorObjectAcl[]; columnAcls: CollectorColumnAcl[]; effectivePrivileges: CollectorPrivacy[]; jobs: CollectorJob[] | null; runs: CollectorRun[] | null; cronMetadataGuards: { [key: string]: boolean }; ownedBackendCandidates: CollectorBackend[] | null; ownedBackendCensusComplete: boolean; ownedBackendPresent: boolean | null; cronExtension: { oid: string; version: string; ownerOid: string; owner: string } | null; serverSettings: { statementTimeout: string; cronBackgroundWorkers: string | null; cronHost: string | null; port: string; serverVersionNumber: string }; issues: string[]; status: string; originalPreWriteCustodyEstablished: boolean; originalArmCustodyEstablished: boolean; nativeExecutionAuthorized: boolean; nativeAcceptance: boolean; authenticCustodyCreated: boolean; futureEffectAdmitted: boolean };
export type RecoveryWriteIntent = { stage: string; writeAttempts: number; operationId: string; descriptorSha256: string; sourceUnitSha256: string; issuedAt: string };
export type RecoveryIntent = { operationId: string; operationSha256: string; descriptorSha256: string; sourceUnitSha256: string; migrationSha256: string; procedureMd5: string; schema: string; jobName: string; command: string; roleOid: string; databaseOid: string; project: string; originalRoleRowPresent: boolean; originalRoleSettings: string[] | null; priorOwnedSchemaAbsent: boolean; writeIntent: RecoveryWriteIntent };
export type PolicyGrant = Pick<CollectorGrant, 'grantee' | 'grantor' | 'privileges' | 'grantable'>;
export type PolicyPrivacy = { role: string; schemaUsage: boolean; schemaCreate: boolean; tableAccess: boolean; procedureExecute: boolean };
export type PolicyInventory = { namespaceName: string; namespaceOid: string; namespaceOwner: string; tableOid: string; tableOwner: string; procedureOid: string; procedureOwner: string; procedureMd5: string; invoker: boolean; tablePrivilegeContract?: string; relations: Pick<CollectorRelation, 'oid' | 'name' | 'kind' | 'owner'>[]; schemaAcl: PolicyGrant[]; tableAcl: PolicyGrant[]; procedureAcl: PolicyGrant[]; privacy: PolicyPrivacy[] };
export type OriginalRunBinding = { operationId: string; jobId: string; runId: string; backendPid: number; backendStart: string };
export type OriginalArmBinding = { operationId: string; jobId: string; schedule: string; roleOid: string; databaseOid: string; armedRoleSettings: string[] };
export type CurrentReadEvidence = { dataClass?: string; currentRead: { querySha256: string; endpoint: string; issuedAt: string; observedAt: string; responseSha256: string; authenticated?: boolean }; decisionAt: string; intent: RecoveryIntent | null; custody: { operationId: string; jobId: string; inventory: PolicyInventory } | null; acknowledgement: { status: string; operationId: string; jobId: string } | null; originalRunBinding: OriginalRunBinding | null; originalArmBinding: OriginalArmBinding | null; armIntent: RecoveryWriteIntent | null; unrelatedApplicationDrift: boolean; unrelatedSourceDrift: boolean };
type Presence = 'UNKNOWN' | 'PRESENT' | 'ABSENT';
export type CurrentCronSummary = {
  kind: 'CURRENT_READ_ONLY_OBSERVATION'; issuedAt: string | null; observedAt: string | null;
  nativeReadStartedAt: string | null; nativeReadCompletedAt: string | null; scopedRoleRow: Presence; probe: Presence; cron: Presence;
  runCount: number | null; ownedBackendPresent: boolean | null; censusComplete: boolean | null;
};
export type CurrentCronRecovery = RecoveryDecision & {
  currentReadAuthentication: 'SUPPLIED_UNVERIFIED'; current: CurrentCronSummary; missingFacts: string[];
};

// Inspect descriptors before reading values. Unknown object machinery is not evidence.
export function isBoundedCurrentData(value: unknown, budget = { nodes: 0 }, depth = 0): boolean {
  if (++budget.nodes > 20000 || depth > 14) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 65536 && !value.includes('\0');
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'object' || types.isProxy(value)) return false;
  const array = Array.isArray(value);
  if (array ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length > 66 || keys.some(key => typeof key !== 'string')) return false;
  if (array && (value.length > 65 || keys.length !== value.length + 1)) return false;
  return keys.every(key => {
    if (key === 'length' && array) return true;
    const entry = descriptors[key as string];
    return !!entry && Object.hasOwn(entry, 'value') && entry.enumerable
      && (!array || /^(0|[1-9]\d*)$/.test(key as string)) && isBoundedCurrentData(entry.value, budget, depth + 1);
  });
}
const oid = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) && BigInt(v) <= 4294967295n;
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
const pid = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const array64 = (v: unknown): v is unknown[] => Array.isArray(v) && v.length <= 64;
const required = (v: object, keys: string[]) => keys.every(key => Object.hasOwn(v, key) && (v as Record<string, unknown>)[key] !== undefined);
export function currentClock(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  const ms = Date.parse(value); if (!Number.isFinite(ms)) return null;
  return BigInt(ms) * 1000n + BigInt((value.match(/\.(\d{1,6})/)?.[1] ?? '').padEnd(6, '0').slice(3));
}
const unknownCurrent = (): CurrentCronSummary => ({ kind: 'CURRENT_READ_ONLY_OBSERVATION', issuedAt: null, observedAt: null, nativeReadStartedAt: null, nativeReadCompletedAt: null,
  scopedRoleRow: 'UNKNOWN', probe: 'UNKNOWN', cron: 'UNKNOWN', runCount: null, ownedBackendPresent: null, censusComplete: null });
function outcome(status: RecoveryDecision['status'], reasons: string[], current = unknownCurrent(), missingFacts: string[] = []): CurrentCronRecovery {
  return { status, reasons, current, missingFacts, currentReadAuthentication: 'SUPPLIED_UNVERIFIED',
    nativeExecutionAuthorized: false, nativeAcceptance: false, authenticCustodyCreated: false, futureEffectAdmitted: false,
    diagnosticReadAdmitted: false, preparationReadbackMatches: false, restorationAdvice: null };
}
function settingsKnown(s: CollectorSetting): boolean | null {
  if (s.rowPresent === false) return s.entries === null && s.rawRow === null;
  return s.rowPresent === true && Array.isArray(s.entries) && s.entries.length > 0 && s.entries.length <= 64
    && s.entries.every((entry: unknown) => typeof entry === 'string' && entry.length <= 512)
    && s.rawRow && Object.keys(s.rawRow).length === 3 && String(s.rawRow.setrole) === s.roleOid
    && String(s.rawRow.setdatabase) === s.databaseOid && same(s.rawRow.setconfig, s.entries);
}
function originalMissing(e: CurrentReadEvidence, probe: CollectorProbe | null, action: string): string[] {
  const missing: string[] = [], i = e.intent;
  if (!i) missing.push('ORIGINAL_INTENT');
  if (!i || typeof i.originalRoleRowPresent !== 'boolean' || i.originalRoleRowPresent && !Array.isArray(i.originalRoleSettings)
    || i.originalRoleRowPresent === false && i.originalRoleSettings !== null) missing.push('ORIGINAL_PREWRITE_ROLE_ROW');
  if (!i?.writeIntent || currentClock(i.writeIntent.issuedAt) === null) missing.push('ORIGINAL_PREWRITE_INTENT_AND_CLOCK');
  if (!i || !oid(i.roleOid) || !oid(i.databaseOid)) missing.push('ORIGINAL_SCOPE_OIDS');
  if ((['ARMED', 'RESTORED'] as readonly unknown[]).includes(probe?.phase) && !e.armIntent) missing.push('ORIGINAL_ARM_INTENT');
  if (action === 'restore' && !e.custody) missing.push('ORIGINAL_RESTORATION_CUSTODY');
  if (action === 'restore' && probe?.started_at != null && !e.originalRunBinding) missing.push('ORIGINAL_RUN_BINDING');
  return missing;
}

/** Supplied raw bytes are inspected locally. Authentication is established only
 * by the fixed current reader, never by a JSON label, flag or caller assertion.
 * The original intent/custody are separate inputs and are never reconstructed. */
export function inspectCurrentCronRecovery(action: string, responseText: unknown, evidence: unknown): CurrentCronRecovery {
  const current = unknownCurrent(); let missing: string[] = [];
  const finish = (status: RecoveryDecision['status'], reason: string) => outcome(status, [reason], current, missing);
  try {
    if (!['prepare', 'observe', 'restore'].includes(action) || typeof responseText !== 'string' || Buffer.byteLength(responseText) > 2097152
      || !isBoundedCurrentData(evidence) || !evidence || typeof evidence !== 'object') return finish('unknown', 'MALFORMED_CURRENT_READ_INPUT');
    const e = evidence as CurrentReadEvidence, receipt = e.currentRead;
    if (!receipt || Object.keys(receipt).some(key => !['querySha256', 'endpoint', 'issuedAt', 'observedAt', 'responseSha256'].includes(key))) return finish('unknown', 'CURRENT_READ_BINDING_UNKNOWN');
    if (!required(receipt, ['querySha256', 'endpoint', 'issuedAt', 'observedAt', 'responseSha256'])) return finish('unknown', 'CURRENT_READ_BINDING_UNKNOWN');
    if (receipt.querySha256 !== currentFactsQuerySha256 || receipt.endpoint !== currentFactsEndpoint
      || receipt.responseSha256 !== createHash('sha256').update(responseText).digest('hex')) return finish('refused', 'CURRENT_READ_SOURCE_OR_ENDPOINT_CONFLICT');
    const envelope: unknown = JSON.parse(responseText);
    if (!isBoundedCurrentData(envelope) || !Array.isArray(envelope) || envelope.length !== 1 || !envelope[0]
      || Object.keys(envelope[0]).length !== 1 || !envelope[0].privateCurrentFacts) return finish('unknown', 'CURRENT_RESPONSE_ENVELOPE_UNKNOWN');
    const r: CollectorFacts = envelope[0].privateCurrentFacts;
    if (Buffer.byteLength(JSON.stringify(r)) > 1048576 || r.kind !== 'FIXED_CURRENT_READ_ONLY_FACTS') return finish('unknown', 'CURRENT_RESPONSE_SHAPE_UNKNOWN');
    if (!required(r, ['expectedProject', 'projectIdentityFromSql', 'operationId']) || r.status !== 'UNKNOWN_REQUIRES_EXTERNAL_TARGET_AND_ORIGINAL_CUSTODY') return finish('unknown', 'CURRENT_TARGET_OR_STATUS_UNKNOWN');
    if (r.expectedProject !== project || r.projectIdentityFromSql !== null || r.operationId !== operationId) return finish('refused', 'CURRENT_TARGET_CONFLICT');
    if (['nativeExecutionAuthorized', 'nativeAcceptance', 'authenticCustodyCreated', 'futureEffectAdmitted', 'originalPreWriteCustodyEstablished', 'originalArmCustodyEstablished'].some(key => r[key] !== false)) return finish('unknown', 'CURRENT_AUTHORITY_FLAGS_UNKNOWN');
    const issued = currentClock(receipt.issuedAt), observed = currentClock(receipt.observedAt), decision = currentClock(e.decisionAt);
    const transaction = currentClock(r.transactionStartedAt), statement = currentClock(r.statementAt), started = currentClock(r.readStartedAt), completed = currentClock(r.readCompletedAt);
    if ([issued, observed, decision, transaction, statement, started, completed].some(v => v === null)) return finish('unknown', 'CURRENT_READ_CLOCK_UNKNOWN');
    current.issuedAt = receipt.issuedAt; current.observedAt = receipt.observedAt; current.nativeReadStartedAt = r.readStartedAt; current.nativeReadCompletedAt = r.readCompletedAt;
    if (issued! > transaction! || transaction! > statement! || statement! > started! || started! > completed! || completed! > observed!
      || observed! > decision!) return finish('refused', 'CURRENT_READ_CLOCK_STALE_OR_CONFLICTING');
    const a = r.actor, s = r.setting;
    if (!a || !s || !required(a, ['sessionUser', 'currentUser', 'role', 'database', 'superuser', 'ssl', 'sessionUserOid', 'currentUserOid'])
      || !required(s, ['roleOid', 'databaseOid', 'rowPresent', 'entries', 'rawRow'])
      || !oid(a.operatorRoleOid) || !oid(a.databaseOid) || !pid(a.backendPid) || currentClock(a.backendStart) === null) return finish('unknown', 'CURRENT_ACTOR_OR_SCOPE_UNKNOWN');
    if (a.sessionUser !== 'postgres' || a.currentUser !== 'postgres' || a.role !== 'none' || a.database !== 'postgres' || a.superuser !== false || a.ssl !== true
      || a.sessionUserOid !== a.operatorRoleOid || a.currentUserOid !== a.operatorRoleOid || s.roleOid !== a.operatorRoleOid || s.databaseOid !== a.databaseOid) return finish('refused', 'CURRENT_ACTOR_OR_SCOPE_CONFLICT');
    if (!settingsKnown(s)) return finish(s.rowPresent === true && s.rawRow ? 'refused' : 'unknown', 'CURRENT_FULL_SCOPED_ROW_UNKNOWN_OR_CONFLICTING');
    current.scopedRoleRow = s.rowPresent ? 'PRESENT' : 'ABSENT';
    current.probe = r.inventory === null && r.probeRows === null && Array.isArray(r.issues) && r.issues.includes('PROBE_SCHEMA_ABSENT_CURRENT_OBSERVATION_ONLY') ? 'ABSENT' : r.inventory && Array.isArray(r.probeRows) && r.probeRows.length === 1 ? 'PRESENT' : 'UNKNOWN';
    current.cron = r.cronExtension === null ? 'ABSENT' : r.cronExtension ? 'PRESENT' : 'UNKNOWN';
    current.runCount = array64(r.runs) ? r.runs.length : null;
    current.censusComplete = typeof r.ownedBackendCensusComplete === 'boolean' ? r.ownedBackendCensusComplete : null;
    current.ownedBackendPresent = typeof r.ownedBackendPresent === 'boolean' ? r.ownedBackendPresent : null;
    const p = current.probe === 'PRESENT' ? r.probeRows![0] : null;
    missing = originalMissing(e, p, action);
    if (decision! - issued! > 30000000n) return finish('refused', 'CURRENT_READ_CLOCK_STALE_OR_CONFLICTING');
    if (!Array.isArray(r.issues) || r.issues.some((issue: unknown) => typeof issue !== 'string' || !knownIssues.has(issue))) return finish('unknown', 'CURRENT_READER_ISSUE_UNKNOWN');
    if (r.issues.length) return outcome(r.issues.some((issue: string) => /CONFLICT|EXTRA_/.test(issue)) ? 'refused' : 'unknown', [...r.issues], current, missing);
    if (!p || !r.inventory || current.cron !== 'PRESENT') return finish('unknown', 'CURRENT_OWNED_OBJECTS_MISSING');
    const inv = r.inventory, ext = r.cronExtension!, guards = r.cronMetadataGuards, settings = r.serverSettings;
    if (!guards || !settings || !['jobNativeShapeSafe', 'runNativeShapeSafe', 'exactOwnedJobMatches'].every(key => guards[key] === true)
      || !oid(ext.oid) || !oid(ext.ownerOid) || ext.owner !== 'supabase_admin' || typeof ext.version !== 'string') return finish('unknown', 'CURRENT_CRON_NATIVE_METADATA_UNKNOWN');
    if (settings.statementTimeout !== '10s' || typeof settings.port !== 'string' || !/^\d{1,5}$/.test(settings.port)
      || typeof settings.cronHost !== 'string' || !settings.cronHost || typeof settings.serverVersionNumber !== 'string' || !/^17\d{4}$/.test(settings.serverVersionNumber)) return finish('unknown', 'CURRENT_SERVER_SETTINGS_UNKNOWN');
    if (!required(inv, ['namespaceName', 'tableName', 'procedureName', 'procedureKind', 'invoker', 'procedureConfig', 'procedureMd5', 'tableRls', 'tableForceRls', 'extraObjects', 'namespaceOwner', 'tableOwner', 'procedureOwner', 'namespaceOwnerOid', 'tableOwnerOid', 'procedureOwnerOid'])) return finish('unknown', 'CURRENT_PRIVATE_OBJECT_UNKNOWN');
    if (inv.namespaceName !== schema || inv.tableName !== 'control' || inv.procedureName !== 'run_probe' || inv.procedureKind !== 'p'
      || inv.invoker !== true || inv.procedureConfig !== null || inv.procedureMd5 !== procedureMd5 || inv.tableRls !== false || inv.tableForceRls !== false
      || inv.extraObjects !== false || ['namespaceOwner', 'tableOwner', 'procedureOwner'].some(key => inv[key] !== 'postgres')
      || ['namespaceOwnerOid', 'tableOwnerOid', 'procedureOwnerOid'].some(key => inv[key] !== a.operatorRoleOid)) return finish('refused', 'CURRENT_PRIVATE_OBJECT_CONFLICT');
    if (!['namespaceOid', 'tableOid', 'procedureOid'].every(key => oid(inv[key])) || !array64(inv.relations) || inv.relations.length !== 2
      || !array64(inv.procedures) || inv.procedures.length !== 1 || !array64(inv.types) || inv.types.length !== 2
      || !array64(inv.namespaceDependencies) || !array64(inv.constraints) || inv.constraints.length !== 3 || inv.triggerCount !== 0 || inv.policyCount !== 0) return finish('unknown', 'CURRENT_PRIVATE_INVENTORY_INCOMPLETE');
    if (!required(p, ['operation_id', 'operation_sha256', 'source_unit_sha256', 'migration_sha256', 'procedure_source_md5', 'procedure_oid', 'command', 'job_name', 'phase', 'old_role_row_present', 'old_role_settings', 'armed_role_settings', 'armed_schedule', 'armed_at', 'started_at', 'expires_at', 'run_id', 'backend_pid', 'backend_start'])) return finish('unknown', 'CURRENT_STORED_FACTS_INCOMPLETE');
    if (p.operation_id !== operationId || p.operation_sha256 !== operationSha256 || p.source_unit_sha256 !== sourceUnitSha256 || p.migration_sha256 !== migrationSha256
      || p.procedure_source_md5 !== procedureMd5 || p.procedure_oid !== inv.procedureOid || p.command !== command || p.job_name !== jobName) return finish('refused', 'CURRENT_STORED_SOURCE_CONFLICT');
    if (!id(p.job_id) || !array64(r.jobs) || r.jobs.length !== 1) return finish('unknown', 'CURRENT_OWNED_JOB_INCOMPLETE');
    const j = r.jobs[0];
    if (!required(j, ['jobId', 'jobName', 'command', 'username', 'database', 'host', 'port', 'active', 'schedule'])) return finish('unknown', 'CURRENT_OWNED_JOB_INCOMPLETE');
    if (j.jobId !== p.job_id || j.jobName !== jobName || j.command !== command || j.username !== 'postgres' || j.database !== 'postgres'
      || j.host !== settings.cronHost || j.port !== Number(settings.port) || typeof j.active !== 'boolean' || typeof j.schedule !== 'string' || !j.schedule) return finish('refused', 'CURRENT_OWNED_JOB_ENDPOINT_OR_SOURCE_CONFLICT');
    if (!array64(r.objectAcls) || r.objectAcls.length !== 3 || !array64(r.columnAcls) || r.columnAcls.length !== 40
      || new Set(r.columnAcls.map(row => row.number)).size !== 40 || new Set(r.columnAcls.map(row => row.name)).size !== 40) return finish('unknown', 'CURRENT_PRIVATE_ACL_INCOMPLETE');
    const acl: Partial<Pick<PolicyInventory, 'schemaAcl' | 'tableAcl' | 'procedureAcl'>> = {};
    for (const [kind, expectedOid, key] of [['schema', inv.namespaceOid, 'schemaAcl'], ['table', inv.tableOid, 'tableAcl'], ['procedure', inv.procedureOid, 'procedureAcl']] as const) {
      const matches = r.objectAcls.filter(row => row.kind === kind && row.oid === expectedOid);
      if (matches.length !== 1 || !array64(matches[0].grants) || !Array.isArray(matches[0].normalizedAcl) || matches[0].normalizedAcl.length > 64) return finish('unknown', 'CURRENT_OBJECT_GRANTS_INCOMPLETE');
      if (matches[0].grants.some(row => row.grantee !== 'postgres' || row.grantor !== 'postgres' || row.grantee_oid !== a.operatorRoleOid || row.grantor_oid !== a.operatorRoleOid)) return finish('refused', 'CURRENT_OBJECT_GRANT_CONFLICT');
      acl[key] = matches[0].grants.map(({ grantee, grantor, privileges, grantable }) => ({ grantee, grantor, privileges, grantable }));
    }
    for (const col of r.columnAcls) {
      if (!Number.isInteger(col.number) || col.number < 1 || col.number > 40 || typeof col.name !== 'string' || !oid(col.typeOid)
        || !array64(col.grants) || !Array.isArray(col.normalizedAcl) || col.normalizedAcl.length > 64) return finish('unknown', 'CURRENT_COLUMN_GRANTS_INCOMPLETE');
      if (col.grants.some(row => row.grantee !== 'postgres' || row.grantor !== 'postgres' || row.grantee_oid !== a.operatorRoleOid || row.grantor_oid !== a.operatorRoleOid || row.grantable !== false)) return finish('refused', 'CURRENT_COLUMN_GRANT_CONFLICT');
    }
    if (!array64(r.effectivePrivileges) || r.effectivePrivileges.length !== roles.length || new Set(r.effectivePrivileges.map(row => row.role)).size !== roles.length) return finish('unknown', 'CURRENT_EFFECTIVE_PRIVILEGES_INCOMPLETE');
    const privacy: PolicyPrivacy[] = [];
    for (const row of r.effectivePrivileges) {
      if (!roles.includes(row.role) || row.rolePresent !== true || (row.role === 'PUBLIC' ? row.roleOid !== '0' : !oid(row.roleOid))
        || !row.tablePrivileges || !row.anyColumnPrivileges) return finish('unknown', 'CURRENT_EFFECTIVE_ROLE_UNKNOWN');
      const privileges = [row.schemaUsage, row.schemaCreate, row.procedureExecute, ...tablePrivileges.map(key => row.tablePrivileges[key]), ...columnPrivileges.map(key => row.anyColumnPrivileges[key])];
      if (privileges.some(value => value === true)) return finish('refused', 'CURRENT_EFFECTIVE_PRIVILEGE_CONFLICT');
      if (privileges.some(value => value !== false)) return finish('unknown', 'CURRENT_EFFECTIVE_PRIVILEGE_UNKNOWN');
      privacy.push({ role: row.role, schemaUsage: row.schemaUsage!, schemaCreate: row.schemaCreate!, tableAccess: false, procedureExecute: row.procedureExecute! });
    }
    if (!array64(r.runs) || !array64(r.ownedBackendCandidates) || r.ownedBackendCensusComplete !== true || typeof r.ownedBackendPresent !== 'boolean') return finish('unknown', 'CURRENT_NATIVE_CENSUS_UNKNOWN');
    if (r.runs.some(run => !id(run.runId) || run.jobId !== p.job_id || !runStatuses.has(run.status) || run.jobPid !== null && !pid(run.jobPid)
      || run.command !== command || run.username !== 'postgres' || run.database !== 'postgres' || run.returnMessageTruncated !== false)) return finish('unknown', 'CURRENT_RUN_SHAPE_OR_SOURCE_UNKNOWN');
    const backends: { jobId: string; pid: number; backendStart: string }[] = [];
    for (const row of r.ownedBackendCandidates) {
      if (!pid(row.pid) || currentClock(row.backendStart) === null || row.queryVisible !== true || row.ownershipAmbiguous !== false
        || row.username !== 'postgres' || row.database !== 'postgres' || row.queryMatchesRecordedCommand !== true && row.matchesOriginalPidAndBackendStart !== true
        || !Array.isArray(row.associatedRunIds) || row.associatedRunIds.some((runId: unknown) => !id(runId) || !r.runs!.some(run => run.runId === runId && run.jobPid === row.pid))) return finish('unknown', 'CURRENT_BACKEND_OWNERSHIP_UNKNOWN');
      backends.push({ jobId: p.job_id, pid: row.pid, backendStart: row.backendStart });
    }
    if (r.ownedBackendPresent !== (backends.length > 0)) return finish('refused', 'CURRENT_BACKEND_PRESENCE_CONFLICT');
    if (missing.length) return outcome('unknown', ['ORIGINAL_EVIDENCE_INCOMPLETE'], current, missing);
    const inventory = { namespaceName: inv.namespaceName, namespaceOid: inv.namespaceOid, namespaceOwner: inv.namespaceOwner, tableOid: inv.tableOid, tableOwner: inv.tableOwner,
      procedureOid: inv.procedureOid, procedureOwner: inv.procedureOwner, procedureMd5: inv.procedureMd5, invoker: inv.invoker, tablePrivilegeContract: 'POSTGRESQL_17_OWNER_EIGHT',
      relations: inv.relations.map(({ oid, name, kind, owner }) => ({ oid, name, kind, owner })), ...acl, privacy };
    // Eligibility must already be closed at the conservative native capture.
    // HTTP body completion remains a separate transport clock in the summary.
    const readback = { complete: true, origin: 'INDEPENDENT_POST_WRITE_READ', issuedAt: receipt.issuedAt, observedAt: r.readStartedAt,
      actor: { sessionUser: a.sessionUser, currentUser: a.currentUser, role: a.role, database: a.database, superuser: a.superuser, ssl: a.ssl },
      project: r.expectedProject, sourceUnitSha256: p.source_unit_sha256, migrationSha256: p.migration_sha256,
      probe: { operationId: p.operation_id, operationSha256: p.operation_sha256, sourceUnitSha256: p.source_unit_sha256, migrationSha256: p.migration_sha256, procedureMd5: p.procedure_source_md5,
        jobId: p.job_id, phase: p.phase, oldRoleRowPresent: p.old_role_row_present, oldRoleSettings: p.old_role_settings, armedRoleSettings: p.armed_role_settings, armedSchedule: p.armed_schedule, armedAt: p.armed_at,
        startedAt: p.started_at, expiresAt: p.expires_at, runId: p.run_id, backendPid: p.backend_pid, backendStart: p.backend_start },
      job: { jobId: j.jobId, jobName: j.jobName, command: j.command, username: j.username, database: j.database, schedule: j.schedule, active: j.active },
      inventory, setting: { roleOid: s.roleOid, databaseOid: s.databaseOid, rowPresent: s.rowPresent, entries: s.entries },
      runs: r.runs.map(({ runId, jobId, jobPid, status, startTime, endTime, command, username, database }) => ({ runId, jobId, jobPid, status, startTime, endTime, command, username, database })),
      ownedBackendPresent: r.ownedBackendPresent, ownedJobBackends: backends };
    const decisionResult = decideRecovery(action, { ...e, readback });
    return { ...decisionResult, current, missingFacts: missing, currentReadAuthentication: 'SUPPLIED_UNVERIFIED' };
  } catch { return finish('unknown', 'MALFORMED_CURRENT_READ_INPUT'); }
}
