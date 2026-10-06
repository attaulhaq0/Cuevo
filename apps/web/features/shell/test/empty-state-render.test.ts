import assert from 'node:assert/strict';
import test from 'node:test';
import React, {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getDictionary} from '../../../shared/i18n/locale.ts';
import type {Membership} from '../../../shared/session/membership.ts';
Object.assign(globalThis,{React});
const {WorkspaceCommandResults}=await import('../components/workspace-command-navigation.tsx');
const {WorkspaceAccessView}=await import('../components/workspace-access.tsx');
for(const locale of ['en','ar'] as const) {
 test(`${locale} empty workspace search never invents a destination or internal label`,()=>{
  const html=renderToStaticMarkup(createElement(WorkspaceCommandResults,{navigation:[],selectedId:'',locale,query:'',onSelect(){throw Error('No destination can dispatch')}}));assert.match(html,/data-state="empty"/);assert.match(html,/role="status"/);assert.doesNotMatch(html,/<button/);
 });
 test(`${locale} all five roles show current unconfigured access using one state card`,()=>{
  for(const role of ['student','teacher','coordinator','parent','admin'] as const){const membership:Membership={role,schoolId:'school',userId:'person',membershipId:'membership',displayName:'Current person',school:{id:'school',name:'Current school'},entitlements:[]};const html=renderToStaticMarkup(createElement(WorkspaceAccessView,{membership,onRefresh(){},locale,dictionary:getDictionary(locale)}));assert.match(html,/data-state="unknown"/);assert.doesNotMatch(html,/source-codes|service_role|data-state="empty"/);assert.equal((html.match(/<button/g)??[]).length,1);}
 });
}
