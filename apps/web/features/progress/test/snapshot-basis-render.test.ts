import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks, createRequire } from 'node:module';
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
  if (path.endsWith('/features/progress/components/progress-workspace.tsx')) {
    const loaded = nextLoad(url, context);
    return { ...loaded, source: `${loaded.source?.toString()}\nexport { LearnerDetail as ProgressSnapshotTestReader };` };
  }
  return nextLoad(url, context);
} });
type Element = { textContent: string; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Element[] };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
const source = await import('../components/progress-workspace.tsx');
const { ProgressWorkspace } = source;
// Expose the existing private selected reader only in this test loader. Staff
// source selection and its real request guards remain tested by their owners.
const SnapshotReader = (source as typeof source & { ProgressSnapshotTestReader: React.ComponentType<{ learnerId: string; learnerLabel: string; focusRequest: number; refresh: number; parent: boolean; utilities: React.ReactNode }> }).ProgressSnapshotTestReader;
function render(locale: 'en' | 'ar', role: 'student' | 'parent') {
  fixture.app = { locale, status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, membership: { userId: role === 'student' ? 'learner' : 'parent', schoolId: 'school', role, displayName: 'Alex Hassan', school: { name: 'School' }, entitlements: ['learning', 'assessment', 'curriculum', 'learner.state'] }, reportDiagnostic() {} };
  return renderToStaticMarkup(createElement(ProgressWorkspace));
}
function renderSelected(locale: 'en' | 'ar', role: 'student' | 'teacher' | 'coordinator' | 'admin' | 'parent') {
  fixture.app = { locale, status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, membership: { userId: role === 'student' ? 'learner' : role, schoolId: 'school', role, displayName: 'Alex Hassan', school: { name: 'School' }, entitlements: ['learning', 'assessment', 'curriculum', 'learner.state'] }, reportDiagnostic() {} };
  return parse(renderToStaticMarkup(createElement(SnapshotReader, { learnerId: 'learner', learnerLabel: 'Alex Hassan', focusRequest: 0, refresh: 0, parent: role === 'parent', utilities: null })));
}
function readyEmpty() {
  return parseLearnerState({ ...unknown, status: 'READY', freshness: 'CURRENT', generatedAt: '2026-10-05T00:00:00Z', version: 1 });
}

test('unknown selected snapshots explain unavailable academic and permitted support chapters rather than declaring them empty', () => {
  fixture.error = null;
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin', 'parent'] as const) {
    fixture.state = role === 'parent' ? { ...unknown, freshness: 'APPROVED_PROJECTION' } : unknown;
    const view = renderSelected(locale, role), academic = view.querySelector('#progress-academic')!;
    assert.equal(academic.querySelectorAll('[data-state="empty"]').length, 0, `${role}/${locale} unknown academic is not empty`);
    assert.equal(academic.querySelectorAll('[data-state="unknown"]').length, 1);
    assert.match(academic.textContent, locale === 'en' ? /Result pages/ : /صفحات النتائج/);
    const support = view.querySelector('#progress-support');
    if (role === 'parent') assert.equal(support, null);
    else {
      assert.equal(support!.querySelectorAll('[data-state="empty"]').length, 0, `${role}/${locale} unknown support is not empty`);
      assert.equal(support!.querySelectorAll('[data-state="unknown"]').length, 1);
      assert.match(support!.textContent, locale === 'en' ? /Refresh/ : /حدّث/);
    }
    assert.ok(view.querySelector('#progress-reports'), 'Independent result pages remain mounted');
  }
});

test('READY complete zero chapters retain true empty while stale or incomplete returned projections do not', () => {
  fixture.error = null;
  const ready = readyEmpty(), cursor = '10000000-0000-4000-8000-000000000001';
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin', 'parent'] as const) {
    fixture.state = role === 'parent' ? { ...ready, freshness: 'APPROVED_PROJECTION' } : ready;
    let view = renderSelected(locale, role);
    assert.equal(view.querySelector('#progress-academic')!.querySelectorAll('[data-state="empty"]').length, 1);
    if (role !== 'parent') assert.equal(view.querySelector('#progress-support')!.querySelectorAll('[data-state="empty"]').length, 1);
    for (const state of [
      { ...ready, freshness: 'STALE' },
      { ...ready, projection: { ...ready.projection!, academic: { returnedCount: 0, totalCount: 1, truncated: true, nextCursor: cursor }, support: { returnedCount: 0, totalCount: 1, truncated: true } } },
      { ...ready, projection: { ...ready.projection!, academic: { ...emptyCount, totalCount: null, nextCursor: null }, support: { ...emptyCount, totalCount: null } } },
      { ...ready, projection: { ...ready.projection!, academic: { ...emptyCount, nextCursor: cursor } } },
    ]) {
      fixture.state = parseLearnerState(state); view = renderSelected(locale, role);
      assert.equal(view.querySelector('#progress-academic')!.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(view.querySelector('#progress-academic')!.querySelectorAll('[data-state="unknown"]').length, 1);
      if (role !== 'parent' && (state.projection?.support?.totalCount !== 0 || state.freshness === 'STALE')) {
        assert.equal(view.querySelector('#progress-support')!.querySelectorAll('[data-state="empty"]').length, 0);
      }
      if (role === 'parent') assert.equal(view.querySelector('#progress-support'), null);
    }
  }
});

test('legacy READY empty stays snapshot-qualified while missing declared support coverage remains unconfirmed', () => {
  fixture.error = null;
  const ready = readyEmpty();
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin'] as const) {
    const t = locale === 'ar' ? progressAr : progressEn;
    const legacy = { ...ready }; delete legacy.projection; fixture.state = parseLearnerState(legacy);
    let view = renderSelected(locale, role);
    assert.equal(view.querySelector('#progress-academic')!.querySelectorAll('[data-state="empty"]').length, 1);
    assert.ok(view.querySelector('#progress-academic')!.textContent.includes(t.noAcademic));
    assert.ok(view.querySelector('#progress-support')!.textContent.includes(t.noSupport));
    const incomplete = { ...ready.projection! }; delete incomplete.support;
    fixture.state = parseLearnerState({ ...ready, projection: incomplete }); view = renderSelected(locale, role);
    assert.equal(view.querySelector('#progress-support')!.querySelectorAll('[data-state="empty"]').length, 0);
    assert.equal(view.querySelector('#progress-support')!.querySelectorAll('[data-state="unknown"]').length, 1);
  }
});

test('native zero and an existing record with unavailable human context remain visible in a stale partial snapshot', () => {
  fixture.error = null;
  const ready = readyEmpty();
  fixture.state = parseLearnerState({ ...ready, freshness: 'STALE',
    academic: [{ resultId: 'result', referenceId: 'reference', referenceVersion: 'School v1', evidenceId: 'evidence', observedAt: '2026-10-05T00:00:00Z', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1, normalized: null } }],
    projection: { ...ready.projection!, academic: { returnedCount: 1, totalCount: 101, truncated: true, nextCursor: '10000000-0000-4000-8000-000000000001' } } });
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin', 'parent'] as const) {
    const t = locale === 'ar' ? progressAr : progressEn, view = renderSelected(locale, role), academic = view.querySelector('#progress-academic')!;
    assert.equal(academic.querySelectorAll('[data-result-id="result"]').length, 1);
    assert.equal(academic.querySelectorAll('[data-state="empty"]').length, 0);
    assert.ok(academic.textContent.includes(t.assessmentNameUnavailable));
    assert.ok(academic.textContent.includes(t.objectiveUnavailable));
    assert.ok(academic.querySelectorAll('strong').some(element => element.textContent === new Intl.NumberFormat(locale).format(0)));
    assert.ok(view.querySelector('#progress-reports'));
  }
});

test('a denied selected snapshot withholds its chapters for every role without affecting the known source value', () => {
  fixture.state = readyEmpty(); fixture.error = new LearningApiError('denied');
  for (const locale of ['en', 'ar'] as const) for (const role of ['student', 'teacher', 'coordinator', 'admin', 'parent'] as const) {
    const view = renderSelected(locale, role);
    assert.equal(view.querySelectorAll('[role="alert"]').length, 1);
    assert.equal(view.querySelector('#progress-academic'), null);
    assert.equal(view.querySelector('#progress-support'), null);
  }
  fixture.error = null;
});

test('Student zero snapshot counts explain their basis and lead to current released result pages without guessing a pending count', () => {
  for (const locale of ['en', 'ar'] as const) {
    fixture.error = null; fixture.state = unknown;
    const html = render(locale, 'student');
    assert.match(html, locale === 'en' ? /records included in this snapshot/ : /سجلات مضمنة في هذا الملخص/);
    assert.match(html, /href="#progress-reports"/);
    assert.match(html, /class="progress-source-context"/);
    assert.match(html, /data-state="unknown"/);
    assert.equal((html.match(/class="cuevo-workspace-links"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /class="progress-chapters"|progress-intro__actions/);
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
    assert.doesNotMatch(html, /class="cuevo-workspace-links"/);
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
