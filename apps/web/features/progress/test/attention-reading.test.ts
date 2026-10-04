import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const reading = await import('../components/attention-reading.tsx').catch(()=>({} as typeof import('../components/attention-reading.tsx')));
import type { AttentionSignal } from '../model.ts';
const native:AttentionSignal={id:'signal',learnerId:'learner',type:'native_result_decline',ruleVersion:1,generatedAt:'2026-10-03T09:00:00Z',sourceEventIds:['event'],referenceId:'reference',referenceVersion:'school-v1',baselineResultId:'before',followUpResultId:'after',evidenceIds:['evidence-before','evidence-after'],baseline:{score:8,maxScore:10},followUp:{score:5,maxScore:10},difference:-3,minimumDecline:1,uncertainty:'OBSERVED_CHANGE_NOT_CAUSE'};
function render(signal:AttentionSignal,locale:'en'|'ar'='en'){const previous=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{configurable:true,value:React});try{return renderToStaticMarkup(createElement(reading.AttentionSignalReading,{signal,locale,evidenceId:null,onEvidence(){},evidence:null}));}finally{if(previous)Object.defineProperty(globalThis,'React',previous);else Reflect.deleteProperty(globalThis,'React');}}
test('Arabic native attention retains score then maximum in explicit LTR source values',()=>{
 assert.equal(typeof reading.AttentionSignalReading,'function');const html=render(native,'ar');
 const number=(value:number)=>new Intl.NumberFormat('ar').format(value);assert.equal((html.match(/dir="ltr"/g)??[]).length,2);assert.ok(html.includes(`${number(8)} / ${number(10)}`));assert.ok(html.includes(`${number(5)} / ${number(10)}`));
 assert.doesNotMatch(html,/ذكاء|دافع|شخصية/);assert.match(html,/التغير الملحوظ لا يثبت سببه/);
});
test('missing due work names actual assignments and keeps missing distinct from a zero grade',()=>{
 assert.equal(typeof reading.AttentionSignalReading,'function');const signal:AttentionSignal={id:'missing',learnerId:'learner',type:'missing_due_work',ruleVersion:1,generatedAt:native.generatedAt,sourceEventIds:[],count:1,missingAssessments:[{id:'task',title:'Explain one checking step',dueAt:'2026-10-02T09:00:00Z'}],uncertainty:'MISSING_SUBMISSION_NOT_ZERO'};
 const html=render(signal);assert.ok(html.includes('Explain one checking step'));assert.ok(html.includes('A missing submission is not a zero result.'));assert.doesNotMatch(html,/0 \/|No current|<form/);
});

test('Teacher attention places current facts before long explanation and secondary recovery controls',()=>{
 assert.equal(typeof reading.TeacherAttentionReading,'function');const previous=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{configurable:true,value:React});
 try{const html=renderToStaticMarkup(createElement(reading.TeacherAttentionReading,{locale:'en',children:createElement('p',null,'Current named missing task'),controls:createElement('button',null,'Refresh current sources')}));assert.ok(html.indexOf('Current named missing task')<html.indexOf('Refresh current sources'));assert.ok(html.indexOf('Current named missing task')<html.indexOf('These records describe'));assert.match(html,/<details/);assert.match(html,/Observed change|source|Source/);}finally{if(previous)Object.defineProperty(globalThis,'React',previous);else Reflect.deleteProperty(globalThis,'React');}
});
