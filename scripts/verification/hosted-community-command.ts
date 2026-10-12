import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  communityRoomSchema, communityMembershipSchema, communityPostSchema, communityReactionSchema,
  communityReportSchema, communityModerationSchema, communityRestrictionSchema, communityAnnouncementSchema,
  communityExactReadSchema, communityGroupLifecycleSchema, communityAnnouncementWithdrawSchema, idempotencyKeySchema,
} from '@cuevo/contracts';
import { confirmCommunityReceipt } from '../../apps/web/features/community/model';
import { canonicalReleaseExecutionJson } from './release-review';

const failure = () => Error('Hosted Community verification requires review; private contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const uuid = z.uuid(), revision = z.number().int().positive().max(2147483646);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const tuple = Object.freeze({
  schoolId: '10000000-0000-4000-8000-000000000001', classId: '30000000-0000-4000-8000-000000000001',
  teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012',
  peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072',
});

/** Fixed fictional text belongs to this acceptance recipe, never to product rules. */
export const hostedCommunityRecipeText = Object.freeze({
  groupName: 'Checking our learning together',
  postBody: 'This fictional practice helped me check each step.',
  secondPostBody: 'I compared a second fictional practice example and checked the steps.',
  replyBody: 'I checked the fictional example again and compared the steps.',
  replyDraftOther: 'I kept a separate reply draft for the second fictional example.',
  reportReason: 'Please review this fictional practice discussion.',
  moderationReason: 'Reviewed the fictional practice discussion with the group.',
  restrictionReason: 'Reviewed participation in this fictional practice group.',
  announcementTitle: 'Our fictional practice update',
  announcementBody: 'We practised checking each step in a fictional learning activity.',
  groupClosureReason: 'The fictional practice group has finished.',
  announcementWithdrawalReason: 'The fictional practice update has finished.',
});

const scopeSchema = z.object({
  synthetic: z.literal(true), schoolId: z.literal(tuple.schoolId), classId: z.literal(tuple.classId),
  teacherActorId: z.literal(tuple.teacherActorId), studentActorId: z.literal(tuple.studentActorId),
  peerActorId: z.literal(tuple.peerActorId), parentActorId: z.literal(tuple.parentActorId),
  group: z.object({ id: uuid, revision }).strict().nullable(),
  postIds: z.array(uuid).max(3), announcement: z.object({ id: uuid, revision }).strict().nullable(),
}).strict();

/** The forwarding owner supplies a freshly admitted immutable snapshot. These
 * local facts do not establish native authorization, current access or ownership. */
export type HostedCommunityScope = z.infer<typeof scopeSchema>;
export type HostedCommunityActor = { actorId: string; schoolId: string; role: 'teacher' | 'student' | 'parent' };
export type HostedCommunityOperation = 'room.create' | 'member.configure' | 'post.create' | 'reaction.configure'
  | 'post.report' | 'post.moderate' | 'room.restrict' | 'announcement.create' | 'notification.read'
  | 'group.lifecycle' | 'announcement.withdraw';
type NativeCommand = 'room.create' | 'member.configure' | 'post.create' | 'reaction.configure' | 'report.create'
  | 'post.moderate' | 'room.restrict' | 'announcement.create' | 'notification.read';
type NativeIdentity = { owner: 'normal'; nativeCommand: NativeCommand; ledgerCommand: `community.${NativeCommand}` }
  | { owner: 'maintenance'; nativeKind: 'group' | 'withdraw'; ledgerCommand: 'community.maintenance.group' | 'community.maintenance.withdraw' };
export type HostedCommunityCommand = NativeIdentity & {
  operation: HostedCommunityOperation; targetId: string | null; input: Record<string, unknown>;
  sourceIds: string[]; sourceRevision: number | null; requestBodySha256: string; nativeFingerprint: string;
};

type Route = { pattern: RegExp; operation: HostedCommunityOperation; schema: z.ZodType;
  actors: readonly ('teacher' | 'student' | 'peer' | 'parent')[] } &
  ({ owner: 'normal'; nativeCommand: NativeCommand } | { owner: 'maintenance'; nativeKind: 'group' | 'withdraw' });
const routes: readonly Route[] = [
  { pattern: /^\/v1\/community\/rooms$/, operation: 'room.create', schema: communityRoomSchema, actors: ['teacher'], owner: 'normal', nativeCommand: 'room.create' },
  { pattern: /^\/v1\/community\/rooms\/([^/]+)\/members$/, operation: 'member.configure', schema: communityMembershipSchema, actors: ['teacher'], owner: 'normal', nativeCommand: 'member.configure' },
  { pattern: /^\/v1\/community\/rooms\/([^/]+)\/posts$/, operation: 'post.create', schema: communityPostSchema, actors: ['teacher', 'student', 'peer'], owner: 'normal', nativeCommand: 'post.create' },
  { pattern: /^\/v1\/community\/posts\/([^/]+)\/reactions$/, operation: 'reaction.configure', schema: communityReactionSchema, actors: ['teacher', 'student', 'peer'], owner: 'normal', nativeCommand: 'reaction.configure' },
  { pattern: /^\/v1\/community\/posts\/([^/]+)\/report$/, operation: 'post.report', schema: communityReportSchema, actors: ['teacher', 'student', 'peer'], owner: 'normal', nativeCommand: 'report.create' },
  { pattern: /^\/v1\/community\/posts\/([^/]+)\/moderate$/, operation: 'post.moderate', schema: communityModerationSchema, actors: ['teacher'], owner: 'normal', nativeCommand: 'post.moderate' },
  { pattern: /^\/v1\/community\/rooms\/([^/]+)\/restrict$/, operation: 'room.restrict', schema: communityRestrictionSchema, actors: ['teacher'], owner: 'normal', nativeCommand: 'room.restrict' },
  { pattern: /^\/v1\/community\/announcements$/, operation: 'announcement.create', schema: communityAnnouncementSchema, actors: ['teacher'], owner: 'normal', nativeCommand: 'announcement.create' },
  { pattern: /^\/v1\/community\/notifications\/([^/]+)\/read$/, operation: 'notification.read', schema: communityExactReadSchema, actors: ['parent'], owner: 'normal', nativeCommand: 'notification.read' },
  { pattern: /^\/v1\/community\/groups\/([^/]+)\/lifecycle$/, operation: 'group.lifecycle', schema: communityGroupLifecycleSchema, actors: ['teacher'], owner: 'maintenance', nativeKind: 'group' },
  { pattern: /^\/v1\/community\/announcements\/([^/]+)\/withdraw$/, operation: 'announcement.withdraw', schema: communityAnnouncementWithdrawSchema, actors: ['teacher'], owner: 'maintenance', nativeKind: 'withdraw' },
];

function selectedScope(value: unknown): HostedCommunityScope {
  const scope = scopeSchema.parse(value);
  const ownedIds = [scope.group?.id, ...scope.postIds, scope.announcement?.id].filter((id): id is string => id !== undefined);
  if (new Set(ownedIds).size !== ownedIds.length || ownedIds.some(id => Object.values(tuple).includes(id as typeof tuple.schoolId))
    || scope.postIds.length > 0 && scope.group === null) throw failure();
  return scope;
}

function selectedActor(value: unknown, scope: HostedCommunityScope): 'teacher' | 'student' | 'peer' | 'parent' {
  const actor = z.object({ actorId: uuid, schoolId: z.literal(tuple.schoolId), role: z.enum(['teacher', 'student', 'parent']) }).strict().parse(value);
  if (actor.role === 'teacher' && actor.actorId === scope.teacherActorId) return 'teacher';
  if (actor.role === 'student' && actor.actorId === scope.studentActorId) return 'student';
  if (actor.role === 'student' && actor.actorId === scope.peerActorId) return 'peer';
  if (actor.role === 'parent' && actor.actorId === scope.parentActorId) return 'parent';
  throw failure();
}

function requestText(bytes: string | Uint8Array): string {
  if (!(typeof bytes === 'string' || bytes instanceof Uint8Array) || Buffer.byteLength(bytes) > 65536) throw failure();
  return typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

/** Contract payloads are flat objects (with UUID arrays only). Tokenizing every
 * JSON string before inspecting a following colon catches decoded duplicate
 * keys, including escaped aliases, without reading text inside a value as a key. */
function requestObject(bytes: string): unknown {
  const parsed: unknown = JSON.parse(bytes);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw failure();
  const keys = new Set<string>();
  for (const token of bytes.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    if (!/^\s*:/.test(bytes.slice(token.index + token[0].length))) continue;
    const key = JSON.parse(token[0]) as string;
    if (keys.has(key)) throw failure();
    keys.add(key);
  }
  return parsed;
}

/** Parsing prepares transient data only. Every native/API effect must separately
 * recheck current source, lease, school, membership, relationship and object scope. */
export function parseHostedCommunityCommand(path: string, rawBytes: string | Uint8Array, actor: unknown, value: unknown): HostedCommunityCommand {
  try {
    const scope = selectedScope(value), selected = selectedActor(actor, scope);
    const route = routes.find(row => row.pattern.test(path));
    if (!route || !route.actors.includes(selected)) throw failure();
    const bytes = requestText(rawBytes), input = route.schema.parse(requestObject(bytes)) as Record<string, unknown>;
    const targetId = route.pattern.exec(path)?.[1] ?? null;
    if (targetId !== null) uuid.parse(targetId);
    const op = route.operation, text = hostedCommunityRecipeText;
    const groupTarget = ['member.configure', 'post.create', 'room.restrict', 'group.lifecycle'].includes(op);
    const postTarget = ['reaction.configure', 'post.report', 'post.moderate'].includes(op);
    if (groupTarget && (!scope.group || targetId !== scope.group.id)
      || postTarget && (!scope.group || targetId === null || !scope.postIds.includes(targetId))
      || ['notification.read', 'announcement.withdraw'].includes(op) && (!scope.announcement || targetId !== scope.announcement.id)) throw failure();
    if (op === 'room.create' && (scope.group !== null || input.classId !== scope.classId || input.type !== 'GROUP'
      || input.name !== text.groupName || !Array.isArray(input.memberIds) || input.memberIds.length !== 1 || input.memberIds[0] !== scope.studentActorId)) throw failure();
    if (['member.configure', 'room.restrict'].includes(op) && ![scope.studentActorId, scope.peerActorId].includes(input.actorId as typeof scope.studentActorId)) throw failure();
    if (op === 'post.create') {
      if (scope.postIds.length >= 3) throw failure();
      if (input.mentionActorIds !== undefined && (!Array.isArray(input.mentionActorIds) || input.mentionActorIds.length > 0)) throw failure();
      if (input.replyToId === null ? input.body !== text.postBody && input.body !== text.secondPostBody
        : input.body !== text.replyBody && input.body !== text.replyDraftOther || !scope.postIds.includes(String(input.replyToId))) throw failure();
    }
    if (op === 'post.report' && input.reason !== text.reportReason
      || op === 'post.moderate' && input.reason !== text.moderationReason
      || op === 'room.restrict' && input.reason !== text.restrictionReason) throw failure();
    if (op === 'announcement.create' && (scope.announcement !== null || input.classId !== scope.classId || input.parentVisible !== true
      || input.title !== text.announcementTitle || input.body !== text.announcementBody)) throw failure();
    if (op === 'notification.read' && input.expectedRevision !== scope.announcement?.revision
      || op === 'group.lifecycle' && (input.expectedRevision !== scope.group?.revision || input.name !== text.groupName || input.state !== 'CLOSED' || input.reason !== text.groupClosureReason)
      || op === 'announcement.withdraw' && (input.expectedRevision !== scope.announcement?.revision || input.reason !== text.announcementWithdrawalReason)) throw failure();
    const sourceIds = [targetId];
    if (postTarget) sourceIds.push(scope.group!.id);
    for (const key of ['classId', 'actorId', 'replyToId']) if (typeof input[key] === 'string') sourceIds.push(input[key]);
    if (Array.isArray(input.memberIds)) sourceIds.push(...input.memberIds as string[]);
    const sources = [...new Set(sourceIds.filter((id): id is string => id !== null))];
    const identity: NativeIdentity = route.owner === 'normal'
      ? { owner: 'normal', nativeCommand: route.nativeCommand, ledgerCommand: `community.${route.nativeCommand}` }
      : { owner: 'maintenance', nativeKind: route.nativeKind, ledgerCommand: `community.maintenance.${route.nativeKind}` };
    const recipe = identity.owner === 'normal' ? { command: identity.nativeCommand, target: targetId, input }
      : { kind: identity.nativeKind, target: targetId, input };
    return { operation: op, ...identity, targetId, input, sourceIds: sources,
      sourceRevision: typeof input.expectedRevision === 'number' ? input.expectedRevision : null,
      requestBodySha256: hash(rawBytes), nativeFingerprint: hash(JSON.stringify(recipe)) };
  } catch { throw failure(); }
}

/** One closed eighteen-command acceptance order. This validates supplied recipe
 * metadata only; current admission and native retirement proof remain separate.
 * Preparation has no body yet, while forwarding supplies the actual parsed body. */
export function requireHostedCommunityRecipeStep(index: number, path: string, actorValue: unknown, scopeGeneration: number,
  value: unknown, command?: HostedCommunityCommand): void {
  try {
    if (!Number.isInteger(index) || index < 0 || index >= 18) throw failure();
    const scope=selectedScope(value),selected=selectedActor(actorValue,scope),text=hostedCommunityRecipeText;
    const postCount=index<4?0:index===4?1:index<8?2:3;
    if (scope.postIds.length!==postCount || (index===0?scope.group!==null:scope.group===null||scope.group.revision!==(index===17?2:1))
      || (index<14?scope.announcement!==null:scope.announcement===null||scope.announcement.revision!==1)) throw failure();
    const group=scope.group?.id,post=scope.postIds[0],announcement=scope.announcement?.id;
    const members=`/v1/community/rooms/${group}/members`,posts=`/v1/community/rooms/${group}/posts`,reactions=`/v1/community/posts/${post}/reactions`;
    const restrict=`/v1/community/rooms/${group}/restrict`,moderate=`/v1/community/posts/${post}/moderate`;
    const steps: readonly {actor:'teacher'|'student'|'parent';generation:number;path:string;body:Record<string,unknown>}[]=[
      {actor:'teacher',generation:1,path:'/v1/community/rooms',body:{classId:scope.classId,name:text.groupName,type:'GROUP',memberIds:[scope.studentActorId]}},
      {actor:'teacher',generation:1,path:members,body:{actorId:scope.peerActorId,status:'active',confirmAccessChange:true}},
      {actor:'teacher',generation:1,path:members,body:{actorId:scope.peerActorId,status:'revoked',confirmAccessChange:true}},
      {actor:'student',generation:3,path:posts,body:{body:text.postBody,replyToId:null}},
      {actor:'student',generation:3,path:posts,body:{body:text.secondPostBody,replyToId:null}},
      {actor:'student',generation:3,path:reactions,body:{reaction:'HELPFUL',active:true}},
      {actor:'student',generation:3,path:reactions,body:{reaction:'HELPFUL',active:false}},
      {actor:'student',generation:3,path:posts,body:{body:text.replyBody,replyToId:post}},
      {actor:'student',generation:3,path:`/v1/community/posts/${post}/report`,body:{reason:text.reportReason}},
      {actor:'teacher',generation:5,path:restrict,body:{actorId:scope.studentActorId,restriction:'MUTED',reason:text.restrictionReason,confirmModeration:true}},
      {actor:'teacher',generation:9,path:restrict,body:{actorId:scope.studentActorId,restriction:'NONE',reason:text.restrictionReason,confirmModeration:true}},
      {actor:'teacher',generation:9,path:moderate,body:{action:'HIDE',reason:text.moderationReason,confirmModeration:true}},
      {actor:'teacher',generation:9,path:moderate,body:{action:'RESTORE',reason:text.moderationReason,confirmModeration:true}},
      {actor:'teacher',generation:9,path:'/v1/community/announcements',body:{classId:scope.classId,title:text.announcementTitle,body:text.announcementBody,parentVisible:true}},
      {actor:'parent',generation:11,path:`/v1/community/notifications/${announcement}/read`,body:{expectedRevision:1}},
      {actor:'teacher',generation:13,path:members,body:{actorId:scope.studentActorId,status:'revoked',confirmAccessChange:true}},
      {actor:'teacher',generation:13,path:`/v1/community/groups/${group}/lifecycle`,body:{name:text.groupName,state:'CLOSED',expectedRevision:1,reason:text.groupClosureReason,confirmChange:true}},
      {actor:'teacher',generation:13,path:`/v1/community/announcements/${announcement}/withdraw`,body:{expectedRevision:1,reason:text.announcementWithdrawalReason,confirmWithdrawal:true}},
    ];
    const expected=steps[index];
    if (selected!==expected.actor || scopeGeneration!==expected.generation || path!==expected.path) throw failure();
    if (command) {
      const parsed=parseHostedCommunityCommand(path,JSON.stringify(expected.body),actorValue,scope),expectedInput={...parsed.input};
      if (command.operation==='post.create' && Object.hasOwn(command.input,'mentionActorIds')) expectedInput.mentionActorIds=[];
      const fingerprint=parseHostedCommunityCommand(path,JSON.stringify(command.input),actorValue,scope);
      const same=(left:unknown,right:unknown)=>canonicalReleaseExecutionJson(left)===canonicalReleaseExecutionJson(right);
      if (!same(command.input,expectedInput) || command.operation!==parsed.operation || command.targetId!==parsed.targetId
        || command.owner!==parsed.owner || command.ledgerCommand!==parsed.ledgerCommand || !same(command.sourceIds,parsed.sourceIds)
        || command.sourceRevision!==parsed.sourceRevision || command.nativeFingerprint!==fingerprint.nativeFingerprint
        || (command.owner==='normal'?fingerprint.owner!=='normal'||command.nativeCommand!==fingerprint.nativeCommand
          :fingerprint.owner!=='maintenance'||command.nativeKind!==fingerprint.nativeKind)) throw failure();
    }
  } catch { throw failure(); }
}

export type HostedCommunityOriginalRequest = {
  path: string; rawBytes: string | Uint8Array; key: string; requestBodySha256: string; nativeFingerprint: string;
};
export type HostedCommunityReceipt = {
  operation: HostedCommunityOperation; owner: 'normal' | 'maintenance'; ledgerCommand: HostedCommunityCommand['ledgerCommand'];
  receiptId: string; sourceId: string; changeId: string | null; revision: number | null;
  status: 'VISIBLE' | 'READ' | 'CLOSED' | 'WITHDRAWN' | null;
};
const originalSchema = z.object({ path: z.string(), rawBytes: z.string().or(z.instanceof(Uint8Array)), key: idempotencyKeySchema,
  requestBodySha256: digest, nativeFingerprint: digest }).strict();

/** Reuse the current public Community receipt validator through verification
 * ownership. Persist only minimized identity/state. A valid key and local hashes
 * cannot prove the native idempotency ledger; that requires the separate reader.
 * Maintenance's generated audit revision ID remains unknown here. */
export function reduceHostedCommunityReceipt(value: unknown, original: unknown, actor: unknown, selected: unknown): HostedCommunityReceipt {
  try {
    const submitted = originalSchema.parse(original), scope = selectedScope(selected);
    const command = parseHostedCommunityCommand(submitted.path, submitted.rawBytes, actor, scope);
    if (submitted.requestBodySha256 !== command.requestBodySha256 || submitted.nativeFingerprint !== command.nativeFingerprint) throw failure();
    const actorId = z.object({ actorId: uuid }).passthrough().parse(actor).actorId;
    const row = confirmCommunityReceipt(value, { path: submitted.path, key: submitted.key, body: command.input }, actorId);
    const changed = ['member.configure', 'post.moderate', 'room.restrict'].includes(command.operation);
    const created = ['room.create', 'post.create', 'post.report', 'announcement.create'].includes(command.operation);
    const existingIds = [...Object.values(tuple), scope.group?.id, ...scope.postIds, scope.announcement?.id].filter((id): id is string => id !== undefined);
    if ((changed || created) && existingIds.includes(row.id)) throw failure();
    const state = 'status' in row ? row.status ?? null : null;
    const version = 'revision' in row ? row.revision ?? null : null;
    if (state !== null && !['VISIBLE', 'READ', 'CLOSED', 'WITHDRAWN'].includes(state)) throw failure();
    return { operation: command.operation, owner: command.owner, ledgerCommand: command.ledgerCommand,
      receiptId: row.id, sourceId: created ? row.id : command.targetId!, changeId: changed ? row.id : null,
      revision: version, status: state as HostedCommunityReceipt['status'] };
  } catch { throw failure(); }
}
