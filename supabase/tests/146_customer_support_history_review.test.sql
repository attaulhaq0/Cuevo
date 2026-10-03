begin;
create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
create temporary table support_history(submission uuid,baseline uuid,intervention uuid);grant select,insert,update on support_history to cuevo_api;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','99940000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer historical support','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)values('10000000-0000-4000-8000-000000000001','99950000-0000-4000-8000-000000000001','99940000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Historical baseline','Synthetic',10,'61000000-0000-4000-8000-000000000001');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
insert into support_history(submission)values(internal.create_learning_submission('99950000-0000-4000-8000-000000000001','School source'));
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
do $$declare proposal uuid;begin
 update support_history set baseline=internal.release_marking(internal.mark_submission(submission,2,'Reviewed baseline',1,0,true),1,false);
 proposal:=internal.create_recommendation((select baseline from support_history),'{"observation":"Recorded source","interpretation":"Teacher-selected support","recommendation":"Practice","rationale":"Evidence","uncertainty":"Not causal","activityTitle":"Teacher practice","instructions":"Review school example"}');perform internal.decide_recommendation(proposal,'APPROVE','Human reviewed',null,null);update support_history set intervention=(select id from app.interventions where recommendation_id=proposal);
end$$;
select internal.release_marking(internal.mark_submission((select submission from support_history),6,'Corrected baseline',1,1,true),2,false)is not null as corrected;
select is((select count(*)from app.interventions where id=(select intervention from support_history)),1::bigint,'DATA03 authorized staff retain previously approved support history after correction');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select is((select count(*)from app.interventions where id=(select intervention from support_history)),1::bigint,'DATA03 learner retains own historical support requiring review');
select throws_ok($$select internal.complete_intervention((select intervention from support_history),'Attempt stale support completion')$$,'42501',null,'DATA03 source-changed support cannot be completed as a current action');
select*from finish();rollback;
