import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StudentTrailContext, StudentTrailAssets } from '../trail-model.ts';
import type { TeacherTrailContext } from '../teacher-trail-model.ts';
import type { ParentTrailContext } from '../parent-trail-model.ts';
import type { CoordinatorTrailContext } from '../coordinator-trail-model.ts';
import type { AdminTrailContext } from '../admin-trail-model.ts';

Object.assign(globalThis, { React });
const { StudentTrailView } = await import('../components/student-trail.tsx');
const { TeacherTrailHomeView } = await import('../components/teacher-trail-home.tsx');
const { ParentTrailHomeView } = await import('../components/parent-trail-home.tsx');
const { CoordinatorTrailHomeView } = await import('../components/coordinator-trail-home.tsx');
const { AdminTrailHomeView } = await import('../components/admin-trail-home.tsx');
const assets: StudentTrailAssets = { background:'',foxi:'',lesson:'',work:'',feedback:'',practice:'',reflect:'',grow:'',milestone:'' };
const student = ():StudentTrailContext => ({availability:'ready',displayName:null,schoolName:null,goal:null,task:null,stages:[],feedback:null,upcoming:null,recognition:{status:'unavailable',totalPoints:null,periodLabel:null,currentMilestone:null,entries:[]},classChallenge:null,help:null,companion:{visible:false,name:'Foxi'}});
const teacher = ():TeacherTrailContext => ({availability:'ready',dateLabel:null,attention:{status:'unavailable',items:[]},workspaces:[],insight:null,nextActions:[]});
const parent = ():ParentTrailContext => ({availability:'ready',child:{status:'ready',key:'current-child',name:'Current child',classLabel:null,schoolName:null},snapshot:{childKey:'current-child',status:'ready',feedback:null,portfolio:null,upcoming:[],communication:null,support:null}});
const coordinator = ():CoordinatorTrailContext => ({availability:'ready',classLabel:null,periodLabel:null,dateLabel:null,programmes:[],evidence:{status:'unavailable',coverage:'not-established',records:[],gap:{status:'unknown',count:null,basis:null}},outcome:null,review:null});
const admin = ():AdminTrailContext => ({availability:'ready',schoolName:null,environmentLabel:null,dateLabel:null,facts:[],areas:[],people:{status:'unavailable',records:[]},policies:[],governance:null,execution:null,audit:{status:'unavailable',records:[]}});

for(const locale of ['en','ar'] as const) {
 test(`${locale} Student selected-work states distinguish no work, checking and unavailable`,()=>{
  const context=student();
  for(const state of ['empty','loading','unavailable'] as const){context.portfolio={state,items:[]};const html=renderToStaticMarkup(createElement(StudentTrailView,{context,assets,locale}));assert.match(html,new RegExp(`data-state="${state}"`));assert.doesNotMatch(html,/point-total|<p[^>]*>\s*<div/);}
  context.portfolio={state:'partial',items:[]};const html=renderToStaticMarkup(createElement(StudentTrailView,{context,assets,locale}));assert.equal((html.match(locale==='en'?/Showing available selected work\./g:/تُعرض الأعمال المختارة المتاحة\./g)??[]).length,1);
 });
 test(`${locale} Teacher attention distinguishes complete empty from partial and failed source`,()=>{
  const context=teacher();
  for(const [status,kind] of [['ready','empty'],['partial','unknown'],['loading','loading'],['unavailable','unavailable']] as const){context.attention.status=status;const html=renderToStaticMarkup(createElement(TeacherTrailHomeView,{context,locale}));const queue=html.slice(html.indexOf('teacher-trail__attention'),html.indexOf('teacher-trail__workspaces'));assert.match(queue,new RegExp(`data-state="${kind}"`));assert.doesNotMatch(queue,/0 learners|100%/);}
 });
 test(`${locale} Parent child selection remains distinct from missing approved feedback`,()=>{
  const context=parent();context.child={status:'resolving'};let html=renderToStaticMarkup(createElement(ParentTrailHomeView,{context,locale}));assert.match(html,/data-state="loading"/);assert.doesNotMatch(html,/Current child|parent-trail__feedback /);
  context.child={status:'selection-required'};html=renderToStaticMarkup(createElement(ParentTrailHomeView,{context,locale}));assert.match(html,/data-state="unknown"/);
  context.child={status:'ready',key:'current-child',name:'Current child',classLabel:null,schoolName:null};html=renderToStaticMarkup(createElement(ParentTrailHomeView,{context,locale}));assert.match(html,/parent-trail__feedback [^]*?data-state="unknown"/);assert.doesNotMatch(html,/data-state="empty"/);
 });
 test(`${locale} Coordinator and Admin unavailable sources never become complete empty or zero`,()=>{
  let html=renderToStaticMarkup(createElement(CoordinatorTrailHomeView,{context:coordinator(),locale}));assert.match(html,/coordinator-trail__evidence [^]*?data-state="unavailable"/);assert.doesNotMatch(html,/0<\/strong>|100%/);
  const context=admin();html=renderToStaticMarkup(createElement(AdminTrailHomeView,{context,locale}));assert.match(html,/admin-trail__audit[^]*?data-state="unavailable"/);context.audit.status='ready';html=renderToStaticMarkup(createElement(AdminTrailHomeView,{context,locale}));assert.match(html,/admin-trail__audit[^]*?data-state="empty"/);
 });
 test(`${locale} denied Home states retain one recovery and withhold protected content`,()=>{
  const context=teacher();context.availability='denied';context.dateLabel='Private date';context.recovery={label:'Retry current access',pending:true,onClick(){throw Error('Rendering cannot dispatch recovery')}};
  const html=renderToStaticMarkup(createElement(TeacherTrailHomeView,{context,locale}));assert.match(html,/data-state="denied"/);assert.equal((html.match(/Retry current access/g)??[]).length,1);assert.match(html,/disabled="" aria-busy="true"/);assert.doesNotMatch(html,/Private date|teacher-trail__attention/);
 });
}
