import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivitySourceReading, StudentActivityReading } from '../components/activity-reading-layout.tsx';
test('student activity shows its selected work before supplementary documents without removing either owner',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{configurable:true,value:React});
 try{const html=renderToStaticMarkup(createElement(StudentActivityReading,{work:createElement('form',{'aria-label':'Current activity reflection'},createElement('button',{type:'submit'},'Record activity')),materials:createElement('section',{'aria-label':'Published learning documents'},createElement('button',{type:'button'},'Refresh documents'))}));assert.ok(html.indexOf('Current activity reflection')<html.indexOf('Published learning documents'));assert.equal((html.match(/<form/g)??[]).length,1);assert.match(html,/Record activity/);assert.match(html,/Refresh documents/);}finally{if(previous)Object.defineProperty(globalThis,'React',previous);else Reflect.deleteProperty(globalThis,'React');}
});
test('opened linked task keeps full activity context secondary while the original selected task is primary',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{configurable:true,value:React});try{const html=renderToStaticMarkup(createElement(ActivitySourceReading,{openTask:true,title:createElement('h4',null,'Source activity title'),instructions:createElement('p',null,'Full exact source instructions'),work:createElement('form',{'aria-label':'Exact quiz work'},createElement('button',null,'Check answers')),materials:createElement('section',null,'Published source documents'),sourceLabel:'Source activity'}));assert.ok(html.indexOf('Exact quiz work')<html.indexOf('Full exact source instructions'));assert.match(html,/<details/);assert.match(html,/Source activity title/);assert.match(html,/Published source documents/);assert.equal((html.match(/<form/g)??[]).length,1);}finally{if(previous)Object.defineProperty(globalThis,'React',previous);else Reflect.deleteProperty(globalThis,'React');}
});
