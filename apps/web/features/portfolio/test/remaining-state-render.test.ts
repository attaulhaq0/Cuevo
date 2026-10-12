import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';
import { commonEn, commonAr } from '../../../shared/i18n/common.ts';

const fixture={app:{} as Record<string,unknown>,loading:false,continued:false,children:[] as unknown[]};
Object.assign(globalThis,{React,remainingPortfolioFixture:fixture,remainingPortfolioEn:commonEn,remainingPortfolioAr:commonAr});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.remainingPortfolioFixture.app}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(){return{data:null,loading:globalThis.remainingPortfolioFixture.loading,error:null}}export function useApi(){return{journal:globalThis.remainingPortfolioFixture.app.commandJournal,t:globalThis.remainingPortfolioFixture.app.locale==="ar"?globalThis.remainingPortfolioAr:globalThis.remainingPortfolioEn}}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(path,parse){const f=globalThis.remainingPortfolioFixture;return{data:path==="/v1/people?limit=100"?f.children.map(parse):[],loaded:!!path,loading:f.loading,loadingMore:false,error:null,moreError:null,nextCursor:f.continued&&(path?.includes("feedback-requests")||path?.startsWith("/v1/assets?"))?"next-page":null,loadMore(){}}}'};
 return next(url,context);
}});
const {PortfolioWorkspace}=await import('../components/portfolio-workspace.tsx');
const {ParentPortfolioReading}=await import('../components/parent-reading.tsx');
const {PortfolioArtifactDownload}=await import('../components/artifact-download.tsx');
const {PortfolioSourceWork}=await import('../components/source-work.tsx');
const {PortfolioDocumentSelection}=await import('../components/document-selection.tsx');
const {PortfolioOrganization}=await import('../components/organization.tsx');
const {PrivateFiles}=await import('../components/private-files.tsx');
function app(locale:'en'|'ar') {fixture.app={locale,dictionary:getDictionary(locale),online:true,status:'ready',accessGeneration:1,accessToken:'fixture',apiUrl:'https://fixture.invalid',commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),refreshAccess(){},reportDiagnostic(){},membership:{role:'student',schoolId:'school',userId:'learner',entitlements:['portfolio','assessment'],school:{name:'Current school'}}};fixture.loading=false;fixture.continued=false;fixture.children=[];}
for(const locale of ['en','ar'] as const){
 test(`${locale} Parent without a current child keeps one prerequisite and no work-selection plane`,()=>{
  app(locale); fixture.app={...fixture.app,selectedChildId:'',selectChild(){},membership:{role:'parent',schoolId:'school',userId:'parent',displayName:'Current guardian',entitlements:['portfolio','assessment','learning','curriculum'],school:{name:'Current school'}}};
  const html=renderToStaticMarkup(createElement(PortfolioWorkspace));
  assert.equal((html.match(/<h1[ >]/g)??[]).length,1);
  assert.match(html,locale==='en'?/No child is available through your current approved relationships/:/لا يتاح طفل ضمن العلاقات الحالية المعتمدة/);
  assert.doesNotMatch(html,/parent-portfolio-reading|Approved selected work|Choose an approved item|الأعمال المختارة المعتمدة/);
  assert.equal((html.match(/data-state="empty"/g)??[]).length,1);
  assert.equal((html.match(/<button/g)??[]).length,1);
 });
 test(`${locale} a current sole child retains the approved-work empty state instead of the prerequisite fallback`,()=>{
  app(locale);fixture.children=[{userId:'00000000-0000-4000-8000-000000000002',displayName:'Current child',role:'student',classLabels:['Current class']}];fixture.app={...fixture.app,selectedChildId:'',selectChild(){},membership:{role:'parent',schoolId:'school',userId:'parent',displayName:'Current guardian',entitlements:['portfolio','assessment','learning','curriculum'],school:{name:'Current school'}}};
  const html=renderToStaticMarkup(createElement(PortfolioWorkspace));assert.match(html,/parent-portfolio-reading/);assert.match(html,/Current child/);assert.doesNotMatch(html,/No child is available|لا يتاح طفل/);
  assert.equal((html.match(/<h1[ >]/g)??[]).length,1);assert.match(html,/data-state="empty"/);
 });
 test(`${locale} complete Portfolio directory uses the state card while source checking stays loading`,()=>{
  app(locale);let html=renderToStaticMarkup(createElement(PortfolioWorkspace));assert.match(html,/data-state="empty"/);assert.doesNotMatch(html,/<p[^>]*>\s*<div/);
  fixture.loading=true;html=renderToStaticMarkup(createElement(PortfolioWorkspace));assert.match(html,/data-state="loading"/);assert.doesNotMatch(html,/data-state="empty"/);
 });
 test(`${locale} Parent reader selection and retired document have truthful compact states`,()=>{
  app(locale);let html=renderToStaticMarkup(createElement(ParentPortfolioReading,{items:[],childId:'child',current:true}));assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/data-state="empty"/);
  html=renderToStaticMarkup(createElement(PortfolioArtifactDownload,{itemId:'item',revisionId:'revision',asset:{id:'document',name:'Current document',state:'RETIRED',sha256:'a'.repeat(64),byteSize:1,contentType:'text/plain'} as never}));assert.match(html,/data-state="unavailable"/);assert.doesNotMatch(html,/<button/);assert.match(html,/Current document/);
 });
 test(`${locale} immutable source and document selectors show loading without mounting a new edit form`,()=>{
  app(locale);fixture.loading=true;const item={id:'item',revisionId:'revision',revision:1,submissionId:'submission'} as never;
  for(const Component of [PortfolioSourceWork,PortfolioDocumentSelection]){const html=renderToStaticMarkup(createElement(Component,{item,onSaved(){},onCancel(){}}));assert.match(html,/data-state="loading"/);assert.doesNotMatch(html,/<form/);}
 });
 test(`${locale} continued feedback directory never claims the whole request queue is empty`,()=>{
  app(locale);fixture.continued=true;const html=renderToStaticMarkup(createElement(PortfolioOrganization,{items:[],refresh:0,onChanged(){}}));const requests=html.slice(html.indexOf('portfolio-feedback-requests'));assert.match(requests,/data-state="unknown"/);assert.doesNotMatch(requests,/data-state="empty"/);assert.match(requests,locale==='en'?/remaining records/:/السجلات المتبقية/);
 });
 test(`${locale} continued private files stay unknown rather than claiming no uploaded files`,()=>{
  app(locale);fixture.continued=true;const html=renderToStaticMarkup(createElement(PrivateFiles));assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/data-state="empty"/);assert.match(html,locale==='en'?/remaining files/:/الملفات المتبقية/);
 });
}
