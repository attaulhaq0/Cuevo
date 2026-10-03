import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ParentTrailContext } from '../parent-trail-model.ts';
Object.assign(globalThis, { React });
const { ParentTrailHomeView } = await import('../components/parent-trail-home.tsx');

function context(): ParentTrailContext { return { availability: 'ready', child: { status: 'ready', key: 'child-a', name: 'Samira', classLabel: 'Year 6', schoolName: 'Current school' }, snapshot: { childKey: 'child-a', status: 'unavailable', feedback: null, portfolio: null, upcoming: [], communication: null, support: null }, selector: createElement('p', null, 'Current child selector') }; }
function render(value: ParentTrailContext, locale: 'en' | 'ar' = 'en') { return renderToStaticMarkup(createElement(ParentTrailHomeView, { context: value, locale })); }

test('child resolving does not turn disabled content queries into empty approved records', () => {
  const value = context(); value.child = { status: 'resolving' }; const html = render(value);
  assert.match(html, /Checking current child relationships/); assert.match(html, /Current child selector/);
  assert.doesNotMatch(html, /Latest approved feedback|Samira|No feedback|XP|habit|AI proposal/);
});
test('required selection and matching identities remain explicit without ID labels', () => {
  for (const status of ['selection-required', 'requires-review'] as const) { const value = context(); value.child = { status }; const html = render(value); assert.doesNotMatch(html, /child-a|Latest approved feedback/); assert.match(html, status === 'selection-required' ? /Choose a child/ : /distinguish matching child records/); }
});
test('a late prior-child snapshot never renders under the selected child heading', () => {
  const value = context(); value.snapshot = { ...value.snapshot!, childKey: 'child-b', status: 'ready', feedback: { publication: 'approved', title: 'Other child source', text: 'Private feedback', teacherName: 'Private teacher', dateLabel: 'Yesterday', description: 'Private context', nativeResultView: createElement('strong', null, '9 / 10'), action: { label: 'Read private source', onClick() {} } } };
  const html = render(value); assert.match(html, /Current child records are being checked/); assert.doesNotMatch(html, /Other child|Private|9 \/ 10|private source/);
});
test('denied and offline contexts clear all selected-child protected content', () => {
  for (const availability of ['denied', 'offline'] as const) { const value = context(); value.availability = availability; const html = render(value); assert.doesNotMatch(html, /Samira|Current school|Current child selector|Latest approved feedback/); assert.match(html, availability === 'offline' ? /You are offline/ : /current access/); }
});
test('approved exact native result remains caller-rendered and a withdrawn source is hidden', () => {
  const value = context(); value.snapshot = { ...value.snapshot!, status: 'ready', feedback: { publication: 'approved', title: 'Explain your method', text: 'Show each step.', teacherName: 'Aisha', dateLabel: '2 October', description: 'Released work feedback', nativeResultView: createElement('span', null, 'Reasoning: Developing · Shows a method'), action: { label: 'Read approved report', onClick() {} } } };
  const html = render(value); assert.match(html, /Reasoning: Developing/); assert.match(html, /Approved by school/); assert.doesNotMatch(html, /Normalized|XP|habits/);
  value.snapshot.feedback!.publication = 'withdrawn'; assert.doesNotMatch(render(value), /Show each step|Aisha|Reasoning: Developing|Read approved report/);
});
test('pending parent actions keep disabled and busy state and render never sends a message', () => {
  const value = context(); let calls = 0; value.snapshot = { ...value.snapshot!, status: 'ready', communication: { status: 'available', teacherName: 'Aisha', title: 'Current school conversation', description: 'Talk with the current assigned teacher.', action: { label: 'Open conversation', pending: true, onClick() { calls += 1; } } } };
  const html = render(value); assert.match(html, /disabled="" aria-busy="true"/); assert.equal(calls, 0); assert.doesNotMatch(html, /Future vision|AI-generated/);
});
test('unavailable snapshot is honest unknown rather than empty or no attainment', () => { const html = render(context()); assert.match(html, /Approved feedback is not available yet/); assert.doesNotMatch(html, /No progress|0 points|No work|No messages/); });
test('Arabic is deterministic and uses exact selected-child context', () => { const first = render(context(), 'ar'); assert.equal(first, render(context(), 'ar')); assert.match(first, /lang="ar" dir="rtl"/); assert.match(first, /Samira/); assert.match(first, /ملاحظات معتمدة/); });
test('an unavailable or failed current read does not reuse a populated old portfolio', () => {
  const value = context(); value.snapshot!.portfolio = { publication: 'approved', title: 'Old private title', description: 'Old private description', action: { label: 'Open stale work', onClick() {} } };
  assert.doesNotMatch(render(value), /Old private|stale work/);
  value.snapshot!.status = 'ready'; value.availability = 'error'; assert.doesNotMatch(render(value), /Old private|stale work|Samira/);
});
