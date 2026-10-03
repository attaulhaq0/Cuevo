begin;
-- A current relationship to a person does not authorize every source about that person.
create function "authorization".current_learner_course(target_school uuid,target_course uuid,target_learner uuid)returns boolean
language sql stable security definer set search_path=''as $$
select coalesce(exists(select 1 from app.courses course join app.classes class on class.school_id=course.school_id and class.id=course.class_id
 join app.enrollments enrollment on enrollment.school_id=course.school_id and enrollment.class_id=course.class_id
 join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
 where course.school_id=target_school and course.id=target_course and enrollment.student_actor_id=target_learner
 and class.status='active'and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())
 and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())
 and"authorization".programme_course_allowed(target_school,target_course,target_learner)),false)
$$;
create or replace function "authorization".can_read_academic_source(target_school uuid,target_learner uuid,parent_allowed boolean,target_assessment uuid)returns boolean
language sql stable security definer set search_path=''as $$
select coalesce("authorization".can_read_academic(target_school,target_learner,parent_allowed)and exists(select 1 from app.assessments assessment
 where assessment.school_id=target_school and assessment.id=target_assessment
 and"authorization".can_read_course(target_school,assessment.course_id)
 and"authorization".programme_course_allowed(target_school,assessment.course_id,target_learner)
 and("authorization".current_role(target_school)in('admin','coordinator','parent')or"authorization".current_learner_course(target_school,assessment.course_id,target_learner))),false)
$$;
create or replace function "authorization".can_mark_submission(target_school uuid,target_submission uuid)returns boolean
language sql stable security definer set search_path=''as $$
select coalesce("authorization".academic_access(target_school)and"authorization".current_role(target_school)in('teacher','admin')and exists(
 select 1 from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
 where submission.school_id=target_school and submission.id=target_submission
 and"authorization".can_manage_course(target_school,assessment.course_id)and"authorization".can_view_person(target_school,submission.learner_id)
 and"authorization".current_learner_course(target_school,assessment.course_id,submission.learner_id)),false)
$$;
create function internal.observation_source_allowed(target_school uuid,target_observation uuid)returns boolean
language plpgsql stable security definer set search_path=''as $$declare observation app.habit_observations;course uuid;begin
 select*into observation from app.habit_observations where school_id=target_school and id=target_observation;
 if not found or not"authorization".has_entitlement(target_school,'learner.state')or"authorization".current_role(target_school)='parent'or not"authorization".can_view_person(target_school,observation.learner_id)then return false;end if;
 if observation.source_type='ACTIVITY_COMPLETION'then
  select unit.course_id into course from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id
   join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
   where completion.school_id=target_school and completion.id=observation.source_object_id and completion.learner_id=observation.learner_id and completion.completed_at=observation.occurred_at and activity.kind=observation.kind;
 elsif observation.source_type='SUBMISSION_REVISION'then
  select assessment.course_id into course from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
   join app.submission_returns returned on returned.school_id=submission.school_id and returned.id=submission.return_id
   where submission.school_id=target_school and submission.id=observation.source_object_id and submission.learner_id=observation.learner_id and submission.submitted_at=observation.occurred_at
    and returned.submission_id=submission.previous_submission_id and returned.learner_id=observation.learner_id and observation.kind='revision';
 end if;
 return course is not null and"authorization".can_read_course(target_school,course)and"authorization".current_learner_course(target_school,course,observation.learner_id)
  and exists(select 1 from internal.processed_events processed join internal.outbox_events event on event.id=processed.event_id and event.school_id=processed.school_id
   where processed.school_id=target_school and processed.event_id=observation.source_event_id and processed.source_id=observation.source_object_id and event.actor_id=observation.learner_id and event.entity_id=observation.source_object_id);
end$$;
drop policy observation_read on app.habit_observations;
create policy observation_read on app.habit_observations for select to cuevo_api using(internal.observation_source_allowed(school_id,id));
revoke execute on function "authorization".current_learner_course(uuid,uuid,uuid),internal.observation_source_allowed(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function "authorization".current_learner_course(uuid,uuid,uuid),internal.observation_source_allowed(uuid,uuid)to cuevo_api;

-- Current academic pages select the latest submitted source; prior evidence remains immutable.
do $$declare signature text;definition text;begin
 foreach signature in array array['internal.list_current_native_results_scoped(integer,uuid,uuid)','internal.list_parent_current_results_scoped(integer,uuid,uuid)','internal.read_class_learning_summary(uuid,integer,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'where r.school_id=school and r.learner_id=',
   'where exists(select 1 from app.current_submissions submitted where submitted.school_id=r.school_id and submitted.submission_id=r.submission_id)and r.school_id=school and r.learner_id=');
  definition:=replace(definition,'where result.school_id=school and result.learner_id=',
   'where exists(select 1 from app.current_submissions submitted where submitted.school_id=result.school_id and submitted.submission_id=result.submission_id)and result.school_id=school and result.learner_id=');
  execute definition;
 end loop;
end$$;
-- A stale generated context is readable history only while each saved source remains authorized.
create function internal.recommendation_source_allowed(target_school uuid,target_recommendation uuid)returns boolean
language plpgsql stable security definer set search_path=''as $$declare proposal app.recommendations;begin
 select*into proposal from app.recommendations where school_id=target_school and id=target_recommendation;
 if not found or not"authorization".improvement_access(target_school)then return false;end if;
 if not exists(select 1 from app.result_revisions result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id
  where result.school_id=target_school and result.id=proposal.baseline_result_id and"authorization".can_read_academic_source(target_school,result.learner_id,result.parent_visible,result.assessment_id))then return false;end if;
 if"authorization".current_role(target_school)in('teacher','admin')and proposal.intelligence_run_id is not null then
  begin perform internal.require_stored_insight_scope(proposal.intelligence_run_id);exception when insufficient_privilege or no_data_found then return false;end;
 end if;return true;
end$$;
create or replace function "authorization".can_manage_baseline(target_school uuid,target_result uuid)returns boolean
language sql stable security definer set search_path=''as $$
select coalesce("authorization".improvement_access(target_school)and exists(select 1 from app.result_revisions result
 where result.school_id=target_school and result.id=target_result and"authorization".can_mark_submission(target_school,result.submission_id)
 and exists(select 1 from app.current_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id)
 and exists(select 1 from app.current_submissions submission where submission.school_id=result.school_id and submission.submission_id=result.submission_id)),false)
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.decide_recommendation(uuid,text,text,text,text)'::regprocedure);
 definition:=replace(definition,'select*into d from app.human_decisions',
  'if r.intelligence_run_id is not null then perform internal.require_stored_insight_scope(r.intelligence_run_id);end if;select*into d from app.human_decisions');
 execute definition;
end$$;
drop policy recommendations_read on app.recommendations;
create policy recommendations_read on app.recommendations for select to cuevo_api using(internal.recommendation_source_allowed(school_id,id)and("authorization".can_manage_baseline(school_id,baseline_result_id)or("authorization".improvement_access(school_id)and"authorization".current_role(school_id)='coordinator')));
revoke execute on function internal.recommendation_source_allowed(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.recommendation_source_allowed(uuid,uuid)to cuevo_api;

-- Course binding and assessment configuration share a lock and recheck after serialization.
create function internal.lock_academic_course(target_school uuid,target_course uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform 1 from app.courses where school_id=target_school and id=target_course for update;
end$$;
do $$declare definition text;signature text;begin
 definition:=pg_get_functiondef('internal.configure_curriculum(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'if command_name=''course.configure''then select*into course', 'if command_name=''course.configure''then perform internal.lock_academic_course(school,target_id);select*into course');
 execute definition;
 foreach signature in array array['internal.link_assessment_reference(uuid,uuid,integer)','internal.configure_assessment_rubric(uuid,uuid,integer)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'begin perform internal.academic_require();','begin perform internal.lock_academic_course("authorization".school_id(),(select course_id from app.assessments where school_id="authorization".school_id()and id=target_assessment));perform internal.academic_require();');
  definition:=replace(definition,' perform internal.academic_require();select*into a',' perform internal.lock_academic_course("authorization".school_id(),(select course_id from app.assessments where school_id="authorization".school_id()and id=target_assessment));perform internal.academic_require();select*into a');
  execute definition;
 end loop;
end$$;
revoke execute on function internal.lock_academic_course(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
