import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { communityRoomSchema, communityMembershipSchema, communityPostSchema, communityReactionSchema, communityReportSchema, communityModerationSchema, communityRestrictionSchema, communityAnnouncementSchema, communityExactReadSchema, communityGroupLifecycleSchema, communityReportReviewSchema, communityAnnouncementRevisionSchema, communityAnnouncementWithdrawSchema, communityMentionReadSchema } from '@cuevo/contracts';
export type Room = { id: string; classId: string; name: string; type: 'CLASS' | 'GROUP'; ownerId: string; status: 'ACTIVE'|'CLOSED';revision?:number; canModerate: boolean; canPost: boolean; privateTopic: string };
export type RosterPerson = { id: string; displayName: string; role: 'admin' | 'coordinator' | 'teacher' | 'student' };
export type GroupCandidateRoom = { scope: string; classId: string; id: string | null };
/** Preserve an input owner's known class-room identity only during the same current scope's refresh. */
export function currentGroupCandidateRoom(previous: GroupCandidateRoom | null, input: { scope: string; classId: string; rooms: Pick<Room, 'id' | 'classId' | 'type'>[]; loading: boolean; failed: boolean }): GroupCandidateRoom {
  const current = input.rooms.find(room => room.classId === input.classId && room.type === 'CLASS');
  const id = input.failed ? null : current?.id ?? (input.loading && previous?.scope === input.scope && previous.classId === input.classId ? previous.id : null);
  return { scope: input.scope, classId: input.classId, id };
}
export type Post = { id: string; roomId: string; actorId: string; authorName: string; body: string | null; replyToId: string | null; createdAt: string; status: 'VISIBLE' | 'HIDDEN'; reactions: { reaction: 'THANKS' | 'HELPFUL' | 'ENCOURAGE'; count: number; mine: boolean }[] };
export function replyParentContext(parentId: string, posts: Post[]): { state: 'VISIBLE'; authorName: string } | { state: 'HIDDEN' | 'NOT_LOADED' } {
  const parent = posts.find(post => post.id === parentId);
  return !parent ? { state: 'NOT_LOADED' } : parent.status === 'HIDDEN' ? { state: 'HIDDEN' } : { state: 'VISIBLE', authorName: parent.authorName };
}
export type Announcement = {canManage?:boolean;revision?:number; id: string; classId: string | null; title: string; body: string; parentVisible: boolean; createdAt: string; readAt: string | null };
export type AnnouncementNotification = {revision?:number; id: string; announcementId: string; title: string; kind: 'ANNOUNCEMENT'; createdAt: string; readAt: string | null };
export type MentionNotification={id:string;postId:string;roomId:string;title:string;kind:'MENTION';createdAt:string;readAt:string|null};
export type Notification=AnnouncementNotification|MentionNotification;
export type Report = {reviewRevision?:number;reviewState?:'AWAITING_REVIEW'|'RESOLVED'|'REQUIRES_FOLLOW_UP'|'REOPENED'; id: string; postId: string; reporterId: string; reason: string; createdAt: string };
export function parseRoomPost(value: unknown, roomId: string): Post {
  const post = parsePost(value);
  if (post.roomId !== roomId) throw new LearningApiError('invalid');
  return post;
}
export function parseParentAnnouncement(value: unknown): Announcement {
  const announcement = parseAnnouncement(value);
  if (!announcement.parentVisible || announcement.canManage) throw new LearningApiError('invalid');
  return announcement;
}
export function parseParentNotification(value: unknown): AnnouncementNotification {
  const notification = parseNotification(value);
  if (notification.kind !== 'ANNOUNCEMENT') throw new LearningApiError('invalid');
  return notification;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === 'string' && value[key] !== '');
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export type CommunityReceipt = { id: string; command: 'room.create' | 'member.configure' | 'post.create' | 'reaction.configure' | 'report.create' | 'post.moderate' | 'room.restrict' | 'announcement.create'; roomId?: string; body?: string; replyToId?: string | null; actorId?: string; createdAt?: string; status?: 'VISIBLE' } | { id: string; status: 'READ' | 'ACTIVE' | 'CLOSED' | 'RESOLVED' | 'REQUIRES_FOLLOW_UP' | 'REOPENED' | 'PUBLISHED' | 'WITHDRAWN'; revision?: number };

/** Response evidence comes only from the current SQL receipt and original
 * submitted payload. No current query, journal or UI state is read here. */
export function confirmCommunityReceipt(value: unknown, originalCommand: Command, actorId?: string): CommunityReceipt {
  const invalid = (): never => { throw new LearningApiError('invalid', true); };
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const exact = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).length === keys.length && Object.keys(row).every(key => keys.includes(key));
  if (!object(value) || !uuid(value.id)) return invalid();
  const path = originalCommand.path;
  const payload = originalCommand.body;
  const match = path.match(/^\/v1\/community\/(rooms|posts|groups|reports|announcements|notifications|mentions)\/([^/]+)\/([^/]+)$/);
  if (match && !uuid(match[2])) return invalid();
  const target = match?.[2]; const resource = match?.[1]; const action = match?.[3];
  let command: Extract<CommunityReceipt, { command: string }>['command'] | undefined;
  if (path === '/v1/community/rooms') {
    if (!communityRoomSchema.safeParse(payload).success) return invalid();
    command = 'room.create';
  } else if (path === '/v1/community/announcements') {
    if (!communityAnnouncementSchema.safeParse(payload).success) return invalid();
    command = 'announcement.create';
  } else if (resource === 'rooms' && action === 'posts') {
    const parsed = communityPostSchema.safeParse(payload);
    if (!parsed.success || !uuid(actorId) || !exact(value, ['id', 'command', 'roomId', 'body', 'replyToId', 'actorId', 'createdAt', 'status']) || value.command !== 'post.create' || value.roomId !== target || value.actorId !== actorId || value.body !== parsed.data.body || value.replyToId !== parsed.data.replyToId || value.status !== 'VISIBLE' || !date(value.createdAt)) return invalid();
    return value as CommunityReceipt;
  } else if (resource === 'rooms' && action === 'members') {
    // Current SQL returns a generated immutable member-change ID, not the
    // selected actor. The actual receipt contains no target-actor echo.
    if (!communityMembershipSchema.safeParse(payload).success) return invalid();
    command = 'member.configure';
  } else if (resource === 'rooms' && action === 'restrict') {
    if (!communityRestrictionSchema.safeParse(payload).success) return invalid();
    command = 'room.restrict';
  } else if (resource === 'posts' && action === 'reactions') {
    if (!communityReactionSchema.safeParse(payload).success || value.id !== target) return invalid();
    command = 'reaction.configure';
  } else if (resource === 'posts' && action === 'report') {
    if (!communityReportSchema.safeParse(payload).success) return invalid();
    command = 'report.create';
  } else if (resource === 'posts' && action === 'moderate') {
    if (!communityModerationSchema.safeParse(payload).success) return invalid();
    command = 'post.moderate';
  } else if (resource === 'notifications' && action === 'read') {
    const parsed = communityExactReadSchema.safeParse(payload);
    if (!parsed.success || !exact(value, ['id', 'status', 'revision']) || value.id !== target || value.status !== 'READ' || value.revision !== parsed.data.expectedRevision) return invalid();
    return value as CommunityReceipt;
  } else if (resource === 'mentions' && action === 'read') {
    if (!communityMentionReadSchema.safeParse(payload).success || !exact(value, ['id', 'status']) || value.id !== target || value.status !== 'READ') return invalid();
    return value as CommunityReceipt;
  } else {
    const parsed = resource === 'groups' && action === 'lifecycle' ? communityGroupLifecycleSchema.safeParse(payload)
      : resource === 'reports' && action === 'review' ? communityReportReviewSchema.safeParse(payload)
        : resource === 'announcements' && action === 'revision' ? communityAnnouncementRevisionSchema.safeParse(payload)
          : resource === 'announcements' && action === 'withdraw' ? communityAnnouncementWithdrawSchema.safeParse(payload) : null;
    if (!parsed?.success) return invalid();
    const status = resource === 'groups' ? payload.state : resource === 'reports' ? payload.outcome : action === 'withdraw' ? 'WITHDRAWN' : 'PUBLISHED';
    if (!exact(value, ['id', 'revision', 'status']) || value.id !== target || value.revision !== parsed.data.expectedRevision + 1 || value.status !== status) return invalid();
    return value as CommunityReceipt;
  }
  if (command === 'room.create') {
    if (!exact(value, ['id', 'command', 'roomId']) || value.roomId !== value.id || value.command !== command) return invalid();
  } else if (!exact(value, ['id', 'command']) || value.command !== command) return invalid();
  return value as CommunityReceipt;
}
export function parseRoom(value: unknown): Room { if (!object(value) || !strings(value, ['id', 'classId', 'name', 'ownerId', 'privateTopic']) || !['CLASS', 'GROUP'].includes(String(value.type)) || !['ACTIVE','CLOSED'].includes(String(value.status)) || typeof value.canModerate !== 'boolean' || typeof value.canPost !== 'boolean' || value.status==='CLOSED'&&value.canPost||value.revision!==undefined&&(!Number.isInteger(value.revision)||Number(value.revision)<1) || !String(value.privateTopic).startsWith('cuevo:') || !String(value.privateTopic).endsWith(`:room:${value.id}`)) throw new LearningApiError('invalid'); return value as Room; }
export function parsePost(value: unknown): Post { if (!object(value) || !strings(value, ['id', 'roomId', 'actorId', 'authorName']) || !(value.replyToId === null || typeof value.replyToId === 'string') || !date(value.createdAt) || !['VISIBLE', 'HIDDEN'].includes(String(value.status)) || (value.status === 'HIDDEN' ? value.body !== null : typeof value.body !== 'string') || !Array.isArray(value.reactions) || value.reactions.some(reaction => !object(reaction) || !['THANKS', 'HELPFUL', 'ENCOURAGE'].includes(String(reaction.reaction)) || typeof reaction.count !== 'number' || !Number.isInteger(reaction.count) || reaction.count < 0 || typeof reaction.mine !== 'boolean')) throw new LearningApiError('invalid'); return value as Post; }
export function parseRosterPerson(value: unknown): RosterPerson { if (!object(value) || !strings(value, ['id', 'displayName']) || !['admin', 'coordinator', 'teacher', 'student'].includes(String(value.role))) throw new LearningApiError('invalid'); return value as RosterPerson; }
export function parseAnnouncement(value: unknown): Announcement { if (!object(value) || !strings(value, ['id', 'title', 'body']) || !(value.classId === null || typeof value.classId === 'string') || typeof value.parentVisible !== 'boolean'||value.canManage!==undefined&&typeof value.canManage!=='boolean' || !date(value.createdAt) || !(value.readAt === null || date(value.readAt))||value.revision!==undefined&&(!Number.isInteger(value.revision)||Number(value.revision)<1)) throw new LearningApiError('invalid'); return value as Announcement; }
export function parseNotification(value: unknown): Notification { if (!object(value) || !strings(value, value.kind==='MENTION'?['id','postId','roomId','title']:['id', 'announcementId', 'title']) || !['ANNOUNCEMENT','MENTION'].includes(String(value.kind)) || !date(value.createdAt) || !(value.readAt === null || date(value.readAt))||value.revision!==undefined&&(!Number.isInteger(value.revision)||Number(value.revision)<1)) throw new LearningApiError('invalid'); return value as Notification; }
export function parseReport(value: unknown): Report { if (!object(value) || !strings(value, ['id', 'postId', 'reporterId', 'reason']) || !date(value.createdAt)) throw new LearningApiError('invalid'); return value as Report; }
