import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../client.ts';

test('a late actor response cannot remove a replacement command at the same endpoint', () => {
  const journal = new CommandJournal();
  const prior = journal.prepare('/v1/assessments', '/v1/assessments', { title: 'Prior actor task' });
  journal.clear();
  const current = journal.prepare('/v1/assessments', '/v1/assessments', { title: 'Current actor task' });
  journal.confirm('/v1/assessments', prior.key);
  assert.equal(journal.get('/v1/assessments')?.key, current.key);
  assert.deepEqual(journal.get('/v1/assessments')?.body, { title: 'Current actor task' });
  journal.confirm('/v1/assessments', current.key);
  assert.equal(journal.get('/v1/assessments'), undefined);
});

test('a late definitive failure cannot erase the original-key retry for a newer request', () => {
  const journal = new CommandJournal();
  const rejected = journal.prepare('mark', '/v1/submissions/source/results', { score: 3 });
  journal.confirm('mark', rejected.key);
  const newer = journal.prepare('mark', '/v1/submissions/source/results', { score: 4 });
  journal.confirm('mark', rejected.key);
  assert.equal(journal.prepare('mark', newer.path, { score: 4 }).key, newer.key);
});

test('confirmed receipt notifies remounted subscribers while a replacement command retains its key', () => {
  const journal = new CommandJournal(); const versions: number[] = [];
  const unsubscribe = journal.subscribe(() => versions.push(journal.getSnapshot()));
  const first = journal.prepare('reaction', '/v1/community/posts/source/reactions', { reaction: 'HELPFUL', active: true });
  assert.deepEqual(versions, [1]);
  assert.equal(confirmCommandReceipt(journal, 'reaction', first.key, { id: 'source', status: 'REACTION_UPDATED' }), true);
  assert.deepEqual(versions, [1, 2]); assert.equal(journal.get('reaction'), undefined);
  const current = journal.prepare('reaction', first.path, { reaction: 'HELPFUL', active: false });
  assert.equal(confirmCommandReceipt(journal, 'reaction', first.key, { id: 'source' }), false);
  assert.equal(journal.get('reaction')?.key, current.key); assert.deepEqual(versions, [1, 2, 3]);
  unsubscribe(); journal.confirm('reaction', current.key); assert.deepEqual(versions, [1, 2, 3]);
});

test('malformed successful receipt cannot settle a retained command and a prior actor receipt cannot settle a new actor key', () => {
  const journal = new CommandJournal(); const first = journal.prepare('source', '/v1/courses', { title: 'Prior actor' });
  for (const value of [null, [], {}, { id: 1 }, { id: '' }]) assert.throws(() => confirmCommandReceipt(journal, 'source', first.key, value), LearningApiError);
  assert.equal(journal.get('source')?.key, first.key);
  journal.clear(); const current = journal.prepare('source', '/v1/courses', { title: 'Current actor' });
  assert.equal(confirmCommandReceipt(journal, 'source', first.key, { id: 'prior-result' }), false);
  assert.equal(journal.get('source')?.key, current.key);
});

test('current feature receipt validation precedes settlement and cannot erase a newer command created by the callback', () => {
  const journal = new CommandJournal(); const command = journal.prepare('draft', '/v1/assessments/source/draft', { expectedRevision: 1 });
  assert.throws(() => confirmCommandReceipt(journal, 'draft', command.key, { id: 'source', revision: 99 }, () => { throw new LearningApiError('invalid', true); }), LearningApiError);
  assert.equal(journal.get('draft')?.key, command.key);
  let callbackCount = 0;
  assert.equal(confirmCommandReceipt(journal, 'draft', command.key, { id: 'source' }, () => { callbackCount++; journal.clear(); journal.prepare('draft', command.path, { expectedRevision: 2 }); }), false);
  assert.equal(callbackCount, 1); assert.notEqual(journal.get('draft')?.key, command.key);
});

test('feature parser failures remain uncertain even when the parser throws a definitive validation error', () => {
  const journal = new CommandJournal(); const command = journal.prepare('draft', '/v1/assessments/source/draft', { expectedRevision: 1 });
  for (const error of [new LearningApiError('invalid'), new Error('Parser rejected private source detail')]) {
    assert.throws(() => confirmCommandReceipt(journal, 'draft', command.key, { id: 'source' }, () => { throw error; }), (failure: unknown) => failure instanceof LearningApiError && failure.kind === 'invalid' && failure.uncertain === true);
    assert.equal(journal.get('draft')?.key, command.key);
  }
});

test('pure original-command validation also protects an unmounted form before settlement', () => {
  const journal = new CommandJournal();
  const command = journal.prepare('goal', '/v1/development/goals', { title: 'My original goal' });
  let validated = 0;
  const validator = (receipt: unknown, original: typeof command) => {
    validated++;
    assert.equal(original, command);
    if ((receipt as { title: string }).title !== original.body.title) throw new LearningApiError('invalid');
  };
  assert.throws(() => confirmCommandReceipt(journal, 'goal', command.key, { id: 'goal', title: 'Wrong goal' }, undefined, validator), failure => failure instanceof LearningApiError && failure.uncertain);
  assert.equal(journal.get('goal')?.key, command.key);
  assert.equal(confirmCommandReceipt(journal, 'goal', command.key, { id: 'goal', title: 'My original goal' }, undefined, validator), true);
  assert.equal(validated, 2);
});

test('cleared or replaced keys never invoke a prior validator or current UI callback', () => {
  const journal = new CommandJournal();
  const prior = journal.prepare('goal', '/v1/development/goals', { title: 'Prior' });
  journal.clear();
  const current = journal.prepare('goal', prior.path, { title: 'Current' });
  let calls = 0;
  assert.equal(confirmCommandReceipt(journal, 'goal', prior.key, { id: 'prior' }, () => calls++, () => calls++), false);
  assert.equal(calls, 0);
  assert.equal(journal.get('goal'), current);
});
