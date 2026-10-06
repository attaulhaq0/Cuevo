begin;create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('authenticated','internal.read_learner_profile(uuid)','EXECUTE'),'Browser has no raw learner profile function grant');
select ok(not has_function_privilege('cuevo_worker','internal.read_learner_profile(uuid)','EXECUTE'),'Worker cannot retrieve pupil profile context');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select is(internal.read_learner_profile('20000000-0000-4000-8000-000000000012')->>'id','20000000-0000-4000-8000-000000000012','Learner reads exact current own identity');
select throws_ok($$select internal.read_learner_profile('20000000-0000-4000-8000-000000000018')$$,'42501',null,'Peer profile scope denied');
select ok(not(internal.read_learner_profile('20000000-0000-4000-8000-000000000012')?|array['privateNotes','guardianNames','diagnosis','abilityScore']),'Profile source has no arbitrary private object');
reset role;select*from finish();rollback;
