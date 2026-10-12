import assert from 'node:assert/strict';
import test from 'node:test';

const owner = await import('./hosted-community-delivery').catch(error => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
  return undefined;
});
const schoolId = '10000000-0000-4000-8000-000000000001', teacherId = '20000000-0000-4000-8000-000000000004', studentId = '20000000-0000-4000-8000-000000000012';
const id = (index: number) => '93000000-0000-4000-8000-' + String(index).padStart(12, '0');
const groupId = id(100), clock = (seconds: number) => '2026-10-12T01:00:' + String(seconds).padStart(2, '0') + '.000Z';
function fixture(length = 15) {
  const operations = ['room.create', 'member.configure', 'member.configure', 'post.create', 'post.create', 'reaction.configure', 'reaction.configure', 'post.create', 'post.report', 'room.restrict', 'room.restrict', 'post.moderate', 'post.moderate', 'announcement.create', 'notification.read', 'member.configure', 'group.lifecycle', 'announcement.withdraw'];
  return {
    commands: operations.slice(0, length).map((operation, index) => ({ eventId: id(index + 1), operation, intentRecordSha256: String(index + 1).padStart(64, '0'), id: id(index + 200), nativeReceiptSha256: String(index + 21).padStart(64, '0'), httpReceiptObserved: true })),
    identity: { schoolId, groupId, observedAfter: clock(0), observedBefore: clock(30) },
    invalidations: [{ eventId: id(4), roomId: groupId, schoolId, actorId: studentId, generation: 3, joinProof: { joinRef: '17', replyRef: '17' }, observedAt: clock(10) }],
    rereads: [{ eventId: id(4), actorId: studentId, schoolId, generation: 3, roomId: groupId, path: '/v1/community/rooms/' + groupId + '/posts?limit=100', status: 200, requestId: 'delivery-request-1', observedAt: clock(11), sourceIds: [id(203)] }],
  };
}

test('representative original native event delivery and same-session subsequent API reread correlate without authority', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function', 'finite delivery correlation owner is missing');
  for (const length of [15, 18]) {
    const result = owner!.validateHostedCommunityDelivery(fixture(length));
    assert.equal(result.status, 'DELIVERY_CORRELATED'); assert.deepEqual(result.eventIds, [id(4)]);
    assert.equal(result.hostedAcceptance, false); assert.equal(result.nativeExecutionVerified, false);
  }
});

test('the exact teacher epoch and fixed membership directory rereads remain valid representative correlation', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function');
  for (const path of ['/v1/me', '/v1/community/rooms?limit=100']) {
    const value = fixture(); value.invalidations[0].actorId = teacherId; value.invalidations[0].generation = 9;
    Object.assign(value.rereads[0], { actorId: teacherId, generation: 9 });
    value.rereads.push({ ...value.rereads[0], path, requestId: path === '/v1/me' ? 'shell-reread-me' : 'shell-reread-rooms' });
    assert.equal(owner!.validateHostedCommunityDelivery(value).status, 'DELIVERY_CORRELATED');
  }
});

test('private join refs and native post projection must match before shell rereads can corroborate delivery', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function');
  for (const kind of ['join-ref', 'missing-source', 'foreign-source', 'me-only', 'rooms-only', 'non-post-event']) {
    const value = fixture();
    if (kind === 'join-ref') value.invalidations[0].joinProof.replyRef = '18';
    if (kind === 'missing-source') value.rereads[0].sourceIds = [];
    if (kind === 'foreign-source') value.rereads[0].sourceIds = [id(999)];
    if (kind === 'me-only') value.rereads[0].path = '/v1/me';
    if (kind === 'rooms-only') value.rereads[0].path = '/v1/community/rooms?limit=100';
    if (kind === 'non-post-event') { value.invalidations[0].eventId = id(12); value.rereads[0].eventId = id(12); }
    assert.equal(owner!.validateHostedCommunityDelivery(value).status, 'REQUIRES_REVIEW', kind);
  }
});

test('missing original delivery and missing or early reread remain unknown instead of successful', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function');
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => { value.commands = []; },
    (value: ReturnType<typeof fixture>) => { value.commands.pop(); },
    (value: ReturnType<typeof fixture>) => { value.invalidations = []; },
    (value: ReturnType<typeof fixture>) => { value.rereads = []; },
    (value: ReturnType<typeof fixture>) => { value.rereads[0].observedAt = clock(9); },
  ]) { const value = fixture(); mutate(value); assert.deepEqual(owner!.validateHostedCommunityDelivery(value), { status: 'REQUIRES_REVIEW', eventIds: [], hostedAcceptance: false, nativeExecutionVerified: false }); }
});

test('foreign events scopes actor epochs refs error statuses timestamps and queries cannot create correlation', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function');
  const mutations: ((value: ReturnType<typeof fixture>) => void)[] = [
    value => { value.identity.schoolId = id(900); },
    value => { value.identity.observedAfter = clock(20); },
    value => { value.identity.observedBefore = clock(9); },
    value => { value.invalidations[0].eventId = id(901); },
    value => { value.invalidations[0].schoolId = id(902); },
    value => { value.invalidations[0].roomId = id(903); },
    value => { value.invalidations[0].actorId = '20000000-0000-4000-8000-000000000018'; },
    value => { value.invalidations[0].generation = 1; },
    value => { value.invalidations[0].joinProof.joinRef = ''; },
    value => { value.invalidations[0].joinProof.replyRef = 'private-token'; },
    value => { value.rereads[0].generation = 7; },
    value => { value.rereads[0].actorId = teacherId; },
    value => { value.rereads[0].schoolId = id(904); },
    value => { value.rereads[0].roomId = id(905); },
    value => { value.rereads[0].eventId = id(906); },
    value => { value.rereads[0].status = 403; },
    value => { value.rereads[0].requestId = 'unsafe\nrequest'; },
    value => { value.rereads[0].observedAt = clock(31); },
    value => { value.rereads[0].path += '&limit=100'; },
    value => { value.rereads[0].path = '/v1/community/rooms/' + id(907) + '/posts?limit=100'; },
    value => { value.rereads[0].path = '/v1/community/rooms/' + groupId + '/posts?limit=101'; },
    value => { value.invalidations.push(value.invalidations[0]); },
    value => { value.rereads.push(value.rereads[0]); },
    value => { value.commands[1].eventId = value.commands[0].eventId; },
    value => { value.commands[1].intentRecordSha256 = value.commands[0].intentRecordSha256; },
    value => { value.commands[3].operation = 'announcement.create'; },
    value => { value.invalidations[0].eventId = id(14); value.rereads[0].eventId = id(14); },
  ];
  for (const [index, mutate] of mutations.entries()) { const value = fixture(); mutate(value); assert.equal(owner!.validateHostedCommunityDelivery(value).status, 'REQUIRES_REVIEW', 'conflict ' + index); }
});

test('private fields accessor and proxy inputs are rejected without evaluating hidden content', () => {
  assert.equal(typeof owner?.validateHostedCommunityDelivery, 'function'); let traps = 0;
  const value = fixture(), getter = { get commands() { traps++; return value.commands; } };
  const proxy = new Proxy(value, { get() { traps++; throw Error('Private trap'); }, ownKeys() { traps++; throw Error('Private trap'); } });
  for (const input of [getter, proxy, { ...value, nativeExecutionVerified: true }, { ...value, invalidations: [{ ...value.invalidations[0], token: 'private-token' }] }, { ...value, rereads: [{ ...value.rereads[0], body: 'private-post' }] }]) {
    assert.equal(owner!.validateHostedCommunityDelivery(input).status, 'REQUIRES_REVIEW');
  }
  assert.equal(traps, 0);
});

test('the single strict delivered-read parser permits unknown empty observations and rejects private malformed arrays', () => {
  assert.equal(typeof owner?.parseHostedCommunityDeliveryReads, 'function', 'strict shared reread parser is missing');
  assert.deepEqual(owner!.parseHostedCommunityDeliveryReads([]), []);
  const input = fixture().rereads, parsed = owner!.parseHostedCommunityDeliveryReads(input); assert.deepEqual(parsed, input);
  parsed[0].sourceIds!.push(id(999)); assert.equal(input[0].sourceIds.length, 1, 'returned facts are detached');
  let traps = 0;
  for (const value of [{}, null, Array(101).fill(input[0]), [{ ...input[0], status: 403 }], [{ ...input[0], body: 'private-content' }],
    [{ ...input[0], token: 'private-token' }], [{ ...input[0], sourceIds: ['unknown'] }],
    new Proxy(input, { get() { traps++; throw Error('Private trap'); }, ownKeys() { traps++; throw Error('Private trap'); } })]) assert.throws(() => owner!.parseHostedCommunityDeliveryReads(value));
  assert.equal(traps, 0);
});
