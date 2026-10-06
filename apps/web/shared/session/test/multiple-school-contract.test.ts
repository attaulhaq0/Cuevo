import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchMembership, MembershipError } from '../membership.ts';

test('the actual school-selection-required contract preserves an explicit recovery state', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(409, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'SCHOOL_SELECTION_REQUIRED', requestId: 'support-reference' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await assert.rejects(fetchMembership({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'test-session' }), (error: unknown) => error instanceof MembershipError && error.kind === 'multiple-schools' && error.requestId === 'support-reference');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
