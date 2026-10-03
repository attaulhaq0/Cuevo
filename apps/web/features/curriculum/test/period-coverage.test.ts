import assert from'node:assert/strict';import test from'node:test';
import * as model from'../model.ts';
test('declared period coverage keeps unknown denominator separate from recorded zero',()=>{
 const parse=(model as unknown as Record<string,(value:unknown)=>unknown>).parsePeriodCoverage;assert.equal(typeof parse,'function');
 const id='40000000-0000-4000-8000-000000000001';const page={courseId:id,courseTitle:'School course',className:'Cedar',periodId:id,periodName:'Autumn review',startsOn:'2026-10-01',endsOn:'2026-10-31',periodRevision:1,planStatus:'NOT_ESTABLISHED',plannedTotal:null,learnerTotal:10,items:[],nextCursor:null,limitation:'DECLARED_PLAN_NOT_OFFICIAL_CURRICULUM_COVERAGE'};
 assert.deepEqual(parse(page),page);assert.throws(()=>parse({...page,plannedTotal:0}));
});
