-- Rollback-only independent original identity body and five-role portfolio page parity.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select plan(14);
create function pg_temp.original_portfolio_identity(target_model text,target_evidence uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source jsonb;context jsonb;duplicate boolean;begin
 source:=internal.portfolio_source(target_model,target_evidence,"authorization".current_role(school)='parent');
 select jsonb_build_object('status','REQUIRES_REVIEW','learnerName',nullif(btrim(person.display_name),''),'className',nullif(btrim(class.name),''),'yearGroupName',nullif(btrim(year_group.name),''),'academicYearName',nullif(btrim(academic_year.name),''),'courseTitle',nullif(btrim(coalesce(course_revision.title,course.title)),''),'assessmentTitle',nullif(btrim(coalesce(snapshot.assessment_title,assessment.title)),''),'submittedAt',submission.submitted_at,'submissionRevision',submission.revision)
 into context from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
 join app.classes class on class.school_id=course.school_id and class.id=course.class_id left join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id left join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
 left join app.people person on person.school_id=submission.school_id and person.actor_id=submission.learner_id left join app.learning_submission_context snapshot on snapshot.school_id=submission.school_id and snapshot.submission_id=submission.id left join app.learning_content_revisions course_revision on course_revision.school_id=snapshot.school_id and course_revision.id=snapshot.course_revision_id
 where submission.school_id=school and submission.id=(source->>'submissionId')::uuid and submission.learner_id=(source->>'learnerId')::uuid;
 if context is null then raise exception 'Exact portfolio identity source unavailable'using errcode='42501';end if;
 select exists(select 1 from app.submissions submitted join app.assessments assessment on assessment.school_id=submitted.school_id and assessment.id=submitted.assessment_id join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
 join app.enrollments enrollment on enrollment.school_id=course.school_id and enrollment.class_id=course.class_id join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id
 where submitted.school_id=school and submitted.id=(source->>'submissionId')::uuid and member.actor_id<>(source->>'learnerId')::uuid and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and btrim(person.display_name)=context->>'learnerName'and"authorization".can_view_person(school,member.actor_id))into duplicate;
 if not duplicate and not exists(select 1 from jsonb_each(context)field where field.key<>'status'and field.value='null'::jsonb)then context:=context||jsonb_build_object('status','READY');end if;return context;
end$$;

revoke execute on function pg_temp.original_portfolio_identity(text,uuid)from public;
-- Exact original source+publication/text/artifact/identity body; independent of later optimized page.
create function pg_temp.original_portfolio_page(page_limit integer,page_cursor uuid,target_learner uuid,history_item uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());row_item record;source jsonb;result jsonb:='[]';count_rows integer:=0;item_filter app.portfolio_items;
begin
 if not"authorization".has_entitlement(school,'portfolio')or page_limit is null or page_limit not between 1 and 100 then raise exception 'Portfolio read denied'using errcode='42501';end if;
 if target_learner is not null and not"authorization".can_view_person(school,target_learner)then raise exception 'Portfolio learner denied'using errcode='42501';end if;
 if history_item is not null then select*into item_filter from app.portfolio_items where school_id=school and id=history_item;if not found or role_name='parent'then raise exception 'Portfolio history denied'using errcode='42501';end if;perform internal.portfolio_source(item_filter.source_model,item_filter.evidence_id,false);end if;
 for row_item in select i.id,i.learner_id,i.source_model,i.evidence_id,r.id revision_id,r.revision,r.title,r.reflection,r.created_at,review.feedback,review.featured,(current_item.parent_revision_id=r.id and coalesce(review.parent_visible,false))as parent_visible,review.reviewed_at,coalesce(review.source_review_confirmed,false)as source_review_confirmed
 from app.portfolio_items i join app.portfolio_current current_item on current_item.school_id=i.school_id and current_item.item_id=i.id join app.portfolio_revisions r on r.school_id=i.school_id and r.item_id=i.id and((history_item is not null)or r.id=case when role_name='parent'then current_item.parent_revision_id else current_item.revision_id end)left join app.portfolio_reviews review on review.school_id=r.school_id and review.revision_id=r.id
 where i.school_id=school and(target_learner is null or i.learner_id=target_learner)and(history_item is null or i.id=history_item)and(page_cursor is null or r.id>page_cursor)and"authorization".can_view_person(school,i.learner_id)and(role_name<>'parent'or review.parent_visible)order by r.id
 loop
  begin source:=internal.portfolio_source(row_item.source_model,row_item.evidence_id,role_name='parent');exception when insufficient_privilege then continue;end;
  count_rows:=count_rows+1;result:=result||jsonb_build_array(source||jsonb_build_object('id',row_item.id,'revisionId',row_item.revision_id,'revision',row_item.revision,'learnerId',row_item.learner_id,'identity',pg_temp.original_portfolio_identity(row_item.source_model,row_item.evidence_id),'sourceModel',row_item.source_model,'title',row_item.title,'reflection',row_item.reflection,'createdAt',row_item.created_at,'feedback',row_item.feedback,'featured',coalesce(row_item.featured,false),'approvalState',case when row_item.feedback is null then'AWAITING_REVIEW'else'REVIEWED'end,'parentVisible',coalesce(row_item.parent_visible,false),'reviewedAt',row_item.reviewed_at,'sourceWorkApproved',row_item.source_review_confirmed,'artifactCount',(select count(*)from app.portfolio_artifacts selected where selected.school_id=school and selected.item_id=row_item.id and selected.revision_id=row_item.revision_id)));
  exit when count_rows>page_limit;
 end loop;
 if octet_length(result::text)>500000 then raise exception 'Portfolio page requires smaller view'using errcode='22023';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item),'[]'::jsonb)from jsonb_array_elements(result)with ordinality value(item,ordinal)where ordinal<=page_limit),'nextCursor',case when count_rows>page_limit then result->(page_limit-1)->>'revisionId'else null end);
end$$;
revoke execute on function pg_temp.original_portfolio_page(integer,uuid,uuid,uuid)from public;
grant execute on function pg_temp.original_portfolio_page(integer,uuid,uuid,uuid)to cuevo_api;
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,'internal.identity_from_validated_source(jsonb)'::regprocedure,'EXECUTE')),'Source-consuming identity helper is owner-only for every runtime/Data API role');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,'internal.portfolio_record_identity(text,uuid)'::regprocedure,'EXECUTE')),'Canonical reauthorizing identity wrapper remains private');
select ok(not exists(select 1 from pg_roles role where role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,'internal.portfolio_page_identities(jsonb)'::regprocedure,'EXECUTE')),'Batched authorized-source identity helper remains owner-only');
select ok(not has_table_privilege('cuevo_api','app.portfolio_items','SELECT')and not has_table_privilege('cuevo_api','app.portfolio_artifacts','SELECT'),'Page optimization grants no raw portfolio or artifact table read');
create temporary table portfolio_identity_fixture(submission uuid,result uuid,evidence uuid,item uuid,revision uuid,new_revision uuid);
grant select,insert,update on portfolio_identity_fixture to cuevo_api;
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)values('10000000-0000-4000-8000-000000000001','99030000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Portfolio identity rollback class');
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values('10000000-0000-4000-8000-000000000001','99030000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012',now()-interval'1 day');
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values('10000000-0000-4000-8000-000000000001','99030000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',now()-interval'1 day');
-- Preserve actual source, with deliberately unique current human context for explicit review.
update app.people set display_name='Portfolio Parity Learner'where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','99040000-0000-4000-8000-000000000001','99030000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Portfolio exact rollback source','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)values('10000000-0000-4000-8000-000000000001','99050000-0000-4000-8000-000000000001','99040000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Original selected task','Explain',10,'61000000-0000-4000-8000-000000000001');
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
set local role cuevo_api;
insert into portfolio_identity_fixture(submission)values(internal.create_learning_submission('99050000-0000-4000-8000-000000000001','Original exact selected text'));
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update portfolio_identity_fixture set result=internal.release_marking(internal.mark_submission(submission,0,'Reviewed zero',1,0,true),1,true);
reset role;
update portfolio_identity_fixture fixture set evidence=result.evidence_id from app.result_revisions result where result.id=fixture.result;
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
update portfolio_identity_fixture set item=(internal.portfolio_command('create',null,jsonb_build_object('evidenceId',evidence,'sourceModel','numeric','title','Selected source','reflection','Original reflection'),'portfolio-parity-create',repeat('a',64),'portfolio-parity')->>'id')::uuid;
reset role;
update portfolio_identity_fixture fixture set revision=current.revision_id from app.portfolio_current current where current.item_id=fixture.item;
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select internal.portfolio_command('review',(select item from portfolio_identity_fixture),'{"expectedRevision":1,"feedback":"Reviewed exact source","featured":false,"parentVisible":true,"confirmParentApproval":true,"confirmSourceReview":true}','portfolio-parity-review',repeat('b',64),'portfolio-parity');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select internal.portfolio_command('reflection',(select item from portfolio_identity_fixture),'{"expectedRevision":1,"title":"Private newer reflection","reflection":"Unapproved new reflection"}','portfolio-parity-reflection',repeat('c',64),'portfolio-parity');
reset role;
update portfolio_identity_fixture fixture set new_revision=current.revision_id from app.portfolio_current current where current.item_id=fixture.item;
set local role cuevo_api;
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Student full page and continuation equal original identity body');
select is(internal.read_portfolio_page(1,null,null,(select item from portfolio_identity_fixture))::text,pg_temp.original_portfolio_page(1,null,null,(select item from portfolio_identity_fixture))::text,'History revision continuation equals original identity/source checks');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Teacher full page equals original body');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Administrator full page equals original body');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000002',true);
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Coordinator metadata page equals original body without answer authority');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Parent retained approved revision page equals original body');
select is((select row->>'revisionId'from jsonb_array_elements(internal.read_portfolio_page(100,null,null,null)->'items')row where row->>'id'=(select item::text from portfolio_identity_fixture)),(select revision::text from portfolio_identity_fixture),'Parent sees reviewed prior revision rather than current private reflection');
select throws_ok($$select internal.identity_from_validated_source('{"submissionId":"99050000-0000-4000-8000-000000000001","learnerId":"20000000-0000-4000-8000-000000000012"}')$$,'42501',null,'API cannot fabricate a source JSON for the identity helper');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select internal.portfolio_command('revoke',(select item from portfolio_identity_fixture),'{"reason":"Remove current selected publication"}','portfolio-parity-revoke',repeat('d',64),'portfolio-parity');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select is(internal.read_portfolio_page(2,null,null,null)::text,pg_temp.original_portfolio_page(2,null,null,null)::text,'Current parent revocation is rechecked equally without deleting prior approval');
select ok(not exists(select 1 from jsonb_array_elements(internal.read_portfolio_page(100,null,null,null)->'items')row where row->>'id'=(select item::text from portfolio_identity_fixture)),'Revoked fixture is absent from parent page');
select*from finish();
rollback;
