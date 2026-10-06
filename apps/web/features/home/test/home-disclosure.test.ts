import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
Object.assign(globalThis,{React});
const {HomeDisclosure}=await import('../components/home-disclosure.tsx');
test('empty secondary context is progressive but keeps its honest state and owner callback',()=>{let calls=0;const html=renderToStaticMarkup(createElement(HomeDisclosure,{title:'School dates',compact:true,className:'school-context',children:[createElement('p',{key:'state'},'Current dates are unavailable.'),createElement('button',{key:'action',onClick(){calls++;}},'Open school dates')]}));assert.match(html,/<details class="school-context home-secondary-disclosure"><summary><h2>School dates<\/h2><\/summary>/);assert.match(html,/Current dates are unavailable|Open school dates/);assert.equal(calls,0);});
test('meaningful records retain their reading section rather than becoming an empty disclosure',()=>{const html=renderToStaticMarkup(createElement(HomeDisclosure,{title:'Current feedback',compact:false,className:'feedback',children:[createElement('h2',{key:'title'},'Current feedback'),createElement('p',{key:'source'},'Native source 0 / 10')]}));assert.match(html,/<section class="feedback">/);assert.doesNotMatch(html,/<details/);assert.match(html,/Native source 0 \/ 10/);});
