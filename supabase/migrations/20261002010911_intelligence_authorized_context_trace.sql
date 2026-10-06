begin;
-- A new prompt run traces the composite private read that actually assembled its
-- authorized context. This is not a model tool call and contains no source prose.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.intelligence_run_immutable()'::regprocedure);
 anchor:='or(old.allowed_actions is not null and new.allowed_actions is distinct from old.allowed_actions)';
 if position(anchor in definition)=0 then raise exception 'Frozen run metadata guard changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'or(old.prompt_digest is not null and new.tool_trace is distinct from old.tool_trace)'||anchor);
 definition:=replace(definition,'-''selected_activity_id''-''analysis''','-''tool_trace''-''selected_activity_id''-''analysis''');execute definition;
end$$;
create function internal.freeze_intelligence_context_trace(target_run uuid)returns void language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;stored jsonb;manifest jsonb;begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run and actor_id="authorization".actor_id()for update;
 if run.id is null or run.state<>'REASONING'or run.prompt_digest is not null then raise exception 'New context trace denied'using errcode='42501';end if;
 select context into stored from app.intelligence_context_details where school_id=run.school_id and run_id=run.id;
 if stored is null then raise exception 'Authorized context trace requires saved sources'using errcode='22023';end if;
 manifest:=jsonb_build_object('resultIds',(select coalesce(jsonb_agg(source->'resultId'),'[]'::jsonb)from jsonb_array_elements(stored->'recentResults')source),
  'observationIds',(select coalesce(jsonb_agg(source->'id'),'[]'::jsonb)from jsonb_array_elements(stored->'observations')source),
  'priorInterventionIds',(select coalesce(jsonb_agg(source->'id'),'[]'::jsonb)from jsonb_array_elements(stored->'priorInterventions')source),
  'activityIds',(select coalesce(jsonb_agg(source->'activityId'),'[]'::jsonb)from jsonb_array_elements(stored->'learningOptions')source));
 update app.intelligence_runs set tool_trace=jsonb_build_array(jsonb_build_object('name','teacher_insight.get_authorized_context','schemaVersion',1,'capability','READ','risk','LOW','approvalRequired',false,'idempotency','READ_ONLY','audit','RUN_CONTEXT','scope','CURRENT_TEACHER_LEARNER','purpose',run.purpose,'dataClassification',run.data_classification,
  'input',jsonb_build_object('baselineResultId',run.baseline_result_id),'evidenceIds',jsonb_build_array(run.context_references->'evidenceId'),'sources',manifest,
  'counts',jsonb_build_object('results',jsonb_array_length(stored->'recentResults'),'observations',jsonb_array_length(stored->'observations'),'priorInterventions',jsonb_array_length(stored->'priorInterventions'),'activities',jsonb_array_length(stored->'learningOptions'))))where school_id=run.school_id and id=run.id;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 anchor:='update app.intelligence_runs set allowed_actions=';
 if position(anchor in definition)=0 then raise exception 'Prompt reservation trace timing changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if settings?''promptDigest''then perform internal.freeze_intelligence_context_trace((reservation->>''runId'')::uuid);end if;'||anchor);execute definition;
end$$;
revoke execute on function internal.freeze_intelligence_context_trace(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
