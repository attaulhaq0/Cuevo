import assert from 'node:assert/strict';
import test from 'node:test';
import { currentSchoolRead, parseCurrentLearnerProfile, schoolTimetableForDate, parseCurrentSchoolContext, parseCurrentAttendance } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const learnerId = '00000000-0000-4000-8000-000000000001';
const classId = '00000000-0000-4000-8000-000000000002';
const courseId = '00000000-0000-4000-8000-000000000003';
const profile = { id: learnerId, displayName: 'Synthetic learner', schoolName: 'Synthetic school', enrollments: [{ classId, className: 'Cedar', yearGroupName: 'Year 8', academicYearName: '2026–2027', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null }], courses: [{ id: courseId, title: 'Current school course', classId, className: 'Cedar', subjectName: 'School subject' }] };

test('school read envelopes reject the previous actor child refresh and access generation before a first frame', () => {
  const read = { scope: 'actor:school:child:revision:refresh', value: profile };
  assert.equal(currentSchoolRead(read, read.scope), profile);
  assert.equal(currentSchoolRead(read, 'actor:school:other-child:revision:refresh'), null);
  assert.equal(currentSchoolRead(read, 'other-actor:school:child:revision:refresh'), null);
  assert.equal(currentSchoolRead(read, 'actor:school:child:next-generation:refresh'), null);
  assert.equal(currentSchoolRead(read, 'actor:school:child:revision:next-refresh'), null);
});

test('learner profile requires the exact current learner and preserves private-field refusal', () => {
  assert.equal(parseCurrentLearnerProfile(profile, learnerId).displayName, profile.displayName);
  assert.throws(() => parseCurrentLearnerProfile(profile, courseId), LearningApiError);
  assert.throws(() => parseCurrentLearnerProfile({ ...profile, privateNotes: 'Excluded' }, learnerId), LearningApiError);
  assert.throws(() => parseCurrentLearnerProfile({ ...profile, enrollments: [{ ...profile.enrollments[0], effectiveTo: '2026-08-01T00:00:00Z' }] }, learnerId), LearningApiError);
});

test('timetable date selection uses only the recorded weekday and inclusive effective window', () => {
  const row = { id: 'lesson', classId, subjectId: 'subject', teacherId: 'teacher', dayOfWeek: 6, startsAt: '08:00', endsAt: '09:00', effectiveFrom: '2026-10-03', effectiveTo: '2026-10-03', location: 'School room' };
  assert.equal(schoolTimetableForDate([row], '2026-10-03').length, 1);
  assert.equal(schoolTimetableForDate([row], '2026-10-02').length, 0);
  assert.equal(schoolTimetableForDate([row], '').length, 0);
  assert.equal(schoolTimetableForDate([row], '2026-02-30').length, 0);
});

test('school context must belong to the currently selected school before policy or daily content opens', () => {
  const source = { school: { id: 'school', name: 'Synthetic School', countryCode: 'QA', languages: ['en', 'ar'] }, policy: { version: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
  assert.equal(parseCurrentSchoolContext(source, 'school').school.name, 'Synthetic School');
  assert.throws(() => parseCurrentSchoolContext(source, 'other-school'), LearningApiError);
});

test('student and selected-child attendance cannot accept another learner source', () => {
  const row = { id: 'attendance', classId, learnerId, occurredOn: '2026-10-03', revision: 1, status: 'late', note: null, recordedAt: '2026-10-03T10:00:00Z' };
  assert.equal(parseCurrentAttendance(row, learnerId).status, 'late');
  assert.throws(() => parseCurrentAttendance(row, courseId), LearningApiError);
  assert.equal(parseCurrentAttendance(row).learnerId, learnerId);
});
