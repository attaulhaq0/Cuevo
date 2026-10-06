import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks, createRequire } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';

type Page = { data: Record<string, unknown>[]; loaded: boolean; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null; context: string; loadMore(): void };
const complete: Page = { data: [], loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, context: 'current-source', loadMore() {} };
const native = { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1, normalized: null };
const state = { learnerId: 'learner', status: 'READY', generatedAt: '2026-10-05T00:00:00Z', version: 1, academic: [{ resultId: 'result', referenceId: 'objective', referenceVersion: 'school-1', evidenceId: 'evidence', observedAt: '2026-10-05T00:00:00Z', assessmentTitle: 'Current checking task', referenceTitle: 'Current objective', nativeResult: native }], development: { practice: { count: 0, observationIds: [] }, revision: { count: 0, observationIds: [] }, reflection: { count: 0, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: 0, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [] };
const observation = { id: 'observation', learnerId: 'learner', kind: 'practice', sourceType: 'ACTIVITY_COMPLETION', sourceObjectId: 'completion', sourceEventId: 'event', occurredAt: '2026-10-05T00:00:00Z' };
const signal = { id: 'signal', learnerId: 'learner', type: 'practice_observed', count: 0, ruleVersion: 1, createdAt: '2026-10-05T00:00:00Z', windowStart: '2026-10-01T00:00:00Z', windowEnd: '2026-10-05T00:00:00Z', sourceEventIds: [], observationIds: [], status: 'ACTIVE', uncertainty: 'OBSERVATION_ONLY' };
const fixture = { app: {} as Record<string, unknown>, people: complete, observations: complete, signals: complete };
Object.assign(globalThis, { React, progressRecordPageFixture: fixture, progressRecordPageCommon: { en: commonEn, ar: commonAr }, progressRecordPageState: state });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.progressRecordPageFixture.app}' };
  if (path.endsWith('/shared/hooks/use-child-context.ts')) return { format: 'module', shortCircuit: true, source: 'export function useChildContext(){return{parent:false,children:[],child:null,query:{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}},selectChild(){}}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.progressRecordPageFixture;return{t:globalThis.progressRecordPageCommon[f.app.locale],journal:f.app.commandJournal}}export function useApiQuery(path,parse){return path?.endsWith("/state")?{data:parse(globalThis.progressRecordPageState),loading:false,error:null}:{data:null,loading:true,error:null}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(path,parse){const f=globalThis.progressRecordPageFixture;const page=path?.startsWith("/v1/people?")?f.people:path?.startsWith("/v1/observations?")?f.observations:path?.startsWith("/v1/signals?")?f.signals:{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,context:"other-current-source",loadMore(){}};return{...page,data:page.data.map(parse)}}' };
  return next(url, context);
} });
type Element = { textContent: string; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Element[]; hasAttribute(name: string): boolean };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
const { ProgressWorkspace } = await import('../components/progress-workspace.tsx');
function setup(locale: 'en' | 'ar', role: 'student' | 'teacher' | 'coordinator' | 'admin') {
  fixture.app = { locale, dictionary: getDictionary(locale), status: 'ready', online: true, apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, membership: { userId: role === 'student' ? 'learner' : 'staff', schoolId: 'school', role, displayName: 'Current learner', entitlements: ['learning', 'assessment', 'curriculum', 'learner.state'] }, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), reportDiagnostic() {} };
  fixture.people = { ...complete }; fixture.observations = { ...complete }; fixture.signals = { ...complete };
}
function render() { return parse(renderToStaticMarkup(createElement(ProgressWorkspace))); }
function history(view: Element, kind: 'observations' | 'signals') {
  const sections = view.querySelector('.progress-record-history')!.querySelectorAll('section.progress-section');
  return kind === 'observations' ? sections[0] : sections[sections.length - 1];
}

test('staff learner zero choices cannot declare no learners while their current directory is incomplete', () => {
  for (const locale of ['en', 'ar'] as const) for (const role of ['teacher', 'coordinator', 'admin'] as const) {
    setup(locale, role);
    for (const page of [{ ...complete, nextCursor: 'later' }, { ...complete, data: [{ id: 'staff', userId: 'staff', displayName: 'Current staff', role: 'teacher', classLabels: [] }], nextCursor: 'later' }, { ...complete, loaded: false }, { ...complete, loadingMore: true }]) {
      fixture.people = page; const view = render(), reading = view.querySelector('.progress-review-reading')!;
      assert.equal(reading.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(reading.querySelectorAll('[data-state="unknown"],[data-state="review"]').length, 1);
      assert.equal(view.querySelector('#learner-selection')!.hasAttribute('disabled'), true);
    }
    fixture.people = { ...complete }; assert.equal(render().querySelector('.progress-review-reading')!.querySelectorAll('[data-state="empty"]').length, 1);
  }
});

test('omitted history page fields and initial failures never establish a terminal empty record source', () => {
  for (const locale of ['en', 'ar'] as const) for (const kind of ['observations', 'signals'] as const) {
    setup(locale, 'student');
    for (const field of ['loaded', 'loading', 'loadingMore', 'error', 'moreError', 'nextCursor'] as const) {
      const page: Record<string, unknown> = { ...complete }; delete page[field]; fixture[kind] = page as Page;
      assert.equal(history(render(), kind).querySelectorAll('[data-state="empty"]').length, 0);
    }
    fixture[kind] = { ...complete, error: new LearningApiError('unavailable') }; const failed = history(render(), kind);
    assert.equal(failed.querySelectorAll('[role="alert"]').length, 1); assert.equal(failed.querySelectorAll('[data-state="empty"]').length, 0);
  }
});

test('observation and signal history require complete current pages before zero rows mean empty', () => {
  for (const locale of ['en', 'ar'] as const) for (const kind of ['observations', 'signals'] as const) {
    setup(locale, 'student');
    for (const page of [{ ...complete, nextCursor: 'later' }, { ...complete, loaded: false }, { ...complete, loadingMore: true }, { ...complete, nextCursor: 'later', moreError: new LearningApiError('unavailable') }]) {
      fixture[kind] = page; const section = history(render(), kind);
      assert.equal(section.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(section.querySelectorAll('[data-state="unknown"],[data-state="review"]').length, 1);
      if (page.nextCursor) assert.equal(section.querySelectorAll('[data-page-cursor="later"]').length, 1);
    }
    fixture[kind] = { ...complete }; assert.equal(history(render(), kind).querySelectorAll('[data-state="empty"]').length, 1);
    fixture[kind] = { ...complete, loading: true }; const loading = history(render(), kind); assert.equal(loading.querySelectorAll('[data-state="loading"]').length, 1); assert.equal(loading.querySelectorAll('[data-state="empty"]').length, 0);
  }
});

test('history continuation refusal withholds private records while a temporary outage retains native zero and retry', () => {
  for (const locale of ['en', 'ar'] as const) for (const kind of ['observations', 'signals'] as const) {
    setup(locale, 'student'); const row = kind === 'observations' ? observation : signal;
    fixture[kind] = { ...complete, data: [row], nextCursor: 'later', moreError: new LearningApiError('unavailable') };
    let view = render(), section = history(view, kind);
    assert.equal(section.querySelectorAll(kind === 'observations' ? '.observation-row' : '.academic-row').length, 1);
    assert.equal(section.querySelectorAll('[role="alert"]').length, 1); assert.equal(section.querySelectorAll('[data-page-cursor="later"]').length, 1);
    assert.equal(view.querySelectorAll('[data-result-id="result"] strong').some(element => element.textContent === new Intl.NumberFormat(locale).format(0)), true);
    for (const failure of ['denied', 'unauthorized', 'invalid'] as const) {
      fixture[kind] = { ...complete, data: [row], nextCursor: 'later', moreError: new LearningApiError(failure) };
      view = render(); section = history(view, kind);
      assert.equal(section.querySelectorAll(kind === 'observations' ? '.observation-row' : '.academic-row').length, 0);
      assert.equal(section.querySelectorAll('[role="alert"]').length, 1); assert.equal(section.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(section.querySelectorAll('[data-page-cursor]').length, 0);
    }
    assert.equal((fixture.app.commandJournal as CommandJournal).pending().length, 0);
  }
});
