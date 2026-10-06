import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const id = '40000000-0000-4000-8000-000000000001';
const fixture = { app: {} as Record<string, unknown>, sourceCurrent: true, rows: [] as Record<string, unknown>[], source: { id, courseId: id, resource: 'lesson', sourceId: id, revision: 1, title: 'Exact lesson title', content: 'Exact lesson instructions', kind: null, assessmentId: null, state: 'RETIRED', createdAt: '2026-10-05T08:00:00Z', publishedRevision: 1, draftRevision: 1 }, page: { loaded: true, loading: false, loadingMore: false, nextCursor: null as string | null, error: null as LearningApiError | null, moreError: null as LearningApiError | null } };
Object.assign(globalThis, { React, learningHistoryStateFixture: fixture });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.learningHistoryStateFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(path,parse){const f=globalThis.learningHistoryStateFixture;if(!path)return {loading:false,error:null,data:null};const data=parse(f.source);return {loading:false,error:null,data:f.sourceCurrent?data:{...data,scope:"previous source"}}}export function useApi(){return {journal:globalThis.learningHistoryStateFixture.app.commandJournal,t:{loadMore:"Load more",loadingMore:"Loading more",errorDenied:"Access denied",errorUnavailable:"Service unavailable",requestReference:"Request reference"}}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.learningHistoryStateFixture;return {...f.page,data:path?f.rows.map(parse):[],loadMore(){}}}' };
  // These fixtures supply the explicit open intent only; source parsing, current admission and state rendering stay real.
  if (path.endsWith('/learning/components/submission-lifecycle.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('const [open, setOpen] = useState(false);', 'const [open, setOpen] = useState(true);'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  if (path.endsWith('/learning/components/content-editor.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace("(restored??null)", "('history')"), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { SubmissionHistory } = await import('../components/submission-lifecycle.tsx');
const { LearningContentEditor } = await import('../components/content-editor.tsx');
function reset(locale: string, role: string) { fixture.app = { locale, membership: { schoolId: id, userId: id, role }, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, status: 'ready', online: true, commandJournal: new CommandJournal(), formDrafts: new FormDrafts() }; fixture.sourceCurrent = true; fixture.rows = []; fixture.page = { loaded: true, loading: false, loadingMore: false, nextCursor: null, error: null, moreError: null }; }
function render(kind: 'submission' | 'content') { return renderToStaticMarkup(kind === 'submission' ? createElement(SubmissionHistory, { submissionId: id }) : createElement(LearningContentEditor, { resource: 'lesson', sourceId: id, courseId: id, onChanged() {} })); }
for (const kind of ['submission', 'content'] as const) test(`opened ${kind} history of an existing source shows bilingual source review for terminal zero`, () => {
  for (const locale of ['en', 'ar']) for (const role of kind === 'submission' ? ['student', 'teacher', 'admin'] : ['teacher', 'admin']) {
    reset(locale, role); const html = render(kind); assert.match(html, /data-state="review"/); assert.match(html, /role="status"/); assert.doesNotMatch(html, /data-state="empty"|<form/); assert.match(html, locale === 'en' ? /history.*unconfirmed/i : /السجل.*مؤكد/);
  }
});
for (const kind of ['submission', 'content'] as const) test(`zero-row unsettled and continued ${kind} history cannot claim a complete empty source`, () => {
  for (const source of [{ loaded: false }, { nextCursor: id }, { loadingMore: true, nextCursor: id }, { moreError: new LearningApiError('unavailable'), nextCursor: id }]) {
    reset('en', 'teacher'); Object.assign(fixture.page, source); const html = render(kind); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/);
    if ('nextCursor' in source) assert.match(html, /Load more|Loading more/); if ('moreError' in source) assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  }
});
test('initial history loading and denied reads preserve one existing state owner', () => {
  for (const kind of ['submission', 'content'] as const) for (const [loading, error, state] of [[true, null, 'loading'], [false, new LearningApiError('denied'), 'denied']] as const) {
    reset('ar', 'teacher'); Object.assign(fixture.page, { loading, error }); const html = render(kind); assert.match(html, new RegExp('data-state="' + state + '"')); assert.doesNotMatch(html, /السجل.*مؤكد/);
  }
});
test('retired exact content keeps readable history while source-scope loss withholds it', () => {
  reset('en', 'teacher'); fixture.rows = [{ ...fixture.source, content: 'Retained exact revision' }]; const current = render('content'); assert.match(current, /Retained exact revision/); assert.doesNotMatch(current, /history.*unconfirmed/i); assert.doesNotMatch(current, /<form/);
  fixture.sourceCurrent = false; const stale = render('content'); assert.doesNotMatch(stale, /Retained exact revision|Content history/);
});
test('submission revision and source feedback remain readable without a duplicate missing-history state', () => {
  reset('en', 'student'); fixture.rows = [{ id, assessmentId: id, assessmentTitle: 'Exact assessment', learnerId: id, learnerName: 'Exact learner', content: 'Retained submitted revision', responseKind: 'TEXT', artifactCount: 0, status: 'SUBMITTED', revision: 1, submittedAt: '2026-10-05T08:00:00Z', previousSubmissionId: null, sourceReturnId: null, returnId: null, returnFeedback: 'Retained teacher feedback', returnedAt: null }];
  const html = render('submission'); assert.match(html, /Retained submitted revision|Retained teacher feedback/); assert.doesNotMatch(html, /history.*unconfirmed/i);
});
test('continued submission and content refusal withdraws prior history while a transient unavailable source retains it', () => {
  for (const owner of ['content', 'submission'] as const) for (const kind of ['denied', 'unauthorized', 'invalid', 'unavailable'] as const) {
    reset('en', 'teacher'); fixture.rows = owner === 'content' ? [{ ...fixture.source, content: 'Historical private text' }] : [{ id, assessmentId: id, assessmentTitle: 'Current task', learnerId: id, learnerName: 'Current learner', content: 'Historical private text', status: 'SUBMITTED', revision: 1, submittedAt: '2026-10-05T08:00:00Z' }]; fixture.page.moreError = new LearningApiError(kind); fixture.page.nextCursor = id;
    const html = render(owner); assert.equal((html.match(/role="alert"/g) ?? []).length, 1); if (kind === 'unavailable') assert.match(html, /Historical private text/); else assert.doesNotMatch(html, /Historical private text|data-page-cursor/);
  }
});
