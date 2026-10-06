import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLearningResource } from '../resource-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
test('learning document metadata preserves exact resource revision and safe readable filename',()=>{const id='00000000-0000-4000-8000-000000000001';const resource={id,revisionId:id,revision:1,courseId:id,targetKind:'lesson',targetId:id,title:'Checking worksheet',sequence:1,state:'PUBLISHED',assetId:id,name:'ورقة التحقق.pdf',contentType:'application/pdf',byteSize:120,sha256:'a'.repeat(64),assetState:'AVAILABLE',createdAt:'2026-10-01T00:00:00Z'};assert.equal(parseLearningResource(resource).name,resource.name);assert.throws(()=>parseLearningResource({...resource,name:'../secret'}),LearningApiError);assert.throws(()=>parseLearningResource({...resource,revision:0}),LearningApiError);assert.throws(()=>parseLearningResource({...resource,objectPath:'private/secret'}),LearningApiError);});
