import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditPresentation } from '../audit-presentation.ts';
import { SchoolAuditReading } from '../components/audit-reading.tsx';
import type { SchoolAuditRow } from '../model.ts';
import { createRequire } from 'node:module';
type RenderedElement = { textContent: string; querySelector(selector: string): RenderedElement | null; querySelectorAll(selector: string): RenderedElement[]; hasAttribute(name: string): boolean };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): RenderedElement };

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
  for (const [actorName, objectName] of [['<script>person</script>', '<img src=x onerror=alert(1)>'], ['<SCRIPT>person</SCRIPT>', '<IMG src=x onerror=alert(1)>']]) {
    const document = parse(render([{ ...row, actorName, objectName }]));
    const record = document.querySelector('.school-audit-row')!;
    const primary = ['header', '.school-audit-source', '.school-audit-context'].map(selector => record.querySelector(selector)?.textContent).join(' ');
    for (const secret of [row.id, row.objectId, row.requestId, row.action, row.objectType]) assert.equal(primary.includes(secret), false);
    const details = record.querySelector('details.school-audit-technical')!;
    assert.equal(details.querySelector('summary')?.textContent, 'Technical details'); assert.equal(details.hasAttribute('open'), false);
    for (const source of [row.action, row.objectType, row.objectId, row.requestId]) assert.ok(details.textContent.includes(source));
    assert.equal(record.querySelector('.school-audit-context dd bdi')?.textContent, actorName);
    assert.equal(record.querySelector('.school-audit-source bdi')?.textContent, objectName);
    assert.equal(record.querySelectorAll('script').length, 0); assert.equal(record.querySelectorAll('img').length, 0);
  }
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
  const record = parse(html).querySelector('.school-audit-row')!;
  assert.equal(record.querySelector('header h3')?.textContent, 'تغيير صلاحيات الأسرة');
  assert.equal(record.querySelector('.school-audit-source')?.textContent.includes('school_operation'), false);
});

test('current native writer actions have bilingual captions without changing source or outcome meaning', () => {
  const cases = [
    ['learner.observation_policy.approved', 'learner_observation_policy', 'Learning observation policy approval', 'اعتماد سياسة رصد التعلّم', 'Learning observation policy', 'سياسة رصد التعلّم'],
    ['assessment.create', 'assessment', 'Assessment creation', 'إنشاء تقييم', 'Assessment', 'تقييم'],
    ['learning.content.draft', 'learning_content', 'Learning content draft', 'مسودة محتوى تعلّم', 'Learning content', 'محتوى تعلّم'],
    ['learning.content.publish', 'learning_content', 'Learning content publication', 'نشر محتوى تعلّم', 'Learning content', 'محتوى تعلّم'],
    ['marking.create', 'marking', 'Assessment marking record', 'سجل تصحيح تقييم', 'Assessment marking', 'تصحيح تقييم'],
    ['submission.create', 'submission', 'Work submission record', 'سجل تسليم عمل', 'Submitted work', 'عمل مسلّم'],
  ];
  for (const [action, objectType, en, ar, kindEn, kindAr] of cases) {
    for (const [locale, title, kind] of [['en', en, kindEn], ['ar', ar, kindAr]] as const) {
      const source = { ...row, action, objectType, outcome: 'failed' as const };
      const view = auditPresentation(source, locale);
      assert.equal(view.title, title); assert.equal(view.kind, kind);
      assert.equal(view.source, locale === 'en' ? 'Source context unavailable' : 'سياق المصدر غير متاح');
      assert.equal(view.status, locale === 'en' ? 'Failed' : 'فشل');
      const document = parse(render([source], locale));
      assert.equal(document.querySelector('header h3')?.textContent, title);
      assert.equal(document.querySelector('details')?.hasAttribute('open'), false);
      assert.equal(document.querySelector('.school-audit-source')?.textContent, `${view.source} · ${kind}`);
      assert.equal(auditPresentation({ ...source, objectType: 'reference_fixture' }, locale).title, locale === 'en' ? 'Action description unavailable' : 'وصف الإجراء غير متاح');
    }
  }
});
