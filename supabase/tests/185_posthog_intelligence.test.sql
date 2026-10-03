begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
select ok(to_regprocedure('internal.posthog_event_context(uuid)') is not null,'Fixed intelligence metadata projection exists');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,'internal.posthog_event_context(uuid)','EXECUTE')),'No runtime role can retrieve arbitrary private intelligence metadata');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,'internal.posthog_intelligence_event_run(uuid)','EXECUTE')),'Run linkage helper is private');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,'internal.intelligence_observability_source_allowed(uuid)','EXECUTE')),'Exact source validator is private');
select ok(not has_function_privilege('cuevo_worker','internal.claim_posthog_before_intelligence(integer,integer,integer,text)','EXECUTE'),'Worker cannot bypass projection wrapper');
select ok(not has_function_privilege('cuevo_worker','internal.process_before_intelligence_observability(uuid,uuid)','EXECUTE'),'Worker cannot bypass exact event validator');
select ok(has_function_privilege('cuevo_worker','internal.claim_posthog_delivery(integer,integer,integer,text)','EXECUTE'),'Worker retains only environment-bound capture claim');
select ok(has_function_privilege('cuevo_worker','internal.process_learner_event(uuid,uuid)','EXECUTE'),'Worker retains owner processor');
select ok(not exists(select 1 from pg_roles role cross join pg_class tab join pg_namespace schema on schema.oid=tab.relnamespace
 where role.rolname in('anon','authenticated','service_role','cuevo_worker') and (schema.nspname,tab.relname) in
 (('app','intelligence_runs'),('internal','intelligence_output_observations'),('internal','intelligence_quality_reviews'),('internal','intelligence_execution_bindings'))
 and has_table_privilege(role.oid,tab.oid,'SELECT,INSERT,UPDATE,DELETE')),'Data API and worker have no raw AI source grants');
select is((select count(*)from pg_trigger where tgname='intelligence_observation_outbox'and not tgisinternal),1::bigint,'New observations have one transactional outbox trigger');
select is((select count(*)from pg_trigger where tgname='intelligence_quality_outbox'and not tgisinternal),1::bigint,'Confirmed quality review has one transactional outbox trigger');

-- A source-less forged event must never become acknowledged or remotely eligible.
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until,attempt_count)
values('10000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',
 'intelligence.run_observed','intelligence_run','85000000-0000-4000-8000-000000000099',1,'{"intelligenceSchemaVersion":1}',
 'intelligence-run-observed:85000000-0000-4000-8000-000000000099','PROCESSING','85000000-0000-4000-8000-000000000002',clock_timestamp()+interval'30 seconds',1);
select is(internal.intelligence_observability_source_allowed('85000000-0000-4000-8000-000000000001'),false,'Missing immutable run observation is denied');
select is(internal.posthog_event_context('85000000-0000-4000-8000-000000000001'),null::jsonb,'Missing source cannot project model metadata');
select is(internal.posthog_source_event_allowed('85000000-0000-4000-8000-000000000001'),false,'Uncompleted forged event cannot capture');
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002')$$,'22023',null,'Restricted worker rejects source-less observation');
select throws_ok($$select internal.posthog_event_context('85000000-0000-4000-8000-000000000001')$$,'42501',null,'Direct worker projection access is denied');
reset role;
select is((select count(*)from internal.processed_events where event_id='85000000-0000-4000-8000-000000000001'),0::bigint,'Rejected event writes no completed receipt');
select*from finish();
rollback;
