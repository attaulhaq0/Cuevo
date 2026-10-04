import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getDictionary} from '../../../shared/i18n/locale';
import type {Membership} from '../../../shared/session/membership';
Object.assign(globalThis,{React});
const {WorkspaceAccessView}=await import('../components/workspace-access.tsx');
const membership={school:{name:'Current school'},role:'student',entitlements:['learning','learner.state','restricted.records','unknown.source']} as Membership;
test('access labels school capabilities without presenting internal codes as permission controls',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceAccessView,{membership,onRefresh(){},locale:'en',dictionary:getDictionary('en')}));
 const primary=html.split('<details>')[0];
 assert.match(primary,/Learning progress/);assert.match(primary,/Restricted school notes/);assert.match(primary,/Feature name unavailable/);
 assert.doesNotMatch(primary,/learner\.state|restricted\.records|unknown\.source/);
 assert.doesNotMatch(html,/learner\.state|restricted\.records|unknown\.source/);assert.match(html,/Refresh access/);assert.doesNotMatch(html,/type="checkbox"/);
});

test('raw configuration is absent for customer roles and optional only for administrators',()=>{
 for(const locale of ['en','ar'] as const) for(const role of ['student','parent','teacher','coordinator','admin'] as const){
  const html=renderToStaticMarkup(createElement(WorkspaceAccessView,{membership:{...membership,role},onRefresh(){},locale,dictionary:getDictionary(locale)}));
  assert.match(html,locale==='en'?/Learning progress/:/تقدّم التعلّم/);
  if(role==='admin'){
   assert.match(html,locale==='en'?/Technical details/:/تفاصيل تقنية/);
   assert.match(html,/learner\.state/);assert.doesNotMatch(html,/<details[^>]* open/);
  }else assert.doesNotMatch(html,/workspace-access__source-codes|learner\.state|restricted\.records|unknown\.source/);
 }
});
test('Arabic access uses the same facts and localized names while unknown remains explicit',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceAccessView,{membership,onRefresh(){},locale:'ar',dictionary:getDictionary('ar')}));
 assert.match(html,/تقدّم التعلّم/);assert.match(html,/اسم الميزة غير متاح/);assert.match(html,/Current school/);
});
