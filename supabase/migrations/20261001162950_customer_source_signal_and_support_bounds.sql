begin;
-- Runtime callers use the source-authorized projection, never raw cached JSON.
revoke select on app.learner_state_snapshots,app.learner_signals from cuevo_api;
create function internal.read_current_practice_signals(page_limit integer,page_cursor uuid,target_learner uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();rows jsonb;begin
 if not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)not in('admin','coordinator','teacher','student')or page_limit is null or page_limit not between 1 and 100 then raise exception 'Signal projection denied'using errcode='42501';end if;
 if target_learner is not null and not"authorization".can_view_person(school,target_learner)then raise exception 'Signal learner denied'using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',signal.id,'learnerId',signal.learner_id,'type',signal.type,'count',signal.count,'ruleVersion',signal.rule_version,'windowStart',signal.window_start,'windowEnd',signal.window_end,
  'sourceEventIds',(select coalesce(jsonb_agg(distinct observation.source_event_id),'[]'::jsonb)from app.habit_observations observation where observation.school_id=school and observation.id=any(signal.observation_ids)),
  'observationIds',signal.observation_ids,'sourceCoverage',jsonb_build_object('totalCount',signal.count,'returnedCount',cardinality(signal.observation_ids),'truncated',signal.count>cardinality(signal.observation_ids)),'status','ACTIVE','uncertainty','OBSERVATION_ONLY','createdAt',signal.created_at)order by signal.id),'[]'::jsonb)into rows
 from(select candidate.*from app.learner_signals candidate where candidate.school_id=school and candidate.expires_at>clock_timestamp()and(candidate.id>page_cursor or page_cursor is null)and(target_learner is null or candidate.learner_id=target_learner)
  and"authorization".can_view_person(school,candidate.learner_id)and candidate.rule_version=(select version from app.learner_state_policies where school_id=school)
  and cardinality(candidate.observation_ids)>0 and candidate.count>=cardinality(candidate.observation_ids)
  and candidate.count=(select count(*)from app.habit_observations observation where observation.school_id=school and observation.learner_id=candidate.learner_id and observation.kind='practice'and observation.occurred_at>=candidate.window_start and observation.occurred_at<=candidate.window_end and internal.observation_source_allowed(school,observation.id))
  and not exists(select 1 from unnest(candidate.observation_ids)source_id where not internal.observation_source_allowed(school,source_id))
  order by candidate.id limit page_limit+1)signal;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)from jsonb_array_elements(rows)with ordinality value(item,ordinal)where ordinal<=page_limit),'nextCursor',case when jsonb_array_length(rows)>page_limit then rows->(page_limit-1)->>'id'else null end);
end$$;
-- Parent portfolio access is the exact selected learner's current source scope.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.portfolio_source(text,uuid,boolean)'::regprocedure);
 definition:=replace(definition,'and(not for_parent or(r.parent_visible and e.parent_visible))',
  'and(not for_parent or(r.parent_visible and e.parent_visible and"authorization".current_learner_course(r.school_id,a.course_id,r.learner_id)))');
 execute definition;
end$$;
-- Preserve source completion/reassessment ordering while bounding support items, not lifetime history.
do $$declare definition text;first integer;last integer;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 first:=position(' if (select count(*) from app.interventions'in definition);last:=position(' select coalesce(jsonb_agg(jsonb_build_object('in definition);
 if first=0 or last<=first then raise exception 'Support bounds source changed'using errcode='22023';end if;
 definition:=overlay(definition placing ''from first for last-first);
 definition:=replace(definition,' from app.interventions i',
  ' from(select*from app.interventions where school_id=target_school and learner_id=target_learner order by created_at desc,id limit 100)i');
 first:=position(' select coalesce(array_agg(distinct event_id)'in definition);last:=position(' update app.learner_state_snapshots set support='in definition);
 if first=0 or last<=first then raise exception 'Support event projection source changed'using errcode='22023';end if;
 definition:=overlay(definition placing ' events:=array[]::uuid[];'||chr(10)from first for last-first);
 definition:=replace(definition,' where school_id=target_school and learner_id=target_learner;'||chr(10)||'end',
  ' where school_id=target_school and learner_id=target_learner;perform internal.refresh_projected_source_events(target_school,target_learner);'||chr(10)||'end');
 execute definition;
end$$;
revoke execute on function internal.read_current_practice_signals(integer,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_current_practice_signals(integer,uuid,uuid)to cuevo_api;
-- Coverage counts all currently authorized processed support sources, including older pages.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);
 definition:=replace(definition,'completion_count integer;', 'support_count integer;outcome_count integer;completion_count integer;');
 definition:=replace(definition,' return jsonb_build_object(''learnerId'',target_learner',
  'select count(*)into support_count from app.interventions intervention where intervention.school_id=school and intervention.learner_id=target_learner and role_name<>''parent''and"authorization".can_access_intervention(school,intervention.id,false)and exists(select 1 from internal.processed_events processed where processed.school_id=school and processed.source_type=''RECOMMENDATION_APPROVAL''and processed.source_id=intervention.recommendation_id);select count(*)into outcome_count from app.outcome_measurements outcome where outcome.school_id=school and outcome.learner_id=target_learner and role_name<>''parent''and"authorization".can_access_intervention(school,outcome.intervention_id,false)and exists(select 1 from internal.processed_events processed where processed.school_id=school and processed.source_type=''OUTCOME''and processed.source_id=outcome.id);return jsonb_build_object(''learnerId'',target_learner');
 definition:=replace(definition,'''observations'',observed_coverage,''sourceEvents''',
  '''support'',jsonb_build_object(''totalCount'',support_count,''returnedCount'',jsonb_array_length(items),''truncated'',support_count>jsonb_array_length(items)),''outcomes'',jsonb_build_object(''totalCount'',outcome_count,''returnedCount'',jsonb_array_length(outcomes),''truncated'',outcome_count>jsonb_array_length(outcomes)),''observations'',observed_coverage,''sourceEvents''');
 execute definition;
end$$;
commit;
