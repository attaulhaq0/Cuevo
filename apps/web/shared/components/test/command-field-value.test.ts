import assert from 'node:assert/strict';
import test from 'node:test';
import { commandFieldValue } from '../command-field-value.ts';

test('retained absolute timestamps render as valid local input while original precise command stays unchanged', () => {
  const command = Object.freeze({ effectiveFrom: '2026-09-01T00:00:37.321+03:00' });
  const value = commandFieldValue('datetime-local', command.effectiveFrom);
  assert.match(String(value), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  const original = new Date(command.effectiveFrom);
  assert.equal(value, new Date(original.getTime() - original.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  assert.equal(command.effectiveFrom, '2026-09-01T00:00:37.321+03:00');
});
test('working native values, dates, numeric zero and malformed values retain truthful handling', () => {
  assert.equal(commandFieldValue('datetime-local', '2026-09-01T03:30'), '2026-09-01T03:30');
  assert.equal(commandFieldValue('date', '2026-09-01'), '2026-09-01');
  assert.equal(commandFieldValue('number', 0), 0);
  assert.equal(commandFieldValue('datetime-local', 'invalidZ'), '');
  assert.equal(commandFieldValue('text', 'endsZ'), 'endsZ');
});
