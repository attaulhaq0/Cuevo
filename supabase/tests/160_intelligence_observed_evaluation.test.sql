begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','internal.intelligence_quality_reviews','SELECT,INSERT,UPDATE,DELETE'),'Raw human observations remain private');
select ok(not has_table_privilege('authenticated','internal.intelligence_output_observations','SELECT,INSERT,UPDATE,DELETE'),'Output observations are not a Data API');
select ok(not has_function_privilege('cuevo_api','internal.read_intelligence_evaluation(integer,text)','EXECUTE'),'Evaluation helper remains private to metrics');
select ok(not has_function_privilege('authenticated','internal.record_intelligence_quality_review(uuid,jsonb,text,text,text)','EXECUTE'),'Browser Data API cannot record human review');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.read_intelligence_quality_review('16000000-0000-4000-8000-000000000001')$$,'42501',null,'Parent cannot retrieve a private proposal review');
select throws_ok($$select internal.record_intelligence_quality_review('16000000-0000-4000-8000-000000000001','{}','review',repeat('a',64),'request')$$,'22023',null,'Direct private command rejects missing explicit review fields');
reset role;select*from finish();rollback;
