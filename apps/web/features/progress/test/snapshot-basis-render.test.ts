import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { parseLearnerState } from '../model.ts';
import { progressAr, progressEn } from '../messages.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const emptyCount = { totalCount: 0, returnedCount: 0, truncated: false };
const unknown = parseLearnerState({ learnerId: 'learner', status: 'UNKNOWN', generatedAt: null, version: null, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [], projection: { scope: 'CURRENT_AUTHORIZED_SOURCES', academic: { ...emptyCount, nextCursor: null }, support: emptyCount, outcomes: emptyCount, observations: { practice: { ...emptyCount, totalCount: null }, revision: { ...emptyCount, totalCount: null }, reflection: { ...emptyCount, totalCount: null } }, sourceEvents: emptyCount } });
const fixture = { app: {} as Record<string, unknown>, state: unknown, error: null as unknown };
Object.assign(globalThis, { React, progressBasisFixture: fixture, progressBasisCommon: { ar: commonAr, en: commonEn } });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.progressBasisFixture.app}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){return {t:globalThis.progressBasisCommon[globalThis.progressBasisFixture.app.locale],request(){throw Error("No request in a render test")}}} export function useApiQuery(path,parse){const f=globalThis.progressBasisFixture;if(!path?.endsWith("/state"))return {data:null,loading:true,error:null};return {data:f.error?null:parse(f.state),loading:false,error:f.error}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){return {data:[],loading:false,loaded:true,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-child-context.ts')) return { format: 'module', shortCircuit: true, source: 'export function useChildContext(){const parent=globalThis.progressBasisFixture.app.membership.role==="parent";return {parent,children:[],child:parent?{id:"learner",displayName:"Alex Hassan"}:null,query:{data:[],loading:false,error:null,nextCursor:null},selectChild(){}}}' };
  return nextLoad(url, context);
} });
const { ProgressWorkspace } = await import('../components/progress-workspace.tsx');
function render(locale: 'en' | 'ar', role: 'student' | 'parent') {
  fixture.app = { locale, status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, membership: { userId: role === 'student' ? 'learner' : 'parent', schoolId: 'school', role, displayName: 'Alex Hassan', school: { name: 'School' }, entitlements: ['learning', 'assessment', 'curriculum', 'learner.state'] }, reportDiagnostic() {} };
  return renderToStaticMarkup(createElement(ProgressWorkspace));
}

test('Student zero snapshot counts explain their basis and lead to current released result pages without guessing a pending count', () => {
  for (const locale of ['en', 'ar'] as const) {
    fixture.error = null; fixture.state = unknown;
    const html = render(locale, 'student');
    assert.match(html, locale === 'en' ? /records included in this snapshot/ : /سجلات مضمنة في هذا الملخص/);
    assert.match(html, /href="#progress-reports"/);
    assert.match(html, locale === 'en' ? /Released results remain available in Result pages/ : /تبقى النتائج الصادرة متاحة في صفحات النتائج/);
    const t = locale === 'ar' ? progressAr : progressEn;
    const zero = new Intl.NumberFormat(locale).format(0);
    assert.ok(html.includes(`${t.academic}: ${zero} / ${zero}`));
    assert.doesNotMatch(html, /7 pending|7 released|0%|zero grade|COMPLETION|internal\.processed_events/);
  }
});

test('ready and truncated progress counts preserve native zero and report only the snapshot source denominator', () => {
  fixture.error = null;
  fixture.state = parseLearnerState({ ...unknown, status: 'READY', freshness: 'CURRENT', generatedAt: '2026-10-05T00:00:00Z', version: 1,
    academic: [{ resultId: 'result', referenceId: 'reference', referenceVersion: 'School v1', evidenceId: 'evidence', observedAt: '2026-10-05T00:00:00Z', assessmentTitle: 'Explain a method', referenceTitle: 'School objective', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1, normalized: null } }],
    projection: { ...unknown.projection!, academic: { returnedCount: 1, totalCount: 101, truncated: true, nextCursor: '10000000-0000-4000-8000-000000000001' } } });
  for (const locale of ['en', 'ar'] as const) {
    const html = render(locale, 'student'), t = locale === 'ar' ? progressAr : progressEn;
    assert.ok(html.includes(`${t.academic}: ${new Intl.NumberFormat(locale).format(1)} / ${new Intl.NumberFormat(locale).format(101)}`));
    assert.match(html, /Explain a method/);
    assert.ok(html.includes(`<strong>${new Intl.NumberFormat(locale).format(0)}</strong><span> / ${new Intl.NumberFormat(locale).format(10)}</span>`));
    assert.ok(html.includes(t.moreClassSources));
  }
});

test('a denied current state withholds snapshot counts and its source explanation', () => {
  fixture.state = unknown; fixture.error = new LearningApiError('denied');
  for (const locale of ['en', 'ar'] as const) {
    const html = render(locale, 'student');
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /records included in this snapshot|سجلات مضمنة في هذا الملخص|progress-follow-up-grid|data-result-id/);
  }
  fixture.error = null;
});

test('Parent projection retains its approved-source count label and omits the staff processing explanation', () => {
  for (const locale of ['en', 'ar'] as const) {
    fixture.error = null; fixture.state = { ...unknown, freshness: 'APPROVED_PROJECTION' };
    const html = render(locale, 'parent');
    const t = locale === 'ar' ? progressAr : progressEn;
    assert.ok(html.includes(t.recordsShown));
    assert.doesNotMatch(html, /records included in this snapshot|سجلات مضمنة في هذا الملخص|Released results remain available in Result pages|تبقى النتائج الصادرة متاحة في صفحات النتائج/);
    assert.doesNotMatch(html, /id="progress-support"|progress-follow-up-grid/);
  }
});
