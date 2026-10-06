-- Rollback-only source/RLS parity and deterministic denied-row cursor fixture.
-- Imported HUMAN rows pin genuine released sources; no runtime source/trigger is weakened.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select plan(14);
create temporary table recommendation_parity_sources(kind text primary key,result_id uuid,submission_id uuid,evidence_id uuid);
grant select,insert,update on recommendation_parity_sources to cuevo_api;
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)values('10000000-0000-4000-8000-000000000001','99010000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Recommendation parity rollback class');
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values('10000000-0000-4000-8000-000000000001','99010000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012',now()-interval'1 day');
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values('10000000-0000-4000-8000-000000000001','99010000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',now()-interval'1 day');
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
set local role cuevo_api;
do $$declare course uuid;assessment uuid;submission uuid;result uuid;label text;begin
 insert into app.courses(school_id,class_id,subject_id,created_by,title,description,status)values("authorization".school_id(),'99010000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',"authorization".actor_id(),'Parity source course','Rollback-only source','PUBLISHED')returning id into course;
 foreach label in array array['current','stale']loop
  insert into app.assessments(school_id,course_id,created_by,title,instructions,max_score)values("authorization".school_id(),course,"authorization".actor_id(),'Parity '||label,'Teacher-authored source',10)returning id into assessment;
  perform internal.link_assessment_reference(assessment,'61000000-0000-4000-8000-000000000001',1);
  perform set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
  insert into app.submissions(school_id,assessment_id,learner_id,content)values("authorization".school_id(),assessment,"authorization".actor_id(),'Synthetic original work')returning id into submission;
  perform set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
  result:=internal.release_marking(internal.mark_submission(submission,3,'Reviewed original',2,0,true),1,false);
  insert into recommendation_parity_sources(kind,result_id,submission_id)values(label,result,submission);
 end loop;
end$$;
reset role;
update recommendation_parity_sources source set evidence_id=result.evidence_id from app.result_revisions result where result.id=source.result_id;
insert into app.recommendations(school_id,id,learner_id,reference_id,baseline_result_id,observation,interpretation,recommendation,rationale,uncertainty,activity_title,instructions,evidence_ids,created_by)
select '10000000-0000-4000-8000-000000000001',('99020000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid,
 '20000000-0000-4000-8000-000000000012','61000000-0000-4000-8000-000000000001',source.result_id,
 'Recorded native source '||ordinal,'Teacher review '||ordinal,'Read the feedback '||ordinal,'Exact evidence '||ordinal,'Recorded source is not causal proof',
 'Distinct human title '||ordinal,'Distinct teacher-authored instruction '||ordinal,array[source.evidence_id],
 case when ordinal=3 then '20000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000004'::uuid end
from generate_series(1,12)ordinal join recommendation_parity_sources source on source.kind=case when ordinal%2=1 then'current'else'stale'end;
set local role cuevo_api;
select internal.release_marking(internal.mark_submission((select submission_id from recommendation_parity_sources where kind='stale'),4,'Actual source correction',2,1,true),2,false);

-- This is the pre-optimization transport query under the real current cuevo_api RLS policy.
reset role;
create function pg_temp.raw_recommendation_page(lim integer,cur uuid)returns jsonb language sql stable as $$
 with rows as materialized(
  select r.id,jsonb_build_object('id',r.id,'learnerId',r.learner_id,'referenceId',r.reference_id,'baselineResultId',r.baseline_result_id,'origin',r.origin,'generationMode',r.generation_mode,'intelligenceRunId',r.intelligence_run_id,
   'observation',r.observation,'evidenceIds',r.evidence_ids,'interpretation',r.interpretation,'recommendation',r.recommendation,'rationale',r.rationale,'uncertainty',r.uncertainty,'activityTitle',r.activity_title,'instructions',r.instructions,'status',r.status,'createdAt',r.created_at,'selectedActivityId',r.selected_activity_id,'analysis',r.analysis,'promptDigest',r.prompt_digest)as item
  from app.recommendations r where(cur is null or r.id>cur)order by r.id limit lim+1
 ),visible as materialized(select*from rows order by id limit lim)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by id)from visible),'[]'::jsonb),'nextCursor',case when(select count(*)from rows)>lim then(select id from visible order by id desc limit 1)else null end)
$$;
grant execute on function pg_temp.raw_recommendation_page(integer,uuid)to cuevo_api;
set local role cuevo_api;
select is(internal.read_current_recommendation_page(2,'99020000-0000-4000-8000-000000000000')::text,pg_temp.raw_recommendation_page(2,'99020000-0000-4000-8000-000000000000')::text,'First page equals actual raw RLS full payload with interleaved denied rows');
select is(internal.read_current_recommendation_page(2,'99020000-0000-4000-8000-000000000003')::text,pg_temp.raw_recommendation_page(2,'99020000-0000-4000-8000-000000000003')::text,'Second cursor page equals actual raw RLS payload after denied rows');
select is(internal.read_current_recommendation_page(2,'99020000-0000-4000-8000-000000000007')::text,pg_temp.raw_recommendation_page(2,'99020000-0000-4000-8000-000000000007')::text,'Later cursor page equals raw RLS including its exact authorized continuation');
select ok(not exists(select 1 from jsonb_array_elements(internal.read_current_recommendation_page(100,'99020000-0000-4000-8000-000000000000')->'items')item where(item->>'id')::uuid in(select('99020000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid from generate_series(2,12,2)ordinal)),'Corrected interleaved fixture rows remain denied independently of unrelated seed proposals');
select is((internal.read_current_recommendation_page(2,'99020000-0000-4000-8000-000000000000')->'items'->1->>'id'),'99020000-0000-4000-8000-000000000003','Admin-authored proposal preserves shared current baseline visibility without creator-only filtering');
select is((internal.read_current_recommendation_page(2,'99020000-0000-4000-8000-000000000000')->'items'->1->>'activityTitle'),'Distinct human title 3','Equivalent authority does not replace another proposal payload with its representative');

select set_config('app.actor_id','20000000-0000-4000-8000-000000000002',true);
select is(internal.read_current_recommendation_page(3,'99020000-0000-4000-8000-000000000000')::text,pg_temp.raw_recommendation_page(3,'99020000-0000-4000-8000-000000000000')::text,'Coordinator retains exactly the existing purpose-specific RLS behavior');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000005',true);
select is(internal.read_current_recommendation_page(3,'99020000-0000-4000-8000-000000000000')::text,pg_temp.raw_recommendation_page(3,'99020000-0000-4000-8000-000000000000')::text,'Other teacher cannot borrow a current source group');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
reset role;
savepoint entitlement_withdrawn;
update app.entitlements set enabled=false where school_id='10000000-0000-4000-8000-000000000001'and code='improvement';
set local role cuevo_api;
do $$begin
 begin perform internal.read_current_recommendation_page(2,null);raise exception 'Expected denial absent';exception when insufficient_privilege then perform set_config('test.parity_entitlement_denied','true',true);end;
end$$;
select current_setting('test.parity_entitlement_denied',true)='true' as entitlement_denied\gset
select(pg_temp.raw_recommendation_page(2,'99020000-0000-4000-8000-000000000000')->'items')::text as entitlement_raw_items\gset
rollback to savepoint entitlement_withdrawn;
select ok(:'entitlement_denied'::boolean,'Current improvement entitlement is checked before any grouped disclosure');
select is(:'entitlement_raw_items'::jsonb,'[]'::jsonb,'Old raw RLS also exposes no row after entitlement withdrawal');
reset role;
savepoint learner_withdrawn;
update app.enrollments set status='revoked'where school_id='10000000-0000-4000-8000-000000000001'and class_id='99010000-0000-4000-8000-000000000001'and student_actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;
select(internal.read_current_recommendation_page(3,'99020000-0000-4000-8000-000000000000')=pg_temp.raw_recommendation_page(3,'99020000-0000-4000-8000-000000000000'))as withdrawn_parity\gset
rollback to savepoint learner_withdrawn;
select ok(:'withdrawn_parity'::boolean,'Current learner source withdrawal denies grouped and individual reads equally');
reset role;
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app.recommendations'::regclass),'Existing FORCE RLS remains active');
select ok(not has_function_privilege('anon','internal.read_current_recommendation_page(integer,uuid)','EXECUTE')and not has_function_privilege('service_role','internal.read_current_recommendation_page(integer,uuid)','EXECUTE'),'Public/Data API roles gain no page permission');
select ok(not has_table_privilege('cuevo_worker','app.recommendations','SELECT'),'Worker gains no recommendation table disclosure');
select*from finish();
rollback;
