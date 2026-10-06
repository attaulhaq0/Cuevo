import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {CommandJournal,LearningApiError} from '../../../shared/api/client.ts';
import {FormDrafts} from '../../../shared/session/form-drafts.ts';
Object.assign(globalThis,{React});
const fixture={locale:'en',dictionary:{roles:{}},membership:{schoolId:'school',userId:'actor'},formDrafts:new FormDrafts(),commandJournal:new CommandJournal()};Object.assign(globalThis,{schoolRecordsFixture:fixture});
registerHooks({load(url,context,next){if(url.replaceAll('\\','/').endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.schoolRecordsFixture}'};return next(url,context);}});
const {SchoolRecords}=await import('../components/records.tsx');
const {SchoolSetup}=await import('../components/setup.tsx');
const {SchoolDaily}=await import('../components/daily.tsx');
const base={loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null};
const context={school:{id:'school',name:'Current school',countryCode:'QA',languages:['en','ar']as('en'|'ar')[]},policy:{version:1,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false as const,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false},intelligence:{fixtureSchoolApproved:false,liveSchoolApproved:false,availability:'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' as const}};
test('zero School records claim empty only from a confirmed complete source in English and Arabic',()=>{
 for(const locale of ['en','ar']){fixture.locale=locale;for(const source of [undefined,{...base,loaded:false},{...base,nextCursor:'later'},{...base,loadingMore:true},{...base,moreError:new LearningApiError('unavailable')}]){const html=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current years',rows:[],columns:[{key:'name',label:'Name'}],source}));assert.doesNotMatch(html,/data-state="empty"/);assert.match(html,/data-state="unknown"|data-state="review"/);}
 const terminal=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current years',rows:[],columns:[],source:base}));assert.match(terminal,/data-state="empty"/);
 const loading=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current years',rows:[],columns:[],source:{...base,loading:true}}));assert.match(loading,/data-state="loading"/);assert.doesNotMatch(loading,/data-state="empty"/);
 }
});
test('School record refusal remains an error and populated native zero false and human names remain unchanged',()=>{
 fixture.locale='en';const error=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current years',rows:[],columns:[],source:{...base,error:new LearningApiError('denied')}}));assert.match(error,/role="alert"/);assert.doesNotMatch(error,/data-state="empty"/);
 const html=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current class',rows:[{id:'private-id',classId:'private-class',className:'Cedar',ordinal:0,enabled:false}],columns:[{key:'classId',label:'Class'},{key:'ordinal',label:'Order'},{key:'enabled',label:'Enabled'}],source:{...base,nextCursor:'later'}}));assert.match(html,/>Cedar</);assert.match(html,/>0</);assert.match(html,/>Not enabled</);assert.doesNotMatch(html,/private-class|data-state="empty"/);
});
test('SchoolSetup passes each existing source certainty into its own zero table',()=>{
 for(const locale of ['en','ar']){fixture.locale=locale;for(const key of ['years','terms','groups','classes','subjects']){const sources={years:base,terms:base,groups:base,classes:base,subjects:base,[key]:{...base,nextCursor:'later'}};const html=renderToStaticMarkup(createElement(SchoolSetup,{context,years:[],terms:[],groups:[],classes:[],subjects:[],canManage:false,onChanged(){},sources}));assert.equal((html.match(/data-state="empty"/g)||[]).length,4);assert.equal((html.match(/data-state="unknown"|data-state="review"/g)||[]).length,1);assert.doesNotMatch(html,/<form/);}}
});
test('SchoolDaily passes attendance timetable calendar and period certainty to its retained source tables',()=>{
 const current={...base,loadMore(){}};fixture.locale='en';for(const key of['attendance','timetable','calendar','periods']){const sources={attendance:current,timetable:current,calendar:current,periods:current,terms:current,classes:current,subjects:current,people:current,[key]:{...current,loaded:false}};const html=renderToStaticMarkup(createElement(SchoolDaily,{attendance:[],timetable:[],calendar:[],periods:[],terms:[],classes:[],subjects:[],people:[],canAdmin:false,canAttend:false,onChanged(){},day:'',onDayChange(){},onClassChange(){},selectedClass:'',sources}));const tables=html.match(/<section class="school-section"[\s\S]*?<\/section>/g)||[];assert.equal(tables.length,4);assert.equal(tables.filter(table=>table.includes('data-state="empty"')).length,3);assert.equal(tables.filter(table=>table.includes('data-state="unknown"')).length,1);}
});
test('omitted or unknown source-readiness fields cannot establish terminal empty School records',()=>{
 for(const locale of['en','ar']){fixture.locale=locale;for(const key of['loaded','loading','loadingMore','error','moreError','nextCursor']){for(const mode of['omit','undefined']){const source={...base}as Record<string,unknown>;if(mode==='omit')delete source[key];else source[key]=undefined;const html=renderToStaticMarkup(createElement(SchoolRecords,{title:'Current source',rows:[],columns:[],source:source as typeof base}));assert.doesNotMatch(html,/data-state="empty"/);assert.match(html,/data-state="unknown"/);}}}
});
