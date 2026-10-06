begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('authenticated','internal.read_community_announcement(uuid)','EXECUTE'),'Browser Data API cannot fetch private announcement sources');
select ok(has_function_privilege('cuevo_api','internal.read_community_announcement(uuid)','EXECUTE'),'Exact announcement read uses restricted API role');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.read_community_announcement('16800000-0000-4000-8000-000000000001')$$,'42501',null,'Missing exact source denied');
reset role;select*from finish();rollback;
