begin;
-- Resolve current actor/course/learner scope once, then validate persisted observation joins set-wise.
create function internal.authorized_observation_sources(target_school uuid,target_learner uuid,start_at timestamptz,end_at timestamptz)returns table(id uuid,kind text,source_event_id uuid,occurred_at timestamptz)
language plpgsql stable security definer set search_path=''as $$declare courses uuid[];begin
 if not"authorization".has_entitlement(target_school,'learner.state')or"authorization".current_role(target_school)='parent'or not"authorization".can_view_person(target_school,target_learner)then return;end if;
 select coalesce(array_agg(course.id),array[]::uuid[])into courses from app.courses course
 where course.school_id=target_school and"authorization".can_read_course(target_school,course.id)and"authorization".current_learner_course(target_school,course.id,target_learner);
 return query
 select observation.id,observation.kind,observation.source_event_id,observation.occurred_at
 from app.habit_observations observation
 join internal.processed_events processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
 join internal.outbox_events event on event.school_id=processed.school_id and event.id=processed.event_id
 join app.activity_completions completion on completion.school_id=observation.school_id and completion.id=observation.source_object_id
 join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id
 join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id
 join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
 where observation.school_id=target_school and observation.learner_id=target_learner and observation.source_type='ACTIVITY_COMPLETION'
 and(start_at is null or observation.occurred_at>=start_at)and(end_at is null or observation.occurred_at<=end_at)
 and unit.course_id=any(courses)and completion.learner_id=target_learner and completion.completed_at=observation.occurred_at and activity.kind=observation.kind
 and processed.source_type='COMPLETION'and processed.source_id=completion.id and event.actor_id=target_learner and event.entity_id=completion.id and event.type='activity.complete'and event.entity_type='activity'
 union all
 select observation.id,observation.kind,observation.source_event_id,observation.occurred_at
 from app.habit_observations observation
 join internal.processed_events processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id
 join internal.outbox_events event on event.school_id=processed.school_id and event.id=processed.event_id
 join app.submissions submission on submission.school_id=observation.school_id and submission.id=observation.source_object_id
 join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
 join app.submission_returns returned on returned.school_id=submission.school_id and returned.id=submission.return_id
 where observation.school_id=target_school and observation.learner_id=target_learner and observation.source_type='SUBMISSION_REVISION'
 and(start_at is null or observation.occurred_at>=start_at)and(end_at is null or observation.occurred_at<=end_at)
 and assessment.course_id=any(courses)and observation.kind='revision'and submission.learner_id=target_learner and submission.submitted_at=observation.occurred_at
 and returned.submission_id=submission.previous_submission_id and returned.learner_id=target_learner
 and processed.source_type='SUBMISSION_REVISION'and processed.source_id=submission.id and event.actor_id=target_learner and event.entity_id=submission.id and event.type='submission.resubmitted'and event.entity_type='submission';
end$$;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'count_value integer;','count_value integer;authorized_observations jsonb;');
 definition:=replace(definition,' foreach kind_name in array',
  'select coalesce(jsonb_agg(to_jsonb(source)),''[]''::jsonb)into authorized_observations from internal.authorized_observation_sources(school,target_learner,start_at,end_at)source where role_name<>''parent''and not is_stale;foreach kind_name in array');
 definition:=replace(definition,'select count(*)into count_value from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and observation.kind=kind_name and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id)',
  'select count(*)into count_value from jsonb_array_elements(authorized_observations)observation where observation->>''kind''=kind_name');
 definition:=replace(definition,'select coalesce(array_agg(id),array[]::uuid[])into ids from(select observation.id from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and observation.kind=kind_name and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id)order by observation.occurred_at desc,observation.id limit 1000)bounded',
  'select coalesce(array_agg(id),array[]::uuid[])into ids from(select(observation->>''id'')::uuid id from jsonb_array_elements(authorized_observations)observation where observation->>''kind''=kind_name order by(observation->>''occurred_at'')::timestamptz desc,(observation->>''id'')::uuid limit 1000)bounded');
 definition:=replace(definition,'select observation.source_event_id from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and not is_stale and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id)',
  'select(observation->>''source_event_id'')::uuid from jsonb_array_elements(authorized_observations)observation');
 if definition=previous or position('from internal.authorized_observation_sources'in definition)=0 then raise exception 'Observation projection source changed'using errcode='22023';end if;
 execute definition;
end$$;
revoke execute on function internal.authorized_observation_sources(uuid,uuid,timestamptz,timestamptz)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
