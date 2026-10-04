import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { currentMarkingReference, type AcademicReference, type MarkingItem } from '../model.ts';
import { MarkingWorkbench, MarkingChoices } from '../components/marking-workbench.tsx';
import { createRequire } from 'node:module';
type RenderedElement = { textContent: string; querySelector(selector: string): RenderedElement | null; querySelectorAll(selector: string): RenderedElement[] };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): RenderedElement };

const id = '10000000-0000-4000-8000-000000000001';
const item: MarkingItem = { id, assessmentId: id, learnerId: id, assessmentTitle: 'Explain a checking step', learnerName: 'Alex Reed', content: 'I checked the method against a second example.', policyVersion: 2, referenceId: id, submissionRevision: 1, submissionStatus: 'SUBMITTED', currentResult: null, model: 'numeric', maxScore: 4, rubric: null };
const reference: AcademicReference = { id, title: 'Checking reasons', description: 'Explain each choice using the source evidence.', code: null, version: 'school-v1', status: 'APPROVED', sourceType: 'SCHOOL_AUTHORED', createdBy: id, approvedBy: id };
function render(child: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: child })); }
  finally { if (previous) Object.defineProperty(globalThis, 'React', previous); else Reflect.deleteProperty(globalThis, 'React'); }
}
test('the selected workbench keeps original work and objective description before the native decision', () => {
  const html = render(createElement(MarkingWorkbench, { item, reference, work: createElement('p', null, item.content), decision: createElement('button', null, 'Save marking draft') }));
  assert.match(html, /Alex Reed/); assert.match(html, /Maximum score/); assert.match(html, />4</);
  assert.match(html, /<h2>Explain a checking step<\/h2>/);
  assert.ok(html.indexOf(item.content) < html.indexOf('Save marking draft'));
  assert.ok(html.indexOf(reference.description) < html.indexOf('Save marking draft'));
  assert.doesNotMatch(html, /value="0"|Noor|School checking course/);
});
test('rubric review shows every native criterion and allowed descriptor without a numeric substitute', () => {
  const rubric: MarkingItem = { ...item, model: 'rubric', rubric: { id, title: 'School explanation rubric', version: 'school-v1', criteria: [{ key: 'explanation', title: 'Explanation', levels: [{ key: 'developing', label: 'Developing', description: 'Explain a relevant step.' }, { key: 'secure', label: 'Secure', description: 'Explain connected steps.' }] }, { key: 'checking', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show a relevant check.' }] }] } };
  const html = render(createElement(MarkingWorkbench, { item: rubric, reference, work: createElement('p', null, item.content), decision: createElement('button', null, 'Save criterion draft') }));
  const document = parse(html); const criteria = document.querySelectorAll('.marking-rubric-source section');
  assert.deepEqual(criteria.map(criterion => criterion.querySelector('h4')?.textContent), ['Explanation', 'Checking']);
  assert.deepEqual(criteria.map(criterion => criterion.querySelectorAll('dt').map(level => level.textContent)), [['Developing', 'Secure'], ['Shown']]);
  assert.deepEqual(criteria.map(criterion => criterion.querySelectorAll('dd').map(level => level.textContent)), [['Explain a relevant step.', 'Explain connected steps.'], ['Show a relevant check.']]);
  assert.doesNotMatch(html, /Maximum score|0 \/ 4|normalized score/);
});
test('unselected or missing queue source offers an explicit selection without copying another response', () => {
  const html = render(createElement(MarkingChoices, { items: [item], selected: 'missing', onSelected() {} }));
  assert.match(html, /Select submitted work/); assert.doesNotMatch(html, /I checked the method|Save marking draft/);
});
test('current objective cannot authorize a decision while loading, failed or from another scope', () => {
  const read = { data: { scope: 'current', value: reference }, loading: false, error: null };
  assert.equal(currentMarkingReference(read, 'current', id), reference);
  for (const changed of [{ ...read, loading: true }, { ...read, error: new Error('failed') }, { ...read, data: { scope: 'old', value: reference } }, { ...read, data: { scope: 'current', value: { ...reference, id: 'another' } } }]) assert.equal(currentMarkingReference(changed, 'current', id), null);
});
test('Arabic source context keeps full descriptors and the same original work', () => {
  const html = render(createElement(MarkingWorkbench, { item, reference: null, work: createElement('p', null, item.content), decision: null }), 'ar');
  assert.match(html, /العمل المسلّم/); assert.match(html, /Alex Reed/); assert.match(html, /I checked the method/); assert.doesNotMatch(html, /Checking reasons|school-v1/);
});
test('selected marking retains all named choices inside one keyboard disclosure without copying source work', () => {
  const second = { ...item, id: '10000000-0000-4000-8000-000000000002', assessmentTitle: 'Explain another check', learnerName: 'Sam Reed' };
  const html = render(createElement(MarkingChoices, { items: [item, second], selected: item.id, onSelected() {} }));
  assert.match(html, /<details/); assert.match(html, /Choose another submission/);
  assert.match(html, /Explain a checking step/); assert.match(html, /Explain another check/); assert.match(html, /Sam Reed/);
  assert.doesNotMatch(html, /I checked the method against/);
});
test('pending original marking reconciliation disables replacement source choice without removing it', () => {
  const html = render(createElement(MarkingChoices, { items: [item], selected: item.id, disabled: true, onSelected() {} }));
  assert.match(html, /<button[^>]*disabled/); assert.match(html, /Alex Reed/);
});
