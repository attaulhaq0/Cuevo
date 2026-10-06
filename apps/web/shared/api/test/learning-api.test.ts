import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { apiRequest, CommandJournal, LearningApiError } from '../client.ts';

test('uncertain commands keep the original key and payload, preventing edited retries', () => {
  const journal = new CommandJournal();
  const first = journal.prepare('course-create', '/v1/courses', { title: 'Algebra' });
  assert.equal(journal.prepare('course-create', '/v1/courses', { title: 'Algebra' }).key, first.key);
  assert.throws(() => journal.prepare('course-create', '/v1/courses', { title: 'Geometry' }), LearningApiError);
  assert.equal(journal.get('course-create')?.body.title, 'Algebra');
  journal.confirm('course-create');
  assert.notEqual(journal.prepare('course-create', '/v1/courses', { title: 'Geometry' }).key, first.key);
});

test('learning commands send verified scope and idempotency to the real HTTP boundary', async () => {
  const server = createServer(async (request, response) => {
    assert.equal(request.url, '/v1/courses');
    assert.equal(request.headers.authorization, 'Bearer active-token');
    assert.equal(request.headers['x-school-id'], 'school-001');
    assert.equal(request.headers['idempotency-key'], 'command-001');
    let body = '';
    for await (const part of request) body += part;
    assert.deepEqual(JSON.parse(body), { title: 'Algebra' });
    response.writeHead(201, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'course-001', title: 'Algebra' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const result = await apiRequest({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'active-token', schoolId: 'school-001' }, '/v1/courses', { method: 'POST', key: 'command-001', body: { title: 'Algebra' } });
    assert.deepEqual(result, { id: 'course-001', title: 'Algebra' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('a mutation outage is uncertain while authorization refusal is definitive and sanitized', async () => {
  let status = 503;
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'private database detail', requestId: 'request-002' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const config = { apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token', schoolId: 'school-001' };
    await assert.rejects(apiRequest(config, '/v1/courses', { method: 'POST', key: 'command-002', body: {} }), (error: unknown) => {
      assert.ok(error instanceof LearningApiError); assert.equal(error.uncertain, true); assert.equal(error.kind, 'unavailable'); assert.ok(!error.message.includes('private')); return true;
    });
    status = 403;
    await assert.rejects(apiRequest(config, '/v1/courses', { method: 'POST', key: 'command-002', body: {} }), (error: unknown) => {
      assert.ok(error instanceof LearningApiError); assert.equal(error.uncertain, false); assert.equal(error.kind, 'denied'); return true;
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('course detail capacity refusal is actionable and definitive without displaying server text', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(413, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'LEARNING_DETAIL_TOO_LARGE', message: 'internal response bytes 600000', requestId: 'capacity-001' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await assert.rejects(apiRequest({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token', schoolId: 'school-001' }, '/v1/courses/course-001'), (error: unknown) => {
      assert.ok(error instanceof LearningApiError);
      assert.equal(error.kind, 'too-large');
      assert.equal(error.uncertain, false);
      assert.equal(error.requestId, 'capacity-001');
      assert.ok(!error.message.includes('bytes'));
      return true;
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('unconfigured intelligence is a definitive no-analysis state instead of an uncertain model run', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'INTELLIGENCE_UNAVAILABLE', message: 'internal provider secret missing', requestId: 'ai-001' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await assert.rejects(apiRequest({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token', schoolId: 'school-001' }, '/v1/intelligence/analyze', { method: 'POST', key: 'analysis-001', body: { baselineResultId: 'result-001' } }), (error: unknown) => {
      assert.ok(error instanceof LearningApiError);
      assert.equal(error.kind, 'ai-unavailable');
      assert.equal(error.uncertain, false);
      assert.ok(!error.message.includes('secret'));
      return true;
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('durable terminal intelligence failure is definitive while unknown transport outcome remains uncertain', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'INTELLIGENCE_TIMEOUT', message: 'private prompt details', requestId: 'ai-failed-001' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await assert.rejects(apiRequest({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'token', schoolId: 'school-001' }, '/v1/intelligence/analyze', { method: 'POST', key: 'analysis-failed-001', body: { baselineResultId: 'result-001' } }), (error: unknown) => {
      assert.ok(error instanceof LearningApiError); assert.equal(error.kind, 'ai-failed'); assert.equal(error.uncertain, false); assert.ok(!error.message.includes('prompt')); return true;
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('unknown intelligence persistence and in-progress command preserve original retry identity', async () => {
  let code='INTELLIGENCE_OUTCOME_UNKNOWN';
  const server=createServer((_request,response)=>{response.writeHead(code==='COMMAND_IN_PROGRESS'?409:503,{'Content-Type':'application/json'});response.end(JSON.stringify({code,requestId:'unknown-run'}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const address=server.address();assert.ok(address&&typeof address!=='string');
    for(code of ['INTELLIGENCE_OUTCOME_UNKNOWN','COMMAND_IN_PROGRESS'])await assert.rejects(apiRequest({apiUrl:`http://127.0.0.1:${address.port}`,accessToken:'token',schoolId:'school-001'},'/v1/intelligence/analyze',{method:'POST',key:'original-analysis-key',body:{baselineResultId:'result-001'}}),(error:unknown)=>{assert.ok(error instanceof LearningApiError);assert.equal(error.uncertain,true);return true;});
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
