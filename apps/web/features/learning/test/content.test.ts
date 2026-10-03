import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLearningContent } from '../content-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001';
test('content read metadata cannot present a draft as an inferred published revision',()=>{
 const row={id,courseId:id,resource:'lesson',sourceId:id,revision:2,title:'School lesson',content:'Exact content',kind:null,assessmentId:null,state:'DRAFT',createdAt:'2026-10-02T00:00:00Z',publishedRevision:1,draftRevision:2};assert.equal(parseLearningContent(row).state,'DRAFT');assert.equal(parseLearningContent(row).publishedRevision,1);assert.throws(()=>parseLearningContent({...row,draftRevision:0}),LearningApiError);assert.throws(()=>parseLearningContent({...row,title:''}),LearningApiError);
});
