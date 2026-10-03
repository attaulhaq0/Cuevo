import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { PageAccumulator, parsePage, pagePath } from '../pagination.ts';
import { apiRequest, LearningApiError } from '../client.ts';
import { parseList } from '../responses.ts';

const cursor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const parseItem = (value: unknown) => {
  assert.ok(value && typeof value === 'object' && 'id' in value && 'title' in value);
  return value as { id: string; title: string };
};

test('page parsers receive only the source item, never array position or page contents', () => {
  const received: unknown[][] = [];
  const items = [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }];
  const parsed = parsePage({ items, nextCursor: null }, (...args: unknown[]) => {
    received.push(args);
    return parseItem(args[0]);
  });
  assert.deepEqual(parsed.items, items);
  assert.deepEqual(received, [[items[0]], [items[1]]]);
});

test('bounded list parsers preserve the same single-item contract', () => {
  const received: unknown[][] = [];
  const items = [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }];
  assert.deepEqual(parseList({ items }, (...args: unknown[]) => {
    received.push(args);
    return parseItem(args[0]);
  }), items);
  assert.deepEqual(received, [[items[0]], [items[1]]]);
});

test('malformed cursors cannot trigger a follow-up query or hide incomplete pages', () => {
  assert.throws(() => parsePage({ items: [], nextCursor: 'bad cursor' }, parseItem), LearningApiError);
  assert.throws(() => parsePage({ items: [] }, parseItem), LearningApiError);
  assert.throws(() => parsePage({ items: [], nextCursor: 10 }, parseItem), LearningApiError);
});

test('overlapping pages update existing IDs once and keep the earlier selected item', () => {
  const pages = new PageAccumulator<{ id: string; title: string }>();
  pages.reset('teacher-school-one');
  pages.apply('teacher-school-one', null, { items: [{ id: 'first', title: 'Earlier' }], nextCursor: cursor });
  pages.apply('teacher-school-one', cursor, { items: [{ id: 'first', title: 'Updated' }, { id: 'second', title: 'Later' }], nextCursor: null });
  assert.deepEqual(pages.items, [{ id: 'first', title: 'Updated' }, { id: 'second', title: 'Later' }]);
  assert.equal(pages.nextCursor, null);
});

test('a scope or refresh reset removes old data and rejects its in-flight response', () => {
  const pages = new PageAccumulator<{ id: string; title: string }>();
  pages.reset('school-one:revision-one');
  pages.apply('school-one:revision-one', null, { items: [{ id: 'private-one', title: 'Old school' }], nextCursor: cursor });
  pages.reset('school-two:revision-two');
  assert.equal(pages.apply('school-one:revision-one', cursor, { items: [{ id: 'stale', title: 'Stale response' }], nextCursor: null }), false);
  assert.deepEqual(pages.items, []);
  assert.equal(pages.nextCursor, null);
});

test('a repeated cursor cannot keep loading the same page indefinitely', () => {
  const pages = new PageAccumulator<{ id: string; title: string }>();
  const secondCursor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  pages.reset('scope');
  pages.apply('scope', null, { items: [{ id: 'one', title: 'One' }], nextCursor: cursor });
  pages.apply('scope', cursor, { items: [{ id: 'two', title: 'Two' }], nextCursor: secondCursor });
  assert.throws(() => pages.apply('scope', secondCursor, { items: [{ id: 'three', title: 'Three' }], nextCursor: cursor }), LearningApiError);
});

test('next-page HTTP requests retain verified school and existing query limits', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.url, `/v1/courses?limit=100&cursor=${cursor}`);
    assert.equal(request.headers['x-school-id'], 'current-school');
    assert.equal(request.headers.authorization, 'Bearer current-token');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ items: [{ id: 'course-two', title: 'Second page' }], nextCursor: null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const data = await apiRequest({ apiUrl: `http://127.0.0.1:${address.port}`, accessToken: 'current-token', schoolId: 'current-school' }, pagePath('/v1/courses?limit=100', cursor));
    assert.deepEqual(parsePage(data, parseItem).items, [{ id: 'course-two', title: 'Second page' }]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
