import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks, createRequire } from 'node:module';
const id=(number:number)=>'de000000-0000-4000-8000-'+String(number).padStart(12,'0');
const fixture={locale:'en' as 'en'|'ar',context:null as unknown};
Object.assign(globalThis,{React,insightRatioFixture:fixture});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return{locale:globalThis.insightRatioFixture.locale}}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(path,parse){return{loading:false,error:null,data:parse(globalThis.insightRatioFixture.context)}}export function useApi(){return{t:{errorInvalid:"The request could not be confirmed. Review your entries and try again."}}}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(){return{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}'};
 return next(url,context);
}});
type Element={textContent:string;querySelector(selector:string):Element|null;querySelectorAll(selector:string):Element[]};
const {parse}=createRequire(import.meta.url)('next/dist/compiled/node-html-parser')as{parse(html:string):Element};
const {InsightContextDisclosure}=await import('../components/insight-context.tsx');
function envelope(score:number, rubric=false){return{runId:id(1),context:{schemaVersion:'1',learnerId:id(2),courseId:id(3),classId:id(4),reference:{id:id(5),version:'school-v1',title:'Current school objective'},recentResults:[rubric?{resultId:id(6),evidenceId:id(7),referenceId:id(5),referenceVersion:'school-v1',nativeResult:{type:'rubric',rubricId:id(8),rubricVersion:'school-v1',rubricTitle:'Current explanation rubric',policyVersion:1,normalized:null,criteria:[{criterionKey:'explanation',criterionTitle:'Explain the method',levelKey:'reviewed',levelLabel:'Explains one method',levelDescription:'The current response explains one checked method.'}]}}:{resultId:id(6),evidenceId:id(7),referenceId:id(5),referenceVersion:'school-v1',score,maxScore:10}],observations:[],priorInterventions:[],learningOptions:[],coverage:'BOUNDED_AUTHORIZED_CONTEXT'}};}
function render(){return parse(renderToStaticMarkup(createElement(InsightContextDisclosure,{runId:id(1),learnerId:id(2),referenceId:id(5),baselineResultId:id(6)})));}
test('legacy numeric analysis evidence isolates score then maximum in English and Arabic without changing native values',()=>{
 for(const locale of['en','ar']as const)for(const score of[0,3,7]){
  fixture.locale=locale;fixture.context=envelope(score);const view=render(),ratio=view.querySelector('.insight-context > article > p > bdi[dir="ltr"]');
  assert.ok(ratio,locale+'/'+score+': numeric source requires an isolated LTR run');
  assert.equal(ratio.textContent,new Intl.NumberFormat(locale).format(score)+' / '+new Intl.NumberFormat(locale).format(10));
  assert.equal(view.querySelectorAll('.native-score').length,0,'Legacy source is not converted into a model requiring missing policy fields');
 }
});
test('native rubric and invalid analysis learner keep their existing source readers',()=>{
 fixture.locale='ar';fixture.context=envelope(0,true);let view=render();assert.equal(view.querySelectorAll('.native-rubric').length,1);
 assert.match(view.textContent,/Current explanation rubric|Explain the method|Explains one method|school-v1/);
 assert.equal(view.querySelectorAll('.insight-context > article > p > bdi[dir="ltr"]').length,0);
 fixture.locale='en';const wrong=envelope(3);wrong.context.learnerId=id(99);fixture.context=wrong;view=render();
 assert.equal(view.querySelectorAll('.insight-context').length,0);assert.equal(view.querySelectorAll('[data-state="review"]').length,1);
 assert.equal(view.querySelectorAll('bdi[dir="ltr"]').length,0);assert.match(view.textContent,/could not be confirmed|Review/);
});
