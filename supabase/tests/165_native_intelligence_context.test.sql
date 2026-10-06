begin;create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_function_privilege('cuevo_api','internal.complete_native_intelligence_run(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'Native completion cannot bypass public source/lease boundary');
select ok(not has_function_privilege('authenticated','internal.teacher_native_insight_context(uuid)','EXECUTE'),'Native context helper remains private');
select ok(not has_function_privilege('cuevo_api','internal.validate_native_intelligence_analysis(uuid,jsonb)','EXECUTE'),'Native citation validator is private');
select ok(position('SCHOOL_CUSTOM_NATIVE'in pg_get_functiondef('internal.begin_intelligence_run(text,text,uuid,jsonb,text)'::regprocedure))>0,'Native reservation requires explicit school classification');
select ok(position('02cb6c151d57fa9e7c17c861ccea6561c1a6c400fcd3814736eb01a22d442e2c'in pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure))>0,'Native prompt content is source-locked');
select ok(position('stored jsonb;source jsonb;basis text;'in pg_get_functiondef('internal.validate_native_intelligence_analysis(uuid,jsonb)'::regprocedure))=0,'Native citation query does not shadow its JSON source alias');
select*from finish();rollback;
