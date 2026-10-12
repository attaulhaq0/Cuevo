import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { adminHomeAr, adminHomeEn } from '../admin-home-binding-messages.ts';
import { teacherHomeAr, teacherHomeEn } from '../teacher-home-binding-messages.ts';

const cursor = '00000000-0000-4000-8000-000000000003';
const context = { school: { id: 'school', name: 'Current school', countryCode: 'QA', languages: ['en', 'ar'] }, policy: { version: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
const base = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, source: { ...base }, contextLoading: false, paths: [] as (string | null)[] };
Object.assign(globalThis, { React, staffHomeRecoveryFixture: fixture, staffHomeRecoveryContext: context, staffHomeRecoveryCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, loadContext, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.staffHomeRecoveryFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.staffHomeRecoveryFixture;return{t:globalThis.staffHomeRecoveryCommon[f.app.locale]}}export function useApiQuery(path,parse){const f=globalThis.staffHomeRecoveryFixture;return{data:path==="/v1/school/context"&&!f.contextLoading?parse(globalThis.staffHomeRecoveryContext):null,loading:path==="/v1/school/context"&&f.contextLoading,error:null}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.staffHomeRecoveryFixture;f.paths.push(path);const chosen=f.app.membership.role==="teacher"?"/v1/marking?limit=25":"/v1/school/people?limit=25";return{data:[],loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){},...(path===chosen?f.source:{})}}' };
  return nextLoad(url, loadContext);
} });
const { AdminTrailHome } = await import('../components/admin-trail-home-connected.tsx');
const { TeacherTrailHome } = await import('../components/teacher-trail-home-connected.tsx');
function render(role: 'teacher' | 'admin', locale: 'en' | 'ar', mode: 'ready' | 'loading' | 'error' | 'partial' | 'offline') {
  fixture.app = { locale, membership: { role, schoolId: 'school', userId: 'actor', entitlements: ['learning', 'assessment', 'curriculum', 'school.operations', 'improvement', 'portfolio'], school: { name: 'Current school' } }, status: 'ready', online: mode !== 'offline', apiUrl: 'https://fixture.invalid', accessToken: 'fixture', accessGeneration: 1, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), reportDiagnostic() {}, refreshAccess() {} };
  fixture.source = { ...base, loading: role === 'teacher' && mode === 'loading', error: mode === 'error' ? new LearningApiError('denied') : null, nextCursor: mode === 'partial' ? cursor : null };
  fixture.contextLoading = role === 'admin' && mode === 'loading'; fixture.paths = [];
  return renderToStaticMarkup(createElement(role === 'teacher' ? TeacherTrailHome : AdminTrailHome, { onNavigate() {} }));
}
for (const role of ['teacher', 'admin'] as const) for (const locale of ['en', 'ar'] as const) {
  test(`${role}/${locale}: one current refresh remains during ready, loading, error, partial and offline recovery`, () => {
    const label = role === 'teacher' ? (locale === 'ar' ? teacherHomeAr : teacherHomeEn).reload : (locale === 'ar' ? adminHomeAr : adminHomeEn).refresh;
    for (const mode of ['ready', 'loading', 'error', 'partial', 'offline'] as const) {
      const html = render(role, locale, mode);
      const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
      assert.equal(buttons.filter(button => button.includes(label)).length, 1, `${mode} has one refresh button`);
      if (mode === 'partial') assert.match(html, new RegExp(`data-page-cursor="${cursor}"`));
      if (mode === 'error') assert.match(html, /role="alert"/);
      if (mode === 'offline') assert.doesNotMatch(html, /Current school|Private|private/);
    }
  });
}
