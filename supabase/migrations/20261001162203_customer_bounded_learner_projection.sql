begin;
-- The bounded projection is a view of current sources, not the learner's complete history.
create function internal.current_native_sources(target_school uuid,target_learner uuid)returns table(result_id uuid,evidence_id uuid,submission_id uuid,assessment_id uuid,reference_id uuid,reference_version text,native_result jsonb,observed_at timestamptz,parent_visible boolean)
language sql stable security definer set search_path=''as $$
 select result.id,result.evidence_id,result.submission_id,result.assessment_id,result.reference_id,result.reference_version,jsonb_build_object('type','numeric','score',result.score,'maxScore',result.max_score,'policyVersion',result.policy_version,'normalized',null),result.created_at,result.parent_visible
 from app.current_results pointer join app.result_revisions result on result.school_id=pointer.school_id and result.id=pointer.result_id
 join app.current_submissions submission on submission.school_id=result.school_id and submission.submission_id=result.submission_id
 where result.school_id=target_school and result.learner_id=target_learner
 union all select result.id,result.evidence_id,result.submission_id,result.assessment_id,result.reference_id,result.reference_version,result.native_result,result.created_at,result.parent_visible
 from app.current_rubric_results pointer join app.rubric_result_revisions result on result.school_id=pointer.school_id and result.id=pointer.result_id
 join app.current_submissions submission on submission.school_id=result.school_id and submission.submission_id=result.submission_id
 where result.school_id=target_school and result.learner_id=target_learner
$$;
create function internal.refresh_projected_source_events(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$declare events uuid[];begin
 select coalesce(array_agg(event_id),array[]::uuid[])into events from(select distinct processed.event_id from internal.processed_events processed
 where processed.school_id=target_school and(
 (processed.source_type in('RESULT','RUBRIC_RESULT')and processed.source_id in(select(item->>'resultId')::uuid from app.learner_state_snapshots snapshot cross join lateral jsonb_array_elements(snapshot.academic)item where snapshot.school_id=target_school and snapshot.learner_id=target_learner))
 or(processed.event_id in(select observation.source_event_id from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and observation.occurred_at>=clock_timestamp()-make_interval(days=>(select development_window_days from app.learner_state_policies where school_id=target_school))))
 or(processed.source_type='COMPLETION'and processed.source_id in(select completion.id from app.activity_completions completion where completion.school_id=target_school and completion.learner_id=target_learner and completion.completed_at>=clock_timestamp()-make_interval(days=>(select development_window_days from app.learner_state_policies where school_id=target_school))))
 or(processed.source_type='RECOMMENDATION_APPROVAL'and processed.source_id in(select(item->>'recommendationId')::uuid from app.learner_state_snapshots snapshot cross join lateral jsonb_array_elements(snapshot.support->'items')item where snapshot.school_id=target_school and snapshot.learner_id=target_learner))
 or(processed.source_type='OUTCOME'and processed.source_id in(select(item->>'id')::uuid from app.learner_state_snapshots snapshot cross join lateral jsonb_array_elements(snapshot.impact->'outcomes')item where snapshot.school_id=target_school and snapshot.learner_id=target_learner)))
 order by processed.event_id limit 1000)bounded;
 update app.learner_state_snapshots set source_event_ids=events where school_id=target_school and learner_id=target_learner;
end$$;
create or replace function internal.refresh_native_academic(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$declare rows jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('resultId',result_id,'referenceId',reference_id,'referenceVersion',reference_version,'nativeResult',native_result,'evidenceId',evidence_id,'observedAt',observed_at)order by observed_at desc,result_id),'[]'::jsonb)into rows
 from(select*from internal.current_native_sources(target_school,target_learner)source where exists(select 1 from internal.processed_events processed where processed.school_id=target_school and processed.source_id=source.result_id and processed.source_type in('RESULT','RUBRIC_RESULT'))order by observed_at desc,result_id limit 100)bounded;
 if octet_length(rows::text)>500000 then raise exception 'Native source page requires smaller content'using errcode='22023';end if;
 update app.learner_state_snapshots set academic=rows where school_id=target_school and learner_id=target_learner;
 perform internal.refresh_projected_source_events(target_school,target_learner);
end$$;
create or replace function internal.refresh_revision_habit(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$
declare days integer;start_at timestamptz;end_at timestamptz;development_value jsonb:='{}';kind_name text;count_value integer;ids uuid[];begin
 select development_window_days into days from app.learner_state_policies where school_id=target_school;if days is null then raise exception 'Approved development policy required'using errcode='22023';end if;
 end_at:=clock_timestamp();start_at:=end_at-make_interval(days=>days);
 foreach kind_name in array array['practice','revision','reflection']loop
  select count(*)into count_value from app.habit_observations where school_id=target_school and learner_id=target_learner and kind=kind_name and occurred_at>=start_at and occurred_at<=end_at;
  select coalesce(array_agg(id),array[]::uuid[])into ids from(select id from app.habit_observations where school_id=target_school and learner_id=target_learner and kind=kind_name and occurred_at>=start_at and occurred_at<=end_at order by occurred_at desc,id limit 1000)bounded;
  development_value:=development_value||jsonb_build_object(kind_name,jsonb_build_object('count',case when kind_name='revision'and count_value=0 then null else count_value end,'observationIds',ids));
 end loop;
 development_value:=development_value||jsonb_build_object('completeness','RECORDED_ONLY','windowStart',start_at,'windowEnd',end_at);
 update app.learner_state_snapshots set development=development_value where school_id=target_school and learner_id=target_learner;
 perform internal.refresh_projected_source_events(target_school,target_learner);
end$$;
-- Preserve validation and event identity while replacing full-lifetime materialization.
do $$declare definition text;start_at integer;end_at integer;begin
 definition:=pg_get_functiondef('internal.process_core_learning_event(uuid,uuid)'::regprocedure);
 start_at:=position(' if (select count(*)from(select 1 from app.current_results'in definition);end_at:=position(' select count(*)filter(where kind=''practice'')'in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Core academic projection source changed'using errcode='22023';end if;
 definition:=overlay(definition placing ' academic_rows:=''[]'';'||chr(10)from start_at for end_at-start_at);
 start_at:=position(' select count(*)filter(where kind=''practice'')'in definition);end_at:=position(' insert into app.learner_state_snapshots'in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Core observation projection source changed'using errcode='22023';end if;
 definition:=overlay(definition placing ' development_state:=''{}'';engagement_state:=jsonb_build_object(''completedActivityCount'',null,''lastCompletedAt'',null);events:=array[e.id];'||chr(10)from start_at for end_at-start_at);
 definition:=replace(definition,' if count_practice>0 then',' perform internal.refresh_native_academic(e.school_id,learner);perform internal.refresh_revision_habit(e.school_id,learner);select count(*),max(completed_at)into completed,last_completed from app.activity_completions completion where completion.school_id=e.school_id and completion.learner_id=learner and exists(select 1 from internal.processed_events processed where processed.school_id=e.school_id and processed.source_type=''COMPLETION''and processed.source_id=completion.id);update app.learner_state_snapshots set engagement=jsonb_build_object(''completedActivityCount'',completed,''lastCompletedAt'',last_completed)where school_id=e.school_id and learner_id=learner;select count(*)into count_practice from app.habit_observations where school_id=e.school_id and learner_id=learner and kind=''practice''and occurred_at>=start_at;select coalesce(array_agg(id),array[]::uuid[])into ids_practice from(select id from app.habit_observations where school_id=e.school_id and learner_id=learner and kind=''practice''and occurred_at>=start_at order by occurred_at desc,id limit 1000)bounded;if count_practice>0 then');
 execute definition;
end$$;
create function internal.read_current_learner_projection(target_learner uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();snapshot app.learner_state_snapshots;role_name text;academic jsonb;development_value jsonb;observed_coverage jsonb:='{}';kind_name text;ids uuid[];count_value integer;total_native integer;native_cursor uuid;days integer;start_at timestamptz;end_at timestamptz;items jsonb;outcomes jsonb;active_ids uuid[];measurement_ids uuid[];events uuid[];event_count integer;completion_count integer;last_completion timestamptz;is_stale boolean;begin
 if not"authorization".has_entitlement(school,'learner.state')or not"authorization".can_view_person(school,target_learner)then raise exception 'Current learner projection denied'using errcode='42501';end if;
 role_name:="authorization".current_role(school);select*into snapshot from app.learner_state_snapshots where school_id=school and learner_id=target_learner;
 select development_window_days into days from app.learner_state_policies where school_id=school;
 end_at:=case when snapshot.development->>'windowEnd'is null then null else(snapshot.development->>'windowEnd')::timestamptz end;
 is_stale:=end_at is null or end_at<clock_timestamp()-interval '60 seconds';
 start_at:=case when end_at is null or days is null then null else end_at-make_interval(days=>days)end;
 with sources as materialized(select source.*from internal.current_native_sources(school,target_learner)source
 where"authorization".can_read_academic_source(school,target_learner,source.parent_visible,source.assessment_id)
 and(role_name in('admin','coordinator')or exists(select 1 from app.assessments assessment where assessment.school_id=school and assessment.id=source.assessment_id and"authorization".current_learner_course(school,assessment.course_id,target_learner)))
 and(role_name='parent'or exists(select 1 from internal.processed_events processed where processed.school_id=school and processed.source_id=source.result_id and processed.source_type in('RESULT','RUBRIC_RESULT')))),
 bounded as(select*from sources order by observed_at desc,result_id limit 100)
 select(select count(*)from sources),coalesce(jsonb_agg(jsonb_build_object('resultId',result_id,'referenceId',reference_id,'referenceVersion',reference_version,'nativeResult',native_result,'evidenceId',evidence_id,'observedAt',observed_at)order by observed_at desc,result_id),'[]'::jsonb)into total_native,academic from bounded;
 -- The report uses ID-order pagination; start from null there to traverse its complete authorized set.
 native_cursor:=null;
 development_value:=jsonb_build_object('practice',jsonb_build_object('count',null,'observationIds','[]'::jsonb),'revision',jsonb_build_object('count',null,'observationIds','[]'::jsonb),'reflection',jsonb_build_object('count',null,'observationIds','[]'::jsonb),'windowStart',null,'windowEnd',null);
 foreach kind_name in array array['practice','revision','reflection']loop
  ids:=array[]::uuid[];count_value:=null;
  if role_name<>'parent'and not is_stale and days is not null then
   select count(*)into count_value from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and observation.kind=kind_name and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id);
   select coalesce(array_agg(id),array[]::uuid[])into ids from(select observation.id from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and observation.kind=kind_name and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id)order by observation.occurred_at desc,observation.id limit 1000)bounded;
   if kind_name='revision'and count_value=0 then count_value:=null;end if;
  end if;
  development_value:=jsonb_set(development_value,array[kind_name],jsonb_build_object('count',count_value,'observationIds',ids));
  observed_coverage:=observed_coverage||jsonb_build_object(kind_name,jsonb_build_object('totalCount',count_value,'returnedCount',cardinality(ids),'truncated',count_value is not null and count_value>cardinality(ids)));
 end loop;
 if role_name<>'parent'and not is_stale and days is not null then development_value:=development_value||jsonb_build_object('completeness','RECORDED_ONLY','windowStart',start_at,'windowEnd',end_at);end if;
 items:='[]';outcomes:='[]';active_ids:=array[]::uuid[];measurement_ids:=array[]::uuid[];
 if role_name<>'parent'and snapshot.learner_id is not null then
  select coalesce(jsonb_agg(item),'[]'::jsonb)into items from jsonb_array_elements(snapshot.support->'items')item
   where exists(select 1 from app.interventions intervention where intervention.school_id=school and intervention.id=(item->>'id')::uuid and"authorization".can_access_intervention(school,intervention.id,false));
  select coalesce(jsonb_agg(item),'[]'::jsonb)into outcomes from jsonb_array_elements(snapshot.impact->'outcomes')item
   where exists(select 1 from jsonb_array_elements(items)support where support->>'id'=item->>'interventionId')
   and exists(select 1 from app.outcome_measurements outcome where outcome.school_id=school and outcome.id=(item->>'id')::uuid and"authorization".can_access_intervention(school,outcome.intervention_id,false));
  select coalesce(array_agg((item->>'id')::uuid),array[]::uuid[])into active_ids from jsonb_array_elements(items)item where item->>'status'<>'MEASURED';
  select coalesce(array_agg((item->>'id')::uuid),array[]::uuid[])into measurement_ids from jsonb_array_elements(outcomes)item;
 end if;
 completion_count:=null;last_completion:=null;
 if role_name<>'parent'and not is_stale and snapshot.learner_id is not null then
  select count(*),max(completion.completed_at)into completion_count,last_completion from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id
   join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id
   where completion.school_id=school and completion.learner_id=target_learner and"authorization".can_read_course(school,unit.course_id)and"authorization".current_learner_course(school,unit.course_id,target_learner)
   and exists(select 1 from internal.processed_events processed where processed.school_id=school and processed.source_type='COMPLETION'and processed.source_id=completion.id);
 end if;
 with sources as materialized(select processed.event_id from internal.processed_events processed where processed.school_id=school and role_name<>'parent'and(
 (processed.source_type in('RESULT','RUBRIC_RESULT')and processed.source_id in(select(item->>'resultId')::uuid from jsonb_array_elements(academic)item))
 or(processed.event_id in(select observation.source_event_id from app.habit_observations observation where observation.school_id=school and observation.learner_id=target_learner and not is_stale and observation.occurred_at>=start_at and observation.occurred_at<=end_at and internal.observation_source_allowed(school,observation.id)))
 or(processed.source_type='RECOMMENDATION_APPROVAL'and processed.source_id in(select(item->>'recommendationId')::uuid from jsonb_array_elements(items)item))
 or(processed.source_type='OUTCOME'and processed.source_id in(select(item->>'id')::uuid from jsonb_array_elements(outcomes)item)))),bounded as(select event_id from sources order by event_id limit 1000)
 select(select count(*)from sources),coalesce(array_agg(event_id),array[]::uuid[])into event_count,events from bounded;
 return jsonb_build_object('learnerId',target_learner,'status',case when role_name='parent'then case when total_native>0 then'READY'else'UNKNOWN'end when snapshot.learner_id is null then'UNKNOWN'else'READY'end,
  'freshness',case when role_name='parent'then'APPROVED_PROJECTION'when is_stale then'STALE'else'CURRENT'end,
  'generatedAt',case when role_name='parent'then null else snapshot.generated_at end,'version',case when role_name='parent'then null else snapshot.version end,
  'academic',academic,'development',development_value,'engagement',jsonb_build_object('completedActivityCount',completion_count,'lastCompletedAt',last_completion),
  'support',jsonb_build_object('activeInterventionIds',active_ids,'items',items),'impact',jsonb_build_object('status',case when cardinality(measurement_ids)>0 then'measured'else'unmeasured'end,'measurementIds',measurement_ids,'outcomes',outcomes),'sourceEventIds',events,
  'projection',jsonb_build_object('scope','CURRENT_AUTHORIZED_SOURCES','academic',jsonb_build_object('totalCount',total_native,'returnedCount',jsonb_array_length(academic),'truncated',total_native>jsonb_array_length(academic),'nextCursor',native_cursor),'observations',observed_coverage,'sourceEvents',jsonb_build_object('totalCount',event_count,'returnedCount',cardinality(events),'truncated',event_count>cardinality(events))));
end$$;
revoke execute on function internal.current_native_sources(uuid,uuid),internal.refresh_projected_source_events(uuid,uuid),internal.read_current_learner_projection(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_current_learner_projection(uuid)to cuevo_api;
commit;
