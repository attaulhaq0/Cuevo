import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSchoolPerson, type SchoolRow } from '../model.ts';
import { schoolRelationshipDisplay, schoolRelationshipDisplays, schoolRelationshipSelectionSafe } from '../relationship-display.ts';

const personId = '20000000-0000-4000-8000-000000000012';
const classes: SchoolRow[] = ['Cedar', 'Palm', 'Birch'].map((name, index) => ({ id: `class-${index}`, name, yearGroupName: 'Year 1', academicYearName: '2026–2027', selectionStatus: 'READY' }));
const person = parseSchoolPerson({ id: personId, displayName: 'Lina Hassan', role: 'student', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 1, selectionContext: { status: 'READY', enrollmentState: 'CURRENT', classes: classes.map(row => ({ className: row.name, yearGroupName: row.yearGroupName, academicYearName: row.academicYearName })) } });
const source = { status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, revision: 1 };

test('one learner in three classes has one exact target per relationship caption', () => {
  const display = classes.map((row, index) => schoolRelationshipDisplay('enrollment', { ...source, id: `enrollment-${index}`, studentId: personId, classId: row.id }, [person], classes, [], 'en'));
  assert.deepEqual(display.map(row => row.title), ['Lina Hassan · Student', 'Lina Hassan · Student', 'Lina Hassan · Student']);
  assert.deepEqual(display.map(row => row.className), ['Cedar', 'Palm', 'Birch']);
  assert.equal(display.filter(row => row.className === 'Palm').length, 1);
  assert.equal(display.every(row => !row.requiresReview && row.yearGroupName === 'Year 1' && row.academicYearName === '2026–2027'), true);
  assert.equal(display.some(row => row.title.includes('Cedar') || row.title.includes('Palm') || row.title.includes(personId)), false);
});

test('same-name peers with different enrollments cannot enable identical shared-class relationship captions', () => {
  const peer = { ...person, id: '20000000-0000-4000-8000-000000000013', selectionContext: { ...person.selectionContext, classes: person.selectionContext.classes.slice(0, 1) } };
  const rows = [person, peer].map((value, index) => ({ ...source, id: `source-${index}`, studentId: value.id, classId: classes[0].id }));
  const display = schoolRelationshipDisplays('enrollment', rows, [person, peer], classes, [], 'en');
  assert.equal(display.every(row => row.requiresReview), true);
  const separated = schoolRelationshipDisplays('enrollment', [rows[0], { ...rows[1], effectiveFrom: '2026-11-01T00:00:00Z' }], [person, peer], classes, [], 'en');
  assert.equal(separated.every(row => !row.requiresReview), true);
  const hiddenRevision = schoolRelationshipDisplays('enrollment', [rows[0], { ...rows[1], revision: 2 }], [person, peer], classes, [], 'en');
  assert.equal(hiddenRevision.every(row => row.requiresReview), true);
  const hiddenPrecision = schoolRelationshipDisplays('enrollment', [rows[0], { ...rows[1], effectiveFrom: '2026-10-01T00:00:00.100Z' }], [person, peer], classes, [], 'en');
  assert.equal(hiddenPrecision.every(row => row.requiresReview), true);
});

test('incomplete current relationship source fields never enable a change', () => {
  for (const change of [{ revision: undefined }, { revision: 0 }, { status: 'suspended' }, { effectiveFrom: 'unknown' }, { effectiveTo: '2026-09-01T00:00:00Z' }, { effectiveTo: undefined }]) {
    assert.equal(schoolRelationshipDisplay('enrollment', { ...source, id: 'row', studentId: personId, classId: classes[0].id, ...change } as unknown as SchoolRow, [person], classes, [], 'en').requiresReview, true);
  }
});

test('missing or ambiguous target context requires review rather than another enrolled class', () => {
  const missing = schoolRelationshipDisplay('enrollment', { id: 'source', studentId: personId, classId: 'missing' }, [person], classes, [], 'ar');
  assert.equal(missing.requiresReview, true); assert.equal(missing.className, null); assert.match(missing.title, /طالب/);
  const ambiguous = schoolRelationshipDisplay('enrollment', { id: 'source', studentId: personId, classId: classes[0].id }, [{ ...person, selectionContext: { ...person.selectionContext, status: 'REQUIRES_REVIEW' } }], classes, [], 'en');
  assert.equal(ambiguous.requiresReview, true);
});

test('an already selected relationship becomes unsafe when current refresh adds an identical visible peer',()=>{
  const peer={...person,id:'20000000-0000-4000-8000-000000000013',selectionContext:{...person.selectionContext,classes:person.selectionContext.classes.slice(0,1)}};
  const selected={...source,id:'selected',studentId:personId,classId:classes[0].id};
  assert.equal(schoolRelationshipSelectionSafe('enrollment',selected.id,[selected],[person,peer],classes,[],'en',true),true);
  const collided={...selected,id:'peer',studentId:peer.id};
  assert.equal(schoolRelationshipSelectionSafe('enrollment',selected.id,[selected,collided],[person,peer],classes,[],'en',true),false);
  assert.equal(schoolRelationshipSelectionSafe('enrollment',selected.id,[],[person,peer],classes,[],'en',true),false);
  assert.equal(schoolRelationshipSelectionSafe('enrollment',selected.id,[selected],[person,peer],classes,[],'en',false),false);
});
