-- DRAFT ONLY. Run RED against frozen SQL, then GREEN only after root applies a new migration.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
set local app.runtime_env='local';
-- Isolate this golden sequence without altering retained evidence outside the rollback transaction.
update internal.posthog_school_activation set enabled=false where enabled;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',coalesce(max(version),0)+1,
 'Synthetic policy epoch approval','20000000-0000-4000-8000-000000000001',true
from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select ok(internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',86),
 'Initial operator activation is explicitly approved');
create temporary table original_activation as
 select activated_at,configured_at from internal.posthog_school_activation
 where school_id='10000000-0000-4000-8000-000000000001';
insert into app.activity_completions(school_id,id,activity_id,learner_id)
select activity.school_id,'86000000-0000-4000-8000-000000000001',activity.id,'20000000-0000-4000-8000-000000000012'
from app.activities activity where activity.school_id='10000000-0000-4000-8000-000000000001' limit 1;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('10000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012',
 'activity.complete','activity','86000000-0000-4000-8000-000000000001',1,'{}','posthog-policy-epoch-inflight','COMPLETED',clock_timestamp());
create temporary table epoch_claim(id uuid,lease_token uuid);
grant select,insert on epoch_claim to cuevo_worker;
set local role cuevo_worker;
insert into epoch_claim select id,lease_token from internal.claim_posthog_delivery(1,30,86,'QA');
select is((select id from epoch_claim),'86000000-0000-4000-8000-000000000002'::uuid,
 'Approved source is claimed before policy revocation');
reset role;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',max(version)+1,
 'Synthetic policy epoch revocation','20000000-0000-4000-8000-000000000001',false
from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select is((select enabled from internal.posthog_school_activation where school_id='10000000-0000-4000-8000-000000000001'),false,
 'Newest disabled policy invalidates operator activation');
select is((select activated_at from internal.posthog_school_activation where school_id='10000000-0000-4000-8000-000000000001'),
 (select activated_at from original_activation),'Revocation preserves the historical cutoff');
select ok((select configured_at from internal.posthog_school_activation where school_id='10000000-0000-4000-8000-000000000001')
 >=(select configured_at from original_activation),'Revocation records configuration change time');
set local role cuevo_worker;
select is(internal.posthog_delivery_allowed((select id from epoch_claim),(select lease_token from epoch_claim),86,'QA'),false,
 'Current revoked policy denies a new POST');
select is(internal.accept_posthog_delivery((select id from epoch_claim),(select lease_token from epoch_claim),repeat('a',64)),true,
 'Confirmed in-flight acceptance remains truthful after activation revocation');
reset role;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('10000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000012',
 'activity.complete','activity','86000000-0000-4000-8000-000000000001',1,'{}','posthog-policy-epoch-paused','COMPLETED',clock_timestamp());
select ok(internal.posthog_source_event_allowed('86000000-0000-4000-8000-000000000003'),
 'Paused-period event remains valid Cuevo domain evidence');
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',max(version)+1,
 'Synthetic policy epoch reapproval','20000000-0000-4000-8000-000000000001',true
from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select is(internal.posthog_school_allowed('10000000-0000-4000-8000-000000000001'),false,
 'Policy reapproval alone does not reactivate the destination');
select is(internal.posthog_delivery_due(),false,'Paused-period backlog remains ineligible before fresh operator activation');
truncate epoch_claim;
set local role cuevo_worker;
select is((select count(*) from internal.claim_posthog_delivery(1,30,86,'QA')),0::bigint,
 'Restricted worker cannot claim paused-period events under the old activation');
reset role;
select is((select count(*) from internal.posthog_delivery where event_id='86000000-0000-4000-8000-000000000003'),0::bigint,
 'Denied paused source consumes no receipt or attempt');
select ok(internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',86),
 'Fresh operator configuration explicitly reactivates capture');
select ok((select activated_at from internal.posthog_school_activation where school_id='10000000-0000-4000-8000-000000000001')
 >(select activated_at from original_activation),'Fresh activation advances the source cutoff');
select is(internal.posthog_delivery_due(),false,'Fresh activation never backfills the paused-period source');
set local role cuevo_worker;
select is((select count(*) from internal.claim_posthog_delivery(1,30,86,'QA')),0::bigint,
 'Paused source stays unclaimed after the fresh cutoff');
reset role;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('10000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000012',
 'activity.complete','activity','86000000-0000-4000-8000-000000000001',1,'{}','posthog-policy-epoch-fresh','COMPLETED',clock_timestamp());
truncate epoch_claim;
set local role cuevo_worker;
insert into epoch_claim select id,lease_token from internal.claim_posthog_delivery(1,30,86,'QA');
select is((select id from epoch_claim),'86000000-0000-4000-8000-000000000004'::uuid,
 'Only a fresh postactivation source becomes claimable');
select ok(internal.accept_posthog_delivery((select id from epoch_claim),(select lease_token from epoch_claim),repeat('b',64)),
 'Fresh source records one truthful destination acceptance');
reset role;
-- A noncurrent inserted historical policy cannot revoke the current activation.
create temporary table skipped_epoch as
 select max(version)+1 version from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',version+1,
 'Synthetic current approved history guard','20000000-0000-4000-8000-000000000001',true from skipped_epoch;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',version,
 'Synthetic noncurrent historical disabled policy','20000000-0000-4000-8000-000000000001',false from skipped_epoch;
select is(internal.posthog_school_allowed('10000000-0000-4000-8000-000000000001'),true,
 'Noncurrent historical disabled policy does not revoke current capture');
select ok(not exists(select 1 from pg_roles role cross join pg_proc procedure join pg_namespace schema on schema.oid=procedure.pronamespace
 where schema.nspname='internal' and procedure.proname='revoke_posthog_activation_on_policy'
 and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,procedure.oid,'EXECUTE')),
 'Policy revocation trigger helper has no runtime grants');
select ok(not exists(select 1 from pg_roles role cross join pg_proc procedure join pg_namespace schema on schema.oid=procedure.pronamespace
 where schema.nspname='internal' and procedure.proname in('configure_posthog_before_policy_epoch','configure_posthog_school')
 and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
 and has_function_privilege(role.oid,procedure.oid,'EXECUTE')),
 'Both configuration surfaces remain operator-only without a runtime bypass');
select * from finish();
rollback;
