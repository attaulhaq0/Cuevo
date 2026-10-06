begin;
-- Current native pages share exact learner programme scope with evidence and state reads.
do $$declare definition text;previous text;guard text;begin
 definition:=pg_get_functiondef('internal.list_current_native_results_scoped(integer,uuid,uuid)'::regprocedure);previous:=definition;
 guard:='(role_name not in(''student'',''parent'')or"authorization".programme_course_allowed(school,assessment.course_id,r.learner_id))';
 definition:=replace(definition,guard,'"authorization".programme_course_allowed(school,assessment.course_id,r.learner_id)');
 if definition=previous or position(guard in definition)>0 then raise exception 'Current native programme guard shape changed'using errcode='22023';end if;
 execute definition;
end$$;
-- Current sharing reports the active exact revision pointer, not a historical approval bit.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_portfolio_page(integer,uuid,uuid,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'review.featured,review.parent_visible,review.reviewed_at',
  'review.featured,(current_item.parent_revision_id=r.id and coalesce(review.parent_visible,false))as parent_visible,review.reviewed_at');
 if definition=previous then raise exception 'Portfolio current visibility source changed'using errcode='22023';end if;execute definition;
end$$;
-- Signal disclosure resolves each candidate's authorized observation set once.
create or replace function internal.read_current_practice_signals(page_limit integer,page_cursor uuid,target_learner uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();candidate app.learner_signals;rows jsonb:='[]';observations jsonb;authorized_ids uuid[];ids uuid[];events uuid[];count_value integer;begin
 if not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)not in('admin','coordinator','teacher','student')or page_limit is null or page_limit not between 1 and 100 then raise exception 'Signal projection denied'using errcode='42501';end if;
 if target_learner is not null and not"authorization".can_view_person(school,target_learner)then raise exception 'Signal learner denied'using errcode='42501';end if;
 for candidate in select signal.*from app.learner_signals signal where signal.school_id=school and signal.expires_at>clock_timestamp()and(page_cursor is null or signal.id>page_cursor)and(target_learner is null or signal.learner_id=target_learner)
  and"authorization".can_view_person(school,signal.learner_id)and signal.rule_version=(select version from app.learner_state_policies where school_id=school)order by signal.id loop
  select coalesce(jsonb_agg(to_jsonb(source)), '[]'::jsonb)into observations from internal.authorized_observation_sources(school,candidate.learner_id,candidate.window_start,candidate.window_end)source where source.kind='practice';
  count_value:=jsonb_array_length(observations);
  select coalesce(array_agg((source->>'id')::uuid),array[]::uuid[])into authorized_ids from jsonb_array_elements(observations)source;
  if count_value<>candidate.count or cardinality(candidate.observation_ids)=0 or cardinality(candidate.observation_ids)>count_value or not candidate.observation_ids<@authorized_ids then continue;end if;
  select coalesce(array_agg((source->>'id')::uuid),array[]::uuid[]),coalesce(array_agg(distinct(source->>'source_event_id')::uuid),array[]::uuid[])into ids,events from jsonb_array_elements(observations)source where(source->>'id')::uuid=any(candidate.observation_ids);
  rows:=rows||jsonb_build_array(jsonb_build_object('id',candidate.id,'learnerId',candidate.learner_id,'type',candidate.type,'count',count_value,'ruleVersion',candidate.rule_version,'windowStart',candidate.window_start,'windowEnd',candidate.window_end,'sourceEventIds',events,'observationIds',ids,'sourceCoverage',jsonb_build_object('totalCount',count_value,'returnedCount',cardinality(ids),'truncated',count_value>cardinality(ids)),'status','ACTIVE','uncertainty','OBSERVATION_ONLY','createdAt',candidate.created_at));
  exit when jsonb_array_length(rows)>page_limit;
 end loop;
 if octet_length(rows::text)>500000 then raise exception 'Signal source page requires smaller content'using errcode='22023';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)from jsonb_array_elements(rows)with ordinality value(item,ordinal)where ordinal<=page_limit),'nextCursor',case when jsonb_array_length(rows)>page_limit then rows->(page_limit-1)->>'id'else null end);
end$$;
-- Build UUID source sets once before scanning processed event provenance.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'authorized_courses uuid[];', 'academic_ids uuid[];observation_event_ids uuid[];recommendation_ids uuid[];outcome_ids uuid[];authorized_courses uuid[];');
 definition:=replace(definition,' with sources as materialized(select processed.event_id',
  'select coalesce(array_agg((item->>''resultId'')::uuid),array[]::uuid[])into academic_ids from jsonb_array_elements(academic)item;select coalesce(array_agg((item->>''source_event_id'')::uuid),array[]::uuid[])into observation_event_ids from jsonb_array_elements(authorized_observations)item;select coalesce(array_agg((item->>''recommendationId'')::uuid),array[]::uuid[])into recommendation_ids from jsonb_array_elements(items)item;select coalesce(array_agg((item->>''id'')::uuid),array[]::uuid[])into outcome_ids from jsonb_array_elements(outcomes)item;with sources as materialized(select processed.event_id');
 definition:=replace(definition,'processed.source_id in(select(item->>''resultId'')::uuid from jsonb_array_elements(academic)item)', 'processed.source_id=any(academic_ids)');
 definition:=replace(definition,'processed.event_id in(select(observation->>''source_event_id'')::uuid from jsonb_array_elements(authorized_observations)observation)', 'processed.event_id=any(observation_event_ids)');
 definition:=replace(definition,'processed.source_id in(select(item->>''recommendationId'')::uuid from jsonb_array_elements(items)item)', 'processed.source_id=any(recommendation_ids)');
 definition:=replace(definition,'processed.source_id in(select(item->>''id'')::uuid from jsonb_array_elements(outcomes)item)', 'processed.source_id=any(outcome_ids)');
 if definition=previous or position('processed.event_id=any(observation_event_ids)'in definition)=0 then raise exception 'Current provenance source shape changed'using errcode='22023';end if;execute definition;
end$$;
-- These bounded interactive reads avoid costly JIT compilation of authorization helper plans.
-- This is function-local and changes neither source scope nor the runtime statement budget.
alter function internal.read_current_learner_projection(uuid)set jit='off';
alter function internal.read_current_practice_signals(integer,uuid,uuid)set jit='off';
commit;
