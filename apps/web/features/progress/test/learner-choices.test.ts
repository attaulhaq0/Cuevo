import assert from 'node:assert/strict';
import test from 'node:test';
import * as progress from '../model.ts';
const first={id:'learner',userId:'learner',displayName:'Alex Reed',role:'student',classLabels:['Cedar · Year 4 · 2026–2027']};
test('direct Progress selection uses shared current names and complete pages before a unique learner is selectable',()=>{
 assert.equal(typeof progress.progressLearnerChoices,'function');
 assert.deepEqual(progress.progressLearnerChoices([first],'Context unavailable',true),[{value:first.id,label:'Alex Reed · Cedar · Year 4 · 2026–2027',requiresReview:false}]);
 assert.equal(progress.progressLearnerChoices([first],'Context unavailable',false)[0].requiresReview,true);
});
test('matching or missing learner context stays unavailable without hiding valid distinct human choices',()=>{
 assert.equal(typeof progress.progressLearnerChoices,'function');
 const choices=progress.progressLearnerChoices([first,{...first,id:'matching',userId:'matching'},{...first,id:'missing',userId:'missing',classLabels:[]},{...first,id:'distinct',userId:'distinct',classLabels:['Maple · Year 4 · 2026–2027']}],'Context unavailable',true);
 assert.deepEqual(choices.map(row=>row.requiresReview),[true,true,true,false]);
 assert.equal(choices.some(row=>row.label.includes('matching')||row.label.includes('missing')||row.label.includes('distinct')),false);
});
