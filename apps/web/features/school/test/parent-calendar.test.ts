import assert from 'node:assert/strict';
import test from 'node:test';
import * as calendar from '../parent-calendar-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
Object.assign(globalThis, { React });
const { ParentCalendar } = await import('../components/parent-calendar.tsx');
const childId='00000000-0000-4000-8000-000000000001';
const event={id:'school-event',classId:null,title:'School reading afternoon',description:'Current school invitation.',startsAt:'2026-10-03T23:00:00+03:00',endsAt:'2026-10-05T03:00:00+03:00',revision:2,parentVisible:true,recordState:'CURRENT'};
test('calendar day selection rejects impossible dates and uses UTC month boundaries',()=>{
 assert.equal(calendar.parentCalendarDay('2026-02-30'),null);assert.equal(calendar.parentCalendarDay(''),null);assert.equal(calendar.parentCalendarDay('2026-10-03'),'2026-10-03');
 assert.equal(calendar.parentCalendarMoveMonth('2026-01-31',1),'2026-02-28');assert.equal(calendar.parentCalendarMoveMonth('2026-12-31',1),'2027-01-31');
 const days=calendar.parentCalendarMonthDays('2026-10-03');assert.equal(days.length,35);assert.equal(days[0].day,'2026-09-28');assert.equal(days.filter(day=>day.inMonth).length,31);
});
test('multi-day source events overlap UTC dates with an exclusive ending instant',()=>{
 assert.equal(calendar.parentCalendarEventsForDay([event],'2026-10-03').length,1);assert.equal(calendar.parentCalendarEventsForDay([event],'2026-10-04').length,1);assert.equal(calendar.parentCalendarEventsForDay([event],'2026-10-05').length,0);
 assert.equal(calendar.parentCalendarEventsForDay([event],'2026-02-30').length,0);
 assert.throws(()=>calendar.parentCalendarEventsForDay([{...event,startsAt:'2026-02-30T00:00:00Z'}],'2026-03-02'),LearningApiError);
 assert.throws(()=>calendar.parseParentCalendarEvent({...event,startsAt:'2026-02-30T00:00:00Z'}),LearningApiError);
});
test('school-wide source context remains separate from a selected child and withdrawn events are omitted',()=>{
 assert.equal(calendar.parentCalendarEventScope(event,{schoolWide:'School event',unavailable:'Class unavailable'}),'School event');
 assert.equal(calendar.parentCalendarEventScope({...event,classId:'class',className:'Cedar'},{schoolWide:'School event',unavailable:'Class unavailable'}),'Cedar');
 assert.equal(calendar.parentCalendarEventsForDay([{...event,recordState:'CANCELLED'},{...event,id:'private',parentVisible:false}],'2026-10-03').length,0);
});
test('selected event stays bound to the current child exact event revision and selected date',()=>{
 const selection=calendar.parentCalendarEventSelection(childId,event);assert.equal(calendar.currentParentCalendarEvent(selection,childId,[event],'2026-10-04')?.id,event.id);
 assert.equal(calendar.currentParentCalendarEvent(selection,'another-child',[event],'2026-10-04'),null);assert.equal(calendar.currentParentCalendarEvent(selection,childId,[{...event,revision:3}],'2026-10-04'),null);
 assert.equal(calendar.currentParentCalendarEvent(selection,childId,[event],'2026-10-05'),null);assert.equal(calendar.currentParentCalendarEvent(selection,childId,[],'2026-10-04'),null);
 assert.equal(calendar.currentParentCalendarEvent(selection,childId,[event,event],'2026-10-04'),null);
});
test('an empty partial or failed calendar date never establishes no school events',()=>{
 assert.equal(calendar.parentCalendarDateState({loaded:true,loading:false,error:null,moreError:null,nextCursor:'later'},[],'2026-10-03'),'partial-empty');
 assert.equal(calendar.parentCalendarDateState({loaded:true,loading:false,error:null,moreError:null,nextCursor:null},[],'2026-10-03'),'empty');
 assert.equal(calendar.parentCalendarDateState({loaded:true,loading:true,error:null,moreError:null,nextCursor:null},[event],'2026-10-03'),'loading');
 assert.equal(calendar.parentCalendarDateState({loaded:true,loading:false,error:new LearningApiError('denied'),moreError:null,nextCursor:null},[event],'2026-10-03'),'unavailable');
 assert.equal(calendar.parentCalendarDateState({loaded:true,loading:false,error:null,moreError:new LearningApiError('unavailable'),nextCursor:null},[],'2026-10-03'),'partial-empty');
});
test('calendar date labels distinguish known loaded counts from unknown and incomplete sources',()=>{
 const ready={loaded:true,loading:false,error:null,moreError:null,nextCursor:null};assert.deepEqual(calendar.parentCalendarDayEvidence(ready,[],'2026-10-03'),{count:0,partial:false});
 for(const patch of[{loading:true},{loaded:false},{error:new LearningApiError('unavailable')}])assert.deepEqual(calendar.parentCalendarDayEvidence({...ready,...patch},[event],'2026-10-03'),{count:null,partial:true});
 assert.deepEqual(calendar.parentCalendarDayEvidence({...ready,nextCursor:'later'},[event],'2026-10-03'),{count:1,partial:true});
 assert.deepEqual(calendar.parentCalendarDayEvidence({...ready,moreError:new LearningApiError('unavailable')},[],'2026-10-03'),{count:0,partial:true});
});
test('denied continuation removes private event and daily-source authority while unavailable continuation remains partial',()=>{
 const ready={loaded:true,loading:false,error:null,moreError:null,nextCursor:'later'};
 for(const kind of ['denied','unauthorized'] as const){const denied={...ready,moreError:new LearningApiError(kind)};assert.equal(calendar.parentCalendarSourceDenied(denied),true);assert.equal(calendar.parentCalendarDateState(denied,[event],'2026-10-03'),'unavailable');assert.deepEqual(calendar.parentCalendarDayEvidence(denied,[event],'2026-10-03'),{count:null,partial:true});}
 const unavailable={...ready,moreError:new LearningApiError('unavailable')};assert.equal(calendar.parentCalendarSourceDenied(unavailable),false);assert.equal(calendar.parentCalendarDateState(unavailable,[event],'2026-10-03'),'events');assert.deepEqual(calendar.parentCalendarDayEvidence(unavailable,[event],'2026-10-03'),{count:1,partial:true});
});
test('one parent reader exposes UTC source context and partial-state paging without invented event facts or writes',()=>{
 const source={loaded:true,loading:false,error:null,moreError:null,nextCursor:'later'};
 const html=renderToStaticMarkup(createElement(ParentCalendar,{childId,locale:'en',events:[event],day:'2026-10-04',onDayChange(){},source}));
 assert.match(html,/School reading afternoon/);assert.match(html,/Event dates and times are shown in UTC/);assert.match(html,/School event/);assert.match(html,/Previous month/);assert.match(html,/More records|loaded shared records/);
 assert.doesNotMatch(html,/Create event|Learning review|Portfolio|teacher|room|school-event/);
 const empty=renderToStaticMarkup(createElement(ParentCalendar,{childId,locale:'ar',events:[],day:'2026-10-04',onDayChange(){},source}));assert.match(empty,/الصفحة المحمّلة/);
});
