import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import type { Assessment } from '../model.ts';
const id = '40000000-0000-4000-8000-000000000001';
const fixture = { app: {} as Record<string, unknown>, rows: [] as Record<string, unknown>[], source: { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null } };
Object.assign(globalThis, { React, quizVersionStateFixture: fixture, quizVersionStateCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.quizVersionStateFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(){return{loading:false,error:null,data:null}}export function useApi(){const f=globalThis.quizVersionStateFixture;return{journal:f.app.commandJournal,t:globalThis.quizVersionStateCommon[f.app.locale]}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.quizVersionStateFixture;return{...f.source,data:path?f.rows.map(parse):[],loadMore(){}}}' };
  if (path.endsWith('/learning/components/quiz.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace('[open, setOpen] = useState(retainedDraft)', '[open, setOpen] = useState(true)'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { QuizWorkspace } = await import('../components/quiz.tsx');
const assessment: Assessment = { id, courseId: id, title: 'Current quiz task', instructions: 'Current instructions', status: 'DRAFT', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: false, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'QUIZ', model: 'numeric', maxScore: 10, rubricId: null };
function reset(locale: 'en' | 'ar', role = 'teacher') { fixture.app = { locale, membership: { schoolId: id, userId: id, role }, status: 'ready', online: true, commandJournal: new CommandJournal(), formDrafts: new FormDrafts() }; fixture.rows = []; fixture.source = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null }; }
const render = () => renderToStaticMarkup(createElement(QuizWorkspace, { assessment, author: true, onChanged() {} }));
test('opened quiz versions show bilingual confirmed empty guidance beside the existing create action', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['teacher', 'admin']) { reset(locale, role); const html = render(); assert.match(html, /data-state="empty"/); assert.match(html, locale === 'en' ? /No quiz versions are recorded for this task/ : /لا توجد إصدارات اختبار مسجلة لهذا التقييم/); assert.match(html, locale === 'en' ? /Create quiz version/ : /إنشاء إصدار اختبار/); assert.doesNotMatch(html, /<form/); }
});
test('unsettled continued and failed-continuation zero quiz versions remain unknown with one existing error and paging owner', () => {
  for (const source of [{ loaded: false }, { nextCursor: id }, { loadingMore: true, nextCursor: id }, { moreError: new LearningApiError('unavailable'), nextCursor: id }]) { reset('en'); Object.assign(fixture.source, source); const html = render(); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/); if ('nextCursor' in source) assert.match(html, /Load more|Loading more/); if ('moreError' in source) assert.equal((html.match(/role="alert"/g) ?? []).length, 1); }
});
test('initial quiz-version loading and denial keep their current source states without an absence claim', () => {
  reset('en'); fixture.source.loading = true; assert.match(render(), /data-state="loading"/); assert.doesNotMatch(render(), /data-state="empty"|data-state="unknown"/); reset('ar'); fixture.source.error = new LearningApiError('denied'); assert.match(render(), /data-state="denied"/); assert.doesNotMatch(render(), /data-state="empty"|data-state="unknown"/);
});
test('recorded exact published quiz versions preserve visible questions and checked key labels', () => {
  reset('en'); fixture.rows = [{ id, assessmentId: id, version: 'school-v1', published: true, createdAt: '2026-10-01T00:00:00Z', questions: [{ key: 'q0', prompt: 'Current question', options: [{ key: 'o0', label: 'Current answer' }, { key: 'o1', label: 'Another answer' }], correctOptionKey: 'o0' }] }]; const html = render(); assert.match(html, /Current question|Current answer|Published/); assert.doesNotMatch(html, /data-state="empty"|data-state="unknown"|<form/);
});
test('unpublished quiz version retains the exact publication form without workspace absence guidance', () => {
  reset('en'); fixture.rows = [{ id, assessmentId: id, version: 'school-v1', published: false, createdAt: '2026-10-01T00:00:00Z', questions: [{ key: 'q0', prompt: 'Current question', options: [{ key: 'o0', label: 'Current answer' }, { key: 'o1', label: 'Another answer' }], correctOptionKey: 'o0' }] }];
  const html = render(); assert.match(html, /Publish quiz version|immutable questions and answer keys/); assert.match(html, /<form/); assert.doesNotMatch(html, /data-state="empty"|data-state="unknown"/);
});
