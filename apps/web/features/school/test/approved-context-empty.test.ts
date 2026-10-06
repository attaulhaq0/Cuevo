import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup}from'react-dom/server';
import{registerHooks}from'node:module';
import{CommandJournal,LearningApiError}from'../../../shared/api/client.ts';
import{FormDrafts}from'../../../shared/session/form-drafts.ts';
Object.assign(globalThis,{React});
type Source={data:Record<string,unknown>[];loaded:boolean;loading:boolean;loadingMore:boolean;error:LearningApiError|null;moreError:LearningApiError|null;nextCursor:string|null;loadMore():void};
const base:Source={data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}};
const fixture={app:{locale:'en',membership:{role:'teacher',schoolId:'school',userId:'actor'},formDrafts:new FormDrafts(),commandJournal:new CommandJournal(),apiUrl:'',accessToken:'fixture',online:true,accessGeneration:1},support:{...base},choices:{...base}};
Object.assign(globalThis,{schoolApprovedEmptyFixture:fixture});
registerHooks({load(url,context,next){const p=url.replaceAll('\\','/');if(p.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.schoolApprovedEmptyFixture.app}'};if(p.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(path){return path?.startsWith("/v1/school/learning-support?")?globalThis.schoolApprovedEmptyFixture.support:path?.startsWith("/v1/school/people?")||path?.startsWith("/v1/courses?")||path?.startsWith("/v1/assessments?")?globalThis.schoolApprovedEmptyFixture.choices:{data:[],loaded:!!path,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}'};if(p.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(){return{data:null,loading:false,error:null}}export function useApi(){return{t:{errorDenied:"Permission denied",errorUnavailable:"Service unavailable",loadingMore:"Loading more",loadMore:"Load more",allLoaded:"All available records loaded"}}}'};return next(url,context);}});
const{ApprovedSchoolContext}=await import('../components/approved-context.tsx');
const{supportPath}=await import('../support-review-model.ts');
test('complete empty approved support explains permitted absence with one existing read recovery',()=>{
 const html=renderToStaticMarkup(createElement(ApprovedSchoolContext));assert.match(html,/No approved learning support is available with your current access/);assert.match(html,/Ask your school to review/);assert.equal((html.match(/>Refresh school records</g)??[]).length,1);assert.doesNotMatch(html,/All available records loaded/);
 assert.match(html,/data-state="empty"/);
 fixture.app.locale='ar';const arabic=renderToStaticMarkup(createElement(ApprovedSchoolContext));assert.match(arabic,/لا يتاح دعم تعليمي معتمد ضمن صلاحياتك الحالية/);fixture.app.locale='en';
});
test('partial loading unavailable and denied support never become a complete empty claim',()=>{
 for(const state of[{...base,loaded:false},{...base,loading:true},{...base,nextCursor:'next-current'},{...base,moreError:new LearningApiError('unavailable')},{...base,error:new LearningApiError('denied')}]){fixture.support=state as typeof fixture.support;const html=renderToStaticMarkup(createElement(ApprovedSchoolContext));assert.doesNotMatch(html,/No approved learning support is available with your current access/);if(state.moreError||state.error)assert.match(html,/role="alert"/);}
 fixture.support={...base};const composed=renderToStaticMarkup(createElement(()=>ApprovedSchoolContext({pageHeading:true})));assert.doesNotMatch(composed,/>Refresh school records</);
});
test('an approver receives review guidance without inventing support and a denied continuation withholds former instructions',()=>{
 fixture.app.membership.role='coordinator';fixture.support={...base};let html=renderToStaticMarkup(createElement(ApprovedSchoolContext));assert.match(html,/Review the current learner and course before approving support/);assert.doesNotMatch(html,/Ask your school to review/);
 fixture.support={...base,data:[{id:'support',title:'Private previously admitted guide',instructions:'Private earlier instructions',learnerName:'Lina',courseTitle:'Checking',state:'ACTIVE',effectiveFrom:'2026-10-01',effectiveTo:'2026-11-01'}],moreError:new LearningApiError('denied'),nextCursor:'denied-next'}as typeof fixture.support;
 html=renderToStaticMarkup(createElement(ApprovedSchoolContext));assert.match(html,/Permission denied/);assert.doesNotMatch(html,/Private earlier instructions|Private previously admitted guide|Load more.*Approved task support|No approved learning support/);fixture.support={...base};fixture.app.membership.role='teacher';
});
test('initial and continued approval-choice loading use the shared state while the approval form stays withheld',()=>{
 for(const role of ['admin','coordinator'])for(const locale of ['en','ar'])for(const loadingMore of [false,true]){
  fixture.app.membership.role=role;fixture.app.locale=locale;
  fixture.app.formDrafts.saveModel(`school:actor:${supportPath}:selection`,{courseId:'',learnerId:''});
  fixture.choices={...base,loaded:loadingMore,loading:!loadingMore,loadingMore};
  const html=renderToStaticMarkup(createElement(ApprovedSchoolContext));
  assert.match(html,/cuevo-workspace-state[^>]*data-state="loading"[^>]*role="status"/);
  assert.doesNotMatch(html,/<p role="status">|<form/);
 }
 fixture.app.formDrafts=new FormDrafts();fixture.choices={...base};fixture.app.membership.role='teacher';fixture.app.locale='en';
});
