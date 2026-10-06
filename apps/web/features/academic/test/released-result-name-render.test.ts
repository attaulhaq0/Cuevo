import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { parseReleasedResult } from '../model.ts';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture={app:{} as Record<string,unknown>};Object.assign(globalThis,{React,resultNameFixture:fixture});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.resultNameFixture.app}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(){return{data:[],loaded:true,loading:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}'};
 return next(url,context);
}});
const {ReleasedResults}=await import('../components/results.tsx');
const base={id:id(1),submissionId:id(2),assessmentId:id(3),learnerId:id(4),revision:1,feedback:'Current feedback',status:'RELEASED',policyVersion:2,referenceId:id(5),referenceVersion:'school-v1',evidenceId:id(6),createdAt:'2026-10-05T08:00:00Z',assessmentTitle:'Explain a method',referenceTitle:'Checking reasons',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2}};
test('staff unknown learner context stays localized in directory and reader without an ID fallback',()=>{
 for(const locale of ['en','ar'] as const)for(const exact of [false,true]) {
  fixture.app={locale,membership:{schoolId:id(8),userId:id(9),role:'teacher',entitlements:['assessment','curriculum']},commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),apiUrl:'',accessToken:'synthetic',accessGeneration:1,online:true,status:'ready',announce(){}};
  const html=renderToStaticMarkup(createElement(ReleasedResults,{results:[parseReleasedResult({...base,learnerName:null})],pageHeading:true,exact}));
  const learner=exact?/<p class="academic-learner"><bdi>(.*?)<\/bdi><\/p>/.exec(html)?.[1]:/<small>(.*?)<\/small>/.exec(html)?.[1];
  assert.equal(learner,locale==='en'?'Learner name is unavailable in the current source.':'اسم الطالب غير متاح في المصدر الحالي.');assert.ok(!learner?.includes(id(4)));
 }
});
test('staff reader uses the exact current authorized learner name',()=>{
 fixture.app={locale:'en',membership:{schoolId:id(8),userId:id(9),role:'admin',entitlements:['assessment','curriculum']},commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),apiUrl:'',accessToken:'synthetic',accessGeneration:1,online:true,status:'ready',announce(){}};
 const html=renderToStaticMarkup(createElement(ReleasedResults,{results:[parseReleasedResult({...base,learnerName:'Lina Al-Kuwari'})],pageHeading:true,exact:true}));assert.match(html,/<p class="academic-learner"><bdi>Lina Al-Kuwari<\/bdi><\/p>/);assert.doesNotMatch(html,/Learner name is unavailable/);
});
