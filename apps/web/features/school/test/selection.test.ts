import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSchoolPerson } from '../model.ts';
import { schoolPersonChoices, schoolRecordChoices } from '../selection.ts';
const id = '00000000-0000-4000-8000-000000000001';
const person = { id, displayName: 'Year 8 Lina Hassan', role: 'student', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 1, selectionContext: { status: 'READY', enrollmentState: 'CURRENT', classes: [{ className: 'Year 8', yearGroupName: 'Year 8', academicYearName: '2026–2027' }] } };
test('School choices preserve names and name each class/year axis in English and Arabic', () => {
  const row = parseSchoolPerson(person); const english = schoolPersonChoices([row], 'en')[0];
  assert.equal(english.requiresReview, false); assert.match(english.label, /Year 8 Lina Hassan/); assert.match(english.label, /Class: Year 8/); assert.match(english.label, /Year group: Year 8/); assert.equal(english.label.includes(id), false);
  const arabic = schoolPersonChoices([row], 'ar')[0]; assert.match(arabic.label, /الصف: Year 8/); assert.match(arabic.label, /المستوى الدراسي: Year 8/);
});
test('unique confirmed NONE stays selectable while missing or server-ambiguous context needs review', () => {
  const none = parseSchoolPerson({ ...person, selectionContext: { status: 'READY', enrollmentState: 'NONE', classes: [] } });
  assert.equal(schoolPersonChoices([none], 'en')[0].requiresReview, false); assert.match(schoolPersonChoices([none], 'ar')[0].label, /لا يوجد تسجيل/);
  assert.equal(schoolPersonChoices([parseSchoolPerson({ ...person, selectionContext: undefined })], 'en')[0].requiresReview, true);
  const ambiguous = parseSchoolPerson({ ...person, selectionContext: { ...person.selectionContext, status: 'REQUIRES_REVIEW' } }); assert.equal(schoolPersonChoices([ambiguous], 'en')[0].requiresReview, true);
});
test('loaded identical captions stay blocked even when the server fixture incorrectly claims ready', () => {
  const row = parseSchoolPerson(person); const choices = schoolPersonChoices([row, { ...row, id: 'other' }], 'en'); assert.equal(choices.every(choice => choice.requiresReview), true); assert.equal(choices.some(choice => choice.label.includes('other')), false);
});
test('year and group labels use saved dates/ordinal and server ambiguity rather than IDs', () => {
  const year = schoolRecordChoices([{ id, name: 'School year', startsOn: '2026-09-01', endsOn: '2027-06-30', selectionStatus: 'READY' }], 'years', 'en')[0]; assert.match(year.label, /2026/); assert.equal(year.requiresReview, false);
  const group = schoolRecordChoices([{ id, name: 'Year 8', ordinal: 8, selectionStatus: 'REQUIRES_REVIEW' }], 'year-groups', 'ar')[0]; assert.equal(group.requiresReview, true); assert.equal(group.label.includes(id), false);
});
