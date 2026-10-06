import assert from 'node:assert/strict';
import test from 'node:test';
import { FormDrafts } from '../form-drafts.ts';

test('a confirmed earlier form consumes only its submitted draft snapshot', () => {
  const drafts = new FormDrafts(); const slot = 'school:actor:/v1/community/rooms/room/members';
  drafts.save(slot, { actorId: 'member-a', status: 'active', confirmAccessChange: true }, {});
  const submitted = drafts.get(slot);
  assert.ok(submitted);
  drafts.save(slot, { actorId: 'member-b', status: 'revoked', confirmAccessChange: true }, {});
  assert.equal(drafts.consume(slot, submitted), false);
  assert.deepEqual(drafts.get(slot)?.values, { actorId: 'member-b', status: 'revoked', confirmAccessChange: true });
  const current = drafts.get(slot); assert.ok(current);
  assert.equal(drafts.consume(slot, current), true); assert.equal(drafts.get(slot), undefined);
  drafts.save(slot, { actorId: 'member-c', status: 'active' }, {});
  assert.equal(drafts.consume(slot, undefined), false); assert.equal(drafts.get(slot)?.values.actorId, 'member-c');
});
test('working inputs preserve the source basis and clear after access loss', () => {
  const drafts = new FormDrafts();
  const values = { feedback: 'Typed feedback', approved: false };
  drafts.save('source', values, { expectedRevision: 2 });
  values.feedback = 'Changed outside the registry';
  assert.equal(drafts.get('source')?.values.feedback, 'Typed feedback');
  assert.equal(drafts.get('source')?.basis.expectedRevision, 2);
  drafts.clear(); assert.equal(drafts.get('source'), undefined);
});
test('an owner read failure clears its draft while unrelated working input remains scoped', () => {
  const drafts = new FormDrafts();
  drafts.save('school:actor:/v1/school/years', { name: 'Year draft' }, {});
  drafts.save('school:actor:/v1/portfolio/items', { reflection: 'Private input' }, {});
  drafts.clearRead('school:actor:', '/v1/school/context');
  assert.equal(drafts.get('school:actor:/v1/school/years'), undefined);
  assert.equal(drafts.get('school:actor:/v1/portfolio/items')?.values.reflection, 'Private input');
});
test('assessment draft read failure clears the semantic response key for that exact assessment', () => {
  const drafts = new FormDrafts();
  drafts.save('school:actor:assessment-response:source-a', { content: 'Private response A' }, {});
  drafts.save('school:actor:assessment-response:source-b', { content: 'Private response B' }, {});
  drafts.clearRead('school:actor:', '/v1/assessments/source-a/draft');
  assert.equal(drafts.get('school:actor:assessment-response:source-a'), undefined);
  assert.equal(drafts.get('school:actor:assessment-response:source-b')?.values.content, 'Private response B');
});
test('community owner read failure clears root and reply drafts for that room only', () => {
  const drafts = new FormDrafts();
  drafts.save('school:actor:community-post:room-a', { body: 'Root A' }, {});
  drafts.save('school:actor:community-reply:room-a:post-a', { body: 'Reply A' }, {});
  drafts.save('school:actor:community-reply:room-a:post-b', { body: 'Reply B' }, {});
  drafts.save('school:actor:community-post:room-b', { body: 'Other room' }, {});
  drafts.save('school:other:community-reply:room-a:post-a', { body: 'Other actor' }, {});
  drafts.clearRead('school:actor:', '/v1/community/rooms/room-a/posts?limit=100');
  assert.equal(drafts.get('school:actor:community-post:room-a'), undefined);
  assert.equal(drafts.get('school:actor:community-reply:room-a:post-a'), undefined);
  assert.equal(drafts.get('school:actor:community-reply:room-a:post-b'), undefined);
  assert.equal(drafts.get('school:actor:community-post:room-b')?.values.body, 'Other room');
  assert.equal(drafts.get('school:other:community-reply:room-a:post-a')?.values.body, 'Other actor');
});
test('school and recognition owner failures clear their semantic working slots in the current actor scope', () => {
  const drafts = new FormDrafts();
  drafts.save('school:actor:attendance-correction:row', { note: 'Private correction' }, { expectedRevision: 2 });
  drafts.save('school:actor:leaderboard-participation:period', { alias: 'My alias' }, {});
  drafts.save('school:other:attendance-correction:row', { note: 'Other actor' }, {});
  drafts.clearRead('school:actor:', '/v1/school/attendance?limit=100');
  assert.equal(drafts.get('school:actor:attendance-correction:row'), undefined);
  assert.equal(drafts.get('school:actor:leaderboard-participation:period')?.values.alias, 'My alias');
  drafts.clearRead('school:actor:', '/v1/development/periods?limit=100');
  assert.equal(drafts.get('school:actor:leaderboard-participation:period'), undefined);
  assert.equal(drafts.get('school:other:attendance-correction:row')?.values.note, 'Other actor');
});

test('document draft owner read failure clears only the exact actor assessment working input',()=>{
 const drafts=new FormDrafts();drafts.save('school:actor:submission-document-answer:a',{content:'Private answer A'},{expectedRevision:1});drafts.saveModel('school:actor:submission-documents:a',{responseKind:'FILE',artifacts:[{id:'file-a'}]});drafts.saveModel('school:actor:selected-document-assessment','a');drafts.save('school:actor:submission-document-answer:b',{content:'Private answer B'},{});drafts.saveModel('school:actor:submission-documents:b',{responseKind:'TEXT',artifacts:[]});drafts.save('school:other:submission-document-answer:a',{content:'Other actor A'},{});drafts.clearRead('school:actor:','/v1/assessments/a/work-draft');assert.equal(drafts.get('school:actor:submission-document-answer:a'),undefined);assert.equal(drafts.get('school:actor:submission-documents:a'),undefined);assert.equal(drafts.get('school:actor:selected-document-assessment'),undefined);assert.equal(drafts.get('school:actor:submission-document-answer:b')?.values.content,'Private answer B');assert.ok(drafts.get('school:actor:submission-documents:b'));assert.equal(drafts.get('school:other:submission-document-answer:a')?.values.content,'Other actor A');
});

test('room owner read failure clears explicit mention selection only in current room and actor',()=>{const drafts=new FormDrafts();drafts.saveModel('school:actor:community-mentions:room-a',['recipient-a']);drafts.saveModel('school:actor:community-mentions:room-b',['recipient-b']);drafts.saveModel('school:other:community-mentions:room-a',['other']);drafts.clearRead('school:actor:','/v1/community/rooms/room-a/posts?limit=100');assert.equal(drafts.model('school:actor:community-mentions:room-a'),undefined);assert.deepEqual(drafts.model('school:actor:community-mentions:room-b'),['recipient-b']);assert.deepEqual(drafts.model('school:other:community-mentions:room-a'),['other']);});

test('owner-registered planning navigation stays clean while a proposed planning change remains working input', () => {
  const drafts = new FormDrafts();
  drafts.saveModel('school:actor:period-planning-selection', { courseId: 'course', periodId: 'period' }, { workingInput: false });
  assert.equal(drafts.hasWorkingInput(), false);
  const input = 'school:actor:/v1/curriculum/courses/course/plans:period:period:intent';
  drafts.saveModel(input, { editor: { kind: 'assessment', planId: 'plan' }, assessmentId: 'assessment', assessmentVersion: 2 }, { workingInput: true });
  assert.equal(drafts.hasWorkingInput(), true);
  drafts.remove(input);
  assert.equal(drafts.hasWorkingInput(), false, 'Cancel leaves the retained navigation selection clean');
});

test('a confirmed source-matched document baseline is clean and later working edits become dirty again', () => {
  const drafts = new FormDrafts(), slot = 'school:actor:submission-documents:assessment';
  const saved = { responseKind: 'FILE', artifacts: [{ id: 'saved-asset' }] };
  drafts.saveModel(slot, saved, { workingInput: false });
  assert.deepEqual(drafts.model(slot), saved);
  assert.equal(drafts.hasWorkingInput(), false);
  drafts.saveModel(slot, { responseKind: 'FILE', artifacts: [] }, { workingInput: true });
  assert.equal(drafts.hasWorkingInput(), true, 'Removing the last saved document is still unsent work');
  drafts.saveModel(slot, { responseKind: 'FILE', artifacts: [] }, { workingInput: false });
  assert.equal(drafts.hasWorkingInput(), false);
});

test('explicit model cleanliness cannot discard retained field input or infer that blank edits are absent', () => {
  const drafts = new FormDrafts(), slot = 'school:actor:owner';
  drafts.save(slot, { reflection: '' }, { expectedRevision: 3 });
  drafts.saveModel(slot, { sourceId: 'selected' }, { workingInput: false });
  assert.equal(drafts.hasWorkingInput(), true);
  assert.deepEqual(drafts.get(slot)?.values, { reflection: '' });
  assert.equal(drafts.get(slot)?.basis.expectedRevision, 3);
});
