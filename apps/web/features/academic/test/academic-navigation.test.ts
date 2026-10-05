import assert from 'node:assert/strict';
import test from 'node:test';
import { academicNavigationLocked } from '../academic-navigation-model.ts';

test('every existing Academic authoring/release/source command locks section replacement until original settlement', () => {
  for (const path of ['/v1/academic-references', '/v1/academic-references/source/approve', '/v1/rubrics', '/v1/assessments/source/reference', '/v1/assessments/source/rubric', '/v1/submissions/source/results', '/v1/submissions/source/closed-result', '/v1/submissions/source/return', '/v1/submissions/source/close', '/v1/results/source/release', '/v1/results/source/publication', '/v1/courses/source/gradebook/release']) {
    assert.equal(academicNavigationLocked([{ path, key: 'original', body: {} }]), true, path);
  }
  for (const path of ['/v1/community/posts', '/v1/school/policy', '/v1/results', '/v1/assessments/source']) assert.equal(academicNavigationLocked([{ path, key: 'other', body: {} }]), false, path);
  assert.equal(academicNavigationLocked([]), false);
});
