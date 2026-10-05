import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';
import { commonEn, commonAr } from '../../../shared/i18n/common.ts';

const fixture={app:{} as Record<string,unknown>,loading:false,continued:false};
Object.assign(globalThis,{React,remainingPortfolioFixture:fixture,remainingPortfolioEn:commonEn,remainingPortfolioAr:commonAr});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.remainingPortfolioFixture.app}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(){return{data:null,loading:globalThis.remainingPortfolioFixture.loading,error:null}}export function useApi(){return{journal:globalThis.remainingPortfolioFixture.app.commandJournal,t:globalThis.remainingPortfolioFixture.app.locale==="ar"?globalThis.remainingPortfolioAr:globalThis.remainingPortfolioEn}}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(path){return{data:[],loaded:!!path,loading:globalThis.remainingPortfolioFixture.loading,loadingMore:false,error:null,moreError:null,nextCursor:globalThis.remainingPortfolioFixture.continued&&(path?.includes("feedback-requests")||path?.startsWith("/v1/assets?"))?"next-page":null,loadMore(){}}}'};
 return next(url,context);
}});
const {PortfolioWorkspace}=await import('../components/portfolio-workspace.tsx');
const {ParentPortfolioReading}=await import('../components/parent-reading.tsx');
const {PortfolioArtifactDownload}=await import('../components/artifact-download.tsx');
const {PortfolioSourceWork}=await import('../components/source-work.tsx');
const {PortfolioDocumentSelection}=await import('../components/document-selection.tsx');
const {PortfolioOrganization}=await import('../components/organization.tsx');
const {PrivateFiles}=await import('../components/private-files.tsx');
function app(locale:'en'|'ar') {fixture.app={locale,dictionary:getDictionary(locale),online:true,status:'ready',accessGeneration:1,accessToken:'fixture',apiUrl:'https://fixture.invalid',commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),refreshAccess(){},reportDiagnostic(){},membership:{role:'student',schoolId:'school',userId:'learner',entitlements:['portfolio','assessment'],school:{name:'Current school'}}};fixture.loading=false;fixture.continued=false;}
for(const locale of ['en','ar'] as const){
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
