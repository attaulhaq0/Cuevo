import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks, createRequire } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { commonAr, commonEn } from '../../../shared/i18n/common.ts';

type Page = { data: Record<string, unknown>[]; loaded: boolean; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null; context: string; loadMore(): void };
const complete: Page = { data: [], loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, context: 'current-runs', loadMore() {} };
const run = { id: '10000000-0000-4000-8000-000000000001', baselineResultId: '10000000-0000-4000-8000-000000000002', learnerId: '10000000-0000-4000-8000-000000000003', state: 'FAILED', assessmentTitle: 'Current checking task', learnerName: 'Current learner', provider: 'DETERMINISTIC_FIXTURE', model: 'fixture', generationMode: 'FIXTURE', failureCode: 'INTELLIGENCE_TIMEOUT', reservedBudget: 0, createdAt: '2026-10-05T00:00:00Z', completedAt: '2026-10-05T00:00:01Z', outputTokens: null, inputTokens: null, latencyMs: 1000, cost: null, costBasis: 'DETERMINISTIC_FIXTURE' };
const fixture = { locale: 'en', page: complete, journal: new CommandJournal() };
Object.assign(globalThis, { React, runPageStateFixture: fixture, runPageStateCommon: { en: commonEn, ar: commonAr } });
registerHooks({ load(url, context, next) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){const f=globalThis.runPageStateFixture;return{locale:f.locale,commandJournal:f.journal}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApi(){const f=globalThis.runPageStateFixture;return{t:globalThis.runPageStateCommon[f.locale],journal:f.journal}}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){return globalThis.runPageStateFixture.page}' };
  return next(url, context);
} });
type Element = { textContent: string; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Element[] };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
const { IntelligenceRunStatusPanel } = await import('../components/run-status.tsx');
function render() { return parse(renderToStaticMarkup(createElement(() => IntelligenceRunStatusPanel({ pageHeading: true })))); }

test('analysis runs are empty only after their current source is loaded settled successful and terminal', () => {
  for (const locale of ['en', 'ar']) {
    fixture.locale = locale;
    for (const page of [{ ...complete, loaded: false }, { ...complete, nextCursor: 'later' }, { ...complete, loadingMore: true }, { ...complete, nextCursor: 'later', moreError: new LearningApiError('unavailable') }]) {
      fixture.page = page; const view = render(); assert.equal(view.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(view.querySelectorAll('[data-state="unknown"],[data-state="review"]').length, 1);
      if (page.nextCursor) assert.equal(view.querySelectorAll('[data-page-cursor="later"]').length, 1);
    }
    fixture.page = { ...complete }; assert.equal(render().querySelectorAll('[data-state="empty"]').length, 1);
    fixture.page = { ...complete, loading: true }; const loading = render(); assert.equal(loading.querySelectorAll('[data-state="loading"]').length, 1); assert.equal(loading.querySelectorAll('[data-state="empty"]').length, 0);
  }
});

test('missing run-page readiness and initial unavailable source never acquire empty meaning', () => {
  for (const locale of ['en', 'ar']) {
    fixture.locale = locale;
    for (const field of ['loaded', 'loading', 'loadingMore', 'error', 'moreError', 'nextCursor'] as const) {
      const page: Record<string, unknown> = { ...complete }; delete page[field]; fixture.page = page as Page;
      assert.equal(render().querySelectorAll('[data-state="empty"]').length, 0);
    }
    fixture.page = { ...complete, error: new LearningApiError('unavailable') }; const view = render(); assert.equal(view.querySelectorAll('[role="alert"]').length, 1); assert.equal(view.querySelectorAll('[data-state="empty"]').length, 0);
  }
});

test('run status retains an admitted record on a temporary outage and withholds it on current source refusal', () => {
  for (const locale of ['en', 'ar']) {
    fixture.locale = locale;
    fixture.page = { ...complete, data: [run], nextCursor: 'later', moreError: new LearningApiError('unavailable') };
    let view = render(); assert.equal(view.querySelectorAll('[data-intelligence-run-id]').length, 1); assert.equal(view.querySelectorAll('[role="alert"]').length, 1); assert.equal(view.querySelectorAll('[data-page-cursor="later"]').length, 1);
    assert.match(view.textContent, /Current checking task/); assert.match(view.textContent, /0/);
    for (const kind of ['denied', 'unauthorized', 'invalid'] as const) {
      fixture.page = { ...complete, data: [run], nextCursor: 'later', moreError: new LearningApiError(kind) };
      view = render(); assert.equal(view.querySelectorAll('[data-intelligence-run-id]').length, 0); assert.equal(view.querySelectorAll('[role="alert"]').length, 1); assert.equal(view.querySelectorAll('[data-state="empty"]').length, 0);
      assert.equal(view.querySelectorAll('[data-page-cursor]').length, 0);
    }
    assert.equal(fixture.journal.pending().length, 0); assert.equal(view.querySelectorAll('form').length, 0);
  }
});
