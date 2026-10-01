begin;
-- New runs add bounded teacher-authorized context; legacy run snapshots stay immutable.
create table app.intelligence_context_details(
 school_id uuid not null,run_id uuid not null,context jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,run_id),foreign key(school_id,run_id)references app.intelligence_runs(school_id,id),
 check(jsonb_typeof(context)='object'and octet_length(context::text)<=65536)
);
alter table app.intelligence_context_details enable row level security;alter table app.intelligence_context_details force row level security;
revoke all on app.intelligence_context_details from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger immutable_history before update or delete on app.intelligence_context_details for each row execute function internal.academic_history_immutable();
create trigger immutable_truncate before truncate on app.intelligence_context_details for each statement execute function internal.academic_history_immutable();
create function internal.teacher_insight_context(baseline_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();baseline app.result_revisions;course app.courses;reference app.school_custom_references;recent jsonb;observations jsonb;prior jsonb;options jsonb;answer jsonb;
begin
 perform internal.intelligence_context(baseline_id);
 select*into baseline from app.result_revisions where school_id=school and id=baseline_id;
 select c.*into course from app.assessments a join app.courses c on c.school_id=a.school_id and c.id=a.course_id where a.school_id=school and a.id=baseline.assessment_id;
 if not"authorization".can_read_course(school,course.id)or not"authorization".programme_course_allowed(school,course.id,baseline.learner_id)then raise exception 'Insight course denied'using errcode='42501';end if;
 select*into reference from app.school_custom_references where school_id=school and id=baseline.reference_id;
 select coalesce(jsonb_agg(source order by created_at desc,id),'[]'::jsonb)into recent from(
  select r.id,r.created_at,jsonb_build_object('resultId',r.id,'evidenceId',r.evidence_id,'referenceId',r.reference_id,'referenceVersion',r.reference_version,'score',r.score,'maxScore',r.max_score)source
  from app.current_results current_result join app.result_revisions r on r.school_id=current_result.school_id and r.id=current_result.result_id join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id
  where r.school_id=school and r.learner_id=baseline.learner_id and a.course_id=course.id and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version and r.max_score=baseline.max_score
  order by(r.id=baseline_id)desc,r.created_at desc,r.id limit 10
 )bounded;
 select coalesce(jsonb_agg(source order by occurred_at desc,id),'[]'::jsonb)into observations from(
  select o.id,o.occurred_at,jsonb_build_object('id',o.id,'kind',o.kind,'sourceObjectId',o.source_object_id,'sourceEventId',o.source_event_id,'occurredAt',o.occurred_at)source
  from app.habit_observations o join internal.processed_events pe on pe.school_id=o.school_id and pe.event_id=o.source_event_id
  where o.school_id=school and o.learner_id=baseline.learner_id and o.occurred_at>=clock_timestamp()-interval'14 days'
  and((o.source_type='ACTIVITY_COMPLETION'and exists(select 1 from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where completion.school_id=school and completion.id=o.source_object_id and completion.learner_id=baseline.learner_id and unit.course_id=course.id))or(o.source_type='SUBMISSION_REVISION'and exists(select 1 from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id where s.school_id=school and s.id=o.source_object_id and s.learner_id=baseline.learner_id and a.course_id=course.id)))
  order by o.occurred_at desc,o.id limit 20
 )bounded;
 select coalesce(jsonb_agg(source order by created_at desc,id),'[]'::jsonb)into prior from(
  select i.id,i.created_at,jsonb_build_object('id',i.id,'status',i.status,'baselineResultId',i.baseline_result_id,'outcome',case when outcome.id is null then null else jsonb_build_object('id',outcome.id,'status',outcome.status,'difference',outcome.difference,'minimumChange',outcome.minimum_change,'baselineResultId',outcome.baseline_result_id,'followUpResultId',outcome.follow_up_result_id)end)source
  from app.interventions i join app.result_revisions r on r.school_id=i.school_id and r.id=i.baseline_result_id join app.assessments a on a.school_id=r.school_id and a.id=r.assessment_id left join app.outcome_measurements outcome on outcome.school_id=i.school_id and outcome.intervention_id=i.id
  where i.school_id=school and i.learner_id=baseline.learner_id and a.course_id=course.id and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version
  order by i.created_at desc,i.id limit 10
 )bounded;
 select coalesce(jsonb_agg(source order by sequence,id),'[]'::jsonb)into options from(
  select activity.id,activity.sequence,jsonb_build_object('activityId',activity.id,'title',activity.title,'instructions',activity.instructions,'kind',activity.kind)source from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
  where activity.school_id=school and unit.course_id=course.id and course.status='PUBLISHED'and activity.kind in('practice','reflection','reading')and length(activity.instructions)<=4000 order by activity.sequence,activity.id limit 10
 )bounded;
 answer:=jsonb_build_object('schemaVersion','1','learnerId',baseline.learner_id,'courseId',course.id,'classId',course.class_id,'reference',jsonb_build_object('id',reference.id,'version',baseline.reference_version,'title',reference.title),'recentResults',recent,'observations',observations,'priorInterventions',prior,'learningOptions',options,'coverage','BOUNDED_AUTHORIZED_CONTEXT');
 if octet_length(answer::text)>65536 then raise exception 'Insight requires smaller context'using errcode='22023';end if;return answer;
end$$;
create function internal.begin_teacher_insight_run(command_key text,request_fingerprint text,baseline_id uuid,settings jsonb,source_request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare reservation jsonb;context jsonb;stored jsonb;run app.intelligence_runs;
begin
 reservation:=internal.begin_intelligence_run(command_key,request_fingerprint,baseline_id,settings,source_request_id);
 if reservation->>'state'='NEW'then
  context:=internal.teacher_insight_context(baseline_id);insert into app.intelligence_context_details(school_id,run_id,context)values("authorization".school_id(),(reservation->>'runId')::uuid,context);
  return jsonb_set(reservation,'{context}',(reservation->'context')||jsonb_build_object('insight',context));
 end if;
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and actor_id="authorization".actor_id()and command_key=begin_teacher_insight_run.command_key;
 select details.context into stored from app.intelligence_context_details details where details.school_id=run.school_id and details.run_id=run.id;
 if stored is not null then perform internal.teacher_insight_context(baseline_id);end if;
 return reservation;
end$$;
-- Preserve legacy completion while adapting new context runs before the command receipt is finalized.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)'::regprocedure);
 definition:=replace(definition,'internal.complete_intelligence_run(target_run uuid, current_lease uuid, output jsonb, usage jsonb, source_request_id text)','internal.complete_insight_numeric_run(target_run uuid, current_lease uuid, output jsonb, usage jsonb, source_request_id text, selected_activity uuid)');
 definition:=replace(definition,'latency integer;','latency integer;selected_option jsonb;');
 definition:=replace(definition,'-- Server rendering controls every learner factual statement and curriculum/authority instruction.',
  'if selected_activity is not null then select option into selected_option from app.intelligence_context_details details cross join lateral jsonb_array_elements(details.context->''learningOptions'')option where details.school_id=run.school_id and details.run_id=run.id and option->>''activityId''=selected_activity::text;if selected_option is null then raise exception ''Insight learning option denied''using errcode=''22023'';end if;end if;');
 definition:=replace(definition,'case when action=''GUIDED_PRACTICE''then''Try teacher-reviewed guided practice for the approved objective.''else''Review the teacher feedback for the approved objective.''end','case when selected_option is not null then ''Try the teacher-authored learning option for the approved objective.''when action=''GUIDED_PRACTICE''then''Try teacher-reviewed guided practice for the approved objective.''else''Review the teacher feedback for the approved objective.''end');
 definition:=replace(definition,'case when action=''GUIDED_PRACTICE''then''Guided practice''else''Review feedback''end','coalesce(selected_option->>''title'',case when action=''GUIDED_PRACTICE''then''Guided practice''else''Review feedback''end)');
 definition:=replace(definition,'case when action=''GUIDED_PRACTICE''then''Use a teacher-approved example for this objective, practise it, and explain your approach.''else''Review the teacher feedback and explain one next step with your teacher.''end','coalesce(selected_option->>''instructions'',case when action=''GUIDED_PRACTICE''then''Use a teacher-approved example for this objective, practise it, and explain your approach.''else''Review the teacher feedback and explain one next step with your teacher.''end)');
 if position('complete_insight_numeric_run'in definition)=0 or position('selected_option jsonb'in definition)=0 then raise exception 'Intelligence completion shape changed'using errcode='22023';end if;execute definition;
end$$;
revoke execute on function internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
alter function internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)rename to complete_numeric_intelligence_run;
revoke execute on function internal.complete_numeric_intelligence_run(uuid,uuid,jsonb,jsonb,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.complete_intelligence_run(target_run uuid,current_lease uuid,output jsonb,usage jsonb,source_request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;stored jsonb;current_context jsonb;activity jsonb;answer jsonb;recommendation_id uuid;
begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run and actor_id="authorization".actor_id()for update;
 if not found then raise exception 'Insight run denied'using errcode='42501';end if;
 select context into stored from app.intelligence_context_details where school_id=run.school_id and run_id=run.id;
 if stored is not null then
  current_context:=internal.teacher_insight_context(run.baseline_result_id);if current_context is distinct from stored then raise exception 'Insight sources changed; review again'using errcode='22023';end if;
 end if;
 if output?'selectedActivityId'then
  if stored is null or jsonb_typeof(output->'selectedActivityId')<>'string'then raise exception 'Insight learning option denied'using errcode='22023';end if;
  select item into activity from jsonb_array_elements(stored->'learningOptions')item where item->>'activityId'=output->>'selectedActivityId';if activity is null then raise exception 'Insight learning option denied'using errcode='22023';end if;
 end if;
 answer:=internal.complete_insight_numeric_run(target_run,current_lease,output-'selectedActivityId',usage,source_request_id,case when activity is null then null else(activity->>'activityId')::uuid end);
 return answer;
end$$;
create function internal.read_teacher_insight_context(target_run uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare run app.intelligence_runs;stored jsonb;begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run;
 if not found or not"authorization".can_manage_baseline(run.school_id,run.baseline_result_id)then raise exception 'Insight disclosure denied'using errcode='42501';end if;
 perform internal.require_intelligence_policy(run.generation_mode,run.policy_version);perform internal.teacher_insight_context(run.baseline_result_id);
 select context into stored from app.intelligence_context_details where school_id=run.school_id and run_id=run.id;return jsonb_build_object('runId',run.id,'context',stored);
end$$;
revoke execute on function internal.teacher_insight_context(uuid),internal.begin_teacher_insight_run(text,text,uuid,jsonb,text),internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text),internal.read_teacher_insight_context(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.begin_teacher_insight_run(text,text,uuid,jsonb,text),internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text),internal.read_teacher_insight_context(uuid)to cuevo_api;
commit;
