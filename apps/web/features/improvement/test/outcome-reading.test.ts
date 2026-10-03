import assert from 'node:assert/strict';import test from 'node:test';import * as React from 'react';import {createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';import{OutcomeReadingView}from'../components/outcome-reading';import type{Outcome}from'../model';
Object.assign(globalThis,{React});
const outcome={id:'one',interventionId:'practice',baselineResultId:'before',followUpResultId:'after',status:'improved',difference:4,minimumChange:1,baseline:{score:3,maxScore:10},followUp:{score:7,maxScore:10},reason:'OBSERVED_RAW_SCORE_CHANGE',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-03T11:28:00Z'}as Outcome;
function render(locale:'en'|'ar'){return renderToStaticMarkup(createElement(OutcomeReadingView,{outcome,locale}));}
test('native source order is explicit in both languages and never becomes an inverted ratio',()=>{for(const locale of ['en','ar']as const){const html=render(locale);assert.equal((html.match(/dir="ltr"/g)||[]).length,2);assert.match(html,/3 \/ 10/);assert.match(html,/7 \/ 10/);assert.doesNotMatch(html,/10 \/ 3|10 \/ 7/);assert.match(html,/UTC/);}});
test('recorded difference and threshold remain separate from a causal conclusion',()=>{const html=render('en');assert.match(html,/Raw score difference/);assert.match(html,/Comparison threshold/);assert.match(html,/not proof that the practice caused/);assert.ok(html.indexOf('Baseline')<html.indexOf('Follow-up'));});

const context={status:'READY',labelBasis:'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK',learnerId:'23000000-0000-4000-8000-000000000012',identityRequiresReview:false,learnerName:'Lina Hassan',className:'Cedar',yearGroupName:'Year 1',academicYearName:'2026–2027',courseTitle:'School checking',practiceTitle:'Explain one checking step',baselineAssessmentTitle:'First checking task',followUpAssessmentTitle:'Later checking task',baselineSubmittedAt:'2026-10-01T10:00:00Z',followUpSubmittedAt:'2026-10-02T10:00:00Z'}as const;
test('authorized practice and learner context lead the exact named before and after sources',()=>{
  const html=renderToStaticMarkup(createElement(OutcomeReadingView,{outcome:{...outcome,context},locale:'en'}));
  assert.match(html,/<h2>Explain one checking step<\/h2>/);assert.match(html,/Lina Hassan/);assert.match(html,/Cedar/);
  assert.match(html,/First checking task/);assert.match(html,/Later checking task/);
  assert.match(html,/dateTime="2026-10-01T10:00:00Z"/);assert.match(html,/dateTime="2026-10-02T10:00:00Z"/);
  assert.doesNotMatch(html,/23000000/);assert.match(html,/Current school names/);
});
test('missing or ambiguous context gives recovery without replacing names with identifiers',()=>{
  const html=renderToStaticMarkup(createElement(OutcomeReadingView,{outcome:{...outcome,context:{...context,status:'REQUIRES_REVIEW',identityRequiresReview:true,learnerName:null,practiceTitle:null,baselineSubmittedAt:null}},locale:'en'}));
  assert.match(html,/Practice context is unavailable/);assert.match(html,/Name unavailable/);assert.match(html,/need school review/);
  assert.doesNotMatch(html,/23000000/);assert.match(html,/3 \/ 10/);
});
test('nested student outcomes retain their supplied heading hierarchy',()=>{
  const html=renderToStaticMarkup(createElement(OutcomeReadingView,{outcome,locale:'ar',headingLevel:4}));
  assert.match(html,/<h4>/);assert.equal((html.match(/<h5>/g)||[]).length,2);assert.doesNotMatch(html,/<h2>|<h3>/);
});
