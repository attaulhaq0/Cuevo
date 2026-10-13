import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

const cursor = '00000000-0000-4000-8000-000000000003';
const programmePath = '/v1/curriculum/programmes?limit=25';
const base = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null, loadMore() {} };
const fixture = { app: {} as Record<string, unknown>, programme: { ...base }, paths: [] as (string | null)[] };
Object.assign(globalThis, { React, coordinatorRecoveryFixture: fixture, coordinatorRecoveryCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.coordinatorRecoveryFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.coordinatorRecoveryFixture;return{t:globalThis.coordinatorRecoveryCommon[f.app.locale]}}export function useApiQuery(){return{data:null,loading:false,error:null}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path){const f=globalThis.coordinatorRecoveryFixture;f.paths.push(path);return{data:[],loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){},...(path==="/v1/curriculum/programmes?limit=25"?f.programme:{})}}' };
  return nextLoad(url, context);
} });
const { CoordinatorTrailHomeConnected } = await import('../components/coordinator-trail-home-connected.tsx');
function render(locale: 'en' | 'ar', programme: typeof base) {
  fixture.app = { locale, membership: { role: 'coordinator', schoolId: 'school', userId: 'actor', entitlements: ['curriculum', 'school.operations'], school: { name: 'Current school' } }, status: 'ready', online: true, apiUrl: 'https://fixture.invalid', accessToken: 'fixture', accessGeneration: 1, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), reportDiagnostic() {}, refreshAccess() {} };
  fixture.programme = programme; fixture.paths = [];
  return renderToStaticMarkup(createElement(CoordinatorTrailHomeConnected, { onNavigate() {} }));
}
for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: current programme loading has one source recovery while course choice remains unavailable`, () => {
    const html = render(locale, { ...base, loading: true });
    const message = locale === 'ar' ? 'جارٍ التحقق من المصدر الحالي…' : 'Checking current source…';
    assert.equal(html.split(message).length - 1, 1);
    assert.match(html, /id="coordinator-home-course" disabled=""/);
    assert.equal(fixture.paths.filter(path => path === programmePath).length, 1);
  });
  test(`${locale}: current programme error appears once with its retry and no programme facts`, () => {
    const html = render(locale, { ...base, error: new LearningApiError('denied') });
    const message = (locale === 'ar' ? commonAr : commonEn).errorDenied;
    assert.equal(html.split(message).length - 1, 1);
    const panel = html.slice(html.indexOf('class="coordinator-trail__programmes"'));
    assert.match(panel, /role="alert"/);
    assert.match(panel, locale === 'ar' ? /تحديث سجلات المراجعة الحالية/ : /Refresh current review records/);
    assert.match(html, /id="coordinator-home-course" disabled=""/);
  });
  test(`${locale}: current programme continuation has one cursor control and preserves incomplete choices`, () => {
    const html = render(locale, { ...base, nextCursor: cursor });
    assert.equal((html.match(new RegExp(`data-page-cursor="${cursor}"`, 'g')) ?? []).length, 1);
    assert.match(html, /id="coordinator-home-course" disabled=""/);
    assert.match(html, locale === 'ar' ? /حمّل خيارات المقرر والبرنامج والفترة كاملة/ : /Load all current course, programme and period choices/);
    assert.equal(fixture.paths.filter(path => path === programmePath).length, 1);
  });
  test(`${locale}: a complete current empty programme source does not add fake source recovery or evidence totals`, () => {
    const html = render(locale, { ...base });
    assert.doesNotMatch(html, /data-page-cursor|role="alert"|0 gaps|100%/);
    assert.match(html, /id="coordinator-home-course"/);
    assert.equal(fixture.paths.filter(path => path === programmePath).length, 1);
  });
}
