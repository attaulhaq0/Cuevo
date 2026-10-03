-- Reuse only the exact source already authorized for the current portfolio row.
-- Canonical identity and all command/replay callers retain their source check.
begin;
create function internal.identity_from_validated_source(source jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();context jsonb;duplicate boolean;begin
 -- Only the owner supplies an immediately authorized source; current exact identity is never cached.
 if source is null or source->>'submissionId'is null or source->>'learnerId'is null then raise exception 'Exact portfolio identity source unavailable'using errcode='42501';end if;
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
revoke execute on function internal.identity_from_validated_source(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create or replace function internal.portfolio_record_identity(target_model text,target_evidence uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source jsonb;begin
 source:=internal.portfolio_source(target_model,target_evidence,"authorization".current_role(school)='parent');
 return internal.identity_from_validated_source(source);
end$$;
revoke execute on function internal.portfolio_record_identity(text,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_portfolio_page(integer,uuid,uuid,uuid)'::regprocedure);
 anchor:='internal.portfolio_record_identity(row_item.source_model,row_item.evidence_id)';
 if position(anchor in definition)=0 or position('begin source:=internal.portfolio_source(row_item.source_model,row_item.evidence_id,role_name=''parent'');exception when insufficient_privilege then continue;end;'in definition)=0 then raise exception 'Portfolio page exact source/identity boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'internal.identity_from_validated_source(source)');execute definition;
end$$;
commit;
