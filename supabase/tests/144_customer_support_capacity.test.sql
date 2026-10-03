-- Accumulated support history must not prevent later approved interventions from processing.
begin;
create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api,cuevo_worker;set local search_path=extensions,pg_catalog;select no_plan();
create temporary table support_capacity(last_recommendation uuid,event_id uuid,lease uuid);grant select,insert,update on support_capacity to cuevo_api,cuevo_worker;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','99810000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer support capacity','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)values('10000000-0000-4000-8000-000000000001','99820000-0000-4000-8000-000000000001','99810000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Support baseline','Synthetic',10,'61000000-0000-4000-8000-000000000001');
insert into app.submissions(school_id,id,assessment_id,learner_id,content)values('10000000-0000-4000-8000-000000000001','99830000-0000-4000-8000-000000000001','99820000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012','Synthetic evidence');
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
do $$declare baseline uuid;proposal uuid;n integer;event uuid;begin
 baseline:=internal.release_marking(internal.mark_submission('99830000-0000-4000-8000-000000000001',2,'Human reviewed',1,0,true),1,false);
 for n in 1..101 loop
  proposal:=internal.create_recommendation(baseline,'{"observation":"Recorded source","interpretation":"Teacher-selected support","recommendation":"Review school example","rationale":"Source evidence","uncertainty":"No causal claim","activityTitle":"Approved school practice","instructions":"Review school example"}');
  perform internal.decide_recommendation(proposal,'APPROVE','Teacher reviewed',null,null);
  event:=internal.enqueue_event('recommendation.approved','recommendation',proposal,1,'{}','customer-support-capacity-'||n);
  if n=101 then insert into support_capacity(last_recommendation,event_id,lease)values(proposal,event,gen_random_uuid());end if;
 end loop;
end$$;
reset role;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from support_capacity),lease_until=clock_timestamp()+interval '30 seconds'where id=(select event_id from support_capacity);
set local role cuevo_worker;
select lives_ok($$select internal.process_learner_event((select event_id from support_capacity),(select lease from support_capacity))$$,'REL01 101 prior interventions do not poison a newly approved source');
reset role;
select is((select state from internal.outbox_events where id=(select event_id from support_capacity)),'COMPLETED','REL01 bounded support source is acknowledged');
select*from finish();rollback;
