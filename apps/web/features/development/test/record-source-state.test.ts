import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Providers} from '../../../shared/session/providers.tsx';
import {LearningApiError} from '../../../shared/api/client.ts';
import {developmentRecordState,developmentPeriodPrerequisite,type DevelopmentRecordSource} from '../model.ts';
import {ConsecutiveRecordedDays,DevelopmentRecordReading} from '../components/development-workspace.tsx';
import {developmentEn,developmentAr} from '../messages.ts';
Object.assign(globalThis,{React});
const base={data:[] as unknown[],loaded:true,loading:false,loadingMore:false,error:null as LearningApiError|null,moreError:null as LearningApiError|null,nextCursor:null as string|null,loadMore(){}};
function render(query=base,locale:'en'|'ar'='en',current=true){const copy=locale==='ar'?developmentAr:developmentEn;return renderToStaticMarkup(createElement(Providers,{initialLocale:locale,config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(DevelopmentRecordReading,{query,current,locale,icon:'reflection',emptyDescription:copy.emptyLedger,label:copy.ledger,children:createElement('p',null,'Current source row')})}));}
test('only a successful settled terminal record source is confirmed empty',()=>{
 assert.equal(developmentRecordState(base),'empty');
 for(const metadata of [{loaded:false},{loading:true},{loadingMore:true},{nextCursor:'next'},{error:new LearningApiError('denied')},{moreError:new LearningApiError('unavailable')}])assert.notEqual(developmentRecordState({...base,...metadata}),'empty');
 assert.notEqual(developmentRecordState({...base,loaded:undefined}as unknown as DevelopmentRecordSource),'empty');
 for(const key of ['loading','loadingMore','error','moreError','nextCursor']as const)assert.notEqual(developmentRecordState({...base,[key]:undefined}as unknown as DevelopmentRecordSource),'empty');
 assert.equal(developmentRecordState({...base,data:[{}]}),'records');assert.equal(developmentRecordState({...base,data:[{}],nextCursor:'next'}),'partial');
});
test('zero partial records show one truthful continuation while known empty uses the localized empty copy',()=>{
 for(const locale of ['en','ar']as const){const copy=locale==='ar'?developmentAr:developmentEn;const html=render({...base,nextCursor:'next'},locale);assert.match(html,/data-state="review"/);assert.doesNotMatch(html,/data-state="empty"|Current source row/);assert.ok(!html.includes(copy.emptyLedger));assert.equal(html.split(copy.partialRecords).length-1,1);assert.match(html,/data-page-cursor="next"/);const empty=render(base,locale);assert.match(empty,/data-state="empty"/);assert.ok(empty.includes(copy.emptyLedger));}
});
test('initial and continuing reads and failures do not turn absence into zero',()=>{
 assert.match(render({...base,loaded:false}),/data-state="loading"/);assert.match(render({...base,loadingMore:true}),/data-state="unknown"/);
 const denied=render({...base,error:new LearningApiError('denied')});assert.match(denied,/role="alert"/);assert.doesNotMatch(denied,/data-state="empty"|Current source row/);
 const more=render({...base,data:[{}],nextCursor:'next',moreError:new LearningApiError('unavailable')});assert.match(more,/role="alert"/);assert.doesNotMatch(more,/Current source row|data-state="empty"|data-state="review"/);
 assert.doesNotMatch(render(base,'en',false),/Current source row|data-state="empty"/);
});
test('source rows remain visible once, with their continuation but without duplicate review or unrelated errors',()=>{
 const html=render({...base,data:[{}],nextCursor:'next'});assert.equal(html.split('Current source row').length-1,1);assert.equal((html.match(/data-state="review"/g)??[]).length,1);assert.equal((html.match(/role="alert"/g)??[]).length,0);
});
test('period prerequisite distinguishes checking, no selection and a failure owned by the current context',()=>{
 assert.equal(developmentPeriodPrerequisite('',base),'unknown');assert.equal(developmentPeriodPrerequisite('',{...base,loaded:false}),'loading');assert.equal(developmentPeriodPrerequisite('selected',{...base,loading:true}),'loading');assert.equal(developmentPeriodPrerequisite('selected',base),null);assert.equal(developmentPeriodPrerequisite('',{...base,error:new LearningApiError('denied')}),null);assert.equal(developmentPeriodPrerequisite('',{...base,moreError:new LearningApiError('unavailable')}),null);
});
test('nonrecorded streak states use canonical meaning and never render a count',()=>{
 for(const locale of ['en','ar']as const)for(const [status,kind]of [['PERIOD_REQUIRED','unknown'],['DISABLED','unavailable'],['UNOBSERVED','unknown'],['REQUIRES_REVIEW','review']]as const){const copy=locale==='ar'?developmentAr:developmentEn;const html=renderToStaticMarkup(createElement(ConsecutiveRecordedDays,{locale,copy,streak:{status,basis:'VERIFIED_RECOGNIZED_ACTION_DAYS',timezone:'UTC',days:null,endingOn:null,recordedDays:null,sourceCount:null}}));assert.match(html,new RegExp(`data-state="${kind}"`));assert.doesNotMatch(html,/<dd|development-facts/);}
 const html=renderToStaticMarkup(createElement(ConsecutiveRecordedDays,{locale:'en',copy:developmentEn,streak:{status:'RECORDED',basis:'VERIFIED_RECOGNIZED_ACTION_DAYS',timezone:'UTC',days:2,endingOn:'2026-10-02',recordedDays:4,sourceCount:6}}));assert.match(html,/<dd>2<\/dd>/);assert.doesNotMatch(html,/data-state="unknown"/);
});
