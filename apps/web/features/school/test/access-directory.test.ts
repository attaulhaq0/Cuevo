import assert from 'node:assert/strict';
import test from 'node:test';
import { accessDirectoryRows, currentAccessDirectoryRow, filterAccessDirectory, recoveredAccessRelationship } from '../access-directory-model.ts';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessDirectory } from '../components/access-directory.tsx';
const names = { learner: 'Noor Hassan', guardian: 'Samira Hassan', teacher: 'Maya', class: 'Cedar · Year six · 2026', subject: 'Mathematics' };
test('access directory uses real relationship context instead of opaque source keys', () => {
  const rows = accessDirectoryRows('assignment', [{ id: 'source-key', teacherId: 'teacher', classId: 'class', subjectId: 'subject', status: 'active' }], names, {}, 'Name unavailable');
  assert.equal(rows[0].title, 'Maya'); assert.equal(rows[0].context, 'Cedar · Year six · 2026 · Mathematics');
  assert.equal(filterAccessDirectory(rows, 'year SIX', 'en').length, 1); assert.equal(filterAccessDirectory(rows, 'source-key', 'en').length, 0);
  assert.equal(currentAccessDirectoryRow(rows, 'other'), null); assert.equal(currentAccessDirectoryRow([...rows, ...rows], 'source-key'), null);
  assert.equal(accessDirectoryRows('guardian', [{ id: 'g', parentId: 'unknown-id', studentId: 'learner' }], names, {}, 'Name unavailable')[0].title, 'Name unavailable');
});
test('relationship recovery binds the whole original tuple and cannot choose a same-name sibling', () => {
  const rows = [{ id: 'one', classId: 'class', studentId: 'learner' }, { id: 'two', classId: 'other', studentId: 'learner' }];
  assert.equal(recoveredAccessRelationship('enrollment', { classId: 'class', studentId: 'learner' }, rows)?.id, 'one');
  assert.equal(recoveredAccessRelationship('enrollment', { studentId: 'learner' }, rows), null);
  assert.equal(recoveredAccessRelationship('enrollment', { classId: 'class', studentId: 'learner' }, [...rows, rows[0]]), null);
});
test('the directory renders one list and accessible native controls without duplicating record tables or mutation forms', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { const rows = accessDirectoryRows('guardian', [{ id: 'internal-id', parentId: 'guardian', studentId: 'learner', status: 'active' }], names, {}, 'Unknown');
    const html = renderToStaticMarkup(createElement(AccessDirectory, { locale: 'en', kind: 'guardian', rows, selectedId: 'internal-id', query: '', locked: true, statusLabel: () => 'Active', onKind() {}, onQuery() {}, onSelect() {} }));
    assert.match(html, /Samira Hassan/); assert.match(html, /Noor Hassan/); assert.match(html, /aria-current="true"/); assert.match(html, /disabled/); assert.doesNotMatch(html, /internal-id|<table|<form|type="submit"/);
  } finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
});
