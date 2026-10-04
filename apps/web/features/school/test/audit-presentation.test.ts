import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditPresentation } from '../audit-presentation.ts';
import { SchoolAuditReading } from '../components/audit-reading.tsx';
import type { SchoolAuditRow } from '../model.ts';

const row: SchoolAuditRow = { id: 'private-row-id', actorName: 'Mariam Al-Nuaimi', action: 'school.guardian.configure', objectType: 'school_operation', objectId: 'private-object-id', objectName: null, outcome: 'succeeded', occurredAt: '2026-10-04T10:24:37Z', requestId: 'private-request-id' };
function render(rows = [row], locale: 'en' | 'ar' = 'en') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(SchoolAuditReading, { rows, locale })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}

test('known actions use bounded human wording with independent outcome and exact source context', () => {
  const view = auditPresentation(row, 'en');
  assert.equal(view.title, 'Family access change'); assert.equal(view.actor, 'Mariam Al-Nuaimi'); assert.equal(view.source, 'Source context unavailable'); assert.equal(view.kind, 'School operation'); assert.equal(view.status, 'Completed');
  assert.equal(auditPresentation({ ...row, outcome: 'denied' }, 'en').title, view.title);
  assert.equal(auditPresentation({ ...row, objectName: 'Cedar reading course' }, 'en').source, 'Cedar reading course');
  assert.equal(auditPresentation({ ...row, action: 'reference.outcome', objectType: 'reference_fixture' }, 'en').title, 'Reference-school outcome record');
  assert.equal(auditPresentation({ ...row, action: 'reference.approve', objectType: 'reference' }, 'en').title, 'Learning objective approval');
  assert.equal(auditPresentation({ ...row, action: 'reference.approve', objectType: 'reference_fixture' }, 'en').title, 'Reference-school approval record');
  assert.equal(auditPresentation({ ...row, action: 'reference.outcome', objectType: 'outcome' }, 'en').title, 'Action description unavailable');
});
test('unknown actions, actors and source types stay unavailable without identifier fallback', () => {
  const view = auditPresentation({ ...row, action: 'unrecognized.opaque.code', objectType: 'unrecognized_type', actorName: null, objectName: null }, 'en');
  assert.equal(view.title, 'Action description unavailable'); assert.equal(view.actor, 'Person unavailable'); assert.equal(view.source, 'Source context unavailable'); assert.equal(view.kind, 'Source type unavailable');
  assert.equal(JSON.stringify(view).includes('unrecognized'), false); assert.equal(JSON.stringify(view).includes('private-'), false);
  for (const code of ['__proto__', 'constructor', 'toString']) {
    const inherited = auditPresentation({ ...row, action: code, objectType: code }, 'en');
    assert.equal(inherited.title, 'Action description unavailable'); assert.equal(inherited.kind, 'Source type unavailable');
  }
});
test('all technical values are inside the closed source disclosure and supplied text is escaped', () => {
  const html = render([{ ...row, actorName: '<script>person</script>', objectName: '<img src=x onerror=alert(1)>' }]);
  const primary = html.replace(/<details[\s\S]*?<\/details>/g, '');
  for (const secret of [row.id, row.objectId, row.requestId, row.action, row.objectType]) assert.equal(primary.includes(secret), false);
  assert.match(html, /<details class="school-audit-technical"><summary>Technical details<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/); assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;person/); assert.match(html, /&lt;img src=x/);
});
test('duplicate human actions retain supplied row order and separate recorded dates without opaque suffixes', () => {
  const first = { ...row, id: 'first-in-source', requestId: 'first-request', occurredAt: '2026-10-04T12:00:00Z' };
  const second = { ...row, id: 'second-in-source', requestId: 'second-request', occurredAt: '2026-10-04T08:00:00Z' };
  const rows = [first, second], before = JSON.stringify(rows), html = render(rows);
  assert.equal((html.match(/<h3>Family access change<\/h3>/g) ?? []).length, 2);
  assert.ok(html.indexOf(first.occurredAt) < html.indexOf(second.occurredAt)); assert.equal(JSON.stringify(rows), before);
  assert.doesNotMatch(html, /Latest|Chronological|first-in-source|second-in-source/);
});
test('Arabic reading uses localized action, unknown and status with semantic LTR source codes', () => {
  const html = render([{ ...row, actorName: null, objectName: null, outcome: 'failed' }], 'ar');
  assert.match(html, /تغيير صلاحيات الأسرة/); assert.match(html, /الشخص غير متاح/); assert.match(html, /سياق المصدر غير متاح/); assert.match(html, /فشل/);
  assert.match(html, /<time dateTime="2026-10-04T10:24:37Z">/); assert.match(html, /<bdi>school.guardian.configure<\/bdi>/);
  assert.doesNotMatch(html.replace(/<details[\s\S]*?<\/details>/g, ''), /Family access change|school_operation/);
});
