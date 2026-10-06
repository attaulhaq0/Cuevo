import assert from 'node:assert/strict';
import { currentGroupCandidateRoom } from '../model.ts';

test('same-context room refresh preserves only candidate identity while loading and clears lost authority', () => {
  const room = { id: 'class-room', classId: 'class-a', type: 'CLASS' as const };
  const current = currentGroupCandidateRoom(null, { scope: 'school:actor:token:1:group-a', classId: 'class-a', rooms: [room], loading: false, failed: false });
  assert.equal(current.id, 'class-room');
  const loading = currentGroupCandidateRoom(current, { scope: current.scope, classId: 'class-a', rooms: [], loading: true, failed: false });
  assert.equal(loading.id, 'class-room');
  assert.equal(currentGroupCandidateRoom(loading, { scope: current.scope, classId: 'class-a', rooms: [], loading: false, failed: false }).id, null);
  assert.equal(currentGroupCandidateRoom(current, { scope: 'school:other:token:1:group-a', classId: 'class-a', rooms: [], loading: true, failed: false }).id, null);
  assert.equal(currentGroupCandidateRoom(current, { scope: current.scope, classId: 'class-a', rooms: [], loading: false, failed: true }).id, null);
});
import test from 'node:test';
import { parseRoom, parsePost, parseAnnouncement, parseNotification, replyParentContext, reportSourceContext, type Post } from '../model.ts';
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
test('reply context distinguishes a missing page from an actual hidden parent', () => {
  const visible: Post = { id: 'parent', roomId: 'room', actorId: 'actor', authorName: 'Teacher', body: 'Source', replyToId: null, createdAt: '2026-10-02T00:00:00Z', status: 'VISIBLE', reactions: [] };
  assert.deepEqual(replyParentContext('parent', []), { state: 'NOT_LOADED' });
  assert.deepEqual(replyParentContext('parent', [visible]), { state: 'VISIBLE', authorName: 'Teacher' });
  assert.deepEqual(replyParentContext('parent', [{ ...visible, status: 'HIDDEN', body: null }]), { state: 'HIDDEN' });
});

test('reported-message context uses only the exact currently loaded room source',()=>{
 const post:Post={id:'reported',roomId:'room',actorId:'actor',authorName:'Teacher',body:'Exact message',replyToId:null,createdAt:'2026-10-02T00:00:00Z',status:'VISIBLE',reactions:[]};
 assert.deepEqual(reportSourceContext('reported','room',[post],true),{state:'VISIBLE',post});
 assert.deepEqual(reportSourceContext('reported','room',[post],false),{state:'NOT_LOADED'});
 assert.deepEqual(reportSourceContext('reported','room',[{...post,roomId:'another'}],true),{state:'NOT_LOADED'});
 assert.deepEqual(reportSourceContext('reported','room',[],true),{state:'NOT_LOADED'});
 const hidden={...post,status:'HIDDEN' as const,body:null};assert.deepEqual(reportSourceContext('reported','room',[hidden],true),{state:'HIDDEN',post:hidden});
});
test('notifications carry their own authorized title independently of loaded announcement pages', () => {
  const notification = { id: 'a', announcementId: 'a', title: 'Exact current notice', kind: 'ANNOUNCEMENT', createdAt: '2026-10-02T00:00:00Z', readAt: null };
  assert.equal(parseNotification(notification).title, 'Exact current notice');
  assert.throws(() => parseNotification({ ...notification, title: undefined }), LearningApiError);
});

test('closed group metadata cannot offer new posting and revisions must remain positive',()=>{
 const room={id:'r',classId:'c',name:'Closed group',type:'GROUP',ownerId:'t',status:'CLOSED',revision:2,canModerate:false,canPost:false,privateTopic:'cuevo:school:room:r'};assert.equal(parseRoom(room).status,'CLOSED');assert.throws(()=>parseRoom({...room,canPost:true}),LearningApiError);assert.throws(()=>parseRoom({...room,revision:0}),LearningApiError);
});

test('corrected announcement metadata requires positive revision and boolean management scope',()=>{
 const row={id:'a',classId:'c',title:'Current corrected notice',body:'Current source',parentVisible:true,createdAt:'2026-10-02T00:00:00Z',readAt:null,revision:2,canManage:false};assert.equal(parseAnnouncement(row).revision,2);assert.throws(()=>parseAnnouncement({...row,revision:0}),LearningApiError);assert.throws(()=>parseAnnouncement({...row,canManage:'yes'}),LearningApiError);
});
