import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from '../verification/release-review';

const implementation = await import('./hosted-community-native-read').catch(error => {
 if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
 return undefined;
});
const reader = () => {
 assert.equal(typeof implementation?.readHostedCommunityNativeRows, 'function', 'finite community native query owner is missing');
 return implementation!.readHostedCommunityNativeRows;
};
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const schoolId='10000000-0000-4000-8000-000000000001',classId='30000000-0000-4000-8000-000000000001';
const teacherActorId='20000000-0000-4000-8000-000000000004',studentActorId='20000000-0000-4000-8000-000000000012';
const peerActorId='20000000-0000-4000-8000-000000000018',parentActorId='20000000-0000-4000-8000-000000000072';
const roomId='91000000-0000-4000-8000-000000000001',at='2026-10-12T08:00:00Z';
function selection(){
 const identity={projectRef:'mqxdjvsyckzocokuikmx',schoolId,sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'123',runId:'456',runAttempt:1,backendTransferSha256:'c'.repeat(64),webDeploymentId:'dpl_exact'};
 const input={classId,name:'Checking our learning together',type:'GROUP',memberIds:[studentActorId]};
 const fingerprint=createHash('sha256').update(JSON.stringify({command:'room.create',target:null,input})).digest('hex');
 const rawBodySha256=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const response={id:roomId,command:'room.create',roomId};
 return {identity:{...identity,uiArtifactSha256:'d'.repeat(64),journalSha256:'e'.repeat(64),companionManifestSha256:'f'.repeat(64)},scope:{synthetic:true,schoolId,classId,teacherActorId,studentActorId,peerActorId,parentActorId,group:{id:roomId,revision:1},postIds:[],announcement:null},mode:'ORIGINAL_RECONCILIATION',originals:[{original:{identity,command:{step:'room.create',actorId:teacherActorId,role:'teacher',schoolId,path:'/v1/community/rooms',operation:'room.create',sourceIds:[classId,studentActorId],sourceRevision:null,key:'native-community-original-1',requestBodySha256:rawBodySha256},intentSequence:1,intentRecordSha256:'1'.repeat(64)},targetId:null,nativeFingerprint:fingerprint,requestBodySha256:rawBodySha256,input,http:{status:200,requestId:'req-native-community-1',receiptSha256:hash(response),receiptIdentity:{operation:'room.create',owner:'normal',ledgerCommand:'community.room.create',receiptId:roomId,sourceId:roomId,changeId:null,revision:null,status:null}}}]};
}

test('fixed current native class-room and auxiliary scope query reject before-after replacement or entitlement expiry',async()=>{
 const read=reader(),selected=selection(),classRoom='91000000-0000-4000-8000-000000000800';
 for(const changed of[false,'class-room','foreign-expiry']as const){
  let observations=0;
  const query=async(sql:string)=>{
   if(sql.includes('CURRENT_SCOPE')){
    assert(sql.includes('from app.community_rooms'));assert(sql.includes("type='CLASS'"));assert(sql.includes("status='ACTIVE'"));
    assert(sql.includes('20000000-0000-4000-8000-000000000013'));assert(sql.includes('20000000-0000-4000-8000-000000000133'));assert(sql.includes('10000000-0000-4000-8000-000000000002'));assert(sql.includes('p.synthetic is true'));
    observations++;
    return[{synthetic:true,school_id:schoolId,class_id:classId,class_room_id:changed==='class-room'&&observations===2?roomId:classRoom,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:true,outside_role:'student',outside_enrolled:false,foreign_school_active:true,foreign_role:changed==='foreign-expiry'&&observations===2?null:'student',foreign_current_main_membership:false,foreign_community_enabled:true}];
   }
   if(sql.includes('ORIGINAL'))return[{school_id:schoolId,actor_id:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:selected.originals[0].nativeFingerprint,state:'COMPLETED',response:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];
   if(sql.includes('CLEANUP'))return[{room_id:roomId,base_status:'ACTIVE',group_state:'ACTIVE',group_revision:1,announcement_id:null,announcement_state:null,announcement_revision:null,student_member_status:'active',peer_member_status:null,student_configured_by:teacherActorId,peer_configured_by:null,student_member_change_id:null,peer_member_change_id:null,reaction_active:null,student_restriction_id:null,post_moderation_id:null,student_restriction:'NONE',post_hidden:false}];
   return[];
  };
  if(changed)await assert.rejects(read(selected,{check(){},rows:query}));
  else{const evidence=await read(selected,{check(){},rows:query});assert.equal(evidence.current.class_room_id,classRoom);}
  assert.equal(observations,2);
 }
});

test('query owner rejects arbitrary SQL resources actor and unsafe selector fields before invoking private session',async()=>{
 const read=reader();let calls=0;const session={check(){},async rows(){calls++;return[];}};
 const accessor=Object.defineProperty({},'identity',{get(){calls++;return{};},enumerable:true});
 for(const value of [{sql:'select 1'}, {table:'app.community_posts'}, accessor, new Proxy({},{}), {...selection(),resource:'posts'}, {...selection(),scope:{...selection().scope,schoolId:'10000000-0000-4000-8000-000000000002'}}])await assert.rejects(read(value,session));
 assert.equal(calls,0);
});

test('LIVE_PREFIX read union refuses mixed archive identity incomplete recipe and false source before private queries',async()=>{
 const read=reader(),artifact=selection(),{uiArtifactSha256:_archive,journalSha256:_head,companionManifestSha256:_manifest,...identity}=artifact.identity;void _archive;void _head;void _manifest;
 const live={...artifact,identity:{...identity,evidenceSource:'LIVE_PREFIX',prefixSnapshotSha256:'1'.repeat(64),journalHeadSha256:'2'.repeat(64),companionInventorySha256:'3'.repeat(64)},mode:'LIVE_PREFIX'};
 let calls=0;const session={check(){calls++;},async rows(){calls++;return[];}};
 for(const value of[live,{...live,identity:artifact.identity},{...artifact,identity:live.identity},{...live,identity:{...live.identity,uiArtifactSha256:'4'.repeat(64)}},{...live,identity:{...live.identity,prefixSnapshotSha256:null}},{...live,originals:Array(15).fill(live.originals[0])}])await assert.rejects(read(value,session));
 assert.equal(calls,0);
});

test('native reads use exact key tuple parameterized finite selectors and reject unexpected rows',async()=>{
 const read=reader(),selected=selection(),queries:{sql:string;args:unknown[];max:number}[]=[];
 const session={check(){},async rows(sql:string,args:unknown[],max:number){queries.push({sql,args,max});if(sql.includes('CURRENT_SCOPE'))return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:true}];if(sql.includes('ORIGINAL'))return[{school_id:schoolId,actor_id:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:selected.originals[0].nativeFingerprint,state:'COMPLETED',response:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];if(sql.includes('CLEANUP'))return[{room_id:roomId,base_status:'ACTIVE',group_state:'ACTIVE',group_revision:1,announcement_id:null,announcement_state:null,announcement_revision:null,student_member_status:'active',peer_member_status:null,student_configured_by:teacherActorId,peer_configured_by:null,student_member_change_id:null,peer_member_change_id:null,reaction_active:null,student_restriction_id:null,post_moderation_id:null,student_restriction:'NONE',post_hidden:false}];return[];}};
 await read(selected,session);
 const ledger=queries.find(query=>query.sql.includes('ORIGINAL'))!;
 assert(ledger);assert.deepEqual(ledger.args,[schoolId,teacherActorId,'native-community-original-1','community.room.create']);assert.equal(ledger.max,1);assert(ledger.sql.includes('limit 2'));assert(!ledger.sql.includes(roomId));
 assert(queries.every(query=>!/(?:^|\s)(?:insert|update|delete|create|alter|drop|process_community_event|claim_outbox)\b/i.test(query.sql)));
 await assert.rejects(read(selected,{check(){},async rows(sql:string){return sql.includes('CURRENT_SCOPE')?await session.rows(sql,[],1):[{},{}];}}));
});

test('source lookup cannot follow a transplanted ledger row fingerprint response or unknown native object',async()=>{
 const read=reader(),selected=selection();for(const field of['school_id','actor_id','fingerprint','response']as const){let sourceReads=0;await assert.rejects(read(selected,{check(){},async rows(sql:string){if(sql.includes('CURRENT_SCOPE'))return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:true}];if(sql.includes('SOURCE_'))sourceReads++;if(sql.includes('ORIGINAL'))return[{school_id:field==='school_id'?'10000000-0000-4000-8000-000000000002':schoolId,actor_id:field==='actor_id'?studentActorId:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:field==='fingerprint'?'0'.repeat(64):selected.originals[0].nativeFingerprint,state:'COMPLETED',response:field==='response'?{id:'91000000-0000-4000-8000-000000000099',command:'room.create',roomId:'91000000-0000-4000-8000-000000000099'}:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];return[];}}));assert.equal(sourceReads,0,field);}
});

test('the finite owner refuses absent native group ledger without querying cleanup by caller identity',async()=>{
 const read=reader();let cleanupReads=0;await assert.rejects(read(selection(),{check(){},async rows(sql:string){if(sql.includes('CURRENT_SCOPE'))return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:true}];if(sql.includes('CLEANUP'))cleanupReads++;return[];}}));assert.equal(cleanupReads,0);
});

test('current relationship revocation during a native read refuses the earlier permitted snapshot',async()=>{
 const read=reader(),selected=selection();let scopeReads=0;
 await assert.rejects(read(selected,{check(){},async rows(sql:string){if(sql.includes('CURRENT_SCOPE'))return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:++scopeReads===1}];if(sql.includes('ORIGINAL'))return[{school_id:schoolId,actor_id:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:selected.originals[0].nativeFingerprint,state:'COMPLETED',response:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];if(sql.includes('CLEANUP'))return[{room_id:roomId,base_status:'ACTIVE',group_state:'ACTIVE',group_revision:1,announcement_id:null,announcement_state:null,announcement_revision:null,student_member_status:'active',peer_member_status:null,student_configured_by:teacherActorId,peer_configured_by:null,student_member_change_id:null,peer_member_change_id:null,reaction_active:null,student_restriction_id:null,post_moderation_id:null,student_restriction:'NONE',post_hidden:false}];return[];}}));
 assert.equal(scopeReads,2);
});

test('an effective window that expires after the first native read cannot keep transaction-start permission',async()=>{
 const read=reader(),selected=selection();let scopeReads=0;
 const transactionTime=1000,effectiveTo=1500;
 await assert.rejects(read(selected,{check(){},async rows(sql:string){
  if(sql.includes('CURRENT_SCOPE')){
   const statementTime=transactionTime+1000*scopeReads++;
   // Model PostgreSQL's transaction-stable now() versus the explicitly
   // captured wall clock in this statement. No stored row changes here.
   const currentTime=sql.includes('clock_timestamp()')&&!/\bnow\(\)|"authorization"\.community_member/.test(sql)?statementTime:transactionTime;
   return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:currentTime<effectiveTo,teacher_role:currentTime<effectiveTo?'teacher':null,student_role:currentTime<effectiveTo?'student':null,peer_role:currentTime<effectiveTo?'student':null,parent_role:currentTime<effectiveTo?'parent':null,teacher_assigned:currentTime<effectiveTo,student_enrolled:currentTime<effectiveTo,peer_enrolled:currentTime<effectiveTo,parent_linked:currentTime<effectiveTo}];
  }
  if(sql.includes('ORIGINAL'))return[{school_id:schoolId,actor_id:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:selected.originals[0].nativeFingerprint,state:'COMPLETED',response:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];
  if(sql.includes('CLEANUP'))return[{room_id:roomId,base_status:'ACTIVE',group_state:'ACTIVE',group_revision:1,announcement_id:null,announcement_state:null,announcement_revision:null,student_member_status:'active',peer_member_status:null,student_configured_by:teacherActorId,peer_configured_by:null,student_member_change_id:null,peer_member_change_id:null,reaction_active:null,student_restriction_id:null,post_moderation_id:null,student_restriction:'NONE',post_hidden:false}];
  return[];
 }}));assert.equal(scopeReads,2);
});

test('later same-actor membership state cannot stand in for the original immutable member change',async()=>{
 const read=reader(),selected=selection();let cleanupQueries=0;
 await assert.rejects(read(selected,{check(){},async rows(sql:string){
  if(sql.includes('CURRENT_SCOPE'))return[{synthetic:true,school_id:schoolId,class_id:classId,school_active:true,class_active:true,community_enabled:true,teacher_role:'teacher',student_role:'student',peer_role:'student',parent_role:'parent',teacher_assigned:true,student_enrolled:true,peer_enrolled:true,parent_linked:true}];
  if(sql.includes('ORIGINAL'))return[{school_id:schoolId,actor_id:teacherActorId,key:selected.originals[0].original.command.key,command:'community.room.create',fingerprint:selected.originals[0].nativeFingerprint,state:'COMPLETED',response:{id:roomId,command:'room.create',roomId},created_at:at,completed_at:at}];
  if(sql.includes('CLEANUP')){
   cleanupQueries++;
   const row={room_id:roomId,base_status:'ACTIVE',group_state:'ACTIVE',group_revision:1,announcement_id:null,announcement_state:null,announcement_revision:null,student_member_status:'active',peer_member_status:null,student_configured_by:teacherActorId,peer_configured_by:null,student_member_change_id:null,peer_member_change_id:null,reaction_active:null,student_restriction_id:null,post_moderation_id:null,student_restriction:'NONE',post_hidden:false};
   // Model the fixed query selecting a later immutable member change from
   // the same staff actor after an active→revoked→active sequence.
   return[sql.includes('student_member_change_id')?{...row,student_member_change_id:'91000000-0000-4000-8000-000000000099',peer_member_change_id:null}:row];
  }
  return[];
 }}));assert.equal(cleanupQueries,1);
});
