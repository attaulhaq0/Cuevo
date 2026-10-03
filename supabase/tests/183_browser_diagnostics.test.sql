begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
set local app.runtime_env='local';
select no_plan();

select ok(not has_table_privilege('anon','internal.browser_diagnostics','SELECT,INSERT,UPDATE,DELETE'),'anonymous cannot reach diagnostics');
select ok(not has_table_privilege('authenticated','internal.browser_diagnostics','SELECT,INSERT,UPDATE,DELETE'),'Data API cannot reach diagnostics');
select ok(not has_table_privilege('service_role','internal.browser_diagnostics','SELECT,INSERT,UPDATE,DELETE'),'service role cannot reach diagnostics');
select ok(not has_table_privilege('cuevo_api','internal.browser_diagnostics','SELECT,INSERT,UPDATE,DELETE'),'API has function-only diagnostic access');
select ok(not has_table_privilege('cuevo_worker','internal.browser_diagnostics','SELECT,INSERT,UPDATE,DELETE'),'worker has no raw diagnostics access');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='internal.browser_diagnostics'::regclass),'diagnostics force RLS');
select ok(not has_function_privilege('authenticated','internal.record_browser_diagnostic(jsonb,text)','EXECUTE'),'Data API cannot record diagnostics');
select ok(not has_function_privilege('cuevo_worker','internal.record_browser_diagnostic(jsonb,text)','EXECUTE'),'worker cannot author diagnostics');

select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
set local role cuevo_api;
select is(internal.browser_diagnostics_config(),' {"enabled":false}'::jsonb,'collection defaults disabled before operator approval');
select throws_ok($$select internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-test')$$,'42501',null,'unapproved diagnostics are denied');
reset role;

insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',coalesce(max(version),0)+1,'Synthetic browser diagnostics approval','20000000-0000-4000-8000-000000000001',true
from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
select internal.configure_posthog_school('10000000-0000-4000-8000-000000000001',true,'QA',1);
set local role cuevo_api;
select is(internal.browser_diagnostics_config(),'{"enabled":true}'::jsonb,'current authorized synthetic school gets fixed configuration only');
select throws_ok($$select internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile","stack":"private"}','diagnostic-test')$$,'22023',null,'raw content is rejected by SQL');
select throws_ok($$select internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-1000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-test')$$,'22023',null,'source identifiers cannot replace random diagnostic identity');
select is(internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-test'),'{"recorded":true,"duplicate":false}'::jsonb,'fixed current observation records');
select is(internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-retry'),'{"recorded":true,"duplicate":true}'::jsonb,'same identity retry is idempotent');
select throws_ok($$select internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"success","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-edit')$$,'22023',null,'same identity cannot rewrite diagnostic');
reset role;
select is((select count(*) from internal.browser_diagnostics where id='83000000-0000-4000-8000-000000000001'),1::bigint,'one private source retained');
select is((select count(*) from internal.audit_events where entity_id='83000000-0000-4000-8000-000000000001' and action='diagnostic.browser.record'),1::bigint,'one immutable audit retained');
select is((select count(*) from internal.outbox_events where entity_id='83000000-0000-4000-8000-000000000001' and type='diagnostic.browser'),1::bigint,'one transactional outbox event retained');
select is(internal.posthog_event_diagnostics((select id from internal.outbox_events where entity_id='83000000-0000-4000-8000-000000000001' and type='diagnostic.browser')),
  '{"category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}'::jsonb,'delivery constructs only six fixed fields');
update internal.outbox_events set metadata='{"diagnosticSchemaVersion":1,"raw":"private"}' where entity_id='83000000-0000-4000-8000-000000000001' and type='diagnostic.browser';
select is(internal.posthog_event_diagnostics((select id from internal.outbox_events where entity_id='83000000-0000-4000-8000-000000000001' and type='diagnostic.browser')),null::jsonb,'tampered event cannot feed diagnostics');
update internal.outbox_events set metadata='{"diagnosticSchemaVersion":1}' where entity_id='83000000-0000-4000-8000-000000000001' and type='diagnostic.browser';

set local role cuevo_api;
select lives_ok($$select internal.record_browser_diagnostic(jsonb_build_object('diagnosticId',gen_random_uuid(),'category','api_request','feature','school','status','success','timing','under_250ms','locale','ar','viewport','desktop'),'budget-test') from generate_series(1,19)$$,'bounded actor allowance succeeds');
select throws_ok($$select internal.record_browser_diagnostic(jsonb_build_object('diagnosticId',gen_random_uuid(),'category','api_request','feature','school','status','success','timing','under_250ms','locale','ar','viewport','desktop'),'over-budget')$$,'P0003',null,'actor rate budget is enforced');
reset role;
insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)
select '10000000-0000-4000-8000-000000000001',coalesce(max(version),0)+1,'Synthetic browser diagnostics revocation','20000000-0000-4000-8000-000000000001',false
from app.school_policy_versions where school_id='10000000-0000-4000-8000-000000000001';
set local role cuevo_api;
select is(internal.browser_diagnostics_config(),'{"enabled":false}'::jsonb,'latest school policy revokes browser configuration');
select throws_ok($$select internal.record_browser_diagnostic('{"diagnosticId":"83000000-0000-4000-8000-000000000001","category":"api_error","feature":"learning","status":"denied","timing":"under_250ms","locale":"en","viewport":"mobile"}','diagnostic-revoked-retry')$$,'42501',null,'revocation denies even prior receipt retry');
reset role;
select set_config('app.school_id','10000000-0000-4000-8000-000000000002',true);
set local role cuevo_api;
select throws_ok('select internal.browser_diagnostics_config()','42501',null,'cross-school selection denied');
reset role;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
update app.memberships set status='revoked' where school_id='10000000-0000-4000-8000-000000000001' and actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;
select throws_ok('select internal.browser_diagnostics_config()','42501',null,'revoked membership denied');
reset role;
select * from finish();
rollback;
