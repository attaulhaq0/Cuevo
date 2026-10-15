// OFFLINE REVIEW ONLY. Pure supplied-fact decisions, no I/O or native authorization.
import { types } from 'node:util';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha = /^[a-f0-9]{64}$/;
const md5 = /^[a-f0-9]{32}$/;
const actors = ['PUBLIC', 'anon', 'authenticated', 'service_role', 'cuevo_api', 'cuevo_worker', 'authenticator'];
const terminal = new Set(['succeeded', 'failed']);
const nativeStatuses = new Set(['starting', 'connecting', 'sending', 'running', ...terminal]);
const oid = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && BigInt(value) <= 4294967295n;
const id = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const pid = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const timeout = value => /^\d+(?:\.\d+)?(?:us|ms|s|min|h|d)?$/.test(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Reject proxies/accessors before reading values. No getter supplies evidence.
function boundedData(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 1200 || depth > 10) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 4096 && !value.includes('\0');
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'object' || types.isProxy(value)) return false;
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const properties = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(properties);
  if (keys.some(key => typeof key !== 'string') || keys.length > (Array.isArray(value) ? 65 : 40)) return false;
  if (Array.isArray(value) && value.length > 64) return false;
  return keys.every(key => key === 'length' && Array.isArray(value) ||
    Object.hasOwn(properties[key], 'value') && boundedData(properties[key].value, budget, depth + 1));
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const day = Number(value.slice(8, 10)), month = Number(value.slice(5, 7)), year = Number(value.slice(0, 4));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = (value.match(/\.(\d{1,6})/)?.[1] ?? '').padEnd(6, '0');
  return BigInt(milliseconds) * 1000n + BigInt(fraction.slice(3));
}

function settings(rowPresent, entries) {
  if (rowPresent === false) return entries === null ? { timeout: null } : null;
  if (rowPresent !== true || !Array.isArray(entries) || entries.length === 0 || entries.length > 64) return null;
  const names = new Set(); let originalTimeout = null;
  for (const entry of entries) {
    if (typeof entry !== 'string' || !/^[a-z_][a-z_0-9]*=.{1,256}$/.test(entry)) return null;
    const separator = entry.indexOf('='), name = entry.slice(0, separator), value = entry.slice(separator + 1);
    if (names.has(name)) return null; names.add(name);
    if (name === 'statement_timeout') { if (!timeout(value)) return null; originalTimeout = value; }
  }
  return { timeout: originalTimeout };
}

function privateInventory(inventory) {
  if (!inventory || !['namespaceOid', 'tableOid', 'procedureOid'].every(key => oid(inventory[key]))
    || new Set([inventory.namespaceOid, inventory.tableOid, inventory.procedureOid]).size !== 3
    || !['namespaceOwner', 'tableOwner', 'procedureOwner'].every(key => inventory[key] === 'postgres')
    || inventory.invoker !== true || !md5.test(inventory.procedureMd5)) return false;
  if (!Array.isArray(inventory.relations) || inventory.relations.length !== 2
    || !inventory.relations.some(row => row.oid === inventory.tableOid && row.name === 'control' && row.kind === 'r' && row.owner === 'postgres')
    || !inventory.relations.some(row => oid(row.oid) && row.oid !== inventory.tableOid && row.name === 'control_pkey' && row.kind === 'i' && row.owner === 'postgres')) return false;
  // An absent contract retains only the historical supplied-fact seven-owner
  // review shape. Current PostgreSQL17 mapping explicitly requires all eight.
  const legacyTablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  const tablePrivileges = inventory.tablePrivilegeContract === 'POSTGRESQL_17_OWNER_EIGHT'
    ? [...legacyTablePrivileges, 'MAINTAIN'] : inventory.tablePrivilegeContract === undefined ? legacyTablePrivileges : null;
  if (!tablePrivileges) return false;
  for (const [key, permitted] of [['schemaAcl', ['USAGE', 'CREATE']], ['tableAcl', tablePrivileges], ['procedureAcl', ['EXECUTE']]]) {
    const rows = inventory[key];
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].grantee !== 'postgres' || rows[0].grantor !== 'postgres'
      || rows[0].grantable !== false || !Array.isArray(rows[0].privileges)
      || new Set(rows[0].privileges).size !== permitted.length || !permitted.every(privilege => rows[0].privileges.includes(privilege))) return false;
  }
  return Array.isArray(inventory.privacy) && inventory.privacy.length === actors.length
    && new Set(inventory.privacy.map(row => row.role)).size === actors.length
    && inventory.privacy.every(row => actors.includes(row.role) && ['schemaUsage', 'schemaCreate', 'tableAccess', 'procedureExecute'].every(key => row[key] === false));
}

/** Input facts must come from separately validated native readers before any future adoption.
 * This module does not authenticate them, persist custody or clear an execution hold.
 */
export function decideRecovery(action, input) {
  const result = { status: 'unknown', reasons: [], nativeExecutionAuthorized: false, nativeAcceptance: false,
    authenticCustodyCreated: false, futureEffectAdmitted: false, diagnosticReadAdmitted: false,
    preparationReadbackMatches: false, restorationAdvice: null };
  const finish = (status, reason) => ({ ...result, status, reasons: reason ? [reason] : [] });
  try {
    if (!['prepare', 'observe', 'restore'].includes(action) || !boundedData(input)) return finish('unknown', 'MALFORMED_REVIEW_INPUT');
    const { intent: i, readback: r, custody, acknowledgement: ack } = input;
    if (!i || !uuid.test(i.operationId) || ![i.operationSha256, i.descriptorSha256, i.sourceUnitSha256, i.migrationSha256].every(value => typeof value === 'string' && sha.test(value))
      || !md5.test(i.procedureMd5) || !oid(i.roleOid) || !oid(i.databaseOid) || typeof i.command !== 'string'
      || !i.command.length || !/^cuevo_probe_[a-f0-9]{20}$/.test(i.schema)
      || typeof i.jobName !== 'string' || !i.jobName.length || !settings(i.originalRoleRowPresent, i.originalRoleSettings)) return finish('unknown', 'ORIGINAL_INTENT_INCOMPLETE');
    if (i.writeIntent?.stage !== 'prepare' || i.writeIntent?.writeAttempts !== 1 || i.writeIntent?.operationId !== i.operationId
      || i.priorOwnedSchemaAbsent !== true) return finish('refused', 'ORIGINAL_PREWRITE_INTENT_CONFLICT');
    if (![i.writeIntent.descriptorSha256, i.writeIntent.sourceUnitSha256].every(value => typeof value === 'string' && sha.test(value))
      || instant(i.writeIntent.issuedAt) === null) return finish('unknown', 'ORIGINAL_PREWRITE_INTENT_INCOMPLETE');
    if (i.writeIntent.descriptorSha256 !== i.descriptorSha256 || i.writeIntent.sourceUnitSha256 !== i.sourceUnitSha256) return finish('refused', 'ORIGINAL_PREWRITE_SOURCE_CONFLICT');
    if (!r || r.complete !== true || r.origin !== 'INDEPENDENT_POST_WRITE_READ') return finish('unknown', 'INDEPENDENT_READBACK_MISSING');
    const issued = instant(r.issuedAt), observed = instant(r.observedAt), decision = instant(input.decisionAt);
    if (issued === null || observed === null || decision === null) return finish('unknown', 'READ_CLOCK_UNKNOWN');
    const prepareIssued = instant(i.writeIntent.issuedAt);
    if (prepareIssued > issued) return finish('refused', 'ORIGINAL_PREWRITE_CLOCK_CONFLICT');
    if (observed < issued || decision < observed || decision - issued > 30000000n) return finish('refused', 'READ_CLOCK_STALE_OR_CONFLICTING');
    if (r.actor?.sessionUser !== 'postgres' || r.actor?.currentUser !== 'postgres' || r.actor?.role !== 'none'
      || r.actor?.database !== 'postgres' || r.actor?.superuser !== false || r.actor?.ssl !== true) return finish('refused', 'OPERATOR_CONFLICT');
    if (r.project !== i.project || r.sourceUnitSha256 !== i.sourceUnitSha256 || r.migrationSha256 !== i.migrationSha256) return finish('refused', 'SOURCE_OR_TARGET_CONFLICT');
    if (!r.probe || !r.job || !r.inventory) return finish('unknown', 'OWNED_INVENTORY_MISSING');
    const p = r.probe, j = r.job;
    if (p.operationId !== i.operationId || p.operationSha256 !== i.operationSha256 || p.sourceUnitSha256 !== i.sourceUnitSha256
      || p.migrationSha256 !== i.migrationSha256 || p.procedureMd5 !== i.procedureMd5 || r.inventory.procedureMd5 !== i.procedureMd5) return finish('refused', 'OWNED_SOURCE_OR_OPERATION_CONFLICT');
    if (!id(p.jobId) || p.jobId !== j.jobId || j.jobName !== i.jobName || j.command !== i.command || j.username !== 'postgres'
      || j.database !== 'postgres' || typeof j.active !== 'boolean' || typeof j.schedule !== 'string' || !j.schedule.length) return finish('refused', 'OWNED_JOB_CONFLICT');
    if (custody && (custody.operationId !== i.operationId || custody.jobId !== p.jobId || !equal(custody.inventory, r.inventory))) return finish('refused', 'ORIGINAL_CUSTODY_CONFLICT');
    if (r.inventory.namespaceName !== undefined && r.inventory.namespaceName !== i.schema
      || ['namespaceOwner', 'tableOwner', 'procedureOwner'].some(key => typeof r.inventory[key] === 'string' && r.inventory[key] !== 'postgres')
      || ['schemaAcl', 'tableAcl', 'procedureAcl'].some(key => Array.isArray(r.inventory[key]) && r.inventory[key].some(row => typeof row.grantee === 'string' && row.grantee !== 'postgres'))
      || Array.isArray(r.inventory.privacy) && r.inventory.privacy.some(row => ['schemaUsage', 'schemaCreate', 'tableAccess', 'procedureExecute'].some(key => row[key] === true))) return finish('refused', 'OWNED_PRIVATE_INVENTORY_CONFLICT');
    if (r.inventory.namespaceName !== i.schema || !privateInventory(r.inventory)) return finish('unknown', 'PRIVATE_OWNED_INVENTORY_UNPROVED');
    if (ack && (ack.operationId !== undefined && ack.operationId !== i.operationId || ack.jobId !== undefined && ack.jobId !== p.jobId)) return finish('refused', 'ACKNOWLEDGEMENT_IDENTITY_CONFLICT');
    if (p.oldRoleRowPresent !== i.originalRoleRowPresent || !equal(p.oldRoleSettings, i.originalRoleSettings)) return finish('refused', 'ORIGINAL_SCOPED_SETTING_CONFLICT');
    const scoped = r.setting;
    if (!scoped || !settings(scoped.rowPresent, scoped.entries)) return finish('unknown', 'SCOPED_SETTING_UNKNOWN');
    if (scoped.roleOid !== i.roleOid || scoped.databaseOid !== i.databaseOid) return finish('refused', 'SCOPED_SETTING_IDENTITY_CONFLICT');
    if (!Array.isArray(r.runs) || r.runs.length > 64 || r.ownedBackendPresent !== false && r.ownedBackendPresent !== true && r.ownedBackendPresent !== null) return finish('unknown', 'NATIVE_OBSERVATION_UNKNOWN');
    if (!r.runs.every(run => id(run.runId) && id(run.jobId) && nativeStatuses.has(run.status))) return finish('unknown', 'NATIVE_RUN_SHAPE_UNKNOWN');
    if (new Set(r.runs.map(run => run.runId)).size !== r.runs.length) return finish('refused', 'DUPLICATE_RUN_CONFLICT');
    const ownRuns = r.runs.filter(run => run.jobId === p.jobId);
    if (ownRuns.some(run => run.username !== 'postgres' || run.database !== 'postgres' || run.command !== i.command)) return finish('refused', 'OWNED_NATIVE_RUN_SOURCE_CONFLICT');
    if (['ARMED', 'RESTORED'].includes(p.phase)) {
      if (typeof p.armedSchedule !== 'string' || !p.armedSchedule.length) return finish('unknown', 'ORIGINAL_ARM_SCHEDULE_UNOBSERVED');
      if (p.armedSchedule !== j.schedule) return finish('refused', 'ORIGINAL_ARM_SCHEDULE_CONFLICT');
      const armIntent = input.armIntent;
      if (!armIntent) return finish('unknown', 'ORIGINAL_ARM_INTENT_MISSING');
      if (armIntent.stage !== 'arm' || armIntent.writeAttempts !== 1 || armIntent.operationId !== i.operationId
        || armIntent.descriptorSha256 !== i.descriptorSha256 || armIntent.sourceUnitSha256 !== i.sourceUnitSha256) return finish('refused', 'ORIGINAL_ARM_INTENT_CONFLICT');
      const armIssued = instant(armIntent.issuedAt), armedAt = instant(p.armedAt);
      if (armIssued === null || armedAt === null) return finish('unknown', 'ORIGINAL_ARM_CLOCK_UNKNOWN');
      if (prepareIssued > armIssued || armIssued > armedAt || armedAt > observed) return finish('refused', 'ORIGINAL_ARM_CLOCK_CONFLICT');
    }
    const binding = input.originalRunBinding;
    if (binding && (binding.operationId !== i.operationId || binding.jobId !== p.jobId || !id(binding.runId) || binding.runId !== p.runId
      || !pid(binding.backendPid) || binding.backendPid !== p.backendPid || instant(binding.backendStart) === null
      || instant(binding.backendStart) !== instant(p.backendStart))) return finish('refused', 'ORIGINAL_RUN_BINDING_CONFLICT');
    result.diagnosticReadAdmitted = true;
    if (action === 'observe') return finish('advice');
    if (action === 'prepare') {
      if (input.unrelatedApplicationDrift !== false || input.unrelatedSourceDrift !== false) return finish('refused', 'PREPARATION_SOURCE_OR_APPLICATION_DRIFT');
      if (p.phase !== 'PREPARED' || j.active !== false || j.schedule !== '* * * * *' || r.runs.length !== 0 || p.startedAt !== null
        || p.runId !== null || r.ownedBackendPresent !== false) return finish('refused', 'DORMANT_PREPARATION_CONFLICT');
      if (scoped.rowPresent !== i.originalRoleRowPresent || !equal(scoped.entries, i.originalRoleSettings)) return finish('refused', 'PREPARATION_SETTING_CONFLICT');
      result.preparationReadbackMatches = true; return finish('advice');
    }
    if (!custody) return finish('unknown', 'ORIGINAL_RESTORATION_CUSTODY_MISSING');
    if (p.phase !== 'ARMED' || !settings(true, p.armedRoleSettings) || scoped.rowPresent !== true
      || !equal(scoped.entries, p.armedRoleSettings) || settings(true, scoped.entries).timeout !== '5s') return finish('refused', 'EXACT_ARMED_SETTING_CONFLICT');
    const arm = input.originalArmBinding;
    if (arm && (arm.operationId !== i.operationId || arm.jobId !== p.jobId || arm.schedule !== j.schedule
      || arm.roleOid !== i.roleOid || arm.databaseOid !== i.databaseOid || !equal(arm.armedRoleSettings, p.armedRoleSettings))) return finish('refused', 'ORIGINAL_ARM_BINDING_CONFLICT');
    const untouched = entries => (entries ?? []).filter(entry => !entry.startsWith('statement_timeout='));
    if (!equal(untouched(i.originalRoleSettings), untouched(p.armedRoleSettings))) return finish('refused', 'UNRELATED_SCOPED_SETTING_CHANGED_DURING_ARM');
    if (!Array.isArray(r.ownedJobBackends)) return finish('unknown', 'OWNED_JOB_BACKEND_CENSUS_MISSING');
    if (!r.ownedJobBackends.every(row => row.jobId === p.jobId && pid(row.pid) && instant(row.backendStart) !== null)) return finish('unknown', 'OWNED_JOB_BACKEND_CENSUS_UNKNOWN');
    if (r.ownedJobBackends.length !== 0) return finish('refused', 'OWNED_JOB_BACKENDS_STILL_PRESENT');
    if (ownRuns.some(run => !terminal.has(run.status) || instant(run.startTime) === null || instant(run.endTime) === null)
      || r.ownedBackendPresent === null) return finish('unknown', 'ORIGINAL_RUN_NOT_SETTLED');
    if (ownRuns.some(run => instant(run.endTime) < instant(run.startTime))) return finish('refused', 'ORIGINAL_NATIVE_RUN_CONFLICT');
    if (r.ownedBackendPresent !== false) return finish('refused', 'OWNED_BACKEND_STILL_PRESENT');
    const expires = instant(p.expiresAt);
    if (expires === null) return finish('unknown', 'ELIGIBILITY_CLOCK_UNKNOWN');
    if (observed <= expires) return finish('refused', 'ORIGINAL_ELIGIBILITY_STILL_OPEN');
    if (p.startedAt === null) {
      if (binding || p.runId !== null || p.backendPid !== null || p.backendStart !== null) return finish('unknown', 'PARTIAL_NO_START_LATCH');
    } else {
      if (instant(p.startedAt) === null) return finish('unknown', 'ELIGIBILITY_CLOCK_UNKNOWN');
      if (!binding) return finish('unknown', 'ORIGINAL_RESTORATION_CUSTODY_MISSING');
      const run = ownRuns.find(row => row.runId === binding.runId);
      if (!run) return finish('unknown', 'ORIGINAL_RUN_NOT_SETTLED');
      if (run.jobPid !== binding.backendPid) return finish('refused', 'ORIGINAL_NATIVE_RUN_CONFLICT');
    }
    const prior = settings(i.originalRoleRowPresent, i.originalRoleSettings);
    result.restorationAdvice = { kind: prior.timeout === null ? 'RESET_ORIGINAL_TIMEOUT' : 'SET_ORIGINAL_TIMEOUT',
      originalValue: prior.timeout, roleOid: i.roleOid, databaseOid: i.databaseOid, preserveUnrelatedEntries: true };
    return finish('advice');
  } catch { return finish('unknown', 'MALFORMED_REVIEW_INPUT'); }
}
