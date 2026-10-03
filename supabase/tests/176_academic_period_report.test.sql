begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('authenticated','internal.list_current_native_results_period(integer,uuid,uuid,uuid)','EXECUTE'),'DataAPI cannot read period source projection');
select ok(not has_function_privilege('cuevo_api','internal.report_period_context(uuid)','EXECUTE'),'Period context helper remains private');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000018',true);
select throws_ok($$select internal.list_current_native_results_period(25,null,'20000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000001')$$,'42501',null,'Peer target denied before unknown period disclosure');
reset role;select*from finish();rollback;
