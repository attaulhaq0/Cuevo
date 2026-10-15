// All fixtures are invented in-memory data for OFFLINE review. They are not live receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRecovery } from './recovery-policy.mjs';
import type { CollectorActor, CollectorJob, CollectorRun, CollectorSetting, CurrentReadEvidence, PolicyInventory, RecoveryIntent, RecoveryWriteIntent } from './current-facts';
type PolicyProbe = { operationId: string; operationSha256: string; sourceUnitSha256: string; migrationSha256: string; procedureMd5: string; jobId: string; phase: string; oldRoleRowPresent: boolean; oldRoleSettings: string[] | null; armedRoleSettings: string[] | null; armedSchedule?: string; armedAt?: string; startedAt: string | null; expiresAt: string | null; runId: string | null; backendPid: number | null; backendStart: string | null };
type PolicyReadback = { [key: string]: unknown; origin: string; complete: boolean; issuedAt: string; observedAt: string; actor: Pick<CollectorActor, 'sessionUser' | 'currentUser' | 'role' | 'database' | 'superuser' | 'ssl'>; project: string; sourceUnitSha256: string; migrationSha256: string; probe: PolicyProbe; job: Omit<CollectorJob, 'host' | 'port'>; inventory: PolicyInventory | null; setting: Omit<CollectorSetting, 'rawRow'>; runs: Pick<CollectorRun, 'runId' | 'jobId' | 'jobPid' | 'username' | 'database' | 'command' | 'status' | 'startTime' | 'endTime'>[]; ownedBackendPresent: boolean | null; ownedJobBackends: { jobId: string; pid: number; backendStart: string }[] };
type PolicyReviewFixture = Omit<CurrentReadEvidence, 'currentRead' | 'dataClass'> & { fixtureClass: string; readback: PolicyReadback | null };


const fixture = (): PolicyReviewFixture => {
  const intent: RecoveryIntent = {
    operationId: '80390cdc-1e28-4107-9020-253cd7d8a588', operationSha256: 'a'.repeat(64),
    descriptorSha256: 'b'.repeat(64), sourceUnitSha256: 'c'.repeat(64), migrationSha256: 'd'.repeat(64),
    procedureMd5: 'e'.repeat(32), schema: 'cuevo_probe_80390cdc1e2841079020',
    jobName: 'cuevo-commit-timeout-80390cdc-1e28-4107-9020-253cd7d8a588',
    command: "CALL cuevo_probe_80390cdc1e2841079020.run_probe('SIMULATED_ONLY');",
    roleOid: '10', databaseOid: '5', project: 'simulated-private-project',
    originalRoleRowPresent: true, originalRoleSettings: ['statement_timeout=120s', 'search_path=public'],
    writeIntent: { stage: 'prepare', writeAttempts: 1, operationId: '80390cdc-1e28-4107-9020-253cd7d8a588', descriptorSha256: 'b'.repeat(64), sourceUnitSha256: 'c'.repeat(64), issuedAt: '2026-10-15T14:58:30.000000Z' },
    priorOwnedSchemaAbsent: true,
  };
  const inventory: PolicyInventory = {
    namespaceOid: '101', namespaceOwner: 'postgres', namespaceName: intent.schema, tableOid: '102', tableOwner: 'postgres',
    procedureOid: '104', procedureOwner: 'postgres', procedureMd5: intent.procedureMd5, invoker: true,
    schemaAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: ['USAGE', 'CREATE'], grantable: false }],
    tableAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], grantable: false }],
    procedureAcl: [{ grantee: 'postgres', grantor: 'postgres', privileges: ['EXECUTE'], grantable: false }],
    relations: [{ oid: '102', name: 'control', kind: 'r', owner: 'postgres' }, { oid: '103', name: 'control_pkey', kind: 'i', owner: 'postgres' }],
    privacy: ['PUBLIC', 'anon', 'authenticated', 'service_role', 'cuevo_api', 'cuevo_worker', 'authenticator'].map(role => ({ role, schemaUsage: false, schemaCreate: false, tableAccess: false, procedureExecute: false })),
  };
  const readback: PolicyReadback = {
    origin: 'INDEPENDENT_POST_WRITE_READ', complete: true, issuedAt: '2026-10-15T15:00:29.000000Z', observedAt: '2026-10-15T15:00:30.000000Z',
    actor: { sessionUser: 'postgres', currentUser: 'postgres', role: 'none', database: 'postgres', superuser: false, ssl: true },
    project: intent.project, sourceUnitSha256: intent.sourceUnitSha256, migrationSha256: intent.migrationSha256,
    probe: { operationId: intent.operationId, operationSha256: intent.operationSha256, sourceUnitSha256: intent.sourceUnitSha256,
      migrationSha256: intent.migrationSha256, procedureMd5: intent.procedureMd5, jobId: '7', phase: 'PREPARED',
      oldRoleRowPresent: true, oldRoleSettings: [...intent.originalRoleSettings!], armedRoleSettings: null,
      startedAt: null, expiresAt: null, runId: null, backendPid: null, backendStart: null },
    job: { jobId: '7', jobName: intent.jobName, command: intent.command, username: 'postgres', database: 'postgres', schedule: '* * * * *', active: false },
    inventory, setting: { roleOid: '10', databaseOid: '5', rowPresent: true, entries: [...intent.originalRoleSettings!] },
    runs: [], ownedBackendPresent: false, ownedJobBackends: [],
  };
  return { fixtureClass: 'SIMULATED_OFFLINE_REVIEW', decisionAt: '2026-10-15T15:00:30.000000Z', intent, readback,
    acknowledgement: { status: 'PREPARED', operationId: intent.operationId, jobId: '7' },
    custody: { operationId: intent.operationId, jobId: '7', inventory: structuredClone(inventory) },
    originalRunBinding: null, originalArmBinding: null, armIntent: null, unrelatedApplicationDrift: false, unrelatedSourceDrift: false };
};
const armed = () => {
  const f = fixture();
  Object.assign(f.readback!.probe, { phase: 'ARMED', armedRoleSettings: ['search_path=public', 'statement_timeout=5s'],
    armedAt: '2026-10-15T14:59:01.000000Z', startedAt: '2026-10-15T15:00:00.000000Z', expiresAt: '2026-10-15T15:00:15.000000Z', runId: '41', backendPid: 321, backendStart: '2026-10-15T14:59:59.500001Z' });
  f.readback!.setting.entries = [...f.readback!.probe.armedRoleSettings!];
  f.readback!.job.schedule = '0 15 15 10 *'; f.readback!.probe.armedSchedule = f.readback!.job.schedule; f.readback!.job.active = true;
  f.originalRunBinding = { operationId: f.intent!.operationId, jobId: '7', runId: '41', backendPid: 321, backendStart: f.readback!.probe.backendStart! };
  f.originalArmBinding = { operationId: f.intent!.operationId, jobId: '7', schedule: f.readback!.job.schedule,
    roleOid: f.intent!.roleOid, databaseOid: f.intent!.databaseOid, armedRoleSettings: [...f.readback!.probe.armedRoleSettings!] };
  f.armIntent = { stage: 'arm', writeAttempts: 1, operationId: f.intent!.operationId, descriptorSha256: f.intent!.descriptorSha256,
    sourceUnitSha256: f.intent!.sourceUnitSha256, issuedAt: '2026-10-15T14:59:00.000000Z' };
  f.readback!.runs = [{ runId: '41', jobId: '7', jobPid: 321, username: 'postgres', database: 'postgres', command: f.intent!.command,
    status: 'failed', startTime: '2026-10-15T15:00:00.010000Z', endTime: '2026-10-15T15:00:05.100000Z' }];
  return f;
};
const check = (action: string, f: unknown, status: string, reason?: string) => {
  const result = decideRecovery(action, f);
  assert.equal(result.status, status);
  if (reason) assert.ok(result.reasons.includes(reason), JSON.stringify(result));
  assert.equal(result.nativeExecutionAuthorized, false);
  assert.equal(result.nativeAcceptance, false);
  assert.equal(result.authenticCustodyCreated, false);
  return result;
};

test('PREPARED acknowledgement without independent post inventory remains unknown', () => {
  const f = fixture(); f.readback = null;
  check('prepare', f, 'unknown', 'INDEPENDENT_READBACK_MISSING');
});
test('lost ACK with matching independent preparation facts permits review observation only', () => {
  const f = fixture(); f.acknowledgement = null; f.custody = null;
  const r = check('prepare', f, 'advice'); assert.equal(r.preparationReadbackMatches, true);
});
test('missing custody cannot strand original-intent read-only settlement', () => {
  const f = fixture(); f.custody = null; f.acknowledgement = null;
  const r = check('observe', f, 'advice'); assert.equal(r.diagnosticReadAdmitted, true); assert.equal(r.futureEffectAdmitted, false);
});
test('unrelated application and source drift does not strand exact owned scoped restoration advice', () => {
  const f = armed(); f.unrelatedApplicationDrift = true; f.unrelatedSourceDrift = true;
  const r = check('restore', f, 'advice'); assert.deepEqual(r.restorationAdvice, {
    kind: 'SET_ORIGINAL_TIMEOUT', originalValue: '120s', roleOid: '10', databaseOid: '5', preserveUnrelatedEntries: true,
  });
});

test('known owner, schema and private grant conflicts refuse even without saved custody', () => {
  for (const mutate of [
    (f: PolicyReviewFixture) => { f.readback!.inventory!.procedureOwner = 'other_owner'; },
    (f: PolicyReviewFixture) => { f.readback!.inventory!.namespaceName = 'cuevo_probe_11111111111111111111'; },
    (f: PolicyReviewFixture) => { f.readback!.inventory!.privacy[1].schemaUsage = true; },
    (f: PolicyReviewFixture) => { f.readback!.inventory!.procedureAcl[0].grantee = 'PUBLIC'; },
  ]) { const f = fixture(); f.custody = null; mutate(f); check('observe', f, 'refused'); }
});
test('original bound run conflicts also refuse diagnostic settlement', () => {
  const f = armed(); f.readback!.probe.runId = '42'; check('observe', f, 'refused');
});
test('preparation observation cannot ignore application drift', () => {
  const f = fixture(); f.unrelatedApplicationDrift = true; check('prepare', f, 'refused');
});
test('same timeout value under a replacement role OID refuses restoration', () => {
  const f = armed(); f.readback!.setting.roleOid = '11'; check('restore', f, 'refused', 'SCOPED_SETTING_IDENTITY_CONFLICT');
});
test('same timeout value under a replacement database OID refuses restoration', () => {
  const f = armed(); f.readback!.setting.databaseOid = '6'; check('restore', f, 'refused', 'SCOPED_SETTING_IDENTITY_CONFLICT');
});
test('missing private grants are unknown despite matching owned names', () => {
  const f = fixture(); f.custody = null; delete (f.readback!.inventory! as Partial<PolicyInventory>).privacy;
  check('prepare', f, 'unknown', 'PRIVATE_OWNED_INVENTORY_UNPROVED');
});
test('stale read cannot be refreshed by a late decision clock', () => {
  const f = armed(); f.decisionAt = '2026-10-15T15:01:00.000001Z';
  check('restore', f, 'refused', 'READ_CLOCK_STALE_OR_CONFLICTING');
});
test('reversed read and decision clocks refuse', () => {
  const f = fixture(); f.decisionAt = '2026-10-15T15:00:29.999999Z';
  check('observe', f, 'refused', 'READ_CLOCK_STALE_OR_CONFLICTING');
});
test('same body under conflicting operation hash refuses', () => {
  const f = fixture(); f.readback!.probe.operationSha256 = 'f'.repeat(64);
  check('observe', f, 'refused', 'OWNED_SOURCE_OR_OPERATION_CONFLICT');
});
test('changed source, migration, operation and job remain refused', () => {
  for (const mutate of [
    (f: PolicyReviewFixture) => { f.readback!.sourceUnitSha256 = 'f'.repeat(64); },
    (f: PolicyReviewFixture) => { f.readback!.migrationSha256 = 'f'.repeat(64); },
    (f: PolicyReviewFixture) => { f.readback!.probe.operationId = '80390cdc-1e28-4107-9020-253cd7d8a589'; },
    (f: PolicyReviewFixture) => { f.readback!.job.command = 'CALL other.run();'; },
    (f: PolicyReviewFixture) => { f.readback!.job.jobId = '8'; },
    (f: PolicyReviewFixture) => { f.readback!.inventory!.procedureMd5 = 'f'.repeat(32); },
    (f: PolicyReviewFixture) => { f.readback!.inventory!.tableOid = '105'; },
  ]) { const f = fixture(); mutate(f); check('observe', f, 'refused'); }
});
test('exact temporary row is essential, including unrelated entries in that row', () => {
  for (const entries of [['statement_timeout=5s'], ['search_path=private', 'statement_timeout=5s'], ['search_path=public', 'statement_timeout=120s']]) {
    const f = armed(); f.readback!.setting.entries = entries; check('restore', f, 'refused', 'EXACT_ARMED_SETTING_CONFLICT');
  }
});
test('unknown or active owned backend cannot produce restoration advice', () => {
  const f = armed(); f.readback!.ownedBackendPresent = null; check('restore', f, 'unknown', 'ORIGINAL_RUN_NOT_SETTLED');
  f.readback!.ownedBackendPresent = true; check('restore', f, 'refused', 'OWNED_BACKEND_STILL_PRESENT');
});
test('a terminal row still inside original eligibility window refuses restoration', () => {
  const f = armed(); f.readback!.probe.expiresAt = f.readback!.observedAt;
  check('restore', f, 'refused', 'ORIGINAL_ELIGIBILITY_STILL_OPEN');
});
test('running, missing and incomplete original run remain unknown', () => {
  for (const mutate of [(f: PolicyReviewFixture) => { f.readback!.runs = []; }, (f: PolicyReviewFixture) => { f.readback!.runs[0].status = 'running'; }, (f: PolicyReviewFixture) => { f.readback!.runs[0].endTime = null; }]) {
    const f = armed(); mutate(f); check('restore', f, 'unknown', 'ORIGINAL_RUN_NOT_SETTLED');
  }
});
test('a latest or extra run cannot stand in for original run custody', () => {
  const f = armed(); f.readback!.runs[0].runId = '42'; check('restore', f, 'unknown', 'ORIGINAL_RUN_NOT_SETTLED');
  f.readback!.runs.push({ ...f.readback!.runs[0], runId: '41' }); check('restore', f, 'advice');
});
test('PID reuse with different backend-start microseconds refuses', () => {
  const f = armed(); f.readback!.probe.backendStart = '2026-10-15T14:59:59.500002Z';
  check('restore', f, 'refused', 'ORIGINAL_RUN_BINDING_CONFLICT');
});
test('original absent timeout restores only absence while retaining unrelated settings', () => {
  const f = armed(); f.intent!.originalRoleSettings = ['search_path=public']; f.readback!.probe.oldRoleSettings = ['search_path=public'];
  const r = check('restore', f, 'advice'); assert.equal(r.restorationAdvice!.kind, 'RESET_ORIGINAL_TIMEOUT'); assert.equal(r.restorationAdvice!.originalValue, null);
});
test('original absent scoped row restores only timeout absence', () => {
  const f = armed(); f.intent!.originalRoleRowPresent = false; f.intent!.originalRoleSettings = null;
  f.readback!.probe.oldRoleRowPresent = false; f.readback!.probe.oldRoleSettings = null;
  f.readback!.probe.armedRoleSettings = ['statement_timeout=5s']; f.readback!.setting.entries = ['statement_timeout=5s'];
  f.originalArmBinding!.armedRoleSettings = ['statement_timeout=5s'];
  check('restore', f, 'advice');
});
test('ambiguous duplicate setting cannot select an arbitrary old timeout', () => {
  const f = armed(); f.intent!.originalRoleSettings!.push('statement_timeout=2min');
  check('restore', f, 'unknown', 'ORIGINAL_INTENT_INCOMPLETE');
});
test('partial read, effect acknowledgement masquerading as read and missing own table remain unknown', () => {
  for (const mutate of [(f: PolicyReviewFixture) => { f.readback!.complete = false; }, (f: PolicyReviewFixture) => { f.readback!.origin = 'EFFECT_ACKNOWLEDGEMENT'; }, (f: PolicyReviewFixture) => { f.readback!.inventory = null; }]) {
    const f = fixture(); mutate(f); check('prepare', f, 'unknown');
  }
});
test('missing original intent cannot admit a write retry or allocate a replacement', () => {
  const f = fixture(); f.intent = null; check('observe', f, 'unknown');
  const g = fixture(); g.intent!.writeIntent.writeAttempts = 2; check('observe', g, 'refused', 'ORIGINAL_PREWRITE_INTENT_CONFLICT');
});
test('failing acknowledgement is not runtime acceptance despite exact independent preparation', () => {
  const f = fixture(); f.acknowledgement!.status = 'REQUIRES_REVIEW';
  const r = check('prepare', f, 'advice'); assert.equal(r.preparationReadbackMatches, true); assert.equal(r.restorationAdvice, null);
});
test('getters, proxies, excess runs and private strings cannot become output evidence', () => {
  const f = fixture(); let touched = 0;
  Object.defineProperty(f.readback, 'inventory', { enumerable: true, get() { touched++; throw Error('PRIVATE'); } });
  check('observe', f, 'unknown', 'MALFORMED_REVIEW_INPUT'); assert.equal(touched, 0);
  const proxy = new Proxy({}, { ownKeys() { touched++; return []; } });
  check('observe', proxy, 'unknown', 'MALFORMED_REVIEW_INPUT'); assert.equal(touched, 0);
  const excess = fixture(); excess.readback!.runs = Array(65).fill({}); check('observe', excess, 'unknown');
  const privateInput = fixture(); privateInput.readback!.secret = 'PRIVATE_NEVER_ECHO';
  assert.equal(JSON.stringify(check('observe', privateInput, 'advice')).includes('PRIVATE_NEVER_ECHO'), false);
});
test('policy preserves caller data and exposes no simulated authentic receipt', () => {
  const f = armed(), before = JSON.stringify(f); const r = check('restore', f, 'advice');
  assert.equal(JSON.stringify(f), before); assert.equal(r.authenticCustodyCreated, false); assert.equal(r.futureEffectAdmitted, false);
});

test('matching current row cannot hide an unrelated setting changed during arming', () => {
  const f = armed(); f.readback!.probe.armedRoleSettings = ['search_path=private', 'statement_timeout=5s'];
  f.readback!.setting.entries = [...f.readback!.probe.armedRoleSettings!]; f.originalArmBinding!.armedRoleSettings = [...f.readback!.probe.armedRoleSettings!];
  check('restore', f, 'refused');
});
test('changed owned schedule refuses restoration despite terminal run', () => {
  const f = armed(); f.readback!.job.schedule = '1 second'; check('restore', f, 'refused');
});
test('missing original arm binding requires persisted original intent and independent owned facts', () => {
  const f = armed(); f.originalArmBinding = null; f.armIntent = null; check('restore', f, 'unknown');
});

const notStarted = () => {
  const f = armed(); f.originalRunBinding = null; f.originalArmBinding = null; f.acknowledgement = null;
  Object.assign(f.readback!.probe, { startedAt: null, runId: null, backendPid: null, backendStart: null });
  f.readback!.runs = []; return f;
};
test('expired original ARM without procedure entry still supports scoped restoration advice', () => {
  check('restore', notStarted(), 'advice');
});
test('no-start connection failure is retained without selecting it as an original procedure run', () => {
  const f = notStarted(); f.readback!.runs = [{ ...armed().readback!.runs[0], jobPid: null }];
  const before = JSON.stringify(f.readback!.runs); check('restore', f, 'advice'); assert.equal(JSON.stringify(f.readback!.runs), before);
});
test('settled extra own-job runs do not strand restoration or certify mechanics', () => {
  const f = armed(); f.readback!.runs.push({ ...f.readback!.runs[0], runId: '42', jobPid: 322, status: 'succeeded' });
  const before = JSON.stringify(f.readback!.runs); const r = check('restore', f, 'advice');
  assert.equal(r.nativeAcceptance, false); assert.equal(JSON.stringify(f.readback!.runs), before);
});
test('any active extra own-job run prevents restoration', () => {
  const f = armed(); f.readback!.runs.push({ ...f.readback!.runs[0], runId: '42', jobPid: 322, status: 'running', endTime: null });
  check('restore', f, 'unknown');
});
test('terminal extra run still needs all owned backends to be gone', () => {
  const f = armed(); f.readback!.runs.push({ ...f.readback!.runs[0], runId: '42', jobPid: 322 });
  f.readback!.ownedJobBackends = [{ jobId: '7', pid: 322, backendStart: '2026-10-15T15:00:10.000000Z' }];
  check('restore', f, 'refused');
});
test('missing full owned-job backend census is unknown for started and no-start recovery', () => {
  for (const f of [armed(), notStarted()]) { delete (f.readback! as Partial<PolicyReadback>).ownedJobBackends; check('restore', f, 'unknown'); }
});
test('lost ARM acknowledgement can be investigated from persisted original arm intent', () => {
  const f = armed(); f.acknowledgement = null; f.originalArmBinding = null;
  const r = check('observe', f, 'advice'); assert.equal(r.futureEffectAdmitted, false); assert.equal(r.authenticCustodyCreated, false);
  check('restore', f, 'advice');
});
test('matching five seconds without original arm intent is unknown', () => {
  const f = armed(); f.armIntent = null; f.originalArmBinding = null; check('observe', f, 'unknown');
});
test('changed arm operation or multiple arm attempts refuse settlement', () => {
  for (const mutate of [(f: PolicyReviewFixture) => { f.armIntent!.operationId = '80390cdc-1e28-4107-9020-253cd7d8a589'; }, (f: PolicyReviewFixture) => { f.armIntent!.writeAttempts = 2; }]) {
    const f = armed(); mutate(f); check('observe', f, 'refused');
  }
});
test('no-start original eligibility must be closed and latch must be wholly empty', () => {
  const f = notStarted(); f.readback!.probe.expiresAt = f.readback!.observedAt; check('restore', f, 'refused');
  const partial = notStarted(); partial.readback!.probe.runId = '41'; check('restore', partial, 'unknown');
});

test('missing original preparation source pins or clock cannot support advice', () => {
  for (const key of ['descriptorSha256', 'sourceUnitSha256', 'issuedAt']) {
    const f = fixture(); delete (f.intent!.writeIntent as Partial<RecoveryWriteIntent>)[key as keyof RecoveryWriteIntent]; check('prepare', f, 'unknown');
  }
});
test('conflicting original preparation source pins refuse every recovery path', () => {
  for (const action of ['prepare', 'observe', 'restore']) for (const key of ['descriptorSha256', 'sourceUnitSha256'] as const) {
    const f = action === 'restore' ? armed() : fixture(); f.intent!.writeIntent[key] = 'f'.repeat(64); check(action, f, 'refused');
  }
});
test('preparation intent issued after its independent read refuses advice', () => {
  const f = fixture(); f.intent!.writeIntent.issuedAt = '2026-10-15T15:01:00.000000Z'; check('prepare', f, 'refused');
});
test('preparation cannot be issued after the original arm intent', () => {
  const f = armed(); f.intent!.writeIntent.issuedAt = '2026-10-15T14:59:00.500000Z'; check('restore', f, 'refused');
});
test('changed schedule refuses expired no-start recovery without an arm binding', () => {
  const f = notStarted(); f.readback!.job.schedule = '1 second'; check('restore', f, 'refused');
});
test('changed schedule refuses lost-arm read-only settlement', () => {
  const f = armed(); f.originalArmBinding = null; f.acknowledgement = null; f.readback!.job.schedule = '1 second'; check('observe', f, 'refused');
});
test('missing original recorded schedule remains unknown in no-start recovery', () => {
  const f = notStarted(); delete f.readback!.probe.armedSchedule; check('restore', f, 'unknown');
});

test('custom array prototype cannot execute an inherited evidence getter', () => {
  const f = fixture(); let inheritedCalls = 0;
  const malicious = Object.create(Array.prototype, { every: { get() { inheritedCalls++; return Array.prototype.every; } } });
  Object.setPrototypeOf(f.readback!.runs, malicious);
  const result = decideRecovery('prepare', f);
  assert.equal(inheritedCalls, 0); assert.equal(result.status, 'unknown');
  assert.equal(result.nativeExecutionAuthorized, false); assert.equal(result.nativeAcceptance, false);
});
