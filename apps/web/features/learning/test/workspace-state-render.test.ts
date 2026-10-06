import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
const fixture={app:{} as Record<string,unknown>,query:{data:null,loading:false,error:null},pages:{data:[],loaded:true,loading:false,error:null,moreError:null,nextCursor:null,loadMore(){}}};Object.assign(globalThis,{React,learningStateFixture:fixture});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.learningStateFixture.app}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(){return globalThis.learningStateFixture.query} export function useApi(){return {journal:globalThis.learningStateFixture.app.commandJournal,request(){},t:{save:"Save"}}}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(){return globalThis.learningStateFixture.pages}'};
 return next(url,context);
}});
const {LearningResources}=await import('../components/resources.tsx');
const {QuizWorkspace}=await import('../components/quiz.tsx');
const {LearnerSubmission}=await import('../components/submission-lifecycle.tsx');
const {SubmittedDocumentWork}=await import('../components/submission-documents.tsx');
const {SubmissionList}=await import('../components/assessment-view.tsx');
const {LearningWorkspace}=await import('../components/learning-workspace.tsx');
const id='40000000-0000-4000-8000-000000000001';
function app(locale:'en'|'ar',role='student'){fixture.app={locale,membership:{schoolId:id,userId:id,role,entitlements:['learning','assessment']},status:'ready',online:true,accessToken:'synthetic',apiUrl:'',accessGeneration:1,commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),announce(){}};}
test('current empty resource list uses the shared state without adding a command',()=>{for(const locale of ['en','ar']as const){app(locale);fixture.pages={...fixture.pages,data:[],loading:false};const html=renderToStaticMarkup(createElement(LearningResources,{courseId:id,targetKind:'lesson',targetId:id,canManage:false}));assert.match(html,/class="cuevo-workspace-state" data-state="empty"/);assert.doesNotMatch(html,/<form/);}});
test('unfinished or failed continued resource source cannot present its zero loaded rows as empty',()=>{app('en');for(const source of [{loaded:false,nextCursor:null,moreError:null},{loaded:true,nextCursor:id,moreError:null},{loaded:true,nextCursor:null,moreError:{kind:'unavailable'}}]){fixture.pages={...fixture.pages,data:[],loading:false,...source}as never;const html=renderToStaticMarkup(createElement(LearningResources,{courseId:id,targetKind:'lesson',targetId:id,canManage:false}));assert.doesNotMatch(html,/data-state="empty"/);assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/<form/);}});
test('native quiz and immutable submitted work loading keep status and work-loading markers in shared states',()=>{for(const locale of ['en','ar']as const){app(locale);fixture.query={data:null,loading:true,error:null};fixture.pages={...fixture.pages,data:[],loading:false};for(const child of [createElement(QuizWorkspace,{assessment:{id,courseId:id,submissionKind:'QUIZ'}as never,author:false,onChanged(){}}),createElement(SubmittedDocumentWork,{submissionId:id})]){const html=renderToStaticMarkup(child);assert.match(html,/cuevo-workspace-state[^>]*data-state="loading"[^>]*role="status"/);if(child.type===QuizWorkspace)assert.match(html,/data-work-loading="true"/);else assert.doesNotMatch(html,/data-work-loading/);assert.doesNotMatch(html,/<form/);}}});
test('unavailable learner work remains explicitly unavailable without a submission form',()=>{for(const locale of ['en','ar']as const){app(locale);fixture.query={data:null,loading:false,error:null};const html=renderToStaticMarkup(createElement(LearnerSubmission,{assessment:{id,courseId:id,submissionKind:'TEXT',assignmentState:'CLOSED',status:'PUBLISHED',availableFrom:null,availableUntil:null,allowLate:false}as never,onChanged(){}}));assert.match(html,/cuevo-workspace-state[^>]*data-state="unavailable"/);assert.doesNotMatch(html,/<form/);}});
test('current zero-row submission page remains unknown until its observed source is terminal',()=>{for(const locale of ['en','ar']as const)for(const nextCursor of[id,null]){app(locale,'teacher');const currentPage={context:'current',loading:false,loaded:true,loadingMore:false,nextCursor,error:null,moreError:null,loadMore(){}};const html=renderToStaticMarkup(createElement(SubmissionList,{submissions:[],currentPage,onChanged(){}}));assert.match(html,new RegExp('data-state="'+(nextCursor?'unknown':'empty')+'"'));if(nextCursor)assert.doesNotMatch(html,/data-state="empty"/);}});
test('all roles without Learning access receive one localized unavailable workspace without authoring controls',()=>{
 for(const locale of ['en','ar']as const)for(const role of ['student','teacher','coordinator','parent','admin']){
  app(locale,role);(fixture.app.membership as {entitlements:string[]}).entitlements=[];
  const html=renderToStaticMarkup(createElement(LearningWorkspace));
  assert.match(html,/cuevo-workspace-state[^>]*data-state="unavailable"[^>]*role="status"/);
  assert.equal((html.match(/<h1/g)??[]).length,1);assert.doesNotMatch(html,/class="notice"|<form|<select|<button/);
 }
});
