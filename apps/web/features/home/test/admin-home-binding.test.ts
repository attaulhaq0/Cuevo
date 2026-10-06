import assert from 'node:assert/strict';
import test from 'node:test';
import { adminHomeReadScope, currentAdminHomeRead, parseAdminHomeContext, parseAdminHomeAutomation, adminAutomationState, parseAdminHomePerson, parseAdminHomeAudit, parseAdminHomeRelationship, adminHomePersonName } from '../admin-home-binding-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const scopeContext = { apiUrl: 'https://api.example.invalid', membership: { userId: 'admin', schoolId: 'school', role: 'admin', entitlements: ['school.operations'] }, accessToken: 'fictional-token', online: true, status: 'ready', accessGeneration: 1 };
test('unknown canonical administrator names stay localized in both cards and source relationship details', () => {
  const name = adminHomePersonName;
  assert.equal(name([{ id: 'person', displayName: '' }], 'person', 'Current person name unavailable'), 'Current person name unavailable');
  assert.equal(name([{ id: 'person', displayName: '   ' }], 'person', 'اسم الشخص الحالي غير متاح'), 'اسم الشخص الحالي غير متاح');
  assert.equal(name([], 'unknown', 'Current person name unavailable'), 'Current person name unavailable');
  assert.equal(name([{ id: 'person', displayName: 'Lina' }], 'person', 'Unavailable'), 'Lina');
});
const conditions = { windowDays: null, minimumDecline: null, maxScore: null, missingDueCount: null, practicePoints: null, revisionPoints: null, reflectionPoints: null, parentCommunicationEnabled: null, fixtureEnabled: null, liveEnabled: null, executionConfigured: null };
const automation = { windowStart: '2026-10-01T00:00:00Z', windowEnd: '2026-10-03T00:00:00Z', policies: ['LEARNER_STATE','ATTENTION','RECOGNITION','COMMUNICATION','INTELLIGENCE'].map(id => ({ id, version: null, configured: false, enabled: false, approvedBy: null, approvedAt: null, conditions })), execution: { scope: 'RETURNED_ALLOWLIST_EVENTS_IN_WINDOW', returned: 0, truncated: false, pending: 0, processing: 0, completed: 0, failed: 0, retried: 0, receiptCount: 0, latestCompletionAt: null, runs: [] }, approvals: 'EXISTING_HUMAN_APPROVALS_UNCHANGED' };
const context = { school: { id: 'school', name: 'Current school', countryCode: 'QA', languages: ['en','ar'] }, policy: { version: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' }, attendance: { items: [], nextCursor: null }, timetable: { items: [], nextCursor: null }, calendar: { items: [], nextCursor: null } };

test('admin home source admission requires current administrator capability token and connection', () => {
  const path = '/v1/school/context'; const scope = adminHomeReadScope(scopeContext, path, 0);
  assert.ok(scope); assert.equal(currentAdminHomeRead({ scope, value: context }, scope), context);
  for (const patch of [{ online: false }, { status: 'verifying' }, { accessToken: null }, { membership: { ...scopeContext.membership, role: 'teacher' } }, { membership: { ...scopeContext.membership, entitlements: [] } }]) assert.equal(adminHomeReadScope({ ...scopeContext, ...patch }, path, 0), null);
  assert.equal(currentAdminHomeRead({ scope, value: context }, adminHomeReadScope({ ...scopeContext, accessGeneration: 2 }, path, 0)), null);
  assert.equal(currentAdminHomeRead({ scope, value: context }, adminHomeReadScope({ ...scopeContext, accessToken: 'replacement' }, path, 0)), null);
});

test('admin context validates the complete current-school envelope without retaining pupil pages', () => {
  const parsed = parseAdminHomeContext(context, 'school');
  assert.equal(parsed.policy.version, 0); assert.equal('attendance' in parsed, false);
  assert.throws(() => parseAdminHomeContext(context, 'other-school'), LearningApiError);
  assert.throws(() => parseAdminHomeContext({ ...context, calendar: { items: [{ id: 'bad' }], nextCursor: null } }, 'school'), LearningApiError);
  assert.throws(() => parseAdminHomeContext({ ...context, privateNotes: 'Excluded' }, 'school'), LearningApiError);
  assert.throws(() => parseAdminHomeContext({ ...context, school: { ...context.school, secret: 'Excluded' } }, 'school'), LearningApiError);
  assert.throws(() => parseAdminHomeContext({ ...context, policy: { ...context.policy, hiddenFlag: false } }, 'school'), LearningApiError);
});

test('unknown and returned zero automation remain separate from healthy-system or outcome claims', () => {
  assert.equal(adminAutomationState(null), 'unavailable');
  const parsed = parseAdminHomeAutomation(automation);
  assert.equal(parsed.execution.receiptCount, 0); assert.equal(adminAutomationState(parsed), 'reviewed');
  assert.throws(() => parseAdminHomeAutomation({ ...automation, execution: { ...automation.execution, privatePayload: 'Excluded' } }), LearningApiError);
  assert.throws(() => parseAdminHomeAutomation({ ...automation, windowEnd: '2026-09-01T00:00:00Z' }), LearningApiError);
  assert.throws(() => parseAdminHomeAutomation({ ...automation, execution: { ...automation.execution, completed: 1 } }), LearningApiError);
});

test('administrator source records reject extra private content and retain exact relationship revisions', () => {
  const person = { id: 'person', displayName: 'Current person', role: 'student', status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 2 };
  assert.equal(parseAdminHomePerson(person).revision, 2);
  assert.throws(() => parseAdminHomePerson({ ...person, privateNotes: 'Excluded' }), LearningApiError);
  const relationship = { id: 'relationship', classId: 'class', studentId: 'person', status: 'active', effectiveFrom: person.effectiveFrom, effectiveTo: null, revision: 3 };
  assert.equal(parseAdminHomeRelationship(relationship, 'enrollment').revision, 3);
  assert.throws(() => parseAdminHomeRelationship({ ...relationship, revision: 0 }, 'enrollment'), LearningApiError);
  assert.throws(() => parseAdminHomeRelationship({ ...relationship, diagnosis: 'Excluded' }, 'enrollment'), LearningApiError);
  const audit = { id: 'audit', actorName: 'Current actor', action: 'school.policy.approve', objectType: 'school', objectId: 'school', objectName: 'Current school', outcome: 'succeeded', occurredAt: person.effectiveFrom, requestId: 'request' };
  assert.equal(parseAdminHomeAudit(audit).objectName, 'Current school');
  assert.throws(() => parseAdminHomeAudit({ ...audit, rawPayload: 'Excluded' }), LearningApiError);
});

test('administrator people accept current canonical selection context without exposing private extras', () => {
  const person = { id: '31000000-0000-4000-8000-000000000001', displayName: 'Current person', role: 'student', status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 2, selectionContext: { status: 'READY', enrollmentState: 'CURRENT', classes: [{ className: 'Class A', yearGroupName: 'Year 6', academicYearName: '2026–2027' }] } };
  const parsed = parseAdminHomePerson(person);
  assert.deepEqual(parsed.selectionContext, person.selectionContext);
  assert.equal(parsed.revision, 2);
  assert.throws(() => parseAdminHomePerson({ ...person, privateNotes: 'Excluded' }), LearningApiError);
  assert.throws(() => parseAdminHomePerson({ ...person, selectionContext: { ...person.selectionContext, diagnosis: 'Excluded' } }), LearningApiError);
  const unknown = parseAdminHomePerson({ ...person, displayName: null, selectionContext: { status: 'REQUIRES_REVIEW', enrollmentState: 'UNAVAILABLE', classes: [] } });
  assert.equal(unknown.displayName, '');
  assert.equal(unknown.selectionContext.status, 'REQUIRES_REVIEW');
});
