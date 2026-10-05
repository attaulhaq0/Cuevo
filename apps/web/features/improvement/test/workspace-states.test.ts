import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks, createRequire } from 'node:module';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const fixture = { app: {} as Record<string, unknown>, loading: false, error: null as LearningApiError | null, current: null as unknown };
Object.assign(globalThis, { React, improvementStateFixture: fixture });
registerHooks({ load(url, context, nextLoad) {
  const path = url.replaceAll('\\', '/');
  if (path.endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.improvementStateFixture.app}' };
  if (path.endsWith('/shared/hooks/use-paginated-query.ts')) return { format: 'module', shortCircuit: true, source: 'export function usePaginatedLearningQuery(){const f=globalThis.improvementStateFixture;return{data:[],loaded:!f.loading&&!f.error,loading:f.loading,loadingMore:false,error:f.error,moreError:null,nextCursor:null,context:"current",loadMore(){}}}' };
  if (path.endsWith('/shared/hooks/use-api.ts')) return { format: 'module', shortCircuit: true, source: 'export function useApiQuery(){const f=globalThis.improvementStateFixture;return{loading:f.loading,error:f.error,data:f.current}}export function useApi(){return{t:{errorDenied:"Permission denied",errorUnavailable:"School service unavailable",loadMore:"Load more",allLoaded:"All available records loaded."},journal:globalThis.improvementStateFixture.app.commandJournal}}' };
  return nextLoad(url, context);
} });
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): { querySelector(selector: string): { textContent: string } | null; querySelectorAll(selector: string): unknown[]; textContent: string } };
const { WorkspacePageHeading } = await import('@cuevo/ui');
const { InterventionList } = await import('../components/interventions.tsx');
const { ProposalList } = await import('../components/proposals.tsx');
const { OutcomeList } = await import('../components/outcomes.tsx');
const { IntelligenceRunStatusPanel } = await import('../components/run-status.tsx');
const { IntelligenceEvaluationMetrics } = await import('../components/evaluation-metrics.tsx');
const { CoordinatorOutcomeView } = await import('../components/coordinator-outcomes.tsx');
const { InterventionTaskHelp } = await import('../components/task-help.tsx');
const { InterventionTaskChoices } = await import('../components/task-choices.tsx');
const { IntelligenceQualityReview } = await import('../components/quality-review.tsx');
const { InsightContextDisclosure } = await import('../components/insight-context.tsx');
const { ApprovedPracticeOptions } = await import('../components/approved-practice-options.tsx');

function setup(role: 'student' | 'teacher' | 'coordinator', locale: 'en' | 'ar' = 'en') {
  Object.assign(fixture, { loading: false, error: null, current: null });
  fixture.app = { locale, online: true, status: 'ready', apiUrl: '', accessToken: 'synthetic', accessGeneration: 1, membership: { userId: 'current-actor', schoolId: 'current-school', role, entitlements: ['learning', 'assessment', 'curriculum', 'improvement'] }, commandJournal: new CommandJournal(), formDrafts: new FormDrafts(), refreshAccess() {}, reportDiagnostic() {} };
}
function page(title: string, child: React.ReactNode) {
  return parse(renderToStaticMarkup(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title }), child)));
}

test('current empty practice keeps one root heading and one scoped state without awarding or assigning work', () => {
  for (const role of ['student', 'teacher'] as const) for (const locale of ['en', 'ar'] as const) {
    setup(role, locale);
    const view = page('Practice tasks', createElement(InterventionList, { interventions: [], assessments: [], results: [], canManage: role === 'teacher', onChanged() {}, pageHeading: true }));
    assert.equal(view.querySelectorAll('h1').length, 1);
    assert.equal(view.querySelectorAll('h2').length, 0);
    assert.equal(view.querySelectorAll('.cuevo-workspace-state').length, 1);
    assert.match(view.textContent, locale === 'en' ? role === 'student' ? /No approved practice is available yet/ : /No assigned practice tasks are available/ : role === 'student' ? /لا يتاح تدريب معتمد بعد/ : /لا تتاح مهام تدريب مسندة/);
    assert.match(view.textContent, locale === 'en' ? /teacher.*approved|approved.*teacher/i : /المعلّم/);
    assert.equal((fixture.app.commandJournal as CommandJournal).pending().length, 0);
  }
});

test('empty proposals and outcomes use scoped reading states without repeated directory headings', () => {
  setup('teacher');
  const proposals = page('Proposals', createElement(ProposalList, { proposals: [], baselines: [], canDecide: false, onChanged() {}, pageHeading: true }));
  assert.equal(proposals.querySelectorAll('h2').length, 0);
  assert.equal(proposals.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(proposals.textContent, /No proposals are available/);
  assert.match(proposals.textContent, /current.*source|available.*evidence/i);
  const outcomes = page('Measured outcomes', createElement(OutcomeList, { outcomes: [] }));
  assert.equal(outcomes.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(outcomes.textContent, /No measured outcomes are available/);
  assert.match(outcomes.textContent, /follow-up|released result/);
  assert.doesNotMatch(outcomes.textContent, /Improved/);
});

test('baseline loading, failure and incomplete pages never become confirmed empty results', () => {
  setup('teacher');
  const source = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null };
  const render = (baselineSource: typeof source) => page('Proposals', createElement(ProposalList, { proposals: [], baselines: [], baselineSource, canDecide: true, onChanged() {}, pageHeading: true }));
  const empty = render(source);
  assert.match(empty.textContent, /No authorized released baseline results/);
  for (const pending of [{ ...source, loaded: false, loading: true }, { ...source, loadingMore: true }]) {
    const view = render(pending);
    assert.match(view.textContent, /Loading next steps/);
    assert.doesNotMatch(view.textContent, /No authorized released baseline results/);
  }
  for (const failed of [{ ...source, error: new LearningApiError('unavailable') }, { ...source, moreError: new LearningApiError('denied') }]) {
    const view = render(failed);
    assert.match(view.textContent, /School service unavailable|Permission denied/);
    assert.doesNotMatch(view.textContent, /No authorized released baseline results/);
  }
  const partial = render({ ...source, nextCursor: 'current-continuation' });
  assert.match(partial.textContent, /Load the current baseline and assessment pages/);
  assert.doesNotMatch(partial.textContent, /No authorized released baseline results/);
  assert.equal((fixture.app.commandJournal as CommandJournal).pending().length, 0);
});

test('run and evaluation states share anatomy while keeping status checks and unknown denominators truthful', () => {
  setup('teacher');
  const runs = page('Analysis run status', createElement(() => IntelligenceRunStatusPanel({ pageHeading: true })));
  assert.equal(runs.querySelectorAll('h2').length, 0);
  assert.equal(runs.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(runs.textContent, /No runs are available under your current authorized sources/);
  assert.match(runs.textContent, /does not restart an analysis/);
  const absent = page('Evaluation observations', createElement(() => IntelligenceEvaluationMetrics({ pageHeading: true })));
  assert.equal(absent.querySelectorAll('h2').length, 0);
  assert.equal(absent.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(absent.textContent, /not established/);
  fixture.loading = true;
  const loading = page('Analysis run status', createElement(() => IntelligenceRunStatusPanel({ pageHeading: true })));
  assert.equal(loading.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(loading.textContent, /Checking run status/);
  assert.doesNotMatch(loading.textContent, /No runs/);
  fixture.loading = false;
  const unobserved = { numerator: 0, denominator: 0, rate: null };
  fixture.current = { evaluation: { structuralAcceptance: unobserved, usefulness: unobserved, unsupportedClaim: unobserved, privacyIssue: unobserved, invalidTool: unobserved, humanOverride: unobserved, unevaluatedAttempts: 0, legacyUnobservedRuns: 0, humanReviewCount: 0 } };
  const native = page('Evaluation observations', createElement(() => IntelligenceEvaluationMetrics({ pageHeading: true })));
  assert.equal(native.querySelectorAll('tbody tr').length, 6);
  assert.equal(native.querySelectorAll('.cuevo-workspace-state').length, 0);
  assert.match(native.textContent, /Unknown/);
  assert.doesNotMatch(native.textContent, /0%/);
});

test('Coordinator page keeps standalone context without repeating its title and refuses private denied rows', () => {
  setup('coordinator');
  const source = { data: [], loaded: true, loading: false, loadingMore: false, error: null, moreError: null, nextCursor: null, loadMore() {} };
  const props = { source, rows: [], outcome: null, hasSelection: false, locale: 'en' as const, onOpen() {}, onClose() {}, pageHeading: true };
  const empty = page('Measured outcomes', createElement(CoordinatorOutcomeView, props));
  assert.equal(empty.querySelectorAll('h2').length, 0);
  assert.equal(empty.querySelectorAll('.cuevo-workspace-state').length, 1);
  assert.match(empty.textContent, /No measured outcomes/);
  assert.match(empty.textContent, /Observation does not establish cause/);
  const denied = page('Measured outcomes', createElement(CoordinatorOutcomeView, { ...props, source: { ...source, moreError: new LearningApiError('denied') } }));
  assert.match(denied.textContent, /Permission denied/);
  assert.doesNotMatch(denied.textContent, /No measured outcomes/);
  assert.equal(denied.querySelectorAll('.coordinator-outcome-directory').length, 0);
  const standalone = parse(renderToStaticMarkup(createElement(CoordinatorOutcomeView, { ...props, pageHeading: false })));
  assert.equal(standalone.querySelectorAll('h2').length, 1);
});

test('nested current-source loading uses one state and failed reads expose no working form', () => {
  setup('teacher');
  const nested = [
    createElement(InterventionTaskHelp, { interventionId: 'current-practice', canManage: false, canRequest: false }),
    createElement(InterventionTaskChoices, { interventionId: 'current-practice', canChoose: false }),
    createElement(IntelligenceQualityReview, { runId: 'current-analysis' }),
    createElement(InsightContextDisclosure, { runId: 'current-analysis', learnerId: 'current-learner', referenceId: 'current-objective', baselineResultId: 'current-result' }),
    createElement(ApprovedPracticeOptions, { runId: 'current-analysis', learnerId: 'current-learner', referenceId: 'current-objective', baselineResultId: 'current-result', selected: [], onSelected() {}, locked: true }),
  ];
  fixture.loading = true;
  for (const child of nested) {
    const view = page('Current source', child);
    assert.equal(view.querySelectorAll('.cuevo-workspace-state[data-state="loading"]').length, 1);
    assert.equal(view.querySelectorAll('form').length, 0);
  }
  fixture.loading = false;
  fixture.error = new LearningApiError('denied');
  for (const child of nested) {
    const view = page('Current source', child);
    assert.match(view.textContent, /Permission denied/);
    assert.equal(view.querySelectorAll('form').length, 0);
  }
  fixture.error = null;
  fixture.current = { runId: 'current-analysis', context: null };
  const legacy = page('Analysis source', nested[3]);
  assert.equal(legacy.querySelectorAll('.cuevo-workspace-state[data-state="unknown"]').length, 1);
  assert.match(legacy.textContent, /absence is unknown/);
  assert.equal((fixture.app.commandJournal as CommandJournal).pending().length, 0);
});
