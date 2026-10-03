begin;
-- Materialize only this learner/window's exact immutable sources before joining them.
-- This prevents new-tenant one-row estimates from repeatedly rescanning whole source sets.
create or replace function internal.authorized_observation_sources(target_school uuid,target_learner uuid,start_at timestamptz,end_at timestamptz)returns table(id uuid,kind text,source_event_id uuid,occurred_at timestamptz)
language plpgsql stable security definer set search_path=''as $$declare courses uuid[];begin
 if not"authorization".has_entitlement(target_school,'learner.state')or"authorization".current_role(target_school)='parent'or not"authorization".can_view_person(target_school,target_learner)then return;end if;
 select coalesce(array_agg(course.id),array[]::uuid[])into courses from app.courses course
 where course.school_id=target_school and"authorization".can_read_course(target_school,course.id)and"authorization".current_learner_course(target_school,course.id,target_learner);
 return query
 with observations as materialized(select observation.*from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and(start_at is null or observation.occurred_at>=start_at)and(end_at is null or observation.occurred_at<=end_at)),
 processed_sources as materialized(select processed.*from internal.processed_events processed where processed.school_id=target_school and processed.event_id in(select observation.source_event_id from observations observation)),
 event_sources as materialized(select event.*from internal.outbox_events event where event.school_id=target_school and event.id in(select observation.source_event_id from observations observation)),
 completion_sources as materialized(select completion.*from app.activity_completions completion where completion.school_id=target_school and completion.learner_id=target_learner and completion.id in(select observation.source_object_id from observations observation where observation.source_type='ACTIVITY_COMPLETION')),
 activity_sources as materialized(select activity.*from app.activities activity where activity.school_id=target_school and activity.id in(select completion.activity_id from completion_sources completion)),
 lesson_sources as materialized(select lesson.*from app.lessons lesson where lesson.school_id=target_school and lesson.id in(select activity.lesson_id from activity_sources activity)),
 unit_sources as materialized(select unit.*from app.units unit where unit.school_id=target_school and unit.course_id=any(courses)and unit.id in(select lesson.unit_id from lesson_sources lesson)),
 submission_sources as materialized(select submission.*from app.submissions submission where submission.school_id=target_school and submission.learner_id=target_learner and submission.id in(select observation.source_object_id from observations observation where observation.source_type='SUBMISSION_REVISION')),
 assessment_sources as materialized(select assessment.*from app.assessments assessment where assessment.school_id=target_school and assessment.course_id=any(courses)and assessment.id in(select submission.assessment_id from submission_sources submission)),
 return_sources as materialized(select returned.*from app.submission_returns returned where returned.school_id=target_school and returned.learner_id=target_learner and returned.id in(select submission.return_id from submission_sources submission))
 select observation.id,observation.kind,observation.source_event_id,observation.occurred_at
 from observations observation
 join processed_sources processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
 join event_sources event on event.school_id=processed.school_id and event.id=processed.event_id
 join completion_sources completion on completion.school_id=observation.school_id and completion.id=observation.source_object_id
 join activity_sources activity on activity.school_id=completion.school_id and activity.id=completion.activity_id
 join lesson_sources lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id
 join unit_sources unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
 where observation.source_type='ACTIVITY_COMPLETION'and completion.completed_at=observation.occurred_at and activity.kind=observation.kind
 and processed.source_type='COMPLETION'and processed.source_id=completion.id and event.actor_id=target_learner and event.entity_id=completion.id and event.type='activity.complete'and event.entity_type='activity'
 union all
 select observation.id,observation.kind,observation.source_event_id,observation.occurred_at
 from observations observation
 join processed_sources processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
 join event_sources event on event.school_id=processed.school_id and event.id=processed.event_id
 join submission_sources submission on submission.school_id=observation.school_id and submission.id=observation.source_object_id
 join assessment_sources assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
 join return_sources returned on returned.school_id=submission.school_id and returned.id=submission.return_id
 where observation.source_type='SUBMISSION_REVISION'and observation.kind='revision'and submission.submitted_at=observation.occurred_at
 and returned.submission_id=submission.previous_submission_id
 and processed.source_type='SUBMISSION_REVISION'and processed.source_id=submission.id and event.actor_id=target_learner and event.entity_id=submission.id and event.type='submission.resubmitted'and event.entity_type='submission';
end$$;
revoke execute on function internal.authorized_observation_sources(uuid,uuid,timestamptz,timestamptz)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
