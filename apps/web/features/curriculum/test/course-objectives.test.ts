import assert from'node:assert/strict';
import test from'node:test';
import * as model from'../model.ts';
import{LearningApiError}from'../../../shared/api/client.ts';
test('course objective page keeps approval, exact hierarchy scope and human source context distinct',()=>{
 const parse=(model as unknown as Record<string,(value:unknown)=>unknown>).parseCourseObjectivePage;
 assert.equal(typeof parse,'function');
 const page={version:2,scopeStatus:'READY',courseTitle:'School mathematics',programmeName:'School primary',packVersion:'school-1',subjectName:'Mathematics',yearGroupName:'Year 1',items:[{id:'source',academicReferenceId:'approved',title:'Explain the school example',description:'Explain a checking step.',type:'objective',parentTitle:'School mathematics',approved:true,approvalReason:'Course configuration approved',version:'school-1'}],nextCursor:null};
 assert.deepEqual(parse(page),page);
 assert.throws(()=>parse({...page,scopeStatus:'OFFICIAL'}),LearningApiError);
 assert.throws(()=>parse({...page,items:[{...page.items[0],approved:false,academicReferenceId:'approved'}]}),LearningApiError);
 assert.throws(()=>parse({...page,subjectName:''}),LearningApiError);
});
