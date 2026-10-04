import assert from 'node:assert/strict';
import test from 'node:test';
import { availableQuickLogin, quickLoginSession } from '../quick-login-model.ts';
test('quick login appears only for the exact server testing-availability projection', () => {
  const value = { available: true, roles: ['admin', 'coordinator', 'teacher', 'student', 'parent'] };
  assert.equal(availableQuickLogin(value), true);
  for (const patch of [{ ...value, available: false }, { ...value, password: 'excluded' }, { ...value, roles: ['student'] }, { ...value, roles: value.roles.toReversed() }]) assert.equal(availableQuickLogin(patch), false);
});
test('restore input admits only matching requested role and exact provider token pair without credential or membership fields', () => {
  const value = { role: 'student', session: { access_token: 'opaque-token', refresh_token: 'opaque-refresh' } };
  assert.deepEqual(quickLoginSession(value, 'student'), value.session);
  for (const patch of [{ ...value, role: 'teacher' }, { ...value, membership: {} }, { ...value, session: { ...value.session, password: 'excluded' } }, { ...value, session: { ...value.session, access_token: '' } }]) assert.equal(quickLoginSession(patch, 'student'), null);
});
