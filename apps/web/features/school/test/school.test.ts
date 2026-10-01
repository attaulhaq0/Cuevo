import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSchoolContext, parseSchoolPerson, parseAttendance, parseSchedule, parseSchoolRow, parseTimetable } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const policy = { version: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false };
test('school context distinguishes approval and configuration from live intelligence readiness', () => {
  const context = { school: { id: 'school', name: 'Synthetic School', countryCode: 'QA', languages: ['en', 'ar'] }, policy, intelligence: { fixtureSchoolApproved: true, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
  assert.equal(parseSchoolContext(context).intelligence.liveSchoolApproved, false);
  assert.throws(() => parseSchoolContext({ ...context, policy: { ...policy, studentMessagingEnabled: true } }), LearningApiError);
  assert.throws(() => parseSchoolContext({ ...context, policy: { ...policy, leaderboardEnabled: true } }), LearningApiError);
});
test('membership records need current status and effective windows rather than client role assumptions', () => {
  const person = { id: 'p', displayName: 'Synthetic learner', role: 'student', status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, synthetic: true };
  assert.equal(parseSchoolPerson(person).role, 'student');
  assert.throws(() => parseSchoolPerson({ ...person, role: 'superuser' }), LearningApiError);
  assert.throws(() => parseSchoolPerson({ ...person, effectiveTo: '2026-08-01T00:00:00Z' }), LearningApiError);
});
test('missing attendance status cannot be converted to present or absent', () => {
  const record = { id: 'a', classId: 'c', learnerId: 'l', occurredOn: '2026-10-01', revision: 1, status: 'late', note: null, recordedAt: '2026-10-01T00:00:00Z' };
  assert.equal(parseAttendance(record).note, null);
  assert.throws(() => parseAttendance({ ...record, status: null }), LearningApiError);
  assert.throws(() => parseAttendance({ ...record, revision: 0 }), LearningApiError);
});
test('calendar schedule rejects reversed dates rather than rendering fabricated duration', () => {
  const event = { id: 'e', classId: null, title: 'School event', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T09:00:00Z' };
  assert.equal(parseSchedule(event).classId, null);
  assert.throws(() => parseSchedule({ ...event, endsAt: '2026-10-01T07:00:00Z' }), LearningApiError);
});
test('school record projections reject unknown flags and reversed access windows', () => {
  assert.throws(() => parseSchoolRow({ id: 'p', version: 1, parentAttendanceVisible: 'yes', parentUpcomingVisible: false }), LearningApiError);
  assert.throws(() => parseSchoolRow({ id: 'r', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-09-01T00:00:00Z' }), LearningApiError);
});
test('timetable keeps a valid weekday and time window without deriving attendance', () => {
  const row = { id: 't', classId: 'c', subjectId: 's', teacherId: 'p', dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00', effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', location: 'School room' };
  assert.equal(parseTimetable(row).dayOfWeek, 1);
  assert.throws(() => parseTimetable({ ...row, dayOfWeek: 9 }), LearningApiError);
  assert.throws(() => parseTimetable({ ...row, endsAt: '07:00' }), LearningApiError);
});
