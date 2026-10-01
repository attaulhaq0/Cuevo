import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { fetchMembership, MembershipError, parseMembership } from '../membership.ts';

const membership = {
  userId: 'user-001',
  schoolId: 'school-001',
  membershipId: 'membership-001',
  role: 'teacher',
  entitlements: ['learning', 'assessment'],
  school: { id: 'school-001', name: 'Synthetic Reference School' },
  displayName: 'Synthetic Teacher',
};

test('unrecognized roles and mismatched school objects never enter the workspace', () => {
  assert.throws(() => parseMembership({ ...membership, role: 'owner' }), MembershipError);
  assert.throws(() => parseMembership({ ...membership, role: 'Teacher' }), MembershipError);
  assert.throws(() => parseMembership({ ...membership, school: { id: 'other-school', name: 'Other' } }), MembershipError);
  assert.throws(() => parseMembership({ ...membership, entitlements: 'all' }), MembershipError);
});

test('a valid verified membership preserves the assigned role and empty entitlements', () => {
  const result = parseMembership({ ...membership, entitlements: [] });
  assert.equal(result.role, 'teacher');
  assert.equal(result.school.id, 'school-001');
  assert.deepEqual(result.entitlements, []);
});

test('the current access token reaches the API and the first request omits a school selection', async () => {
  let receivedAuthorization: string | undefined;
  let receivedSchool: string | undefined;
  const server = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization;
    receivedSchool = request.headers['x-school-id'] as string | undefined;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(membership));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const result = await fetchMembership({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'current-access-token' });
    assert.equal(receivedAuthorization, 'Bearer current-access-token');
    assert.equal(receivedSchool, undefined);
    assert.equal(result.displayName, 'Synthetic Teacher');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('revoked membership errors stay distinct from a dependency outage and hide backend messages', async () => {
  let status = 403;
  let code = 'MEMBERSHIP_REVOKED';
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code, message: 'database password=never-display', requestId: 'request-001' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const request = { apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'access-token', schoolId: 'school-001' };
    await assert.rejects(fetchMembership(request), (error: unknown) => {
      assert.ok(error instanceof MembershipError);
      assert.equal(error.kind, 'denied');
      assert.equal(error.requestId, 'request-001');
      assert.ok(!error.message.includes('password'));
      return true;
    });
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    await assert.rejects(fetchMembership(request), (error: unknown) => {
      assert.ok(error instanceof MembershipError);
      assert.equal(error.kind, 'unavailable');
      return true;
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('multiple memberships require a school selection without manufacturing one', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(409, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'MULTIPLE_SCHOOLS', requestId: 'request-multiple' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await assert.rejects(fetchMembership({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token' }), (error: unknown) => {
      assert.ok(error instanceof MembershipError);
      assert.equal(error.kind, 'multiple-schools');
      return true;
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('a later school-bound request cannot accept a response from another school', async () => {
  let receivedSchool: string | undefined;
  const server = createServer((request, response) => {
    receivedSchool = request.headers['x-school-id'] as string | undefined;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ...membership, schoolId: 'other-school', school: { id: 'other-school', name: 'Other School' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await assert.rejects(fetchMembership({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token', schoolId: 'school-001' }), (error: unknown) => {
      assert.ok(error instanceof MembershipError);
      assert.equal(error.kind, 'invalid-response');
      return true;
    });
    assert.equal(receivedSchool, 'school-001');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('non-JSON success cannot be treated as authorized membership', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html>Upstream unavailable</html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await assert.rejects(fetchMembership({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token' }), (error: unknown) => {
      assert.ok(error instanceof MembershipError);
      assert.equal(error.kind, 'invalid-response');
      return true;
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
