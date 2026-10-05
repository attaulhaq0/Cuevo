import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Providers} from '../../../shared/session/providers.tsx';
import {LearningApiError} from '../../../shared/api/client.ts';
import * as goals from '../components/goal-records.tsx';

function render(query:Record<string,unknown>,locale:'en'|'ar'='en'){
 const Component=(goals as unknown as {LearnerGoalRecords:React.ComponentType<Record<string,unknown>>}).LearnerGoalRecords;
 assert.equal(typeof Component,'function');
 Object.assign(globalThis,{React});
 return renderToStaticMarkup(createElement(Providers,{initialLocale:locale,config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(Component,{query,editing:false,student:true,locale,children:createElement('p',null,'Private goal record')})}));
}
const query={data:[{id:'goal'}],loading:false,loadingMore:false,loaded:true,error:null,moreError:null,nextCursor:null,loadMore(){}};
test('initial denied and unavailable goal reads remain visible outside closed record history',()=>{
 for(const kind of ['denied','unavailable']as const){
  const html=render({...query,data:[],loaded:false,error:new LearningApiError(kind)});
  assert.match(html,/role="alert"/);assert.doesNotMatch(html,/<details|Private goal record|No goals are recorded/);
 }
});
test('loading and confirmed empty are visible without implying an unloaded empty state',()=>{
 const loading=render({...query,data:[],loaded:false,loading:true});assert.match(loading,/Loading goals/);assert.doesNotMatch(loading,/<details|No goals are recorded/);
 const unloaded=render({...query,data:[],loaded:false});assert.doesNotMatch(unloaded,/No goals are recorded|Private goal record/);
 const empty=render({...query,data:[]});assert.match(empty,/No goals are recorded/);assert.doesNotMatch(empty,/<details/);
 assert.match(empty,/data-state="empty"/); assert.doesNotMatch(empty,/development-empty/);
 const partial=render({...query,data:[],nextCursor:'next'});assert.match(partial,/data-state="review"/);assert.doesNotMatch(partial,/data-state="empty"/);
});
test('loaded history can be collapsed while continuation and its failure remain outside it',()=>{
 const html=render({...query,nextCursor:'next'});assert.match(html,/<details class="development-goal-records"><summary>/);assert.ok(html.indexOf('Load more')>html.indexOf('</details>'));
 const failure=render({...query,nextCursor:'next',moreError:new LearningApiError('denied')});assert.match(failure,/role="alert"/);assert.doesNotMatch(failure,/Private goal record|<details/);
});

test('a zero-row goal continuation is one partial state without a no-goals title or empty action',()=>{
 for(const locale of ['en','ar']as const){const html=render({...query,data:[],nextCursor:'next'},locale);assert.match(html,/data-state="review"/);assert.doesNotMatch(html,/No goals are recorded|لم تُسجّل أهداف|Choose a current course and one manageable|اختر مقررًا حاليًا وخطوة بسيطة/);const partial=locale==='en'?'More goals are available. This is a partial list.':'تتوافر أهداف إضافية. هذه قائمة جزئية.';assert.equal(html.split(partial).length-1,1);assert.match(html,/data-page-cursor="next"/);}
});
test('continuing without a cursor does not fabricate empty goals or the existence of another page',()=>{
 const html=render({...query,data:[],loadingMore:true});assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/No goals are recorded|More goals are available|data-state="empty"/);
});
