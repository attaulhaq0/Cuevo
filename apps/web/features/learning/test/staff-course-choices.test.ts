import assert from 'node:assert/strict';
import test from 'node:test';
import * as learning from '../model.ts';
const course={id:'course',classId:'class',subjectId:'subject',title:'School checking',description:'',status:'PUBLISHED',createdAt:'2026-10-03T09:00:00Z'};
const classes=[{id:'class',name:'Cedar',yearGroupName:'Year 4',academicYearName:'2026–2027'},{id:'other-class',name:'Maple',yearGroupName:'Year 4',academicYearName:'2026–2027'}];const subjects=[{id:'subject',name:'Reasoning'}];
test('staff course choices distinguish matching titles through exact authorized class year and subject context',()=>{
 assert.equal(typeof learning.staffCourseChoices,'function');const rows=learning.staffCourseChoices([course,{...course,id:'second',classId:'other-class'}],classes,subjects,true,'Context unavailable');
 assert.deepEqual(rows.map(row=>row.requiresReview),[false,false]);assert.match(rows[0].label,/Cedar · Year 4 · 2026–2027 · Reasoning/);assert.match(rows[1].label,/Maple/);assert.equal(rows.some(row=>row.label.includes('other-class')),false);
});
test('incomplete missing or indistinguishable human course context cannot authorize a new task selection',()=>{
 assert.equal(typeof learning.staffCourseChoices,'function');assert.equal(learning.staffCourseChoices([course],classes,subjects,false,'Context unavailable')[0].requiresReview,true);
 assert.equal(learning.staffCourseChoices([course],[],subjects,true,'Context unavailable')[0].requiresReview,true);
 const duplicate=learning.staffCourseChoices([course,{...course,id:'duplicate'}],classes,subjects,true,'Context unavailable');assert.equal(duplicate.every(row=>row.requiresReview),true);assert.equal(duplicate.some(row=>row.label.includes('duplicate')),false);
});
test('rubric choices retain title and version while requiring review for identical context',()=>{
 assert.equal(typeof learning.staffRubricChoices,'function');const choices=learning.staffRubricChoices([{id:'one',title:'Checking rubric',version:'school-1'},{id:'two',title:'Checking rubric',version:'school-2'},{id:'three',title:'Checking rubric',version:'school-2'}],true,'Unavailable');assert.deepEqual(choices.map(row=>row.requiresReview),[false,true,true]);assert.equal(choices[0].label,'Checking rubric · school-1');
});
