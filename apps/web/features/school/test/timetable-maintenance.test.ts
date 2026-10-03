import assert from 'node:assert/strict';
import test from 'node:test';
import { timetableMaintenanceContext } from '../timetable-maintenance.ts';

const row = { id: 'opaque-slot-id', classId: 'private-class-id', subjectId: 'private-subject-id', teacherId: 'private-teacher-id', className: 'Year 1 · Cedar', academicYearName: '2026–2027', subjectName: 'Mathematics', teacherName: 'Samira Hassan', dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00', effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', location: 'Room 2', revision: 3 };

test('timetable maintenance context identifies the actual class, people and slot without technical identifiers', () => {
  const context = timetableMaintenanceContext(row, 'en');
  assert.equal(context.status, 'READY');
  assert.equal(context.classLabel, 'Year 1 · Cedar · 2026–2027');
  assert.equal(context.subjectName, 'Mathematics'); assert.equal(context.teacherName, 'Samira Hassan');
  assert.equal(context.weekday, 'Monday'); assert.equal(context.timeRange, '08:00–09:00');
  assert.equal(context.location, 'Room 2'); assert.equal(context.revision, 3);
  assert.ok(context.accessibleLabel.includes('Mathematics')); assert.ok(context.accessibleLabel.includes('08:00–09:00'));
  for (const value of [row.id, row.classId, row.subjectId, row.teacherId]) assert.ok(!context.accessibleLabel.includes(value));
});

test('same-class timetable entries with different real subjects, teachers or times have distinct action context', () => {
  const first = timetableMaintenanceContext(row, 'en');
  for (const change of [{ subjectName: 'Science' }, { teacherName: 'Aisha Mansoor' }, { dayOfWeek: 2 }, { startsAt: '10:00', endsAt: '11:00' }, { effectiveFrom: '2026-11-01' }, { location: 'Room 3' }]) assert.notEqual(first.accessibleLabel, timetableMaintenanceContext({ ...row, ...change }, 'en').accessibleLabel);
});

test('missing human or invalid slot context requires review rather than substituting an ID or revision one', () => {
  for (const change of [{ className: undefined }, { academicYearName: null }, { subjectName: '' }, { teacherName: ' ' }, { dayOfWeek: 9 }, { startsAt: 'invalid' }, { endsAt: '07:00' }, { effectiveFrom: 'invalid' }, { effectiveTo: '2026-09-30' }, { revision: undefined }]) {
    const context = timetableMaintenanceContext({ ...row, ...change }, 'en'); assert.equal(context.status, 'REQUIRES_REVIEW');
    assert.ok(!context.accessibleLabel.includes(row.id));
  }
  assert.equal(timetableMaintenanceContext({ ...row, revision: undefined }, 'en').revision, null);
});

test('Arabic context localizes weekdays and unknown fields while preserving source labels and clock times', () => {
  const context = timetableMaintenanceContext({ ...row, subjectName: 'الرياضيات' }, 'ar');
  assert.equal(context.status, 'READY'); assert.equal(context.subjectName, 'الرياضيات'); assert.equal(context.weekday, 'الاثنين'); assert.equal(context.timeRange, '08:00–09:00');
  const unknown = timetableMaintenanceContext({ ...row, teacherName: undefined }, 'ar'); assert.equal(unknown.status, 'REQUIRES_REVIEW'); assert.ok(!unknown.teacherName.includes('private'));
});

test('unprovided optional location is explicit and does not invent a classroom', () => {
  const context = timetableMaintenanceContext({ ...row, location: null }, 'en'); assert.equal(context.status, 'READY'); assert.equal(context.location, 'Location not provided');
});

test('a technical UUID supplied as a name cannot become primary timetable identity', () => {
  const raw = '00000000-0000-4000-8000-000000000099';
  for (const key of ['className', 'academicYearName', 'subjectName', 'teacherName']) {
    const context = timetableMaintenanceContext({ ...row, [key]: raw }, 'en');
    assert.equal(context.status, 'REQUIRES_REVIEW'); assert.ok(!context.accessibleLabel.includes(raw));
  }
});
