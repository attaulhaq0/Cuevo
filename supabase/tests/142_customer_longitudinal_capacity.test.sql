-- Normal accumulated history must not permanently poison new source processing.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
create temporary table capacity_events(kind text primary key,event_id uuid,lease uuid);
grant select,insert,update on capacity_events to cuevo_api,cuevo_worker;
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)
values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000060',now()-interval '1 day'),('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000061',now()-interval '1 day')on conflict(school_id,class_id,student_actor_id)do update set status='active',effective_from=excluded.effective_from,effective_to=null;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)
values('10000000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer accumulated course','Synthetic','PUBLISHED');
insert into app.units(school_id,id,course_id,title,sequence)values('10000000-0000-4000-8000-000000000001','99620000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000001','Unit',1);
insert into app.lessons(school_id,id,unit_id,title,sequence,body)values('10000000-0000-4000-8000-000000000001','99630000-0000-4000-8000-000000000001','99620000-0000-4000-8000-000000000001','Lesson',1,'Synthetic');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id,policy_version)
select'10000000-0000-4000-8000-000000000001',('99640000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99610000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Ordinary assessment '||n,'Teacher authored',10,'61000000-0000-4000-8000-000000000001',2 from generate_series(1,101)n;
insert into app.submissions(school_id,id,assessment_id,learner_id,content)
select'10000000-0000-4000-8000-000000000001',('99650000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('99640000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000060','Synthetic source'from generate_series(1,101)n;
set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
do $$declare n integer;result uuid;event uuid;begin
 for n in 1..101 loop
  result:=internal.release_marking(internal.mark_submission(('99650000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,6,'Human reviewed',2,0,true),1,false);
  event:=internal.enqueue_event('result.released','result',result,1,'{}','customer-capacity-result-'||n);
  if n=101 then insert into capacity_events(kind,event_id,lease)values('result',event,gen_random_uuid());end if;
 end loop;
end$$;
reset role;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from capacity_events where kind='result'),lease_until=clock_timestamp()+interval '30 seconds'where id=(select event_id from capacity_events where kind='result');
set local role cuevo_worker;
select lives_ok($$select internal.process_learner_event((select event_id from capacity_events where kind='result'),(select lease from capacity_events where kind='result'))$$,'REL01 101 ordinary assessment sources do not poison new learner processing');
reset role;
select is((select state from internal.outbox_events where id=(select event_id from capacity_events where kind='result')),'COMPLETED','REL01 oversized history source receives a committed worker acknowledgement');

-- More than 1000 past events outside the current habit window are ordinary longitudinal history.
insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)
select'10000000-0000-4000-8000-000000000001',('99660000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99630000-0000-4000-8000-000000000001','Recorded reading '||n,'reading','Synthetic',n from generate_series(1,1001)n;
insert into app.activity_completions(school_id,id,activity_id,learner_id,completed_at)
select'10000000-0000-4000-8000-000000000001',('99670000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('99660000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000061',case when n=1001 then clock_timestamp()else clock_timestamp()-interval '30 days'end from generate_series(1,1001)n;
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at,lease_token,lease_until)
select'10000000-0000-4000-8000-000000000001',('99680000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000061','activity.complete','activity',('99670000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,'{}','customer-capacity-completion-'||n,case when n=1001 then'PROCESSING'else'COMPLETED'end,case when n=1001 then null else clock_timestamp()-interval '30 days'end,case when n=1001 then'99690000-0000-4000-8000-000000000001'::uuid else null end,case when n=1001 then clock_timestamp()+interval '30 seconds'else null end from generate_series(1,1001)n;
insert into internal.processed_events(event_id,school_id,source_type,source_id)
select('99680000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','COMPLETION',('99670000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,1000)n;
set local role cuevo_worker;
select lives_ok($$select internal.process_learner_event('99680000-0000-4000-8000-000000001001','99690000-0000-4000-8000-000000000001')$$,'REL01 1001 lifetime source events do not poison a new current action');
reset role;
select is((select state from internal.outbox_events where id='99680000-0000-4000-8000-000000001001'),'COMPLETED','REL01 long-history action receives a committed worker acknowledgement');
select*from finish();
rollback;
