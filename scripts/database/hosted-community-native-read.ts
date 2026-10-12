import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { selectHostedCommunityNativeReadSelection, reconstructHostedCommunityNativeReadCommands, parseHostedCommunityNativeReadEvidence,
 type HostedCommunityNativeReadEvidence, type HostedCommunityNativeCommandEvidence, type HostedCommunityNativeReadSelection } from '../verification/hosted-community-native';
import { confirmCommunityReceipt } from '../../apps/web/features/community/model';

const failure=()=>Error('Hosted Community native evidence requires review; private contents withheld.');
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const clock=(field:string)=>`to_char(${field} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const nullableClock=(field:string)=>`case when ${field} is null then null else ${clock(field)} end`;
const textHash=(field:string)=>`encode(sha256(convert_to(${field},'UTF8')),'hex')`;
type Rows=Record<string,unknown>[];
/** Internal composition only: the facade supplies its already verified private
 * session. This owner never creates a connection or accepts caller SQL. */
type CommunityReadSession={check():void;rows(sql:string,args:unknown[],maximum:number):Promise<Rows>};
const currentSql=`/* CUEVO_COMMUNITY_CURRENT_SCOPE */ with observed_clock as materialized(select clock_timestamp() as observed_at) select
 not exists(select 1 from app.people where school_id=$1 and synthetic is distinct from true)
 and not exists(select 1 from app.memberships m left join app.people p on p.school_id=m.school_id and p.actor_id=m.actor_id where m.school_id=$1 and p.synthetic is distinct from true) as synthetic,
 $1::uuid as school_id,$2::uuid as class_id,
 (select id from app.community_rooms where school_id=$1 and class_id=$2 and type='CLASS' and status='ACTIVE') as class_room_id,
 exists(select 1 from app.schools where id=$1 and status='active') as school_active,
 exists(select 1 from app.classes where school_id=$1 and id=$2 and status='active') as class_active,
 exists(select 1 from app.entitlements where school_id=$1 and code='community' and enabled and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as community_enabled,
 (select role from app.memberships where school_id=$1 and actor_id=$3 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as teacher_role,
 (select role from app.memberships where school_id=$1 and actor_id=$4 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as student_role,
 (select role from app.memberships where school_id=$1 and actor_id=$5 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as peer_role,
 (select role from app.memberships where school_id=$1 and actor_id=$6 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as parent_role,
 (select m.role from app.memberships m join app.people p on p.school_id=m.school_id and p.actor_id=m.actor_id where m.school_id=$1 and m.actor_id='20000000-0000-4000-8000-000000000013' and m.status='active' and m.effective_from<=observed_clock.observed_at and(m.effective_to is null or m.effective_to>observed_clock.observed_at) and p.synthetic is true) as outside_role,
 exists(select 1 from app.enrollments where school_id=$1 and class_id=$2 and student_actor_id='20000000-0000-4000-8000-000000000013' and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as outside_enrolled,
 exists(select 1 from app.schools where id='10000000-0000-4000-8000-000000000002' and status='active') as foreign_school_active,
 (select m.role from app.memberships m join app.people p on p.school_id=m.school_id and p.actor_id=m.actor_id where m.school_id='10000000-0000-4000-8000-000000000002' and m.actor_id='20000000-0000-4000-8000-000000000133' and m.status='active' and m.effective_from<=observed_clock.observed_at and(m.effective_to is null or m.effective_to>observed_clock.observed_at) and p.synthetic is true) as foreign_role,
 exists(select 1 from app.memberships where school_id=$1 and actor_id='20000000-0000-4000-8000-000000000133' and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as foreign_current_main_membership,
 exists(select 1 from app.entitlements where school_id='10000000-0000-4000-8000-000000000002' and code='community' and enabled and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as foreign_community_enabled,
 exists(select 1 from app.teacher_assignments where school_id=$1 and class_id=$2 and teacher_actor_id=$3 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as teacher_assigned,
 exists(select 1 from app.enrollments where school_id=$1 and class_id=$2 and student_actor_id=$4 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as student_enrolled,
 exists(select 1 from app.enrollments where school_id=$1 and class_id=$2 and student_actor_id=$5 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as peer_enrolled,
 exists(select 1 from app.parent_relationships where school_id=$1 and parent_actor_id=$6 and student_actor_id=$4 and status='active' and effective_from<=observed_clock.observed_at and(effective_to is null or effective_to>observed_clock.observed_at)) as parent_linked from observed_clock`;
const ledgerSql=`/* CUEVO_COMMUNITY_ORIGINAL */ select school_id,actor_id,key,command,fingerprint,state,response,${clock('created_at')} as created_at,${nullableClock('completed_at')} as completed_at from internal.idempotency_keys where school_id=$1 and actor_id=$2 and key=$3 and command=$4 limit 2`;
const auditSql=`/* CUEVO_COMMUNITY_AUDIT */ select id,school_id,actor_id,action,entity_type,entity_id,request_id,outcome,metadata,${clock('occurred_at')} as occurred_at from internal.audit_events where school_id=$1 and actor_id=$2 and action=$3 and entity_type=$4 and entity_id=$5 and request_id=$6 and outcome='succeeded' and occurred_at>=$7::timestamptz and occurred_at<=$8::timestamptz limit 2`;
const eventSql=`/* CUEVO_COMMUNITY_OUTBOX */ select id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,${clock('occurred_at')} as occurred_at,state,attempt_count,max_attempts,${clock('available_at')} as available_at,lease_token,${nullableClock('lease_until')} as lease_until,${nullableClock('completed_at')} as completed_at,last_error_code from internal.outbox_events where school_id=$1 and actor_id=$2 and type=$3 and entity_type=$4 and entity_id=$5 and deduplication_key=$6 limit 2`;
const broadcastsSql=`/* CUEVO_COMMUNITY_BROADCAST */ select receipt.event_id,${clock('receipt.broadcast_at')} as broadcast_at from internal.community_broadcast_receipts receipt join internal.outbox_events event on event.id=receipt.event_id where event.school_id=$1 and event.id=$2 limit 2`;
const processedSql=`/* CUEVO_COMMUNITY_PROCESSED */ select event_id,school_id,${clock('processed_at')} as processed_at from internal.processed_events where school_id=$1 and event_id=$2 limit 2`;
const messagesSql=`/* CUEVO_COMMUNITY_MESSAGE */ select $2::uuid as event_id,$3::uuid as room_id,topic,extension,event,private,
 payload=jsonb_build_object('eventId',$2::uuid,'roomId',$3::uuid) as payload_matches,${clock('inserted_at')} as inserted_at
 from realtime.messages where exists(select 1 from internal.outbox_events owned where owned.school_id=$1 and owned.id=$2) and topic=$4 and extension='broadcast' and event='invalidate' and private is true and payload->>'eventId'=$2::text and inserted_at>=$5::timestamptz and inserted_at<=$6::timestamptz order by inserted_at desc limit 2`;
const cleanupSql=`/* CUEVO_COMMUNITY_CLEANUP */ select room.id as room_id,room.status as base_status,
 coalesce(group_revision.state,case when room.status='ACTIVE' then 'ACTIVE' else 'CLOSED' end) as group_state,coalesce(group_revision.revision,1) as group_revision,
 announcement.id as announcement_id,case when announcement.id is null then null else coalesce(announcement_revision.state,'PUBLISHED') end as announcement_state,
 case when announcement.id is null then null else coalesce(announcement_revision.revision,1) end as announcement_revision,
 student.status as student_member_status,peer.status as peer_member_status,student.configured_by as student_configured_by,peer.configured_by as peer_configured_by,reaction.active as reaction_active,
 student_change.id as student_member_change_id,peer_change.id as peer_member_change_id,
 restriction.id as student_restriction_id,moderation.id as post_moderation_id,coalesce(restriction.restriction,'NONE') as student_restriction,coalesce(moderation.action='HIDE',false) as post_hidden
 from app.community_rooms room
 left join lateral(select state,revision from app.community_group_revisions where school_id=room.school_id and room_id=room.id order by revision desc limit 1) group_revision on true
 left join app.community_announcements announcement on announcement.school_id=room.school_id and announcement.id=$3 and announcement.class_id=room.class_id and announcement.actor_id=room.owner_id
 left join lateral(select state,revision from app.community_announcement_revisions where school_id=room.school_id and announcement_id=announcement.id order by revision desc limit 1) announcement_revision on true
 left join app.community_members student on student.school_id=room.school_id and student.room_id=room.id and student.actor_id=$4
 left join app.community_members peer on peer.school_id=room.school_id and peer.room_id=room.id and peer.actor_id=$5
 left join lateral(select id from app.community_member_changes where school_id=room.school_id and room_id=room.id and target_actor_id=$4 order by created_at desc,id desc limit 1) student_change on true
 left join lateral(select id from app.community_member_changes where school_id=room.school_id and room_id=room.id and target_actor_id=$5 order by created_at desc,id desc limit 1) peer_change on true
 left join app.community_reactions reaction on reaction.school_id=room.school_id and reaction.post_id=$6 and reaction.actor_id=$4 and reaction.reaction='HELPFUL'
 left join lateral(select id,restriction from app.community_restrictions where school_id=room.school_id and room_id=room.id and target_actor_id=$4 order by created_at desc,id desc limit 1) restriction on true
 left join lateral(select id,action from app.community_moderations where school_id=room.school_id and post_id=$6 order by created_at desc,id desc limit 1) moderation on true
 where room.school_id=$1 and room.id=$2 and room.class_id=$7 and room.owner_id=$8 and room.type='GROUP' limit 2`;

/** Finite queries follow only the original native command ledger into its
 * source, audit/outbox and processor receipt. Missing evidence stays missing;
 * this read never invokes a mutation, worker, provider or migration command. */
export async function readHostedCommunityNativeRows(value:unknown,session:CommunityReadSession):Promise<HostedCommunityNativeReadEvidence>{
 try{
  const selection=selectHostedCommunityNativeReadSelection(value),commands=reconstructHostedCommunityNativeReadCommands(selection),scope=selection.scope;
  const rows=async(sql:string,args:unknown[],maximum=1):Promise<Rows>=>{session.check();const result=await session.rows(sql,args,maximum);session.check();if(result.length>maximum||Buffer.byteLength(canonicalReleaseExecutionJson(result))>65536)throw failure();return result;};
  const current=await rows(currentSql,[scope.schoolId,scope.classId,scope.teacherActorId,scope.studentActorId,scope.peerActorId,scope.parentActorId]);if(current.length!==1)throw failure();
  const auxiliaryFields={outside_role:z.literal('student'),outside_enrolled:z.literal(false),foreign_school_active:z.literal(true),foreign_role:z.literal('student'),foreign_current_main_membership:z.literal(false),foreign_community_enabled:z.literal(true)};
  const auxiliaryPresent=selection.mode==='LIVE_PREFIX'||Object.keys(auxiliaryFields).some(key=>current[0][key]!==undefined);
  const currentSchema=z.object({synthetic:z.literal(true),school_id:z.literal(scope.schoolId),class_id:z.literal(scope.classId),class_room_id:selection.mode==='LIVE_PREFIX'?z.uuid():z.uuid().optional(),school_active:z.literal(true),class_active:z.literal(true),community_enabled:z.literal(true),teacher_role:z.literal('teacher'),student_role:z.literal('student'),peer_role:z.literal('student'),parent_role:z.literal('parent'),teacher_assigned:z.literal(true),student_enrolled:z.literal(true),peer_enrolled:z.literal(true),parent_linked:z.literal(true),...(auxiliaryPresent?auxiliaryFields:{})}).strict();
  currentSchema.parse(current[0]);if(current[0].class_room_id!==undefined&&(current[0].class_room_id===scope.classId||current[0].class_room_id===scope.group?.id))throw failure();
  const evidence:HostedCommunityNativeCommandEvidence[]=[];const proven=new Set<string>();
  for(const[index,item]of selection.originals.entries()){
   const original=item.original.command,command=commands[index],entry:HostedCommunityNativeCommandEvidence={intentSequence:item.original.intentSequence,ledger:[],source:[],audits:[],events:[],broadcasts:[],processed:[],messages:[]};evidence.push(entry);
   const ledger=await rows(ledgerSql,[scope.schoolId,original.actorId,original.key,command.ledgerCommand]);if(!ledger.length)continue;
   const saved=ledger[0];if(saved.school_id!==scope.schoolId||saved.actor_id!==original.actorId||saved.key!==original.key||saved.command!==command.ledgerCommand||saved.fingerprint!==item.nativeFingerprint||saved.state!=='COMPLETED'||saved.completed_at===null)throw failure();
   const response=z.record(z.string(),z.unknown()).parse(saved.response),receipt=confirmCommunityReceipt(response,{path:original.path,key:original.key,body:command.input},original.actorId);
   if(receipt.id!==item.http.receiptIdentity.receiptId||hash(response)!==item.http.receiptSha256)throw failure();
   const minimized={...response};delete minimized.body;entry.ledger=[{...saved,response:minimized,response_sha256:hash(response)}] as HostedCommunityNativeCommandEvidence['ledger'];
   if(item.targetId!==null&&!proven.has(item.targetId))throw failure();
   proven.add(receipt.id);
   const source=await sourceRows(selection,index,receipt.id,rows);entry.source=source as HostedCommunityNativeCommandEvidence['source'];
   if(source.length!==1)continue;
   const owned=source[0];if(owned.school_id!==scope.schoolId)throw failure();
   const maintenance=command.owner==='maintenance',entity=maintenance?'community_maintenance':'community',entityId=maintenance?z.uuid().parse(owned.id):receipt.id;
   const action=command.ledgerCommand,event=maintenance?'community.maintenance.changed':command.operation==='post.create'?'community.post_created':command.operation==='post.report'?'moderation.reported':'community.changed';
   const dedup=maintenance?`community-maintenance:${entityId}`:command.operation==='notification.read'?`community-read:${receipt.id}:${command.sourceRevision}:${original.actorId}`:`community:${createHash('md5').update(original.actorId+(command.owner==='normal'?command.nativeCommand:'')+original.key).digest('hex')}`;
   entry.audits=await rows(auditSql,[scope.schoolId,original.actorId,action,entity,entityId,item.http.requestId,saved.created_at,saved.completed_at]) as HostedCommunityNativeCommandEvidence['audits'];
   entry.events=await rows(eventSql,[scope.schoolId,original.actorId,event,entity,entityId,dedup]) as HostedCommunityNativeCommandEvidence['events'];
   for(const audit of entry.audits){if(audit.school_id!==scope.schoolId||audit.actor_id!==original.actorId||audit.action!==action||audit.entity_type!==entity||audit.entity_id!==entityId||audit.request_id!==item.http.requestId||audit.outcome!=='succeeded'||hash(audit.metadata)!==hash(maintenance?{sourceId:command.targetId,revision:item.http.receiptIdentity.revision,kind:command.owner==='maintenance'?command.nativeKind:''}:command.operation==='notification.read'?{revision:command.sourceRevision}:{}))throw failure();}
   for(const outbox of entry.events){
    const roomId=['announcement.create','notification.read','announcement.withdraw'].includes(command.operation)?null:scope.group!.id;
    if(outbox.school_id!==scope.schoolId||outbox.actor_id!==original.actorId||outbox.type!==event||outbox.entity_type!==entity||outbox.entity_id!==entityId||outbox.deduplication_key!==dedup||hash(outbox.metadata)!==hash(maintenance?{kind:command.owner==='maintenance'?command.nativeKind:'',sourceId:command.targetId}:{roomId}))throw failure();
    entry.broadcasts=await rows(broadcastsSql,[scope.schoolId,outbox.id]) as HostedCommunityNativeCommandEvidence['broadcasts'];
    entry.processed=await rows(processedSql,[scope.schoolId,outbox.id]) as HostedCommunityNativeCommandEvidence['processed'];
    if(!maintenance&&roomId!==null&&entry.broadcasts.length){
     const topic=`cuevo:${scope.schoolId}:room:${roomId}`;
     const messages=await rows(messagesSql,[scope.schoolId,outbox.id,roomId,topic,outbox.occurred_at,entry.broadcasts[0].broadcast_at]);
     entry.messages=messages.map(message=>{if(message.payload_matches!==true||message.event_id!==outbox.id||message.room_id!==roomId||message.topic!==topic)throw failure();const minimized={...message};delete minimized.payload_matches;return{...minimized,payload_sha256:hash({eventId:outbox.id,roomId})};}) as HostedCommunityNativeCommandEvidence['messages'];
    }
   }
  }
  // Cleanup observes the same ledger-proven source graph; caller receipt IDs
  // alone never authorize a room/announcement/post query.
  if(!scope.group||!proven.has(scope.group.id)||scope.announcement&&!proven.has(scope.announcement.id)||scope.postIds.some(id=>!proven.has(id)))throw failure();
  const cleanup=await rows(cleanupSql,[scope.schoolId,scope.group.id,scope.announcement?.id??null,scope.studentActorId,scope.peerActorId,scope.postIds[0]??null,scope.classId,scope.teacherActorId]);if(cleanup.length!==1)throw failure();
  const latestMember=(actorId:string)=>selection.originals.findLast(item=>item.original.command.operation==='member.configure'&&item.input.actorId===actorId)?.http.receiptIdentity.receiptId??null;
  if(cleanup[0].student_member_change_id!==latestMember(scope.studentActorId)||cleanup[0].peer_member_change_id!==latestMember(scope.peerActorId))throw failure();
  const currentAfter=await rows(currentSql,[scope.schoolId,scope.classId,scope.teacherActorId,scope.studentActorId,scope.peerActorId,scope.parentActorId]);if(currentAfter.length!==1||hash(currentAfter[0])!==hash(current[0]))throw failure();
  return parseHostedCommunityNativeReadEvidence({purpose:'CUEVO_HOSTED_COMMUNITY_NATIVE',identity:selection.identity,current:current[0],commands:evidence,cleanup:cleanup[0]});
 }catch{throw failure();}
}

async function sourceRows(selection:HostedCommunityNativeReadSelection,index:number,id:string,rows:(sql:string,args:unknown[],maximum?:number)=>Promise<Rows>):Promise<Rows>{
 const item=selection.originals[index],scope=selection.scope,input=item.input,operation=item.original.command.operation,actor=item.original.command.actorId,target=item.targetId;
 const created=clock('created_at');
 switch(operation){
  case'room.create':return rows(`/* CUEVO_COMMUNITY_SOURCE_ROOM */ select id,school_id,class_id,type,owner_id,status,policy_version,${textHash('name')} as name_sha256,${created} as created_at from app.community_rooms where school_id=$1 and id=$2 and class_id=$3 and owner_id=$4 and type='GROUP' limit 2`,[scope.schoolId,id,scope.classId,actor]);
  case'member.configure':return rows(`/* CUEVO_COMMUNITY_SOURCE_MEMBER */ select id,school_id,room_id,target_actor_id,status,configured_by,${created} as created_at from app.community_member_changes where school_id=$1 and id=$2 and room_id=$3 and target_actor_id=$4 and configured_by=$5 and status=$6 limit 2`,[scope.schoolId,id,target,input.actorId,actor,input.status]);
  case'post.create':return rows(`/* CUEVO_COMMUNITY_SOURCE_POST */ select id,school_id,room_id,actor_id,reply_to_id,${textHash('body')} as body_sha256,${created} as created_at from app.community_posts where school_id=$1 and id=$2 and room_id=$3 and actor_id=$4 and reply_to_id is not distinct from $5::uuid limit 2`,[scope.schoolId,id,target,actor,input.replyToId]);
  case'reaction.configure':return rows(`/* CUEVO_COMMUNITY_SOURCE_REACTION */ select school_id,post_id,actor_id,reaction,active from app.community_reactions where school_id=$1 and post_id=$2 and actor_id=$3 and reaction='HELPFUL' limit 2`,[scope.schoolId,id,actor]);
  case'post.report':return rows(`/* CUEVO_COMMUNITY_SOURCE_REPORT */ select id,school_id,post_id,actor_id,${textHash('reason')} as reason_sha256,${created} as created_at from app.community_reports where school_id=$1 and id=$2 and post_id=$3 and actor_id=$4 limit 2`,[scope.schoolId,id,target,actor]);
  case'post.moderate':return rows(`/* CUEVO_COMMUNITY_SOURCE_MODERATION */ select id,school_id,post_id,actor_id,action,${textHash('reason')} as reason_sha256,${created} as created_at from app.community_moderations where school_id=$1 and id=$2 and post_id=$3 and actor_id=$4 and action=$5 limit 2`,[scope.schoolId,id,target,actor,input.action]);
  case'room.restrict':return rows(`/* CUEVO_COMMUNITY_SOURCE_RESTRICTION */ select id,school_id,room_id,target_actor_id,actor_id,restriction,${textHash('reason')} as reason_sha256,${created} as created_at from app.community_restrictions where school_id=$1 and id=$2 and room_id=$3 and target_actor_id=$4 and actor_id=$5 and restriction=$6 limit 2`,[scope.schoolId,id,target,input.actorId,actor,input.restriction]);
  case'announcement.create':return rows(`/* CUEVO_COMMUNITY_SOURCE_ANNOUNCEMENT */ select id,school_id,class_id,actor_id,${textHash('title')} as title_sha256,${textHash('body')} as body_sha256,parent_visible,${created} as created_at from app.community_announcements where school_id=$1 and id=$2 and class_id=$3 and actor_id=$4 limit 2`,[scope.schoolId,id,scope.classId,actor]);
  case'notification.read':return rows(`/* CUEVO_COMMUNITY_SOURCE_READ */ select school_id,announcement_id,revision,actor_id,${clock('read_at')} as read_at from app.community_announcement_revision_reads where school_id=$1 and announcement_id=$2 and revision=$3 and actor_id=$4 limit 2`,[scope.schoolId,id,input.expectedRevision,actor]);
  case'group.lifecycle':return rows(`/* CUEVO_COMMUNITY_SOURCE_GROUP_REVISION */ select id,school_id,room_id,revision,actor_id,${textHash('name')} as name_sha256,state,${textHash('reason')} as reason_sha256,${created} as created_at from app.community_group_revisions where school_id=$1 and room_id=$2 and revision=$3 and actor_id=$4 limit 2`,[scope.schoolId,id,item.http.receiptIdentity.revision,actor]);
  case'announcement.withdraw':return rows(`/* CUEVO_COMMUNITY_SOURCE_ANNOUNCEMENT_REVISION */ select id,school_id,announcement_id,revision,actor_id,${textHash('title')} as title_sha256,${textHash('body')} as body_sha256,parent_visible,state,${textHash('reason')} as reason_sha256,${created} as created_at from app.community_announcement_revisions where school_id=$1 and announcement_id=$2 and revision=$3 and actor_id=$4 limit 2`,[scope.schoolId,id,item.http.receiptIdentity.revision,actor]);
  default:throw failure();
 }
}
