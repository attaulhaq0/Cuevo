import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { Providers } from '../../../shared/session/providers.tsx';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as views from '../components/coordinator-outcomes.tsx';
import type { Outcome } from '../model.ts';

Object.assign(globalThis, { React });
type RenderedElement = { textContent: string; querySelector(selector: string): RenderedElement | null; querySelectorAll(selector: string): RenderedElement[] };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): RenderedElement };
const outcome = { id: 'outcome-a', interventionId: 'practice-a', baselineResultId: 'before', followUpResultId: 'after', measuredAt: '2026-10-03T10:00:00Z', status: 'improved', baseline: { score: 3, maxScore: 10 }, followUp: { score: 5, maxScore: 10 }, difference: 2, minimumChange: 1, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', context: { status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK', learnerId: 'learner-a', identityRequiresReview: false, learnerName: 'Alex', className: 'Cedar', yearGroupName: 'Year 4', academicYearName: '2026–2027', courseTitle: 'Reasoning', practiceTitle: 'Check one step', baselineAssessmentTitle: 'Before checking', followUpAssessmentTitle: 'After checking', baselineSubmittedAt: '2026-10-01T10:00:00Z', followUpSubmittedAt: '2026-10-02T10:00:00Z' } } satisfies Outcome;
const source = { data: [outcome], loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: 'next-page', loadMore() {} };
function render(selected: Outcome | null, input = source) {
  assert.equal(typeof views.CoordinatorOutcomeView, 'function');
  return renderToStaticMarkup(createElement(Providers, { initialLocale: 'en', config: { supabaseUrl: '', supabasePublishableKey: '', apiUrl: '' }, children: createElement(views.CoordinatorOutcomeView, { source: input, rows: input.data, outcome: selected, hasSelection: !!selected, locale: 'en', onOpen() {}, onClose() {} }) }));
}
test('unselected Coordinator directory has no native reader and keeps Load more inside its source directory', () => {
  const html = render(null);
  assert.match(html, /data-selected="false"/);
  assert.doesNotMatch(html, /coordinator-outcome-selected-heading|outcome-reading__sources/);
  assert.match(html, /Choose a measured outcome/);
  assert.match(html, /coordinator-outcome-directory[\s\S]*Load more[\s\S]*<\/section><\/div>/);
});
test('explicit selected Coordinator record mounts one native outcome and a Back to list control', () => {
  const html = render(outcome);
  assert.match(html, /data-selected="true"/);
  assert.equal(parse(html).querySelectorAll('.outcome-reading').length, 1);
  assert.equal(parse(html).querySelectorAll('.coordinator-outcome-directory').length, 1);
  assert.match(html, /Return to outcome list/);
  assert.match(html, /Before checking/); assert.match(html, /After checking/);
  assert.match(html, /3 \/ 10/); assert.match(html, /5 \/ 10/);
  assert.match(html, /Observation does not establish cause/);
});
test('denied Coordinator source cannot expose directory rows or native reader', () => {
  const html = render(null, { ...source, data: [], moreError: new LearningApiError('denied') });
  assert.doesNotMatch(html, /Check one step|Before checking|coordinator-outcome-directory/);
});

test('current loading and failed reads withhold stale directory and native values', () => {
  for (const input of [{ ...source, loading: true }, { ...source, loaded: false }, { ...source, error: new LearningApiError('unavailable') }, { ...source, moreError: new LearningApiError('unauthorized') }]) {
    const html = render(outcome, input);
    assert.doesNotMatch(html, /Check one step|Before checking|After checking|3 \/ 10|5 \/ 10/);
  }
});

test('unavailable continuation keeps the admitted native comparison with local partial recovery', () => {
  const html = render(outcome, { ...source, moreError: new LearningApiError('unavailable') });
  const document = parse(html);
  assert.equal(document.querySelectorAll('.outcome-reading').length, 1);
  assert.match(document.querySelector('.coordinator-outcome-directory')!.textContent, /partial current outcome list/);
  assert.match(document.querySelector('.coordinator-outcome-directory')!.textContent, /Load more/);
  assert.match(document.querySelector('.coordinator-outcome-selected-source-state')!.textContent, /partial current outcome list/);
  assert.match(html, /3 \/ 10|5 \/ 10/);
});

test('partial outcome and changed selection keep distinct shared source states without opening a native reader',()=>{const partial=renderToStaticMarkup(createElement(Providers,{initialLocale:'en',config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(views.CoordinatorOutcomeView,{source,rows:[outcome],outcome:null,hasSelection:true,locale:'en',onOpen(){},onClose(){}})}));assert.match(partial,/data-state="review"/);assert.match(partial,/data-state="unknown"/);assert.doesNotMatch(partial,/outcome-reading__ratio/);assert.match(partial,/Load more/);});

test('zero loaded outcomes with a continuation remain unknown rather than complete empty',()=>{const html=renderToStaticMarkup(createElement(Providers,{initialLocale:'en',config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(views.CoordinatorOutcomeView,{source:{...source,data:[]},rows:[],outcome:null,hasSelection:false,locale:'en',onOpen(){},onClose(){}})}));assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/No measured outcomes are available/);assert.equal((html.match(/data-state="unknown"/g)??[]).length,1);});
