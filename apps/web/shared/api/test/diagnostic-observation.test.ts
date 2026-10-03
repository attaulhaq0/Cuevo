import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { apiRequest, LearningApiError } from '../client.ts';

test('API observation reports fixed outcome and timing without server text, URLs, keys or bodies', async () => {
  let status = 200; const observations: unknown[] = [];
  const server = createServer((_request, response) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(status === 200 ? { id: 'private-child' } : { code: 'PRIVATE_CODE', message: 'private pupil message', requestId: 'private-request' })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const config = { apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'secret', schoolId: 'private-school' };
    await apiRequest(config, '/v1/courses/private-source?child=private', { observe: value => observations.push(value) });
    status = 403;
    await assert.rejects(apiRequest(config, '/v1/courses/private-source', { method: 'POST', key: 'private-key', body: { answer: 'private' }, observe: value => observations.push(value) }), LearningApiError);
    assert.equal(observations.length, 2);
    assert.deepEqual(Object.keys(observations[0] as object).sort(), ['category', 'durationMs', 'status']);
    assert.deepEqual(observations.map(value => { const row = value as { category: string; status: string; durationMs: number }; assert.ok(row.durationMs >= 0); return { category: row.category, status: row.status }; }), [{ category: 'api_request', status: 'success' }, { category: 'api_error', status: 'denied' }]);
    assert.ok(!JSON.stringify(observations).includes('private'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
