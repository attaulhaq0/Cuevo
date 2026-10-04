import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThinkingFocusSummary } from '../components/thinking-focus.tsx';
import type { ThinkingFocusResponse } from '@cuevo/contracts';

const id = 'f3000000-0000-4000-8000-000000000001';
const approved: ThinkingFocusResponse = {
  schemaVersion: '1', target: { kind: 'ACTIVITY', id, criterionKey: null }, courseId: id,
  targetTitle: 'Use an idea', sourceVersion: 'private-source-version', status: 'APPROVED', revision: 2,
  classification: { id, revision: 2, focus: { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'APPLY', additionalProcesses: ['UNDERSTAND'] }, rationale: 'Private reviewer rationale', authorId: id, authoredAt: '2026-10-04T09:00:00Z', reviewerId: 'f3000000-0000-4000-8000-000000000002', reviewedAt: '2026-10-04T10:00:00Z', reviewReason: 'Private review reason' },
  source: { title: 'Use an idea', instructions: 'Use one school example.', contentRevision: 1, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null }, canAuthor: false, canReview: false,
};
function render(value: ThinkingFocusResponse | null | undefined, locale: 'en' | 'ar') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(ThinkingFocusSummary, { value, locale })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('approved task summary uses human demand language without leaking source identifiers or private reasons', () => {
  const html = render(approved, 'en');
  assert.match(html, /Use an idea or method in this activity/);
  assert.match(html, /Apply · Understand/);
  assert.doesNotMatch(html, /private-source-version|Private reviewer|Private review|f3000000/);
  assert.doesNotMatch(html, /\bAPPLY\b|\bUNDERSTAND\b|<select|<form/);
});
test('missing and changed task focus stay explicit in both languages without offering learner levels', () => {
  assert.match(render(undefined, 'en'), /has not been reviewed/);
  assert.match(render(null, 'ar'), /لم يُراجع/);
  const changed = render({ ...approved, status: 'SOURCE_CHANGED' }, 'ar');
  assert.match(changed, /تغيّرت المهمة/); assert.doesNotMatch(changed, /استخدم فكرة أو طريقة/);
});
test('task-focus explanations start closed and never become a grade or points claim', () => {
  const html = render(approved, 'ar');
  assert.match(html, /<details>/); assert.doesNotMatch(html, /<details open/);
  assert.match(html, /لا يقيس قدرتك/); assert.doesNotMatch(html, /<strong>\d/);
});
