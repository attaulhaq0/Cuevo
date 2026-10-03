import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenWorkspace } from '../capabilities.ts';

test('workspace capability prerequisites match complete destination source requirements', () => {
  assert.equal(canOpenWorkspace('academic', ['assessment'], 'teacher'), false);
  assert.equal(canOpenWorkspace('academic', ['learning', 'assessment', 'curriculum'], 'teacher'), true);
  assert.equal(canOpenWorkspace('improvement', ['learning'], 'teacher'), false);
  assert.equal(canOpenWorkspace('improvement', ['learning', 'assessment', 'curriculum', 'improvement'], 'teacher'), true);
  assert.equal(canOpenWorkspace('improvement', ['learning', 'assessment', 'curriculum', 'improvement'], 'parent'), false);
  assert.equal(canOpenWorkspace('progress', ['learning'], 'student'), false);
  assert.equal(canOpenWorkspace('progress', ['learning', 'assessment', 'curriculum', 'learner.state'], 'student'), true);
  assert.equal(canOpenWorkspace('school', ['school.operations'], 'parent'), true);
  for(const role of['student','parent','coordinator'])assert.equal(canOpenWorkspace('restricted',['school.operations','restricted.records'],role),false);
  assert.equal(canOpenWorkspace('restricted',['school.operations'],'admin'),false);
  assert.equal(canOpenWorkspace('restricted',['school.operations','restricted.records'],'teacher'),true);
});
