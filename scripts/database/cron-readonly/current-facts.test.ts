import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CurrentFixture } from './current-facts.fixture';
import type { CollectorActor, CollectorFacts, CollectorInventory, CollectorJob, CollectorProbe, CollectorSetting, CurrentReadEvidence, RecoveryIntent } from './current-facts';
import { armedCurrentFixture, currentFixture, querySha256 } from './current-facts.fixture';

const modulePath = './current-facts';
const adapter = existsSync(new URL('./current-facts.ts', import.meta.url)) ? await import(modulePath) : null;
const check = (f: ReturnType<typeof currentFixture>, action = 'observe') => {
  assert.ok(adapter, 'The database-owned current response mapper is missing.');
  const result = adapter.inspectCurrentCronRecovery(action, f.encode(), f.evidence);
  for (const key of ['nativeExecutionAuthorized', 'nativeAcceptance', 'authenticCustodyCreated', 'futureEffectAdmitted']) assert.equal(result[key], false);
  assert.equal(result.currentReadAuthentication, 'SUPPLIED_UNVERIFIED');
  return result;
};

test('actual absent-current shape preserves current absence and missing originals', () => {
  const f = currentFixture(), result = check(f);
  assert.equal(result.status, 'unknown');
  assert.equal(result.current.scopedRoleRow, 'ABSENT'); assert.equal(result.current.probe, 'ABSENT'); assert.equal(result.current.cron, 'ABSENT');
  assert.equal(result.current.ownedBackendPresent, null);
  assert.ok(result.missingFacts.includes('ORIGINAL_INTENT')); assert.ok(result.missingFacts.includes('ORIGINAL_PREWRITE_ROLE_ROW'));
  assert.equal(result.restorationAdvice, null);
});
test('exact matching prepared facts with lost acknowledgement remain read-only advice', () => {
  const result = check(currentFixture(true), 'prepare');
  assert.equal(result.status, 'advice'); assert.equal(result.preparationReadbackMatches, true);
});
test('current full settings cannot replace a missing original before-row', () => {
  const f = currentFixture(true); delete (f.evidence.intent! as Partial<RecoveryIntent>).originalRoleSettings;
  const result = check(f); assert.equal(result.status, 'unknown'); assert.ok(result.missingFacts.includes('ORIGINAL_PREWRITE_ROLE_ROW'));
});
test('missing current source, actor, endpoint and object facts remain unknown', () => {
  for (const mutate of [(f: CurrentFixture) => { delete (f.evidence.currentRead as Partial<CurrentReadEvidence['currentRead']>).querySha256; }, (f: CurrentFixture) => { delete (f.raw.actor as Partial<CollectorActor>).currentUser; },
    (f: CurrentFixture) => { delete (f.raw.setting as Partial<CollectorSetting>).roleOid; }, (f: CurrentFixture) => { delete (f.raw.inventory! as Partial<CollectorInventory>).namespaceName; },
    (f: CurrentFixture) => { delete (f.raw.probeRows![0] as Partial<CollectorProbe>).source_unit_sha256; }, (f: CurrentFixture) => { delete (f.raw.jobs![0] as Partial<CollectorJob>).host; }]) {
    const f = currentFixture(true); mutate(f); assert.equal(check(f).status, 'unknown');
  }
});
test('an old current read retains observed absence while refusing fresh advice', () => {
  const f = currentFixture(); f.evidence.decisionAt = '2026-10-16T15:00:30.000004Z';
  const result = check(f); assert.equal(result.status, 'refused'); assert.equal(result.current.scopedRoleRow, 'ABSENT');
  assert.equal(result.current.probe, 'ABSENT'); assert.equal(result.current.cron, 'ABSENT');
  assert.ok(result.missingFacts.includes('ORIGINAL_PREWRITE_ROLE_ROW'));
});
test('lost ARM acknowledgement retains original intent and exact stored schedule', () => {
  const result = check(armedCurrentFixture(), 'restore'); assert.equal(result.status, 'advice'); assert.equal(result.restorationAdvice.originalValue, '120s');
});
test('HTTP completion after expiry cannot replace a native capture before expiry', () => {
  const f = armedCurrentFixture(); f.raw.probeRows![0].expires_at = '2026-10-15T15:00:29.500001Z';
  const result = check(f, 'restore'); assert.equal(result.status, 'refused');
  assert.ok(result.reasons.includes('ORIGINAL_ELIGIBILITY_STILL_OPEN'));
  assert.equal(result.current.issuedAt, f.evidence.currentRead.issuedAt); assert.equal(result.current.observedAt, f.evidence.currentRead.observedAt);
});
test('PostgreSQL17 exact owner ACL retains MAINTAIN and supports read-only preparation advice', () => {
  const f = currentFixture(true); f.raw.objectAcls[1].grants[0].privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  const result = check(f, 'prepare'); assert.equal(result.status, 'advice');
  assert.ok(f.raw.objectAcls[1].grants[0].privileges.includes('MAINTAIN'));
});
test('PostgreSQL17 MAINTAIN denies excluded actors, extra privileges and grant options', () => {
  for (const mutate of [(f: CurrentFixture) => { f.raw.effectivePrivileges[1].tablePrivileges.MAINTAIN = true; },
    (f: CurrentFixture) => { f.raw.objectAcls[1].grants[0].privileges.push('EXTRA_PRIVILEGE'); },
    (f: CurrentFixture) => { f.raw.objectAcls[1].grants[0].grantable = true; }]) {
    const f = currentFixture(true); f.raw.objectAcls[1].grants[0].privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
    mutate(f); assert.notEqual(check(f, 'prepare').status, 'advice');
  }
});
test('expired no-start ARM and settled connection failure remain advice without run selection', () => {
  const f = armedCurrentFixture(); Object.assign(f.raw.probeRows![0], { started_at: null, run_id: null, backend_pid: null, backend_start: null });
  f.evidence.originalRunBinding = null; f.raw.runs![0].jobPid = null;
  assert.equal(check(f, 'restore').status, 'advice');
});
test('extra settled runs are retained and never selected as original custody', () => {
  const f = armedCurrentFixture(); f.raw.runs!.push({ ...f.raw.runs![0], runId: '42', jobPid: 322, status: 'succeeded' });
  assert.equal(check(f, 'restore').status, 'advice'); assert.equal(check(f, 'restore').current.runCount, 2);
  f.evidence.originalRunBinding!.runId = '42'; assert.equal(check(f, 'restore').status, 'refused');
});
test('active or ambiguous backend census cannot produce restoration advice', () => {
  const f = armedCurrentFixture(); f.raw.ownedBackendCandidates = [{ pid: 322, backendStart: '2026-10-15T15:00:10.000001Z', username: 'postgres', database: 'postgres', state: 'active', backendType: 'client backend', queryVisible: true, queryMatchesRecordedCommand: true, matchesOriginalPidAndBackendStart: false, associatedRunIds: [], ownershipAmbiguous: false }]; f.raw.ownedBackendPresent = true;
  assert.equal(check(f, 'restore').status, 'refused');
  f.raw.ownedBackendCandidates[0].ownershipAmbiguous = true; assert.equal(check(f, 'restore').status, 'unknown');
});
test('missing census and partial native metadata remain unknown', () => {
  for (const mutate of [(f: CurrentFixture) => { delete (f.raw as Partial<CollectorFacts>).ownedBackendCensusComplete; }, (f: CurrentFixture) => { delete (f.raw as Partial<CollectorFacts>).cronMetadataGuards; }, (f: CurrentFixture) => { f.raw.runs = null; }]) {
    const f = armedCurrentFixture(); mutate(f); assert.equal(check(f, 'restore').status, 'unknown');
  }
});
test('private grant and effective column access conflicts refuse', () => {
  for (const mutate of [(f: CurrentFixture) => { f.raw.objectAcls[2].grants[0].grantee = 'PUBLIC'; }, (f: CurrentFixture) => { f.raw.effectivePrivileges[1].anyColumnPrivileges.SELECT = true; }, (f: CurrentFixture) => { f.raw.columnAcls[0].grants = [{ grantor_oid: '10', grantor: 'postgres', grantee_oid: '0', grantee: 'PUBLIC', privileges: ['SELECT'], grantable: false }]; }]) {
    const f = currentFixture(true); mutate(f); assert.equal(check(f).status, 'refused');
  }
});
test('missing private grants, role or column completeness remain unknown', () => {
  for (const mutate of [(f: CurrentFixture) => { f.raw.objectAcls = []; }, (f: CurrentFixture) => { f.raw.effectivePrivileges[1].rolePresent = false; f.raw.effectivePrivileges[1].roleOid = null; }, (f: CurrentFixture) => { f.raw.columnAcls.pop(); }]) {
    const f = currentFixture(true); mutate(f); assert.equal(check(f).status, 'unknown');
  }
});
test('full scoped row and current actor OIDs must agree', () => {
  const f = currentFixture(true); f.raw.setting.rawRow!.setconfig = ['statement_timeout=5s']; assert.equal(check(f).status, 'refused');
  const g = currentFixture(true); g.raw.actor.currentUserOid = '11'; assert.equal(check(g).status, 'refused');
});
test('source hashes, endpoint and original schedule conflicts refuse', () => {
  for (const mutate of [(f: CurrentFixture) => { f.evidence.currentRead.querySha256 = 'f'.repeat(64); }, (f: CurrentFixture) => { f.evidence.currentRead.endpoint += '/other'; }, (f: CurrentFixture) => { f.raw.probeRows![0].source_unit_sha256 = 'f'.repeat(64); }, (f: CurrentFixture) => { f.raw.jobs![0].host = 'OTHER_NATIVE_HOST'; }, (f: CurrentFixture) => { f.raw.jobs![0].schedule = '1 second'; }]) {
    const f = armedCurrentFixture(); mutate(f); assert.equal(check(f, 'restore').status, 'refused');
  }
});
test('original read clocks retain microseconds and cannot be relabelled as a fresh read', () => {
  const f = currentFixture(true), result = check(f); assert.equal(result.current.issuedAt, f.evidence.currentRead.issuedAt); assert.equal(result.current.observedAt, f.evidence.currentRead.observedAt);
  assert.equal(result.current.nativeReadCompletedAt, f.raw.readCompletedAt);
  f.evidence.decisionAt = '2026-10-15T15:01:00.000005Z'; assert.equal(check(f).status, 'refused');
  const g = currentFixture(true); g.raw.readCompletedAt = '2026-10-15T15:00:30.000005Z'; assert.equal(check(g).status, 'refused');
});
test('unknown reader issue and over-bound inventory cannot become zero or complete', () => {
  const f = currentFixture(true); f.raw.issues = ['PRIVATE_UNKNOWN_TEXT']; const result = check(f); assert.equal(result.status, 'unknown'); assert.equal(JSON.stringify(result).includes('PRIVATE_UNKNOWN_TEXT'), false);
  const g = currentFixture(true); g.raw.runs = Array(65).fill(g.raw.runs); assert.equal(check(g).status, 'unknown');
});
test('private native return and unrelated raw fields are never echoed', () => {
  const f = armedCurrentFixture(); f.raw.runs![0].privateReturnMessage = 'PRIVATE_NEVER_ECHO'; f.raw.secret = 'PRIVATE_NEVER_ECHO';
  const result = check(f, 'restore'); assert.equal(result.status, 'advice'); assert.equal(JSON.stringify(result).includes('PRIVATE_NEVER_ECHO'), false);
});
test('accessors, proxies and inherited array getters are rejected without execution', () => {
  assert.ok(adapter); let touched = 0;
  const f = currentFixture(true); Object.defineProperty(f.evidence, 'intent', { get() { touched++; return {}; } });
  assert.equal(adapter.inspectCurrentCronRecovery('observe', f.encode(), f.evidence).status, 'unknown');
  const proxy = new Proxy({}, { ownKeys() { touched++; return []; } }); assert.equal(adapter.inspectCurrentCronRecovery('observe', '{}', proxy).status, 'unknown');
  const g = currentFixture(true); const malicious = Object.create(Array.prototype, { every: { get() { touched++; return Array.prototype.every; } } }); Object.setPrototypeOf(g.evidence.intent!.originalRoleSettings, malicious);
  assert.equal(adapter.inspectCurrentCronRecovery('observe', g.encode(), g.evidence).status, 'unknown'); assert.equal(touched, 0);
});
test('caller authentication booleans cannot upgrade a supplied reader receipt', () => {
  const f = currentFixture(true); f.evidence.currentRead.authenticated = true;
  assert.equal(check(f).status, 'unknown');
});
test('response bytes and exact one-row envelope are bound before mapping', () => {
  assert.ok(adapter); const f = currentFixture(true), body = f.encode(); f.evidence.currentRead.responseSha256 = 'f'.repeat(64);
  assert.equal(adapter.inspectCurrentCronRecovery('observe', body, f.evidence).status, 'refused');
  const extra = JSON.stringify([{ privateCurrentFacts: f.raw }, { privateCurrentFacts: f.raw }]); f.evidence.currentRead.responseSha256 = createHash('sha256').update(extra).digest('hex'); assert.equal(adapter.inspectCurrentCronRecovery('observe', extra, f.evidence).status, 'unknown');
});
test('integrated SQL preserves reviewed bytes and successor policy matches its source pin', () => {
  assert.equal(createHash('sha256').update(readFileSync(new URL('./collect-current-facts.sql', import.meta.url))).digest('hex'), querySha256);
  assert.equal(createHash('sha256').update(readFileSync(new URL('./recovery-policy.mjs', import.meta.url))).digest('hex'), 'a71e5a7593d2129591d983c33da228b8286f384e67957416f0d4f84efd68b2c2');
});
