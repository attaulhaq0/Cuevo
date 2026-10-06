import test from 'node:test';
import assert from 'node:assert/strict';
import * as captures from './account-capture-cleanup';
const id = '30000000-0000-4000-8000-000000000001';
const row = { id, email: 'owned@example.test', purpose: 'recovery' as const };
const text = (request = id, target = 'http://localhost:3000/account/recovery', type = 'recovery') => `${target}#id=${request}&type=${type}&token_hash=transient&admission_secret=${'a'.repeat(64)}`;
test('capture ownership requires exact recipient origin path purpose and unique request fragment', () => {
  assert.equal(captures.isOwnedAccountCapture(row, { To: [{ Address: row.email }], Text: text() }), true);
  for (const value of [{ To: [{ Address: 'other@example.test' }], Text: text() }, { To: [{ Address: row.email }], Text: text(id, 'http://localhost:3000.evil/account/recovery') }, { To: [{ Address: row.email }], Text: text(id, 'http://localhost:3000/account/admission', 'invite') }, { To: [{ Address: row.email }], Text: text() + '&id=' + id }, { To: [{ Address: row.email }], Text: text('30000000-0000-4000-8000-000000000002') }]) assert.equal(captures.isOwnedAccountCapture(row, value), false);
});
test('cleanup deletes only exact owned capture and reads back its absence', async () => {
  const removed: string[][] = []; let deleted = false;
  await captures.cleanupOwnedAccountCaptures([row], { search: async () => deleted ? ['unrelated'] : ['owned', 'unrelated'], message: async key => ({ To: [{ Address: row.email }], Text: key === 'owned' ? text() : text('30000000-0000-4000-8000-000000000002') }), remove: async ids => { removed.push(ids); deleted = true; } });
  assert.deepEqual(removed, [['owned']]);
});
test('HTTP deletion success with capture still present cannot acknowledge cleanup', async () => {
  await assert.rejects(captures.cleanupOwnedAccountCaptures([row], { search: async () => ['owned'], message: async () => ({ To: [{ Address: row.email }], Text: text() }), remove: async () => {} }));
});
test('known deleted capture ID cannot hide in a changed readback message', async () => {
  let deleted = false;
  await assert.rejects(captures.cleanupOwnedAccountCaptures([row], { search: async () => ['owned'], message: async () => ({ To: [{ Address: row.email }], Text: deleted ? 'message content changed' : text() }), remove: async () => { deleted = true; } }));
});
test('capture failure still attempts other exact owned request cleanup', async () => {
  const second = { ...row, id: '30000000-0000-4000-8000-000000000002', email: 'second@example.test' }; const removed: string[] = []; let deleted = false;
  await assert.rejects(captures.cleanupOwnedAccountCaptures([row, second], { search: async email => { if (email === row.email) throw Error('unavailable'); return deleted ? [] : ['second']; }, message: async () => ({ To: [{ Address: second.email }], Text: text(second.id) }), remove: async ids => { removed.push(...ids); deleted = true; } }));
  assert.deepEqual(removed, ['second']);
});
test('duplicate or overflowing search pages cannot produce uncertain deletion', async () => {
  for (const values of [['owned', 'owned'], Array.from({ length: 100 }, (_, index) => 'id' + index)]) {
    let removed = false; await assert.rejects(captures.cleanupOwnedAccountCaptures([row], { search: async () => values, message: async () => ({ To: [{ Address: row.email }], Text: text() }), remove: async () => { removed = true; } })); assert.equal(removed, false);
  }
});
test('phase request ownership is the exact new approved baseline delta', () => {
  assert.deepEqual(captures.accountPhaseRequestDelta([{ ...row, id: '30000000-0000-4000-8000-000000000002' }], [row, { ...row, id: '30000000-0000-4000-8000-000000000002' }]), [row]);
  assert.throws(() => captures.accountPhaseRequestDelta([row], []));
});
