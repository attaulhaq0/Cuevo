begin;create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','internal.school_access_revisions','SELECT,INSERT,UPDATE,DELETE'),'Access history is private from raw API role');
select ok(not has_table_privilege('authenticated','internal.school_access_revisions','SELECT,INSERT,UPDATE,DELETE'),'Access history is private from Data API');
select ok(not has_function_privilege('cuevo_api','internal.record_school_access_revision()','EXECUTE'),'Access history trigger has no arbitrary runtime invocation');
select is((select revision from app.enrollments where school_id='10000000-0000-4000-8000-000000000001'and class_id='30000000-0000-4000-8000-000000000001'and student_actor_id='20000000-0000-4000-8000-000000000012'),1,'Initial access revision is explicit');
select throws_ok($$update internal.school_access_revisions set record='{}'where school_id='10000000-0000-4000-8000-000000000001'$$,'55000',null,'Access history immutable');
select*from finish();rollback;
