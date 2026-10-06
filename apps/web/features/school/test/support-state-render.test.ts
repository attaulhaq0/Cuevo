import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningApiError } from '../../../shared/api/client.ts';

const learner = '10000000-0000-4000-8000-000000000001', course = '30000000-0000-4000-8000-000000000001';
const profile = { id: learner, displayName: 'School learner', schoolName: 'School', enrollments: [], courses: [{ id: course, title: 'Checking course', classId: course, className: 'Year 1 Cedar', subjectName: 'Mathematics' }] };
const support = { id: 'support', learnerId: learner, learnerName: 'School learner', courseId: course, courseTitle: 'Checking course', assessmentId: null, assessmentTitle: null, title: 'Checking guide', instructions: 'Review one school step.', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', revision: 1, state: 'ACTIVE', studentVisible: true, parentVisible: true };
const fixture = { locale: 'en', role: 'student', rows: [] as Record<string, unknown>[], profileCurrent: true, page: { loaded: true, loading: false, loadingMore: false, nextCursor: null as string | null, error: null as LearningApiError | null, moreError: null as LearningApiError | null } };
Object.assign(globalThis, { React, supportStateFixture: fixture, supportStateProfile: profile, supportStateLearner: learner, supportStateCourse: course });
let generatedFixtureSource = '';
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: `export function useApp(){const f=globalThis.supportStateFixture;return {locale:f.locale,membership:{schoolId:globalThis.supportStateLearner,userId:globalThis.supportStateLearner,role:f.role},apiUrl:'',accessToken:'synthetic',accessGeneration:1,online:true,status:"ready"}}` };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: generatedFixtureSource = `export function useApiQuery(path,parse){const f=globalThis.supportStateFixture;const data=parse(globalThis.supportStateProfile);return {data:f.profileCurrent?data:{...data,scope:'previous child'},loading:false,error:null}}export function useApi(){return {t:{loadMore:'Load more',loadingMore:'Loading more',errorDenied:'Access denied',errorUnavailable:"Service unavailable"}}}` };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.supportStateFixture;return {...f.page,data:path?f.rows.map(parse):[],loadMore(){}}}' };
  // Hold only the explicit chosen course; the real profile/course match and every state remain unchanged.
  if (path.endsWith('/school/components/parent-learning-support.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace("useState('')", 'useState(globalThis.supportStateCourse)'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return next(url, context);
} });
const { TaskLearningSupport } = await import('../components/task-support.tsx');
const { ParentLearningSupport } = await import('../components/parent-learning-support.tsx');
function reset(locale: string, role: string) { fixture.locale = locale; fixture.role = role; fixture.rows = []; fixture.profileCurrent = true; fixture.page = { loaded: true, loading: false, loadingMore: false, nextCursor: null, error: null, moreError: null }; }
function task() { return renderToStaticMarkup(createElement(TaskLearningSupport, { courseId: course, assessmentId: course })); }
function parent() { return renderToStaticMarkup(createElement(ParentLearningSupport, { learnerId: learner, learnerName: 'School learner', refresh: 0 })); }

test('optional task support is absent only after a complete settled no-active source', () => {
  for (const locale of ['en', 'ar']) for (const rows of [[], [{ ...support, state: 'EXPIRED' }]]) { reset(locale, 'student'); fixture.rows = rows; assert.equal(task(), ''); }
});
test('zero active task support with a cursor stays visible and offers its existing continuation', () => {
  for (const locale of ['en', 'ar']) for (const rows of [[], [{ ...support, state: 'EXPIRED' }]]) {
    reset(locale, 'student'); fixture.rows = rows; fixture.page.nextCursor = 'later'; const html = task(); assert.match(html, /data-state="unknown"/); assert.match(html, /Load more/); assert.doesNotMatch(html, /data-state="empty"|Review one school step/);
  }
});
test('unloaded task support shows loading and zero-row active continuation stays unknown', () => {
  reset('en', 'teacher'); fixture.page.loaded = false; assert.match(task(), /data-state="loading"/);
  fixture.page.loaded = true; fixture.page.loadingMore = true; const html = task(); assert.match(html, /data-state="unknown"/); assert.doesNotMatch(html, /data-state="empty"/);
});
test('task support continuation failures remain visible once with retry instead of disappearing', () => {
  for (const kind of ['unavailable', 'denied'] as const) { reset('ar', 'student'); fixture.page.moreError = new LearningApiError(kind); fixture.page.nextCursor = 'later'; const html = task(); assert.equal((html.match(/role="alert"/g) ?? []).length, 1); assert.match(html, /Load more/); assert.doesNotMatch(html, /data-state="empty"/); }
});
test('existing initial errors and active task instructions retain their exact source surface', () => {
  reset('en', 'student'); fixture.page.error = new LearningApiError('denied'); assert.match(task(), /Access denied/);
  reset('en', 'student'); fixture.rows = [support]; const html = task(); assert.match(html, /Checking guide|Review one school step/); assert.doesNotMatch(html, /data-state="empty"|<form/);
});
test('denied unauthorized and invalid continuation withhold loaded task support instructions', () => {
  for (const locale of ['en', 'ar']) for (const kind of ['denied', 'unauthorized', 'invalid'] as const) {
    reset(locale, 'student'); fixture.rows = [support]; fixture.page.moreError = new LearningApiError(kind); fixture.page.nextCursor = 'later'; const html = task();
    assert.doesNotMatch(html, /Checking guide|Review one school step/); assert.equal((html.match(/role="alert"/g) ?? []).length, 1); assert.doesNotMatch(html, /data-state="empty"/);
  }
});
test('transient continuation failure retains current task instructions and a fresh successful read restores refused content', () => {
  reset('en', 'student'); fixture.rows = [support]; fixture.page.moreError = new LearningApiError('unavailable'); fixture.page.nextCursor = 'later'; const outage = task(); assert.match(outage, /Checking guide|Review one school step/); assert.equal((outage.match(/role="alert"/g) ?? []).length, 1); assert.match(outage, /Load more/);
  fixture.page.moreError = new LearningApiError('denied'); assert.doesNotMatch(task(), /Review one school step/);
  fixture.page = { ...fixture.page, loaded: false, loading: true, moreError: null }; assert.doesNotMatch(task(), /Review one school step/);
  fixture.page = { ...fixture.page, loaded: true, loading: false, nextCursor: null }; assert.match(task(), /Review one school step/);
});
test('parent complete zero retains no-published-support copy and incomplete zero never asserts absence', () => {
  for (const locale of ['en', 'ar']) { reset(locale, 'parent'); const complete = parent(); assert.match(complete, /data-state="empty"/); assert.match(complete, locale === 'en' ? /No current support instructions are published/ : /لا توجد تعليمات دعم حالية منشورة/);
    for (const partial of [{ nextCursor: 'later' }, { loadingMore: true }]) { Object.assign(fixture.page, partial); const html = parent(); assert.match(html, /data-state="unknown"/); assert.match(html, locale === 'en' ? /loaded page.*Continue loading/ : /الصفحة المحمّلة.*تابع التحميل/); assert.doesNotMatch(html, /No current support instructions are published|لا توجد تعليمات دعم حالية منشورة|data-state="empty"/); fixture.page.nextCursor = null; fixture.page.loadingMore = false; }
  }
});
test('parent unloaded support shows loading and current continuation denial remains its existing error', () => {
  reset('en', 'parent'); fixture.page.loaded = false; assert.match(parent(), /data-state="loading"/);
  fixture.page.loaded = true; fixture.page.moreError = new LearningApiError('denied'); const html = parent(); assert.match(html, /Access denied/); assert.doesNotMatch(html, /No current support instructions are published|data-state="empty"/);
});
test('a previous child profile cannot expose support and current parent-visible instructions remain readable', () => {
  reset('en', 'parent'); fixture.rows = [support]; assert.match(parent(), /Review one school step/);
  fixture.profileCurrent = false; const html = parent(); assert.doesNotMatch(html, /Review one school step|Checking guide/); assert.match(html, /role="alert"/);
});

test('generated fixture modules keep learner profiles as data rather than embedded JavaScript', () => { assert.doesNotMatch(generatedFixtureSource, /School learner|Checking course/); });

test('hostile course titles remain escaped profile data and never execute during rendering', () => { reset('en','parent'); const original=profile.courses[0].title; (globalThis as unknown as {supportFixtureExecuted:number}).supportFixtureExecuted=0; try { profile.courses[0].title='</script><script>globalThis.supportFixtureExecuted=1</script>\u2028\u2029'; const html=parent(); assert.ok(html.includes('&lt;/script&gt;&lt;script&gt;')); assert.doesNotMatch(html,/<script>/); assert.equal((globalThis as unknown as {supportFixtureExecuted:number}).supportFixtureExecuted,0); assert.doesNotMatch(generatedFixtureSource,/supportFixtureExecuted/); } finally { profile.courses[0].title=original; } });
