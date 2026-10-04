import assert from 'node:assert/strict';
import test from 'node:test';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoordinatorClassChooser} from '../components/coordinator-class-chooser.tsx';
function render(element:React.ReactNode){const prior=Object.getOwnPropertyDescriptor(globalThis,'React');Object.defineProperty(globalThis,'React',{value:React,configurable:true});try{return renderToStaticMarkup(element);}finally{if(prior)Object.defineProperty(globalThis,'React',prior);else Reflect.deleteProperty(globalThis,'React');}}

test('Coordinator chooser keeps current named selection and all existing row/source/page controls in one disclosure',()=>{
 const html=render(createElement(CoordinatorClassChooser,{sourceKey:'private-current-frame',selectedLearnerId:'private-learner',selectedLabel:'Lina · Cedar',label:'Current class learners',children:createElement('article',null,createElement('h3',null,'Lina'),createElement('p',null,'Native record 0 / 10'),createElement('button',null,'Show exact evidence'),createElement('button',null,'Next learner page'))}));
 assert.match(html,/<details[^>]+open/);assert.match(html,/Current class learners/);assert.match(html,/Lina · Cedar/);assert.match(html,/Native record 0 \/ 10/);assert.match(html,/Show exact evidence/);assert.match(html,/Next learner page/);
 assert.doesNotMatch(html,/private-current-frame|private-learner/);assert.equal((html.match(/<article/g)??[]).length,1);
});
test('unknown current learner selection leaves the complete chooser open without an identifier label',()=>{
 const html=render(createElement(CoordinatorClassChooser,{sourceKey:'source',selectedLearnerId:null,selectedLabel:null,label:'Choose a learner',children:createElement('p',null,'Current source records only')}));
 assert.match(html,/<details[^>]+open/);assert.match(html,/Choose a learner/);assert.match(html,/Current source records only/);assert.doesNotMatch(html,/Selected learner|private/);
});
