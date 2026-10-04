import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../client.ts';
import * as client from '../client.ts';

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

test('always validation retains an unmounted original command after a strict payload mismatch', () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { expectedVersion: 2, days: 21 }); const effects = 0;
  const captured = client.captureCommandReceiptValidator(command, (receipt, original) => { const value = receipt as { version: number; days: number }; if (value.version !== Number(original.body.expectedVersion) + 1 || value.days !== original.body.days) throw Error('Mismatch'); });
  assert.throws(() => client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source', version: 99, days: 21 }, undefined, captured), (error: unknown) => error instanceof LearningApiError && error.uncertain);
  assert.equal(journal.get('policy')?.key, command.key); assert.equal(effects, 0);
  assert.equal(client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source', version: 3, days: 21 }, undefined, captured), true); assert.equal(journal.get('policy'), undefined); assert.equal(effects, 0);
});

test('prior actor key is checked before any receipt validator or feature callback', () => {
  const journal = new CommandJournal(); const old = journal.prepare('policy', '/v1/policy', { expectedVersion: 2 }); journal.clear(); const current = journal.prepare('policy', '/v1/policy', { expectedVersion: 3 }); let validations = 0; let effects = 0;
  assert.equal(client.confirmCommandReceipt(journal, 'policy', old.key, null, () => { effects++; }, () => { validations++; }), false);
  assert.equal(journal.get('policy')?.key, current.key); assert.equal(validations, 0); assert.equal(effects, 0);
});

test('validator capture uses the submitted immutable body even after the retained command changes', () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { expectedVersion: 2, days: 21 }); let observed: unknown;
  const captured = client.captureCommandReceiptValidator(command, (_receipt, original) => { observed = original; }); command.body.days = 99;
  assert.equal(client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source' }, undefined, captured), true);
  assert.deepEqual(observed, { key: command.key, path: '/v1/policy', body: { expectedVersion: 2, days: 21 } });
});

test('always validation and current effect run once and preserve any replacement key', () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { days: 21 }); let validations = 0; let effects = 0;
  assert.equal(client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source' }, () => { effects++; journal.clear(); journal.prepare('policy', command.path, { days: 30 }); }, () => { validations++; }), false);
  assert.equal(validations, 1); assert.equal(effects, 1); assert.equal(journal.get('policy')?.body.days, 30);
});

test('a replacement command made during always validation suppresses prior UI effects', () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { days: 21 }); let effects = 0;
  assert.equal(client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source' }, () => { effects++; }, () => { journal.clear(); journal.prepare('policy', command.path, { days: 30 }); }), false);
  assert.equal(effects, 0); assert.equal(journal.get('policy')?.body.days, 30);
});

test('repeated always validation gets the original body and normalizes every failure to uncertain', () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { days: 21 }); let validations = 0; const observedDays: unknown[] = [];
  const captured = client.captureCommandReceiptValidator(command, (_receipt, original) => { validations++; observedDays.push(original.body.days); original.body.days = 99; throw new LearningApiError('invalid'); });
  for (let retry = 0; retry < 2; retry++) assert.throws(() => client.confirmCommandReceipt(journal, 'policy', command.key, { id: 'source' }, undefined, captured), (error: unknown) => error instanceof LearningApiError && error.kind === 'invalid' && error.uncertain);
  assert.equal(validations, 2); assert.deepEqual(observedDays, [21, 21]); assert.equal(journal.get('policy')?.key, command.key); assert.equal(journal.get('policy')?.body.days, 21);
});

test('a held offscreen response runs its captured strict validator without current UI effects', async () => {
  const journal = new CommandJournal(); const command = journal.prepare('policy', '/v1/policy', { expectedVersion: 2, days: 21 }); let mounted = true; let effects = 0; let validations = 0;
  const validate = client.captureCommandReceiptValidator(command, (receipt, original) => { validations++; if ((receipt as { days: number }).days !== original.body.days) throw Error('Invalid receipt'); });
  let resolve!: (value: unknown) => void; const held = new Promise<unknown>(done => { resolve = done; });
  const running = held.then(receipt => client.confirmCommandReceipt(journal, 'policy', command.key, receipt, mounted ? () => { effects++; } : undefined, validate));
  mounted = false; resolve({ id: 'source', days: 99 });
  await assert.rejects(running, (error: unknown) => error instanceof LearningApiError && error.uncertain); assert.equal(validations, 1); assert.equal(effects, 0); assert.equal(journal.get('policy')?.key, command.key);
});

test('feature parser failures remain uncertain even when the parser throws a definitive validation error', () => {
  const journal = new CommandJournal(); const command = journal.prepare('draft', '/v1/assessments/source/draft', { expectedRevision: 1 });
  for (const error of [new LearningApiError('invalid'), new Error('Parser rejected private source detail')]) {
    assert.throws(() => confirmCommandReceipt(journal, 'draft', command.key, { id: 'source' }, () => { throw error; }), (failure: unknown) => failure instanceof LearningApiError && failure.kind === 'invalid' && failure.uncertain === true);
    assert.equal(journal.get('draft')?.key, command.key);
  }
});
