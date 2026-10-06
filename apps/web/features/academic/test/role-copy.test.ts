import assert from 'node:assert/strict';
import test from 'node:test';
import { academicWorkspaceBody } from '../copy.ts';
test('learner and parent academic introductions describe permitted reading rather than release authority',()=>{
 assert.equal(academicWorkspaceBody('student','en'),'Read your released results, teacher feedback and the work behind them.');
 assert.equal(academicWorkspaceBody('parent','en'),'Read your child’s released results, teacher feedback and approved evidence.');
 assert.ok(!academicWorkspaceBody('parent','ar').includes('إصدار'));
 assert.ok(academicWorkspaceBody('teacher','en').includes('Review marking'));
 assert.ok(!academicWorkspaceBody('coordinator','en').includes('release native'));
});
