begin;
-- Recognition is an authorized learner action in the source course class, not a transferable point token.
create function internal.recognition_observation_class(target_school uuid,target_observation uuid)returns uuid language plpgsql security definer set search_path=''as $$
declare observation app.habit_observations;source_event internal.outbox_events;source_class uuid;
begin
 select*into observation from app.habit_observations where school_id=target_school and id=target_observation;if not found then return null;end if;
 select*into source_event from internal.outbox_events where school_id=target_school and id=observation.source_event_id;
 if source_event.id is null or source_event.actor_id<>observation.learner_id or not exists(select 1 from internal.processed_events pe where pe.school_id=target_school and pe.event_id=source_event.id)then return null;end if;
 if observation.source_type='ACTIVITY_COMPLETION'then
  if source_event.type<>'activity.complete'or source_event.entity_type<>'activity'or source_event.entity_id<>observation.source_object_id then return null;end if;
  select course.class_id into source_class from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id join app.courses course on course.school_id=unit.school_id and course.id=unit.course_id where completion.school_id=target_school and completion.id=observation.source_object_id and completion.learner_id=observation.learner_id and completion.completed_at=observation.occurred_at and activity.kind=observation.kind;
 elsif observation.source_type='SUBMISSION_REVISION'then
  if source_event.type<>'submission.resubmitted'or source_event.entity_type<>'submission'or source_event.entity_id<>observation.source_object_id then return null;end if;
  select course.class_id into source_class from app.submissions submission join app.submission_returns returned on returned.school_id=submission.school_id and returned.id=submission.return_id join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id where submission.school_id=target_school and submission.id=observation.source_object_id and submission.learner_id=observation.learner_id and submission.submitted_at=observation.occurred_at and returned.submission_id=submission.previous_submission_id and observation.kind='revision';
 end if;
 return source_class;
end$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.award_recognition_observation(uuid,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'if o.id is null or p.id is null',
  'if o.id is null or p.id is null or internal.recognition_observation_class(target_school,target_observation)is distinct from p.class_id');
 execute definition;
 definition:=pg_get_functiondef('internal.process_recognition_event(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'if not found or not exists(select 1 from internal.processed_events',
  'if not found or e.actor_id is distinct from o.learner_id or internal.recognition_observation_class(e.school_id,o.id)is null or not exists(select 1 from internal.processed_events');
 execute definition;
 definition:=pg_get_functiondef('internal.portfolio_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'''portfolio:''||actor::text||'':''||command_key',
  '''portfolio:''||md5(actor::text||'':''||command_name||'':''||command_key)');
 execute definition;
 definition:=pg_get_functiondef('internal.development_command(text,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'''development:''||actor::text||'':''||command_key',
  '''development:''||md5(actor::text||'':''||command_name||'':''||command_key)');
 execute definition;
end$$;
revoke execute on function internal.recognition_observation_class(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
