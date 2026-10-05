import assert from 'node:assert/strict';
import test from 'node:test';
import { markingNavigationLocked } from '../marking-navigation-model.ts';

test('every currently mounted marking action guards original source navigation',()=>{
 for(const path of ['/v1/submissions/source/results','/v1/submissions/source/closed-result','/v1/submissions/source/return','/v1/submissions/source/close','/v1/results/result/release','/v1/assessments/task/reference']) {
  assert.equal(markingNavigationLocked([{key:'original',path,body:{}}]),true,path);
 }
});
test('reads and unrelated actions do not lock marking navigation',()=>{
 for(const path of ['/v1/submissions/source/history','/v1/results/result/source','/v1/assessments/task/academic-reference','/v1/community/posts','/v1/submissions/source/closed-results']) {
  assert.equal(markingNavigationLocked([{key:'other',path,body:{}}]),false,path);
 }
 assert.equal(markingNavigationLocked([]),false);
});
