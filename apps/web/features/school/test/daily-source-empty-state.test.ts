import assert from 'node:assert/strict';
import { test } from 'node:test';
import React,{createElement} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { SchoolDaily, type DailySource } from '../components/daily.tsx';
import { schoolEn,schoolAr } from '../messages.ts';
import { schoolDayEn,schoolDayAr } from '../day-messages.ts';
import { schoolDailySourceState } from '../components/daily.tsx';
import { schoolDaySourceState } from '../components/school-day-records.tsx';

Object.assign(globalThis,{React});
const source=(patch:Partial<DailySource>={}):DailySource=>({loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){},...patch});
test('a current empty date requires a complete terminal source while a continuation remains partial',()=>{for(const patch of[{loaded:false},{loading:true},{loadingMore:true},{nextCursor:'current-cursor'},{moreError:new Error('current failure')}]){assert.notEqual(schoolDailySourceState(source(patch as Partial<DailySource>)),'complete');assert.notEqual(schoolDaySourceState({...source(patch as Partial<DailySource>)}),'complete');}assert.equal(schoolDailySourceState(source()),'complete');assert.equal(schoolDaySourceState(source()),'complete');assert.equal(schoolDaySourceState(undefined),'unknown');});
test('staff filtered zero periods and partial daily pages preserve date context without false no-record claims in both languages',()=>{for(const locale of['en','ar']as const){const t=locale==='ar'?schoolAr:schoolEn,d=locale==='ar'?schoolDayAr:schoolDayEn,s=source({nextCursor:'a0000000-0000-4000-8000-000000000001'});const html=renderToStaticMarkup(createElement(Providers,{initialLocale:locale,config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(SchoolDaily,{attendance:[],timetable:[],calendar:[],periods:[{id:'period',name:'Different school period',startsOn:'2026-11-01',endsOn:'2026-11-30'}],terms:[],classes:[],subjects:[],people:[],canAdmin:false,canAttend:false,onChanged(){},selectedClass:'',day:'2026-10-06',onDayChange(){},onClassChange(){},sources:{attendance:s,timetable:s,calendar:s,periods:source(),terms:source(),classes:source(),subjects:source(),people:source()}})}));assert.ok(html.includes(d.noApplicablePeriod));assert.ok(!html.includes(t.dailyNoAttendance));assert.ok(!html.includes(t.dailyNoTimetable));assert.ok(!html.includes(t.dailyNoEvents));assert.ok(html.includes(t.dailyPartial));assert.ok(html.includes('value="2026-10-06"'));}});
