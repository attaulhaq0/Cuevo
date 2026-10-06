-- Rollback-only School selection context. No Auth, provider, capture or runtime operation.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select no_plan();
create temporary table selection_fixture(school uuid,year_one uuid,year_two uuid,group_one uuid,class_one uuid,class_two uuid,subject uuid);
insert into selection_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on selection_fixture to cuevo_api;
insert into app.schools(id,name,country_code)select school,'School selection fixture','QA'from selection_fixture;
insert into app.entitlements(school_id,code,enabled)select school,code,true from selection_fixture cross join unnest(array['school.context','school.operations'])code;
insert into app.memberships(school_id,actor_id,role)select school,actor,role from selection_fixture cross join(values
 ('20000000-0000-4000-8000-000000000001'::uuid,'admin'),('20000000-0000-4000-8000-000000000004'::uuid,'teacher'),
 ('20000000-0000-4000-8000-000000000012'::uuid,'student'),('20000000-0000-4000-8000-000000000013'::uuid,'student'),('20000000-0000-4000-8000-000000000014'::uuid,'student'))actors(actor,role);
insert into app.people(school_id,actor_id,display_name,synthetic)select school_id,actor_id,case actor_id when'20000000-0000-4000-8000-000000000001'then'Fixture administrator'when'20000000-0000-4000-8000-000000000004'then'Fixture teacher'when'20000000-0000-4000-8000-000000000014'then'Unique new learner'else'Same learner name'end,true from app.memberships where school_id=(select school from selection_fixture);
insert into app.academic_years(school_id,id,name,starts_on,ends_on)select school,year_one,'School year',date'2026-09-01',date'2027-06-30'from selection_fixture union all select school,year_two,'School year',date'2027-09-01',date'2028-06-30'from selection_fixture;
insert into app.year_groups(school_id,id,name,ordinal)select school,group_one,'Year 8',8 from selection_fixture;
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)select school,class_one,year_one,group_one,'Cedar'from selection_fixture union all select school,class_two,year_one,group_one,'Palm'from selection_fixture;
insert into app.subjects(school_id,id,name)select school,subject,'Checking'from selection_fixture;
insert into app.enrollments(school_id,class_id,student_actor_id)select school,class_one,'20000000-0000-4000-8000-000000000012'::uuid from selection_fixture union all select school,class_two,'20000000-0000-4000-8000-000000000013'::uuid from selection_fixture;
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id)select school,class_one,subject,'20000000-0000-4000-8000-000000000004'from selection_fixture;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true),set_config('app.school_id',(select school::text from selection_fixture),true);
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000012')->>'status','READY','same name in different class is distinguishable');
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000014')->>'enrollmentState','NONE','unique new learner has confirmed no enrollment');
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000014')->>'status','READY','unique NONE learner remains selectable');
select is((internal.named_school_page('years','{"limit":1}'::jsonb)->'items'->0->>'selectionStatus'),'READY','saved year dates distinguish same-name years before page limit');
select is((internal.named_school_page('classes','{"limit":100}'::jsonb)->'items'->0->>'academicYearName'),'School year','class has owner projected year context');
select ok(not has_function_privilege('cuevo_api','internal.school_person_selection_context(uuid,uuid)','EXECUTE'),'API cannot invoke owner-only identity helper');
select ok(not has_function_privilege('cuevo_worker','internal.read_school_selection_page(text,jsonb)','EXECUTE'),'worker cannot invoke private selection page');
select ok(has_function_privilege('cuevo_api','internal.named_school_page(text,jsonb)','EXECUTE'),'existing authorized read entry remains granted');

set local role cuevo_api;
select lives_ok($$select internal.named_school_page('people','{"limit":1}'::jsonb)$$,'restricted role can read strict current selection page');
select throws_ok($$select internal.school_person_selection_context('20000000-0000-4000-8000-000000000012')$$,'42501',null,'private helper denies restricted caller');
select lives_ok($$select internal.school_command('enrollment.configure',null,jsonb_build_object('classId',(select class_one from selection_fixture),'studentId','20000000-0000-4000-8000-000000000014','status','active','effectiveFrom',now()-interval'1 day','effectiveTo',null,'expectedRevision',0,'confirmAccessChange',true),'unique-none-enrollment',repeat('a',64),'selection-fixture')$$,'unique NONE learner can be enrolled through existing command');
reset role;
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000014')->>'enrollmentState','CURRENT','confirmed enrollment becomes current context');

-- Make identical source captions; the comparison must run before cursor/limit.
insert into app.enrollments(school_id,class_id,student_actor_id)select school,class_one,'20000000-0000-4000-8000-000000000013'from selection_fixture;
update app.enrollments set status='revoked'where school_id=(select school from selection_fixture)and student_actor_id='20000000-0000-4000-8000-000000000013'and class_id=(select class_two from selection_fixture);
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000012')->>'status','REQUIRES_REVIEW','identical same-class identity needs review');
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000013')->>'status','REQUIRES_REVIEW','second identical identity also needs review');
set local role cuevo_api;
select throws_ok($$select internal.school_command('attendance.record',null,jsonb_build_object('classId',(select class_one from selection_fixture),'studentId','20000000-0000-4000-8000-000000000012','occurredOn','2026-10-03','status','present','note','','expectedRevision',0),'ambiguous-attendance',repeat('a',64),'selection-fixture')$$,'22023',null,'direct attendance denies valid but indistinguishable selected identity');
select throws_ok($$select internal.create_school_account_recovery('20000000-0000-4000-8000-000000000012','{"expectedMembershipRevision":1,"reason":"Reviewed recovery","confirmRecovery":true}','ambiguous-recovery',repeat('a',64),'selection-fixture')$$,'42501',null,'disabled operator runtime still denies before identity review');
reset role;
select is((select count(*)from internal.audit_events where school_id=(select school from selection_fixture)and action='school.attendance.record'),0::bigint,'ambiguous attendance emits no audit');

-- Current ambiguity denies original-key replay even if membership revision is unchanged.
set local role cuevo_api;
select lives_ok($$select internal.school_command('person.configure','20000000-0000-4000-8000-000000000014',jsonb_build_object('displayName','Unique new learner','role','student','status','active','effectiveFrom',now()-interval'1 day','effectiveTo',null,'expectedRevision',1,'confirmAccessChange',true),'unique-person-review',repeat('b',64),'selection-fixture')$$,'unique person edit uses normal revision guard');
reset role;
insert into app.memberships(school_id,actor_id,role)select school,'ffffffff-ffff-4fff-8fff-ffffffffffff','student'from selection_fixture;
insert into app.people(school_id,actor_id,display_name,synthetic)select school,'ffffffff-ffff-4fff-8fff-ffffffffffff','Unique new learner',true from selection_fixture;
insert into app.enrollments(school_id,class_id,student_actor_id)select school,class_one,'ffffffff-ffff-4fff-8fff-ffffffffffff'from selection_fixture;
select is((internal.named_school_page('people','{"limit":100,"cursor":"20000000-0000-4000-8000-000000000013"}'::jsonb)->'items'->0->'selectionContext'->>'status'),'REQUIRES_REVIEW','later-page identity affects earlier visible candidate');
set local role cuevo_api;
select throws_ok($$select internal.school_command('person.configure','20000000-0000-4000-8000-000000000014',jsonb_build_object('displayName','Unique new learner','role','student','status','active','effectiveFrom',now()-interval'1 day','effectiveTo',null,'expectedRevision',1,'confirmAccessChange',true),'unique-person-review',repeat('b',64),'selection-fixture')$$,'22023',null,'original key cannot replay through newly ambiguous current identity');
reset role;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
set local role cuevo_api;
select throws_ok($$select internal.named_school_page('people','{"limit":100}'::jsonb)$$,'42501',null,'teacher cannot gain administrator directory');
select lives_ok($$select internal.named_school_page('attendance-roster',jsonb_build_object('limit',100,'classId',(select class_one from selection_fixture)))$$,'teacher retains exact assigned roster projection');
reset role;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
update app.classes set name=' 'where school_id=(select school from selection_fixture)and id=(select class_one from selection_fixture);
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000012')->>'enrollmentState','UNAVAILABLE','blank class names are unknown rather than NONE');
select is((internal.named_school_page('attendance-roster',jsonb_build_object('limit',100,'classId',(select class_one from selection_fixture)))->'items'->0->'selectionContext'->>'status'),'REQUIRES_REVIEW','unknown roster context remains review rather than fabricated name');
update app.classes set name='Cedar'where school_id=(select school from selection_fixture)and id=(select class_one from selection_fixture);
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)select fixture.school,gen_random_uuid(),fixture.year_one,fixture.group_one,'Capacity class '||series from selection_fixture fixture cross join generate_series(1,26)series;
insert into app.enrollments(school_id,class_id,student_actor_id)select school_id,id,'20000000-0000-4000-8000-000000000014'from app.classes where school_id=(select school from selection_fixture)and name like'Capacity class %';
select is(internal.school_person_selection_context('20000000-0000-4000-8000-000000000014')->>'enrollmentState','UNAVAILABLE','26th source refuses incomplete class labels');
select is(jsonb_array_length(internal.school_person_selection_context('20000000-0000-4000-8000-000000000014')->'classes'),0,'overflow emits no incomplete class array');
select *from finish();
rollback;
