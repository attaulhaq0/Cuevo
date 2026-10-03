-- Current academic projection differs from retained immutable source history.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select no_plan();
create temporary table academic_customer_ids(source_id uuid,replacement_id uuid,baseline_id uuid,secondary_id uuid,proposal_id uuid,run_id uuid);
grant select,insert,update on academic_customer_ids to cuevo_api;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)
values('10000000-0000-4000-8000-000000000001','99510000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer revision loop','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id,policy_version)
select'10000000-0000-4000-8000-000000000001',('99520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99510000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer source '||n,'Teacher authored',10,'61000000-0000-4000-8000-000000000001',2 from generate_series(1,3)n;
set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
insert into academic_customer_ids(source_id)values(internal.create_learning_submission('99520000-0000-4000-8000-000000000001','First immutable work'));
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update academic_customer_ids set baseline_id=internal.release_marking(internal.mark_submission(source_id,2,'Released first attempt',2,0,true),1,true);
select internal.return_learning_submission((select source_id from academic_customer_ids),'Revise the school explanation',1) is not null as returned;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
update academic_customer_ids set replacement_id=internal.resubmit_learning_submission(source_id,(select id from app.submission_returns where submission_id=source_id),'Revised immutable work',1);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select internal.release_marking(internal.mark_submission((select replacement_id from academic_customer_ids),7,'Released revised attempt',2,0,true),1,true) is not null as replacement_released;
select is((select count(*)from jsonb_array_elements(internal.list_current_native_results_scoped(100,null,'20000000-0000-4000-8000-000000000012')->'items')item where item->>'assessmentId'='99520000-0000-4000-8000-000000000001'),1::bigint,'DATA01 current report contains one latest submission result per assessment');
select is((select count(*)from app.academic_evidence where source_object_id in(select source_id from academic_customer_ids union all select replacement_id from academic_customer_ids)),2::bigint,'DATA01 both immutable source evidence revisions remain reconstructable');

-- Independently generate a proposal, then correct a contributing source before human approval.
reset role;
insert into app.intelligence_policies(school_id,version,fixture_enabled,approved_by)
values('10000000-0000-4000-8000-000000000001',1,true,'20000000-0000-4000-8000-000000000002')on conflict(school_id)do update set fixture_enabled=true,version=1,data_classification='SCHOOL_CUSTOM_NUMERIC',allowed_actions=array['GUIDED_PRACTICE','REVIEW_FEEDBACK']::text[];
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
update academic_customer_ids set source_id=internal.create_learning_submission('99520000-0000-4000-8000-000000000002','Baseline source'),replacement_id=internal.create_learning_submission('99520000-0000-4000-8000-000000000003','Contributing source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update academic_customer_ids set baseline_id=internal.release_marking(internal.mark_submission(source_id,2,'Human reviewed baseline',2,0,true),1,false),secondary_id=internal.release_marking(internal.mark_submission(replacement_id,3,'Human reviewed contribution',2,0,true),1,false);
do $$declare reservation jsonb;context jsonb;proposal jsonb;begin
 reservation:=internal.begin_teacher_insight_run('customer-stale-insight',repeat('a',64),(select baseline_id from academic_customer_ids),'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":1,"timeoutMs":10000,"maxTokens":1000,"maxCost":1}','customer-stale-insight');
 context:=(reservation->'context')-'insight';
 proposal:=internal.complete_intelligence_run((reservation->>'runId')::uuid,(reservation->>'leaseToken')::uuid,jsonb_build_object('evidenceIds',jsonb_build_array(context->'evidenceId'),'facts',jsonb_build_array(context||'{"kind":"NUMERIC_RESULT"}'::jsonb),'action','GUIDED_PRACTICE','reason','REVIEW_RECORDED_RESULT','limitation','SINGLE_RESULT_NOT_CAUSAL'),'{"outputTokens":0,"cost":0,"latencyMs":1}','customer-stale-insight');
 update academic_customer_ids set proposal_id=(proposal->>'id')::uuid,run_id=(reservation->>'runId')::uuid;
end$$;
select internal.release_marking(internal.mark_submission((select replacement_id from academic_customer_ids),4,'Correction after proposal',2,1,true),2,false) is not null as source_corrected;
select throws_ok($$select internal.read_teacher_insight_context((select run_id from academic_customer_ids))$$,'42501',null,'AI01 saved context refuses superseded contributing source');
select throws_ok($$select internal.decide_recommendation((select proposal_id from academic_customer_ids),'APPROVE','Human attempts approval after source correction',null,null)$$,'42501',null,'AI01 proposal approval reauthorizes every stored source');
select is((select count(*)from app.interventions where recommendation_id=(select proposal_id from academic_customer_ids)),0::bigint,'AI01 stale generated proposal creates no intervention');
select*from finish();
rollback;
