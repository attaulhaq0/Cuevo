import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { ReferenceList } from '../components/references.tsx';
import { RubricList } from '../components/rubrics.tsx';
import type { AcademicReference, Rubric } from '../model.ts';
import { WorkspacePageHeading } from '@cuevo/ui';
const id = '10000000-0000-4000-8000-000000000001';
function render(child: React.ReactNode) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: child })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('unselected objective directory shows its human title and withholds the full description until reading', () => {
  const reference: AcademicReference = { id, title: 'Checking reasons', description: 'Explain each source and why it supports your choice.', code: null, version: 'school-v1', status: 'APPROVED', sourceType: 'SCHOOL_AUTHORED', createdBy: id, approvedBy: id };
  const html = render(createElement(ReferenceList, { references: [reference], onChanged() {} }));
  assert.match(html, /<h2[^>]*>Objectives<\/h2>/); assert.match(html, /Checking reasons/); assert.match(html, /Current objectives/); assert.doesNotMatch(html, /Explain each source and why it supports your choice/);
});
test('unselected rubric directory keeps its human source title and withholds native criteria until explicit reading', () => {
  const rubric: Rubric = { id, courseId: id, title: 'School checking rubric', version: 'school-v1', sourceType: 'SCHOOL_AUTHORED', createdBy: id, createdAt: '2026-10-03T10:00:00Z', criteria: [{ key: 'checking', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show one source check.' }] }] };
  const html = render(createElement(RubricList, { rubrics: [rubric], courses: [], assessments: [], canCreate: false, onChanged() {} }));
  assert.match(html, /<h2[^>]*>Rubrics<\/h2>/); assert.match(html, /School checking rubric/); assert.match(html, /Current school rubrics/); assert.doesNotMatch(html, /Show one source check|data-rubric-id/);
});

test('content-first objective and rubric pages omit only their identical directory title and retain record context', () => {
  const reference: AcademicReference = { id, title: 'Checking reasons', description: 'Explain each source and why it supports your choice.', code: null, version: 'school-v1', status: 'APPROVED', sourceType: 'SCHOOL_AUTHORED', createdBy: id, approvedBy: id };
  const html = render(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Objectives' }), createElement(ReferenceList, { references: [reference], onChanged() {}, pageHeading: true })));
  assert.equal((html.match(/>Objectives<\//g) ?? []).length, 1); assert.match(html, /Checking reasons/); assert.doesNotMatch(html, /Explain each source/);
  const rubric: Rubric = { id, courseId: id, title: 'School checking rubric', version: 'school-v1', sourceType: 'SCHOOL_AUTHORED', createdBy: id, createdAt: '2026-10-03T10:00:00Z', criteria: [] };
  const rubrics = render(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Rubrics' }), createElement(RubricList, { rubrics: [rubric], courses: [], assessments: [], canCreate: false, onChanged() {}, pageHeading: true })));
  assert.equal((rubrics.match(/>Rubrics<\//g) ?? []).length, 1); assert.match(rubrics, /School checking rubric/); assert.match(rubrics, /immutable/i);
});
