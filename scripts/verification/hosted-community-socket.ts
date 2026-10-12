import { z } from 'zod';
import { readHostedCommunityFrame, readHostedCommunityInvalidation, validateHostedCommunityOutbound } from './hosted-community-transport';

const currentSchema = z.object({ actorId: z.uuid(), schoolId: z.uuid(), generation: z.number().int().positive().safe(),
  token: z.string().min(1).max(24576), allowedRoomIds: z.array(z.uuid()).max(16).refine(rooms => new Set(rooms).size === rooms.length) }).strict();
export type HostedCommunitySocketCurrent = Omit<z.infer<typeof currentSchema>, 'allowedRoomIds'> & { allowedRoomIds: readonly string[] };
export type HostedCommunitySocketInvalidation = { eventId: string; roomId: string; schoolId: string; actorId: string; generation: number;
  joinProof: { joinRef: string; replyRef: string }; observedAt: string };
export type HostedCommunitySocketJoinObservation={actorId:string;schoolId:string;generation:number;roomId:string;joinRef:string;replyRef:string;status:'JOINED'|'DENIED';observedAt:string};
export type HostedCommunitySocketDenialTarget={schoolId:string;roomIds:readonly string[]};
type Options = { readCurrent: () => HostedCommunitySocketCurrent | null; assertOriginalValidity: () => void;
  fail: () => void | Promise<void>; close: () => void; now?: () => Date;readDenialTarget?:()=>HostedCommunitySocketDenialTarget|null };
type Join = { joinRef: string; token: string; replyRef: string | null;denial:boolean;observation:HostedCommunitySocketJoinObservation|null };
const denialTargetSchema=z.object({schoolId:z.literal('10000000-0000-4000-8000-000000000001'),roomIds:z.array(z.uuid()).min(1).max(2).refine(rows=>new Set(rows).size===rows.length)}).strict();
type Pending = { topic: string; joinRef: string | null; event: 'phx_join' | 'phx_leave' | 'access_token' | 'heartbeat'; token: string };
const empty = z.object({}).strict();
const joinOk = z.union([empty, z.object({ postgres_changes: z.array(z.never()).length(0) }).strict()]);
const joinError = z.object({ reason: z.string().min(1).max(200) }).strict();
const replySchema = z.object({ status: z.enum(['ok', 'error']), response: z.unknown() }).strict();

/** Finite receive-only evidence owner. The callback must read the wrapper's
 * current validated membership/issuance state; passing data cannot confer any
 * provider authority. Each connection permanently retains its issued actor,
 * school and generation, while successful joins retain their exact token/ref. */
export function createHostedCommunitySocketGate(options: Options) {
  const readDenialTarget=options.readDenialTarget;
  let closed = false, failed = false;
  let issued: { actorId: string; schoolId: string; generation: number } | null = null;
  let currentToken: string | null = null;
  const seenTokens = new Set<string>();
  const joins = new Map<string, Join>(), pending = new Map<string, Pending>(), usedRefs = new Set<string>();
  const clear = () => { joins.clear(); pending.clear(); usedRefs.clear(); seenTokens.clear(); currentToken = null; };
  const reject = () => {
    if (!closed) {
      closed = true; failed = true; clear();
      try { options.close(); } catch { /* The refusal remains latched if closure fails. */ }
      try { void Promise.resolve(options.fail()).catch(() => {}); } catch { /* Contain event callback failures. */ }
    }
    return false;
  };
  const current = () => {
    if (closed) return null;
    try {
      options.assertOriginalValidity();
      const value = currentSchema.parse(options.readCurrent());
      if (issued && (value.actorId !== issued.actorId || value.schoolId !== issued.schoolId || value.generation !== issued.generation)) throw Error('Unavailable');
      if (value.token !== currentToken) {
        if (seenTokens.has(value.token) || seenTokens.size >= 64) throw Error('Unavailable');
        seenTokens.add(value.token); currentToken = value.token;
        // Rotation cannot revive any prior channel proof. Retain exact topic
        // refs for receive-only leave, while socket-level heartbeats may settle.
        for (const selected of joins.values()){selected.replyRef = null;selected.observation=null;}
        for (const [ref, request] of pending) if (request.event !== 'heartbeat') pending.delete(ref);
      }
      return value;
    } catch { reject(); return null; }
  };
  const first = current();
  if (first) issued = { actorId: first.actorId, schoolId: first.schoolId, generation: first.generation };
  const roomFor = (topic: string, state: z.infer<typeof currentSchema>) => state.allowedRoomIds.find(room => topic === 'realtime:cuevo:' + state.schoolId + ':room:' + room) ?? null;
  const denialTarget=(state:z.infer<typeof currentSchema>)=>{
    if(!readDenialTarget)return null;
    try{const target=denialTargetSchema.parse(readDenialTarget());
      const ownSchool=state.actorId==='20000000-0000-4000-8000-000000000133'?'10000000-0000-4000-8000-000000000002':['20000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000018'].includes(state.actorId)?target.schoolId:null;
      if(!ownSchool||state.schoolId!==ownSchool||state.allowedRoomIds.length)throw Error('Unavailable');return target;
    }catch{reject();return null;}
  };
  const denialFor=(topic:string,state:z.infer<typeof currentSchema>)=>{const target=denialTarget(state);return target?.roomIds.find(room=>topic==='realtime:cuevo:'+target.schoolId+':room:'+room)??null;};
  const drain = (topic: string) => { joins.delete(topic); for (const [ref, item] of pending) if (item.topic === topic) pending.delete(ref); };
  const retireProof = (topic: string, selected: Join) => { drain(topic); joins.set(topic, { ...selected, replyRef: null,observation:null }); };
  const refusal = () => { reject(); return { allowed: false, invalidation: null,join:null }; };
  const observedAt=()=>{const value=(options.now??(()=>new Date()))();if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw Error('Unavailable');return value.toISOString();};
  return {
    outbound(bytes: string | Uint8Array): boolean {
      const state = current(), parsed = readHostedCommunityFrame(bytes);
      if (!state || !parsed || typeof bytes !== 'string') return reject();
      const [joinRef, ref, topic, event] = parsed, denialRoom=denialFor(topic,state),room = roomFor(topic, state)??denialRoom;if(closed)return reject();
      if (!ref || usedRefs.has(ref) || usedRefs.size >= 2048) return reject();
      if (topic === 'phoenix') {
        if (joinRef !== null || event !== 'heartbeat' || !validateHostedCommunityOutbound(bytes, { topic: 'realtime:cuevo:' + state.schoolId + ':room:' + (state.allowedRoomIds[0] ?? denialTarget(state)?.roomIds[0]??''), token: state.token })) return reject();
        // At most one unanswered heartbeat is part of the installed protocol.
        if ([...pending.values()].some(item => item.event === 'heartbeat')) return reject();
        usedRefs.add(ref); pending.set(ref, { topic, joinRef, event, token: state.token }); return true;
      }
      if (!room || !validateHostedCommunityOutbound(bytes, { topic, token: state.token })) return reject();
      if (event === 'phx_join') {
        if (joinRef !== ref) return reject();
        drain(topic); joins.set(topic, { joinRef, token: state.token, replyRef: null,denial:!!denialRoom,observation:null });
      } else {
        const selected = joins.get(topic);
        if (!selected || joinRef !== selected.joinRef || !['phx_leave', 'access_token'].includes(event)) return reject();
        if (event === 'phx_leave') drain(topic);
      }
      if (pending.size >= 64) return reject();
      usedRefs.add(ref); pending.set(ref, { topic, joinRef, event: event as Pending['event'], token: state.token }); return true;
    },
    inbound(bytes: string | Uint8Array): { allowed: boolean; invalidation: HostedCommunitySocketInvalidation | null;join:HostedCommunitySocketJoinObservation|null } {
      const state = current(), parsed = readHostedCommunityFrame(bytes);
      if (!state || !parsed) return refusal();
      const [joinRef, ref, topic, event, payload] = parsed;
      if (event === 'phx_reply') {
        if (!ref) return refusal();
        const request = pending.get(ref), reply = replySchema.safeParse(payload);
        if (!request || request.topic !== topic || request.joinRef !== joinRef || !reply.success || request.event !== 'heartbeat' && request.token !== state.token
          || topic !== 'phoenix' && !roomFor(topic, state)&&!denialFor(topic,state)||closed) return refusal();
        const { status, response } = reply.data;
        if (request.event === 'phx_join') {
          const selected = joins.get(topic);
          if (!selected || selected.joinRef !== joinRef || selected.token !== state.token
            || status === 'ok' && !joinOk.safeParse(response).success || status === 'error' && !joinError.safeParse(response).success) return refusal();
          pending.delete(ref);
          if(selected.denial&&status==='ok')return refusal();
          const authorizationDenied=status==='error'&&joinError.parse(response).reason==='You do not have permissions to read from this Channel topic: '+topic.slice('realtime:'.length);
          if(status==='error'&&!authorizationDenied){if(selected.denial)return refusal();retireProof(topic,selected);return{allowed:true,invalidation:null,join:null};}
          let observation:HostedCommunitySocketJoinObservation;
          try{observation={actorId:state.actorId,schoolId:selected.denial?'10000000-0000-4000-8000-000000000001':state.schoolId,generation:state.generation,roomId:roomFor(topic,state)??denialFor(topic,state)!,joinRef:selected.joinRef,replyRef:ref,status:status==='ok'?'JOINED':'DENIED',observedAt:observedAt()};}catch{return refusal();}
          if (status === 'ok') selected.replyRef = ref;
          else retireProof(topic, selected);
          if(status==='ok')selected.observation=observation;
          return{allowed:true,invalidation:null,join:observation};
        } else {
          if (status !== 'ok' || !empty.safeParse(response).success) return refusal();
          pending.delete(ref);
        }
        return { allowed: true, invalidation: null,join:null };
      }
      const room = roomFor(topic, state)??denialFor(topic,state), selected = joins.get(topic);if(closed)return refusal();
      if (!room || !selected || joinRef !== null && joinRef !== selected.joinRef) return refusal();
      if (event === 'phx_error' || event === 'phx_close') {
        if (joinRef !== selected.joinRef || ref !== null || !empty.safeParse(payload).success) return refusal();
        retireProof(topic, selected); return { allowed: true, invalidation: null,join:null };
      }
      if (selected.denial||event !== 'broadcast' || ref !== null || selected.replyRef === null || selected.token !== state.token) return refusal();
      const invalidation = readHostedCommunityInvalidation(bytes, { schoolId: state.schoolId, roomId: room });
      if (!invalidation) return refusal();
      try {
        const observed = (options.now ?? (() => new Date()))();
        if (!(observed instanceof Date) || !Number.isFinite(observed.getTime())) return refusal();
        return { allowed: true, invalidation: { ...invalidation, schoolId: state.schoolId, actorId: state.actorId, generation: state.generation,
          joinProof: { joinRef: selected.joinRef, replyRef: selected.replyRef }, observedAt: observed.toISOString() },join:null };
      } catch { return refusal(); }
    },
    /** Current successful proof only; denied outcomes never become join authority. */
    joinInfo(roomId:string):HostedCommunitySocketJoinObservation|null{
      const state=current();if(!state||!z.uuid().safeParse(roomId).success)return null;const selected=joins.get('realtime:cuevo:'+state.schoolId+':room:'+roomId);
      if(!state.allowedRoomIds.includes(roomId)||!selected||selected.denial||!selected.replyRef||selected.token!==state.token||!selected.observation)return null;return{...selected.observation};
    },
    /** Disposal when the owned socket closes normally. Retires evidence; this
     * does not attest that pending replies, Auth or provider cleanup completed. */
    close() { closed = true; clear(); },
    /** Reports only the local disposal/refusal latch, never cleanup acceptance. */
    status() { return { closed, failed }; },
  };
}
