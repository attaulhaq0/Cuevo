begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
set local app.runtime_env='local';
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',coalesce(max(version),0)+1,'Synthetic capture verification','20000000-0000-4000-8000-000000000001',true from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select ok(internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',1),'operator activates current populated all-synthetic school');
select ok(internal.posthog_school_allowed('10000000-0000-4000-8000-000000000001'),'school policy and fresh activation permit synthetic capture');
insert into app.activity_completions(school_id,id,activity_id,learner_id)
select a.school_id,'82000000-0000-4000-8000-000000000001',a.id,'20000000-0000-4000-8000-000000000012' from app.activities a where a.school_id='10000000-0000-4000-8000-000000000001' limit 1;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('10000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012','activity.complete','activity','82000000-0000-4000-8000-000000000001',1,'{"private":"never export"}','posthog-sql-golden','COMPLETED',clock_timestamp());
-- The local fixture destination never substitutes for PostHog acceptance.
insert into internal.analytics_delivery(event_id,state,attempts,completed_at)values('82000000-0000-4000-8000-000000000002','COMPLETED',1,clock_timestamp());
select ok(internal.posthog_delivery_due(),'completed domain event makes analytics due after domain drain');
select ok(internal.worker_dispatch_due(),'existing recovery sees due analytics');
create temporary table posthog_claim(id uuid,lease_token uuid);grant select,insert on posthog_claim to cuevo_worker;
set local role cuevo_worker;
insert into posthog_claim select id,lease_token from internal.claim_posthog_delivery(1,30,1,'QA');
select is((select count(*)from posthog_claim where id='82000000-0000-4000-8000-000000000002'),1::bigint,'fixture-completed source has independent live receipt');
select is((select count(*)from internal.claim_posthog_delivery(1,30,1,'QA')),0::bigint,'active delivery lease cannot be stolen');
select is(internal.posthog_delivery_allowed('82000000-0000-4000-8000-000000000002',(select lease_token from posthog_claim),1,'QA'),true,'current lease revalidates policy before send');
select is(internal.accept_posthog_delivery('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000099',repeat('a',64)),false,'foreign lease cannot record acceptance');
select throws_ok('select *from internal.posthog_delivery','42501',null,'worker has no raw receipt access');
reset role;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',max(version)+1,'Synthetic revocation during in-flight capture','20000000-0000-4000-8000-000000000001',false from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
set local role cuevo_worker;
select is(internal.posthog_delivery_allowed('82000000-0000-4000-8000-000000000002',(select lease_token from posthog_claim),1,'QA'),false,'revocation prevents a new POST');
select is(internal.accept_posthog_delivery('82000000-0000-4000-8000-000000000002',(select lease_token from posthog_claim),repeat('a',64)),true,'confirmed in-flight acceptance remains truthful after revocation');
reset role;
select is((select state from internal.posthog_delivery where event_id='82000000-0000-4000-8000-000000000002'),'ACCEPTED','receipt records confirmed remote acceptance');
select ok(not has_table_privilege('authenticated','internal.posthog_delivery','SELECT,INSERT,UPDATE,DELETE'),'PostHog receipts remain private from Data API');
select ok(not has_function_privilege('cuevo_worker','internal.configure_posthog_school(uuid,boolean,text,integer)','EXECUTE'),'worker cannot approve or activate capture');
update app.people set synthetic=false where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
select is(internal.posthog_school_allowed('10000000-0000-4000-8000-000000000001'),false,'a single real person denies whole-school synthetic capture');
select throws_ok($$select internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',1)$$,'42501',null,'operator cannot activate mixed school');
update app.people set synthetic=true where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',max(version)+1,'Synthetic reapproval','20000000-0000-4000-8000-000000000001',true from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select ok(internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',1),'fresh reactivation records a new cutoff');
select is(internal.posthog_delivery_due(),false,'historical preactivation events do not backfill');
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('10000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000012','activity.complete','activity','82000000-0000-4000-8000-000000000001',1,'{}','posthog-retry-golden','COMPLETED',clock_timestamp());
truncate posthog_claim;
set local role cuevo_worker;
insert into posthog_claim select id,lease_token from internal.claim_posthog_delivery(1,30,1,'QA');
select ok(internal.fail_posthog_delivery((select id from posthog_claim),(select lease_token from posthog_claim),'CAPTURE_OUTCOME_UNKNOWN'),'unknown capture outcome schedules bounded retry');
select is((select count(*)from internal.claim_posthog_delivery(1,30,1,'QA')),0::bigint,'retry honors durable delay');
reset role;
update internal.posthog_delivery set available_at=clock_timestamp()-interval'1 second'where event_id='82000000-0000-4000-8000-000000000003';
truncate posthog_claim;set local role cuevo_worker;
insert into posthog_claim select id,lease_token from internal.claim_posthog_delivery(1,30,1,'QA');
reset role;
select is((select attempts from internal.posthog_delivery where event_id='82000000-0000-4000-8000-000000000003'),2,'retry increments durable attempt count');
update internal.posthog_delivery set attempts=5,lease_until=clock_timestamp()-interval'1 second'where event_id='82000000-0000-4000-8000-000000000003';
set local role cuevo_worker;
select is((select count(*)from internal.claim_posthog_delivery(1,30,1,'QA')),0::bigint,'attempt cap refuses expired exhausted delivery');
reset role;
select is((select state from internal.posthog_delivery where event_id='82000000-0000-4000-8000-000000000003'),'FAILED','exhausted lease is explicit failure');
select *from finish();rollback;
