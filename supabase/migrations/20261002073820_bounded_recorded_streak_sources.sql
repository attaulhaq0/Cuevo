begin;
-- Bound every inspected source to the selected period's existing ledger envelope.
create or replace function internal.recorded_learning_streak(target_learner uuid,target_period uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();period app.recognition_periods;unknown jsonb;candidate_count integer;source_count integer;recorded_days integer;streak_days integer;ending_day date;present timestamptz:=statement_timestamp();begin
 unknown:=jsonb_build_object('status','UNOBSERVED','basis','VERIFIED_RECOGNIZED_ACTION_DAYS','timezone','UTC','days',null,'endingOn',null,'recordedDays',null,'sourceCount',null);
 if not"authorization".can_access_school(school)or not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)is null or"authorization".current_role(school)not in('student','teacher','coordinator','admin')or not"authorization".can_view_person(school,target_learner)then raise exception 'Recorded action day scope denied'using errcode='42501';end if;
 if target_period is null then return unknown||jsonb_build_object('status','PERIOD_REQUIRED');end if;
 select*into period from app.recognition_periods where school_id=school and id=target_period;
 if period.id is null or not internal.current_period_scope(target_period,target_learner)or not"authorization".can_view_class(school,period.class_id)then raise exception 'Exact current learner recognition period required'using errcode='42501';end if;
 if not internal.recognition_enabled(school,false)then return unknown||jsonb_build_object('status','DISABLED');end if;
 select count(*)into candidate_count from(select 1 from app.xp_ledger ledger where ledger.school_id=school and ledger.learner_id=target_learner and ledger.period_id=target_period and ledger.occurred_at>=period.starts_at and ledger.occurred_at<period.ends_at and ledger.occurred_at<=present order by ledger.id limit 10001)bounded;
 if candidate_count>10000 then return unknown||jsonb_build_object('status','REQUIRES_REVIEW');end if;
 with candidates as materialized(
  select ledger.school_id,ledger.observation_id,ledger.learner_id,ledger.policy_id,ledger.kind,ledger.points,ledger.occurred_at from app.xp_ledger ledger
  where ledger.school_id=school and ledger.learner_id=target_learner and ledger.period_id=target_period and ledger.occurred_at>=period.starts_at and ledger.occurred_at<period.ends_at and ledger.occurred_at<=present order by ledger.id limit 10000
 ),observations as materialized(
  select observation.school_id,observation.id,observation.learner_id,observation.kind,observation.source_type,observation.source_object_id,observation.source_event_id,observation.occurred_at from app.habit_observations observation
  join candidates ledger on ledger.school_id=observation.school_id and ledger.observation_id=observation.id and ledger.learner_id=observation.learner_id and ledger.kind=observation.kind and ledger.occurred_at=observation.occurred_at
 ),processed_sources as materialized(
  select processed.school_id,processed.event_id,processed.source_type,processed.source_id from internal.processed_events processed
  where processed.school_id=school and processed.event_id in(select observation.source_event_id from observations observation)
 ),event_sources as materialized(
  select event.school_id,event.id,event.actor_id,event.entity_id,event.type,event.entity_type,event.state,event.occurred_at from internal.outbox_events event
  where event.school_id=school and event.id in(select observation.source_event_id from observations observation)and event.state='COMPLETED'and event.occurred_at<=present
 ),completion_sources as materialized(
  select completion.school_id,completion.id,completion.activity_id,completion.learner_id,completion.completed_at from app.activity_completions completion
  where completion.school_id=school and completion.learner_id=target_learner and completion.id in(select observation.source_object_id from observations observation where observation.source_type='ACTIVITY_COMPLETION')
 ),activity_sources as materialized(
  select activity.school_id,activity.id,activity.lesson_id,activity.kind from app.activities activity
  where activity.school_id=school and activity.id in(select completion.activity_id from completion_sources completion)
 ),lesson_sources as materialized(
  select lesson.school_id,lesson.id,lesson.unit_id from app.lessons lesson
  where lesson.school_id=school and lesson.id in(select activity.lesson_id from activity_sources activity)
 ),unit_sources as materialized(
  select unit.school_id,unit.id,unit.course_id from app.units unit
  where unit.school_id=school and unit.id in(select lesson.unit_id from lesson_sources lesson)
 ),submission_sources as materialized(
  select submission.school_id,submission.id,submission.assessment_id,submission.learner_id,submission.submitted_at,submission.return_id,submission.previous_submission_id from app.submissions submission
  where submission.school_id=school and submission.learner_id=target_learner and submission.id in(select observation.source_object_id from observations observation where observation.source_type='SUBMISSION_REVISION')
 ),assessment_sources as materialized(
  select assessment.school_id,assessment.id,assessment.course_id from app.assessments assessment
  where assessment.school_id=school and assessment.id in(select submission.assessment_id from submission_sources submission)
 ),return_sources as materialized(
  select returned.school_id,returned.id,returned.learner_id,returned.submission_id from app.submission_returns returned
  where returned.school_id=school and returned.learner_id=target_learner and returned.id in(select submission.return_id from submission_sources submission)
 ),candidate_course_ids as materialized(
  select unit.course_id id from unit_sources unit union select assessment.course_id from assessment_sources assessment
 ),candidate_courses as materialized(
  select course.school_id,course.id from app.courses course where course.school_id=school and course.class_id=period.class_id and course.id in(select id from candidate_course_ids)
 ),authorized_courses as materialized(
  select course.school_id,course.id from candidate_courses course where"authorization".can_read_course(school,course.id)and"authorization".current_learner_course(school,course.id,target_learner)
 ),authorized_sources as materialized(
  select observation.id,observation.kind,observation.source_event_id,observation.occurred_at from observations observation
  join processed_sources processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
  join event_sources event on event.school_id=processed.school_id and event.id=processed.event_id
  join completion_sources completion on completion.school_id=observation.school_id and completion.id=observation.source_object_id
  join activity_sources activity on activity.school_id=completion.school_id and activity.id=completion.activity_id
  join lesson_sources lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id
  join unit_sources unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
  join authorized_courses course on course.school_id=unit.school_id and course.id=unit.course_id
  where observation.source_type='ACTIVITY_COMPLETION'and completion.learner_id=target_learner and completion.completed_at=observation.occurred_at and activity.kind=observation.kind
   and processed.source_type='COMPLETION'and processed.source_id=completion.id and event.actor_id=target_learner and event.entity_id=completion.id and event.type='activity.complete'and event.entity_type='activity'
  union all
  select observation.id,observation.kind,observation.source_event_id,observation.occurred_at from observations observation
  join processed_sources processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
  join event_sources event on event.school_id=processed.school_id and event.id=processed.event_id
  join submission_sources submission on submission.school_id=observation.school_id and submission.id=observation.source_object_id
  join assessment_sources assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
  join authorized_courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
  join return_sources returned on returned.school_id=submission.school_id and returned.id=submission.return_id
  where observation.source_type='SUBMISSION_REVISION'and observation.kind='revision'and submission.learner_id=target_learner and submission.submitted_at=observation.occurred_at
   and returned.learner_id=target_learner and returned.submission_id=submission.previous_submission_id
   and processed.source_type='SUBMISSION_REVISION'and processed.source_id=submission.id and event.actor_id=target_learner and event.entity_id=submission.id and event.type='submission.resubmitted'and event.entity_type='submission'
 ),verified as materialized(
  select ledger.observation_id,(authorized.occurred_at at time zone'UTC')::date recorded_day from candidates ledger
  join authorized_sources authorized on authorized.id=ledger.observation_id and authorized.kind=ledger.kind and authorized.occurred_at=ledger.occurred_at
  join app.recognition_policies policy on policy.school_id=ledger.school_id and policy.id=ledger.policy_id and policy.id=period.policy_id
  where ledger.points=case ledger.kind when'practice'then policy.practice_points when'revision'then policy.revision_points when'reflection'then policy.reflection_points end
 ),days as materialized(select distinct recorded_day from verified),ordered as(select recorded_day,row_number()over(order by recorded_day desc)::integer ordinal from days),latest_block as(select recorded_day from ordered where recorded_day=(select max(recorded_day)from days)-(ordinal-1))
 select(select count(*)from verified),(select count(*)from days),(select count(*)from latest_block),(select max(recorded_day)from days)into source_count,recorded_days,streak_days,ending_day;
 if source_count=0 then return unknown;end if;
 return jsonb_build_object('status','RECORDED','basis','VERIFIED_RECOGNIZED_ACTION_DAYS','timezone','UTC','days',streak_days,'endingOn',to_char(ending_day,'YYYY-MM-DD'),'recordedDays',recorded_days,'sourceCount',source_count);
end$$;
commit;
