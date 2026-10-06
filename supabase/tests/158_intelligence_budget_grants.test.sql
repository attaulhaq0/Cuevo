begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','internal.intelligence_budget_reservations','SELECT,INSERT,UPDATE,DELETE'),'Runtime cannot alter held reservation accounting');
select ok(not has_table_privilege('authenticated','app.intelligence_budget_policies','SELECT,INSERT,UPDATE,DELETE'),'Data API does not expose school monetary policy');
select ok(not has_function_privilege('cuevo_api','internal.reserve_intelligence_budget(uuid,numeric)','EXECUTE'),'Raw monetary reservation helper is private');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select throws_ok($$select internal.read_intelligence_budget()$$,'42501',null,'Students cannot read financial reservation policy');
select throws_ok($$select internal.approve_intelligence_budget('{}','budget-invalid',repeat('a',64),'request')$$,'42501',null,'Student cannot approve live spend');
reset role;select*from finish();rollback;
