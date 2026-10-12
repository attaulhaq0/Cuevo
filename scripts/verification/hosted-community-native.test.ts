import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from './release-review';
import { hostedCommunityRecipeText as text, parseHostedCommunityCommand, reduceHostedCommunityReceipt, type HostedCommunityScope } from './hosted-community-command';
import type { HostedCommunityNativeSelection, HostedCommunityNativeEvidence, HostedCommunityNativeSource } from './hosted-community-native';
import { readHostedCommunityNativeRows } from '../database/hosted-community-native-read';

// RED proves missing behavior without making module resolution the test failure.
const implementation = await import('./hosted-community-native').catch(error => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
  return undefined;
});
test('finite community native selection has a purpose-specific owner', () => {
  assert.equal(typeof implementation?.selectHostedCommunityNativeSelection, 'function', 'finite native Community selection is missing');
});
test('native evidence cannot certify authority from supplied data', () => {
  assert.equal(typeof implementation?.validateHostedCommunityNativeEvidence, 'function', 'finite native Community validator is missing');
  const result = implementation!.validateHostedCommunityNativeEvidence({});
  assert.equal(result.status, 'REQUIRES_REVIEW');
  assert.equal(result.nativeExecutionVerified, false);
  assert.equal(result.officialAdmissionVerified, false);
  assert.equal(result.hostedAcceptance, false);
});

test('native command proof retains the exact processed outbox event identity for delivered invalidation correlation',()=>{
  const value=fixture(),result=implementation!.validateHostedCommunityNativeEvidence(value);
  assert.equal(result.status,'VERIFIED');
  assert.deepEqual(result.commands.map(row=>row.eventId),value.evidence.commands.map(row=>row.events[0].id));
  assert.equal(new Set(result.commands.map(row=>row.eventId)).size,18);
});

const digest = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const textHash = (value: string) => createHash('sha256').update(value).digest('hex');
const id = (value: number) => `90000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const tuple = { schoolId: '10000000-0000-4000-8000-000000000001', classId: '30000000-0000-4000-8000-000000000001',
  teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012',
  peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072' } as const;
const baseClock = Date.parse('2026-10-12T01:00:00.000Z');
const clock = (offset: number) => new Date(baseClock + offset).toISOString();
const auxiliaryFacts = { outside_role: 'student', outside_enrolled: false, foreign_school_active: true,
  foreign_role: 'student', foreign_current_main_membership: false, foreign_community_enabled: true };
function fixture(length = 18, mode: 'FULL_RECIPE' | 'ORIGINAL_RECONCILIATION' = 'FULL_RECIPE') {
  const identity = { projectRef: 'abcdefghijklmnopqrst', schoolId: tuple.schoolId, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
    ciRunId: '123', runId: '456', runAttempt: 1, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_community',
    uiArtifactSha256: 'd'.repeat(64), journalSha256: 'e'.repeat(64), companionManifestSha256: 'f'.repeat(64) };
  const journalIdentity = { projectRef: identity.projectRef, schoolId: identity.schoolId, sourceSha: identity.sourceSha, treeSha: identity.treeSha,
    ciRunId: identity.ciRunId, runId: identity.runId, runAttempt: identity.runAttempt, backendTransferSha256: identity.backendTransferSha256, webDeploymentId: identity.webDeploymentId };
  const scope: HostedCommunityScope = { ...tuple, synthetic: true, group: null, postIds: [], announcement: null };
  const selection: HostedCommunityNativeSelection = { identity, scope, mode, originals: [] };
  const evidence: HostedCommunityNativeEvidence = { purpose: 'CUEVO_HOSTED_COMMUNITY_NATIVE', identity,
    current: { synthetic: true, school_id: tuple.schoolId, class_id: tuple.classId, school_active: true, class_active: true, community_enabled: true,
      teacher_role: 'teacher', student_role: 'student', peer_role: 'student', parent_role: 'parent', teacher_assigned: true, student_enrolled: true, peer_enrolled: true, parent_linked: true },
    commands: [], cleanup: { room_id: id(1), base_status: 'ACTIVE', group_state: length >= 17 ? 'CLOSED' : 'ACTIVE', group_revision: length >= 17 ? 2 : 1,
      announcement_id: length >= 14 ? id(14) : null, announcement_state: length >= 18 ? 'WITHDRAWN' : length >= 14 ? 'PUBLISHED' : null, announcement_revision: length >= 18 ? 2 : length >= 14 ? 1 : null,
      student_member_status: length >= 16 ? 'revoked' : 'active', peer_member_status: length >= 3 ? 'revoked' : length >= 2 ? 'active' : null,
      student_configured_by: tuple.teacherActorId, peer_configured_by: length >= 2 ? tuple.teacherActorId : null,
      student_member_change_id: length >= 16 ? id(16) : null, peer_member_change_id: length >= 3 ? id(3) : length >= 2 ? id(2) : null,
      student_restriction_id: length >= 11 ? id(11) : length >= 10 ? id(10) : null, post_moderation_id: length >= 13 ? id(13) : length >= 12 ? id(12) : null,
      reaction_active: length >= 7 ? false : length >= 6 ? true : null, student_restriction: length === 10 ? 'MUTED' : 'NONE', post_hidden: length === 12 } };
  for (let index = 0; index < length; index++) {
    const group = scope.group?.id, post = scope.postIds[0], announcement = scope.announcement?.id;
    const recipes: readonly (readonly [string, Record<string, unknown>])[] = [
      ['/v1/community/rooms', { classId: tuple.classId, name: text.groupName, type: 'GROUP', memberIds: [tuple.studentActorId] }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.peerActorId, status: 'active', confirmAccessChange: true }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.peerActorId, status: 'revoked', confirmAccessChange: true }],
      [`/v1/community/rooms/${group}/posts`, { body: text.postBody, replyToId: null, mentionActorIds: [] }],
      [`/v1/community/rooms/${group}/posts`, { body: text.secondPostBody, replyToId: null, mentionActorIds: [] }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: true }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: false }],
      [`/v1/community/rooms/${group}/posts`, { body: text.replyBody, replyToId: post, mentionActorIds: [] }],
      [`/v1/community/posts/${post}/report`, { reason: text.reportReason }],
      [`/v1/community/rooms/${group}/restrict`, { actorId: tuple.studentActorId, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/rooms/${group}/restrict`, { actorId: tuple.studentActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true }],
      ['/v1/community/announcements', { classId: tuple.classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }],
      [`/v1/community/notifications/${announcement}/read`, { expectedRevision: 1 }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.studentActorId, status: 'revoked', confirmAccessChange: true }],
      [`/v1/community/groups/${group}/lifecycle`, { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true }],
      [`/v1/community/announcements/${announcement}/withdraw`, { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true }],
    ];
    const [path, body] = recipes[index], actorId = index === 14 ? tuple.parentActorId : [3, 4, 5, 6, 7, 8].includes(index) ? tuple.studentActorId : tuple.teacherActorId;
    const role: 'parent' | 'student' | 'teacher' = index === 14 ? 'parent' : actorId === tuple.studentActorId ? 'student' : 'teacher';
    const actor = { actorId, schoolId: tuple.schoolId, role }, rawBytes = JSON.stringify(body), command = parseHostedCommunityCommand(path, rawBytes, actor, scope);
    const receiptId = [5, 6].includes(index) ? post! : index === 14 ? announcement! : index === 16 ? group! : index === 17 ? announcement! : id(index + 1);
    const response: Record<string, unknown> = index === 14 ? { id: receiptId, status: 'READ', revision: 1 }
      : index === 16 ? { id: receiptId, revision: 2, status: 'CLOSED' } : index === 17 ? { id: receiptId, revision: 2, status: 'WITHDRAWN' }
        : { id: receiptId, command: command.owner === 'normal' ? command.nativeCommand : '' };
    if (index === 0) response.roomId = receiptId;
    if (command.operation === 'post.create') Object.assign(response, { roomId: group, body: body.body, replyToId: body.replyToId, actorId, createdAt: clock(index * 1000 + 30), status: 'VISIBLE' });
    const key = 'community-original-' + index, original = { identity: journalIdentity,
      command: { step: command.operation, actorId, role, schoolId: tuple.schoolId, path, operation: command.operation,
        sourceIds: command.sourceIds, sourceRevision: command.sourceRevision, key, requestBodySha256: command.requestBodySha256 },
      intentSequence: index * 4 + 1, intentRecordSha256: digest({ index, key }) };
    const receiptIdentity = reduceHostedCommunityReceipt(response, { path, rawBytes, key, requestBodySha256: command.requestBodySha256, nativeFingerprint: command.nativeFingerprint }, actor, scope);
    selection.originals.push({ original, targetId: command.targetId, nativeFingerprint: command.nativeFingerprint, requestBodySha256: command.requestBodySha256, input: command.input,
      http: { status: 200, requestId: 'request-' + index, receiptSha256: digest(response), receiptIdentity } });
    const common = { id: receiptId, school_id: tuple.schoolId, created_at: clock(index * 1000 + 10) }, authored = { ...common, actor_id: actorId };
    let source: HostedCommunityNativeSource;
    if (index === 0) source = { ...common, class_id: tuple.classId, type: 'GROUP', owner_id: actorId, status: 'ACTIVE', policy_version: 1, name_sha256: textHash(text.groupName) };
    else if ([1, 2, 15].includes(index)) source = { ...common, room_id: group!, target_actor_id: String(body.actorId), status: body.status as 'active' | 'revoked', configured_by: actorId };
    else if ([3, 4, 7].includes(index)) source = { ...authored, room_id: group!, reply_to_id: body.replyToId as string | null, body_sha256: textHash(String(body.body)) };
    else if ([5, 6].includes(index)) source = { school_id: tuple.schoolId, post_id: post!, actor_id: actorId, reaction: 'HELPFUL', active: length < 7 };
    else if (index === 8) source = { ...authored, post_id: post!, reason_sha256: textHash(text.reportReason) };
    else if ([9, 10].includes(index)) source = { ...authored, room_id: group!, target_actor_id: tuple.studentActorId, restriction: body.restriction as 'MUTED' | 'NONE', reason_sha256: textHash(text.restrictionReason) };
    else if ([11, 12].includes(index)) source = { ...authored, post_id: post!, action: body.action as 'HIDE' | 'RESTORE', reason_sha256: textHash(text.moderationReason) };
    else if (index === 13) source = { ...authored, class_id: tuple.classId, title_sha256: textHash(text.announcementTitle), body_sha256: textHash(text.announcementBody), parent_visible: true };
    else if (index === 14) source = { school_id: tuple.schoolId, announcement_id: announcement!, revision: 1, actor_id: actorId, read_at: clock(index * 1000 + 10) };
    else if (index === 16) source = { ...authored, id: id(201), room_id: group!, revision: 2, name_sha256: textHash(text.groupName), state: 'CLOSED', reason_sha256: textHash(text.groupClosureReason) };
    else source = { ...authored, id: id(202), announcement_id: announcement!, revision: 2, title_sha256: textHash(text.announcementTitle), body_sha256: textHash(text.announcementBody), parent_visible: true, state: 'WITHDRAWN', reason_sha256: textHash(text.announcementWithdrawalReason) };
    const maintenance = command.owner === 'maintenance', entityId = maintenance && 'id' in source ? source.id : receiptId;
    const entityType = maintenance ? 'community_maintenance' : 'community', eventId = id(300 + index), roomId = [13, 14].includes(index) ? null : index === 0 ? receiptId : group!;
    const response_sha256 = digest(response), minimized = { ...response }; delete minimized.body;
    evidence.commands.push({ intentSequence: original.intentSequence,
      ledger: [{ school_id: tuple.schoolId, actor_id: actorId, key, command: command.ledgerCommand, fingerprint: command.nativeFingerprint, state: 'COMPLETED', response: minimized as HostedCommunityNativeEvidence['commands'][number]['ledger'][number]['response'], response_sha256, created_at: clock(index * 1000), completed_at: clock(index * 1000 + 100) }], source: [source],
      audits: [{ id: id(400 + index), school_id: tuple.schoolId, actor_id: actorId, action: command.ledgerCommand, entity_type: entityType, entity_id: entityId,
        request_id: 'request-' + index, outcome: 'succeeded', metadata: maintenance ? { sourceId: command.targetId!, revision: 2, kind: command.nativeKind } : index === 14 ? { revision: 1 } : {}, occurred_at: clock(index * 1000 + 40) }],
      events: [{ id: eventId, school_id: tuple.schoolId, actor_id: actorId, type: maintenance ? 'community.maintenance.changed' : command.operation === 'post.create' ? 'community.post_created' : index === 8 ? 'moderation.reported' : 'community.changed',
        entity_type: entityType, entity_id: entityId, version: maintenance ? 2 : 1, metadata: maintenance ? { kind: command.nativeKind, sourceId: command.targetId! } : { roomId },
        deduplication_key: maintenance ? 'community-maintenance:' + entityId : index === 14 ? 'community-read:' + announcement + ':1:' + actorId : 'community:' + createHash('md5').update(actorId + (command.owner === 'normal' ? command.nativeCommand : '') + key).digest('hex'),
        occurred_at: clock(index * 1000 + 50), state: 'COMPLETED', attempt_count: 1, max_attempts: 5, available_at: clock(index * 1000 + 50), lease_token: null, lease_until: null, completed_at: clock(index * 1000 + 200), last_error_code: null }],
      broadcasts: maintenance ? [] : [{ event_id: eventId, broadcast_at: clock(index * 1000 + 170) }],
      processed: maintenance ? [{ event_id: eventId, school_id: tuple.schoolId, processed_at: clock(index * 1000 + 170) }] : [],
      messages: maintenance || roomId === null ? [] : [{ event_id: eventId, room_id: roomId, topic: 'cuevo:' + tuple.schoolId + ':room:' + roomId, extension: 'broadcast', event: 'invalidate', private: true, payload_sha256: digest({ eventId, roomId }), inserted_at: clock(index * 1000 + 150) }],
    });
    if (index === 0) scope.group = { id: receiptId, revision: 1 };
    else if ([3, 4, 7].includes(index)) scope.postIds.push(receiptId);
    else if (index === 13) scope.announcement = { id: receiptId, revision: 1 };
    else if (index === 16) scope.group!.revision = 2;
    else if (index === 17) scope.announcement!.revision = 2;
  }
  return { ...selection, observedAt: clock(20000), evidence };
}

test('full recipe validates exact native rows, private invalidations and distinct cleanup', () => {
  const value = fixture(), result = implementation!.validateHostedCommunityNativeEvidence(value);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.chainVerified, true); assert.equal(result.cleanupVerified, true); assert.equal(result.commands.length, 18);
  assert.equal(result.nativeExecutionVerified, false); assert.equal(result.officialAdmissionVerified, false); assert.equal(result.hostedAcceptance, false); assert.equal(result.referenceRestored, false);
  assert.equal(JSON.stringify(result).includes(text.postBody), false);
});
test('every exact prefix reconciles originals while withholding full recipe and cleanup', () => {
  for (let length = 1; length <= 18; length++) {
    const result = implementation!.validateHostedCommunityNativeEvidence(fixture(length, 'ORIGINAL_RECONCILIATION'));
    assert.equal(result.status, 'ORIGINAL_RECONCILIATION_VERIFIED', 'prefix ' + length); assert.equal(result.chainVerified, false); assert.equal(result.cleanupVerified, false);
    assert.equal(result.commands.length, length);
  }
});

function livePrefixFixture(length = 15) {
  const value = fixture(length, 'ORIGINAL_RECONCILIATION');
  const { uiArtifactSha256: _archive, journalSha256: _journal, companionManifestSha256: _manifest, ...journalIdentity } = value.identity;
  void _archive; void _journal; void _manifest;
  const identity = { ...journalIdentity, evidenceSource: 'LIVE_PREFIX' as const,
    prefixSnapshotSha256: digest({ snapshot: length }), journalHeadSha256: digest({ head: length }), companionInventorySha256: digest({ companions: length }) };
  return { selection: { identity, scope: value.scope, mode: 'LIVE_PREFIX' as const, originals: value.originals },
    observedAt: value.observedAt, evidence: { ...value.evidence, identity, current: { ...value.evidence.current, class_room_id: id(800), ...auxiliaryFacts } } };
}

test('LIVE_PREFIX requires current positive auxiliary identities and source-backed class tenant exclusions', () => {
  const value = livePrefixFixture(); assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence(value).status, 'LIVE_PREFIX_VERIFIED');
  for (const [field, replacement] of [['outside_role', null], ['outside_role', 'teacher'], ['outside_enrolled', true], ['foreign_school_active', false],
    ['foreign_role', null], ['foreign_role', 'admin'], ['foreign_current_main_membership', true], ['foreign_community_enabled', false]] as const) {
    const changed = structuredClone(value); (changed.evidence.current as Record<string, unknown>)[field] = replacement;
    assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence(changed).status, 'REQUIRES_REVIEW', field);
  }
  for (const field of Object.keys(auxiliaryFacts)) { const changed = structuredClone(value); delete (changed.evidence.current as Record<string, unknown>)[field]; assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence(changed).status, 'REQUIRES_REVIEW', 'missing ' + field); }
  const historical = fixture(); assert.equal(implementation!.validateHostedCommunityNativeEvidence(historical).status, 'VERIFIED');
  const partial = { ...historical, evidence: { ...historical.evidence, current: { ...historical.evidence.current, outside_role: 'student' } } };
  assert.equal(implementation!.validateHostedCommunityNativeEvidence(partial).status, 'REQUIRES_REVIEW');
});

test('LIVE_PREFIX requires the actual active native class-room identity and keeps historical artifact facts unknown', () => {
  const value = livePrefixFixture();
  const result = implementation!.validateHostedCommunityLivePrefixEvidence(value);
  assert.equal(result.status, 'LIVE_PREFIX_VERIFIED'); assert.equal(result.classRoomId, id(800));
  for (const replacement of [undefined, null, tuple.classId, value.selection.scope.group!.id, 'UNKNOWN']) {
    const changed = structuredClone(value); (changed.evidence.current as Record<string, unknown>).class_room_id = replacement;
    if (replacement === undefined) delete (changed.evidence.current as Record<string, unknown>).class_room_id;
    assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence(changed).status, 'REQUIRES_REVIEW');
  }
  const historical = fixture(); assert.equal(implementation!.validateHostedCommunityNativeEvidence(historical).status, 'VERIFIED');
  assert.equal('classRoomId' in implementation!.validateHostedCommunityNativeEvidence(historical), false);
  const current = { ...historical, evidence: { ...historical.evidence, current: { ...historical.evidence.current, class_room_id: id(800) } } };
  assert.equal(implementation!.validateHostedCommunityNativeEvidence(current).classRoomId, id(800));
});

test('LIVE_PREFIX validates exactly15 original commands without fabricating a completed UI archive or full cleanup', () => {
  assert.equal(typeof implementation?.selectHostedCommunityLivePrefixSelection, 'function', 'live prefix selection owner is missing');
  assert.equal(typeof implementation?.validateHostedCommunityLivePrefixEvidence, 'function', 'live prefix validation owner is missing');
  const value = livePrefixFixture();
  const selected = implementation!.selectHostedCommunityLivePrefixSelection(value.selection);
  assert.equal(selected.identity.evidenceSource, 'LIVE_PREFIX'); assert(Object.isFrozen(selected));
  assert.equal('uiArtifactSha256' in selected.identity, false);
  const result = implementation!.validateHostedCommunityLivePrefixEvidence(value);
  assert.equal(result.status, 'LIVE_PREFIX_VERIFIED'); assert.equal(result.commands.length, 15);
  assert.equal(result.chainVerified, false); assert.equal(result.cleanupVerified, false);
  assert.equal(result.officialAdmissionVerified, false); assert.equal(result.nativeExecutionVerified, false);
  assert.equal(result.customerReady, false); assert.equal(result.hostedAcceptance, false); assert.equal(result.referenceRestored, false);
  assert.equal(JSON.stringify(result).includes(text.postBody), false);
});

test('LIVE_PREFIX rejects shorter later mixed and artifact-shaped selections before any read', () => {
  assert.equal(typeof implementation?.selectHostedCommunityLivePrefixSelection, 'function');
  for (const length of [...Array.from({ length: 14 }, (_, index) => index + 1), 16, 17, 18]) {
    const value = livePrefixFixture(length);
    assert.throws(() => implementation!.selectHostedCommunityLivePrefixSelection(value.selection));
    assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence(value).status, 'REQUIRES_REVIEW');
  }
  const value = livePrefixFixture(), artifact = fixture(15, 'ORIGINAL_RECONCILIATION');
  for (const selection of [
    { ...value.selection, mode: 'ORIGINAL_RECONCILIATION' },
    { ...value.selection, identity: artifact.identity },
    { ...value.selection, identity: { ...value.selection.identity, uiArtifactSha256: artifact.identity.uiArtifactSha256 } },
    { ...value.selection, identity: { ...value.selection.identity, evidenceSource: 'OFFICIAL_UI_ARTIFACT_ADMISSION' } },
    { ...value.selection, identity: { ...value.selection.identity, journalHeadSha256: null } },
  ]) assert.throws(() => implementation!.selectHostedCommunityLivePrefixSelection(selection));
});

test('completed-artifact entrypoints refuse LIVE_PREFIX identities and evidence rather than relabeling them', async () => {
  const value = livePrefixFixture(); let reads = 0;
  assert.throws(() => implementation!.selectHostedCommunityNativeSelection(value.selection));
  assert.throws(() => implementation!.reconstructHostedCommunityNativeCommands(value.selection));
  assert.throws(() => implementation!.parseHostedCommunityNativeEvidence(value.evidence));
  assert.equal(implementation!.validateHostedCommunityNativeEvidence({ ...value.selection, observedAt: value.observedAt, evidence: value.evidence }).status, 'REQUIRES_REVIEW');
  const result = await implementation!.verifyHostedCommunityNativeEvidence({ ...value.selection, deadlineMs: 1000 }, {
    admitCurrentQa: async () => { reads++; }, readEvidence: async () => { reads++; return value.evidence as never; }, now: () => baseClock + 20000,
  });
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(reads, 0);
});

test('LIVE_PREFIX source original receipt clock and current native state conflicts withhold every proof', () => {
  assert.equal(typeof implementation?.validateHostedCommunityLivePrefixEvidence, 'function');
  const mutations: ((value: ReturnType<typeof livePrefixFixture>) => void)[] = [
    value => { value.selection.originals[2].original.identity.sourceSha = '1'.repeat(40); },
    value => { value.evidence.identity = { ...value.evidence.identity, prefixSnapshotSha256: '0'.repeat(64) }; },
    value => { value.evidence.identity = { ...value.evidence.identity, journalHeadSha256: '0'.repeat(64) }; },
    value => { value.evidence.identity = { ...value.evidence.identity, companionInventorySha256: '0'.repeat(64) }; },
    value => { value.selection.originals[3].input.body = 'Other content'; },
    value => { value.selection.originals[3].nativeFingerprint = '0'.repeat(64); },
    value => { value.selection.originals[3].http.receiptSha256 = '0'.repeat(64); },
    value => { value.selection.scope.group!.revision = 2; },
    value => { value.evidence.current.parent_linked = false; },
    value => { value.evidence.cleanup.group_state = 'CLOSED'; },
    value => { value.evidence.cleanup.student_member_status = 'revoked'; },
    value => { value.evidence.cleanup.peer_member_change_id = id(999); },
    value => { value.evidence.cleanup.student_restriction_id = id(999); },
    value => { value.evidence.cleanup.post_moderation_id = id(999); },
    value => { value.evidence.cleanup.student_restriction = 'MUTED'; },
    value => { value.evidence.cleanup.post_hidden = true; },
    value => { value.evidence.commands[3].broadcasts = []; },
    value => { value.evidence.commands[14].events[0].state = 'PENDING'; },
    value => { value.observedAt = clock(0); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = livePrefixFixture(); mutate(value);
    const result = implementation!.validateHostedCommunityLivePrefixEvidence(value);
    assert.equal(result.status, 'REQUIRES_REVIEW', 'conflict ' + index); assert.equal(result.commands.length, 0);
  }
});

type Fixture = ReturnType<typeof fixture>;
const tamper = (name: string, mutation: (value: Fixture) => void) => test(name, () => {
  const value = fixture(); mutation(value); const result = implementation!.validateHostedCommunityNativeEvidence(value);
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.chainVerified, false); assert.equal(result.commands.length, 0);
});
tamper('foreign journal source identity is refused', value => { value.originals[2].original.identity.sourceSha = '1'.repeat(40); });
tamper('changed current school entitlement is refused', value => { value.evidence.current.community_enabled = false; });
tamper('wrong current pupil role is refused', value => { value.evidence.current.student_role = 'teacher'; });
tamper('foreign original actor is refused', value => { value.originals[3].original.command.actorId = tuple.peerActorId; });
tamper('same key for a different intentional mutation is refused', value => { value.originals[6].original.command.key = value.originals[5].original.command.key; });
tamper('reordered or reused journal sequence is refused', value => { value.originals[4].original.intentSequence = value.originals[3].original.intentSequence; });
tamper('wrong class in normalized original input is refused', value => { value.originals[0].input.classId = id(99); });
tamper('nonfixture body is refused without retaining it in proof', value => { value.originals[3].input.body = 'unapproved sensitive prose'; });
tamper('changed companion raw body hash is refused', value => { value.originals[3].requestBodySha256 = '0'.repeat(64); });
tamper('changed journal original raw body hash is refused', value => { value.originals[3].original.command.requestBodySha256 = '0'.repeat(64); });
tamper('wrong reply source is refused', value => { value.originals[7].input.replyToId = value.scope.postIds[1]; });
tamper('unknown extra payload fields are refused', value => { value.originals[1].input.unknown = true; });
tamper('native fingerprint from another command is refused', value => { value.evidence.commands[3].ledger[0].fingerprint = '0'.repeat(64); });
tamper('academic command ledger prefix is refused', value => { value.evidence.commands[0].ledger[0].command = 'room.create'; });
tamper('native rawbody leaking into minimized receipt is refused', value => { Object.assign(value.evidence.commands[3].ledger[0].response, { body: text.postBody }); });
tamper('changed actual response hash is refused', value => { value.evidence.commands[3].ledger[0].response_sha256 = '0'.repeat(64); });
tamper('changed HTTP receipt hash is refused', value => { value.originals[3].http.receiptSha256 = '0'.repeat(64); });
tamper('source body digest mismatch is refused', value => { const source = value.evidence.commands[3].source[0]; if ('body_sha256' in source) source.body_sha256 = '0'.repeat(64); });
tamper('same source actor and object from another school is refused', value => { value.evidence.commands[3].source[0].school_id = id(999); });
tamper('same source immutable timestamp outside original command is refused', value => { const source = value.evidence.commands[3].source[0]; if ('created_at' in source) source.created_at = clock(20000); });
tamper('immutable maintenance source after its audit inside the same ledger window is refused', value => {
  const source = value.evidence.commands[16].source[0]; if ('created_at' in source) source.created_at = clock(16099);
});
tamper('immutable read source after its audit inside the same ledger window is refused', value => {
  const source = value.evidence.commands[14].source[0]; if ('read_at' in source) source.read_at = clock(14099);
});
tamper('distinct original commands cannot reuse one immutable intent record hash', value => {
  for (const original of value.originals) original.original.intentRecordSha256 = value.originals[0].original.intentRecordSha256;
});
tamper('native receipt timestamp before immutable source is refused even with matching HTTP hash', value => {
  const ledger = value.evidence.commands[3].ledger[0]; ledger.response.createdAt = clock(3001); const body = value.originals[3].input.body;
  ledger.response_sha256 = digest({ ...ledger.response, body }); value.originals[3].http.receiptSha256 = ledger.response_sha256;
});
tamper('membership actor transplanted as change id is refused', value => { const source = value.evidence.commands[1].source[0]; if ('id' in source) source.id = tuple.peerActorId; });
tamper('mismatched request id is refused', value => { value.evidence.commands[8].audits[0].request_id = 'another-request'; });
tamper('audit metadata cannot carry arbitrary content', value => { Object.assign(value.evidence.commands[8].audits[0].metadata, { content: 'private unknown prose' }); });
tamper('foreign event actor cannot own the command', value => { value.evidence.commands[8].events[0].actor_id = tuple.teacherActorId; });
tamper('missing immutable native source is refused', value => { value.evidence.commands[8].source = []; });
tamper('extra replay audit is refused', value => { value.evidence.commands[8].audits.push({ ...value.evidence.commands[8].audits[0], id: id(999) }); });
tamper('academic SHA256 event dedup is refused', value => { value.evidence.commands[0].events[0].deduplication_key = digest('academic-dedup'); });
tamper('notification read needs exact revision dedup', value => { value.evidence.commands[14].events[0].deduplication_key = 'community-read:' + id(14) + ':2:' + tuple.parentActorId; });
tamper('duplicate read with no original event cannot prove first-write recipe', value => { value.evidence.commands[14].audits = []; value.evidence.commands[14].events = []; });
tamper('maintenance source id cannot substitute revision entity id', value => { value.evidence.commands[16].events[0].entity_id = value.scope.group!.id; });
tamper('maintenance revision mismatch is refused', value => { value.evidence.commands[16].events[0].version = 1; });
tamper('generic processed receipt cannot substitute community broadcast', value => { const event = value.evidence.commands[3].events[0]; value.evidence.commands[3].broadcasts = []; value.evidence.commands[3].processed = [{ event_id: event.id, school_id: tuple.schoolId, processed_at: clock(3170) }]; });
tamper('broadcast receipt cannot substitute maintenance processed receipt', value => { const event = value.evidence.commands[16].events[0]; value.evidence.commands[16].processed = []; value.evidence.commands[16].broadcasts = [{ event_id: event.id, broadcast_at: clock(16170) }]; });
tamper('missing actual private message stays review', value => { value.evidence.commands[3].messages = []; });
tamper('wrong private invalidation payload digest is refused', value => { value.evidence.commands[3].messages[0].payload_sha256 = '0'.repeat(64); });
tamper('changed private invalidation room cannot prove owned source delivery', value => { value.evidence.commands[3].messages[0].room_id = id(999); });
tamper('processed receipt from another school is refused', value => { value.evidence.commands[16].processed[0].school_id = id(999); });
tamper('future ledger completion is refused', value => { value.evidence.commands[17].ledger[0].completed_at = clock(21000); });
tamper('worker completion before command commit is refused', value => { value.evidence.commands[3].events[0].completed_at = clock(3001); });
tamper('leased incomplete worker event is refused', value => { value.evidence.commands[3].events[0].lease_token = id(1000); });
tamper('mutable reaction cleanup mismatch is refused', value => { value.evidence.cleanup.reaction_active = true; });
tamper('missing main student revoke is refused', value => { value.evidence.cleanup.student_member_status = 'active'; });
tamper('foreign actor cannot claim final membership cleanup', value => { value.evidence.cleanup.student_configured_by = tuple.peerActorId; });
tamper('later same teacher student revoke cannot claim original membership cleanup', value => { value.evidence.cleanup.student_member_change_id = id(999); });
tamper('later same teacher peer revoke cannot claim original membership cleanup', value => { value.evidence.cleanup.peer_member_change_id = id(999); });
tamper('foreign latest NONE restriction cannot claim original cleanup', value => { value.evidence.cleanup.student_restriction_id = id(999); });
tamper('foreign latest RESTORE moderation cannot claim original cleanup', value => { value.evidence.cleanup.post_moderation_id = id(999); });
tamper('closure cannot claim archived source', value => { value.evidence.cleanup.base_status = 'ARCHIVED'; });
tamper('unconfirmed announcement cleanup stays review', value => { value.evidence.cleanup.announcement_state = 'PUBLISHED'; });
tamper('partial prefix cannot be a full recipe', value => { value.originals.pop(); value.evidence.commands.pop(); });

test('selection is detached and frozen before read ports consume it', () => {
  const value = fixture(), selected = implementation!.selectHostedCommunityNativeSelection({ identity: value.identity, scope: value.scope, mode: value.mode, originals: value.originals });
  assert.equal(Object.isFrozen(selected.originals[0].input), true); value.originals[0].input.name = 'changed';
  assert.equal(selected.originals[0].input.name, text.groupName);
});
test('successful worker recovery retains earlier failure code without losing completion proof', () => {
  const value = fixture(), event = value.evidence.commands[3].events[0];
  event.attempt_count = 2; event.last_error_code = 'COMMUNITY_BROADCAST_RETRY';
  assert.equal(implementation!.validateHostedCommunityNativeEvidence(value).status, 'VERIFIED');
});
test('supplied ports preserve false authority flags after successful repeated admission', async () => {
  const value = fixture(), evidence = value.evidence, selection = { identity: value.identity, scope: value.scope, mode: value.mode, originals: value.originals }; let admissions = 0, reads = 0, now = baseClock + 20000;
  const result = await implementation!.verifyHostedCommunityNativeEvidence({ ...selection, deadlineMs: 1000 }, {
    admitCurrentQa: async () => { admissions++; }, readEvidence: async () => { reads++; return evidence; }, now: () => now++,
  });
  assert.equal(result.status, 'VERIFIED'); assert.equal(admissions, 2); assert.equal(reads, 1); assert.equal(result.nativeExecutionVerified, false); assert.equal(result.officialAdmissionVerified, false);
});
test('expired or backward port clocks cannot validate a result', async () => {
  const value = fixture(), evidence = value.evidence, selection = { identity: value.identity, scope: value.scope, mode: value.mode, originals: value.originals };
  for (const clocks of [[20000, 20001, 22000], [20000, 19999]]) {
    let index = 0;
    const result = await implementation!.verifyHostedCommunityNativeEvidence({ ...selection, deadlineMs: 1000 }, {
      admitCurrentQa: async () => {}, readEvidence: async () => evidence, now: () => baseClock + clocks[Math.min(index++, clocks.length - 1)],
    }); assert.equal(result.status, 'REQUIRES_REVIEW');
  }
});

test('fixed native read projection composes with all18 command proof and excludes native prose', async () => {
  const value = fixture(), selection = { identity: value.identity, scope: value.scope, mode: value.mode, originals: value.originals };
  const queries: string[] = [], sourceMarkers = ['SOURCE_ROOM', 'SOURCE_MEMBER', 'SOURCE_MEMBER', 'SOURCE_POST', 'SOURCE_POST', 'SOURCE_REACTION', 'SOURCE_REACTION', 'SOURCE_POST', 'SOURCE_REPORT', 'SOURCE_RESTRICTION', 'SOURCE_RESTRICTION', 'SOURCE_MODERATION', 'SOURCE_MODERATION', 'SOURCE_ANNOUNCEMENT', 'SOURCE_READ', 'SOURCE_MEMBER', 'SOURCE_GROUP_REVISION', 'SOURCE_ANNOUNCEMENT_REVISION'];
  let currentIndex = -1;
  const read = await readHostedCommunityNativeRows(selection, { check() {}, async rows(sql, args, maximum) {
    queries.push(sql); assert.equal(maximum, 1); assert(sql.includes('limit 2') || sql.includes('CURRENT_SCOPE'));
    assert.equal(args.includes(text.postBody), false); assert.equal(args.includes(text.reportReason), false);
    assert(!/(?:^|\s)(?:insert|update|delete|create|alter|drop|process_community_event|claim_outbox)\b/i.test(sql));
    if (sql.includes('CURRENT_SCOPE')) return [structuredClone(value.evidence.current)];
    if (sql.includes('CLEANUP')) return [structuredClone(value.evidence.cleanup)];
    if (sql.includes('COMMUNITY_ORIGINAL')) {
      currentIndex = value.originals.findIndex(item => item.original.command.key === args[2]); assert(currentIndex >= 0);
      const ledger = value.evidence.commands[currentIndex].ledger[0], item = value.originals[currentIndex], raw: Record<string, unknown> = { ...ledger.response };
      if (item.original.command.operation === 'post.create') raw.body = item.input.body;
      const result = { ...ledger, response: raw }; delete (result as Partial<typeof result>).response_sha256;
      return [result];
    }
    const row = value.evidence.commands[currentIndex];
    if (sql.includes(sourceMarkers[currentIndex])) return structuredClone(row.source);
    if (sql.includes('COMMUNITY_AUDIT')) return structuredClone(row.audits);
    if (sql.includes('COMMUNITY_OUTBOX')) return structuredClone(row.events);
    if (sql.includes('COMMUNITY_BROADCAST')) return structuredClone(row.broadcasts);
    if (sql.includes('COMMUNITY_PROCESSED')) return structuredClone(row.processed);
    if (sql.includes('COMMUNITY_MESSAGE')) return row.messages.map(message => { const result = { ...message, payload_matches: true }; delete (result as Partial<typeof result>).payload_sha256; return result; });
    throw Error('Unknown fixed query marker');
  } });
  assert.equal(queries.filter(sql => sql.includes('COMMUNITY_ORIGINAL')).length, 18);
  assert.equal(queries.filter(sql => sql.includes('COMMUNITY_MESSAGE')).length, 14);
  assert.equal(JSON.stringify(read).includes(text.postBody), false);
  assert.equal(implementation!.validateHostedCommunityNativeEvidence({ ...selection, observedAt: value.observedAt, evidence: read }).status, 'VERIFIED');
});

test('LIVE_PREFIX consumes the same finite native read projection with actual checkpoint identities', async () => {
  const value = livePrefixFixture(), queries: string[] = [];
  let currentIndex = -1;
  const read = await readHostedCommunityNativeRows(value.selection, { check() {}, async rows(sql, args, maximum) {
    queries.push(sql); assert.equal(maximum, 1);
    if (sql.includes('CURRENT_SCOPE')) return [structuredClone(value.evidence.current)];
    if (sql.includes('CLEANUP')) return [structuredClone(value.evidence.cleanup)];
    if (sql.includes('COMMUNITY_ORIGINAL')) {
      currentIndex = value.selection.originals.findIndex(item => item.original.command.key === args[2]); assert(currentIndex >= 0);
      const ledger = value.evidence.commands[currentIndex].ledger[0], item = value.selection.originals[currentIndex], raw: Record<string, unknown> = { ...ledger.response };
      if (item.original.command.operation === 'post.create') raw.body = item.input.body;
      const result = { ...ledger, response: raw }; delete (result as Partial<typeof result>).response_sha256; return [result];
    }
    const row = value.evidence.commands[currentIndex];
    if (sql.includes('COMMUNITY_SOURCE_')) return structuredClone(row.source);
    if (sql.includes('COMMUNITY_AUDIT')) return structuredClone(row.audits);
    if (sql.includes('COMMUNITY_OUTBOX')) return structuredClone(row.events);
    if (sql.includes('COMMUNITY_BROADCAST')) return structuredClone(row.broadcasts);
    if (sql.includes('COMMUNITY_PROCESSED')) return structuredClone(row.processed);
    if (sql.includes('COMMUNITY_MESSAGE')) return row.messages.map(message => { const result = { ...message, payload_matches: true }; delete (result as Partial<typeof result>).payload_sha256; return result; });
    throw Error('Unknown fixed query marker');
  } });
  assert.equal(queries.filter(sql => sql.includes('COMMUNITY_ORIGINAL')).length, 15);
  assert.equal('uiArtifactSha256' in read.identity, false);
  assert.equal(JSON.stringify(read).includes(text.postBody), false);
  assert.equal(implementation!.validateHostedCommunityLivePrefixEvidence({ ...value, evidence: read }).status, 'LIVE_PREFIX_VERIFIED');
  assert.throws(() => implementation!.parseHostedCommunityNativeEvidence(read));
});
