import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoom, parsePost, parseAnnouncement } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
test('rooms require private scoped topics and explicit post/moderation permissions', () => {
  const room = { id: 'r', classId: 'c', name: 'Class room', type: 'CLASS', ownerId: 't', status: 'ACTIVE', canModerate: false, canPost: true, privateTopic: 'cuevo:school:room:r' };
  assert.equal(parseRoom(room).canModerate, false);
  assert.throws(() => parseRoom({ ...room, privateTopic: 'public' }), LearningApiError);
  assert.throws(() => parseRoom({ ...room, canPost: undefined }), LearningApiError);
});
test('hidden post content and unknown reaction metrics cannot leak into a visible feed', () => {
  const post = { id: 'p', roomId: 'r', actorId: 's', authorName: 'Learner', body: null, replyToId: null, createdAt: '2026-10-01T00:00:00Z', status: 'HIDDEN', reactions: [] };
  assert.equal(parsePost(post).body, null);
  assert.throws(() => parsePost({ ...post, body: 'Hidden private content' }), LearningApiError);
  assert.throws(() => parsePost({ ...post, reactions: [{ reaction: 'LIKES', count: 0, mine: false }] }), LearningApiError);
});
test('announcements require explicit parent approval and traceable publication time', () => {
  const announcement = { id: 'a', classId: null, title: 'School notice', body: 'Approved context', parentVisible: false, createdAt: '2026-10-01T00:00:00Z', readAt: null };
  assert.equal(parseAnnouncement(announcement).parentVisible, false);
  assert.throws(() => parseAnnouncement({ ...announcement, parentVisible: undefined }), LearningApiError);
});
