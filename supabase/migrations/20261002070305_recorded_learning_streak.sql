begin;
-- Recognized action days remain a bounded factual projection of the existing immutable ledger.
create function internal.recorded_learning_streak(target_learner uuid,target_period uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();period app.recognition_periods;unknown jsonb;candidate_count integer;source_count integer;recorded_days integer;streak_days integer;ending_day date;present timestamptz:=statement_timestamp();begin
 unknown:=jsonb_build_object('status','UNOBSERVED','basis','VERIFIED_RECOGNIZED_ACTION_DAYS','timezone','UTC','days',null,'endingOn',null,'recordedDays',null,'sourceCount',null);
 if not"authorization".can_access_school(school)or not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)is null or"authorization".current_role(school)not in('student','teacher','coordinator','admin')or not"authorization".can_view_person(school,target_learner)then raise exception 'Recorded action day scope denied'using errcode='42501';end if;
 if target_period is null then return unknown||jsonb_build_object('status','PERIOD_REQUIRED');end if;
 select*into period from app.recognition_periods where school_id=school and id=target_period;
 if period.id is null or not internal.current_period_scope(target_period,target_learner)or not"authorization".can_view_class(school,period.class_id)then raise exception 'Exact current learner recognition period required'using errcode='42501';end if;
 if not internal.recognition_enabled(school,false)then return unknown||jsonb_build_object('status','DISABLED');end if;
 -- Count the candidate envelope before per-source inspection; overflow never becomes a partial streak.
 select count(*)into candidate_count from(select 1 from app.xp_ledger ledger where ledger.school_id=school and ledger.learner_id=target_learner and ledger.period_id=target_period and ledger.occurred_at>=period.starts_at and ledger.occurred_at<period.ends_at and ledger.occurred_at<=present order by ledger.id limit 10001)bounded;
 if candidate_count>10000 then return unknown||jsonb_build_object('status','REQUIRES_REVIEW');end if;
 with candidates as materialized(select ledger.*from app.xp_ledger ledger where ledger.school_id=school and ledger.learner_id=target_learner and ledger.period_id=target_period and ledger.occurred_at>=period.starts_at and ledger.occurred_at<period.ends_at and ledger.occurred_at<=present order by ledger.id limit 10000),
 verified as materialized(
  select ledger.observation_id,(observation.occurred_at at time zone'UTC')::date recorded_day from candidates ledger
  join app.habit_observations observation on observation.school_id=ledger.school_id and observation.id=ledger.observation_id and observation.learner_id=ledger.learner_id and observation.kind=ledger.kind and observation.occurred_at=ledger.occurred_at
  join app.recognition_policies policy on policy.school_id=ledger.school_id and policy.id=ledger.policy_id and policy.id=period.policy_id
  join internal.processed_events processed on processed.school_id=observation.school_id and processed.event_id=observation.source_event_id and processed.source_id=observation.source_object_id
  join internal.outbox_events event on event.school_id=processed.school_id and event.id=processed.event_id and event.state='COMPLETED'and event.actor_id=observation.learner_id and event.entity_id=observation.source_object_id and event.occurred_at<=present
  where ledger.points=case ledger.kind when'practice'then policy.practice_points when'revision'then policy.revision_points when'reflection'then policy.reflection_points end
   and internal.observation_source_allowed(school,observation.id)
   and(case when observation.source_type='ACTIVITY_COMPLETION'and processed.source_type='COMPLETION'and event.type='activity.complete'and event.entity_type='activity'then exists(select 1 from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id join app.courses course on course.school_id=unit.school_id and course.id=unit.course_id where completion.school_id=school and completion.id=observation.source_object_id and completion.learner_id=target_learner and completion.completed_at=observation.occurred_at and course.class_id=period.class_id)
    when observation.source_type='SUBMISSION_REVISION'and processed.source_type='SUBMISSION_REVISION'and event.type='submission.resubmitted'and event.entity_type='submission'then exists(select 1 from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id where submission.school_id=school and submission.id=observation.source_object_id and submission.learner_id=target_learner and submission.submitted_at=observation.occurred_at and course.class_id=period.class_id)
    else false end)
 ),days as materialized(select distinct recorded_day from verified),ordered as(select recorded_day,row_number()over(order by recorded_day desc)::integer ordinal from days),latest_block as(select recorded_day from ordered where recorded_day=(select max(recorded_day)from days)-(ordinal-1))
 select(select count(*)from verified),(select count(*)from days),(select count(*)from latest_block),(select max(recorded_day)from days)into source_count,recorded_days,streak_days,ending_day;
 if source_count=0 then return unknown;end if;
 return jsonb_build_object('status','RECORDED','basis','VERIFIED_RECOGNIZED_ACTION_DAYS','timezone','UTC','days',streak_days,'endingOn',to_char(ending_day,'YYYY-MM-DD'),'recordedDays',recorded_days,'sourceCount',source_count);
end$$;
revoke execute on function internal.recorded_learning_streak(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
-- Extend only the existing private summary; its original owner/roles and XP/board semantics stay intact.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.development_read(text,jsonb)'::regprocedure);
 anchor:='items jsonb;enabled boolean;';if position(anchor in definition)=0 then raise exception 'Development summary variables changed'using errcode='22023';end if;definition:=replace(definition,anchor,'items jsonb;enabled boolean;streak jsonb;');
 anchor:='if learner is null then raise exception ''Select a learner for personal progress''using errcode=''22023'';end if;';if position(anchor in definition)=0 then raise exception 'Development summary scope changed'using errcode='22023';end if;definition:=replace(definition,anchor,anchor||'streak:=internal.recorded_learning_streak(learner,period);');
 anchor:='''periodId'',period,''leaderboardEnabled'',internal.recognition_enabled(school,true)';
 if position(anchor in definition)=0 then raise exception 'Development summary source changed; review streak insertion'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||',''streak'',streak');execute definition;
end$$;
commit;
