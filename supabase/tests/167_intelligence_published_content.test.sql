begin;create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('cuevo_api','internal.insight_published_options(uuid,uuid)','EXECUTE'),'Published context assembly remains private');
select ok(not has_function_privilege('authenticated','internal.insight_published_option(uuid,uuid,jsonb)','EXECUTE'),'Browser cannot forge saved content source authority');
select ok(position('insight_published_options'in pg_get_functiondef('internal.teacher_insight_context(uuid)'::regprocedure))>0,'Numeric context consumes the published content boundary');
select ok(position('insight_published_options'in pg_get_functiondef('internal.teacher_native_insight_context(uuid)'::regprocedure))>0,'Rubric context consumes the same published content boundary');
select ok(exists(select 1 from pg_constraint where conrelid='internal.intervention_approved_options'::regclass and contype='f'and confrelid='app.learning_content_revisions'::regclass),'Approved choices retain an immutable published revision source');
select*from finish();rollback;
