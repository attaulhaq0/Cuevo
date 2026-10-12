import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const uuid = z.uuid(), ref = z.string().regex(/^[0-9]{1,20}$/).nullable();
const actorSchema = z.object({ schoolId: uuid, actorId: uuid, role: z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']) }).strict();
const scopeSchema = z.object({ schoolId: uuid, classId: uuid, classRoomId: uuid, groupId: uuid.nullable(), announcementId: uuid.nullable() }).strict();
export type HostedCommunityReadScope = z.infer<typeof scopeSchema>;
export type HostedCommunityReadActor = z.infer<typeof actorSchema>;
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
const auxiliaryActorSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('peer'),actorId:z.literal('20000000-0000-4000-8000-000000000018'),schoolId:z.literal('10000000-0000-4000-8000-000000000001'),role:z.literal('student')}).strict(),
  z.object({kind:z.literal('outside'),actorId:z.literal('20000000-0000-4000-8000-000000000013'),schoolId:z.literal('10000000-0000-4000-8000-000000000001'),role:z.literal('student')}).strict(),
  z.object({kind:z.literal('foreign'),actorId:z.literal('20000000-0000-4000-8000-000000000133'),schoolId:z.literal('10000000-0000-4000-8000-000000000002'),role:z.literal('student')}).strict(),
]);
export type HostedCommunityAuxiliaryActor=z.infer<typeof auxiliaryActorSchema>;
export type HostedCommunityAuxiliaryDenial='GROUP_POSTS'|'CLASS_POSTS'|'GROUP_ROSTER';
function readUrl(path:string,learner:string,strict=false):URL|null{
  if(!path.startsWith('/v1/')||/[#%]/.test(path)||path.includes('..')||path.includes('//')||strict&&(path.endsWith('?')||path.endsWith('&')))return null;
  const url=new URL(path,'https://community.fixture.invalid');if(url.pathname+url.search!==path)return null;
  const keys=new Set<string>();
  for(const[key,value]of url.searchParams){
    const learnerShell=['/v1/portfolio/items','/v1/school/calendar','/v1/development/goals'].includes(url.pathname);
    if(keys.has(key)||!['limit','cursor',...(learnerShell?['learnerId']:[])].includes(key)||key==='limit'&&!/^(?:[1-9]|[1-9][0-9]|100)$/.test(value)||key==='cursor'&&!uuid.safeParse(value).success||key==='learnerId'&&value!==learner)return null;
    keys.add(key);
  }
  if(strict&&url.search&&url.search!=='?'+url.searchParams.toString())return null;
  return url;
}
function shellReadAllowed(url:URL,role:HostedCommunityReadActor['role'],learner:string,auxiliary=false):boolean{
  const p=url.pathname;
  if(['/v1/learners/'+learner+'/state','/v1/learners/'+learner+'/academic-report','/v1/learners/'+learner+'/report-periods'].includes(p))return true;
  if(['/v1/interventions','/v1/portfolio/items','/v1/school/calendar',...(!auxiliary?['/v1/marking','/v1/recommendations']:[])].includes(p))return true;
  if(!auxiliary&&role==='parent'&&p==='/v1/people'||role==='student'&&['/v1/assessments','/v1/results','/v1/submissions','/v1/development/goals'].includes(p))return true;
  if(p==='/v1/me'||p==='/v1/diagnostics/config')return !url.search;
  return ['/v1/classes','/v1/notifications','/v1/notifications/preferences','/v1/community/announcements','/v1/community/notifications','/v1/community/mentions',...(!auxiliary?['/v1/community/conversations','/v1/community/conversations/policy']:[])].includes(p);
}
function auxiliaryScope(value:HostedCommunityReadScope):HostedCommunityReadScope{
  const scope=scopeSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));
  if(scope.schoolId!=='10000000-0000-4000-8000-000000000001'||scope.classId!=='30000000-0000-4000-8000-000000000001'||scope.groupId===scope.classRoomId||scope.groupId===scope.classId||scope.classRoomId===scope.classId)throw Error('Unavailable');return scope;
}

/** Normal initial membership selection has no school header yet. Only the exact
 * captured current actor/token may perform that read; its response must then
 * establish the expected school before any scoped source or mutation is used. */
export function hostedCommunityRequestIdentityAllowed(headers: Record<string, string>, expected: { apiOrigin: string; path: string; actor: HostedCommunityReadActor; token: string; membershipVerified: boolean }): boolean {
  try {
    const actor = actorSchema.parse(expected.actor); if (!expected.token || headers.authorization !== 'Bearer ' + expected.token) return false;
    if(expected.path!=='/v1/me'&&!expected.membershipVerified)return false;
    if (headers['x-school-id'] === actor.schoolId) return true;
    return headers['x-school-id'] === undefined && expected.path === '/v1/me' && expected.membershipVerified === false;
  } catch { return false; }
}

/** Path admission alone confers no role or token authority. The hosted route
 * owner independently binds this finite allowlist to the issued request. */
export function hostedCommunityReadAllowed(path: string, selected: HostedCommunityReadScope, actor: HostedCommunityReadActor): boolean {
  try {
    const scope = scopeSchema.parse(selected), current = actorSchema.parse(actor);
    if(current.schoolId!==scope.schoolId)return false;
    const url=readUrl(path,'20000000-0000-4000-8000-000000000012');if(!url)return false;const p=url.pathname;
    if(shellReadAllowed(url,current.role,'20000000-0000-4000-8000-000000000012'))return true;
    if (p === '/v1/community/rooms') return current.role !== 'parent';
    if (scope.announcementId && p === '/v1/community/announcements/' + scope.announcementId) return !url.search;
    const room = /^\/v1\/community\/rooms\/([^/]+)\/(roster|posts|reports)$/.exec(p);
    return !!room && current.role !== 'parent' && [scope.classRoomId, scope.groupId].includes(room[1])
      && (room[2] !== 'reports' || ['admin', 'teacher'].includes(current.role));
  } catch { return false; }
}

/** Finite auxiliary normal reads are confined to the three selected students'
 * own shell sources. Path allowance does not validate current membership. */
export function hostedCommunityAuxiliaryReadAllowed(path:string,selected:HostedCommunityReadScope,actor:HostedCommunityAuxiliaryActor):boolean{
  try{
    const scope=auxiliaryScope(selected),current=auxiliaryActorSchema.parse(JSON.parse(canonicalReleaseExecutionJson(actor))),url=readUrl(path,current.actorId,true);if(!url)return false;
    if(shellReadAllowed(url,current.role,current.actorId,true)||url.pathname==='/v1/community/rooms')return true;
    if(current.schoolId!==scope.schoolId)return false;
    if(scope.announcementId&&url.pathname==='/v1/community/announcements/'+scope.announcementId)return !url.search;
    const room=/^\/v1\/community\/rooms\/([^/]+)\/(roster|posts)$/.exec(url.pathname);return !!room&&[scope.classRoomId,scope.groupId].includes(room[1]);
  }catch{return false;}
}

/** A declared denial probe admits only its recorded group/class source. The
 * protected response owner must verify a real denial; this grants no read. */
export function hostedCommunityAuxiliaryDenialReadAllowed(path:string,selected:HostedCommunityReadScope,actor:HostedCommunityAuxiliaryActor,denial:HostedCommunityAuxiliaryDenial):boolean{
  try{
    const scope=auxiliaryScope(selected),current=auxiliaryActorSchema.parse(JSON.parse(canonicalReleaseExecutionJson(actor))),url=readUrl(path,current.actorId,true);if(!url)return false;
    const target=denial==='CLASS_POSTS'?'/v1/community/rooms/'+scope.classRoomId+'/posts':scope.groupId&&denial==='GROUP_POSTS'?'/v1/community/rooms/'+scope.groupId+'/posts':scope.groupId&&denial==='GROUP_ROSTER'?'/v1/community/rooms/'+scope.groupId+'/roster':null;
    return !!target&&url.pathname===target;
  }catch{return false;}
}

export function hostedCommunityAuxiliaryRequestIdentityAllowed(headers:Record<string,string>,expected:{apiOrigin:string;path:string;actor:HostedCommunityAuxiliaryActor;token:string;membershipVerified:boolean;scope:HostedCommunityReadScope;denial?:HostedCommunityAuxiliaryDenial}):boolean{
  try{
    const current=auxiliaryActorSchema.parse(JSON.parse(canonicalReleaseExecutionJson(expected.actor))),scope=auxiliaryScope(expected.scope),origin=new URL(expected.apiOrigin);
    if(origin.origin!==expected.apiOrigin||origin.protocol!=='https:'||origin.username||origin.password||!expected.token||headers.authorization!=='Bearer '+expected.token)return false;
    if(expected.denial!==undefined)return expected.membershipVerified&&headers['x-school-id']===scope.schoolId&&hostedCommunityAuxiliaryDenialReadAllowed(expected.path,scope,current,expected.denial);
    if(!hostedCommunityAuxiliaryReadAllowed(expected.path,scope,current)||expected.path!=='/v1/me'&&!expected.membershipVerified)return false;
    if(headers['x-school-id']===current.schoolId)return true;
    return headers['x-school-id']===undefined&&expected.path==='/v1/me'&&!expected.membershipVerified;
  }catch{return false;}
}

/** Only the installed client's fixed websocket endpoint and protocol version.
 * The publishable key is public configuration, never channel authority. */
export function validateHostedCommunitySocket(value: string, expected: { authOrigin: string; publishable: string }): boolean {
  try {
    const auth = new URL(expected.authOrigin), url = new URL(value);
    if (auth.origin !== expected.authOrigin || auth.protocol !== 'https:' || url.protocol !== 'wss:' || url.host !== auth.host
      || url.username || url.password || url.hash || url.pathname !== '/realtime/v1/websocket') return false;
    const keys = [...url.searchParams.keys()];
    return keys.length === 2 && new Set(keys).size === 2 && keys.every(key => ['apikey', 'vsn'].includes(key))
      && url.searchParams.get('apikey') === expected.publishable && url.searchParams.get('vsn') === '2.0.0';
  } catch { return false; }
}

const socketFrame = z.tuple([ref, ref, z.string().max(200), z.string().max(50), z.unknown()]);
const empty = z.object({}).strict();
/** Admit subscribe/leave/heartbeat/current-token updates only. Never admit a
 * client broadcast, presence publication, table subscription or replay. */
export function validateHostedCommunityOutbound(bytes: string | Uint8Array, expected: { topic: string; token: string }): boolean {
  try {
    if (typeof bytes !== 'string' || Buffer.byteLength(bytes) > 65536) return false;
    const [join, reference, topic, event, payload] = socketFrame.parse(JSON.parse(bytes)); void join;
    if (!reference || !/^realtime:cuevo:[a-f0-9-]{36}:room:[a-f0-9-]{36}$/.test(expected.topic) || expected.token.length < 1) return false;
    if (topic === 'phoenix' && event === 'heartbeat') return empty.safeParse(payload).success;
    if (topic !== expected.topic) return false;
    if (event === 'phx_leave') return empty.safeParse(payload).success;
    if (event === 'access_token') return z.object({ access_token: z.literal(expected.token) }).strict().safeParse(payload).success;
    if (event !== 'phx_join') return false;
    return z.object({ config: z.object({ broadcast: z.object({ ack: z.literal(false), self: z.literal(false) }).strict(),
      presence: z.object({ key: z.literal(''), enabled: z.literal(false) }).strict(), postgres_changes: z.array(z.never()).length(0), private: z.literal(true) }).strict(),
      access_token: z.literal(expected.token), version: z.literal('realtime-js/2.117.2').optional() }).strict().safeParse(payload).success;
  } catch { return false; }
}

/** Decode only the pinned receive-side binary broadcast format. The installed
 * serializer defines five header bytes, UTF8 topic/event, no metadata, JSON1.
 * Every decoded value is strictly validated before any evidence is retained. */
function incoming(bytes: string | Uint8Array): unknown {
  if (typeof bytes === 'string') { if (Buffer.byteLength(bytes) > 65536) throw Error('Unavailable'); return JSON.parse(bytes); }
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 65536 || bytes[0] !== 4 || bytes[3] !== 0 || bytes[4] !== 1) throw Error('Unavailable');
  const topicEnd = 5 + bytes[1], eventEnd = topicEnd + bytes[2]; if (topicEnd <= 5 || eventEnd <= topicEnd || eventEnd >= bytes.length) throw Error('Unavailable');
  const decode = (part: Uint8Array) => new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(part);
  return [null, null, decode(bytes.subarray(5, topicEnd)), 'broadcast', { type: 'broadcast', event: decode(bytes.subarray(topicEnd, eventEnd)), payload: JSON.parse(decode(bytes.subarray(eventEnd))) }];
}

/** Decode the fixed installed wire format without creating channel authority.
 * Successful current joins are owned separately by the socket lifetime gate. */
export function readHostedCommunityFrame(bytes: string | Uint8Array): z.infer<typeof socketFrame> | null {
  try { return socketFrame.parse(incoming(bytes)); } catch { return null; }
}

export function readHostedCommunityInvalidation(bytes: string | Uint8Array, expected: { schoolId: string; roomId: string }): { eventId: string; roomId: string } | null {
  try {
    const school = uuid.parse(expected.schoolId), room = uuid.parse(expected.roomId), [join, reference, topic, event, payload] = socketFrame.parse(incoming(bytes)); void join; void reference;
    if (topic !== 'realtime:cuevo:' + school + ':room:' + room || event !== 'broadcast') return null;
    const checked = z.object({ type: z.literal('broadcast'), event: z.literal('invalidate'), payload: z.object({ eventId: uuid, roomId: z.literal(room) }).strict() }).strict().parse(payload);
    return same(checked.payload.roomId, room) ? checked.payload : null;
  } catch { return null; }
}
