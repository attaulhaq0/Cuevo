import assert from'node:assert/strict';import test from'node:test';import * as model from'../model.ts';
test('technical lifecycle keeps customer readiness and historical availability explicit',()=>{
 const parse=(model as unknown as Record<string,(value:unknown)=>unknown>).parseCurriculumLifecycle;assert.equal(typeof parse,'function');
 const page={versionId:'source',state:'ACTIVE',revision:1,customerReady:false,configurationAllowed:true,retainedEvidenceAllowed:true,programmeCount:1,courseCount:1,openAssessmentCount:0,reason:'Existing technical school configuration.',history:[],nextCursor:null};assert.deepEqual(parse(page),page);assert.throws(()=>parse({...page,customerReady:true}));
});
