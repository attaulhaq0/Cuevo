begin;create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
select ok(not has_table_privilege('cuevo_api','internal.improvement_result_sources','SELECT,INSERT,UPDATE,DELETE'),'Unified native sources stay private');
select ok(not has_table_privilege('authenticated','internal.improvement_evidence_sources','SELECT'),'Evidence bridge is not a Data API');
select is((select count(*)from internal.improvement_result_sources where model='numeric'),(select count(*)from app.result_revisions),'Numeric native source identities retained');
select is((select count(*)from internal.improvement_result_sources where model='rubric'),(select count(*)from app.rubric_result_revisions),'Rubric native source identities retained');
select is((select count(*)from internal.improvement_result_sources where model='rubric'and(score is not null or max_score is not null)),0::bigint,'Rubric projection never invents scalar attainment');
select is((select count(*)from pg_constraint where conrelid in('app.recommendations'::regclass,'app.interventions'::regclass,'app.intelligence_runs'::regclass)and contype='f'and confrelid='internal.academic_result_sources'::regclass),3::bigint,'One native source identity anchors proposals tasks and runs');
select*from finish();rollback;
