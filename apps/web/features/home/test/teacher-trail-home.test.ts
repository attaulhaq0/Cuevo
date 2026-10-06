import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TeacherTrailContext } from '../teacher-trail-model.ts';

Object.assign(globalThis, { React });
const { TeacherTrailHomeView } = await import('../components/teacher-trail-home.tsx');
function context(): TeacherTrailContext {
  return { availability: 'ready', dateLabel: null, attention: { status: 'unavailable', items: [] }, workspaces: [], insight: null, nextActions: [] };
}
function render(value: TeacherTrailContext, locale: 'en' | 'ar' = 'en') { return renderToStaticMarkup(createElement(TeacherTrailHomeView, { context: value, locale })); }

test('unknown attention and date stay unknown and never become zero or all-clear', () => {
  const html = render(context());
  assert.match(html, /Current attention records are not available/);
  assert.match(html, /Date is not available/);
  assert.doesNotMatch(html, /Nothing needs review|0 learners|Maya|Noor|2 \/ 4|XP|student-quality/);
});

test('denied and offline views do not render populated protected teacher context or callbacks', () => {
  for (const availability of ['denied', 'offline'] as const) {
    const value = context(); value.availability = availability;
    value.attention = { status: 'ready', items: [{ key: 'internal-row', kind: 'marking', title: 'Private source', learnerName: 'Private learner', classLabel: 'Private class', state: 'needs-review', statusLabel: 'New attempt submitted', nativeKind: 'numeric', action: { label: 'Review private work', onClick() {} } }] };
    const html = render(value); assert.doesNotMatch(html, /Private|private work|internal-row/);
    assert.match(html, availability === 'offline' ? /You are offline/ : /current access/);
  }
});

test('pending callbacks preserve disabled and busy semantics in rows, workspace tiles and next actions', () => {
  const value = context(); const pending = { label: 'Pending action', pending: true, onClick() {} };
  value.attention = { status: 'ready', items: [{ key: 'one', kind: 'marking', title: 'A current attempt', learnerName: null, classLabel: null, state: 'needs-review', statusLabel: 'New attempt submitted', nativeKind: 'unknown', action: pending }] };
  value.workspaces = [{ key: 'academic', title: 'Assessment', description: 'View and mark', icon: 'assessment', action: pending }];
  value.nextActions = [{ key: 'next', title: 'Read current source', icon: 'learning', action: pending }];
  const html = render(value); assert.equal((html.match(/disabled="" aria-busy="true"/g) || []).length, 3);
});

test('native numeric and rubric marking stay separate with unknown kind explicit', () => {
  const value = context(); value.attention = { status: 'ready', items: ['numeric', 'rubric', 'unknown'].map((nativeKind, index) => ({ key: String(index), kind: 'marking', title: `Attempt ${index + 1}`, learnerName: 'Samira', classLabel: 'Year 6', state: 'needs-review', statusLabel: 'New attempt submitted', nativeKind: nativeKind as 'numeric' | 'rubric' | 'unknown', action: { label: 'Review work', onClick() {} } })) };
  const html = render(value); assert.match(html, /Numeric marking/); assert.match(html, /Criterion marking/); assert.match(html, /Marking scale is not available/);
  assert.doesNotMatch(html, /Normalized|rank|overall score/);
});

test('earlier released feedback is attributed separately from a newly submitted attempt', () => {
  const value = context(); value.attention = { status: 'ready', items: [{ key: 'exact-current-row', kind: 'marking', title: 'Explain a different method', learnerName: 'Samira <script>', classLabel: null, state: 'needs-review', statusLabel: 'New attempt submitted', nativeKind: 'rubric', action: { label: 'Review this exact work', onClick() {} }, currentSubmission: { text: 'My current explanation', dateLabel: '3 October', action: { label: 'Open this submission', onClick() {} } }, earlierFeedback: { text: 'Explain each choice', authorName: 'Aisha', dateLabel: '1 October', action: { label: 'Open released feedback', onClick() {} } } }] };
  const html = render(value); assert.match(html, /Samira &lt;script&gt;/); assert.match(html, /Learner’s current submission/); assert.match(html, /Earlier released feedback/); assert.match(html, /Aisha/); assert.match(html, /My current explanation/);
  assert.doesNotMatch(html, /exact-current-row/);
});

test('a simulated proposal never becomes authoritative feedback or auto approval', () => {
  const value = context(); value.insight = { mode: 'fixture', approval: 'awaiting-review', sourceTitle: 'Earlier released result', sourceContext: 'Current class', sourceAction: { label: 'View exact source', onClick() {} }, interpretation: 'A next practice could focus on explanations.', limitation: 'One result does not establish cause.', reviewAction: { label: 'Review sources', onClick() {} } };
  const html = render(value); assert.match(html, /Simulated AI proposal/); assert.match(html, /Awaiting teacher review/); assert.match(html, /Possible interpretation/); assert.match(html, /One result does not establish cause/); assert.match(html, /You make the final decision/);
  assert.doesNotMatch(html, /Approved by AI|Release grades|Award|XP/);
});

test('Arabic renders deterministic localized unknown and recovery text', () => {
  const first = render(context(), 'ar'); const second = render(context(), 'ar');
  assert.equal(first, second); assert.match(first, /lang="ar" dir="rtl"/); assert.match(first, /يومك في التدريس/); assert.match(first, /التاريخ غير متاح/);
});

test('partial queue does not claim the visible records are a complete class total', () => {
  const value = context(); value.attention = { status: 'partial', items: [] };
  const html = render(value); assert.match(html, /Some records are not available/); assert.doesNotMatch(html, /Nothing needs review|All students|0 learners/);
});

test('rendering protected source facts never invokes a supplied domain command', () => {
  const value = context(); let calls = 0;
  value.nextActions = [{ key: 'action', title: 'Review the exact source', icon: 'reflection', action: { label: 'Review work', onClick() { calls += 1; } } }];
  render(value);
  assert.equal(calls, 0);
});

test('attention queue has a section heading before learner item headings', () => {
  const value = context(); value.attention = { status: 'ready', items: [{ key: 'one', kind: 'marking', title: 'Current attempt', learnerName: 'Samira', classLabel: 'Year 6', state: 'needs-review', statusLabel: 'Submitted', nativeKind: 'numeric', action: { label: 'Review work', onClick() {} } }] };
  const html = render(value);
  const attentionHeading = html.indexOf('>Current attention</h2>');
  const learnerHeading = html.indexOf('<h3><bdi>Samira');
  assert.ok(attentionHeading >= 0 && attentionHeading < learnerHeading);
});

test('current school updates are visible beside the review work with one heading and source recovery', () => {
  const value = { ...context(), updates: { status: 'partial' as const, items: [{ key: 'update-source', title: 'School reading review', body: 'Bring the current reading material on Monday.', dateLabel: '3 October', action: { label: 'Open school updates', onClick() {} } }], continuation: createElement('button', null, 'Load more school updates') } };
  const html = render(value);
  assert.match(html, /<h2[^>]*>.*School updates<\/h2>/);
  assert.match(html, /<h3[^>]*>.*School reading review<\/h3>/);
  assert.match(html, /Bring the current reading material on Monday\./);
  assert.match(html, /3 October/);
  assert.match(html, /Load more school updates/);
  assert.match(html, /More school updates may be available/);
  assert.equal((html.match(/<h1 /g) || []).length, 1);
  assert.doesNotMatch(html.slice(html.indexOf('teacher-trail__updates-wrap')), /<details|update-source/);
});

test('unavailable school updates hide stale content and distinguish failed reads from empty pages', () => {
  const value = { ...context(), updates: { status: 'unavailable' as const, items: [{ key: 'old', title: 'Stale school update', body: 'Private old context', dateLabel: null }], continuation: createElement('button', null, 'Refresh school updates') } };
  const html = render(value);
  assert.match(html, /School updates could not be loaded/);
  assert.match(html, /Refresh school updates/);
  assert.doesNotMatch(html, /Stale school update|Private old context|No school updates are available/);
  for (const availability of ['denied', 'offline'] as const) {
    assert.doesNotMatch(render({ ...value, availability }), /Stale school update|Private old context|Refresh school updates/);
  }
});

test('school update empty and loading states are source-specific and localized', () => {
  const ready = { ...context(), updates: { status: 'ready' as const, items: [] } };
  assert.match(render(ready), /No school updates are available in these loaded records/);
  const loading = { ...ready, updates: { status: 'loading' as const, items: [] } };
  assert.match(render(loading), /Loading school updates/);
  assert.doesNotMatch(render(loading), /No school updates are available/);
  assert.match(render(ready, 'ar'), /تحديثات المدرسة/);
});

test('a failed proposal read is unavailable rather than a confirmed absent proposal', () => {
  const value = { ...context(), insightStatus: 'unavailable' as const };
  const html = render(value);
  assert.match(html, /Current proposals could not be loaded/);
  assert.doesNotMatch(html, /No current proposal is available/);
});

test('an incomplete proposal page never becomes a confirmed absent proposal', () => {
  const value = { ...context(), insightStatus: 'partial' as const };
  const html = render(value);
  assert.match(html, /Some records are not available/);
  assert.doesNotMatch(html, /No current proposal is available/);
});
