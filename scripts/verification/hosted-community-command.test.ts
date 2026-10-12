import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

// The first RED run asserts missing behavior, rather than failing module loading.
const implementation = await import('./hosted-community-command').catch(error => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
  return undefined;
});
const parser = () => {
  assert.equal(typeof implementation?.parseHostedCommunityCommand, 'function', 'finite Community parser is missing');
  return implementation!.parseHostedCommunityCommand;
};
const reducer = () => {
  assert.equal(typeof implementation?.reduceHostedCommunityReceipt, 'function', 'minimized Community receipt reducer is missing');
  return implementation!.reduceHostedCommunityReceipt;
};
const schoolId = '10000000-0000-4000-8000-000000000001';
const classId = '30000000-0000-4000-8000-000000000001';
const teacherActorId = '20000000-0000-4000-8000-000000000004';
const studentActorId = '20000000-0000-4000-8000-000000000012';
const peerActorId = '20000000-0000-4000-8000-000000000018';
const parentActorId = '20000000-0000-4000-8000-000000000072';
const groupId = '90000000-0000-4000-8000-000000000001';
const postId = '90000000-0000-4000-8000-000000000002';
const replyId = '90000000-0000-4000-8000-000000000003';
const announcementId = '90000000-0000-4000-8000-000000000004';
const changeId = '90000000-0000-4000-8000-000000000005';
const foreignId = '90000000-0000-4000-8000-000000000099';
const teacher = { actorId: teacherActorId, schoolId, role: 'teacher' as const };
const student = { actorId: studentActorId, schoolId, role: 'student' as const };
const peer = { actorId: peerActorId, schoolId, role: 'student' as const };
const parent = { actorId: parentActorId, schoolId, role: 'parent' as const };
const scope = () => ({ synthetic: true as const, schoolId, classId, teacherActorId, studentActorId, peerActorId, parentActorId,
  group: { id: groupId, revision: 1 }, postIds: [postId, replyId], announcement: { id: announcementId, revision: 1 } });
const emptyScope = () => ({ ...scope(), group: null, postIds: [], announcement: null });
const text = {
  groupName: 'Checking our learning together',
  postBody: 'This fictional practice helped me check each step.',
  replyBody: 'I checked the fictional example again and compared the steps.',
  reportReason: 'Please review this fictional practice discussion.',
  moderationReason: 'Reviewed the fictional practice discussion with the group.',
  restrictionReason: 'Reviewed participation in this fictional practice group.',
  announcementTitle: 'Our fictional practice update',
  announcementBody: 'We practised checking each step in a fictional learning activity.',
  groupClosureReason: 'The fictional practice group has finished.',
  announcementWithdrawalReason: 'The fictional practice update has finished.',
};
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const parse = (path: string, body: unknown, actor: unknown = teacher, selected: unknown = scope()) => parser()(path, JSON.stringify(body), actor, selected);
const original = (path: string, body: unknown, actor: unknown = teacher, selected: unknown = scope()) => {
  const rawBytes = JSON.stringify(body), parsed = parser()(path, rawBytes, actor, selected);
  return { path, rawBytes, key: 'hosted-community-original-key', requestBodySha256: parsed.requestBodySha256, nativeFingerprint: parsed.nativeFingerprint };
};
const rejected = (path: string, body: unknown, actor: unknown = teacher, selected: unknown = scope()) => {
  const run = parser();
  assert.throws(() => run(path, JSON.stringify(body), actor, selected), /requires review; private contents withheld/);
};

test('normal routes produce the current native command fingerprint and finite source metadata', () => {
  const run = parser();
  const cases = [
    { path: '/v1/community/rooms', operation: 'room.create', nativeCommand: 'room.create', actor: teacher, selected: emptyScope(),
      body: { classId, name: text.groupName, type: 'GROUP', memberIds: [studentActorId] }, target: null, sources: [classId, studentActorId] },
    { path: `/v1/community/rooms/${groupId}/members`, operation: 'member.configure', nativeCommand: 'member.configure', actor: teacher, selected: scope(),
      body: { actorId: peerActorId, status: 'active', confirmAccessChange: true }, target: groupId, sources: [groupId, peerActorId] },
    { path: `/v1/community/rooms/${groupId}/posts`, operation: 'post.create', nativeCommand: 'post.create', actor: student, selected: scope(),
      body: { body: text.postBody, replyToId: null }, target: groupId, sources: [groupId] },
    { path: `/v1/community/posts/${postId}/reactions`, operation: 'reaction.configure', nativeCommand: 'reaction.configure', actor: peer, selected: scope(),
      body: { reaction: 'HELPFUL', active: true }, target: postId, sources: [postId, groupId] },
    { path: `/v1/community/posts/${postId}/report`, operation: 'post.report', nativeCommand: 'report.create', actor: peer, selected: scope(),
      body: { reason: text.reportReason }, target: postId, sources: [postId, groupId] },
    { path: `/v1/community/posts/${postId}/moderate`, operation: 'post.moderate', nativeCommand: 'post.moderate', actor: teacher, selected: scope(),
      body: { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }, target: postId, sources: [postId, groupId] },
    { path: `/v1/community/rooms/${groupId}/restrict`, operation: 'room.restrict', nativeCommand: 'room.restrict', actor: teacher, selected: scope(),
      body: { actorId: studentActorId, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true }, target: groupId, sources: [groupId, studentActorId] },
    { path: '/v1/community/announcements', operation: 'announcement.create', nativeCommand: 'announcement.create', actor: teacher, selected: { ...scope(), announcement: null },
      body: { classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }, target: null, sources: [classId] },
    { path: `/v1/community/notifications/${announcementId}/read`, operation: 'notification.read', nativeCommand: 'notification.read', actor: parent, selected: scope(),
      body: { expectedRevision: 1 }, target: announcementId, sources: [announcementId] },
  ];
  for (const item of cases) {
    const raw = JSON.stringify(item.body), parsed = run(item.path, raw, item.actor, item.selected);
    assert.equal(parsed.operation, item.operation);
    assert.equal(parsed.owner, 'normal');
    assert.equal(parsed.nativeCommand, item.nativeCommand);
    assert.equal(parsed.ledgerCommand, `community.${item.nativeCommand}`);
    assert.equal(parsed.targetId, item.target);
    assert.deepEqual(parsed.sourceIds, item.sources);
    assert.equal(parsed.sourceRevision, item.operation === 'notification.read' ? 1 : null);
    assert.equal(parsed.requestBodySha256, digest(raw));
    assert.equal(parsed.nativeFingerprint, digest(JSON.stringify({ command: item.nativeCommand, target: item.target, input: item.body })));
    assert.equal('nativeKind' in parsed, false);
  }
});

test('raw bytes remain distinct from the schema-normalized native fingerprint', () => {
  const run = parser(), path = `/v1/community/rooms/${groupId}/posts`;
  const first = ` { "body": "  ${text.postBody}  " } `;
  const second = JSON.stringify({ replyToId: null, body: text.postBody });
  const a = run(path, first, student, scope()), b = run(path, new TextEncoder().encode(second), student, scope());
  assert.deepEqual(a.input, { body: text.postBody, replyToId: null });
  assert.equal(a.nativeFingerprint, digest(`{"command":"post.create","target":"${groupId}","input":{"body":"${text.postBody}","replyToId":null}}`));
  assert.equal(a.nativeFingerprint, b.nativeFingerprint);
  assert.notEqual(a.requestBodySha256, b.requestBodySha256);
  assert.equal(a.requestBodySha256, digest(first));
  assert.equal(b.requestBodySha256, digest(second));
});

test('maintenance uses kind target input rather than the normal command recipe', () => {
  const run = parser();
  for (const item of [
    { path: `/v1/community/groups/${groupId}/lifecycle`, operation: 'group.lifecycle', kind: 'group', target: groupId,
      body: { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true } },
    { path: `/v1/community/announcements/${announcementId}/withdraw`, operation: 'announcement.withdraw', kind: 'withdraw', target: announcementId,
      body: { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true } },
  ]) {
    const parsed = run(item.path, JSON.stringify(item.body), teacher, scope());
    assert.equal(parsed.operation, item.operation);
    assert.equal(parsed.owner, 'maintenance');
    assert.equal(parsed.nativeKind, item.kind);
    assert.equal(parsed.ledgerCommand, `community.maintenance.${item.kind}`);
    assert.equal('nativeCommand' in parsed, false);
    assert.deepEqual(parsed.sourceIds, [item.target]);
    assert.equal(parsed.sourceRevision, 1);
    assert.equal(parsed.nativeFingerprint, digest(JSON.stringify({ kind: item.kind, target: item.target, input: item.body })));
  }
});

test('malformed duplicate-key unknown-field and invalid UTF8 input cannot become intent', () => {
  const run = parser(), path = `/v1/community/rooms/${groupId}/posts`;
  for (const bytes of ['null', '[]', '{}', '{', '{"body":"x","body":"y"}', `{"body":"x","\\u0062ody":"${text.postBody}"}`, JSON.stringify({ body: text.postBody, attachmentId: foreignId }), ' '.repeat(65537), new Uint8Array([0xc3, 0x28])]) {
    assert.throws(() => run(path, bytes, student, scope()), /requires review; private contents withheld/);
  }
});

test('unsupported routes URL query encoding maintenance kind and academic operations refuse', () => {
  const run = parser();
  for (const path of [`https://cuevo.test/v1/community/rooms/${groupId}/posts`, `/v1/community/rooms/${groupId}/posts?new=true`, `/v1/community/rooms/${groupId}/posts/`, `/v1/community/rooms/${groupId.replaceAll('-', '%2d')}/posts`, `/v1/community/reports/${postId}/review`, `/v1/community/announcements/${announcementId}/revision`, `/v1/community/mentions/${postId}/read`, '/v1/courses', '/v1/community/rooms/../../posts']) {
    assert.throws(() => run(path, JSON.stringify({ body: text.postBody }), student, scope()), /requires review; private contents withheld/);
  }
});

test('the synthetic actor school class tuple rejects changed selectors and unknown scope facts', () => {
  const run = parser(), path = `/v1/community/rooms/${groupId}/posts`, body = JSON.stringify({ body: text.postBody });
  for (const patch of [{ synthetic: false }, { schoolId: foreignId }, { classId: foreignId }, { teacherActorId: foreignId }, { studentActorId: peerActorId }, { peerActorId: studentActorId }, { parentActorId: foreignId }, { role: 'admin' }, { group: { id: groupId, revision: 0 } }, { postIds: [postId, postId] }, { group: null }, { announcement: { id: groupId, revision: 1 } }, { group: { id: classId, revision: 1 } }]) {
    assert.throws(() => run(path, body, student, { ...scope(), ...patch }), /requires review; private contents withheld/);
  }
  for (const actor of [{ ...student, schoolId: foreignId }, { ...teacher, role: 'student' }, { ...student, role: 'teacher' }, { ...student, actorId: foreignId }, { actorId: studentActorId, schoolId, role: 'admin' }, null]) {
    assert.throws(() => run(path, body, actor, scope()), /requires review; private contents withheld/);
  }
});

test('group creation binds GROUP initial learner and exact class with no extra roster', () => {
  parser();
  const body = { classId, name: text.groupName, type: 'GROUP', memberIds: [studentActorId] };
  assert.equal(parse('/v1/community/rooms', body, teacher, emptyScope()).operation, 'room.create');
  for (const patch of [{ type: 'CLASS' }, { classId: foreignId }, { memberIds: [] }, { memberIds: [peerActorId] }, { memberIds: [studentActorId, peerActorId] }, { memberIds: [studentActorId, studentActorId] }, { memberIds: [teacherActorId] }, { memberIds: [parentActorId] }, { name: 'Unrelated room' }]) rejected('/v1/community/rooms', { ...body, ...patch }, teacher, emptyScope());
  rejected('/v1/community/rooms', body, student, emptyScope());
  rejected('/v1/community/rooms', body, teacher, scope());
});

test('staff operations require the exact teacher and pupil targets from the admitted roster', () => {
  parser();
  for (const path of [`/v1/community/rooms/${groupId}/members`, `/v1/community/rooms/${groupId}/restrict`]) {
    const body = path.endsWith('/members') ? { actorId: peerActorId, status: 'active', confirmAccessChange: true }
      : { actorId: peerActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true };
    assert.equal(parse(path, body).targetId, groupId);
    for (const actor of [student, peer, parent]) rejected(path, body, actor);
    for (const actorId of [teacherActorId, parentActorId, foreignId]) rejected(path, { ...body, actorId });
  }
  const moderate = `/v1/community/posts/${postId}/moderate`, body = { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true };
  assert.equal(parse(moderate, body).operation, 'post.moderate');
  rejected(moderate, body, peer);
  rejected(moderate, { ...body, confirmModeration: false });
});

test('owned group post and reply sources exclude unrelated objects and extra mentions', () => {
  parser();
  const body = { body: text.replyBody, replyToId: postId };
  assert.deepEqual(parse(`/v1/community/rooms/${groupId}/posts`, body, peer).sourceIds, [groupId, postId]);
  for (const patch of [{ replyToId: foreignId }, { replyToId: null }, { mentionActorIds: [studentActorId] }, { body: '<script>synthetic</script>' }, { body: 'https://example.test' }, { body: 'Unreviewed pupil text' }]) rejected(`/v1/community/rooms/${groupId}/posts`, { ...body, ...patch }, peer);
  assert.equal(parse(`/v1/community/rooms/${groupId}/posts`, { body: text.postBody, mentionActorIds: [] }, student).operation, 'post.create');
  rejected(`/v1/community/rooms/${foreignId}/posts`, { body: text.postBody }, student);
  rejected(`/v1/community/posts/${foreignId}/report`, { reason: text.reportReason }, student);
  rejected(`/v1/community/posts/${postId}/reactions`, { reaction: 'LIKES', active: true }, student);
  rejected(`/v1/community/rooms/${groupId}/posts`, { body: text.postBody }, parent);
});

test('the finite visible recipe allows two roots and a retained reply draft but refuses a fourth post before forwarding', () => {
  const run = parser();
  const selected = { ...scope(), postIds: [postId, replyId] };
  const secondPostBody = 'I compared a second fictional practice example and checked the steps.';
  const replyDraftOther = 'I kept a separate reply draft for the second fictional example.';
  assert.equal(run(`/v1/community/rooms/${groupId}/posts`, JSON.stringify({ body: secondPostBody }), student, selected).input.body, secondPostBody);
  assert.equal(run(`/v1/community/rooms/${groupId}/posts`, JSON.stringify({ body: replyDraftOther, replyToId: replyId }), student, selected).input.body, replyDraftOther);
  for (const postIds of [[postId, replyId, changeId], [postId, replyId, changeId, foreignId]]) {
    assert.throws(() => run(`/v1/community/rooms/${groupId}/posts`, JSON.stringify({ body: secondPostBody }), student, { ...selected, postIds }), /requires review; private contents withheld/);
  }
});

test('announcements and parent reads bind the owned approved class source and exact revision', () => {
  parser();
  const body = { classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true };
  for (const patch of [{ classId: null }, { classId: foreignId }, { parentVisible: false }, { title: 'Another title' }, { body: 'Another body' }]) rejected('/v1/community/announcements', { ...body, ...patch }, teacher, { ...scope(), announcement: null });
  rejected('/v1/community/announcements', body, teacher, scope());
  const path = `/v1/community/notifications/${announcementId}/read`;
  assert.equal(parse(path, { expectedRevision: 1 }, parent).sourceRevision, 1);
  for (const body of [{}, { expectedRevision: 2 }, { expectedRevision: 0 }, { expectedRevision: 1, command: 'notification.read' }]) rejected(path, body, parent);
  for (const actor of [teacher, student, peer]) rejected(path, { expectedRevision: 1 }, actor);
  rejected(`/v1/community/notifications/${foreignId}/read`, { expectedRevision: 1 }, parent);
});

test('maintenance is current exact owned-source retirement and explicit confirmation', () => {
  parser();
  const path = `/v1/community/groups/${groupId}/lifecycle`;
  const body = { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true };
  for (const patch of [{ expectedRevision: 2 }, { expectedRevision: 0 }, { state: 'ACTIVE' }, { name: 'Another group' }, { reason: 'Another reason' }, { confirmChange: false }]) rejected(path, { ...body, ...patch });
  rejected(`/v1/community/groups/${foreignId}/lifecycle`, body);
  rejected(path, body, student);
  rejected(`/v1/community/announcements/${announcementId}/withdraw`, { expectedRevision: 2, reason: text.announcementWithdrawalReason, confirmWithdrawal: true });
});

test('normal receipt reduction preserves source and change identities without saving raw body', () => {
  const reduce = reducer(); parser();
  const cases = [
    { path: '/v1/community/rooms', body: { classId, name: text.groupName, type: 'GROUP', memberIds: [studentActorId] }, actor: teacher, selected: emptyScope(),
      receipt: { id: groupId, command: 'room.create', roomId: groupId }, sourceId: groupId, changeId: null, operation: 'room.create' },
    { path: `/v1/community/rooms/${groupId}/members`, body: { actorId: peerActorId, status: 'active', confirmAccessChange: true }, actor: teacher, selected: scope(),
      receipt: { id: changeId, command: 'member.configure' }, sourceId: groupId, changeId, operation: 'member.configure' },
    { path: `/v1/community/rooms/${groupId}/posts`, body: { body: text.postBody, replyToId: null }, actor: student, selected: { ...scope(), postIds: [] },
      receipt: { id: postId, command: 'post.create', roomId: groupId, body: text.postBody, replyToId: null, actorId: studentActorId, createdAt: '2026-10-12T10:00:00Z', status: 'VISIBLE' }, sourceId: postId, changeId: null, operation: 'post.create' },
    { path: `/v1/community/posts/${postId}/reactions`, body: { reaction: 'HELPFUL', active: true }, actor: peer, selected: scope(),
      receipt: { id: postId, command: 'reaction.configure' }, sourceId: postId, changeId: null, operation: 'reaction.configure' },
    { path: `/v1/community/posts/${postId}/report`, body: { reason: text.reportReason }, actor: peer, selected: scope(),
      receipt: { id: changeId, command: 'report.create' }, sourceId: changeId, changeId: null, operation: 'post.report' },
    { path: `/v1/community/posts/${postId}/moderate`, body: { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }, actor: teacher, selected: scope(),
      receipt: { id: changeId, command: 'post.moderate' }, sourceId: postId, changeId, operation: 'post.moderate' },
    { path: `/v1/community/rooms/${groupId}/restrict`, body: { actorId: peerActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }, actor: teacher, selected: scope(),
      receipt: { id: changeId, command: 'room.restrict' }, sourceId: groupId, changeId, operation: 'room.restrict' },
    { path: '/v1/community/announcements', body: { classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }, actor: teacher, selected: { ...scope(), announcement: null },
      receipt: { id: announcementId, command: 'announcement.create' }, sourceId: announcementId, changeId: null, operation: 'announcement.create' },
  ];
  for (const item of cases) {
    const result = reduce(item.receipt, original(item.path, item.body, item.actor, item.selected), item.actor, item.selected);
    assert.equal(result.receiptId, item.receipt.id);
    assert.equal(result.sourceId, item.sourceId);
    assert.equal(result.changeId, item.changeId);
    assert.equal(result.operation, item.operation);
    assert.equal(result.revision, null);
    assert.equal(result.status, item.operation === 'post.create' ? 'VISIBLE' : null);
    assert.deepEqual(Object.keys(result).sort(), ['changeId', 'ledgerCommand', 'operation', 'owner', 'receiptId', 'revision', 'sourceId', 'status']);
    assert.equal(JSON.stringify(result).includes(text.postBody), false);
  }
});

test('maintenance receipts identify the original source while native revision-event identity remains unknown', () => {
  const reduce = reducer(); parser();
  for (const item of [
    { path: `/v1/community/groups/${groupId}/lifecycle`, body: { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true }, id: groupId, status: 'CLOSED' },
    { path: `/v1/community/announcements/${announcementId}/withdraw`, body: { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true }, id: announcementId, status: 'WITHDRAWN' },
  ]) {
    const submitted = original(item.path, item.body);
    assert.deepEqual(reduce({ id: item.id, revision: 2, status: item.status }, submitted, teacher, scope()), {
      operation: item.status === 'CLOSED' ? 'group.lifecycle' : 'announcement.withdraw', owner: 'maintenance', ledgerCommand: item.status === 'CLOSED' ? 'community.maintenance.group' : 'community.maintenance.withdraw', receiptId: item.id, sourceId: item.id, changeId: null, revision: 2, status: item.status,
    });
    for (const patch of [{ id: changeId }, { revision: 1 }, { revision: 3 }, { status: 'UNKNOWN' }, { command: 'group' }, { auditRevisionId: changeId }]) {
      assert.throws(() => reduce({ id: item.id, revision: 2, status: item.status, ...patch }, submitted, teacher, scope()), /requires review; private contents withheld/);
    }
  }
});

test('read reduction binds original parent source revision and rejects missing or broader read receipts', () => {
  const reduce = reducer(); parser();
  const submitted = original(`/v1/community/notifications/${announcementId}/read`, { expectedRevision: 1 }, parent);
  const receipt = { id: announcementId, revision: 1, status: 'READ' };
  assert.equal(reduce(receipt, submitted, parent, scope()).sourceId, announcementId);
  for (const patch of [{ id: foreignId }, { revision: 2 }, { status: 'PUBLISHED' }, { command: 'notification.read' }]) {
    assert.throws(() => reduce({ ...receipt, ...patch }, submitted, parent, scope()), /requires review; private contents withheld/);
  }
});

test('receipt binding rejects altered original body hashes native hashes paths and malformed keys', () => {
  const reduce = reducer(); parser();
  const submitted = original(`/v1/community/posts/${postId}/reactions`, { reaction: 'HELPFUL', active: true }, student);
  const receipt = { id: postId, command: 'reaction.configure' };
  for (const patch of [{ rawBytes: JSON.stringify({ reaction: 'HELPFUL', active: false }) }, { requestBodySha256: 'f'.repeat(64) }, { nativeFingerprint: 'f'.repeat(64) }, { path: `/v1/community/posts/${replyId}/reactions` }, { key: '' }, { key: ' '.repeat(20) }, { key: 'x'.repeat(201) }, { unknown: true }]) {
    assert.throws(() => reduce(receipt, { ...submitted, ...patch }, student, scope()), /requires review; private contents withheld/);
  }
  assert.equal(reduce(receipt, submitted, student, scope()).receiptId, postId);
});

test('generated change receipts cannot masquerade as actor room post or announcement sources', () => {
  const reduce = reducer(); parser();
  for (const item of [
    { path: `/v1/community/rooms/${groupId}/members`, body: { actorId: peerActorId, status: 'revoked', confirmAccessChange: true }, command: 'member.configure' },
    { path: `/v1/community/posts/${postId}/moderate`, body: { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true }, command: 'post.moderate' },
    { path: `/v1/community/rooms/${groupId}/restrict`, body: { actorId: studentActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }, command: 'room.restrict' },
  ]) {
    const submitted = original(item.path, item.body);
    for (const id of [schoolId, classId, teacherActorId, studentActorId, peerActorId, parentActorId, groupId, postId, announcementId]) {
      assert.throws(() => reduce({ id, command: item.command }, submitted, teacher, scope()), /requires review; private contents withheld/);
    }
    assert.equal(reduce({ id: changeId, command: item.command }, submitted, teacher, scope()).changeId, changeId);
  }
});

test('receipt confirmation rejects wrong command actor body source status and raw extra fields', () => {
  const reduce = reducer(); parser();
  const submitted = original(`/v1/community/rooms/${groupId}/posts`, { body: text.postBody }, student);
  const receipt = { id: postId, command: 'post.create', roomId: groupId, body: text.postBody, replyToId: null, actorId: studentActorId, createdAt: '2026-10-12T10:00:00Z', status: 'VISIBLE' };
  for (const patch of [{ id: groupId }, { roomId: foreignId }, { body: text.replyBody }, { actorId: peerActorId }, { status: 'HIDDEN' }, { replyToId: replyId }, { command: 'post.report' }, { createdAt: 'unknown' }, { pupilNotes: 'raw content' }]) {
    assert.throws(() => reduce({ ...receipt, ...patch }, submitted, student, scope()), /requires review; private contents withheld/);
  }
  for (const value of [null, [], {}, { id: '' }]) assert.throws(() => reduce(value, submitted, student, scope()), /requires review; private contents withheld/);
});

test('a new post receipt refuses an already owned post ID before recording an HTTP outcome', () => {
  const reduce = reducer(); parser();
  const submitted = original(`/v1/community/rooms/${groupId}/posts`, { body: text.replyBody, replyToId: postId }, student);
  const receipt = { id: changeId, command: 'post.create', roomId: groupId, body: text.replyBody, replyToId: postId, actorId: studentActorId, createdAt: '2026-10-12T10:00:00Z', status: 'VISIBLE' };
  for (const id of [postId, replyId]) assert.throws(() => reduce({ ...receipt, id }, submitted, student, scope()), /requires review; private contents withheld/);
  assert.equal(reduce(receipt, submitted, student, scope()).sourceId, changeId);
});

const recipeStep=()=>{
  assert.equal(typeof implementation?.requireHostedCommunityRecipeStep,'function','exact eighteen-command recipe step validator is missing');
  return implementation!.requireHostedCommunityRecipeStep;
};
function recipeStepFixture(index:number){
  const secondPostId='90000000-0000-4000-8000-000000000006',text=implementation!.hostedCommunityRecipeText;
  const selected={...emptyScope(),group:index===0?null:{id:groupId,revision:index===17?2:1},postIds:index<4?[]:index===4?[postId]:index<8?[postId,secondPostId]:[postId,secondPostId,replyId],announcement:index<14?null:{id:announcementId,revision:1}};
  const cases:readonly(readonly[string,Record<string,unknown>,typeof teacher|typeof student|typeof parent,number])[]=[
    ['/v1/community/rooms',{classId,name:text.groupName,type:'GROUP',memberIds:[studentActorId]},teacher,1],
    [`/v1/community/rooms/${groupId}/members`,{actorId:peerActorId,status:'active',confirmAccessChange:true},teacher,1],
    [`/v1/community/rooms/${groupId}/members`,{actorId:peerActorId,status:'revoked',confirmAccessChange:true},teacher,1],
    [`/v1/community/rooms/${groupId}/posts`,{body:text.postBody,replyToId:null},student,3],
    [`/v1/community/rooms/${groupId}/posts`,{body:text.secondPostBody,replyToId:null},student,3],
    [`/v1/community/posts/${postId}/reactions`,{reaction:'HELPFUL',active:true},student,3],
    [`/v1/community/posts/${postId}/reactions`,{reaction:'HELPFUL',active:false},student,3],
    [`/v1/community/rooms/${groupId}/posts`,{body:text.replyBody,replyToId:postId},student,3],
    [`/v1/community/posts/${postId}/report`,{reason:text.reportReason},student,3],
    [`/v1/community/rooms/${groupId}/restrict`,{actorId:studentActorId,restriction:'MUTED',reason:text.restrictionReason,confirmModeration:true},teacher,5],
    [`/v1/community/rooms/${groupId}/restrict`,{actorId:studentActorId,restriction:'NONE',reason:text.restrictionReason,confirmModeration:true},teacher,9],
    [`/v1/community/posts/${postId}/moderate`,{action:'HIDE',reason:text.moderationReason,confirmModeration:true},teacher,9],
    [`/v1/community/posts/${postId}/moderate`,{action:'RESTORE',reason:text.moderationReason,confirmModeration:true},teacher,9],
    ['/v1/community/announcements',{classId,title:text.announcementTitle,body:text.announcementBody,parentVisible:true},teacher,9],
    [`/v1/community/notifications/${announcementId}/read`,{expectedRevision:1},parent,11],
    [`/v1/community/rooms/${groupId}/members`,{actorId:studentActorId,status:'revoked',confirmAccessChange:true},teacher,13],
    [`/v1/community/groups/${groupId}/lifecycle`,{name:text.groupName,state:'CLOSED',expectedRevision:1,reason:text.groupClosureReason,confirmChange:true},teacher,13],
    [`/v1/community/announcements/${announcementId}/withdraw`,{expectedRevision:1,reason:text.announcementWithdrawalReason,confirmWithdrawal:true},teacher,13],
  ];
  const[path,body,actor,generation]=cases[index];return{path,body,actor,generation,selected,parsed:parser()(path,JSON.stringify(body),actor,selected)};
}
test('exact recipe step accepts all eighteen source-bound actor generation body and topology combinations',()=>{
  const run=recipeStep();for(let index=0;index<18;index++){const f=recipeStepFixture(index);run(index,f.path,f.actor,f.generation,f.selected);run(index,f.path,f.actor,f.generation,f.selected,f.parsed);}
  const f=recipeStepFixture(3),parsed=parser()(f.path,JSON.stringify({...f.body,mentionActorIds:[]}),f.actor,f.selected);run(3,f.path,f.actor,f.generation,f.selected,parsed);assert.notEqual(parsed.requestBodySha256,f.parsed.requestBodySha256);assert.notEqual(parsed.nativeFingerprint,f.parsed.nativeFingerprint,'explicit empty mention list retains its original native payload fingerprint');
});
test('exact recipe step rejects forged parsed fingerprints native identity sources and unearned topology',()=>{
  const run=recipeStep(),f=recipeStepFixture(9);
  for(const patch of [{nativeFingerprint:'f'.repeat(64)},{ledgerCommand:'community.post.moderate'},{sourceIds:[groupId,peerActorId]},{input:{...f.parsed.input,actorId:peerActorId}},{targetId:foreignId}])assert.throws(()=>run(9,f.path,f.actor,f.generation,f.selected,{...f.parsed,...patch} as typeof f.parsed));
  for(const index of [-1,0.5,18,Infinity,NaN])assert.throws(()=>run(index,f.path,f.actor,f.generation,f.selected,f.parsed));
  for(const patch of [{postIds:[]},{announcement:{id:announcementId,revision:1}},{group:{id:groupId,revision:2}}])assert.throws(()=>run(9,f.path,f.actor,f.generation,{...f.selected,...patch},f.parsed));
  assert.throws(()=>run(9,f.path,peer,f.generation,f.selected,f.parsed));assert.throws(()=>run(9,f.path,f.actor,9,f.selected,f.parsed));
});
