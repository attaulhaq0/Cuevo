import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import type { Version } from '../model.ts';
const id='40000000-0000-4000-8000-000000000001';
const fixture={app:{}as Record<string,unknown>,loading:false,error:null as LearningApiError|null,page:null as Record<string,unknown>|null};
Object.assign(globalThis,{React,curriculumNestedStateFixture:fixture});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.curriculumNestedStateFixture.app}'};if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(path,parse){const f=globalThis.curriculumNestedStateFixture;return {loading:f.loading,error:f.error,data:f.page&&path?parse(f.page):null}}export function useApi(){return {journal:globalThis.curriculumNestedStateFixture.app.commandJournal,t:{loadMore:"Load more",loadingMore:"Loading more"}}}'};if(path.endsWith('/curriculum/components/lifecycle.tsx'))return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8').replace('useState(()=>!!formDrafts.model(slot)||!!commandJournal.get(path))','useState(()=>true)'),{loader:'tsx',format:'esm',jsx:'automatic'}).code};return next(url,context);}});
const{CurriculumLifecycle}=await import('../components/lifecycle.tsx');
const version:Version={id,packId:'school',kind:'school_custom',framework:'School Custom',programme:'School programme',version:'v1',scope:'School synthetic context',sourceStatus:'VERIFIED',rightsStatus:'PERMITTED',sourceLocation:'repo:synthetic',sourceChecksum:null,synthetic:true,reason:'Synthetic source scope only'};
function reset(locale:'en'|'ar'){fixture.app={locale,membership:{schoolId:id,userId:id,role:'teacher',entitlements:['curriculum']},status:'ready',online:true,apiUrl:'https://fixture.invalid',accessToken:'synthetic',accessGeneration:1,commandJournal:new CommandJournal(),formDrafts:new FormDrafts()};fixture.loading=false;fixture.error=null;fixture.page={versionId:id,state:'ACTIVE',revision:1,customerReady:false,configurationAllowed:true,retainedEvidenceAllowed:true,programmeCount:0,courseCount:0,openAssessmentCount:0,reason:'Current technical state',history:[],nextCursor:null};}
const render=()=>renderToStaticMarkup(createElement(CurriculumLifecycle,{version,versions:[version]}));
test('known curriculum lifecycle terminal-zero history is unconfirmed review in English and Arabic',()=>{for(const locale of['en','ar']as const){reset(locale);const html=render();assert.match(html,/data-state="review"/);assert.match(html,locale==='en'?/history is unconfirmed/:/سجل المصدر غير مؤكد/);assert.doesNotMatch(html,/data-state="empty"|<form/);}});
test('a continued zero-row lifecycle history remains unknown without inventing no history',()=>{reset('en');fixture.page!.nextCursor=id;const html=render();assert.match(html,/data-state="unknown"/);assert.match(html,/Next source history page/);});
test('current lifecycle history preserves source record meaning and denial stays its original owner',()=>{reset('en');fixture.page!.history=[{id,state:'ACTIVE',revision:1,reason:'Retained current transition',createdAt:'2026-10-01T00:00:00Z'}];assert.match(render(),/Retained current transition/);assert.doesNotMatch(render(),/history is unconfirmed/);fixture.error=new LearningApiError('denied');assert.doesNotMatch(render(),/Retained current transition/);});


test('lifecycle loading and absent current source cannot display a terminal-history verdict',()=>{reset('en');fixture.loading=true;assert.match(render(),/data-state="loading"/);assert.doesNotMatch(render(),/history is unconfirmed/);fixture.loading=false;fixture.page=null;assert.doesNotMatch(render(),/history is unconfirmed/);});
