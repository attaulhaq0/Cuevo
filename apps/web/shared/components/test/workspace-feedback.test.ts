import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import{registerHooks}from'node:module';
import{LearningApiError}from'../../api/client';
import{commonEn,commonAr}from'../../i18n/common';
const fixture={locale:'en'};Object.assign(globalThis,{React,feedbackFixture:fixture,feedbackEn:commonEn,feedbackAr:commonAr});
registerHooks({load(url,context,next){if(url.replaceAll('\\','/').endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApi(){return{t:globalThis.feedbackFixture.locale==="en"?globalThis.feedbackEn:globalThis.feedbackAr}}'};return next(url,context);}});
const {LearningError}=await import('../feedback');const {LoadMore}=await import('../load-more');
test('shared read failures use the Trail state while keeping alert, uncertain request and closed reference semantics',()=>{
 for(const locale of ['en','ar'])for(const kind of ['denied','unavailable','conflict']as const){fixture.locale=locale;const html=renderToStaticMarkup(createElement(LearningError,{error:new LearningApiError(kind,true,'support-reference')}));assert.match(html,/cuevo-workspace-state/);assert.match(html,/form-error/);assert.match(html,/role="alert"/);assert.match(html,/support-reference/);assert.doesNotMatch(html,/<details[^>]*open|<button/);assert.match(html,locale==='en'?/outcome is not confirmed/:/لم تتأكّد نتيجة الإجراء/);}
});
test('terminal empty or populated sources reserve no pagination label; actual continuation and uncertainty stay actionable',()=>{
 fixture.locale='en';let calls=0;const base={loaded:true,loading:false,loadingMore:false,nextCursor:null,moreError:null,loadMore(){calls++;}};
 assert.equal(renderToStaticMarkup(createElement(LoadMore,{query:base})),'');
 const more=renderToStaticMarkup(createElement(LoadMore,{query:{...base,nextCursor:'cursor',loadingMore:true},label:'Current work'}));assert.match(more,/disabled=""/);assert.match(more,/Loading more…: Current work/);assert.equal(calls,0);
 const failed=renderToStaticMarkup(createElement(LoadMore,{query:{...base,moreError:new LearningApiError('unavailable')}}));assert.match(failed,/role="alert"/);assert.doesNotMatch(failed,/All available records loaded/);
});
