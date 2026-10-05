import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as paging from '../access-directory-model.ts';
import { AccessDirectory } from '../components/access-directory.tsx';
Object.assign(globalThis,{React});
registerHooks({load(url,context,next){if(url.replaceAll('\\','/').endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApi(){return{t:{errorDenied:"Permission denied",errorUnavailable:"Service unavailable"}}}'};return next(url,context);}});
const rows=Array.from({length:100},(_,index)=>({id:`source-${index}`,title:`Current learner ${index+1}`,context:'Cedar · Year 4',status:'active',source:{id:`source-${index}`,revision:1}}));
const source={context:'current-private-frame',loaded:true,loading:false,loadingMore:false,error:null as LearningApiError|null,moreError:null as LearningApiError|null,nextCursor:'current-next-cursor'};
test('a large current People directory renders a bounded page and Previous/Next without a fabricated total',()=>{
 const html=renderToStaticMarkup(createElement(AccessDirectory,{locale:'en',kind:'person',rows,selectedId:null,query:'',locked:false,statusLabel:()=> 'Active',onKind(){},onQuery(){},onSelect(){},source}));
 assert.equal((html.match(/<li/g)??[]).length,25);assert.match(html,/Previous|Next/);assert.doesNotMatch(html,/Current learner 26|Page \d+ of|Total records|100 records/);
});
test('local page changes and current continuation settlement retain source identities and stop on failure',()=>{
 assert.equal(typeof paging.currentAccessDirectoryPage,'function');assert.equal(typeof paging.navigateAccessDirectoryPage,'function');
 let state=paging.currentAccessDirectoryPage(null,'current',100,source);
 for(let i=0;i<3;i++)state=paging.navigateAccessDirectoryPage(state,'next',100,source);
 assert.equal(state.index,3);assert.equal(state.pendingCursor,null);
 state=paging.navigateAccessDirectoryPage(state,'next',100,source);assert.equal(state.index,3);assert.equal(state.pendingCursor,source.nextCursor);
 state=paging.currentAccessDirectoryPage(state,'current',100,{...source,loadingMore:true});assert.equal(state.index,3);
 state=paging.currentAccessDirectoryPage(state,'current',100,{...source,moreError:new LearningApiError('unavailable')});assert.equal(state.index,3);assert.equal(state.pendingCursor,null);
 state=paging.navigateAccessDirectoryPage(state,'next',100,source);state=paging.currentAccessDirectoryPage(state,'current',101,{...source,nextCursor:null});assert.equal(state.index,4);
 const previous=paging.navigateAccessDirectoryPage(state,'previous',101,{...source,nextCursor:null});assert.equal(previous.index,3);assert.equal(rows[0].source.revision,1);
 state=paging.currentAccessDirectoryPage(state,'different-query',101,source);assert.equal(state.index,0);
 for(const failure of[{...source,loading:true},{...source,loaded:false},{...source,error:new LearningApiError('unavailable')},{...source,moreError:new LearningApiError('denied')}]){state=paging.currentAccessDirectoryPage(previous,'current',101,failure);assert.equal(state.index,0);assert.equal(state.pendingCursor,null);}
});
test('an empty successful continuation does not invent another page and a no-match search keeps only real continuation',()=>{
 let state=paging.currentAccessDirectoryPage(null,'current',100,source);for(let i=0;i<3;i++)state=paging.navigateAccessDirectoryPage(state,'next',100,source);state=paging.navigateAccessDirectoryPage(state,'next',100,source);
 state=paging.currentAccessDirectoryPage(state,'current',100,{...source,nextCursor:null});assert.equal(state.index,3);assert.equal(state.pendingCursor,null);assert.equal(paging.navigateAccessDirectoryPage(state,'next',100,{...source,nextCursor:null}),state);
 state=paging.currentAccessDirectoryPage(state,'search-no-match',0,source);assert.equal(state.index,0);state=paging.navigateAccessDirectoryPage(state,'next',0,source);assert.equal(state.pendingCursor,source.nextCursor);state=paging.currentAccessDirectoryPage(state,'search-no-match',0,{...source,nextCursor:null});assert.equal(state.index,0);assert.equal(state.pendingCursor,null);
});
test('same current source denial survives a search change and cannot expose page navigation until a fresh frame',()=>{
 const denied=paging.currentAccessDirectoryPage(null,'person:',100,{...source,moreError:new LearningApiError('denied')});
 const changedSearch=paging.currentAccessDirectoryPage(denied,'person:Current learner',100,source);assert.equal(changedSearch.denied?.kind,'denied');assert.equal(paging.navigateAccessDirectoryPage(changedSearch,'next',100,source),changedSearch);
 const fresh=paging.currentAccessDirectoryPage(changedSearch,'fresh:',100,{...source,context:'fresh-private-frame'});assert.equal(fresh.denied,null);
 const html=renderToStaticMarkup(createElement(AccessDirectory,{locale:'ar',kind:'person',rows,selectedId:'source-0',query:'',locked:true,statusLabel:()=> 'Active',onKind(){},onQuery(){},onSelect(){},source}));
 assert.match(html,/السابق|التالي/);assert.equal((html.match(/<li/g)??[]).length,25);assert.doesNotMatch(html,/current-private-frame|source-0/);assert.match(html,/aria-current="true"/);
});
