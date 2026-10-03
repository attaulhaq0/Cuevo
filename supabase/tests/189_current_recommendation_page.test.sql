begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select plan(13);
select ok(has_function_privilege('cuevo_api','internal.read_current_recommendation_page(integer,uuid)','EXECUTE'),'Only the API receives the current page surface');
select ok(not has_function_privilege('authenticated','internal.read_current_recommendation_page(integer,uuid)','EXECUTE'),'Data API cannot retrieve proposal pages');
select ok(not has_function_privilege('cuevo_worker','internal.read_current_recommendation_page(integer,uuid)','EXECUTE'),'Worker cannot impersonate staff proposal review');
create temporary table proposal_page_source(result_id uuid,submission_id uuid,proposal_id uuid,run_id uuid);
create temporary table proposal_page_receipts(id uuid primary key);
grant select,insert,update on proposal_page_source,proposal_page_receipts to cuevo_api;
insert into app.intelligence_policies(school_id,version,fixture_enabled,approved_by)values('10000000-0000-4000-8000-000000000001',991,true,'20000000-0000-4000-8000-000000000001')on conflict(school_id)do update set version=991,fixture_enabled=true,data_classification='SCHOOL_CUSTOM_NUMERIC',allowed_actions=array['GUIDED_PRACTICE','REVIEW_FEEDBACK'];
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
set local role cuevo_api;
do $$declare course uuid;assessment uuid;submission uuid;result uuid;reservation jsonb;fact jsonb;receipt jsonb;begin
 insert into app.courses(school_id,class_id,subject_id,created_by,title,description,status)values("authorization".school_id(),'30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',"authorization".actor_id(),'Proposal page source','Rollback-only synthetic source','PUBLISHED')returning id into course;
 insert into app.assessments(school_id,course_id,created_by,title,instructions,max_score)values("authorization".school_id(),course,"authorization".actor_id(),'Page baseline','Teacher-authored task',10)returning id into assessment;
 perform internal.link_assessment_reference(assessment,'61000000-0000-4000-8000-000000000001',1);
 perform set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
 insert into app.submissions(school_id,assessment_id,learner_id,content)values("authorization".school_id(),assessment,"authorization".actor_id(),'Synthetic source')returning id into submission;
 perform set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
 result:=internal.release_marking(internal.mark_submission(submission,3,'Reviewed source',2,0,true),1,false);
 insert into proposal_page_source(result_id,submission_id)values(result,submission);
 for index in 1..50 loop
  reservation:=internal.begin_teacher_insight_run('page-source-'||index,repeat('a',64),result,'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":991,"timeoutMs":30000,"maxTokens":1000,"maxCost":1,"costBasis":"DETERMINISTIC_FIXTURE"}','proposal-page');
  fact:=(reservation->'context')-'insight';
  receipt:=internal.complete_intelligence_run((reservation->>'runId')::uuid,(reservation->>'leaseToken')::uuid,jsonb_build_object('evidenceIds',jsonb_build_array(fact->'evidenceId'),'facts',jsonb_build_array(fact||'{"kind":"NUMERIC_RESULT"}'),'action','REVIEW_FEEDBACK','reason','REVIEW_RECORDED_RESULT','limitation','SINGLE_RESULT_NOT_CAUSAL'),'{"outputTokens":0,"inputTokens":0,"cost":0,"costBasis":"DETERMINISTIC_FIXTURE","latencyMs":1}','proposal-page');
  insert into proposal_page_receipts values((receipt->>'id')::uuid);
  if index=50 then update proposal_page_source set proposal_id=(receipt->>'id')::uuid,run_id=(reservation->>'runId')::uuid;end if;
 end loop;
end$$;
select is((select count(*)from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)),50::bigint,'All fifty legitimate repeated proposals remain visible');
select throws_ok($$select internal.read_current_recommendation_page(0,null)$$,'22023',null,'Page cannot bypass fixed bounds');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select throws_ok($$select internal.read_current_recommendation_page(100,null)$$,'42501',null,'Learner cannot review staff proposals');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.read_current_recommendation_page(100,null)$$,'42501',null,'Parent cannot review internal proposals');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000005',true);
select is((select count(*)from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)),0::bigint,'Unassigned teacher cannot borrow a valid source group');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
reset role;
savepoint changed_snapshot;
alter table app.intelligence_context_details disable trigger immutable_history;
update app.intelligence_context_details set context=jsonb_set(context,'{reference,version}',to_jsonb('different-source'::text))where school_id='10000000-0000-4000-8000-000000000001'and run_id=(select run_id from proposal_page_source);
alter table app.intelligence_context_details enable trigger immutable_history;
set local role cuevo_api;
select count(*)as changed_snapshot_count from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)\gset
rollback to savepoint changed_snapshot;
select is(:changed_snapshot_count::bigint,49::bigint,'One different exact saved snapshot cannot reuse the other forty-nine verdicts');
savepoint changed_policy;
update app.intelligence_policies set version=992 where school_id='10000000-0000-4000-8000-000000000001';
set local role cuevo_api;
select count(*)as changed_policy_count from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)\gset
rollback to savepoint changed_policy;
select is(:changed_policy_count::bigint,0::bigint,'Current school policy is rechecked after grouping');
savepoint changed_population;
update app.people set synthetic=false where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000013';
set local role cuevo_api;
select count(*)as changed_population_count from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)\gset
rollback to savepoint changed_population;
select is(:changed_population_count::bigint,0::bigint,'Mixed population is rechecked for every current fixture group');
savepoint corrected_native;
set local role cuevo_api;
select internal.release_marking(internal.mark_submission((select submission_id from proposal_page_source),4,'Corrected exact native baseline',2,1,true),2,false);
select count(*)as corrected_native_count from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)\gset
rollback to savepoint corrected_native;
select is(:corrected_native_count::bigint,0::bigint,'Corrected baseline denies all stale source groups');
savepoint withdrawn;
update app.enrollments set status='revoked'where school_id='10000000-0000-4000-8000-000000000001'and student_actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;
select count(*)as withdrawn_count from jsonb_array_elements(internal.read_current_recommendation_page(100,null)->'items')item where(item->>'id')::uuid in(select id from proposal_page_receipts)\gset
rollback to savepoint withdrawn;
select is(:withdrawn_count::bigint,0::bigint,'Current learner enrollment is rechecked rather than cached');
select*from finish();
rollback;
