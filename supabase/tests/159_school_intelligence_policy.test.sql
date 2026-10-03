begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','app.intelligence_policy_approvals','SELECT,INSERT,UPDATE,DELETE'),'Raw school approvals remain private');
select ok(not has_function_privilege('authenticated','internal.approve_school_intelligence_policy(jsonb,text,text,text)','EXECUTE'),'Data API cannot approve model purpose');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select throws_ok($$select internal.read_school_intelligence_policy()$$,'42501',null,'Teacher cannot administer school model policy');
select throws_ok($$select internal.approve_school_intelligence_policy('{}','bad-school-policy',repeat('a',64),'request')$$,'42501',null,'Teacher cannot approve school model policy');
reset role;select*from finish();rollback;
