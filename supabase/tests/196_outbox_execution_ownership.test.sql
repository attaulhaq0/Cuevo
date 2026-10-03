-- Execution ownership is transport selection, never provider or school authority.
-- Rollback-only fixtures; the wake transport is replaced locally and sends no HTTP.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();

-- Keep the pre-migration RED run readable rather than aborting at the missing classifier.
create function pg_temp.event_owner(event_type text)returns text language plpgsql set search_path=''as $$
declare owner text;begin
 if to_regprocedure('internal.outbox_event_owner(text)')is null then return null;end if;
 execute 'select internal.outbox_event_owner($1)'into owner using event_type;return owner;
end$$;
select ok(to_regprocedure('internal.outbox_event_owner(text)')is not null,'one private execution-owner classifier exists');
select is(pg_temp.event_owner('school.account.provisioning_requested'),'SCHOOL_ACCOUNT_AUTH','provisioning is owned by the API Auth executor');
select is(pg_temp.event_owner('school.account.recovery_requested'),'SCHOOL_ACCOUNT_AUTH','recovery is owned by the API Auth executor');
select is(pg_temp.event_owner('school.updated'),'WORKER','existing deterministic school events retain worker ownership');
select is(pg_temp.event_owner('school.account.provisioning_requested.extra'),'WORKER','a similar unknown event cannot reserve Auth ownership by prefix');
select is(pg_temp.event_owner('legacy.unknown'),'WORKER','unknown legacy events retain deterministic review behavior');
select is(pg_temp.event_owner(null),null::text,'missing event type remains unknown');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace cross join pg_roles role
 where namespace.nspname='internal'and routine.proname='outbox_event_owner'and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,routine.oid,'EXECUTE')),'runtime and Data API roles cannot invoke the classifier directly');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
 cross join lateral aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))permission
 where namespace.nspname='internal'and routine.proname='outbox_event_owner'and permission.grantee=0 and permission.privilege_type='EXECUTE'),'PUBLIC has no classifier execute privilege');
select ok(to_regprocedure('internal.process_before_account_execution_ownership(uuid,uuid)')is not null,'the existing composed processor is retained behind the ownership guard');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace cross join pg_roles role
 where namespace.nspname='internal'and routine.proname='process_before_account_execution_ownership'and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,routine.oid,'EXECUTE')),'no runtime or Data API role bypasses ownership through the renamed processor');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
 cross join lateral aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))permission
 where namespace.nspname='internal'and routine.proname='process_before_account_execution_ownership'and permission.grantee=0 and permission.privilege_type='EXECUTE'),'PUBLIC cannot execute the renamed processor');
select ok(not has_table_privilege('cuevo_worker','internal.outbox_events','SELECT,INSERT,UPDATE,DELETE'),'execution selection adds no raw worker outbox grants');
select ok(not has_table_privilege('cuevo_api','internal.outbox_events','SELECT,INSERT,UPDATE,DELETE'),'execution selection adds no raw API outbox grants');

select internal.configure_worker_dispatch(false,null,null,false);
-- Clear only within this rollback fixture so no other domain work defines the count or wake oracle.
update internal.outbox_events set state='COMPLETED',completed_at=clock_timestamp(),lease_token=null,lease_until=null where state<>'COMPLETED';
create or replace function internal.posthog_delivery_due()returns boolean language sql volatile security definer set search_path=''as $$select false$$;

insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until,attempt_count,max_attempts)
values
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','school.account.provisioning_requested','school_account','19610000-0000-4000-8000-000000000001',1,'{"executionOwner":"WORKER"}','ownership-auth-pending','PENDING',null,null,0,5),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','school.account.recovery_requested','school_account','19610000-0000-4000-8000-000000000002',1,'{}','ownership-auth-active','PROCESSING','19620000-0000-4000-8000-000000000002',clock_timestamp()+interval'5 minutes',1,5),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','school.account.provisioning_requested','school_account','19610000-0000-4000-8000-000000000003',1,'{}','ownership-auth-expired','PROCESSING','19620000-0000-4000-8000-000000000003',clock_timestamp()-interval'1 minute',1,5),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','school.account.recovery_requested','school_account','19610000-0000-4000-8000-000000000004',1,'{}','ownership-auth-exhausted','PROCESSING','19620000-0000-4000-8000-000000000004',clock_timestamp()-interval'1 minute',5,5),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000004','school.account.provisioning_requested','school_account','19610000-0000-4000-8000-000000000006',1,'{}','ownership-auth-active-fail','PROCESSING','19620000-0000-4000-8000-000000000006',clock_timestamp()+interval'5 minutes',1,5),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000004','school.account.recovery_requested','school_account','19610000-0000-4000-8000-000000000007',1,'{}','ownership-auth-active-process','PROCESSING','19620000-0000-4000-8000-000000000007',clock_timestamp()+interval'5 minutes',1,5);
create temporary table original_auth_events as select id,to_jsonb(event)as record from internal.outbox_events event where event.deduplication_key like'ownership-auth-%';
select is((select count(*)from original_auth_events),6::bigint,'pending, expired, exhausted and three independent active Auth source fixtures exist');
select is(internal.worker_dispatch_due(),false,'an Auth-only pending/expired queue is not general-worker due work');
select is(internal.worker_health()->>'scope','WORKER','queue-health counts explicitly state their execution scope');
select is((internal.worker_health()->>'pendingCount')::integer,0,'Auth-pending records are not counted as general-worker backlog');
select is((internal.worker_health()->>'failedCount')::integer,0,'Auth source records do not manufacture general-worker failures');
select is(internal.worker_health()->'oldestPendingAt','null'::jsonb,'Auth-only pending work does not manufacture general-worker lag');
create temporary table claimed_worker_events(id uuid,lease_token uuid);
grant select,insert,delete on claimed_worker_events to cuevo_worker;
set local role cuevo_worker;
insert into claimed_worker_events select id,lease_token from internal.claim_outbox(100,30);
select is((select count(*)from claimed_worker_events),0::bigint,'general worker claims no pending or expired Auth events');
select is(internal.complete_outbox('19600000-0000-4000-8000-000000000002','19620000-0000-4000-8000-000000000002'),false,'a correct active Auth lease cannot be completed through the general worker helper');
select is(internal.fail_outbox('19600000-0000-4000-8000-000000000006','19620000-0000-4000-8000-000000000006','PROCESSING_REQUIRES_REVIEW',30),false,'a separate correct active Auth lease cannot be retried through the general worker helper');
select throws_ok($$select internal.process_learner_event('19600000-0000-4000-8000-000000000007','19620000-0000-4000-8000-000000000007')$$,'42501',null,'direct domain processing refuses a separate active API-owned Auth event');
reset role;
select ok(not exists(select 1 from original_auth_events original join internal.outbox_events current on current.id=original.id where to_jsonb(current)is distinct from original.record),'claim, expiry exhaustion, completion, failure and processing leave every Auth event byte unchanged');
select is((select count(*)from internal.processed_events where event_id in(select id from original_auth_events)),0::bigint,'no deterministic processed receipt masquerades as provisioning or recovery');

-- Forged metadata never changes execution ownership; unknown types still enter review.
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{"executionOwner":"SCHOOL_ACCOUNT_AUTH"}','ownership-worker-normal'),
 ('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000004','legacy.unknown','school','10000000-0000-4000-8000-000000000001',1,'{"executionOwner":"SCHOOL_ACCOUNT_AUTH"}','ownership-worker-unknown');
select is(internal.worker_dispatch_due(),true,'normal worker work remains due beside pending Auth work');
select is((internal.worker_health()->>'pendingCount')::integer,2,'health counts both actual worker-owned fixtures');
set local role cuevo_worker;
insert into claimed_worker_events select id,lease_token from internal.claim_outbox(100,30);
select is((select count(*)from claimed_worker_events),2::bigint,'metadata cannot divert normal or unknown events from worker execution');
select ok(exists(select 1 from claimed_worker_events where id='19600000-0000-4000-8000-000000000011')and exists(select 1 from claimed_worker_events where id='19600000-0000-4000-8000-000000000012'),'claims are the exact normal and unknown source identities');
select lives_ok($$select internal.process_learner_event('19600000-0000-4000-8000-000000000011',(select lease_token from pg_temp.claimed_worker_events where id='19600000-0000-4000-8000-000000000011'))$$,'existing school source keeps deterministic acknowledgment');
select throws_ok($$select internal.process_learner_event('19600000-0000-4000-8000-000000000012',(select lease_token from pg_temp.claimed_worker_events where id='19600000-0000-4000-8000-000000000012'))$$,'22023',null,'unknown legacy event still requires source review');
select is(internal.fail_outbox('19600000-0000-4000-8000-000000000012',(select lease_token from claimed_worker_events where id='19600000-0000-4000-8000-000000000012'),'PROCESSING_REQUIRES_REVIEW',30),true,'worker-owned unknown event keeps its bounded failure receipt');
reset role;
select is((select state from internal.outbox_events where id='19600000-0000-4000-8000-000000000011'),'COMPLETED','normal source completed under its own authority');
select is((select state from internal.outbox_events where id='19600000-0000-4000-8000-000000000012'),'PENDING','unknown source remains retry/review rather than being hidden as Auth-owned');
select is((select count(*)from internal.processed_events where event_id='19600000-0000-4000-8000-000000000012'),0::bigint,'unknown source gets no successful processed marker');
select ok(not exists(select 1 from original_auth_events original join internal.outbox_events current on current.id=original.id where to_jsonb(current)is distinct from original.record),'mixed claims still preserve every Auth-owned source and lease');

-- Controlled wake capture proves no Auth-only insert/recovery invocation without provider I/O.
update internal.outbox_events set state='COMPLETED',completed_at=clock_timestamp(),lease_token=null,lease_until=null where id in('19600000-0000-4000-8000-000000000011','19600000-0000-4000-8000-000000000012');
create temporary table ownership_wake_capture(wake_id uuid not null);
create or replace function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint language plpgsql security definer set search_path=''as $$begin
 insert into pg_temp.ownership_wake_capture values(target_wake);return 196;
end$$;
select is(internal.worker_transport_private(),true,'private transport prerequisite is established before local capture activation');
select internal.configure_worker_dispatch(true,'https://worker.example.test/functions/v1/cuevo-worker','ownership-test-no-secret',false);
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values('10000000-0000-4000-8000-000000000001','19600000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000004','school.account.provisioning_requested','school_account','19610000-0000-4000-8000-000000000005',1,'{}','ownership-auth-insert-wake');
select is((select count(*)from ownership_wake_capture),0::bigint,'Auth-only insertion does not invoke the general worker');
select is(internal.request_worker_wake(),false,'scheduled recovery ignores Auth-only pending and expired leases');
select is((select count(*)from ownership_wake_capture),0::bigint,'repeated Auth-only recovery produces no network wake');
select is((select state from internal.worker_dispatch_control where singleton),'IDLE','Auth-only backlog does not force the general wake into requested or backoff state');

create or replace function internal.posthog_delivery_due()returns boolean language sql volatile security definer set search_path=''as $$select true$$;
select is(internal.worker_dispatch_due(),true,'independent PostHog destination delivery still makes worker execution due');
select is(internal.request_worker_wake(),true,'analytics-only recovery remains eligible beside Auth backlog');
select is((select count(*)from ownership_wake_capture),1::bigint,'analytics due work requests one bounded captured wake');
select internal.configure_worker_dispatch(false,null,null,false);
select *from finish();
rollback;
