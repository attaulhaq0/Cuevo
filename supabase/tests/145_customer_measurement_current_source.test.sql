begin;
create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
create temporary table measure_sources(baseline uuid,intervention uuid,followup uuid,followup_submission uuid);grant select,insert,update on measure_sources to cuevo_api;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','99910000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer measurement source','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)
select'10000000-0000-4000-8000-000000000001',('99920000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99910000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Measurement source '||n,'Synthetic',10,'61000000-0000-4000-8000-000000000001'from generate_series(1,2)n;
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
insert into measure_sources(followup_submission)values(internal.create_learning_submission('99920000-0000-4000-8000-000000000001','Baseline synthetic source'));
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
do $$declare baseline_result uuid;proposal uuid;begin
 baseline_result:=internal.release_marking(internal.mark_submission((select followup_submission from measure_sources),2,'Human reviewed',1,0,true),1,false);
 proposal:=internal.create_recommendation(baseline_result,'{"observation":"Recorded baseline","interpretation":"One source","recommendation":"Try school practice","rationale":"Evidence","uncertainty":"Not causal","activityTitle":"Approved school practice","instructions":"Review school example"}');
 perform internal.decide_recommendation(proposal,'APPROVE','Human reviewed',null,null);update measure_sources set baseline=baseline_result,intervention=(select id from app.interventions where recommendation_id=proposal);
end$$;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select internal.complete_intervention((select intervention from measure_sources),'Learner completed school practice')is not null as completed;
update measure_sources set followup_submission=internal.create_learning_submission('99920000-0000-4000-8000-000000000002','Follow-up source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select internal.link_reassessment((select intervention from measure_sources),'99920000-0000-4000-8000-000000000002')is not null as linked;
update measure_sources set followup=internal.release_marking(internal.mark_submission(followup_submission,7,'Human reviewed follow-up',1,0,true),1,false);
select internal.release_marking(internal.mark_submission((select followup_submission from measure_sources),3,'Corrected follow-up',1,1,true),2,false)is not null as corrected;
select throws_ok($$select internal.measure_intervention((select intervention from measure_sources),(select followup from measure_sources),1)$$,'22023',null,'DATA01 superseded follow-up result cannot create a new outcome measurement');
select is((select count(*)from app.outcome_measurements where intervention_id=(select intervention from measure_sources)),0::bigint,'stale follow-up creates no authoritative outcome');
select*from finish();rollback;
