import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLearningContent } from '../content-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as content from '../content-model.ts';
const id='00000000-0000-4000-8000-000000000001';
test('content read metadata cannot present a draft as an inferred published revision',()=>{
 const row={id,courseId:id,resource:'lesson',sourceId:id,revision:2,title:'School lesson',content:'Exact content',kind:null,assessmentId:null,state:'DRAFT',createdAt:'2026-10-02T00:00:00Z',publishedRevision:1,draftRevision:2};assert.equal(parseLearningContent(row).state,'DRAFT');assert.equal(parseLearningContent(row).publishedRevision,1);assert.throws(()=>parseLearningContent({...row,draftRevision:0}),LearningApiError);assert.throws(()=>parseLearningContent({...row,title:''}),LearningApiError);
});

test('content preparation rejects another original source course or resource',()=>{
 assert.equal(typeof content.currentLearningContent,'function');
 const row={id,courseId:id,resource:'lesson' as const,sourceId:id,revision:2,title:'School lesson',content:'Exact content',kind:null,assessmentId:null,state:'DRAFT' as const,createdAt:'2026-10-02T00:00:00Z',publishedRevision:1,draftRevision:2};
 assert.equal(content.currentLearningContent(row,'lesson',id,id).revision,2);
 for(const changed of [{sourceId:'00000000-0000-4000-8000-000000000002'},{courseId:'00000000-0000-4000-8000-000000000002'},{resource:'activity',kind:'practice'}])assert.throws(()=>content.currentLearningContent({...row,...changed},'lesson',id,id),LearningApiError);
});

test('retirement removes new write actions but preserves deliberate history reading',()=>{
 assert.equal(typeof content.learningContentActions,'function');
 assert.deepEqual(content.learningContentActions('RETIRED'),['history']);
 assert.deepEqual(content.learningContentActions('PUBLISHED'),['edit','retire','history']);
 assert.deepEqual(content.learningContentActions('DRAFT'),['edit','publish','retire','history']);
});
