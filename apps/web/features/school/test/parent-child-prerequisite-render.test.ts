import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { learnerProfileAr, learnerProfileEn, schoolDayAr, schoolDayEn } from '../day-messages.ts';
import { schoolAr, schoolEn } from '../messages.ts';

const learnerId = '10000000-0000-4000-8000-000000000001';
const learner = { id: learnerId, role: 'student', displayName: 'Current child', classLabels: ['Cedar'] };
const profile = { id: learnerId, displayName: 'Current child', schoolName: 'Current school', enrollments: [], courses: [] };
const schoolContext = { school: { id: 'school', name: 'Current school', countryCode: 'QA', languages: ['en', 'ar'] }, policy: { version: 1, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
const base = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, context: 'current', loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, children: [] as typeof learner[], query: { ...base }, section: 'daily', apiPaths: [] as (string | null)[], pagePaths: [] as (string | null)[], profileLoading: false, profileError: null as LearningApiError | null, previousProfile: false };
Object.assign(globalThis, { React, parentChildPrerequisiteFixture: fixture, parentChildPrerequisiteContext: schoolContext, parentChildPrerequisiteProfile: profile, parentChildPrerequisiteCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.parentChildPrerequisiteFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.parentChildPrerequisiteFixture;f.pagePaths.push(path);return path==="/v1/people?limit=100"?{...f.query,data:f.children}:{...f.query,...{loaded:!!path,loading:false,error:null,moreError:null,nextCursor:null},data:[]}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.parentChildPrerequisiteFixture;return {t:globalThis.parentChildPrerequisiteCommon[f.app.locale]}}export function useApiQuery(path,parse){const f=globalThis.parentChildPrerequisiteFixture;f.apiPaths.push(path);if(!path)return{data:null,loading:false,error:null};if(path==="/v1/school/context")return{data:parse(globalThis.parentChildPrerequisiteContext),loading:false,error:null};const data=parse(globalThis.parentChildPrerequisiteProfile);return{data:f.previousProfile?{...data,scope:"previous child"}:data,loading:f.profileLoading,error:f.profileError}}' };
  // Select only the existing School tab. Preserve the real child context, all read guards and rendered owners.
  if (path.endsWith('/school/components/school-workspace.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8').replace("useState<Tab>(admin ? 'setup' : 'daily')", 'useState<Tab>(globalThis.parentChildPrerequisiteFixture.section)'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code };
  return nextLoad(url, context);
} });
const { LearnerProfile } = await import('../components/learner-profile.tsx');
const { SchoolWorkspace } = await import('../components/school-workspace.tsx');
function reset(locale: 'en' | 'ar') {
  fixture.app = { locale, dictionary: { roles: {} }, membership: { role: 'parent', schoolId: 'school', userId: 'parent', entitlements: ['school.operations'] }, selectedChildId: '', selectChild() {}, status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, commandJournal: new CommandJournal(), formDrafts: new FormDrafts() };
  fixture.children = []; fixture.query = { ...base }; fixture.section = 'daily'; fixture.apiPaths = []; fixture.pagePaths = []; fixture.profileLoading = false; fixture.profileError = null; fixture.previousProfile = false;
}
function render(owner: 'profile' | 'daily' | 'support') {
  fixture.section = owner === 'support' ? 'parentSupport' : 'daily';
  return renderToStaticMarkup(createElement(owner === 'profile' ? LearnerProfile : SchoolWorkspace));
}
function fallback(owner: 'profile' | 'daily' | 'support', locale: 'en' | 'ar') {
  return owner === 'profile' ? (locale === 'ar' ? learnerProfileAr : learnerProfileEn).chooseChild : owner === 'daily' ? (locale === 'ar' ? schoolDayAr : schoolDayEn).chooseChild : (locale === 'ar' ? schoolAr : schoolEn).chooseParentSupportChild;
}
test('Parent confirmed no-child sources show one actionable child state without impossible extra selection cards', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) {
    reset(locale); const html = render(owner);
    assert.equal((html.match(/data-state="empty"/g) ?? []).length, 1);
    assert.match(html, locale === 'ar' ? /لا يتاح طفل ضمن العلاقات الحالية المعتمدة/ : /No child is available through your current approved relationships/);
    assert.ok(!html.includes(fallback(owner, locale)));
    assert.doesNotMatch(html, /<select|school-profile-identity|parent-support-heading|school-day-records/);
    assert.ok(!fixture.apiPaths.some(path => path?.includes('/learners/')));
    assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
    assert.doesNotMatch(html, /data-state="unknown"/);
  }
});
test('Parent loading and unloaded child sources retain one current loading state and no empty or choose fallback', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) for (const query of [{ ...base, loading: true }, { ...base, loaded: false }]) {
    reset(locale); fixture.query = query; const html = render(owner);
    assert.equal((html.match(/data-state="loading"/g) ?? []).length, 1); assert.doesNotMatch(html, /data-state="empty"/); assert.ok(!html.includes(fallback(owner, locale)));
    assert.ok(!fixture.apiPaths.some(path => path?.includes('/learners/'))); assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
  }
});
test('Parent ambiguous and unselected child choices retain their selector without duplicate generic states', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) for (const ambiguous of [true, false]) {
    reset(locale); fixture.children = [learner, { ...learner, id: '10000000-0000-4000-8000-000000000002', displayName: ambiguous ? learner.displayName : 'Other child' }]; const html = render(owner);
    assert.match(html, /<select/); assert.ok(!html.includes(fallback(owner, locale))); assert.doesNotMatch(html, /data-state="empty"/);
    assert.equal((html.match(/data-state="review"/g) ?? []).length, ambiguous ? 1 : 0); assert.ok(!fixture.apiPaths.some(path => path?.includes('/learners/')));
  }
});
test('Parent incomplete zero-child and failed child sources keep their continuation or real error instead of extra guidance', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) for (const error of [null, new LearningApiError('denied'), new LearningApiError('unavailable')]) {
    reset(locale); fixture.query = error ? { ...base, error } : { ...base, nextCursor: 'later' }; const html = render(owner);
    assert.ok(!html.includes(fallback(owner, locale))); assert.doesNotMatch(html, /data-state="empty"/);
    if (error) assert.equal((html.match(/role="alert"/g) ?? []).length, 1); else assert.match(html, /data-page-cursor="later"/);
    assert.ok(!fixture.apiPaths.some(path => path?.includes('/learners/'))); assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
  }
});
test('Parent child continuation errors remain visible when no child can be selected', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) for (const kind of ['denied', 'unavailable'] as const) {
    reset(locale); fixture.query.moreError = new LearningApiError(kind); fixture.query.nextCursor = 'later'; const html = render(owner);
    assert.equal((html.match(/role="alert"/g) ?? []).length, 1); assert.match(html, /data-page-cursor="later"/); assert.ok(!html.includes(fallback(owner, locale))); assert.doesNotMatch(html, /data-state="empty"/);
  }
});
test('Parent current child with incomplete relationship source retains existing fallback and blocks scoped reads', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) {
    reset(locale); fixture.app.selectedChildId = learnerId; fixture.children = [learner]; fixture.query.nextCursor = 'later'; const html = render(owner);
    assert.ok(html.includes(fallback(owner, locale))); assert.match(html, /data-page-cursor="later"/);
    assert.ok(!fixture.apiPaths.some(path => path?.includes('/learners/'))); assert.ok(!fixture.pagePaths.some(path => path?.includes('learnerId=')));
  }
});
test('Parent complete current child retains profile, Daily and approved-support readers with exact original scope', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'daily', 'support'] as const) {
    reset(locale); fixture.children = [learner]; const html = render(owner); assert.ok(!html.includes(fallback(owner, locale)));
    if (owner === 'profile') { assert.match(html, /school-profile-identity/); assert.ok(fixture.apiPaths.includes(`/v1/school/learners/${learnerId}/profile`)); }
    if (owner === 'daily') { assert.ok(fixture.pagePaths.includes(`/v1/school/attendance?limit=100&learnerId=${learnerId}`)); assert.ok(fixture.pagePaths.includes(`/v1/school/timetable?limit=100&learnerId=${learnerId}`)); assert.ok(fixture.pagePaths.includes(`/v1/school/calendar?limit=100&learnerId=${learnerId}`)); }
    if (owner === 'support') { assert.match(html, /parent-support-heading/); assert.ok(html.includes((locale === 'ar' ? schoolAr : schoolEn).noParentSupportCourses)); assert.ok(fixture.apiPaths.includes(`/v1/school/learners/${learnerId}/profile`)); }
  }
});
test('Parent current profile loading, error and old-child refusal remain visible with no identity leakage', () => {
  for (const locale of ['en', 'ar'] as const) for (const owner of ['profile', 'support'] as const) for (const state of ['loading', 'denied', 'previous'] as const) {
    reset(locale); fixture.children = [learner]; fixture.profileLoading = state === 'loading'; fixture.profileError = state === 'denied' ? new LearningApiError('denied') : null; fixture.previousProfile = state === 'previous'; const html = render(owner);
    assert.doesNotMatch(html, /school-profile-identity/); assert.match(html, state === 'loading' || state === 'previous' && owner === 'profile' ? /data-state="loading"/ : /role="alert"/);
    assert.ok(fixture.apiPaths.includes(`/v1/school/learners/${learnerId}/profile`));
  }
});
test('Student own profile and staff empty learner guidance retain their separate existing presentation', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin'] as const) {
    reset(locale); fixture.app.membership = { role, schoolId: 'school', userId: learnerId, entitlements: ['school.operations'] }; const html = render('profile');
    if (role === 'student') { assert.match(html, /school-profile-identity/); assert.ok(fixture.apiPaths.includes(`/v1/school/learners/${learnerId}/profile`)); }
    else { assert.match(html, /school-profile-selector/); assert.ok(html.includes((locale === 'ar' ? learnerProfileAr : learnerProfileEn).noLearners)); assert.match(html, /data-state="empty"/); }
  }
});
