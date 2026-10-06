import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmCommunityReceipt } from '../model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError, type Command } from '../../../shared/api/client.ts';

const roomId = '00000000-0000-4000-8000-000000000001';
const postId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const memberId = '00000000-0000-4000-8000-000000000004';
const classId = '00000000-0000-4000-8000-000000000005';
const createdAt = '2026-10-03T10:00:00Z';
const command = (path: string, body: Record<string, unknown> = {}): Command => ({ key: 'original-key', path: `/v1/community${path}`, body });
const invalid = (receipt: unknown, original: Command, actor = actorId) => assert.throws(() => confirmCommunityReceipt(receipt, original, actor), error => error instanceof LearningApiError && error.uncertain);

test('post receipts retain exact original room reply actor and schema-trimmed text', () => {
  const original = command(`/rooms/${roomId}/posts`, { body: '\n My checking step \n', replyToId: postId, mentionActorIds: [memberId] });
  const receipt = { id: memberId, command: 'post.create', roomId, body: 'My checking step', replyToId: postId, actorId, createdAt, status: 'VISIBLE' };
  assert.equal(confirmCommunityReceipt(receipt, original, actorId).id, memberId);
  for (const patch of [{ roomId: classId }, { actorId: classId }, { replyToId: null }, { body: 'Other post' }, { status: 'HIDDEN' }, { createdAt: 'unknown' }, { command: 'reaction.configure' }, { privateNotes: 'Unexpected' }]) invalid({ ...receipt, ...patch }, original);
  assert.throws(() => confirmCommunityReceipt(receipt, original), error => error instanceof LearningApiError && error.uncertain);
  assert.equal(confirmCommunityReceipt({ ...receipt, replyToId: null }, command(`/rooms/${roomId}/posts`, { body: 'My checking step' }), actorId).id, memberId);
});

test('simple community receipts bind only actual echoed command and source identities', () => {
  const room = command('/rooms', { classId, name: 'Current group', type: 'GROUP', memberIds: [] });
  assert.equal(confirmCommunityReceipt({ id: roomId, command: 'room.create', roomId }, room).id, roomId);
  invalid({ id: roomId, command: 'room.create', roomId: classId }, room);
  const reaction = command(`/posts/${postId}/reactions`, { reaction: 'HELPFUL', active: false });
  assert.equal(confirmCommunityReceipt({ id: postId, command: 'reaction.configure' }, reaction).id, postId);
  invalid({ id: roomId, command: 'reaction.configure' }, reaction);
  const member = command(`/rooms/${roomId}/members`, { actorId: memberId, status: 'revoked', confirmAccessChange: true });
  const changeId = '00000000-0000-4000-8000-000000000006';
  assert.notEqual(changeId, member.body.actorId);
  assert.equal(confirmCommunityReceipt({ id: changeId, command: 'member.configure' }, member).id, changeId);
  invalid({ id: 'not-a-change-id', command: 'member.configure' }, member);
  invalid({ id: changeId, command: 'room.restrict' }, member);
  invalid({ id: changeId, command: 'member.configure', actorId: memberId }, member);
  for (const [path, body, kind] of [
    ['/announcements', { classId, title: 'School notice', body: 'Current notice', parentVisible: false }, 'announcement.create'],
    [`/posts/${postId}/report`, { reason: 'Needs review' }, 'report.create'],
    [`/posts/${postId}/moderate`, { action: 'HIDE', reason: 'School review', confirmModeration: true }, 'post.moderate'],
    [`/rooms/${roomId}/restrict`, { actorId: memberId, restriction: 'NONE', reason: 'School review', confirmModeration: true }, 'room.restrict'],
  ] as const) {
    assert.equal(confirmCommunityReceipt({ id: memberId, command: kind }, command(path, body)).id, memberId);
    invalid({ id: memberId, command: 'wrong' }, command(path, body));
    invalid({ id: 'unknown', command: kind }, command(path, body));
    invalid({ id: memberId, command: kind, targetId: postId }, command(path, body));
  }
});

test('maintenance receipts take exact target next revision and state from the original command', () => {
  for (const [path, body, status] of [
    [`/groups/${roomId}/lifecycle`, { name: 'Current group', state: 'CLOSED', expectedRevision: 1, reason: 'School review', confirmChange: true }, 'CLOSED'],
    [`/reports/${postId}/review`, { outcome: 'REOPENED', expectedRevision: 0, reason: 'School review', confirmReview: true }, 'REOPENED'],
    [`/announcements/${postId}/revision`, { title: 'Current notice', body: 'Updated source', parentVisible: false, expectedRevision: 2, reason: 'School review', confirmPublication: true }, 'PUBLISHED'],
    [`/announcements/${postId}/withdraw`, { expectedRevision: 2, reason: 'School review', confirmWithdrawal: true }, 'WITHDRAWN'],
  ] as const) {
    const original = command(path, body); const target = path.split('/')[2];
    const receipt = { id: target, revision: body.expectedRevision + 1, status };
    assert.equal(confirmCommunityReceipt(receipt, original).id, target);
    for (const patch of [{ id: classId }, { revision: body.expectedRevision }, { status: 'UNKNOWN' }, { command: 'post.create' }]) invalid({ ...receipt, ...patch }, original);
  }
});

test('announcement and mention reads confirm exact original source without implying a broader read state', () => {
  const read = command(`/notifications/${postId}/read`, { expectedRevision: 2 });
  assert.equal(confirmCommunityReceipt({ id: postId, status: 'READ', revision: 2 }, read).id, postId);
  for (const receipt of [{ id: roomId, status: 'READ', revision: 2 }, { id: postId, status: 'READ', revision: 1 }, { id: postId, status: 'READ' }, { id: postId, status: 'READ', revision: 2, command: 'notification.read' }]) invalid(receipt, read);
  invalid({ id: postId, status: 'READ', revision: 2 }, command(`/notifications/${postId}/read`));
  const mention = command(`/mentions/${postId}/read`);
  assert.equal(confirmCommunityReceipt({ id: postId, status: 'READ' }, mention).id, postId);
  invalid({ id: roomId, status: 'READ' }, mention);
  invalid({ id: postId, status: 'READ', revision: 1 }, mention);
});

test('unmounted post validation retains original-key retry before a valid receipt settles it', () => {
  const journal = new CommandJournal(); const path = `/v1/community/rooms/${roomId}/posts`;
  const original = journal.prepare(path, path, { body: 'My checking step', replyToId: null });
  const receipt = { id: postId, command: 'post.create', roomId, body: 'My checking step', replyToId: null, actorId, createdAt, status: 'VISIBLE' };
  const validate = (value: unknown, submitted: Command) => { confirmCommunityReceipt(value, submitted, actorId); };
  assert.throws(() => confirmCommandReceipt(journal, path, original.key, { ...receipt, body: 'Another post' }, undefined, validate), error => error instanceof LearningApiError && error.uncertain);
  assert.equal(journal.get(path), original);
  assert.equal(confirmCommandReceipt(journal, path, original.key, receipt, undefined, validate), true);
});

test('unknown paths malformed original payloads and non-current receipt shapes stay uncertain', () => {
  invalid({ id: postId, command: 'reaction.configure' }, command(`/posts/${postId}/reactions`, { reaction: 'LIKES', active: true }));
  invalid({ id: postId, status: 'READ' }, command(`/mentions/${postId}/read`, { expectedRevision: 1 }));
  invalid({ id: postId, command: 'reaction.configure' }, command('/unknown'));
  for (const receipt of [null, [], {}, { id: '' }]) invalid(receipt, command(`/posts/${postId}/reactions`, { reaction: 'HELPFUL', active: true }));
});
