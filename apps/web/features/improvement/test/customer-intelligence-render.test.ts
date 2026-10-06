import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { ProposalList } from '../components/proposals.tsx';
import { AnalysisExplanation } from '../components/analysis-explanation.tsx';
import { IntelligenceRunStatusPanel } from '../components/run-status.tsx';
import { IntelligenceEvaluationMetrics } from '../components/evaluation-metrics.tsx';
import { parseRecommendation } from '../model.ts';
import { WorkspacePageHeading } from '@cuevo/ui';

const id = (value: number) => `23000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const proposal = { id: id(1), learnerId: id(2), referenceId: id(3), baselineResultId: id(4), origin: 'AI_GENERATED', generationMode: 'FIXTURE', intelligenceRunId: id(5), observation: 'The school recorded one assessment result.', evidenceIds: [id(6)], interpretation: 'Review the next learning step.', recommendation: 'Try a checking step', rationale: 'Based on reviewed work.', uncertainty: 'One assessment does not explain a cause.', activityTitle: 'Check a step', instructions: 'Explain the step to your teacher.', status: 'AWAITING_HUMAN', createdAt: '2026-10-03T10:00:00Z' };
const analysis = { basis: 'SINGLE_RESULT' as const, resultIds: [id(4)], observationIds: [], priorInterventionIds: [], interpretation: 'TEACHER_REVIEW_RECORDED_EVIDENCE' as const, uncertainty: 'EVIDENCE_NOT_CAUSAL' as const };

function render(element: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try { return renderToStaticMarkup(createElement(Providers, { initialLocale: locale, config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: element })); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'React', descriptor); else Reflect.deleteProperty(globalThis, 'React'); }
}

test('demonstration proposal directory retains mode and human approval while exact source detail waits for selection', () => {
  const value = parseRecommendation(proposal);
  const html = render(createElement(ProposalList, { proposals: [value], baselines: [], canDecide: false, onChanged: () => {} }));
  assert.match(html, /Demonstration analysis/);
  assert.match(html, /Awaiting human decision/);
  const primary = html.replace(/<details>[\s\S]*?<\/details>/g, '');
  assert.doesNotMatch(primary, /fixture|source run|local analysis/i);
  assert.ok(!primary.includes(value.intelligenceRunId!));
  assert.ok(!html.includes(value.intelligenceRunId!));
  assert.doesNotMatch(html, /proposal-facts|proposal-selected/);
  assert.equal(value.generationMode, 'FIXTURE');
});

test('content-first proposal and run pages omit duplicate titles but keep source and approval limits', () => {
  const html = render(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Proposals' }), createElement(ProposalList, { proposals: [parseRecommendation(proposal)], baselines: [], canDecide: false, onChanged() {}, pageHeading: true })));
  assert.equal((html.match(/>Proposals<\//g) ?? []).length, 1); assert.match(html, /Current proposals/); assert.match(html, /Awaiting human decision/);
  const run = render(createElement(React.Fragment, null, createElement(WorkspacePageHeading, { title: 'Analysis run status' }), createElement(() => IntelligenceRunStatusPanel({ pageHeading: true }))));
  assert.equal((run.match(/>Analysis run status<\//g) ?? []).length, 1); assert.match(run, /Checking status does not restart an analysis/);
});

test('live proposals keep their own mode and never receive the demonstration notice', () => {
  const value = parseRecommendation({ ...proposal, generationMode: 'LIVE' });
  const html = render(createElement(ProposalList, { proposals: [value], baselines: [], canDecide: false, onChanged: () => {} }));
  assert.match(html, /Live model analysis/);
  assert.match(html, /Awaiting human decision/);
  assert.doesNotMatch(html, /prepared example output/);
  assert.equal(value.generationMode, 'LIVE');
});

test('Arabic demonstration proposals identify example output without claiming local execution or live quality', () => {
  const html = render(createElement(ProposalList, { proposals: [parseRecommendation(proposal)], baselines: [], canDecide: false, onChanged: () => {} }), 'ar');
  assert.match(html, /تحليل توضيحي/); assert.match(html, /بانتظار قرار بشري/); assert.doesNotMatch(html,/proposal-selected/);
  assert.doesNotMatch(html, /تجربة محلية|تشغيل التحليل المصدري/);
});

test('learner explanations use school results while preserving unknown coverage and exact citations', () => {
  const html = render(createElement(AnalysisExplanation, { analysis, selectedActivityId: id(7), promptDigest: 'a'.repeat(64) }));
  assert.match(html, /one current school result/); assert.match(html, /wider coverage is unknown/);
  assert.match(html, /does not prove a cause or learner trait/);
  assert.doesNotMatch(html.split('<details>')[0], /native result/);
  for (const source of [id(4), id(7), 'a'.repeat(64)]) assert.ok(html.includes(source));
});

test('status review explains expiry without promising a retry or exposing receipt jargon', () => {
  const html = render(createElement(IntelligenceRunStatusPanel));
  assert.match(html, /Checking status does not restart an analysis/);
  assert.match(html, /its failure is recorded/);
  assert.match(html, /before requesting a new analysis/);
  assert.doesNotMatch(html, /durable failure receipt/);
  const arabic = render(createElement(IntelligenceRunStatusPanel), 'ar');
  assert.match(arabic, /لا تؤدي مراجعة الحالة إلى إعادة تشغيل التحليل/);
  assert.match(arabic, /يُسجَّل إخفاقها/);
});

test('evaluation choices display demonstration and live labels while retaining exact mode values', () => {
  for (const locale of ['en', 'ar'] as const) {
    const html = render(createElement(IntelligenceEvaluationMetrics), locale);
    assert.match(html, /<option value="FIXTURE" selected="">/);
    assert.match(html, /<option value="LIVE">/);
    assert.doesNotMatch(html, /Local fixture|تجربة محلية/);
    assert.match(html, locale === 'ar' ? /تحليل توضيحي/ : /Demonstration analysis/);
    assert.match(html, locale === 'ar' ? /لا يثبت الناتج التوضيحي أداء نموذج حي/ : /demonstration output does not establish live model performance/);
  }
});

test('the decline explanation retains same-scale comparison and Arabic teacher review limits', () => {
  const html = render(createElement(AnalysisExplanation, { analysis: { ...analysis, basis: 'NATIVE_RESULT_DECLINE', resultIds: [id(4), id(8)] } }));
  assert.match(html, /same school assessment scale/); assert.match(html, /another cited result/);
  const arabic = render(createElement(AnalysisExplanation, { analysis }), 'ar');
  assert.match(arabic, /نتيجة مدرسية حالية واحدة/); assert.match(arabic, /التغطية الأوسع مجهولة/);
  assert.match(arabic, /لا تثبت سببًا أو صفة للطالب/);
});
