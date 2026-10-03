begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('cuevo_api','internal.current_school_schedule_page(text,jsonb)','EXECUTE'),'Current schedule helper is not a direct runtime API');
select ok(not has_function_privilege('authenticated','internal.current_school_schedule_page(text,jsonb)','EXECUTE'),'Data API cannot read current private schedule revisions');
select ok(not has_table_privilege('cuevo_api','app.school_record_revisions','SELECT'),'Current revision tables retain private grants');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.named_school_page('report-periods','{"limit":25}')$$,'42501',null,'Parent cannot enumerate staff reporting periods through the current projection');
reset role;select*from finish();rollback;
