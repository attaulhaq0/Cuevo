import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningApiError, CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const fixture = { locale: 'en', error: null as LearningApiError|null, loading: false };
Object.assign(globalThis, { React, selectedSourceFixture: fixture });
registerHooks({load(url,context,next){
 const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return {locale:globalThis.selectedSourceFixture.locale,membership:{schoolId:"school",userId:"actor",role:"student"},status:"ready",online:false,apiUrl:"",accessToken:"",accessGeneration:1,commandJournal:globalThis.selectedSourceFixture.journal,formDrafts:globalThis.selectedSourceFixture.drafts}}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(){return {...globalThis.selectedSourceFixture,data:null}}export function useApi(){return{t:{errorDenied:"Access denied",errorUnavailable:"Unavailable"},journal:globalThis.selectedSourceFixture.journal}}'};
 if(path.endsWith('/learning/components/content-editor.tsx'))return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8').replace('const[open,setOpen]=useState(false)','const[open,setOpen]=useState(true)'),{loader:'tsx',format:'esm',jsx:'automatic'}).code};
 return next(url,context);
}});
Object.assign(fixture,{journal:new CommandJournal(),drafts:new FormDrafts()});
const { ConnectedAssessment }=await import('../components/content-editor.tsx');
const { SubmittedDocumentWork }=await import('../components/submission-documents.tsx');
test('opened current-source readers show unknown and recovery rather than a blank section in both languages',()=>{
 for(const locale of['en','ar']){
  fixture.locale=locale;fixture.loading=false;fixture.error=null;
  const task=renderToStaticMarkup(createElement(ConnectedAssessment,{activityId:'40000000-0000-4000-8000-000000000001',onOpenChange(){}}));
  const work=renderToStaticMarkup(createElement(SubmittedDocumentWork,{submissionId:'40000000-0000-4000-8000-000000000001'}));
  for(const html of[task,work]){assert.match(html,/data-state="unknown"/);assert.match(html,/role="status"/);assert.doesNotMatch(html,/<form|data-state="empty"/);}
  assert.match(task,locale==='ar'?/العودة إلى الدرس/:/Back to the lesson/);
  assert.match(work,locale==='ar'?/تحديث العمل المسلّم/:/Refresh submitted work/);
 }
});
test('loading and denied source readers keep one existing state without unknown duplicates',()=>{
 for(const [loading,error,state]of[[true,null,'loading'],[false,new LearningApiError('denied'),'denied']]as const){
  Object.assign(fixture,{loading,error});
  for(const node of[createElement(ConnectedAssessment,{activityId:'40000000-0000-4000-8000-000000000001',onOpenChange(){}}),createElement(SubmittedDocumentWork,{submissionId:'40000000-0000-4000-8000-000000000001'})]){
   const html=renderToStaticMarkup(node);assert.match(html,new RegExp('data-state="'+state+'"'));assert.doesNotMatch(html,/data-state="unknown"/);
  }
 }
});
