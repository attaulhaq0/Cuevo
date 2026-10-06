begin;
-- Historical context bytes are immutable; new disclosure still needs current authority
-- for every saved source, independent of the current top-N retrieval page.
create function internal.insight_result_allowed(target_school uuid,target_result uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text,require_current boolean)returns boolean language sql stable security definer set search_path=''as $$
select coalesce(exists(
 select 1 from app.result_revisions result
 join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id
 join app.academic_evidence evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id
 join app.school_custom_references reference on reference.school_id=result.school_id and reference.id=result.reference_id
 join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
 where result.school_id=target_school and result.id=target_result and result.learner_id=target_learner and assessment.course_id=target_course
  and result.reference_id=target_reference and result.reference_version=target_version and reference.status='APPROVED'and version.version=result.reference_version
  and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id
  and"authorization".can_manage_baseline(target_school,result.id)and"authorization".can_read_course(target_school,assessment.course_id)
  and"authorization".programme_course_allowed(target_school,assessment.course_id,result.learner_id)
  and(not require_current or exists(select 1 from app.current_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id))
 ),false)
$$;
create function internal.insight_outcome_allowed(target_school uuid,target_outcome uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text)returns boolean language sql stable security definer set search_path=''as $$
select coalesce(exists(
 select 1 from app.outcome_measurements outcome join app.interventions intervention on intervention.school_id=outcome.school_id and intervention.id=outcome.intervention_id
 join app.result_revisions baseline on baseline.school_id=outcome.school_id and baseline.id=outcome.baseline_result_id
 join app.result_revisions followup on followup.school_id=outcome.school_id and followup.id=outcome.follow_up_result_id
 join app.submissions submission on submission.school_id=followup.school_id and submission.id=followup.submission_id
 where outcome.school_id=target_school and outcome.id=target_outcome and outcome.learner_id=target_learner and intervention.learner_id=target_learner
  and intervention.baseline_result_id=baseline.id and intervention.follow_up_assessment_id=followup.assessment_id and intervention.completed_at is not null
  and followup.max_score=baseline.max_score and outcome.difference=followup.score-baseline.score
  and outcome.baseline_score=baseline.score and outcome.follow_up_score=followup.score and outcome.baseline_max_score=baseline.max_score and outcome.follow_up_max_score=followup.max_score
  and submission.submitted_at>intervention.completed_at and followup.created_at>intervention.completed_at
  and internal.insight_result_allowed(target_school,baseline.id,target_learner,target_course,target_reference,target_version,false)
  and internal.insight_result_allowed(target_school,followup.id,target_learner,target_course,target_reference,target_version,true)
 ),false)
$$;
create function internal.require_stored_insight_scope(target_run uuid)returns void language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;stored jsonb;course uuid;learner uuid;reference uuid;version text;source jsonb;observation app.habit_observations;intervention app.interventions;outcome app.outcome_measurements;
begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run;
 if not found or not"authorization".can_manage_baseline(run.school_id,run.baseline_result_id)then raise exception 'Stored insight source denied'using errcode='42501';end if;
 perform internal.require_intelligence_policy(run.generation_mode,run.policy_version);perform internal.intelligence_context(run.baseline_result_id);
 select details.context into stored from app.intelligence_context_details details where details.school_id=run.school_id and details.run_id=run.id;
 if stored is null then return;end if;
 course:=(stored->>'courseId')::uuid;learner:=(stored->>'learnerId')::uuid;reference:=(stored->'reference'->>'id')::uuid;version:=stored->'reference'->>'version';
 if learner is distinct from run.learner_id or not internal.insight_result_allowed(run.school_id,run.baseline_result_id,learner,course,reference,version,true)then raise exception 'Stored insight baseline denied'using errcode='42501';end if;
 for source in select*from jsonb_array_elements(stored->'recentResults')loop
  if not internal.insight_result_allowed(run.school_id,(source->>'resultId')::uuid,learner,course,reference,version,true)
   or not exists(select 1 from app.result_revisions result where result.school_id=run.school_id and result.id=(source->>'resultId')::uuid and result.evidence_id=(source->>'evidenceId')::uuid and result.reference_id=(source->>'referenceId')::uuid and result.reference_version=source->>'referenceVersion'and result.score=(source->>'score')::numeric and result.max_score=(source->>'maxScore')::numeric)
  then raise exception 'Stored insight result denied'using errcode='42501';end if;
 end loop;
 for source in select*from jsonb_array_elements(stored->'observations')loop
  select*into observation from app.habit_observations where school_id=run.school_id and id=(source->>'id')::uuid;
  if observation.id is null or observation.learner_id<>learner or observation.kind is distinct from source->>'kind'or observation.source_object_id is distinct from(source->>'sourceObjectId')::uuid or observation.source_event_id is distinct from(source->>'sourceEventId')::uuid or observation.occurred_at is distinct from(source->>'occurredAt')::timestamptz
   or not exists(select 1 from internal.processed_events processed join internal.outbox_events event on event.school_id=processed.school_id and event.id=processed.event_id where processed.school_id=run.school_id and processed.event_id=observation.source_event_id and event.actor_id=learner and processed.source_id=observation.source_object_id and event.entity_id=observation.source_object_id
    and((observation.source_type='ACTIVITY_COMPLETION'and processed.source_type='COMPLETION'and event.type='activity.complete'and event.entity_type='activity')or(observation.source_type='SUBMISSION_REVISION'and processed.source_type='SUBMISSION_REVISION'and event.type='submission.resubmitted'and event.entity_type='submission')))
  then raise exception 'Stored insight observation denied'using errcode='42501';end if;
  if observation.source_type='ACTIVITY_COMPLETION'then
   if not exists(select 1 from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
    where completion.school_id=run.school_id and completion.id=observation.source_object_id and completion.learner_id=learner and completion.completed_at=observation.occurred_at and activity.kind=observation.kind and unit.course_id=course)
   then raise exception 'Stored insight learning observation denied'using errcode='42501';end if;
  elsif observation.source_type='SUBMISSION_REVISION'then
   if not exists(select 1 from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.submission_returns returned on returned.school_id=submission.school_id and returned.id=submission.return_id
    where submission.school_id=run.school_id and submission.id=observation.source_object_id and submission.learner_id=learner and submission.submitted_at=observation.occurred_at and observation.kind='revision'and returned.submission_id=submission.previous_submission_id and returned.learner_id=learner and assessment.course_id=course)
   then raise exception 'Stored insight revision observation denied'using errcode='42501';end if;
  else raise exception 'Stored insight observation type denied'using errcode='42501';end if;
 end loop;
 for source in select*from jsonb_array_elements(stored->'priorInterventions')loop
  select*into intervention from app.interventions where school_id=run.school_id and id=(source->>'id')::uuid;
  if intervention.id is null or intervention.learner_id<>learner or intervention.baseline_result_id is distinct from(source->>'baselineResultId')::uuid
   or not internal.insight_result_allowed(run.school_id,intervention.baseline_result_id,learner,course,reference,version,false)
   or(intervention.follow_up_assessment_id is not null and not exists(select 1 from app.assessments reassessment where reassessment.school_id=run.school_id and reassessment.id=intervention.follow_up_assessment_id and reassessment.course_id=course and"authorization".can_read_course(run.school_id,reassessment.course_id)and"authorization".programme_course_allowed(run.school_id,reassessment.course_id,learner)))
  then raise exception 'Stored insight intervention denied'using errcode='42501';end if;
  if source->'outcome'is not null and source->'outcome'<>'null'::jsonb then
   select*into outcome from app.outcome_measurements where school_id=run.school_id and id=(source->'outcome'->>'id')::uuid;
   if outcome.id is null or outcome.intervention_id<>intervention.id or not internal.insight_outcome_allowed(run.school_id,outcome.id,learner,course,reference,version)
    or outcome.baseline_result_id is distinct from(source->'outcome'->>'baselineResultId')::uuid or outcome.follow_up_result_id is distinct from(source->'outcome'->>'followUpResultId')::uuid or outcome.status is distinct from source->'outcome'->>'status'or outcome.difference is distinct from(source->'outcome'->>'difference')::numeric or outcome.minimum_change is distinct from(source->'outcome'->>'minimumChange')::numeric
   then raise exception 'Stored insight outcome denied'using errcode='42501';end if;
  end if;
 end loop;
 for source in select*from jsonb_array_elements(stored->'learningOptions')loop
  if not exists(select 1 from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id join app.courses source_course on source_course.school_id=unit.school_id and source_course.id=unit.course_id
   where activity.school_id=run.school_id and activity.id=(source->>'activityId')::uuid and unit.course_id=course and source_course.status='PUBLISHED'and activity.kind in('practice','reflection','reading')and"authorization".can_read_course(run.school_id,course)and"authorization".programme_course_allowed(run.school_id,course,learner))
  then raise exception 'Stored insight option denied'using errcode='42501';end if;
 end loop;
end$$;
create or replace function internal.read_teacher_insight_context(target_run uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare stored jsonb;begin
 perform internal.require_stored_insight_scope(target_run);
 select context into stored from app.intelligence_context_details where school_id="authorization".school_id()and run_id=target_run;
 return jsonb_build_object('runId',target_run,'context',stored);
end$$;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'if stored is not null then perform internal.teacher_insight_context(baseline_id);end if;',
  'if stored is not null then perform internal.require_stored_insight_scope(run.id);end if;');
 if definition=previous then raise exception 'Stored insight replay source shape changed'using errcode='22023';end if;execute definition;
end$$;
revoke execute on function internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean),internal.insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text),internal.require_stored_insight_scope(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on function internal.read_teacher_insight_context(uuid)from public,anon,authenticated,service_role,cuevo_worker;
grant execute on function internal.read_teacher_insight_context(uuid)to cuevo_api;
commit;
