import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningApiError } from '../../../shared/api/client.ts';

const id = '40000000-0000-4000-8000-000000000001';
const fixture = { locale: 'en', role: 'teacher', generation: 1, rows: [] as Record<string, unknown>[], stale: false, page: { loaded: true, loading: false, loadingMore: false, nextCursor: null as string | null, error: null as LearningApiError | null, moreError: null as LearningApiError | null } };
Object.assign(globalThis, { React, resultHistoryStateFixture: fixture });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: `export function useApp(){const f=globalThis.resultHistoryStateFixture;return {locale:f.locale,membership:{schoolId:'${id}',userId:'${id}',role:f.role},apiUrl:'',accessToken:'synthetic',accessGeneration:f.generation,online:true}}` };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){return {t:{loadMore:"Load more",loadingMore:"Loading more",errorDenied:"Access denied",errorUnavailable:"Service unavailable",requestReference:"Request reference"}}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.resultHistoryStateFixture;return {...f.page,data:f.rows.map(row=>({...parse(row),...(f.stale?{scope:"previous source"}:{})})),loadMore(){}}}' };
  // Hold the real owner in its explicitly opened state; every history predicate and child remains production code.
  if (path.endsWith('/academic/components/result-history.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('useState(false)', 'useState(true)'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { ResultHistory } = await import('../components/result-history.tsx');
function render() { return renderToStaticMarkup(createElement(ResultHistory, { resultId: id, anchor: { submissionId: id, assessmentId: id, learnerId: id } })); }
function reset(locale: string, role: string) { fixture.locale = locale; fixture.role = role; fixture.rows = []; fixture.stale = false; fixture.page = { loaded: true, loading: false, loadingMore: false, nextCursor: null, error: null, moreError: null }; }

test('opened result history of an existing source reviews terminal zero instead of going blank or asserting no history', () => {
  for (const locale of ['en', 'ar']) for (const role of ['student', 'teacher', 'coordinator', 'parent', 'admin']) {
    reset(locale, role); const html = render();
    assert.match(html, /data-state="review"/); assert.match(html, /role="status"/); assert.doesNotMatch(html, /data-state="empty"|<form/);
    assert.match(html, locale === 'en' ? /history.*unconfirmed/i : /السجل.*مؤكد/);
  }
});
test('unsettled and zero-row continued result histories retain unknown and the existing continuation/error owner', () => {
  for (const source of [{ loaded: false }, { nextCursor: id }, { loadingMore: true, nextCursor: id }, { moreError: new LearningApiError('unavailable'), nextCursor: id }]) {
    reset('en', 'teacher'); Object.assign(fixture.page, source); const html = render();
    assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/);
    if ('nextCursor' in source) assert.match(html, /Load more|Loading more/);
    if ('moreError' in source) assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  }
});
test('initial loading and denial retain their original state without a missing-history review', () => {
  for (const [loading, error, state] of [[true, null, 'loading'], [false, new LearningApiError('denied'), 'denied']] as const) {
    reset('en', 'parent'); Object.assign(fixture.page, { loading, error }); const html = render();
    assert.match(html, new RegExp('data-state="' + state + '"')); assert.doesNotMatch(html, /history.*unconfirmed/i);
  }
});
test('current native revision remains readable while previous actor/source rows cannot produce a history', () => {
  reset('en', 'teacher'); fixture.rows = [{ id, submissionId: id, assessmentId: id, learnerId: id, revision: 1, feedback: 'Retained source feedback', status: 'RELEASED', policyVersion: 2, referenceId: id, referenceVersion: 'school-v1', evidenceId: id, createdAt: '2026-10-05T08:00:00Z', assessmentTitle: 'Explain a method', referenceTitle: 'Checking reasons', model: 'numeric', score: 0, maxScore: 10, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2 } }];
  const current = render(); assert.match(current, /Retained source feedback/); assert.doesNotMatch(current, /history.*unconfirmed/i);
  fixture.stale = true; fixture.generation++; const stale = render(); assert.doesNotMatch(stale, /Retained source feedback/); assert.match(stale, /data-state="review"/);
});
test('a denied unauthorized or invalid continued result source withdraws historical feedback while unavailable remains readable', () => {
  for (const kind of ['denied', 'unauthorized', 'invalid', 'unavailable'] as const) {
    reset('en', 'teacher'); fixture.rows = [{ id, submissionId: id, assessmentId: id, learnerId: id, revision: 1, feedback: 'Historical private feedback', status: 'RELEASED', policyVersion: 2, referenceId: id, referenceVersion: 'school-v1', evidenceId: id, createdAt: '2026-10-05T08:00:00Z', assessmentTitle: 'Current task', referenceTitle: 'School objective', model: 'numeric', score: 0, maxScore: 10, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2 } }]; fixture.page.moreError = new LearningApiError(kind); fixture.page.nextCursor = id;
    const html = render(); assert.equal((html.match(/role="alert"/g) ?? []).length, 1); if (kind === 'unavailable') assert.match(html, /Historical private feedback/); else assert.doesNotMatch(html, /Historical private feedback|data-page-cursor/);
  }
});
