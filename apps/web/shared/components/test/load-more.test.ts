import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {commonEn,commonAr} from '../../i18n/common';
let locale:'en'|'ar'='en';
Object.assign(globalThis,{React,pagingCopy:()=>locale==='ar'?commonAr:commonEn});
registerHooks({load(url,context,nextLoad){if(url.replaceAll('\\','/').endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApi(){return{t:globalThis.pagingCopy()}}'};return nextLoad(url,context)}});
const {LoadMore}=await import('../load-more');
test('native continuation exposes only its current cursor while labels, pending and terminal states stay unchanged',()=>{
 const cursor='b1000000-0000-4000-8000-000000000001';
 for(const currentLocale of ['en','ar'] as const)for(const pending of [false,true]){
  locale=currentLocale;
  const html=renderToStaticMarkup(createElement(LoadMore,{query:{nextCursor:cursor,loaded:true,loading:false,loadingMore:pending,moreError:null,loadMore(){throw Error('Rendering must not request another page')}},label:locale==='en'?'Current results':'النتائج الحالية'}));
  assert.match(html,new RegExp(`data-page-cursor="${cursor}"`));
  assert.equal(html.includes('disabled=""'),pending);
  assert.ok(html.includes(pending?(locale==='en'?commonEn.loadingMore:commonAr.loadingMore):(locale==='en'?commonEn.loadMore:commonAr.loadMore)));
  assert.equal(html.slice(html.indexOf('>')+1).includes(`>${cursor}<`),false);
 }
 for(const loading of [false,true])assert.equal(renderToStaticMarkup(createElement(LoadMore,{query:{nextCursor:null,loaded:true,loading,loadingMore:false,moreError:null,loadMore(){}}})), '');
});
