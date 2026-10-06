import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const uuid=z.uuid(),time=z.iso.datetime({offset:true});
const inputSchema=z.object({schoolId:uuid,actorId:uuid,endpoint:z.string().url(),vaultSecretName:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,99}$/),jobId:z.number().int().positive(),originalKey:z.string().min(1).max(200),body:z.object({name:z.string().min(1),countryCode:z.string().regex(/^[A-Z]{2}$/),languages:z.array(z.enum(['en','ar'])).min(1).max(2)}).strict()}).strict();
export type ScheduledRecoveryInput=z.infer<typeof inputSchema>;
export type ScheduledRecoveryPorts={query(sql:string,args?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;begin():Promise<void>;commit():Promise<void>;rollback():Promise<void>;command(body:ScheduledRecoveryInput['body'],originalKey:string):Promise<unknown>;admit():Promise<void>;record(phase:string,detail:Record<string,unknown>):Promise<void>;now():number;pause():Promise<void>};
export type ScheduledRecoveryResult={status:'SCHEDULED_RECOVERY_VERIFIED'|'REQUIRES_REVIEW';basis:'ACTUAL_CRON_AFTER_MISSED_POST_COMMIT_HINT';originalKey:string;eventId:string|null;releasedAt:string|null;cronRunId:number|null;missedHintVerified:boolean;scheduledRecoveryVerified:boolean;eventRetryVerified:false;expiredLeaseRecoveryVerified:false;dispatchBackoffVerified:false;hostedAcceptance:false;elapsedMs:number|null};
const cronCommand='select internal.request_worker_wake();';
const controlSql='/* CUEVO_RECOVERY_CONTROL */ select enabled,endpoint,vault_secret_name,allow_local,state,wake_id,lease_expires_at::text,network_request_id,last_requested_at::text,last_started_at::text,last_finished_at::text,last_processed_count,failure_count,last_error_code from internal.worker_dispatch_control where singleton';
const queueSql=`select count(*)filter(where state='PENDING')::integer as pending,count(*)filter(where state='PROCESSING')::integer as processing from internal.outbox_events where internal.outbox_event_owner(type)='WORKER'`;
const eventSql=`/* CUEVO_RECOVERY_EVENT */ select e.id,e.school_id,e.actor_id,e.entity_id,e.entity_type,e.type,e.version,e.state,e.attempt_count,e.lease_token,e.lease_until::text,e.completed_at::text,e.occurred_at::text,exists(select 1 from internal.processed_events p where p.event_id=e.id)as processed,exists(select 1 from internal.audit_events a join internal.idempotency_keys k on k.school_id=a.school_id and k.actor_id=a.actor_id and k.key=$3 and k.command='school.details.update'and k.state='COMPLETED' where a.school_id=e.school_id and a.actor_id=e.actor_id and a.entity_id=e.entity_id and a.action='school.details.update'and a.outcome='succeeded'and a.entity_type='school_operation'and a.metadata=jsonb_build_object('command','details.update')and a.occurred_at>=k.created_at and a.occurred_at<=k.completed_at and a.occurred_at<=e.occurred_at)as audit,(select count(*)::integer from internal.idempotency_keys k where k.school_id=e.school_id and k.actor_id=e.actor_id and k.key=$3 and k.command='school.details.update'and k.state='COMPLETED'and k.response->>'id'=e.entity_id::text)as command_count from internal.outbox_events e where e.school_id=$1 and e.entity_id=$2 and e.actor_id=$4 and e.type='school.updated'and e.entity_type='school_operation'and e.metadata=jsonb_build_object('command','details.update')and e.deduplication_key='school:'||md5(e.actor_id::text||':details.update:'||$3)`;
const fail=()=>Error('Hosted scheduled recovery requires review; private contents withheld.');
const stamp=(v:unknown)=>typeof v==='string'?Date.parse(v):v instanceof Date?v.getTime():NaN;

/** This protocol deliberately misses a delivery hint via the existing NOWAIT
 * lock path. It never requests a wake or changes source/lease/attempt history;
 * only the actual owned Cron and the existing worker can complete this source. */
export async function verifyScheduledWorkerRecovery(value:unknown,ports:ScheduledRecoveryPorts):Promise<ScheduledRecoveryResult>{
 const result:ScheduledRecoveryResult={status:'REQUIRES_REVIEW',basis:'ACTUAL_CRON_AFTER_MISSED_POST_COMMIT_HINT',originalKey:'',eventId:null,releasedAt:null,cronRunId:null,missedHintVerified:false,scheduledRecoveryVerified:false,eventRetryVerified:false,expiredLeaseRecoveryVerified:false,dispatchBackoffVerified:false,hostedAcceptance:false,elapsedMs:null};let transaction=false;
 try{
  const input=inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));result.originalKey=input.originalKey;
  const one=async(sql:string,args:unknown[]=[])=>{const rows=(await ports.query(sql,args)).rows;if(rows.length!==1)throw fail();return rows[0];};
  const owned=(row:Record<string,unknown>)=>row.enabled===true&&row.endpoint===input.endpoint&&row.vault_secret_name===input.vaultSecretName&&row.allow_local===false;
  const idle=(row:Record<string,unknown>)=>owned(row)&&row.state==='IDLE'&&row.wake_id===null&&row.lease_expires_at===null&&row.network_request_id===null&&row.failure_count===0&&row.last_error_code===null;
  await ports.admit();
  const baseline=await one(controlSql);if(!idle(baseline))throw fail();
  const counts=await one('/* CUEVO_RECOVERY_BASELINE */ select q.*,internal.worker_transport_private()as "transportPrivate",not exists(select 1 from internal.posthog_school_activation where enabled)as "analyticsDisabled" from('+queueSql+')q');if(counts.pending!==0||counts.processing!==0||counts.transportPrivate!==true||counts.analyticsDisabled!==true)throw fail();
  const job=await one('/* CUEVO_RECOVERY_CRON_JOB */ select jobid,jobname,schedule,command,database,username,active from cron.job where jobid=$1',[input.jobId]);z.object({jobid:z.coerce.number().refine(n=>n===input.jobId),jobname:z.literal('cuevo-worker-recovery'),schedule:z.literal('* * * * *'),command:z.literal(cronCommand),database:z.literal('postgres'),username:z.literal('postgres'),active:z.literal(true)}).parse(job);
  const started=ports.now();await ports.record('RECOVERY_SOURCE_INTENT',{originalKey:input.originalKey,jobId:input.jobId});
  await ports.begin();transaction=true;
  const held=await one(controlSql+' for update');if(!idle(held)||canonicalReleaseExecutionJson(held)!==canonicalReleaseExecutionJson(baseline))throw fail();
  const created=await ports.command(input.body,input.originalKey),receipt=z.object({id:z.literal(input.schoolId),schoolId:z.literal(input.schoolId),command:z.literal('details.update')}).parse(created);
  const replay=await ports.command(input.body,input.originalKey);if(canonicalReleaseExecutionJson(replay)!==canonicalReleaseExecutionJson(created))throw fail();
  const args=[input.schoolId,receipt.id,input.originalKey,input.actorId],pending=await one(eventSql,args);result.eventId=uuid.parse(pending.id);
  if(pending.school_id!==input.schoolId||pending.actor_id!==input.actorId||pending.entity_id!==input.schoolId||pending.entity_type!=='school_operation'||pending.type!=='school.updated'||pending.version!==1||pending.state!=='PENDING'||pending.attempt_count!==0||pending.lease_token!==null||pending.lease_until!==null||pending.completed_at!==null||pending.processed!==false||pending.audit!==true||pending.command_count!==1)throw fail();
  const unchanged=await one(controlSql);if(canonicalReleaseExecutionJson(unchanged)!==canonicalReleaseExecutionJson(held))throw fail();result.missedHintVerified=true;
  await ports.record('RECOVERY_PENDING_RELEASE',{eventId:result.eventId});
  await ports.commit();transaction=false;
  // Observe time only after COMMIT is acknowledged. A Cron run starting while
  // the lock was held can legitimately succeed with request_worker_wake=false.
  const release=await one(`/* CUEVO_RECOVERY_RELEASE_TIME */ select to_char(clock_timestamp()at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')as "releasedAt"`);result.releasedAt=time.parse(release.releasedAt);
  await ports.record('RECOVERY_RELEASE_CONFIRMED',{eventId:result.eventId,releasedAt:result.releasedAt});
  const deadline=ports.now()+120000;
  for(let attempts=0;attempts<120&&ports.now()<deadline;attempts++){
   const event=await one(eventSql,args),current=await one(controlSql),runs=(await ports.query('/* CUEVO_RECOVERY_CRON_RUN */ select runid,jobid,status,start_time::text,end_time::text from cron.job_run_details where jobid=$1 and start_time>=$2::timestamptz order by start_time desc,runid desc limit 5',[input.jobId,result.releasedAt])).rows;
   const cron=runs.find(row=>Number(row.jobid)===input.jobId&&row.status==='succeeded'&&stamp(row.start_time)>=stamp(result.releasedAt)&&stamp(row.end_time)>=stamp(row.start_time));
   if(!owned(current))throw fail();
   if(event.id!==result.eventId||event.audit!==true||event.command_count!==1)throw fail();
   if(event.state==='FAILED')throw fail();
   if(event.state==='COMPLETED'&&event.processed===true&&cron&&idle(current)&&Number(current.last_processed_count)>0&&stamp(current.last_requested_at)>=stamp(result.releasedAt)&&stamp(current.last_started_at)>=stamp(current.last_requested_at)&&stamp(current.last_finished_at)>=stamp(current.last_started_at)){
    const currentJob=await one('/* CUEVO_RECOVERY_CRON_JOB */ select jobid,jobname,schedule,command,database,username,active from cron.job where jobid=$1',[input.jobId]);if(canonicalReleaseExecutionJson(currentJob)!==canonicalReleaseExecutionJson(job))throw fail();
    const final=await one('/* CUEVO_RECOVERY_FINAL */ select q.*,internal.worker_transport_private()as "transportPrivate",not exists(select 1 from internal.posthog_school_activation where enabled)as "analyticsDisabled" from('+queueSql+')q');if(final.pending!==0||final.processing!==0||final.transportPrivate!==true||final.analyticsDisabled!==true)throw fail();await ports.admit();result.cronRunId=z.coerce.number().int().positive().parse(cron.runid);result.elapsedMs=Math.max(0,ports.now()-started);result.scheduledRecoveryVerified=true;result.status='SCHEDULED_RECOVERY_VERIFIED';await ports.record('SCHEDULED_RECOVERY_VERIFIED',{eventId:result.eventId,cronRunId:result.cronRunId,releasedAt:result.releasedAt,elapsedMs:result.elapsedMs});break;
   }
   await ports.pause();
  }
 }catch{result.status='REQUIRES_REVIEW';result.scheduledRecoveryVerified=false;}
 finally{if(transaction)try{await ports.rollback();}catch{result.status='REQUIRES_REVIEW';result.scheduledRecoveryVerified=false;}}
 return result;
}
