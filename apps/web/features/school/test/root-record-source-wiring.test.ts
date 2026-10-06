import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {CommandJournal,LearningApiError} from '../../../shared/api/client.ts';
import {FormDrafts} from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis,{React});
type Source={data:{id:string;[key:string]:unknown}[];loaded:boolean;loading:boolean;loadingMore:boolean;error:LearningApiError|null;moreError:LearningApiError|null;nextCursor:string|null;loadMore():void};
const base:Source={data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}};
const schoolContext={school:{id:'school',name:'Current school',countryCode:'QA',languages:['en','ar']},policy:{version:1,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false},intelligence:{fixtureSchoolApproved:false,liveSchoolApproved:false,availability:'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED'}};
const fixture={app:{},sources:{}as Record<string,Source>};Object.assign(globalThis,{schoolRootSourceFixture:fixture,schoolRootContext:schoolContext});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.schoolRootSourceFixture.app}'};
 if(path.endsWith('/shared/hooks/use-api.ts'))return{format:'module',shortCircuit:true,source:'export function useApiQuery(path,parse){return{data:parse(globalThis.schoolRootContext),loading:false,error:null}}export function useApi(){return{t:{errorDenied:"Permission denied",errorUnavailable:"Unavailable",errorInvalid:"Unconfirmed",loadMore:"Load more",loadingMore:"Loading more…"}}}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(path){const f=globalThis.schoolRootSourceFixture;return f.sources[path]??{data:[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}'};
 if(path.endsWith('/shared/hooks/use-child-context.ts'))return{format:'module',shortCircuit:true,source:'export function useChildContext(){return{parent:false,child:null,children:[],query:{loaded:true,loading:false,error:null,data:[],nextCursor:null},selectChild(){}}}'};
 return next(url,context);
}});
const {SchoolWorkspace}=await import('../components/school-workspace.tsx');
function render(locale:string,source:Source){fixture.app={locale,dictionary:{roles:{}},membership:{schoolId:'school',userId:'actor',role:'admin',entitlements:['school.operations','school.context']},online:true,status:'ready',apiUrl:'',accessToken:'synthetic',accessGeneration:1,commandJournal:new CommandJournal(),formDrafts:new FormDrafts()};fixture.sources={'/v1/school/years?limit=100':source};return renderToStaticMarkup(createElement(SchoolWorkspace));}
test('the actual School root passes setup source metadata so an empty first page with a cursor stays unknown',()=>{
 for(const locale of ['en','ar']){const incomplete=render(locale,{...base,nextCursor:'later'});assert.equal((incomplete.match(/data-state="empty"/g)||[]).length,4);assert.match(incomplete,/data-state="unknown"/);assert.match(incomplete,/Load more|تحميل المزيد/);const terminal=render(locale,base);assert.equal((terminal.match(/data-state="empty"/g)||[]).length,5);assert.doesNotMatch(incomplete,/<form/);}
});
test('the actual School root preserves loading and refusal without zero-table emptiness',()=>{
 for(const locale of ['en','ar']){for(const source of [{...base,loading:true},{...base,error:new LearningApiError('denied')},{...base,moreError:new LearningApiError('unavailable')}]){const html=render(locale,source);assert.doesNotMatch(html,/data-state="empty"/);assert.match(html,/data-state="loading"|role="alert"/);}}
});
