import assert from 'node:assert/strict';
import test from 'node:test';
import * as learning from '../model.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const source={id:'submission-one',revision:1,status:'SUBMITTED'};
test('unsent submission editor intent reopens only its exact current source revision',()=>{
  assert.equal(typeof learning.currentTeacherSubmissionEditor,'function');
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:1,action:'return'},source),'return');
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:1,action:'close'},source),'close');
  assert.equal(learning.currentTeacherSubmissionEditor({id:'submission-two',revision:1,action:'return'},source),null);
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:2,action:'return'},source),null);
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:1,action:'return'},{...source,status:'RETURNED'}),null);
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:1,action:'close'},{...source,status:'CLOSED'}),null);
  assert.equal(learning.currentTeacherSubmissionEditor({id:source.id,revision:1,action:'return'},{...source,status:'UNKNOWN'}),null);
});
test('unknown or malformed editor intent cannot expose a submission command',()=>{
  for(const value of [null,undefined,{},[],{id:source.id,revision:1,action:'grade'},{id:source.id,revision:'1',action:'return'},{id:source.id,revision:1,action:'return',authority:true}])
    assert.equal(learning.currentTeacherSubmissionEditor(value,source),null);
});
test('source-read denial clears editor intent and input only in its current actor scope',()=>{
  const drafts=new FormDrafts();
  const slot='school:teacher:/v1/submissions/submission-one/editor-intent';
  drafts.saveModel(slot,{id:source.id,revision:1,action:'return'});
  drafts.save('school:teacher:/v1/submissions/submission-one/return',{feedback:'Private unsent feedback'},{expectedRevision:1});
  drafts.saveModel('school:other:/v1/submissions/submission-one/editor-intent',{id:source.id,revision:1,action:'return'});
  drafts.clearRead('school:teacher:','/v1/submissions?limit=25');
  assert.equal(drafts.model(slot),undefined);
  assert.equal(drafts.get('school:teacher:/v1/submissions/submission-one/return'),undefined);
  assert.equal(learning.currentTeacherSubmissionEditor(drafts.model('school:other:/v1/submissions/submission-one/editor-intent'),source),'return');
});
