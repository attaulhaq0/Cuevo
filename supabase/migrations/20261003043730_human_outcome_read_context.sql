-- Fresh read-only context; measurement/event/worker values remain immutable.
begin;
create function internal.outcome_display_context(target_school uuid,target_outcome uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare outcome app.outcome_measurements;context jsonb;duplicate boolean;begin
 if target_school is distinct from"authorization".school_id()then raise exception 'Outcome context denied'using errcode='42501';end if;
 perform internal.intervention_outcome_projection(target_outcome);
 select*into outcome from app.outcome_measurements where school_id=target_school and id=target_outcome;
 select jsonb_build_object('status','REQUIRES_REVIEW','labelBasis','CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK','identityRequiresReview',true,
  'learnerId',intervention.learner_id,'learnerName',nullif(btrim(person.display_name),''),'practiceTitle',intervention.title,
  'className',nullif(btrim(class.name),''),'yearGroupName',nullif(btrim(year_group.name),''),'academicYearName',nullif(btrim(academic_year.name),''),
  'courseTitle',nullif(btrim(case when baseline_snapshot.submission_id is null then course.title else baseline_course_revision.title end),''),
  'baselineAssessmentTitle',nullif(btrim(coalesce(baseline_snapshot.assessment_title,baseline_assessment.title)),''),
  'followUpAssessmentTitle',nullif(btrim(case when followup_snapshot.submission_id is null then followup_assessment.title when followup_course_revision.id is not null then followup_snapshot.assessment_title else null end),''),
  'baselineSubmittedAt',baseline_submission.submitted_at,'followUpSubmittedAt',followup_submission.submitted_at)
 into context from app.interventions intervention
 join internal.improvement_result_sources baseline on baseline.school_id=intervention.school_id and baseline.id=outcome.baseline_result_id and baseline.learner_id=intervention.learner_id
 join internal.improvement_result_sources followup on followup.school_id=intervention.school_id and followup.id=outcome.follow_up_result_id and followup.learner_id=intervention.learner_id
 join app.submissions baseline_submission on baseline_submission.school_id=baseline.school_id and baseline_submission.id=baseline.submission_id and baseline_submission.learner_id=baseline.learner_id
 join app.submissions followup_submission on followup_submission.school_id=followup.school_id and followup_submission.id=followup.submission_id and followup_submission.learner_id=followup.learner_id
 join app.assessments baseline_assessment on baseline_assessment.school_id=baseline.school_id and baseline_assessment.id=baseline.assessment_id
 join app.assessments followup_assessment on followup_assessment.school_id=followup.school_id and followup_assessment.id=followup.assessment_id
 join app.courses course on course.school_id=baseline_assessment.school_id and course.id=baseline_assessment.course_id
 join app.classes class on class.school_id=course.school_id and class.id=course.class_id
 left join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id
 left join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
 left join app.people person on person.school_id=intervention.school_id and person.actor_id=intervention.learner_id
 left join app.learning_submission_context baseline_snapshot on baseline_snapshot.school_id=baseline.school_id and baseline_snapshot.submission_id=baseline.submission_id
 left join app.learning_content_revisions baseline_course_revision on baseline_course_revision.school_id=course.school_id and baseline_course_revision.id=baseline_snapshot.course_revision_id and baseline_course_revision.resource='course'and baseline_course_revision.source_id=course.id and baseline_course_revision.course_id=course.id
 left join app.learning_submission_context followup_snapshot on followup_snapshot.school_id=followup.school_id and followup_snapshot.submission_id=followup.submission_id
 left join app.learning_content_revisions followup_course_revision on followup_course_revision.school_id=course.school_id and followup_course_revision.id=followup_snapshot.course_revision_id and followup_course_revision.resource='course'and followup_course_revision.source_id=course.id and followup_course_revision.course_id=course.id
 where intervention.school_id=target_school and intervention.id=outcome.intervention_id and intervention.learner_id=outcome.learner_id and intervention.baseline_result_id=outcome.baseline_result_id and intervention.follow_up_assessment_id=followup_assessment.id and followup_assessment.course_id=course.id;
 if context is null then return jsonb_build_object('status','REQUIRES_REVIEW','labelBasis','CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK','identityRequiresReview',false,'learnerId',outcome.learner_id,'learnerName',null,'practiceTitle',null,'className',null,'yearGroupName',null,'academicYearName',null,'courseTitle',null,'baselineAssessmentTitle',null,'followUpAssessmentTitle',null,'baselineSubmittedAt',null,'followUpSubmittedAt',null);end if;
 select exists(select 1 from app.interventions intervention join app.assessments assessment on assessment.school_id=intervention.school_id and assessment.id=(select assessment_id from internal.improvement_result_sources where school_id=target_school and id=outcome.baseline_result_id)
  join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
  join app.enrollments enrollment on enrollment.school_id=course.school_id and enrollment.class_id=course.class_id
  join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
  join app.people peer on peer.school_id=member.school_id and peer.actor_id=member.actor_id
  where intervention.school_id=target_school and intervention.id=outcome.intervention_id and member.actor_id<>intervention.learner_id and member.role='student'and member.status='active'and enrollment.status='active'
   and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())
   and lower(btrim(peer.display_name))=lower(btrim(context->>'learnerName'))and"authorization".can_view_person(target_school,peer.actor_id))into duplicate;
 return context||jsonb_build_object('identityRequiresReview',duplicate,'status',case when not duplicate and not exists(select 1 from jsonb_each(context)item where item.value='null'::jsonb)then'READY'else'REQUIRES_REVIEW'end);
end$$;
create function internal.read_outcome_display(target_outcome uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare source jsonb;begin source:=internal.intervention_outcome_projection(target_outcome);return source||jsonb_build_object('context',internal.outcome_display_context("authorization".school_id(),target_outcome));end$$;
revoke execute on function internal.outcome_display_context(uuid,uuid),internal.read_outcome_display(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_outcome_display(uuid)to cuevo_api;
-- Attach only after the existing authorized snapshot outcome filter. No stored row changes.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);
 anchor:='select coalesce(array_agg((item->>''id'')::uuid),array[]::uuid[])into measurement_ids from jsonb_array_elements(outcomes)item;';
 if position(anchor in definition)=0 then raise exception 'Authorized outcome projection anchor changed'using errcode='22023';end if;
 execute replace(definition,anchor,'select coalesce(jsonb_agg(item||jsonb_build_object(''context'',internal.outcome_display_context(school,(item->>''id'')::uuid))),''[]''::jsonb)into outcomes from jsonb_array_elements(outcomes)item;'||anchor);
end$$;
commit;
