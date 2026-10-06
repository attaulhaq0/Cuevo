import { describe,expect,it } from 'vitest';
import { createHash,randomUUID } from 'node:crypto';
import { Pool,type PoolClient } from 'pg';
import { decodeJwt } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { parseServerConfig } from '@cuevo/config';
import { Database } from '../../src/platform/database/database';
import { createCustomerContext,customerActor,type CustomerContext } from './customer-test-context';
import { withFixtureCleanup } from './fixture-cleanup';

/** Real restricted API approval waits behind canonical School mutation serialization. */
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('observation approval permission recheck after a blocked School change',()=>{
 it('denies a formerly authorized administrator after the blocked current role changes, without approval effects',async()=>{
  let context:CustomerContext|undefined;let blockerPool:Pool|undefined;let blocker:PoolClient|undefined;let verifierDatabase:Database|undefined;let pending:Promise<Awaited<ReturnType<CustomerContext['request']>>>|undefined;let blockerOpen=false;
  await withFixtureCleanup(async()=>{
   context=await createCustomerContext({committed:true,observationPolicy:false});const fixture=context;const target=customerActor(1);const secondAdmin=customerActor(2);
   // Verified existing synthetic coordinator is promoted only in this exact fresh fixture tenant.
   await fixture.client.query("update app.memberships set role='admin'where school_id=$1 and actor_id=$2",[fixture.school,secondAdmin]);
   const verifiedSecondAdmin=await fixture.request('coordinator','/v1/learner-observation-policy');expect(verifiedSecondAdmin.statusCode).toBe(200);expect(verifiedSecondAdmin.json()).toMatchObject({schoolId:fixture.school,status:'UNCONFIGURED'});const bearer=verifiedSecondAdmin.raw.req.headers.authorization;if(typeof bearer!=='string'||!/^Bearer [^\s]+$/.test(bearer))throw Error('Exact verified second administrator session required.');
   const local=parseServerConfig(process.env,'api');if(!local.databaseUrl||!local.supabaseUrl||!local.supabasePublishableKey)throw Error('Configured restricted local identity verification required.');const authOrigin=new URL(local.supabaseUrl);if(authOrigin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(authOrigin.hostname)||authOrigin.port!=='56321')throw Error('Exact local Cuevo Auth verification required.');const auth=createClient(local.supabaseUrl,local.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const verified=await auth.auth.getUser(bearer.slice(7));if(verified.error||verified.data.user?.id!==secondAdmin||!verified.data.user.email_confirmed_at||verified.data.user.is_anonymous!==false)throw Error('Current confirmed second administrator Auth required.');
   const sessionId=decodeJwt(bearer.slice(7)).session_id;if(typeof sessionId!=='string')throw Error('Verified administrator session identity required.');verifierDatabase=new Database(local.databaseUrl);expect((await verifierDatabase.pool!.query('select session_user')).rows[0].session_user).toBe('cuevo_api');await verifierDatabase.actorTransaction(secondAdmin,undefined,async client=>{const members=(await client.query('select *from "authorization".current_memberships()')).rows;expect(members.find(row=>row.school_id===fixture.school&&row.actor_id===secondAdmin)?.role).toBe('admin');expect((await client.query('select "authorization".is_current_session($1::uuid)active',[sessionId])).rows[0].active).toBe(true);});
   const member=(await fixture.client.query('select revision,effective_from::text as "effectiveFrom",effective_to::text as "effectiveTo"from app.memberships where school_id=$1 and actor_id=$2',[fixture.school,target])).rows[0];const person=(await fixture.client.query('select display_name from app.people where school_id=$1 and actor_id=$2',[fixture.school,target])).rows[0];
   const input={developmentWindowDays:21,expectedVersion:0,reason:'This original actor must remain currently authorized after waiting.',confirmApproval:true};const key=randomUUID();
   const ownerUrl=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(ownerUrl.hostname)||ownerUrl.port!=='56322'||ownerUrl.pathname!=='/postgres')throw Error('Exact local Cuevo concurrency fixture required.');ownerUrl.username='postgres';ownerUrl.password='postgres';blockerPool=new Pool({connectionString:ownerUrl.toString(),max:1,connectionTimeoutMillis:3000,statement_timeout:5000});blocker=await blockerPool.connect();
   await blocker.query('BEGIN');blockerOpen=true;const pid=(await blocker.query<{pid:number}>('select pg_backend_pid()pid')).rows[0].pid;
   await blocker.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[fixture.school+':school-access-mutations']);
   pending=fixture.request('admin','/v1/learner-observation-policy',input,key);let settled=false;void pending.then(()=>{settled=true;},()=>{settled=true;});
   // Observe the actual private approval statement waiting, rather than timing a presumed barrier.
   const until=Date.now()+3000;let waiting=false;
   while(Date.now()<until&&!waiting){waiting=(await fixture.client.query<{waiting:boolean}>("select exists(select 1 from pg_catalog.pg_stat_activity activity where activity.pid<>pg_backend_pid()and activity.state='active'and activity.wait_event_type='Lock'and activity.query like '%internal.approve_learner_observation_policy%'and $1=any(pg_catalog.pg_blocking_pids(activity.pid)))waiting",[pid])).rows[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,25));}
   expect(waiting,'The authorized API must reach the private function lock barrier').toBe(true);expect(settled).toBe(false);
   // A separate HTTP mutation would wait on this same lock. Execute the unchanged private
   // School command on its lock-owning fixture connection so the role change commits first.
   await blocker.query('set local role cuevo_api');await blocker.query("select set_config('app.school_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.session_id',$3,true)",[fixture.school,secondAdmin,sessionId]);expect((await blocker.query('select "authorization".is_current_session($1::uuid)active',[sessionId])).rows[0].active).toBe(true);
   const changed={displayName:person.display_name,role:'teacher',status:'active',effectiveFrom:new Date(member.effectiveFrom).toISOString(),effectiveTo:member.effectiveTo?new Date(member.effectiveTo).toISOString():null,expectedRevision:member.revision,confirmAccessChange:true};
   const changedReceipt=(await blocker.query('select internal.school_command($1,$2,$3::jsonb,$4,$5,$6)receipt',['person.configure',target,JSON.stringify(changed),randomUUID(),createHash('sha256').update(JSON.stringify({command:'person.configure',target,input:changed})).digest('hex'),'observation-permission-race'])).rows[0].receipt;expect(changedReceipt.revision).toBe(member.revision+1);await blocker.query('COMMIT');blockerOpen=false;
   const response=await pending;pending=undefined;expect(response.statusCode).toBe(403);expect(response.json().code).toBe('FORBIDDEN');
   expect((await fixture.client.query('select role from app.memberships where school_id=$1 and actor_id=$2',[fixture.school,target])).rows[0].role).toBe('teacher');
   const effects=(await fixture.client.query("select(select count(*)::integer from app.learner_state_policies where school_id=$1)policy,(select count(*)::integer from internal.learner_observation_policy_revisions where school_id=$1)history,(select count(*)::integer from internal.audit_events where school_id=$1 and action='learner.observation_policy.approved')audit,(select count(*)::integer from internal.outbox_events where school_id=$1 and type='learner.observation_policy.approved')events,(select count(*)::integer from internal.idempotency_keys where school_id=$1 and actor_id=$2 and key=$3 and command='learner.observation_policy.approve')commands",[fixture.school,target,key])).rows[0];expect(effects).toEqual({policy:0,history:0,audit:0,events:0,commands:0});
  },[
   async()=>{if(blocker&&blockerOpen){await blocker.query('ROLLBACK');blockerOpen=false;}},
   async()=>{if(pending){await pending;pending=undefined;}},
   ()=>blocker?.release(),()=>blockerPool?.end(),()=>verifierDatabase?.close(),()=>context?.close(),
  ]);
 },60000);
});
