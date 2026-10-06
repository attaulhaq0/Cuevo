import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimetableMaintenanceRecord } from '../components/record-maintenance.tsx';

const row = { id: 'opaque-slot-id', classId: 'private-class-id', subjectId: 'private-subject-id', teacherId: 'private-teacher-id', className: 'Cedar', academicYearName: '2026–2027', subjectName: 'Mathematics', teacherName: 'Samira Hassan', dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00', effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', location: 'Room 2', revision: 3 };
const render = (value = row, locale: 'en' | 'ar' = 'en') => {
  // The root tsx runner transpiles package UI with classic JSX; use the real React
  // runtime in this test instead of changing the package's production compilation.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(TimetableMaintenanceRecord, { row: value, locale, onEdit: () => {}, onCancel: () => {} })); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'React', descriptor); else Reflect.deleteProperty(globalThis, 'React'); }
};

test('rendered maintenance action names distinguish two actual same-class slots', () => {
  const first = render(); const second = render({ ...row, subjectName: 'Science', dayOfWeek: 2, startsAt: '10:00', endsAt: '11:00', location: 'Laboratory' });
  assert.match(first, /Mathematics/); assert.match(first, /Samira Hassan/); assert.match(first, /Monday/); assert.match(first, /08:00–09:00/); assert.match(first, /2026–2027/);
  assert.match(second, /Science/); assert.match(second, /Tuesday/); assert.match(second, /10:00–11:00/);
  assert.notEqual(first.match(/aria-label="([^"]*)"/)?.[1], second.match(/aria-label="([^"]*)"/)?.[1]);
  assert.match(first, /dir="ltr">08:00–09:00/); assert.ok(!first.includes(row.id)); assert.ok(!first.includes(row.teacherId));
});

test('rendered unknown source context gives localized review guidance and disables ambiguous mutations', () => {
  const html = render({ ...row, teacherName: '' });
  assert.match(html, /Timetable context unavailable/); assert.match(html, /Refresh school records/); assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(!html.includes(row.teacherId));
});

test('Arabic rendered maintenance keeps actual named context and isolated clock order', () => {
  const html = render({ ...row, subjectName: 'الرياضيات' }, 'ar');
  assert.match(html, /الرياضيات/); assert.match(html, /الاثنين/); assert.match(html, /dir="ltr">08:00–09:00/); assert.match(html, /مراجعة السجل الحالية/);
});
