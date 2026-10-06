begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();

select ok(to_regprocedure('internal.request_worker_wake()')is not null,'private committed wake request boundary exists');
select ok(to_regprocedure('internal.begin_worker_wake(uuid)')is not null,'restricted worker invocation admission exists');
select ok(to_regprocedure('internal.finish_worker_wake(uuid,text,integer)')is not null,'restricted worker finish boundary exists');
select ok(to_regprocedure('internal.worker_dispatch_health()')is not null,'sanitized operational worker health exists');
select ok(to_regprocedure('internal.configure_worker_dispatch(boolean,text,text,boolean)')is not null,'operator-only dispatch configuration exists');
select is((select enabled from internal.worker_dispatch_control where singleton),false,'migration never enables remote worker delivery');
select is(internal.request_worker_wake(),false,'disabled delivery never creates a network request');
select ok(to_regprocedure('internal.worker_transport_private()')is not null,'transport permissions have a fail-closed activation guard');
select ok(not has_function_privilege('authenticated','internal.worker_transport_private()','EXECUTE'),'browser cannot inspect private transport configuration');
select ok(not has_function_privilege('cuevo_worker','internal.worker_transport_private()','EXECUTE'),'worker has no raw transport permission probe');
select ok(not has_function_privilege('authenticated','internal.request_worker_wake()','EXECUTE'),'browser cannot schedule worker delivery');
select ok(not has_function_privilege('service_role','internal.request_worker_wake()','EXECUTE'),'service role cannot schedule private worker delivery');
select ok(not has_function_privilege('cuevo_api','internal.configure_worker_dispatch(boolean,text,text,boolean)','EXECUTE'),'application API cannot configure endpoint or credentials');
select ok(not has_function_privilege('cuevo_worker','internal.request_worker_wake()','EXECUTE'),'worker cannot select arbitrary wake requests');
select ok(has_function_privilege('cuevo_worker','internal.begin_worker_wake(uuid)','EXECUTE'),'restricted worker has exact invocation admission permission');
select ok(has_function_privilege('cuevo_worker','internal.finish_worker_wake(uuid,text,integer)','EXECUTE'),'restricted worker has bounded finish permission');
select ok(has_function_privilege('cuevo_worker','internal.worker_dispatch_health()','EXECUTE'),'restricted worker has sanitized health permission');
select ok(not has_table_privilege('cuevo_worker','internal.worker_dispatch_control','SELECT'),'worker has no raw operational control read');
select ok(not has_table_privilege('cuevo_api','internal.worker_dispatch_control','UPDATE'),'API cannot alter coalescing or endpoint state');
select throws_ok($$select internal.configure_worker_dispatch(true,'https://example.test/arbitrary','worker-dispatch-token',false)$$,'22023',null,'only the fixed worker function path can be configured');
select throws_ok($$select internal.configure_worker_dispatch(true,'http://remote.example.test/functions/v1/cuevo-worker','worker-dispatch-token',false)$$,'22023',null,'remote plaintext transport is refused');
select throws_ok($$select internal.configure_worker_dispatch(true,'https://user:password@example.test/functions/v1/cuevo-worker','worker-dispatch-token',false)$$,'22023',null,'endpoint cannot contain credentials');
select throws_ok($$select internal.configure_worker_dispatch(true,'https://example.test/functions/v1/cuevo-worker?tenant=other','worker-dispatch-token',false)$$,'22023',null,'caller endpoint query cannot select domain scope');
select throws_ok($$select internal.configure_worker_dispatch(true,'http://supabase_kong_cuevo:8000/functions/v1/cuevo-worker','worker-dispatch-token',false)$$,'22023',null,'local network endpoint requires explicit operator opt-in');

-- Replace only network delivery inside this rollback test. No secret or remote HTTP is used.
-- Root verifies current untrusted net/Vault grants before this positive slice.
-- Trusted provider/service-role grants are separate from Cuevo delivery authority.
select is(internal.worker_transport_private(),true,'actual untrusted extension paths are refused before wake activation');
create temporary table worker_wake_capture(wake_id uuid not null,body jsonb not null);
create or replace function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint language plpgsql security definer set search_path=''as $$begin
 insert into pg_temp.worker_wake_capture values(target_wake,jsonb_build_object('version',1,'wakeId',target_wake));return 101;
end$$;
select internal.configure_worker_dispatch(true,'https://worker.example.test/functions/v1/cuevo-worker','worker-dispatch-token',false);
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values('10000000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{}','worker-wake-contract-first');
select is((select count(*)from worker_wake_capture),1::bigint,'committed insertion requests one opaque generation');
select ok((select body=jsonb_build_object('version',1,'wakeId',wake_id)from worker_wake_capture),'wake body excludes event school actor and payload');
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values('10000000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{}','worker-wake-contract-second');
select is((select count(*)from worker_wake_capture),1::bigint,'burst insertion coalesces behind active request');
select is(internal.request_worker_wake(),false,'recovery call cannot overlap an active invocation');
select is(internal.begin_worker_wake((select wake_id from internal.worker_dispatch_control)),false,'owner session cannot impersonate the processing worker');
select is(internal.finish_worker_wake((select wake_id from internal.worker_dispatch_control),'COMPLETED',1),false,'owner session cannot record restricted worker completion');
select is(internal.worker_dispatch_health()->>'ready','false','owner health never masquerades as actual worker identity');

-- Positive begin/finish/continuation checks run through an actual restricted LOGIN in API integration.
-- The migration owner is not a superuser and must not SET SESSION AUTHORIZATION to manufacture that proof.
create temporary table worker_generation(wake_id uuid not null);
insert into worker_generation select wake_id from internal.worker_dispatch_control where singleton;
select throws_ok($$select internal.finish_worker_wake((select wake_id from pg_temp.worker_generation),'RAW_PRIVATE_ERROR',1)$$,'22023',null,'worker status accepts only sanitized operational outcomes');
select ok(not(internal.worker_dispatch_health()::text like'%worker.example.test%'or internal.worker_dispatch_health()::text like'%worker-dispatch-token%'),'unready owner health still excludes endpoint and secret names');
update internal.worker_dispatch_control set lease_expires_at=clock_timestamp()-interval'1 second';
select is(internal.request_worker_wake(),true,'recovery replaces an expired or lost wake generation');
select ok((select wake_id<>(select wake_id from worker_generation)from internal.worker_dispatch_control),'recovery invalidates the lost generation token');

select internal.configure_worker_dispatch(false,null,null,false);
select is((select state from internal.worker_dispatch_control),'DISABLED','operator can pause without deleting durable work');
select is((select count(*)from internal.outbox_events where id in('17900000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000002')),2::bigint,'pause preserves pending source events');
select internal.configure_worker_dispatch(true,'https://worker.example.test/functions/v1/cuevo-worker','worker-dispatch-token',false);
update internal.outbox_events set state='COMPLETED',completed_at=clock_timestamp(),lease_token=null,lease_until=null where state<>'COMPLETED';
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,available_at)
values('10000000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{}','worker-wake-contract-future',clock_timestamp()+interval'1 hour');
select is(internal.request_worker_wake(),false,'future-due work does not create an idle invocation');
select is((select count(*)from worker_wake_capture),2::bigint,'no-due recovery retains the prior bounded wake count');
savepoint rollback_wake;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values('10000000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{}','worker-wake-contract-rollback');
rollback to savepoint rollback_wake;
release savepoint rollback_wake;
select is((select count(*)from worker_wake_capture),2::bigint,'rolled-back insertion retains no wake request');
select is((select count(*)from internal.outbox_events where id='17900000-0000-4000-8000-000000000005'),0::bigint,'rolled-back insertion retains no source event');
update internal.outbox_events set available_at=clock_timestamp()-interval'1 second'where id='17900000-0000-4000-8000-000000000004';
update internal.worker_dispatch_control set next_attempt_at=clock_timestamp()-interval'1 second';
create or replace function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint language plpgsql security definer set search_path=''as $$begin raise exception 'Private network failure';end$$;
select is(internal.request_worker_wake(),false,'failed transport stays best-effort and returns no false wake receipt');
select is((select last_error_code from internal.worker_dispatch_control),'WAKE_TRANSPORT_UNAVAILABLE','transport failure is sanitized');
select ok(not exists(select 1 from internal.worker_dispatch_control where last_error_code like'%Private%'),'raw network error never enters control state');
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
values('10000000-0000-4000-8000-000000000001','17900000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','school.updated','school','10000000-0000-4000-8000-000000000001',1,'{}','worker-wake-contract-transport-failure');
select is((select state from internal.outbox_events where id='17900000-0000-4000-8000-000000000003'),'PENDING','wake failure cannot roll back valid source enqueue');

select*from finish();
rollback;
