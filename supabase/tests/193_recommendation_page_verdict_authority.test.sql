-- Page-only delegate/map least privilege and pinned canonical source integrity.
begin;
create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;
select plan(6);
select is((select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal'and p.proname in('page_can_read_academic_source','page_can_mark_submission','page_native_academic_source_allowed','page_can_manage_baseline','page_intelligence_context','page_insight_result_allowed','page_insight_outcome_allowed','page_require_native_insight_scope','page_require_stored_insight_scope','page_recommendation_source_allowed')),10::bigint,'All ten purpose-specific page delegates are present');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles role where n.nspname='internal'and p.proname in('recommendation_page_verdict','recommendation_page_source_verdicts','page_can_read_academic_source','page_can_mark_submission','page_native_academic_source_allowed','page_can_manage_baseline','page_intelligence_context','page_insight_result_allowed','page_insight_outcome_allowed','page_require_native_insight_scope','page_require_stored_insight_scope','page_recommendation_source_allowed')and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,p.oid,'EXECUTE')),'No runtime/Data API caller can supply an authority map or invoke a page delegate');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal'and p.proname like'page_%'and p.proname in('page_can_read_academic_source','page_can_mark_submission','page_native_academic_source_allowed','page_can_manage_baseline','page_intelligence_context','page_insight_result_allowed','page_insight_outcome_allowed','page_require_native_insight_scope','page_require_stored_insight_scope','page_recommendation_source_allowed')and(not p.prosecdef or not('search_path=""'=any(p.proconfig)))),'Each cloned authority delegate retains security-definer and empty search path');
select ok(not exists(select 1 from(values
 ('"authorization".can_read_academic_source(uuid,uuid,boolean,uuid)','050483024fa619401dc920b941ee36bf'),
 ('"authorization".can_mark_submission(uuid,uuid)','545116363b786b5006b72b8e56effe33'),
 ('internal.native_academic_source_allowed(uuid,uuid,boolean)','ef83bbe3bb167ab86793ac6373db0767'),
 ('"authorization".can_manage_baseline(uuid,uuid)','b526c9f7e5879b1cf485cc0edabbfd3a'),
 ('internal.intelligence_context(uuid)','c35adaaf82f44a2c542f2ee702cb3e29'),
 ('internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean)','1e2ed196882a2b741aba04718962f8a4'),
 ('internal.insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text)','b4cd97ff86ffd4866d9e0e9459a21e4c'),
 ('internal.require_native_insight_scope(uuid)','10744f6e39dc0b20be89db15156ca273'),
 ('internal.require_stored_insight_scope(uuid)','453d00c731d0750739809c70907266f0'),
 ('internal.recommendation_source_allowed(uuid,uuid)','029c48bec2a07296b129320951558d3b')
 )expected(signature,digest)where md5(pg_get_functiondef(signature::regprocedure))<>digest),'Every canonical command/replay/source authority body matches reviewed migration history');
select ok(not has_table_privilege('cuevo_worker','app.recommendations','SELECT')and not has_table_privilege('authenticated','app.intelligence_context_details','SELECT'),'Source map adds no raw proposal or saved-context data grants');
select ok(has_function_privilege('cuevo_api','internal.read_current_recommendation_page(integer,uuid)','EXECUTE')and not has_function_privilege('authenticated','internal.read_current_recommendation_page(integer,uuid)','EXECUTE'),'Only existing API page surface admits the current request');
select*from finish();rollback;
