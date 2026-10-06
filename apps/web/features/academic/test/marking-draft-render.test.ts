import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import type { MarkingItem } from '../model.ts';
import { MarkingDraftForm } from '../components/marking-draft.tsx';
const id = '10000000-0000-4000-8000-000000000001';
const item: MarkingItem = { id, assessmentId: id, learnerId: id, assessmentTitle: 'Explain a checking step', learnerName: 'Alex Reed', content: 'A source answer.', policyVersion: 2, referenceId: id, submissionRevision: 1, submissionStatus: 'SUBMITTED', currentResult: null, model: 'numeric', maxScore: 4, rubric: null };
function render(value: MarkingItem) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React'); Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(MarkingDraftForm, { item: value, onChanged() {} }) })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('an unmarked numeric source renders a blank required score while a recorded zero remains zero', () => {
  const html = render(item); const score = html.match(/<input[^>]*name="score"[^>]*>/)?.[0];
  assert.ok(score); assert.match(score, /min="0" max="4"/); assert.doesNotMatch(score, /value="0"/);
  const recorded = render({ ...item, currentResult: { id, revision: 1, feedback: 'Reviewed zero.', status: 'REVIEW', model: 'numeric', score: 0, maxScore: 4 } });
  assert.match(recorded.match(/<input[^>]*name="score"[^>]*>/)?.[0] ?? '', /value="0"/);
});
test('the native rubric draft renders all allowed descriptors and no numeric input', () => {
  const rubric: MarkingItem = { ...item, model: 'rubric', rubric: { id, title: 'Explanation', version: 'school-v1', criteria: [{ key: 'method', title: 'Method', levels: [{ key: 'starting', label: 'Starting', description: 'One relevant step.' }, { key: 'connected', label: 'Connected', description: 'Explains linked steps.' }] }, { key: 'checking', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'A relevant check.' }] }] } };
  const html = render(rubric); for (const text of ['Method', 'Starting — One relevant step.', 'Connected — Explains linked steps.', 'Checking', 'Shown — A relevant check.']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /name="score"|max="4"/); assert.match(html, /name="feedback"/);
});
