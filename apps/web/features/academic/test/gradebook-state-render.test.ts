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

const id = '40000000-0000-4000-8000-000000000001';
const fixture = { app: {} as Record<string, unknown>, rows: [] as Record<string, unknown>[], current: true, page: null as Record<string, unknown> | null, query: { loading: false, error: null as LearningApiError | null }, source: { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null } };
Object.assign(globalThis, { React, gradebookStateFixture: fixture, gradebookStateCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.gradebookStateFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(path,parse){const f=globalThis.gradebookStateFixture;return {...f.query,data:f.page?parse(f.page):null}}export function useApi(){const f=globalThis.gradebookStateFixture;return{journal:f.app.commandJournal,t:globalThis.gradebookStateCommon[f.app.locale]}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.gradebookStateFixture;return{...f.source,data:f.rows.map(parse).map(row=>f.current?row:{...row,sourceScope:"old source"}),loadMore(){}}}' };
  if (path.endsWith('/academic/components/gradebook.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8') + '\nexport { GradebookCourse };', { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { ClassGradebook, GradebookCourse } = await import('../components/gradebook.tsx') as typeof import('../components/gradebook.tsx') & { GradebookCourse: (props: { courseId: string; onChanged: () => void; onLockedChange: (value: boolean) => void }) => React.ReactElement };
function reset(locale: 'en' | 'ar', role = 'teacher') {
  fixture.app = { locale, membership: { schoolId: id, userId: id, role, entitlements: ['learning', 'assessment', 'curriculum'] }, status: 'ready', online: true, apiUrl: 'https://fixture.invalid', accessToken: 'synthetic', accessGeneration: 1, commandJournal: new CommandJournal(), formDrafts: new FormDrafts() };
  fixture.current = true; fixture.rows = []; fixture.source = { loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null }; fixture.query = { loading: false, error: null };
  fixture.page = { courseId: id, courseTitle: 'Current course', className: 'Cedar', yearGroupName: 'Year six', assessments: [], items: [], learnerTotal: 0, assessmentTotal: 0, nextLearnerCursor: null, nextAssessmentCursor: null };
}
const renderDirectory = () => renderToStaticMarkup(createElement(ClassGradebook));
const renderMatrix = () => renderToStaticMarkup(createElement(GradebookCourse, { courseId: id, onChanged() {}, onLockedChange() {} }));
test('gradebook terminal current zero course source shows a localized prerequisite state for teacher and admin', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['teacher', 'admin']) { reset(locale, role); const html = renderDirectory(); assert.match(html, /data-state="empty"/); assert.match(html, locale === 'en' ? /No courses are available for this gradebook/ : /لا توجد مقررات متاحة لسجل الدرجات/); assert.match(html, /gradebook-course/); assert.doesNotMatch(html, /<table|<form/); }
});
test('gradebook zero course source with continuation or unsettled context remains unknown with existing pager', () => {
  for (const source of [{ loaded: false }, { nextCursor: id }, { loadingMore: true, nextCursor: id }, { moreError: new LearningApiError('unavailable'), nextCursor: id }]) { reset('en'); Object.assign(fixture.source, source); const html = renderDirectory(); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/); if ('nextCursor' in source) assert.match(html, /Load more|Loading more/); if ('moreError' in source) assert.equal((html.match(/role="alert"/g) ?? []).length, 1); }
  reset('en'); fixture.current = false; fixture.rows = [{ id, classId: id, subjectId: id, title: 'Previous course', description: '', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00Z' }]; assert.match(renderDirectory(), /data-state="unknown"/); assert.doesNotMatch(renderDirectory(), /Previous course|data-state="empty"/);
});
test('gradebook course loading denied and nonstaff sources retain their current guard', () => {
  reset('ar'); fixture.source.loading = true; assert.match(renderDirectory(), /data-state="loading"/); assert.doesNotMatch(renderDirectory(), /data-state="empty"|data-state="unknown"/);
  reset('en'); fixture.source.error = new LearningApiError('denied'); assert.match(renderDirectory(), /data-state="denied"/); assert.doesNotMatch(renderDirectory(), /data-state="empty"|data-state="unknown"/);
  reset('en', 'parent'); assert.equal(renderDirectory(), '');
});
test('current gradebook names each confirmed empty learner or assessment dimension without changing the native table', () => {
  for (const locale of ['en', 'ar'] as const) for (const dimension of ['both', 'learners', 'assessments']) { reset(locale); if (dimension === 'learners') Object.assign(fixture.page!, { assessmentTotal: 1, assessments: [{ id, title: 'Current task', model: 'numeric', referenceTitle: null, policyVersion: 1 }] }); if (dimension === 'assessments') Object.assign(fixture.page!, { learnerTotal: 1, items: [{ id, learnerName: 'Current learner', identityRequiresReview: false, cells: [] }] }); const html = renderMatrix(); assert.equal((html.match(/data-state="empty"/g) ?? []).length, 1); assert.match(html, /<table/); assert.match(html, /Current course/); assert.match(html, locale === 'en' ? /No current (learners|assessments)/ : /لا (يوجد طلاب|توجد تقييمات)/); }
});
test('gradebook absent page dimensions with known positive totals or paging remain unknown', () => {
  for (const fields of [{ learnerTotal: 1 }, { assessmentTotal: 1 }, { nextLearnerCursor: id }, { nextAssessmentCursor: id }]) { reset('en'); Object.assign(fixture.page!, fields); const html = renderMatrix(); assert.equal((html.match(/data-state="unknown"/g) ?? []).length, 1); assert.doesNotMatch(html, /data-state="empty"/); if ('nextLearnerCursor' in fields) assert.match(html, /Next learners/); if ('nextAssessmentCursor' in fields) assert.match(html, /Next assessments/); }
});
test('gradebook zero dimension remains unknown while the other dimension still has continuation', () => {
  for (const nextCursor of [id, null]) {
    reset('en'); Object.assign(fixture.page!, { assessmentTotal: 2, assessments: [{ id, title: 'Current task', model: 'numeric', referenceTitle: null, policyVersion: 1 }], nextAssessmentCursor: nextCursor }); assert.match(renderMatrix(), /data-state="unknown"/); assert.doesNotMatch(renderMatrix(), /data-state="empty"/);
    reset('en'); Object.assign(fixture.page!, { learnerTotal: 2, items: [{ id, learnerName: 'Current learner', identityRequiresReview: false, cells: [] }], nextLearnerCursor: nextCursor }); assert.match(renderMatrix(), /data-state="unknown"/); assert.doesNotMatch(renderMatrix(), /data-state="empty"/);
  }
});
test('gradebook matrix source loading and denial withhold any zero verdict and populated native facts remain inline', () => {
  reset('en'); fixture.query.loading = true; assert.doesNotMatch(renderMatrix(), /data-state="empty"|Current course/); fixture.query.loading = false; fixture.query.error = new LearningApiError('denied'); assert.doesNotMatch(renderMatrix(), /data-state="empty"|Current course/);
  reset('en'); const cell = { assessmentId: id, state: 'REVIEW', submissionId: id, submissionRevision: 1, markingId: id, markingRevision: 1, policyVersion: 1, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 }, releasedResult: null }; Object.assign(fixture.page!, { learnerTotal: 1, assessmentTotal: 1, assessments: [{ id, title: 'Current task', model: 'numeric', referenceTitle: 'School objective', policyVersion: 1 }], items: [{ id, learnerName: 'Current learner', identityRequiresReview: false, cells: [cell] }] }); const native = renderMatrix(); assert.match(native, /Current learner|Reviewed draft/); assert.match(native, /aria-label="0 out of 10"/); assert.doesNotMatch(native, /data-state="empty"|data-state="unknown"/);
  Object.assign(cell, { state: 'NO_SUBMISSION', submissionId: null, submissionRevision: null, markingId: null, markingRevision: null, nativeResult: null }); const missing = renderMatrix(); assert.match(missing, /No submitted work/); assert.doesNotMatch(missing, /<dd[^>]*>0<\/dd>|data-state="empty"/);
});
test('gradebook rubric cells retain their criterion labels without a numeric total or workspace absence state', () => {
  reset('ar'); const nativeResult = { type: 'rubric', rubricId: id, rubricTitle: 'School rubric', rubricVersion: 'school-v1', policyVersion: 1, normalized: null, criteria: [{ criterionKey: 'method', criterionTitle: 'Checking method', levelKey: 'shown', levelLabel: 'Shown', levelDescription: 'Explains the method.' }] };
  Object.assign(fixture.page!, { learnerTotal: 1, assessmentTotal: 1, assessments: [{ id, title: 'Current task', model: 'rubric', referenceTitle: 'School objective', policyVersion: 1 }], items: [{ id, learnerName: 'Current learner', identityRequiresReview: false, cells: [{ assessmentId: id, state: 'REVIEW', submissionId: id, submissionRevision: 1, markingId: id, markingRevision: 1, policyVersion: 1, nativeResult, releasedResult: null }] }] });
  const html = renderMatrix(); assert.match(html, /Checking method|Shown|Explains the method/); assert.doesNotMatch(html, /native-score|data-state="empty"|data-state="unknown"/);
});
test('zero-course guidance does not unlock or replace the retained original gradebook release', () => {
  reset('en'); const drafts = fixture.app.formDrafts as FormDrafts, journal = fixture.app.commandJournal as CommandJournal, path = `/v1/courses/${id}/gradebook/release`;
  drafts.saveModel(`${id}:${id}:gradebook-course`, id); const original = journal.prepare(path, path, { selections: [], confirmRelease: true });
  const html = renderDirectory(); assert.match(html, /<select[^>]*disabled/); assert.match(html, /data-state="empty"/); assert.equal(journal.get(path), original); assert.doesNotMatch(html, /<form/);
});

