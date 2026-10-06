import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoomPost, parseParentAnnouncement, parseParentNotification } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

test('a valid post from another room cannot enter the current discussion', () => {
  const post = { id: 'post-1', roomId: 'room-1', actorId: 'learner-1', authorName: 'Alex', body: 'I tried an example.', replyToId: null, createdAt: '2026-10-03T00:00:00Z', status: 'VISIBLE', reactions: [] };
  assert.equal(parseRoomPost(post, 'room-1').body, post.body);
  assert.throws(() => parseRoomPost(post, 'room-2'), LearningApiError);
});

test('parent announcement pages reject private posts and management authority', () => {
  const row = { id: 'notice-1', classId: 'class-1', title: 'School update', body: 'Approved message.', parentVisible: true, createdAt: '2026-10-03T00:00:00Z', readAt: null, canManage: false };
  assert.equal(parseParentAnnouncement(row).title, row.title);
  assert.throws(() => parseParentAnnouncement({ ...row, parentVisible: false }), LearningApiError);
  assert.throws(() => parseParentAnnouncement({ ...row, canManage: true }), LearningApiError);
});

test('parent notifications cannot open pupil mention sources', () => {
  const row = { id: 'notice-1', announcementId: 'notice-1', title: 'Approved school update', kind: 'ANNOUNCEMENT', createdAt: '2026-10-03T00:00:00Z', readAt: null };
  assert.equal(parseParentNotification(row).kind, 'ANNOUNCEMENT');
  assert.throws(() => parseParentNotification({ ...row, kind: 'MENTION', postId: 'post-1', roomId: 'room-1' }), LearningApiError);
});
