begin;
alter function internal.process_learner_event(uuid,uuid)rename to process_support_learning_event;
revoke execute on function internal.process_support_learning_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create function internal.refresh_native_academic(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$
declare rows jsonb;events uuid[];
begin
 select coalesce(jsonb_agg(row order by observed_at,result_id),'[]'::jsonb)into rows from(
  select rr.id result_id,rr.created_at observed_at,jsonb_build_object('resultId',rr.id,'referenceId',rr.reference_id,'referenceVersion',rr.reference_version,'nativeResult',jsonb_build_object('type','numeric','score',rr.score,'maxScore',rr.max_score,'policyVersion',rr.policy_version,'normalized',null),'evidenceId',rr.evidence_id,'observedAt',rr.created_at)row
   from app.current_results cr join app.result_revisions rr on rr.school_id=cr.school_id and rr.id=cr.result_id where cr.school_id=target_school and cr.learner_id=target_learner and exists(select 1 from internal.processed_events pe where pe.school_id=rr.school_id and pe.source_type='RESULT'and pe.source_id=rr.id)
  union all select rr.id,rr.created_at,jsonb_build_object('resultId',rr.id,'referenceId',rr.reference_id,'referenceVersion',rr.reference_version,'nativeResult',rr.native_result,'evidenceId',rr.evidence_id,'observedAt',rr.created_at)
   from app.current_rubric_results cr join app.rubric_result_revisions rr on rr.school_id=cr.school_id and rr.id=cr.result_id where cr.school_id=target_school and cr.learner_id=target_learner and exists(select 1 from internal.processed_events pe where pe.school_id=rr.school_id and pe.source_type='RUBRIC_RESULT'and pe.source_id=rr.id)
 )native;
 select coalesce(array_agg(distinct event_id),array[]::uuid[])into events from(
  select unnest(source_event_ids)event_id from app.learner_state_snapshots where school_id=target_school and learner_id=target_learner
  union select pe.event_id from internal.processed_events pe where pe.school_id=target_school and pe.source_type='RUBRIC_RESULT'and pe.source_id in(select id from app.rubric_result_revisions where school_id=target_school and learner_id=target_learner)
 )sources;
 if jsonb_array_length(rows)>100 or cardinality(events)>1000 or octet_length(rows::text)>500000 then raise exception 'Native projection requires bounded review'using errcode='22023';end if;
 update app.learner_state_snapshots set academic=rows,source_event_ids=events where school_id=target_school and learner_id=target_learner;
end$$;

create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare e internal.outbox_events;r app.rubric_result_revisions;answer jsonb;
begin
 select*into e from internal.outbox_events where id=target_event for update;
 if not found or e.state<>'PROCESSING'or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()then raise exception 'Invalid event lease'using errcode='22023';end if;
 if e.type in('rubric.created','assessment.rubric','rubric.assessment.marked','intelligence.started','intelligence.failed')then
  insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','ACKNOWLEDGED');
 elsif e.type<>'rubric.result.released'then
  answer:=internal.process_support_learning_event(target_event,current_lease);
  if answer->>'status'='PROCESSED'then perform internal.refresh_native_academic(e.school_id,(answer->>'learnerId')::uuid);end if;
  return answer;
 end if;
 select*into r from app.rubric_result_revisions where school_id=e.school_id and id=e.entity_id;
 if r.id is null or e.entity_type<>'result'or e.actor_id<>r.created_by or not exists(select 1 from app.rubric_evidence ev where ev.school_id=r.school_id and ev.id=r.evidence_id and ev.result_id=r.id and ev.learner_id=r.learner_id and ev.source_object_id=r.submission_id)then raise exception 'Invalid released rubric source'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(e.school_id::text||':learner:'||r.learner_id::text,0));
 if exists(select 1 from internal.processed_events pe where pe.event_id=e.id or(pe.school_id=e.school_id and pe.source_type='RUBRIC_RESULT'and pe.source_id=r.id))then
  insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','DUPLICATE_SOURCE');
 end if;
 if not exists(select 1 from app.schools where id=e.school_id and status='active')or not exists(select 1 from app.entitlements where school_id=e.school_id and code='learner.state'and enabled and effective_from<=now()and(effective_to is null or effective_to>now()))then raise exception 'Learner state policy unavailable'using errcode='42501';end if;
 insert into internal.processed_events(event_id,school_id,source_type,source_id)values(e.id,e.school_id,'RUBRIC_RESULT',r.id);
 insert into app.learner_state_snapshots(school_id,learner_id,version,academic,development,engagement,support,impact,source_event_ids)
 values(e.school_id,r.learner_id,1,'[]','{"practice":{"count":null,"observationIds":[]},"revision":{"count":null,"observationIds":[]},"reflection":{"count":null,"observationIds":[]},"windowStart":null,"windowEnd":null}','{"completedActivityCount":null,"lastCompletedAt":null}','{"activeInterventionIds":[],"items":[]}','{"status":"unmeasured","measurementIds":[],"outcomes":[]}',array[e.id])
 on conflict(school_id,learner_id)do update set version=app.learner_state_snapshots.version+1,generated_at=clock_timestamp();
 perform internal.refresh_native_academic(e.school_id,r.learner_id);perform internal.refresh_support_impact(e.school_id,r.learner_id);
 insert into internal.outbox_events(school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)values(e.school_id,e.actor_id,'learner_state.updated','learner',r.learner_id,1,'{}','state:'||e.id::text)on conflict(school_id,deduplication_key)do nothing;
 if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;
 return jsonb_build_object('status','PROCESSED','learnerId',r.learner_id);
end$$;
revoke execute on function internal.refresh_native_academic(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
