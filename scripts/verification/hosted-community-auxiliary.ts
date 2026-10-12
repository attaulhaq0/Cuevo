import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const fail=()=>Error('Hosted Community auxiliary evidence requires review; private contents withheld.');
const schoolId='10000000-0000-4000-8000-000000000001',classId='30000000-0000-4000-8000-000000000001';
const uuid=z.uuid(),date=z.iso.datetime({offset:true}),generation=z.number().int().positive().safe(),count=z.number().int().min(0).max(3);
const apiSchema=z.object({target:z.enum(['GROUP_POSTS','GROUP_ROSTER','CLASS_POSTS']),status:z.literal(403),code:z.literal('FORBIDDEN'),requestId:z.string().regex(/^[-A-Za-z0-9_.:]{1,200}$/),observedAt:date}).strict();
const joinSchema=z.object({actorId:uuid,schoolId:z.literal(schoolId),generation,roomId:uuid,joinRef:z.string().regex(/^[0-9]{1,20}$/),replyRef:z.string().regex(/^[0-9]{1,20}$/),status:z.enum(['JOINED','DENIED']),observedAt:date}).strict();
const fields={generation,groupId:uuid,classRoomId:uuid,api:z.array(apiSchema).max(2),joins:z.array(joinSchema).max(2),uiGroupOpened:z.boolean(),sessionClosed:z.boolean()};
const sessionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('peer'),actorId:z.literal('20000000-0000-4000-8000-000000000018'),schoolId:z.literal(schoolId),...fields}).strict(),
 z.object({kind:z.literal('outside'),actorId:z.literal('20000000-0000-4000-8000-000000000013'),schoolId:z.literal(schoolId),...fields}).strict(),
 z.object({kind:z.literal('foreign'),actorId:z.literal('20000000-0000-4000-8000-000000000133'),schoolId:z.literal('10000000-0000-4000-8000-000000000002'),...fields}).strict(),
]);
const observationSchema=z.object({sessionsStarted:count,sessionsClosed:count,observations:z.array(sessionSchema).max(3)}).strict();
const expectedSchema=z.object({groupId:uuid,classRoomId:uuid,observedAfter:date,observedBefore:date}).strict();
export type HostedCommunityAuxiliarySessionObservation=z.infer<typeof sessionSchema>;
export type HostedCommunityAuxiliaryObservation=z.infer<typeof observationSchema>;
export type HostedCommunityAuxiliaryCompletionExpected=z.infer<typeof expectedSchema>;

/** Minimized supplied observations only. Parsing never grants membership,
 * protected route, private join, native proof or customer acceptance authority. */
export function parseHostedCommunityAuxiliaryObservation(value:unknown):HostedCommunityAuxiliaryObservation{
 try{return observationSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));}catch{throw fail();}
}
export function emptyHostedCommunityAuxiliaryObservation():HostedCommunityAuxiliaryObservation{return{sessionsStarted:0,sessionsClosed:0,observations:[]};}

/** Complete finite consistency checks for the three selected read-only sessions.
 * The producer must independently prove actual Auth/API/provider execution. */
export function validateHostedCommunityAuxiliaryCompletion(value:unknown,expected:HostedCommunityAuxiliaryCompletionExpected):HostedCommunityAuxiliaryObservation{
 try{
  const result=parseHostedCommunityAuxiliaryObservation(value),scope=expectedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(expected))),after=Date.parse(scope.observedAfter),before=Date.parse(scope.observedBefore);
  if(before<after||scope.groupId===scope.classRoomId||scope.groupId===classId||scope.classRoomId===classId||result.sessionsStarted!==3||result.sessionsClosed!==3||result.observations.length!==3)throw fail();
  const kinds=['peer','outside','foreign'],requests=new Set<string>();let priorSessionEnd=after;
  for(const[index,row]of result.observations.entries()){
   if(row.kind!==kinds[index]||row.generation!==1||row.groupId!==scope.groupId||row.classRoomId!==scope.classRoomId||!row.sessionClosed||row.uiGroupOpened!==(row.kind==='peer')||row.api.length!==2||row.joins.length!==2)throw fail();
   const apiTargets=row.kind==='peer'?['GROUP_POSTS','GROUP_ROSTER']:['GROUP_POSTS','CLASS_POSTS'];
   const times=[...row.api.map(item=>Date.parse(item.observedAt)),...row.joins.map(item=>Date.parse(item.observedAt))];
   if(times.some(time=>time<after||time>before)||Math.min(...times)<priorSessionEnd)throw fail();
   for(const[readIndex,item]of row.api.entries()){if(item.target!==apiTargets[readIndex]||requests.has(item.requestId))throw fail();requests.add(item.requestId);if(readIndex&&Date.parse(item.observedAt)<Date.parse(row.api[readIndex-1].observedAt))throw fail();}
   for(const[joinIndex,item]of row.joins.entries()){
    if(item.actorId!==row.actorId||item.generation!==row.generation||item.joinRef!==item.replyRef||item.roomId!==(joinIndex===0||row.kind==='peer'?scope.groupId:scope.classRoomId)||item.status!==(row.kind==='peer'&&joinIndex===0?'JOINED':'DENIED')||joinIndex&&Date.parse(item.observedAt)<Date.parse(row.joins[joinIndex-1].observedAt))throw fail();
   }
   if(row.kind==='peer'&&row.api.some(item=>Date.parse(item.observedAt)<Date.parse(row.joins[0].observedAt)))throw fail();
   priorSessionEnd=Math.max(...times);
  }
  return result;
 }catch{throw fail();}
}
