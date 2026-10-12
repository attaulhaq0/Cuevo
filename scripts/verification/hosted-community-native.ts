import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import { hostedCommandJournalContracts } from './hosted-command-journal-contracts';
import { hostedCommunityRecipeText, parseHostedCommunityCommand, reduceHostedCommunityReceipt,
  type HostedCommunityCommand, type HostedCommunityScope } from './hosted-community-command';

const purpose = 'CUEVO_HOSTED_COMMUNITY_NATIVE' as const;
const uuid = z.uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/), date = z.iso.datetime({ offset: true });
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER), count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestId = z.string().regex(/^[-A-Za-z0-9_.:]{1,200}$/);
const contracts = hostedCommandJournalContracts('community');
const identitySchema = contracts.originalSchema.shape.identity.extend({ uiArtifactSha256: digest, journalSha256: digest, companionManifestSha256: digest }).strict();
const tuple = {
  schoolId: '10000000-0000-4000-8000-000000000001', classId: '30000000-0000-4000-8000-000000000001',
  teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012',
  peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072',
} as const;
const scopeSchema = z.object({ synthetic: z.literal(true), schoolId: z.literal(tuple.schoolId), classId: z.literal(tuple.classId),
  teacherActorId: z.literal(tuple.teacherActorId), studentActorId: z.literal(tuple.studentActorId), peerActorId: z.literal(tuple.peerActorId), parentActorId: z.literal(tuple.parentActorId),
  group: z.object({ id: uuid, revision: positive }).strict().nullable(), postIds: z.array(uuid).max(3), announcement: z.object({ id: uuid, revision: positive }).strict().nullable(),
}).strict();
const receiptSchema = z.object({ operation: contracts.commandSchema.shape.operation, owner: z.enum(['normal', 'maintenance']),
  ledgerCommand: z.string().max(100), receiptId: uuid, sourceId: uuid, changeId: uuid.nullable(), revision: positive.nullable(),
  status: z.enum(['VISIBLE', 'READ', 'CLOSED', 'WITHDRAWN']).nullable(),
}).strict();
const originalSchema = z.object({ original: contracts.originalSchema, targetId: uuid.nullable(), nativeFingerprint: digest,
  requestBodySha256: digest,
  // Only the fixed fictional recipe survives strict reconstruction below. This
  // transient input is never returned in the public proof or used as authority.
  input: z.record(z.string(), z.unknown()), http: z.object({ status: z.literal(200), requestId, receiptSha256: digest, receiptIdentity: receiptSchema }).strict(),
}).strict();
const selectionSchema = z.object({ identity: identitySchema, scope: scopeSchema,
  mode: z.enum(['FULL_RECIPE', 'ORIGINAL_RECONCILIATION']), originals: z.array(originalSchema).min(1).max(18),
}).strict();
const livePrefixIdentitySchema = contracts.originalSchema.shape.identity.extend({ evidenceSource: z.literal('LIVE_PREFIX'),
  prefixSnapshotSha256: digest, journalHeadSha256: digest, companionInventorySha256: digest }).strict();
const livePrefixSelectionSchema = z.object({ identity: livePrefixIdentitySchema, scope: scopeSchema,
  mode: z.literal('LIVE_PREFIX'), originals: z.array(originalSchema).length(15) }).strict();
const readSelectionSchema = z.union([selectionSchema, livePrefixSelectionSchema]);
export type HostedCommunityNativeSelection = z.infer<typeof selectionSchema>;
export type HostedCommunityLivePrefixSelection = z.infer<typeof livePrefixSelectionSchema>;
export type HostedCommunityNativeReadSelection = HostedCommunityNativeSelection | HostedCommunityLivePrefixSelection;
export type HostedCommunityNativeOriginal = z.infer<typeof originalSchema>;

const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const textHash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
const fail = () => Error('Hosted Community native evidence requires review; private contents withheld.');
function requireFact(value: unknown): asserts value { if (!value) throw fail(); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

/** One finite recipe owns request ordering and normalized native fingerprints.
 * The initial scope is reconstructed; the selected final scope cannot authorize
 * an earlier request against an unrelated room or a later-created source. */
function reconstruct(selection: HostedCommunityNativeReadSelection): HostedCommunityCommand[] {
  const scope: HostedCommunityScope = { ...tuple, synthetic: true, group: null, postIds: [], announcement: null };
  const text = hostedCommunityRecipeText, result: HostedCommunityCommand[] = [], keys = new Set<string>(), intentRecords = new Set<string>(), ids = new Set<string>(Object.values(tuple));
  let previousSequence = 0;
  for (const [index, item] of selection.originals.entries()) {
    const group = scope.group?.id, post = scope.postIds[0], announcement = scope.announcement?.id;
    const members = '/v1/community/rooms/' + group + '/members', posts = '/v1/community/rooms/' + group + '/posts';
    const reactions = '/v1/community/posts/' + post + '/reactions', restrict = '/v1/community/rooms/' + group + '/restrict';
    const moderate = '/v1/community/posts/' + post + '/moderate';
    const recipes = [
      { actor: tuple.teacherActorId, role: 'teacher', path: '/v1/community/rooms', body: { classId: tuple.classId, name: text.groupName, type: 'GROUP', memberIds: [tuple.studentActorId] } },
      { actor: tuple.teacherActorId, role: 'teacher', path: members, body: { actorId: tuple.peerActorId, status: 'active', confirmAccessChange: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: members, body: { actorId: tuple.peerActorId, status: 'revoked', confirmAccessChange: true } },
      { actor: tuple.studentActorId, role: 'student', path: posts, body: { body: text.postBody, replyToId: null } },
      { actor: tuple.studentActorId, role: 'student', path: posts, body: { body: text.secondPostBody, replyToId: null } },
      { actor: tuple.studentActorId, role: 'student', path: reactions, body: { reaction: 'HELPFUL', active: true } },
      { actor: tuple.studentActorId, role: 'student', path: reactions, body: { reaction: 'HELPFUL', active: false } },
      { actor: tuple.studentActorId, role: 'student', path: posts, body: { body: text.replyBody, replyToId: post } },
      { actor: tuple.studentActorId, role: 'student', path: '/v1/community/posts/' + post + '/report', body: { reason: text.reportReason } },
      { actor: tuple.teacherActorId, role: 'teacher', path: restrict, body: { actorId: tuple.studentActorId, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: restrict, body: { actorId: tuple.studentActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: moderate, body: { action: 'HIDE', reason: text.moderationReason, confirmModeration: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: moderate, body: { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: '/v1/community/announcements', body: { classId: tuple.classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true } },
      { actor: tuple.parentActorId, role: 'parent', path: '/v1/community/notifications/' + announcement + '/read', body: { expectedRevision: 1 } },
      { actor: tuple.teacherActorId, role: 'teacher', path: members, body: { actorId: tuple.studentActorId, status: 'revoked', confirmAccessChange: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: '/v1/community/groups/' + group + '/lifecycle', body: { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true } },
      { actor: tuple.teacherActorId, role: 'teacher', path: '/v1/community/announcements/' + announcement + '/withdraw', body: { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true } },
    ];
    const recipe = recipes[index], original = item.original, actor = { actorId: recipe.actor, schoolId: tuple.schoolId, role: recipe.role };
    requireFact(same(original.identity, { projectRef: selection.identity.projectRef, schoolId: selection.identity.schoolId,
      sourceSha: selection.identity.sourceSha, treeSha: selection.identity.treeSha, ciRunId: selection.identity.ciRunId, runId: selection.identity.runId,
      runAttempt: selection.identity.runAttempt, backendTransferSha256: selection.identity.backendTransferSha256, webDeploymentId: selection.identity.webDeploymentId }));
    requireFact(original.command.schoolId === tuple.schoolId && original.command.actorId === recipe.actor && original.command.role === recipe.role
      && original.command.path === recipe.path && original.intentSequence > previousSequence && !keys.has(original.command.key) && !intentRecords.has(original.intentRecordSha256));
    keys.add(original.command.key); intentRecords.add(original.intentRecordSha256); previousSequence = original.intentSequence;
    const expected = parseHostedCommunityCommand(recipe.path, JSON.stringify(recipe.body), actor, scope);
    const parsed = parseHostedCommunityCommand(recipe.path, JSON.stringify(item.input), actor, scope);
    const expectedInput = { ...expected.input };
    if (parsed.operation === 'post.create' && 'mentionActorIds' in parsed.input) expectedInput.mentionActorIds = [];
    requireFact(same(parsed.input, expectedInput) && same(parsed.input, item.input) && item.nativeFingerprint === parsed.nativeFingerprint
      && item.requestBodySha256 === original.command.requestBodySha256
      && item.targetId === parsed.targetId && original.command.operation === parsed.operation && original.command.step === parsed.operation
      && same(original.command.sourceIds, parsed.sourceIds) && original.command.sourceRevision === parsed.sourceRevision);
    const receipt = item.http.receiptIdentity, created = ['room.create', 'post.create', 'post.report', 'announcement.create'].includes(parsed.operation);
    const changed = ['member.configure', 'post.moderate', 'room.restrict'].includes(parsed.operation);
    requireFact(receipt.operation === parsed.operation && receipt.owner === parsed.owner && receipt.ledgerCommand === parsed.ledgerCommand
      && receipt.sourceId === (created ? receipt.receiptId : parsed.targetId) && receipt.changeId === (changed ? receipt.receiptId : null));
    if (created || changed) { requireFact(!ids.has(receipt.receiptId)); ids.add(receipt.receiptId); }
    else requireFact(receipt.receiptId === parsed.targetId);
    const status = parsed.operation === 'post.create' ? 'VISIBLE' : parsed.operation === 'notification.read' ? 'READ'
      : parsed.operation === 'group.lifecycle' ? 'CLOSED' : parsed.operation === 'announcement.withdraw' ? 'WITHDRAWN' : null;
    const revision = parsed.operation === 'notification.read' ? 1 : parsed.owner === 'maintenance' ? 2 : null;
    requireFact(receipt.status === status && receipt.revision === revision);
    result.push({ ...parsed, requestBodySha256: original.command.requestBodySha256 });
    if (parsed.operation === 'room.create') scope.group = { id: receipt.receiptId, revision: 1 };
    else if (parsed.operation === 'post.create') scope.postIds.push(receipt.receiptId);
    else if (parsed.operation === 'announcement.create') scope.announcement = { id: receipt.receiptId, revision: 1 };
    else if (parsed.operation === 'group.lifecycle') scope.group!.revision = 2;
    else if (parsed.operation === 'announcement.withdraw') scope.announcement!.revision = 2;
  }
  requireFact(same(scope, selection.scope) && selection.identity.schoolId === tuple.schoolId
    && (selection.mode !== 'FULL_RECIPE' || selection.originals.length === 18));
  return result;
}

export function selectHostedCommunityNativeSelection(value: unknown): HostedCommunityNativeSelection {
  try { const selected = selectionSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); reconstruct(selected); return freeze(selected); }
  catch { throw fail(); }
}
export function reconstructHostedCommunityNativeCommands(value: unknown): readonly HostedCommunityCommand[] {
  const selected = selectHostedCommunityNativeSelection(value); return freeze(reconstruct(selected));
}

/** A current-run checkpoint has its own actual snapshot identities. It cannot
 * borrow the digest or admission meaning of a completed UI archive. */
export function selectHostedCommunityLivePrefixSelection(value: unknown): HostedCommunityLivePrefixSelection {
  try { const selected = livePrefixSelectionSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); reconstruct(selected); return freeze(selected); }
  catch { throw fail(); }
}
export function selectHostedCommunityNativeReadSelection(value: unknown): HostedCommunityNativeReadSelection {
  try { const selected = readSelectionSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); reconstruct(selected); return freeze(selected); }
  catch { throw fail(); }
}
export function reconstructHostedCommunityNativeReadCommands(value: unknown): readonly HostedCommunityCommand[] {
  return freeze(reconstruct(selectHostedCommunityNativeReadSelection(value)));
}

const minimizedResponseSchema = z.object({ id: uuid, command: z.enum(['room.create', 'member.configure', 'post.create', 'reaction.configure', 'report.create', 'post.moderate', 'room.restrict', 'announcement.create']).optional(),
  roomId: uuid.optional(), replyToId: uuid.nullable().optional(), actorId: uuid.optional(), createdAt: date.optional(), status: z.enum(['VISIBLE', 'READ', 'CLOSED', 'WITHDRAWN']).optional(), revision: positive.optional(),
}).strict();
const ledgerRow = z.object({ school_id: uuid, actor_id: uuid, key: contracts.commandSchema.shape.key, command: z.string().max(100), fingerprint: digest,
  state: z.enum(['IN_PROGRESS', 'COMPLETED']), response: minimizedResponseSchema, response_sha256: digest, created_at: date, completed_at: date.nullable() }).strict();
const auditRow = z.object({ id: uuid, school_id: uuid, actor_id: uuid, action: z.string().max(100), entity_type: z.string().max(100), entity_id: uuid,
  request_id: requestId, outcome: z.enum(['succeeded', 'denied', 'failed']), metadata: z.union([z.object({}).strict(), z.object({ revision: positive }).strict(),
    z.object({ sourceId: uuid, revision: positive, kind: z.enum(['group', 'withdraw']) }).strict()]), occurred_at: date }).strict();
const eventRow = z.object({ id: uuid, school_id: uuid, actor_id: uuid, type: z.string().max(100), entity_type: z.string().max(100), entity_id: uuid,
  version: positive, metadata: z.union([z.object({ roomId: uuid.nullable() }).strict(), z.object({ kind: z.enum(['group', 'withdraw']), sourceId: uuid }).strict()]), deduplication_key: z.string().max(200), occurred_at: date,
  state: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']), attempt_count: count, max_attempts: positive.refine(value => value <= 10),
  available_at: date, lease_token: uuid.nullable(), lease_until: date.nullable(), completed_at: date.nullable(), last_error_code: z.string().max(100).nullable() }).strict();
const common = { id: uuid, school_id: uuid, created_at: date }, authored = { ...common, actor_id: uuid };
const sourceRow = z.union([
  z.object({ ...common, class_id: uuid, type: z.literal('GROUP'), owner_id: uuid, status: z.literal('ACTIVE'), policy_version: z.literal(1), name_sha256: digest }).strict(),
  z.object({ ...common, room_id: uuid, target_actor_id: uuid, status: z.enum(['active', 'revoked']), configured_by: uuid }).strict(),
  z.object({ ...authored, room_id: uuid, reply_to_id: uuid.nullable(), body_sha256: digest }).strict(),
  z.object({ school_id: uuid, post_id: uuid, actor_id: uuid, reaction: z.literal('HELPFUL'), active: z.boolean() }).strict(),
  z.object({ ...authored, post_id: uuid, reason_sha256: digest }).strict(),
  z.object({ ...authored, post_id: uuid, action: z.enum(['HIDE', 'RESTORE']), reason_sha256: digest }).strict(),
  z.object({ ...authored, room_id: uuid, target_actor_id: uuid, restriction: z.enum(['MUTED', 'RESTRICTED', 'NONE']), reason_sha256: digest }).strict(),
  z.object({ ...authored, class_id: uuid, title_sha256: digest, body_sha256: digest, parent_visible: z.boolean() }).strict(),
  z.object({ school_id: uuid, announcement_id: uuid, revision: positive, actor_id: uuid, read_at: date }).strict(),
  z.object({ ...authored, room_id: uuid, revision: positive, name_sha256: digest, state: z.enum(['ACTIVE', 'CLOSED']), reason_sha256: digest }).strict(),
  z.object({ ...authored, announcement_id: uuid, revision: positive, title_sha256: digest, body_sha256: digest, parent_visible: z.boolean(), state: z.enum(['PUBLISHED', 'WITHDRAWN']), reason_sha256: digest }).strict(),
]);
const commandEvidenceSchema = z.object({ intentSequence: positive, ledger: z.array(ledgerRow).max(2), source: z.array(sourceRow).max(2), audits: z.array(auditRow).max(2), events: z.array(eventRow).max(2),
  broadcasts: z.array(z.object({ event_id: uuid, broadcast_at: date }).strict()).max(2),
  processed: z.array(z.object({ event_id: uuid, school_id: uuid, processed_at: date }).strict()).max(2),
  messages: z.array(z.object({ event_id: uuid, room_id: uuid, topic: z.string().max(200), extension: z.literal('broadcast'), event: z.literal('invalidate'), private: z.literal(true), payload_sha256: digest, inserted_at: date }).strict()).max(2),
}).strict();
const currentSchema = z.object({ synthetic: z.literal(true), school_id: z.literal(tuple.schoolId), class_id: z.literal(tuple.classId),
  school_active: z.boolean(), class_active: z.boolean(), community_enabled: z.boolean(), teacher_role: z.string().nullable(), student_role: z.string().nullable(), peer_role: z.string().nullable(), parent_role: z.string().nullable(),
  teacher_assigned: z.boolean(), student_enrolled: z.boolean(), peer_enrolled: z.boolean(), parent_linked: z.boolean(), class_room_id: uuid.optional(),
  outside_role: z.string().nullable().optional(), outside_enrolled: z.boolean().optional(), foreign_school_active: z.boolean().optional(),
  foreign_role: z.string().nullable().optional(), foreign_current_main_membership: z.boolean().optional(), foreign_community_enabled: z.boolean().optional() }).strict();
const cleanupSchema = z.object({ room_id: uuid, base_status: z.enum(['ACTIVE', 'ARCHIVED']), group_state: z.enum(['ACTIVE', 'CLOSED']), group_revision: positive,
  announcement_id: uuid.nullable(), announcement_state: z.enum(['PUBLISHED', 'WITHDRAWN']).nullable(), announcement_revision: positive.nullable(),
  student_member_status: z.enum(['active', 'revoked']), peer_member_status: z.enum(['active', 'revoked']).nullable(), reaction_active: z.boolean().nullable(),
  student_configured_by: uuid, peer_configured_by: uuid.nullable(), student_restriction_id: uuid.nullable(), post_moderation_id: uuid.nullable(),
  student_member_change_id: uuid.nullable(), peer_member_change_id: uuid.nullable(),
  student_restriction: z.enum(['NONE', 'MUTED', 'RESTRICTED']), post_hidden: z.boolean(),
}).strict();
const evidenceSchema = z.object({ purpose: z.literal(purpose), identity: identitySchema, current: currentSchema,
  commands: z.array(commandEvidenceSchema).min(1).max(18), cleanup: cleanupSchema }).strict();
const livePrefixEvidenceSchema = evidenceSchema.extend({ identity: livePrefixIdentitySchema, current: currentSchema.extend({ class_room_id: uuid,
  outside_role: z.string().nullable(), outside_enrolled: z.boolean(), foreign_school_active: z.boolean(), foreign_role: z.string().nullable(),
  foreign_current_main_membership: z.boolean(), foreign_community_enabled: z.boolean() }).strict(), commands: z.array(commandEvidenceSchema).length(15) }).strict();
const readEvidenceSchema = z.union([evidenceSchema, livePrefixEvidenceSchema]);
export type HostedCommunityNativeSource = z.infer<typeof sourceRow>;
export type HostedCommunityNativeCommandEvidence = z.infer<typeof commandEvidenceSchema>;
export type HostedCommunityNativeEvidence = z.infer<typeof evidenceSchema>;
export type HostedCommunityLivePrefixEvidence = z.infer<typeof livePrefixEvidenceSchema>;
export type HostedCommunityNativeReadEvidence = HostedCommunityNativeEvidence | HostedCommunityLivePrefixEvidence;
/** Strict minimized database projection only; missing rows remain empty and
 * cannot acquire positive meaning from this parser. */
export function parseHostedCommunityNativeEvidence(value: unknown): HostedCommunityNativeEvidence {
  try { return freeze(evidenceSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)))); } catch { throw fail(); }
}
/** The private native read owner accepts only these two closed evidence shapes.
 * Completed-artifact consumers retain their artifact-only parser above. */
export function parseHostedCommunityNativeReadEvidence(value: unknown): HostedCommunityNativeReadEvidence {
  try { return freeze(readEvidenceSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)))); } catch { throw fail(); }
}
export type HostedCommunityNativeResult = {
  purpose: typeof purpose; status: 'VERIFIED' | 'ORIGINAL_RECONCILIATION_VERIFIED' | 'REQUIRES_REVIEW';
  evidence: 'SUPPLIED_NATIVE_EVIDENCE_VALIDATED'; reason: 'EXACT_ORIGINAL_AND_CHAIN' | 'ORIGINAL_ONLY' | 'EVIDENCE_MISSING_OR_CONFLICTING';
  chainVerified: boolean; cleanupVerified: boolean; commands: { intentRecordSha256: string; operation: HostedCommunityCommand['operation']; id: string; eventId:string; nativeReceiptSha256: string; httpReceiptObserved: true }[];
  classRoomId?: string;
  officialAdmissionVerified: false; nativeExecutionVerified: false; customerReady: false; hostedAcceptance: false; referenceRestored: false;
};
function empty(): HostedCommunityNativeResult {
  return { purpose, status: 'REQUIRES_REVIEW', evidence: 'SUPPLIED_NATIVE_EVIDENCE_VALIDATED', reason: 'EVIDENCE_MISSING_OR_CONFLICTING', chainVerified: false, cleanupVerified: false, commands: [],
    officialAdmissionVerified: false, nativeExecutionVerified: false, customerReady: false, hostedAcceptance: false, referenceRestored: false };
}

/** A supplied snapshot can prove consistency only. Official protected admission,
 * real native session execution, visible actions and hosted acceptance are separate. */
export function validateHostedCommunityNativeEvidence(value: unknown): HostedCommunityNativeResult {
  try {
    const parsed = selectionSchema.extend({ observedAt: date, evidence: evidenceSchema }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    const selection = selectHostedCommunityNativeSelection({ identity: parsed.identity, scope: parsed.scope, mode: parsed.mode, originals: parsed.originals });
    return validateNativeRows(selection, parsed.observedAt, parsed.evidence);
  } catch { return empty(); }
}

export type HostedCommunityLivePrefixResult = Omit<HostedCommunityNativeResult, 'status'> & { status: 'LIVE_PREFIX_VERIFIED' | 'REQUIRES_REVIEW' };
/** Pure consistency only: a verified checkpoint does not establish current
 * protected approval, an actual TLS read, retirement or completed acceptance. */
export function validateHostedCommunityLivePrefixEvidence(value: unknown): HostedCommunityLivePrefixResult {
  try {
    const parsed = z.object({ selection: livePrefixSelectionSchema, observedAt: date, evidence: livePrefixEvidenceSchema }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    const selection = selectHostedCommunityLivePrefixSelection(parsed.selection), result = validateNativeRows(selection, parsed.observedAt, parsed.evidence);
    return { ...result, status: 'LIVE_PREFIX_VERIFIED' };
  } catch { return { ...empty(), status: 'REQUIRES_REVIEW' }; }
}

/** One exact finite reconstruction and native chain validator serves both
 * artifact reconciliation and the separately identified live checkpoint. */
function validateNativeRows(selection: HostedCommunityNativeReadSelection, observedAt: string, evidence: HostedCommunityNativeReadEvidence): HostedCommunityNativeResult {
    const commands = reconstruct(selection), observed = Date.parse(observedAt), result = empty();
    requireFact(same(evidence.identity, selection.identity) && evidence.commands.length === commands.length);
    const current = evidence.current;
    const auxiliaryKeys = ['outside_role', 'outside_enrolled', 'foreign_school_active', 'foreign_role', 'foreign_current_main_membership', 'foreign_community_enabled'] as const;
    if (selection.mode === 'LIVE_PREFIX' || auxiliaryKeys.some(key => current[key] !== undefined)) {
      requireFact(current.outside_role === 'student' && current.outside_enrolled === false && current.foreign_school_active === true
        && current.foreign_role === 'student' && current.foreign_current_main_membership === false && current.foreign_community_enabled === true);
    }
    if (selection.mode === 'LIVE_PREFIX') requireFact(current.class_room_id !== undefined);
    if (current.class_room_id !== undefined) {
      requireFact(current.class_room_id !== tuple.classId && current.class_room_id !== selection.scope.group?.id);
      result.classRoomId = current.class_room_id;
    }
    requireFact(current.school_active && current.class_active && current.community_enabled && current.teacher_assigned && current.student_enrolled
      && current.peer_enrolled && current.parent_linked && current.teacher_role === 'teacher' && current.student_role === 'student'
      && current.peer_role === 'student' && current.parent_role === 'parent');
    const auditIds = new Set<string>(), eventIds = new Set<string>(), maintenanceIds = new Set<string>();
    let previousCompleted = 0;
    for (const [index, command] of commands.entries()) {
      const item = selection.originals[index], rows = evidence.commands[index], original = item.original;
      requireFact(rows.intentSequence === original.intentSequence && rows.ledger.length === 1 && rows.source.length === 1 && rows.audits.length === 1 && rows.events.length === 1);
      const ledger = rows.ledger[0], source = rows.source[0], audit = rows.audits[0], event = rows.events[0];
      requireFact(ledger.school_id === tuple.schoolId && ledger.actor_id === original.command.actorId && ledger.key === original.command.key
        && ledger.command === command.ledgerCommand && ledger.fingerprint === command.nativeFingerprint && ledger.state === 'COMPLETED' && ledger.completed_at !== null);
      const created = Date.parse(ledger.created_at), completed = Date.parse(ledger.completed_at);
      requireFact(created >= previousCompleted && completed >= created && completed <= observed); previousCompleted = completed;
      requireFact(!('body' in ledger.response));
      const nativeResponse = command.operation === 'post.create' ? { ...ledger.response, body: command.input.body } : ledger.response;
      requireFact(hash(nativeResponse) === ledger.response_sha256 && ledger.response_sha256 === item.http.receiptSha256);
      const actor = { actorId: original.command.actorId, schoolId: tuple.schoolId, role: original.command.role };
      const beforeScope: HostedCommunityScope = { ...selection.scope, group: index === 0 ? null : { id: selection.scope.group!.id, revision: 1 },
        postIds: selection.scope.postIds.slice(0, index < 4 ? 0 : index < 5 ? 1 : index < 8 ? 2 : 3), announcement: index < 14 ? null : { id: selection.scope.announcement!.id, revision: 1 } };
      const reduced = reduceHostedCommunityReceipt(nativeResponse, { path: original.command.path, rawBytes: JSON.stringify(command.input), key: original.command.key,
        requestBodySha256: textHash(JSON.stringify(command.input)), nativeFingerprint: command.nativeFingerprint }, actor, beforeScope);
      requireFact(same(reduced, item.http.receiptIdentity));
      requireFact(source.school_id === tuple.schoolId);
      const sourceId = 'id' in source ? source.id : command.targetId!, sourceActor = 'actor_id' in source ? source.actor_id : 'configured_by' in source ? source.configured_by : 'owner_id' in source ? source.owner_id : null;
      requireFact(sourceActor === original.command.actorId);
      if ('created_at' in source) requireFact(Date.parse(source.created_at) >= created && Date.parse(source.created_at) <= completed);
      if ('read_at' in source) requireFact(Date.parse(source.read_at) >= created && Date.parse(source.read_at) <= completed);
      const sourceClock = 'created_at' in source ? Date.parse(source.created_at) : 'read_at' in source ? Date.parse(source.read_at) : created;
      const input = command.input, op = command.operation, receipt = item.http.receiptIdentity;
      if (op === 'room.create') requireFact('name_sha256' in source && !('revision' in source) && 'owner_id' in source && sourceId === receipt.receiptId && source.class_id === tuple.classId && source.name_sha256 === textHash(hostedCommunityRecipeText.groupName));
      else if (op === 'member.configure') requireFact('configured_by' in source && sourceId === receipt.receiptId && source.room_id === command.targetId && source.target_actor_id === input.actorId && source.status === input.status);
      else if (op === 'post.create') requireFact('reply_to_id' in source && sourceId === receipt.receiptId && source.room_id === command.targetId && source.reply_to_id === input.replyToId && source.body_sha256 === textHash(String(input.body))
        && typeof ledger.response.createdAt === 'string' && Date.parse(ledger.response.createdAt) >= Date.parse(source.created_at) && Date.parse(ledger.response.createdAt) <= completed);
      else if (op === 'reaction.configure') {
        // The reaction tuple is mutable. Earlier true is proved by its original
        // normalized fingerprint; a later false snapshot must not erase history.
        requireFact('reaction' in source && source.post_id === command.targetId && source.active === (commands.length >= 7 ? false : true));
      } else if (op === 'post.report') requireFact('post_id' in source && 'reason_sha256' in source && !('action' in source) && sourceId === receipt.receiptId && source.post_id === command.targetId && source.reason_sha256 === textHash(String(input.reason)));
      else if (op === 'post.moderate') requireFact('action' in source && sourceId === receipt.receiptId && source.post_id === command.targetId && source.action === input.action && source.reason_sha256 === textHash(String(input.reason)));
      else if (op === 'room.restrict') requireFact('restriction' in source && sourceId === receipt.receiptId && source.room_id === command.targetId && source.target_actor_id === input.actorId && source.restriction === input.restriction && source.reason_sha256 === textHash(String(input.reason)));
      else if (op === 'announcement.create') requireFact('title_sha256' in source && !('revision' in source) && sourceId === receipt.receiptId && source.class_id === tuple.classId && source.parent_visible === true && source.title_sha256 === textHash(String(input.title)) && source.body_sha256 === textHash(String(input.body)));
      else if (op === 'notification.read') requireFact('read_at' in source && source.announcement_id === command.targetId && source.revision === 1);
      else if (op === 'group.lifecycle') requireFact('room_id' in source && 'revision' in source && 'name_sha256' in source && source.room_id === command.targetId && source.revision === 2 && source.state === 'CLOSED' && source.name_sha256 === textHash(String(input.name)) && source.reason_sha256 === textHash(String(input.reason)));
      else if (op === 'announcement.withdraw') requireFact('announcement_id' in source && 'title_sha256' in source && source.announcement_id === command.targetId && source.revision === 2 && source.state === 'WITHDRAWN' && source.title_sha256 === textHash(hostedCommunityRecipeText.announcementTitle) && source.body_sha256 === textHash(hostedCommunityRecipeText.announcementBody) && source.parent_visible === true && source.reason_sha256 === textHash(String(input.reason)));
      const maintenance = command.owner === 'maintenance';
      if (maintenance) { requireFact(!maintenanceIds.has(sourceId) && !selection.originals.some(entry => entry.http.receiptIdentity.receiptId === sourceId)); maintenanceIds.add(sourceId); }
      const entityId = maintenance ? sourceId : receipt.receiptId, entityType = maintenance ? 'community_maintenance' : 'community';
      const auditMetadata = maintenance ? { sourceId: command.targetId, revision: 2, kind: command.nativeKind } : op === 'notification.read' ? { revision: 1 } : {};
      const roomId = ['announcement.create', 'notification.read'].includes(op) ? null : selection.scope.group!.id;
      const eventMetadata = maintenance ? { kind: command.nativeKind, sourceId: command.targetId } : { roomId };
      const dedup = maintenance ? 'community-maintenance:' + sourceId : op === 'notification.read' ? 'community-read:' + command.targetId + ':1:' + original.command.actorId
        : 'community:' + createHash('md5').update(original.command.actorId + (command.owner === 'normal' ? command.nativeCommand : '') + original.command.key).digest('hex');
      requireFact(audit.school_id === tuple.schoolId && audit.actor_id === original.command.actorId && audit.action === command.ledgerCommand && audit.entity_type === entityType
        && audit.entity_id === entityId && audit.request_id === item.http.requestId && audit.outcome === 'succeeded' && same(audit.metadata, auditMetadata)
        && !auditIds.has(audit.id) && Date.parse(audit.occurred_at) >= sourceClock && Date.parse(audit.occurred_at) <= completed); auditIds.add(audit.id);
      requireFact(event.school_id === tuple.schoolId && event.actor_id === original.command.actorId && event.entity_type === entityType && event.entity_id === entityId
        && event.type === (maintenance ? 'community.maintenance.changed' : op === 'post.create' ? 'community.post_created' : op === 'post.report' ? 'moderation.reported' : 'community.changed')
        && event.version === (maintenance ? 2 : 1) && same(event.metadata, eventMetadata) && event.deduplication_key === dedup && !eventIds.has(event.id)
        && Date.parse(event.occurred_at) >= Date.parse(audit.occurred_at) && Date.parse(event.occurred_at) <= completed && event.state === 'COMPLETED'
        && event.completed_at !== null && Date.parse(event.completed_at) >= completed && Date.parse(event.completed_at) <= observed
        && Date.parse(event.available_at) >= Date.parse(event.occurred_at) && Date.parse(event.available_at) <= Date.parse(event.completed_at)
        && event.attempt_count > 0 && event.attempt_count <= event.max_attempts && event.lease_token === null && event.lease_until === null); eventIds.add(event.id);
      if (maintenance) {
        requireFact(rows.broadcasts.length === 0 && rows.messages.length === 0 && rows.processed.length === 1);
        const processed = rows.processed[0]; requireFact(processed.event_id === event.id && processed.school_id === tuple.schoolId
          && Date.parse(processed.processed_at) >= completed && Date.parse(processed.processed_at) <= Date.parse(event.completed_at!));
      } else {
        requireFact(rows.processed.length === 0 && rows.broadcasts.length === 1);
        const broadcast = rows.broadcasts[0]; requireFact(broadcast.event_id === event.id && Date.parse(broadcast.broadcast_at) >= completed && Date.parse(broadcast.broadcast_at) <= Date.parse(event.completed_at!));
        requireFact(rows.messages.length === (roomId === null ? 0 : 1));
        if (roomId !== null) { const message = rows.messages[0]; requireFact(message.event_id === event.id && message.room_id === roomId && message.topic === 'cuevo:' + tuple.schoolId + ':room:' + roomId
          && message.payload_sha256 === hash({ eventId: event.id, roomId }) && Date.parse(message.inserted_at) >= completed && Date.parse(message.inserted_at) <= Date.parse(broadcast.broadcast_at)); }
      }
      result.commands.push({ intentRecordSha256: original.intentRecordSha256, operation: op, id: receipt.receiptId,eventId:event.id, nativeReceiptSha256: hash(rows), httpReceiptObserved: true });
    }
    const cleanup = evidence.cleanup, length = commands.length;
    requireFact(cleanup.room_id === selection.scope.group!.id && cleanup.base_status === 'ACTIVE' && cleanup.group_revision === (length >= 17 ? 2 : 1)
      && cleanup.group_state === (length >= 17 ? 'CLOSED' : 'ACTIVE') && cleanup.announcement_id === (selection.scope.announcement?.id ?? null)
      && cleanup.announcement_revision === (length >= 18 ? 2 : length >= 14 ? 1 : null) && cleanup.announcement_state === (length >= 18 ? 'WITHDRAWN' : length >= 14 ? 'PUBLISHED' : null)
      && cleanup.student_member_status === (length >= 16 ? 'revoked' : 'active') && cleanup.peer_member_status === (length >= 3 ? 'revoked' : length >= 2 ? 'active' : null)
      && cleanup.student_configured_by === tuple.teacherActorId && cleanup.peer_configured_by === (length >= 2 ? tuple.teacherActorId : null)
      && cleanup.student_member_change_id === (length >= 16 ? selection.originals[15].http.receiptIdentity.receiptId : null)
      && cleanup.peer_member_change_id === (length >= 3 ? selection.originals[2].http.receiptIdentity.receiptId : length >= 2 ? selection.originals[1].http.receiptIdentity.receiptId : null)
      && cleanup.student_restriction_id === (length >= 11 ? selection.originals[10].http.receiptIdentity.receiptId : length >= 10 ? selection.originals[9].http.receiptIdentity.receiptId : null)
      && cleanup.post_moderation_id === (length >= 13 ? selection.originals[12].http.receiptIdentity.receiptId : length >= 12 ? selection.originals[11].http.receiptIdentity.receiptId : null)
      && cleanup.reaction_active === (length >= 7 ? false : length >= 6 ? true : null) && cleanup.student_restriction === (length === 10 ? 'MUTED' : 'NONE')
      && cleanup.post_hidden === (length === 12));
    result.status = selection.mode === 'FULL_RECIPE' ? 'VERIFIED' : 'ORIGINAL_RECONCILIATION_VERIFIED'; result.reason = selection.mode === 'FULL_RECIPE' ? 'EXACT_ORIGINAL_AND_CHAIN' : 'ORIGINAL_ONLY';
    result.chainVerified = selection.mode === 'FULL_RECIPE'; result.cleanupVerified = selection.mode === 'FULL_RECIPE'; return result;
}

export type HostedCommunityNativeReadPorts = {
  admitCurrentQa(selection: HostedCommunityNativeSelection): Promise<void>;
  readEvidence(selection: HostedCommunityNativeSelection): Promise<HostedCommunityNativeEvidence>;
  now(): number;
};
/** Injected ports retain supplied-evidence flags. Only the existing native facade
 * and protected wrapper can later establish real admission and session execution. */
export async function verifyHostedCommunityNativeEvidence(value: unknown, ports: HostedCommunityNativeReadPorts): Promise<HostedCommunityNativeResult> {
  try {
    const parsed = selectionSchema.extend({ deadlineMs: z.number().int().min(1).max(30000) }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    const selected = selectHostedCommunityNativeSelection({ identity: parsed.identity, scope: parsed.scope, mode: parsed.mode, originals: parsed.originals });
    const before = ports.now(); requireFact(Number.isFinite(before)); await ports.admitCurrentQa(selected);
    const start = ports.now(); requireFact(Number.isFinite(start) && start >= before);
    const evidence = await ports.readEvidence(selected), observed = ports.now(); requireFact(Number.isFinite(observed) && observed >= start && observed - start < parsed.deadlineMs);
    const result = validateHostedCommunityNativeEvidence({ ...selected, observedAt: new Date(observed).toISOString(), evidence });
    const validated = ports.now(); requireFact(Number.isFinite(validated) && validated >= observed && validated - start < parsed.deadlineMs);
    if (result.status !== 'REQUIRES_REVIEW') await ports.admitCurrentQa(selected);
    const end = ports.now(); requireFact(Number.isFinite(end) && end >= validated && end - start < parsed.deadlineMs); return result;
  } catch { return empty(); }
}
