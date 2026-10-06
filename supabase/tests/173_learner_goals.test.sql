begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','app.learner_goals','SELECT,INSERT,UPDATE,DELETE'),'Learner goals have no raw runtime grant');
select ok(not has_function_privilege('authenticated','internal.learner_goal_command(text,uuid,jsonb,text,text,text)','EXECUTE'),'Data API cannot author learner goals');
select ok(not has_function_privilege('cuevo_api','internal.learner_goal_allowed(uuid,uuid,uuid,boolean)','EXECUTE'),'Goal scope helper stays private');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.read_learner_goals('20000000-0000-4000-8000-000000000012',25,null)$$,'42501',null,'Parent cannot read private learner goals');
reset role;select*from finish();rollback;
