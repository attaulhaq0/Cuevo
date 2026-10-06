begin;
create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;
select plan(4);
select ok(has_function_privilege('cuevo_api','internal.read_academic_evidence_context(uuid)','EXECUTE'),'API can read one exact authorized evidence context');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_worker')and has_function_privilege(role.oid,'internal.read_academic_evidence_context(uuid)'::regprocedure,'EXECUTE')),'Worker and Data API cannot call the evidence context projection');
select ok((select p.prosecdef and p.provolatile='s'and 'search_path=""'=any(p.proconfig)from pg_proc p where p.oid='internal.read_academic_evidence_context(uuid)'::regprocedure),'Evidence source helper is stable with an empty privileged search path');
select ok(not has_table_privilege('authenticated','app.academic_evidence','SELECT')and not has_table_privilege('cuevo_worker','app.people','SELECT'),'New human context adds no raw evidence or people directory grants');
select*from finish();rollback;
