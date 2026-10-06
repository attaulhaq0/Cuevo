begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_worker;
set local search_path=extensions,pg_catalog;
set local app.runtime_env='local';
select no_plan();
-- Isolated synthetic sources use fixed field diagnostics so no academic content is copied.
insert into app.schools(id,name,country_code)values('84000000-0000-4000-8000-000000000001','Environment QA synthetic','QA'),('84000000-0000-4000-8000-000000000002','Environment demo synthetic','QA');
insert into app.memberships(school_id,actor_id,role,effective_from)
select school,'20000000-0000-4000-8000-000000000001','admin',clock_timestamp()-interval'1 day'from unnest(array['84000000-0000-4000-8000-000000000001'::uuid,'84000000-0000-4000-8000-000000000002'::uuid])school;
insert into app.people(school_id,actor_id,display_name,synthetic)
select school,'20000000-0000-4000-8000-000000000001','Synthetic administrator',true from unnest(array['84000000-0000-4000-8000-000000000001'::uuid,'84000000-0000-4000-8000-000000000002'::uuid])school;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select school,1,'Environment isolation verification','20000000-0000-4000-8000-000000000001',true from unnest(array['84000000-0000-4000-8000-000000000001'::uuid,'84000000-0000-4000-8000-000000000002'::uuid])school;
select ok(internal.configure_posthog_school('84000000-0000-4000-8000-000000000001',true,'QA',99),'QA activation');
select ok(internal.configure_posthog_school('84000000-0000-4000-8000-000000000002',true,'DEMO',99),'DEMO same isolated key version activation');
insert into internal.browser_diagnostics(id,school_id,actor_id,payload)
values('84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','{"category":"api_error","feature":"school","status":"denied","timing":"unknown","locale":"en","viewport":"mobile"}'),
('84000000-0000-4000-8000-000000000012','84000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','{"category":"api_error","feature":"school","status":"denied","timing":"unknown","locale":"en","viewport":"mobile"}');
insert into internal.audit_events(school_id,actor_id,action,entity_type,entity_id,request_id,outcome,metadata)
select source.school_id,source.actor_id,'diagnostic.browser.record','browser_diagnostic',source.id,'environment-golden','succeeded','{"diagnosticSchemaVersion":1}'from internal.browser_diagnostics source where source.id in('84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000012');
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)
values('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','diagnostic.browser','browser_diagnostic','84000000-0000-4000-8000-000000000011',1,'{"diagnosticSchemaVersion":1}','environment-qa-golden','COMPLETED',clock_timestamp()),
('84000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000001','diagnostic.browser','browser_diagnostic','84000000-0000-4000-8000-000000000012',1,'{"diagnosticSchemaVersion":1}','environment-demo-golden','COMPLETED',clock_timestamp());
select ok(internal.posthog_source_event_allowed('84000000-0000-4000-8000-000000000021'),'QA source validated');
select ok(internal.posthog_source_event_allowed('84000000-0000-4000-8000-000000000022'),'DEMO source validated');
create temporary table environment_claim(id uuid,lease_token uuid);grant select,insert on environment_claim to cuevo_worker;
set local role cuevo_worker;
insert into environment_claim select id,lease_token from internal.claim_posthog_delivery(1,30,99,'QA');
select is((select id from environment_claim),'84000000-0000-4000-8000-000000000021'::uuid,'QA worker claims only its own environment');
select is(internal.posthog_delivery_allowed((select id from environment_claim),(select lease_token from environment_claim),99,'QA'),true,'same environment current send permitted');
select is(internal.posthog_delivery_allowed((select id from environment_claim),(select lease_token from environment_claim),99,'DEMO'),false,'foreign environment cannot authorize POST');
select is((select count(*)from internal.claim_posthog_delivery(1,30,99,'QA')),0::bigint,'drained QA does not claim DEMO work');
select throws_ok($$select *from internal.claim_posthog_delivery(1,30,99)$$,'42501',null,'legacy environment-free claim is revoked from worker');
reset role;
select is((select count(*)from internal.posthog_delivery where event_id='84000000-0000-4000-8000-000000000022'),0::bigint,'foreign environment has no receipt or consumed attempt');
select ok(internal.posthog_delivery_due(),'other environment remains durable due work');
truncate environment_claim;set local role cuevo_worker;
insert into environment_claim select id,lease_token from internal.claim_posthog_delivery(1,30,99,'DEMO');
select is((select id from environment_claim),'84000000-0000-4000-8000-000000000022'::uuid,'matching DEMO worker claims preserved source');
select throws_ok($$select *from internal.claim_posthog_delivery(1,30,99,'PRODUCTION')$$,'22023',null,'unapproved environment rejected');
reset role;
select is((select attempts from internal.posthog_delivery where event_id='84000000-0000-4000-8000-000000000022'),1,'first matching environment consumes exactly one attempt');
select *from finish();rollback;
