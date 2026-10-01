begin;

-- Preserve the already-reviewed numeric/completion processor. Only the worker-facing wrapper is callable.
alter function internal.process_learner_event(uuid,uuid) rename to process_core_learning_event;
revoke execute on function internal.process_core_learning_event(uuid,uuid) from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create function internal.refresh_support_impact(target_school uuid,target_learner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare items jsonb;outcomes jsonb;active_ids uuid[];measurement_ids uuid[];events uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended(target_school::text||':learner:'||target_learner::text,0));
 if (select count(*) from app.interventions where school_id=target_school and learner_id=target_learner)>100 then
  raise exception 'Support projection requires bounded review' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'recommendationId',i.recommendation_id,'learnerId',i.learner_id,'referenceId',i.reference_id,'baselineResultId',i.baseline_result_id,
  'title',i.title,'instructions',i.instructions,'status',case when o.id is not null then 'MEASURED' when c.id is not null then 'COMPLETED' else 'ASSIGNED' end,
  'createdAt',i.created_at,'completedAt',c.created_at,'followUpAssessmentId',case when exists(select 1 from internal.processed_events pe where pe.school_id=i.school_id and pe.source_type='REASSESSMENT' and pe.source_id=i.id) then i.follow_up_assessment_id else null end
 )order by i.created_at,i.id),'[]'::jsonb),coalesce(array_agg(i.id)filter(where o.id is null),array[]::uuid[])
 into items,active_ids
 from app.interventions i
 left join app.intervention_completions c on c.school_id=i.school_id and c.intervention_id=i.id and exists(select 1 from internal.processed_events pe where pe.school_id=c.school_id and pe.source_type='INTERVENTION_COMPLETION' and pe.source_id=c.id)
 left join app.outcome_measurements o on o.school_id=i.school_id and o.intervention_id=i.id and exists(select 1 from internal.processed_events pe where pe.school_id=o.school_id and pe.source_type='OUTCOME' and pe.source_id=o.id)
 where i.school_id=target_school and i.learner_id=target_learner and exists(select 1 from internal.processed_events pe where pe.school_id=i.school_id and pe.source_type='RECOMMENDATION_APPROVAL' and pe.source_id=i.recommendation_id);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'interventionId',o.intervention_id,'baselineResultId',o.baseline_result_id,'followUpResultId',o.follow_up_result_id,
  'status',o.status,'difference',o.difference,'minimumChange',o.minimum_change,
  'baseline',jsonb_build_object('score',o.baseline_score,'maxScore',o.baseline_max_score),
  'followUp',jsonb_build_object('score',o.follow_up_score,'maxScore',o.follow_up_max_score),
  'reason',o.reason,'limitation',o.limitation,'measuredAt',o.measured_at
 )order by o.measured_at,o.id),'[]'::jsonb),coalesce(array_agg(o.id order by o.measured_at,o.id),array[]::uuid[])
 into outcomes,measurement_ids from app.outcome_measurements o
 where o.school_id=target_school and o.learner_id=target_learner and exists(select 1 from internal.processed_events pe where pe.school_id=o.school_id and pe.source_type='OUTCOME' and pe.source_id=o.id)
 and exists(select 1 from jsonb_array_elements(items) item where item->>'id'=o.intervention_id::text and item->>'status'='MEASURED');
 select coalesce(array_agg(distinct event_id),array[]::uuid[]) into events from (
  select unnest(source_event_ids) event_id from app.learner_state_snapshots where school_id=target_school and learner_id=target_learner
  union select pe.event_id from internal.processed_events pe where pe.school_id=target_school and (
   (pe.source_type='RECOMMENDATION_APPROVAL' and pe.source_id in(select id from app.recommendations where school_id=target_school and learner_id=target_learner))
   or(pe.source_type='INTERVENTION_COMPLETION' and pe.source_id in(select id from app.intervention_completions where school_id=target_school and learner_id=target_learner))
   or(pe.source_type='REASSESSMENT' and pe.source_id in(select id from app.interventions where school_id=target_school and learner_id=target_learner))
   or(pe.source_type='OUTCOME' and pe.source_id in(select id from app.outcome_measurements where school_id=target_school and learner_id=target_learner))
  )
 ) sources;
 if cardinality(events)>1000 or jsonb_array_length(outcomes)>100 or octet_length(items::text)+octet_length(outcomes::text)>500000 then raise exception 'Support projection requires bounded review' using errcode='22023';end if;
 update app.learner_state_snapshots set support=jsonb_build_object('activeInterventionIds',active_ids,'items',items),
  impact=jsonb_build_object('status',case when cardinality(measurement_ids)>0 then 'measured' else 'unmeasured' end,'measurementIds',measurement_ids,'outcomes',outcomes),source_event_ids=events
 where school_id=target_school and learner_id=target_learner;
end $$;

create function internal.process_learner_event(target_event uuid,current_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e internal.outbox_events;rec app.recommendations;i app.interventions;c app.intervention_completions;o app.outcome_measurements;
 learner uuid;source_kind text;source_id uuid;decision app.human_decisions;answer jsonb;
begin
 select *into e from internal.outbox_events where id=target_event for update;
 if not found or e.state<>'PROCESSING' or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp() then raise exception 'Invalid event lease' using errcode='22023';end if;
 if e.type not in('recommendation.approved','intervention.created','intervention.completed','reassessment.linked','outcome.measured') then
  answer:=internal.process_core_learning_event(target_event,current_lease);
  if answer->>'status'='PROCESSED' then perform internal.refresh_support_impact(e.school_id,(answer->>'learnerId')::uuid);end if;
  return answer;
 end if;
 if exists(select 1 from internal.processed_events where event_id=e.id) then
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement' using errcode='22023';end if;return jsonb_build_object('status','DUPLICATE');
 end if;
 if e.type='recommendation.approved' then
  -- Earlier canonical events use entity_type intervention with the recommendation ID. Source kind determines resolution.
  select *into rec from app.recommendations where school_id=e.school_id and id=e.entity_id;
  select d.*into decision from app.human_decisions d where d.school_id=e.school_id and d.recommendation_id=rec.id and d.decision='APPROVE';
  select *into i from app.interventions where school_id=e.school_id and recommendation_id=rec.id;
  if rec.id is null or i.id is null or decision.id is null or e.actor_id<>decision.actor_id or e.entity_type not in('intervention','recommendation') then raise exception 'Invalid approval source' using errcode='22023';end if;
  learner:=i.learner_id;source_kind:='RECOMMENDATION_APPROVAL';source_id:=rec.id;
 elsif e.type='intervention.created' then
  select *into i from app.interventions where school_id=e.school_id and id=e.entity_id;
  select d.*into decision from app.human_decisions d where d.school_id=e.school_id and d.recommendation_id=i.recommendation_id and d.decision='APPROVE';
  if i.id is null or decision.id is null or e.actor_id<>decision.actor_id or e.entity_type<>'intervention' then raise exception 'Invalid intervention source' using errcode='22023';end if;
  learner:=i.learner_id;source_kind:='RECOMMENDATION_APPROVAL';source_id:=i.recommendation_id;
 elsif e.type='intervention.completed' then
  select *into i from app.interventions where school_id=e.school_id and id=e.entity_id;
  select *into c from app.intervention_completions where school_id=e.school_id and intervention_id=i.id;
  if i.id is null or c.id is null or e.actor_id<>c.learner_id or c.learner_id<>i.learner_id or e.entity_type<>'intervention' then raise exception 'Invalid intervention completion source' using errcode='22023';end if;
  learner:=i.learner_id;source_kind:='INTERVENTION_COMPLETION';source_id:=c.id;
 elsif e.type='reassessment.linked' then
  select *into i from app.interventions where school_id=e.school_id and id=e.entity_id;
  if i.id is null or i.follow_up_assessment_id is null or i.completed_at is null or e.entity_type<>'intervention'
    or not exists(select 1 from internal.audit_events ae where ae.school_id=e.school_id and ae.action=e.type and ae.entity_id=i.id and ae.actor_id=e.actor_id and ae.outcome='succeeded')then raise exception 'Invalid reassessment source' using errcode='22023';end if;
  learner:=i.learner_id;source_kind:='REASSESSMENT';source_id:=i.id;
 else
  select *into o from app.outcome_measurements where school_id=e.school_id and id=e.entity_id;
  select *into i from app.interventions where school_id=e.school_id and id=o.intervention_id;
  if o.id is null or i.id is null or o.learner_id<>i.learner_id or e.entity_type<>'outcome'
   or not exists(select 1 from internal.audit_events ae where ae.school_id=e.school_id and ae.action=e.type and ae.entity_id=o.id and ae.actor_id=e.actor_id and ae.outcome='succeeded')
   or not exists(select 1 from app.result_revisions b join app.result_revisions f on f.school_id=b.school_id join app.submissions s on s.school_id=f.school_id and s.id=f.submission_id
    where b.school_id=o.school_id and b.id=o.baseline_result_id and f.id=o.follow_up_result_id and b.learner_id=o.learner_id and f.learner_id=o.learner_id
     and b.reference_id=f.reference_id and b.reference_version=f.reference_version and b.max_score=f.max_score and f.assessment_id=i.follow_up_assessment_id
     and s.submitted_at>i.completed_at and f.created_at>i.completed_at and o.difference=f.score-b.score and o.baseline_score=b.score and o.follow_up_score=f.score
     and o.baseline_max_score=b.max_score and o.follow_up_max_score=f.max_score)
  then raise exception 'Invalid measured outcome source' using errcode='22023';end if;
  learner:=i.learner_id;source_kind:='OUTCOME';source_id:=o.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(e.school_id::text||':learner:'||learner::text,0));
 if exists(select 1 from internal.processed_events pe where pe.school_id=e.school_id and pe.source_type=source_kind and pe.source_id=source_id) then
  insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id);if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','DUPLICATE_SOURCE');
 end if;
 if not exists(select 1 from app.schools where id=e.school_id and status='active') or not exists(select 1 from app.entitlements where school_id=e.school_id and code='learner.state'and enabled and effective_from<=now()and(effective_to is null or effective_to>now()))then raise exception 'Learner state policy unavailable'using errcode='42501';end if;
 insert into internal.processed_events(event_id,school_id,source_type,source_id)values(e.id,e.school_id,source_kind,source_id);
 insert into app.learner_state_snapshots(school_id,learner_id,version,academic,development,engagement,support,impact,source_event_ids)
 values(e.school_id,learner,1,'[]','{"practice":{"count":null,"observationIds":[]},"revision":{"count":null,"observationIds":[]},"reflection":{"count":null,"observationIds":[]},"windowStart":null,"windowEnd":null}','{"completedActivityCount":null,"lastCompletedAt":null}','{"activeInterventionIds":[],"items":[]}','{"status":"unmeasured","measurementIds":[],"outcomes":[]}',array[e.id])
 on conflict(school_id,learner_id)do update set version=app.learner_state_snapshots.version+1,generated_at=clock_timestamp();
 perform internal.refresh_support_impact(e.school_id,learner);
 insert into internal.outbox_events(school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
 values(e.school_id,e.actor_id,'learner_state.updated','learner',learner,1,'{}','state:'||e.id::text)on conflict(school_id,deduplication_key)do nothing;
 if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;
 return jsonb_build_object('status','PROCESSED','learnerId',learner);
end $$;
revoke execute on function internal.refresh_support_impact(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
