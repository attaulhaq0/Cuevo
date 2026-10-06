-- Independent customer-readiness regressions. Every fixture is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select no_plan();
create temporary table customer_sources(kind text primary key,source_id uuid,result_id uuid,evidence_id uuid,course_id uuid,programme_id uuid,proposal_id uuid,run_id uuid);
grant select,insert,update on customer_sources to cuevo_api;

-- A learner belongs to two classes; teacher 004 only owns the first class.
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)
select school_id,'99400000-0000-4000-8000-000000000001',academic_year_id,year_group_id,'Customer second class' from app.classes where id='30000000-0000-4000-8000-000000000001';
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)
values('10000000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012',now()-interval '1 day');
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)
values('10000000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005',now()-interval '1 day');
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)
values('10000000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','Customer foreign source','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id,policy_version)
values('10000000-0000-4000-8000-000000000001','99420000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','Customer numeric source','Teacher authored',10,'61000000-0000-4000-8000-000000000001',2);
insert into app.submissions(school_id,id,assessment_id,learner_id,content)
values('10000000-0000-4000-8000-000000000001','99430000-0000-4000-8000-000000000001','99420000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012','Synthetic source');
set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000005',true);
insert into customer_sources(kind,source_id,result_id,course_id)
values('foreign','99430000-0000-4000-8000-000000000001',internal.release_marking(internal.mark_submission('99430000-0000-4000-8000-000000000001',6,'Human reviewed',2,0,true),1,true),'99410000-0000-4000-8000-000000000001');
update customer_sources set evidence_id=(select evidence_id from app.result_revisions where id=customer_sources.result_id)where kind='foreign';
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select is("authorization".can_view_person('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012'),true,'AUTH01 fixture retains a current learner relationship');
select is("authorization".can_read_course('10000000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000001'),false,'AUTH02 fixture foreign course is independently denied');
select is((select count(*)from app.academic_evidence where id=(select evidence_id from customer_sources where kind='foreign')),0::bigint,'AUTH02 related teacher cannot read another class evidence through RLS');
select ok(not exists(select 1 from jsonb_array_elements(internal.list_current_native_results_scoped(100,null,'20000000-0000-4000-8000-000000000012')->'items')item where item->>'id'=(select result_id::text from customer_sources where kind='foreign')),'AUTH02 current result page does not include the other class source');
select throws_ok('select*from app.learner_state_snapshots','42501',null,'AUTH01 raw cached state is not a runtime bypass around source authorization');
select throws_ok('select*from app.learner_signals','42501',null,'AUTH01 raw cached signals are not a runtime bypass around source authorization');
select throws_ok('select internal.read_current_practice_signals(null,null,null)','42501',null,'AUTH01 private signal read requires an explicit bounded page');

-- Programme revocation must be enforced on staff academic writes as well as learner reads.
reset role;
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)
values('10000000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Customer programme source','Synthetic','PUBLISHED');
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
do $$declare pack uuid;ref uuid;programme uuid;academic uuid;begin
 pack:=(internal.configure_curriculum('version.create',null,'{"packId":"customer-source-boundary","kind":"school_custom","framework":"School Custom","programme":"School source boundary","version":"school-1","scope":"synthetic","sourceStatus":"VERIFIED","rightsStatus":"PERMITTED","sourceLocation":"repo:synthetic","sourceChecksum":null,"synthetic":true,"reason":"Customer regression fixture"}','customer-boundary-pack',repeat('a',64),'customer-boundary')->>'id')::uuid;
 ref:=(internal.configure_curriculum('reference.create',null,jsonb_build_object('packVersionId',pack,'parentId',null,'type','objective','title','School objective','description','Teacher authored','code',null,'sequence',1,'subjectId','43000000-0000-4000-8000-000000000001','yearGroupId',null),'customer-boundary-ref',repeat('b',64),'customer-boundary')->>'id')::uuid;
perform internal.transition_curriculum_lifecycle(pack,'{"state":"APPROVED","expectedRevision":1,"reviewBasis":"SCHOOL_AUTHORED","artifactDirectory":null,"replacementVersionId":null,"reason":"Reviewed synthetic school source","confirmTransition":true}',null,'boundary-lifecycle-0',repeat('a',64),'curriculum-fixture');
perform internal.transition_curriculum_lifecycle(pack,'{"state":"ACTIVE","expectedRevision":2,"reviewBasis":"SCHOOL_AUTHORED","artifactDirectory":null,"replacementVersionId":null,"reason":"Reviewed synthetic school source","confirmTransition":true}',null,'boundary-lifecycle-1',repeat('a',64),'curriculum-fixture');
 programme:=(internal.configure_curriculum('programme.create',null,jsonb_build_object('packVersionId',pack,'name','School programme','classId','30000000-0000-4000-8000-000000000001','subjectId','43000000-0000-4000-8000-000000000001','yearGroupId','42000000-0000-4000-8000-000000000001','confirmConfiguration',true),'customer-boundary-programme',repeat('c',64),'customer-boundary')->>'id')::uuid;
 perform internal.configure_curriculum('course.configure','99410000-0000-4000-8000-000000000002',jsonb_build_object('programmeId',programme,'referenceId',ref,'expectedVersion',1,'confirmConfiguration',true),'customer-boundary-course',repeat('d',64),'customer-boundary');
 perform internal.configure_curriculum('learner.configure',null,jsonb_build_object('programmeId',programme,'learnerId','20000000-0000-4000-8000-000000000012','status','active','confirmAccessChange',true),'customer-boundary-active',repeat('e',64),'customer-boundary');
 insert into customer_sources(kind,course_id,programme_id)values('programme','99410000-0000-4000-8000-000000000002',programme);
end$$;
reset role;
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)
select'10000000-0000-4000-8000-000000000001','99420000-0000-4000-8000-000000000002',course_id,'20000000-0000-4000-8000-000000000004','Programme assessment','Teacher authored',10,academic_reference_id from app.programme_course_contexts where course_id='99410000-0000-4000-8000-000000000002';
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
update customer_sources set source_id=internal.create_learning_submission('99420000-0000-4000-8000-000000000002','Synthetic source')where kind='programme';
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update customer_sources set result_id=internal.release_marking(internal.mark_submission(source_id,2,'Human reviewed',1,0,true),1,true)where kind='programme';
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select internal.configure_curriculum('learner.configure',null,jsonb_build_object('programmeId',(select programme_id from customer_sources where kind='programme'),'learnerId','20000000-0000-4000-8000-000000000012','status','revoked','confirmAccessChange',true),'customer-boundary-revoke',repeat('f',64),'customer-boundary') is not null as programme_revocation_recorded;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select is("authorization".can_mark_submission('10000000-0000-4000-8000-000000000001',(select source_id from customer_sources where kind='programme')),false,'AUTH03 programme revocation denies staff marking authority');
select is("authorization".can_manage_baseline('10000000-0000-4000-8000-000000000001',(select result_id from customer_sources where kind='programme')),false,'AUTH03 programme revocation denies staff baseline authority');
select ok(not exists(select 1 from jsonb_array_elements(internal.list_current_native_results_scoped(100,null,'20000000-0000-4000-8000-000000000012')->'items')item where item->>'id'=(select result_id::text from customer_sources where kind='programme')),'AUTH03 teacher current native report excludes revoked learner programme');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select ok(not exists(select 1 from jsonb_array_elements(internal.list_current_native_results_scoped(100,null,'20000000-0000-4000-8000-000000000012')->'items')item where item->>'id'=(select result_id::text from customer_sources where kind='programme')),'AUTH03 administrator current native report excludes revoked learner programme');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000002',true);
select ok(not exists(select 1 from jsonb_array_elements(internal.list_current_native_results_scoped(100,null,'20000000-0000-4000-8000-000000000012')->'items')item where item->>'id'=(select result_id::text from customer_sources where kind='programme')),'AUTH03 coordinator current native report excludes revoked learner programme');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select throws_ok($$select internal.mark_submission((select source_id from customer_sources where kind='programme'),3,'New mark after revocation',1,1,true)$$,'42501',null,'AUTH03 revoked programme cannot receive a new academic mark');

select*from finish();
rollback;
