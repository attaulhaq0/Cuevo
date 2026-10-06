begin;create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','internal.intelligence_execution_bindings','SELECT,INSERT,UPDATE,DELETE'),'School execution approvals are private immutable records');
select ok(not has_function_privilege('authenticated','internal.approve_intelligence_execution(jsonb,text)','EXECUTE'),'Data API cannot approve configured execution');
select ok(not has_function_privilege('cuevo_api','internal.require_intelligence_execution(jsonb,uuid)','EXECUTE'),'Run binding precondition is private to reservation');
select ok(position('executionManifest'in pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure))>0,'Normal reservation enforces execution manifest before model work');
grant usage on schema extensions to cuevo_api;set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select throws_ok($$select internal.approve_intelligence_execution('{}','request')$$,'42501',null,'Teacher cannot approve task/model registry');
reset role;select*from finish();rollback;
