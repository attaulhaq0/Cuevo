begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','app.school_record_revisions','SELECT,INSERT,UPDATE,DELETE'),'Runtime cannot rewrite school record history');
select ok(not has_function_privilege('authenticated','internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)','execute'),'Data API cannot maintain school records');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select throws_ok($$select internal.maintain_school_record('10000000-0000-4000-8000-000000000001','{}',true,'school-denied-001',repeat('a',64),'school-denied')$$,'42501',null,'Teacher cannot alter administrator school records');
reset role;select*from finish();rollback;
