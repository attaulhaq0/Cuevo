begin;
-- A fresh actionable run must not inherit historical sources that its stored-scope
-- verifier will deny. Historical support remains in the separate reviewed-history reader.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.teacher_insight_context(uuid)'::regprocedure);
 anchor:='where r.school_id=school and r.learner_id=baseline.learner_id and a.course_id=course.id and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version and r.max_score=baseline.max_score';
 if position(anchor in definition)=0 then raise exception 'Insight current result selection shape changed'using errcode='22023';end if;
 replacement:=anchor||' and internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true)';
 definition:=replace(definition,anchor,replacement);
 anchor:='from app.habit_observations o join internal.processed_events pe on pe.school_id=o.school_id and pe.event_id=o.source_event_id';
 if position(anchor in definition)=0 or position('window_days is not null' in definition)=0 then raise exception 'Insight observation selection shape changed'using errcode='22023';end if;
 replacement:=anchor||' join internal.authorized_observation_sources(school,baseline.learner_id,clock_timestamp()-make_interval(days=>window_days),null)authorized_observation on authorized_observation.id=o.id and authorized_observation.source_event_id=o.source_event_id and authorized_observation.kind=o.kind and authorized_observation.occurred_at=o.occurred_at';
 definition:=replace(definition,anchor,replacement);
 anchor:='where i.school_id=school and i.learner_id=baseline.learner_id and a.course_id=course.id';
 if position(anchor in definition)=0 then raise exception 'Insight prior support selection shape changed'using errcode='22023';end if;
 replacement:=anchor||' and internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true) and not exists(select 1 from app.outcome_measurements prior_outcome where prior_outcome.school_id=i.school_id and prior_outcome.intervention_id=i.id and not internal.insight_outcome_allowed(school,prior_outcome.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version))';
 definition:=replace(definition,anchor,replacement);
 if position('r.max_score=baseline.max_score' in definition)=0 or position('followup.reference_version=r.reference_version' in definition)=0 then raise exception 'Insight native source guards changed'using errcode='22023';end if;
 execute definition;
end$$;

-- Reauthorize the exact saved sources, independent of unrelated new top-N options.
-- The numeric helper retains exact baseline/policy/lease/output/usage validation.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)'::regprocedure);
 anchor:='current_context:=internal.teacher_insight_context(run.baseline_result_id);if current_context is distinct from stored then raise exception ''Insight sources changed; review again''using errcode=''22023'';end if;';
 if position(anchor in definition)=0 or position('output-''selectedActivityId''' in definition)=0 or position('internal.complete_insight_numeric_run' in definition)=0 or position('actor_id="authorization".actor_id()for update' in definition)=0 then raise exception 'Insight completion source shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'perform internal.require_stored_insight_scope(target_run);');
 execute definition;
end$$;

-- A saved option means the exact instructional source, not merely a still-existing UUID.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.require_stored_insight_scope(uuid)'::regprocedure);
 anchor:='source_course.status=''PUBLISHED''and activity.kind in(''practice'',''reflection'',''reading'')and"authorization".can_read_course';
 if position(anchor in definition)=0 or position('for source in select*from jsonb_array_elements(stored->''learningOptions'')loop' in definition)=0 then raise exception 'Insight saved option guard shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'source_course.status=''PUBLISHED''and activity.kind in(''practice'',''reflection'',''reading'')and activity.kind=source->>''kind''and activity.title=source->>''title''and activity.instructions=source->>''instructions''and"authorization".can_read_course');
 execute definition;
end$$;

-- Existing private/public surfaces keep their previous least-privilege grants.
revoke execute on function internal.teacher_insight_context(uuid),internal.require_stored_insight_scope(uuid),internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean),internal.insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on function internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)to cuevo_api;
commit;
