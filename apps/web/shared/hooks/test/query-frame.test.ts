import assert from 'node:assert/strict';
import test from 'node:test';
import * as frames from '../query-frame.ts';
const app = { apiUrl: 'https://fixture.invalid', accessToken: 'token-one', membership: { userId: 'actor', schoolId: 'school', role: 'student' }, accessGeneration: 1, status: 'ready', online: true };
test('query frame binds every private authority and requested source before rendering', () => {
  assert.equal(typeof frames.queryReadFrame, 'function');
  const frame = frames.queryReadFrame(app, '/v1/current-source', 0);
  for (const changed of [{ ...app, apiUrl: 'https://other.invalid' }, { ...app, accessToken: 'token-two' }, { ...app, membership: { ...app.membership, userId: 'other' } }, { ...app, membership: { ...app.membership, schoolId: 'other' } }, { ...app, membership: { ...app.membership, role: 'teacher' } }, { ...app, accessGeneration: 2 }, { ...app, status: 'verifying' }, { ...app, online: false }]) assert.notEqual(frames.queryReadFrame(changed, '/v1/current-source', 0), frame);
  assert.notEqual(frames.queryReadFrame(app, null, 0), frame); assert.notEqual(frames.queryReadFrame(app, '/v1/other', 0), frame); assert.notEqual(frames.queryReadFrame(app, '/v1/current-source', 1), frame);
  assert.equal(frames.queryReadFrame({ ...app }, '/v1/current-source', 0), frame);
});
test('a null source or unverified offline identity cannot start a private read', () => {
  assert.equal(frames.queryReadEnabled(app, '/v1/current-source'), true);
  assert.equal(frames.queryReadEnabled(app, null), false);
  for (const changed of [{ ...app, accessToken: null }, { ...app, membership: null }, { ...app, online: false }, { ...app, status: 'verifying' }]) assert.equal(frames.queryReadEnabled(changed, '/v1/current-source'), false);
});
