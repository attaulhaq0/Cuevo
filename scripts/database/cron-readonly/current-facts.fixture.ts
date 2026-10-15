// Invented local data. These are simulations, never retained provider receipts.
import { createHash } from 'node:crypto';
import type { CollectorFacts, CollectorInventory, CollectorProbe, CurrentReadEvidence, RecoveryIntent } from './current-facts';
export type CurrentFixture = { raw: CollectorFacts; evidence: CurrentReadEvidence; encode(): string };

export const querySha256 = '3ad74ef8bd309742c7c61e311df1ca0e4447a6d55fc446e8c3766ada762041e5';
const operationId = '80390cdc-1e28-4107-9020-253cd7d8a588';
const operationSha256 = 'ea7827b30f43ff850ef46ae562d5ca1aacabbdaffc84752fa62de9660f5f6a42';
const sourceUnitSha256 = 'd8dc3ac3106299866b142096bfb5b85edec2f076831774a4222d26a48d130a8d';
const migrationSha256 = 'b4e4692ae0bced49d5510d5079603055ccf48f7d4ba8e26f7a5251a3c6cf3b40';
const procedureMd5 = 'cf62507076e7a1b907f661e693c847f2';
const schema = 'cuevo_probe_80390cdc1e2841079020';
const project = 'mqxdjvsyckzocokuikmx';
const command = `CALL ${schema}.run_probe('${operationSha256}');`;
const jobName = `cuevo-commit-timeout-${operationId}`;
const roles = ['PUBLIC', 'anon', 'authenticated', 'service_role', 'cuevo_api', 'cuevo_worker', 'authenticator'];
const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const columnPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
const grants = (privileges: string[]) => [{ grantor_oid: '10', grantor: 'postgres', grantee_oid: '10', grantee: 'postgres', grantable: false, privileges }];

export function currentFixture(present = false): CurrentFixture {
  const issuedAt = '2026-10-15T15:00:29.000001Z', observedAt = '2026-10-15T15:00:30.000004Z';
  const inventory: CollectorInventory | null = present ? {
    namespaceName: schema, namespaceOid: '101', namespaceOwner: 'postgres', namespaceOwnerOid: '10',
    tableName: 'control', tableOid: '102', tableOwner: 'postgres', tableOwnerOid: '10', tableRls: false, tableForceRls: false,
    procedureName: 'run_probe', procedureOid: '104', procedureOwner: 'postgres', procedureOwnerOid: '10',
    procedureKind: 'p', procedureIdentityArguments: 'operation_hash text', procedureConfig: null, procedureMd5, invoker: true,
    relations: [{ oid: '102', name: 'control', kind: 'r', owner: 'postgres', ownerOid: '10', rawAcl: null }, { oid: '103', name: 'control_pkey', kind: 'i', owner: 'postgres', ownerOid: '10', rawAcl: null }],
    procedures: [{ oid: '104', name: 'run_probe', kind: 'p', ownerOid: '10', config: null, invoker: true, identityArguments: 'operation_hash text' }],
    types: [{ oid: '105', name: 'control', kind: 'c', relationOid: '102', elementOid: '0', ownerOid: '10' }, { oid: '106', name: '_control', kind: 'b', relationOid: '0', elementOid: '105', ownerOid: '10' }],
    namespaceDependencies: [], constraints: [{ oid: '107', name: 'control_pkey', kind: 'p', validated: true }, { oid: '108', name: 'control_singleton_check', kind: 'c', validated: true }, { oid: '109', name: 'control_phase_check', kind: 'c', validated: true }],
    triggerCount: 0, policyCount: 0, extraObjects: false,
  } : null;
  const probe: CollectorProbe | null = present ? {
    operation_id: operationId, operation_sha256: operationSha256, source_unit_sha256: sourceUnitSha256,
    migration_sha256: migrationSha256, procedure_source_md5: procedureMd5, procedure_oid: '104', command, job_name: jobName,
    job_id: '7', phase: 'PREPARED', old_role_row_present: true, old_role_settings: ['statement_timeout=120s', 'search_path=public'],
    armed_role_settings: null, prepared_schedule: '* * * * *', armed_schedule: null, armed_at: null,
    started_at: null, expires_at: null, run_id: null, backend_pid: null, backend_start: null,
  } : null;
  const raw: CollectorFacts = {
    kind: 'FIXED_CURRENT_READ_ONLY_FACTS', expectedProject: project, projectIdentityFromSql: null, operationId,
    statementAt: '2026-10-15T15:00:29.000002+00:00', readStartedAt: '2026-10-15T15:00:29.000003+00:00',
    readCompletedAt: '2026-10-15T15:00:30.000003+00:00', transactionStartedAt: '2026-10-15T15:00:29.000001+00:00',
    actor: { sessionUser: 'postgres', currentUser: 'postgres', role: 'none', database: 'postgres', sessionUserOid: '10', currentUserOid: '10', operatorRoleOid: '10', databaseOid: '5', superuser: false, ssl: true, backendPid: 300, backendStart: '2026-10-15T14:00:00.000001Z' },
    setting: { roleOid: '10', databaseOid: '5', rowPresent: present, entries: present ? [...probe!.old_role_settings!] : null,
      rawRow: present ? { setrole: 10, setdatabase: 5, setconfig: [...probe!.old_role_settings!] } : null },
    probeRows: present ? [probe!] : null, inventory,
    objectAcls: present ? ([['schema', '101', ['USAGE', 'CREATE']], ['table', '102', tablePrivileges], ['procedure', '104', ['EXECUTE']]] as [string, string, string[]][]).map(([kind, oid, privileges]) => ({ kind, oid, rawAcl: null, normalizedAcl: ['SIMULATED_OWNER_ONLY'], grants: grants(privileges as string[]) })) : [],
    columnAcls: present ? Array.from({ length: 40 }, (_, n) => ({ number: n + 1, name: `simulated_column_${n + 1}`, typeOid: '25', rawAcl: null, normalizedAcl: [], grants: [] })) : [],
    effectivePrivileges: roles.map((role, n) => ({ role, roleOid: n ? String(20 + n) : '0', rolePresent: true,
      schemaUsage: present ? false : null, schemaCreate: present ? false : null, procedureExecute: present ? false : null,
      tablePrivileges: Object.fromEntries(tablePrivileges.map(p => [p, present ? false : null])),
      anyColumnPrivileges: Object.fromEntries(columnPrivileges.map(p => [p, present ? false : null])) })),
    jobs: present ? [{ jobId: '7', jobName, command, username: 'postgres', database: 'postgres', host: 'SIMULATED_NATIVE_HOST', port: 5432, schedule: '* * * * *', active: false }] : null,
    runs: present ? [] : null, cronMetadataGuards: { jobNativeShapeSafe: present, runNativeShapeSafe: present, exactOwnedJobMatches: present },
    ownedBackendCandidates: present ? [] : null, ownedBackendCensusComplete: present, ownedBackendPresent: present ? false : null,
    cronExtension: present ? { oid: '200', version: '1.6', ownerOid: '201', owner: 'supabase_admin' } : null,
    serverSettings: { statementTimeout: '10s', cronBackgroundWorkers: present ? 'off' : null, cronHost: present ? 'SIMULATED_NATIVE_HOST' : null, port: '5432', serverVersionNumber: '170006' },
    issues: present ? [] : ['PROBE_SCHEMA_ABSENT_CURRENT_OBSERVATION_ONLY', 'CONTROL_ABSENT_OR_UNSAFE_SHAPE', 'CRON_JOB_ABSENT_OR_NATIVE_OWNERSHIP_TYPE_POLICY_DRIFT', 'RUN_HISTORY_OR_ORIGINAL_JOB_BINDING_UNKNOWN'],
    status: 'UNKNOWN_REQUIRES_EXTERNAL_TARGET_AND_ORIGINAL_CUSTODY', originalPreWriteCustodyEstablished: false, originalArmCustodyEstablished: false,
    nativeExecutionAuthorized: false, nativeAcceptance: false, authenticCustodyCreated: false, futureEffectAdmitted: false,
  };
  const intent: RecoveryIntent = {
    operationId, operationSha256, descriptorSha256: 'b'.repeat(64), sourceUnitSha256, migrationSha256, procedureMd5, schema, jobName, command,
    roleOid: '10', databaseOid: '5', project, originalRoleRowPresent: true, originalRoleSettings: ['statement_timeout=120s', 'search_path=public'], priorOwnedSchemaAbsent: true,
    writeIntent: { stage: 'prepare', writeAttempts: 1, operationId, descriptorSha256: 'b'.repeat(64), sourceUnitSha256, issuedAt: '2026-10-15T14:58:30.000001Z' },
  };
  const evidence: CurrentReadEvidence = { dataClass: 'SIMULATED_CURRENT_READ', currentRead: { querySha256, endpoint: `https://api.supabase.com/v1/projects/${project}/database/query`, issuedAt, observedAt, responseSha256: '' }, decisionAt: observedAt,
    intent: present ? intent : null, custody: null, acknowledgement: null, originalRunBinding: null, originalArmBinding: null, armIntent: null, unrelatedApplicationDrift: false, unrelatedSourceDrift: false };
  return { raw, evidence, encode() { const body = JSON.stringify([{ privateCurrentFacts: raw }]); evidence.currentRead.responseSha256 = createHash('sha256').update(body).digest('hex'); return body; } };
}

export function armedCurrentFixture() {
  const f = currentFixture(true), p = f.raw.probeRows![0], inventory = f.raw.inventory!;
  Object.assign(p, { phase: 'ARMED', armed_role_settings: ['search_path=public', 'statement_timeout=5s'], armed_schedule: '0 15 15 10 *', armed_at: '2026-10-15T14:59:01.000001Z', started_at: '2026-10-15T15:00:00.000001Z', expires_at: '2026-10-15T15:00:15.000001Z', run_id: '41', backend_pid: 321, backend_start: '2026-10-15T14:59:59.500001Z' });
  f.raw.setting.entries = [...p.armed_role_settings!]; f.raw.setting.rawRow!.setconfig = [...p.armed_role_settings!];
  f.raw.jobs![0].active = true; f.raw.jobs![0].schedule = p.armed_schedule!;
  f.raw.runs = [{ runId: '41', jobId: '7', jobPid: 321, status: 'failed', startTime: '2026-10-15T15:00:00.010001Z', endTime: '2026-10-15T15:00:05.100001Z', command, username: 'postgres', database: 'postgres', privateReturnMessage: 'SIMULATED_PRIVATE_MESSAGE', returnMessageCharacters: 25, returnMessageBytes: 25, returnMessageTruncated: false }];
  f.evidence.custody = { operationId, jobId: '7', inventory: { namespaceName: schema, namespaceOid: inventory.namespaceOid, namespaceOwner: 'postgres', tableOid: inventory.tableOid, tableOwner: 'postgres', procedureOid: inventory.procedureOid, procedureOwner: 'postgres', procedureMd5, invoker: true, tablePrivilegeContract: 'POSTGRESQL_17_OWNER_EIGHT',
    relations: inventory.relations.map(({ oid, name, kind, owner }) => ({ oid, name, kind, owner })),
    schemaAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: ['USAGE', 'CREATE'], grantable: false }],
    tableAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: tablePrivileges, grantable: false }],
    procedureAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: ['EXECUTE'], grantable: false }],
    privacy: roles.map(role => ({ role, schemaUsage: false, schemaCreate: false, tableAccess: false, procedureExecute: false })) } };
  f.evidence.armIntent = { stage: 'arm', writeAttempts: 1, operationId, descriptorSha256: f.evidence.intent!.descriptorSha256, sourceUnitSha256, issuedAt: '2026-10-15T14:59:00.000001Z' };
  f.evidence.originalRunBinding = { operationId, jobId: '7', runId: '41', backendPid: 321, backendStart: p.backend_start! };
  return f;
}
