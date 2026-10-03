import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {coordinatorClassChoices,currentClassSummary,currentCoordinatorClasses,parseCurrentClassSummary} from '../model.ts';
import { CoordinatorClassDirectoryRow } from '../components/coordinator-class-directory.tsx';
import { LearningApiError } from '../../../shared/api/client.ts';
const id = (n: number) => `c2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = { learnerId:id(3),learnerName:'Alex Taylor',academic:{numericCount:0,rubricCount:0,sources:[],moreSources:false},observed:{practice:{count:null,observationIds:[],moreSourceIds:false},revision:{count:null,observationIds:[],moreSourceIds:false},reflection:{count:null,observationIds:[],moreSourceIds:false}},support:{assignedCount:0,completedCount:0,measuredCount:0,interventionIds:[]},outcomes:{improvedCount:0,noMeaningfulChangeCount:0,inconclusiveCount:0,measurementIds:[]}};
const summary = { schoolId:id(1),classId:id(2),generatedAt:'2026-10-04T09:00:00Z',scope:'CURRENT_CLASS_PAGE',coverage:'NOT_ESTABLISHED',observationCoverage:'RECORDED_ONLY',windowStart:null,windowEnd:null,items:[row],nextCursor:id(4) };
test('class source reading rejects wrong school, class and malformed bounded source counts',()=>{
 assert.equal(typeof parseCurrentClassSummary,'function');
 assert.equal(parseCurrentClassSummary(summary,id(1),id(2)).nextCursor,id(4));
 assert.throws(()=>parseCurrentClassSummary(summary,id(9),id(2)),LearningApiError);
 assert.throws(()=>parseCurrentClassSummary(summary,id(1),id(9)),LearningApiError);
 assert.throws(()=>parseCurrentClassSummary({...summary,items:[{...row,observed:{...row.observed,practice:{count:null,observationIds:[id(6)],moreSourceIds:false}}}]},id(1),id(2)),LearningApiError);
});
test('Coordinator selection never uses preceding class source after pending refresh, denial or scope change',()=>{
 assert.equal(typeof currentClassSummary,'function');
 const source={scope:'school:actor:class:token1:refresh0',value:parseCurrentClassSummary(summary,id(1),id(2))};
 assert.equal(currentClassSummary(source,source.scope,false,false),source.value);
 assert.equal(currentClassSummary(source,'school:actor:class:token2:refresh0',false,false),null);
 assert.equal(currentClassSummary(source,source.scope,true,false),null);
 assert.equal(currentClassSummary(source,source.scope,false,true),null);
});
test('Coordinator class choices require complete current pages and distinct human context',()=>{
 assert.equal(typeof coordinatorClassChoices,'function');
 const rows=[{id:id(1),name:'Cedar',yearGroupName:'Year six',academicYearName:'2026–2027'},{id:id(2),name:'Cedar',yearGroupName:'Year seven',academicYearName:'2026–2027'}];
 assert.deepEqual(coordinatorClassChoices(rows,false,'Unavailable').map(item=>item.requiresReview),[true,true]);
 assert.deepEqual(coordinatorClassChoices(rows,true,'Unavailable').map(item=>item.requiresReview),[false,false]);
 assert.equal(coordinatorClassChoices([rows[0],{...rows[0],id:id(2)}],true,'Unavailable')[0].requiresReview,true);
 assert.equal(coordinatorClassChoices([{id:id(2),name:' '}],true,'Unavailable')[0].label,'Unavailable');
});
test('Coordinator class choices cannot use a preceding actor token or refresh metadata envelope',()=>{
 assert.equal(typeof currentCoordinatorClasses,'function');const rows=[{id:id(2),name:'Cedar',scope:'actor:token1:refresh0'}];
 assert.equal(currentCoordinatorClasses!(rows,'actor:token1:refresh0')[0].name,'Cedar');
 assert.deepEqual(currentCoordinatorClasses!(rows,'actor:token2:refresh0'),[]);
 assert.deepEqual(currentCoordinatorClasses!(rows,'actor:token1:refresh1'),[]);
 assert.deepEqual(currentCoordinatorClasses!([{id:id(2),name:'Cedar'}],'actor:token1:refresh0'),[]);
});
function render(selected:boolean){const previous=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{configurable:true,value:React});try{return renderToStaticMarkup(createElement(CoordinatorClassDirectoryRow,{item:row,locale:'en',selected,onReview(){},onSources(){},sourcesOpen:false,children:null}));}finally{if(previous)Object.defineProperty(globalThis,'React',previous);else Reflect.deleteProperty(globalThis,'React');}}
test('Coordinator directory shows one named choice without every observation/support/outcome field',()=>{
 const html=render(false);assert.ok(html.includes('Alex Taylor'));assert.ok(html.includes('Released numeric records'));assert.ok(html.includes('Released rubric records'));assert.ok(html.includes('Review this learner'));assert.ok(html.includes('Show class record sources'));
 assert.doesNotMatch(html,/Observation window|Completed —|Improved observed outcomes|No meaningful observed change/);assert.doesNotMatch(html,/>c2000000-/);
});
test('selected Coordinator count groups keep unknown observations separate from source-backed zero records',()=>{
 const html=render(true);assert.match(html,/Learning observations/);assert.match(html,/Not yet measured/);assert.match(html,/Outcome measurement/);assert.match(html,/No meaningful observed change/);assert.match(html,/Support/);assert.doesNotMatch(html,/composite|intelligence/i);
});
