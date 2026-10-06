import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolAccessDirectoryRows, currentAccessDirectoryRow, filterAccessDirectory, recoveredAccessRelationship } from '../access-directory-model.ts';
import { parseSchoolPerson } from '../model.ts';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessDirectory } from '../components/access-directory.tsx';
const person = parseSchoolPerson({ id: '10000000-0000-4000-8000-000000000012', displayName: 'Noor Hassan', role: 'student', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 1, selectionContext: { status: 'READY', enrollmentState: 'CURRENT', classes: [{ className: 'Cedar', yearGroupName: 'Year six', academicYearName: '2026' }] } });

test('integrated directory refuses incomplete or indistinguishable relationship targets before editing', () => {
  const classes = [{ id: 'class', name: 'Cedar', yearGroupName: 'Year six', academicYearName: '2026', selectionStatus: 'READY' }];
  const row = { id: 'relationship', studentId: person.id, classId: 'class', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, revision: 1 };
  const ready = schoolAccessDirectoryRows('enrollment', [row], [person], classes, [], 'en', true);
  assert.equal(ready[0].requiresReview, false); assert.match(ready[0].context, /Class: Cedar/); assert.equal(ready[0].relationship?.className, 'Cedar');
  assert.equal(schoolAccessDirectoryRows('enrollment', [row], [person], classes, [], 'en', false)[0].requiresReview, true);
  assert.equal(schoolAccessDirectoryRows('enrollment', [row], [person], [], [], 'ar', true)[0].requiresReview, true);
  assert.equal(schoolAccessDirectoryRows('enrollment', [row, { ...row, id: 'other' }], [person], classes, [], 'en', true).every(item => item.requiresReview), true);
  assert.equal(schoolAccessDirectoryRows('person', [person], [{ ...person, selectionContext: { ...person.selectionContext, status: 'REQUIRES_REVIEW' } }], classes, [], 'en', true)[0].requiresReview, true);
});
test('access directory uses real relationship context instead of opaque source keys', () => {
  const teacher = { ...person, role: 'teacher' as const, displayName: 'Maya' };
  const rows = schoolAccessDirectoryRows('assignment', [{ id: 'source-key', teacherId: teacher.id, classId: 'class', subjectId: 'subject', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, revision: 1 }], [teacher], [{ id: 'class', name: 'Cedar', yearGroupName: 'Year six', academicYearName: '2026', selectionStatus: 'READY' }], [{ id: 'subject', name: 'Mathematics', selectionStatus: 'READY' }], 'en', true);
  assert.equal(rows[0].title, 'Maya · Teacher'); assert.match(rows[0].context, /Class: Cedar · Year group: Year six · Academic year: 2026 · Subject: Mathematics/);
  assert.equal(filterAccessDirectory(rows, 'year SIX', 'en').length, 1); assert.equal(filterAccessDirectory(rows, 'source-key', 'en').length, 0);
  assert.equal(currentAccessDirectoryRow(rows, 'other'), null); assert.equal(currentAccessDirectoryRow([...rows, ...rows], 'source-key'), null);
  const unavailable = schoolAccessDirectoryRows('guardian', [{ id: 'g', parentId: 'unknown-id', studentId: person.id }], [person], [], [], 'en', true)[0];
  assert.match(unavailable.title, /Member name unavailable/); assert.equal(unavailable.requiresReview, true);
});
test('relationship recovery binds the whole original tuple and cannot choose a same-name sibling', () => {
  const rows = [{ id: 'one', classId: 'class', studentId: 'learner' }, { id: 'two', classId: 'other', studentId: 'learner' }];
  assert.equal(recoveredAccessRelationship('enrollment', { classId: 'class', studentId: 'learner' }, rows)?.id, 'one');
  assert.equal(recoveredAccessRelationship('enrollment', { studentId: 'learner' }, rows), null);
  assert.equal(recoveredAccessRelationship('enrollment', { classId: 'class', studentId: 'learner' }, [...rows, rows[0]]), null);
});
test('the directory renders one list and accessible native controls without duplicating record tables or mutation forms', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { const parent = { ...person, id: '10000000-0000-4000-8000-000000000072', role: 'parent' as const, displayName: 'Samira Hassan' }; const rows = schoolAccessDirectoryRows('guardian', [{ id: 'internal-id', parentId: parent.id, studentId: person.id, status: 'active', relationshipType: 'parent', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, revision: 1 }], [person, parent], [], [], 'en', true);
    const html = renderToStaticMarkup(createElement(AccessDirectory, { locale: 'en', kind: 'guardian', rows, selectedId: 'internal-id', query: '', locked: true, statusLabel: () => 'Active', onKind() {}, onQuery() {}, onSelect() {} }));
    assert.match(html, /Samira Hassan/); assert.match(html, /Noor Hassan/); assert.match(html, /aria-current="true"/); assert.match(html, /disabled/); assert.doesNotMatch(html, /internal-id|<table|<form|type="submit"/);
  } finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
});
