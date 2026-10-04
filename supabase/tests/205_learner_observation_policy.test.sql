-- Rollback-only explicit policy/source recovery; no provider or network operations.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
select internal.configure_worker_dispatch(false,null,null,false);
create temporary table observation_fixture(school uuid,year_id uuid,group_id uuid,class_id uuid,subject_id uuid,course_id uuid,unit_id uuid,lesson_id uuid,activity_id uuid,completion_id uuid,original_event uuid,policy_id uuid,refresh_event uuid,recovery_event uuid,lease uuid);
insert into observation_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,null,gen_random_uuid());
grant select,update on observation_fixture to cuevo_api,cuevo_worker;
insert into app.schools(id,name,country_code)select school,'Observation policy school','QA'from observation_fixture;
insert into app.memberships(school_id,actor_id,role,effective_from)select school,actor,role,now()-interval'1 day'from observation_fixture cross join(values('20000000-0000-4000-8000-000000000001'::uuid,'admin'),('20000000-0000-4000-8000-000000000004'::uuid,'teacher'),('20000000-0000-4000-8000-000000000012'::uuid,'student'))actors(actor,role);
insert into app.people(school_id,actor_id,display_name,synthetic)select school_id,actor_id,role||' observation participant',true from app.memberships where school_id=(select school from observation_fixture);
insert into app.entitlements(school_id,code,enabled,effective_from)select school,code,true,now()-interval'1 day'from observation_fixture cross join unnest(array['school.context','learner.state','learning','assessment'])code;
insert into app.academic_years(school_id,id,name,starts_on,ends_on)select school,year_id,'Reviewed year',date'2026-01-01',date'2027-12-31'from observation_fixture;
insert into app.year_groups(school_id,id,name,ordinal)select school,group_id,'Reviewed group',8 from observation_fixture;
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)select school,class_id,year_id,group_id,'Reviewed class'from observation_fixture;
insert into app.subjects(school_id,id,name)select school,subject_id,'School authored subject'from observation_fixture;
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)select school,class_id,'20000000-0000-4000-8000-000000000012',now()-interval'1 day'from observation_fixture;
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)select school,class_id,subject_id,'20000000-0000-4000-8000-000000000004',now()-interval'1 day'from observation_fixture;
insert into app.courses(school_id,id,class_id,subject_id,title,description,created_by,status)select school,course_id,class_id,subject_id,'Reviewed course','Explicit synthetic school-authored observation fixture','20000000-0000-4000-8000-000000000004','PUBLISHED'from observation_fixture;
insert into app.units(school_id,id,course_id,title,sequence)select school,unit_id,course_id,'Reviewed unit',1 from observation_fixture;
insert into app.lessons(school_id,id,unit_id,title,sequence,body)select school,lesson_id,unit_id,'Reviewed lesson',1,'School authored example'from observation_fixture;
insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)select school,activity_id,lesson_id,'Reviewed practice','practice','Explain a check',1 from observation_fixture;
insert into app.activity_completions(school_id,id,activity_id,learner_id)select school,completion_id,activity_id,'20000000-0000-4000-8000-000000000012'from observation_fixture;
insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,attempt_count,max_attempts,last_error_code)select original_event,school,'20000000-0000-4000-8000-000000000012','activity.complete','activity',completion_id,1,'{}','original-missing-policy','FAILED',5,5,'PROCESSING_REQUIRES_REVIEW'from observation_fixture;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true),set_config('app.school_id',(select school::text from observation_fixture),true);
set local role cuevo_api;
select is(internal.read_learner_observation_policy()->>'status','UNCONFIGURED','cold school policy remains unconfigured');
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":null,"expectedVersion":0,"reason":"Review","confirmApproval":true}','invalid-policy-key',repeat('a',64),'policy-fixture')$$,'22023',null,'null days cannot fall through SQL validation');
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":"14","expectedVersion":0,"reason":"Review","confirmApproval":true}','invalid-policy-key',repeat('a',64),'policy-fixture')$$,'22023',null,'string days cannot replace numeric approval');
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":14,"expectedVersion":null,"reason":"Review","confirmApproval":true}','invalid-policy-key',repeat('a',64),'policy-fixture')$$,'22023',null,'null version cannot fall through validation');
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":366,"expectedVersion":0,"reason":"Review","confirmApproval":true}','invalid-policy-key',repeat('a',64),'policy-fixture')$$,'22023',null,'out-of-bound window denied');
update observation_fixture set policy_id=(internal.approve_learner_observation_policy('{"developmentWindowDays":14,"expectedVersion":0,"reason":"Reviewed school observation window","confirmApproval":true}','reviewed-policy-key',repeat('b',64),'policy-fixture')->>'id')::uuid;
select is(internal.read_learner_observation_policy()->>'status','CONFIGURED','explicit admin approval configures cold school');
select is(internal.approve_learner_observation_policy('{"developmentWindowDays":14,"expectedVersion":0,"reason":"Reviewed school observation window","confirmApproval":true}','reviewed-policy-key',repeat('b',64),'policy-fixture')->>'status','APPROVED','original current policy key reconciles');
select throws_ok($$select*from internal.learner_observation_policy_revisions$$,'42501',null,'API has no raw approval history access');
reset role;
select is((select count(*)from internal.learner_observation_policy_revisions where school_id=(select school from observation_fixture)),1::bigint,'one immutable approval');
select is((select count(*)from internal.audit_events where school_id=(select school from observation_fixture)and action='learner.observation_policy.approved'),1::bigint,'one canonical approval audit');
select throws_ok($$update app.learner_state_policies set development_window_days=21 where school_id=(select school from observation_fixture)$$,'22023',null,'current policy cannot contradict its immutable approval');
select throws_ok($$update internal.learner_observation_policy_revisions set development_window_days=30 where id=(select policy_id from observation_fixture)$$,'55000',null,'approval history cannot be edited');
update observation_fixture set refresh_event=(select event_id from internal.learner_observation_refresh_sources where policy_id=(select policy_id from observation_fixture)and kind='PAGE');

-- Fixed delivery identity is checked before both normal processing and superseded acknowledgement.
savepoint forged_policy_key;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',deduplication_key='forged-policy-key'where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))$$,'42501',null,'forged approval delivery key cannot be acknowledged');
reset role;
select is((select count(*)from internal.processed_events where event_id=(select refresh_event from observation_fixture)),0::bigint,'forged key leaves no processed receipt');
rollback to savepoint forged_policy_key;
release savepoint forged_policy_key;

update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds'where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select is(internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))->>'status','PLANNED','policy approval creates bounded exact learner refresh');
reset role;
update observation_fixture set refresh_event=(select event_id from internal.learner_observation_refresh_sources where policy_id=(select policy_id from observation_fixture)and kind='LEARNER');
savepoint forged_learner_key;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',deduplication_key='forged-learner-key'where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))$$,'42501',null,'forged learner refresh key cannot schedule recovery');
reset role;
select is((select count(*)from internal.learner_observation_recovery_sources where school_id=(select school from observation_fixture)),0::bigint,'invalid learner key creates no recovery source');
rollback to savepoint forged_learner_key;
release savepoint forged_learner_key;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=1 where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select is(internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))->>'status','WAITING','missing original sources create durable recovery before refresh');
reset role;
select is((select state from internal.outbox_events where id=(select original_event from observation_fixture)),'FAILED','original failure history preserved');
select is((select attempt_count from internal.outbox_events where id=(select original_event from observation_fixture)),5,'original attempts preserved');
update observation_fixture set recovery_event=(select event_id from internal.learner_observation_recovery_sources where original_event_id=(select original_event from observation_fixture));
select ok((select recovery_event is not null from observation_fixture),'one exact original recovery delivery exists');

savepoint exhausted_wait_receipt;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=10 where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select is(internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))->>'status','REQUIRES_REVIEW','exhausted waiting source returns terminal review instead of pending receipt');
reset role;
select is((select state from internal.outbox_events where id=(select refresh_event from observation_fixture)),'FAILED','exhausted wait stays failed without attempt reset');
rollback to savepoint exhausted_wait_receipt;
release savepoint exhausted_wait_receipt;

savepoint failed_recovery_child;
update internal.outbox_events set state='FAILED',lease_token=null,lease_until=null,last_error_code='PROCESSING_REQUIRES_REVIEW'where id=(select recovery_event from observation_fixture);
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=2 where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select is(internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))->>'status','REQUIRES_REVIEW','terminal failed child produces review rather than perpetual waiting');
reset role;
select is((select state from internal.outbox_events where id=(select refresh_event from observation_fixture)),'FAILED','review-required parent source is terminal');
select is((select count(*)from internal.processed_events where event_id=(select refresh_event from observation_fixture)),0::bigint,'review-required refresh is not a completed receipt');
rollback to savepoint failed_recovery_child;
release savepoint failed_recovery_child;

savepoint withdrawn_recovery_learner;
update app.enrollments set status='revoked'where school_id=(select school from observation_fixture)and student_actor_id='20000000-0000-4000-8000-000000000012';
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=1 where id=(select recovery_event from observation_fixture);
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event((select recovery_event from observation_fixture),(select lease from observation_fixture))$$,'42501',null,'withdrawn current course enrollment cannot recover an old source');
reset role;
select is((select count(*)from app.habit_observations where school_id=(select school from observation_fixture)),0::bigint,'withdrawn recovery creates no observation');
rollback to savepoint withdrawn_recovery_learner;
release savepoint withdrawn_recovery_learner;

update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=1 where id=(select recovery_event from observation_fixture);
select set_config('app.actor_id','',true),set_config('app.school_id','',true);
set local role cuevo_worker;
select is(internal.process_learner_event((select recovery_event from observation_fixture),(select lease from observation_fixture))->>'status','PROCESSED','exact clone uses the canonical processor to create real observation');
reset role;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true),set_config('app.school_id',(select school::text from observation_fixture),true);
select is((select count(*)from app.habit_observations where school_id=(select school from observation_fixture)and source_object_id=(select completion_id from observation_fixture)),1::bigint,'one actual source observation after recovery');
select is((select count(*)from internal.processed_events where event_id=(select original_event from observation_fixture)),0::bigint,'original FAILED event not falsely marked processed');
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from observation_fixture),lease_until=clock_timestamp()+interval'30 seconds',attempt_count=2 where id=(select refresh_event from observation_fixture);
set local role cuevo_worker;
select is(internal.process_learner_event((select refresh_event from observation_fixture),(select lease from observation_fixture))->>'status','REFRESHED','real source-backed learner refresh confirms current policy');
reset role;
select is((select observation_policy_version from app.learner_state_snapshots where school_id=(select school from observation_fixture)and learner_id='20000000-0000-4000-8000-000000000012'),1,'snapshot stamps actual applied policy version');
set local role cuevo_api;
select is((internal.read_current_learner_projection('20000000-0000-4000-8000-000000000012')->'development'->'practice'->>'count'),'1','current read receives recovered factual practice');
select lives_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":30,"expectedVersion":1,"reason":"Reviewed wider observation window","confirmApproval":true}','new-policy-key',repeat('c',64),'policy-fixture')$$,'new explicit window approval succeeds');
select is((internal.read_current_learner_projection('20000000-0000-4000-8000-000000000012')->'development'->'practice'->'count'),'null'::jsonb,'old policy snapshot counts become unknown until current refresh');
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":14,"expectedVersion":0,"reason":"Reviewed school observation window","confirmApproval":true}','reviewed-policy-key',repeat('b',64),'policy-fixture')$$,'22023',null,'old approved key cannot resurrect superseded policy');
reset role;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
set local role cuevo_api;
select throws_ok($$select internal.approve_learner_observation_policy('{"developmentWindowDays":14,"expectedVersion":2,"reason":"Review","confirmApproval":true}','teacher-key',repeat('a',64),'policy-fixture')$$,'42501',null,'teacher cannot approve school policy');
reset role;
-- No snapshot is a truthful no-source outcome; it must not manufacture a zero-count learner.
create temporary table observation_boundary(kind text primary key,event_id uuid,learner_id uuid,lease_token uuid);
grant select,insert,update on observation_boundary to cuevo_worker;
insert into observation_boundary values('NO_SOURCE',gen_random_uuid(),'20000000-0000-4000-8000-000000000013',gen_random_uuid());
insert into app.memberships(school_id,actor_id,role,effective_from)select school,learner_id,'student',now()-interval'1 day'from observation_fixture cross join observation_boundary where kind='NO_SOURCE';
insert into app.people(school_id,actor_id,display_name,synthetic)select school,learner_id,'No factual work learner',true from observation_fixture cross join observation_boundary where kind='NO_SOURCE';
insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until)
select boundary.event_id,fixture.school,'20000000-0000-4000-8000-000000000001','learner.observation_policy.refresh','learner',boundary.learner_id,1,jsonb_build_object('policyVersion',revision.version),'observation-refresh:'||revision.id::text||':'||boundary.learner_id::text,'PROCESSING',boundary.lease_token,clock_timestamp()+interval'30 seconds'
from observation_fixture fixture join app.learner_state_policies current_policy on current_policy.school_id=fixture.school join internal.learner_observation_policy_revisions revision on revision.id=current_policy.approval_id cross join observation_boundary boundary where boundary.kind='NO_SOURCE';
insert into internal.learner_observation_refresh_sources(event_id,school_id,policy_id,kind,learner_id)select boundary.event_id,fixture.school,current_policy.approval_id,'LEARNER',boundary.learner_id from observation_fixture fixture join app.learner_state_policies current_policy on current_policy.school_id=fixture.school cross join observation_boundary boundary where boundary.kind='NO_SOURCE';
set local role cuevo_worker;
select is(internal.process_learner_event((select event_id from observation_boundary where kind='NO_SOURCE'),(select lease_token from observation_boundary where kind='NO_SOURCE'))->>'status','NO_SOURCE','learner without factual snapshot receives no-source receipt');
reset role;
select is((select count(*)from app.learner_state_snapshots where school_id=(select school from observation_fixture)and learner_id=(select learner_id from observation_boundary where kind='NO_SOURCE')),0::bigint,'no-source refresh creates no snapshot or observation count');

-- A real policy version becomes superseded: its source is acknowledged without creating refreshes.
insert into observation_boundary values('SUPERSEDED',gen_random_uuid(),null,gen_random_uuid());
insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until)
select boundary.event_id,fixture.school,'20000000-0000-4000-8000-000000000001','learner.observation_policy.refresh_page','learner_observation_policy',fixture.policy_id,1,jsonb_build_object('policyVersion',1),'observation-page:'||fixture.policy_id::text||':ffffffff-ffff-4fff-8fff-ffffffffffff','PROCESSING',boundary.lease_token,clock_timestamp()+interval'30 seconds'from observation_fixture fixture cross join observation_boundary boundary where boundary.kind='SUPERSEDED';
insert into internal.learner_observation_refresh_sources(event_id,school_id,policy_id,kind,cursor_id)select boundary.event_id,fixture.school,fixture.policy_id,'PAGE','ffffffff-ffff-4fff-8fff-ffffffffffff'from observation_fixture fixture cross join observation_boundary boundary where boundary.kind='SUPERSEDED';
savepoint forged_superseded_page;
update internal.outbox_events set deduplication_key='forged-superseded-page'where id=(select event_id from observation_boundary where kind='SUPERSEDED');
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event((select event_id from observation_boundary where kind='SUPERSEDED'),(select lease_token from observation_boundary where kind='SUPERSEDED'))$$,'42501',null,'superseded source cannot bypass fixed page-key validation');
reset role;
rollback to savepoint forged_superseded_page;
release savepoint forged_superseded_page;
set local role cuevo_worker;
select is(internal.process_learner_event((select event_id from observation_boundary where kind='SUPERSEDED'),(select lease_token from observation_boundary where kind='SUPERSEDED'))->>'status','SUPERSEDED','valid superseded page is acknowledged without new facts');
reset role;
select is((select count(*)from internal.learner_observation_refresh_sources where policy_id=(select policy_id from observation_fixture)and kind='LEARNER'),1::bigint,'superseded page does not add learner refreshes');

-- A policy page plans ten learners, then one monotonic continuation for the eleventh.
create temporary table observation_volume(learner_id uuid primary key,completion_id uuid,event_id uuid);
create temporary table observation_volume_before(event_id uuid primary key);
insert into observation_volume_before select event_id from internal.learner_observation_refresh_sources where school_id=(select school from observation_fixture)and policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and kind='LEARNER';
insert into observation_volume select gen_random_uuid(),gen_random_uuid(),gen_random_uuid()from generate_series(1,10);
insert into app.memberships(school_id,actor_id,role,effective_from)select fixture.school,volume.learner_id,'student',now()-interval'1 day'from observation_fixture fixture cross join observation_volume volume;
insert into app.people(school_id,actor_id,display_name,synthetic)select fixture.school,volume.learner_id,'Policy page learner',true from observation_fixture fixture cross join observation_volume volume;
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)select fixture.school,fixture.class_id,volume.learner_id,now()-interval'1 day'from observation_fixture fixture cross join observation_volume volume;
insert into app.activity_completions(school_id,id,activity_id,learner_id)select fixture.school,volume.completion_id,fixture.activity_id,volume.learner_id from observation_fixture fixture cross join observation_volume volume;
insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,attempt_count,max_attempts,last_error_code)
select volume.event_id,fixture.school,volume.learner_id,'activity.complete','activity',volume.completion_id,1,'{}','policy-volume:'||volume.event_id::text,'FAILED',5,5,'PROCESSING_REQUIRES_REVIEW'from observation_fixture fixture cross join observation_volume volume;
insert into observation_boundary values('VOLUME_PAGE',(select event_id from internal.learner_observation_refresh_sources where school_id=(select school from observation_fixture)and policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and kind='PAGE'and cursor_id is null),null,gen_random_uuid());
update internal.outbox_events set state='PROCESSING',lease_token=(select lease_token from observation_boundary where kind='VOLUME_PAGE'),lease_until=clock_timestamp()+interval'30 seconds'where id=(select event_id from observation_boundary where kind='VOLUME_PAGE');
set local role cuevo_worker;
select is(internal.process_learner_event((select event_id from observation_boundary where kind='VOLUME_PAGE'),(select lease_token from observation_boundary where kind='VOLUME_PAGE'))->>'status','PLANNED','first page plans at most ten exact learner refreshes');
reset role;
select is((select count(*)from internal.learner_observation_refresh_sources source where source.school_id=(select school from observation_fixture)and source.policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and source.kind='LEARNER'and not exists(select 1 from observation_volume_before before_page where before_page.event_id=source.event_id)),10::bigint,'first page adds ten learner delivery sources without counting earlier no-source boundary');
select is((select count(*)from internal.learner_observation_refresh_sources where school_id=(select school from observation_fixture)and policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and kind='PAGE'and cursor_id is not null),1::bigint,'eleventh candidate creates one continuation');
insert into observation_boundary values('VOLUME_NEXT',(select event_id from internal.learner_observation_refresh_sources where school_id=(select school from observation_fixture)and policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and kind='PAGE'and cursor_id is not null),null,gen_random_uuid());
savepoint forged_volume_cursor_key;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease_token from observation_boundary where kind='VOLUME_NEXT'),lease_until=clock_timestamp()+interval'30 seconds',deduplication_key='forged-volume-page'where id=(select event_id from observation_boundary where kind='VOLUME_NEXT');
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event((select event_id from observation_boundary where kind='VOLUME_NEXT'),(select lease_token from observation_boundary where kind='VOLUME_NEXT'))$$,'42501',null,'continuation validates fixed original cursor delivery key');
reset role;
rollback to savepoint forged_volume_cursor_key;
release savepoint forged_volume_cursor_key;
update internal.outbox_events set state='PROCESSING',lease_token=(select lease_token from observation_boundary where kind='VOLUME_NEXT'),lease_until=clock_timestamp()+interval'30 seconds'where id=(select event_id from observation_boundary where kind='VOLUME_NEXT');
set local role cuevo_worker;
select is(internal.process_learner_event((select event_id from observation_boundary where kind='VOLUME_NEXT'),(select lease_token from observation_boundary where kind='VOLUME_NEXT'))->>'status','PLANNED','second page plans the final source without repeating earlier learners');
reset role;
select is((select count(*)from internal.learner_observation_refresh_sources source where source.school_id=(select school from observation_fixture)and source.policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and source.kind='LEARNER'and not exists(select 1 from observation_volume_before before_page where before_page.event_id=source.event_id)),11::bigint,'all eleven current-source learners get one newly planned delivery each');
select is((select count(distinct source.learner_id)from internal.learner_observation_refresh_sources source where source.school_id=(select school from observation_fixture)and source.policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and source.kind='LEARNER'and not exists(select 1 from observation_volume_before before_page where before_page.event_id=source.event_id)),11::bigint,'pagination creates no duplicate learner delivery');
select is((select count(*)from internal.learner_observation_refresh_sources where school_id=(select school from observation_fixture)and policy_id=(select approval_id from app.learner_state_policies where school_id=(select school from observation_fixture))and kind='PAGE'and cursor_id is not null),1::bigint,'terminal second page creates no empty continuation');

-- Every private helper and new raw table is denied independently to every runtime/Data API role.
select ok(not has_function_privilege(role_name,signature,'EXECUTE'),role_name||' cannot execute private '||signature)
from unnest(array['anon','authenticated','service_role','cuevo_api','cuevo_worker'])role_name cross join unnest(array['internal.current_learner_observation_policy(uuid)','internal.learner_observation_event_source(internal.outbox_events)','internal.process_learner_observation_policy_event(uuid,uuid)','internal.process_before_learner_observation_policy(uuid,uuid)','internal.record_legacy_learner_observation_policy()','internal.guard_learner_observation_policy()','internal.refresh_revision_habit_before_observation_policy(uuid,uuid)','internal.refresh_revision_habit(uuid,uuid)'])signature;
select ok(not has_table_privilege(role_name,table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),role_name||' cannot access raw '||table_name)
from unnest(array['anon','authenticated','service_role','cuevo_api','cuevo_worker'])role_name cross join unnest(array['internal.learner_observation_policy_revisions','internal.learner_observation_refresh_sources','internal.learner_observation_recovery_sources','app.learner_state_policies'])table_name;

select *from finish();rollback;
