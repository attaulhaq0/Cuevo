begin;
alter function internal.process_learner_event(uuid,uuid)rename to process_all_domain_sources;
revoke execute on function internal.process_all_domain_sources(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare e internal.outbox_events;answer jsonb;learner uuid;
begin
 select*into e from internal.outbox_events where id=target_event for update;
 if not found or e.state<>'PROCESSING'or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()then raise exception 'Invalid event lease'using errcode='22023';end if;
 if e.type='attention.updated'then insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','ACKNOWLEDGED');end if;
 answer:=internal.process_all_domain_sources(target_event,current_lease);
 if answer->>'status'='PROCESSED'then learner:=(answer->>'learnerId')::uuid;perform internal.refresh_native_attention(e.school_id,learner);
 elsif e.type in('submission.create','quiz.submitted')then
  if e.type='submission.create'then select learner_id into learner from app.submissions where school_id=e.school_id and id=e.entity_id;else select learner_id into learner from app.quiz_attempts where school_id=e.school_id and id=e.entity_id;end if;
  if learner is not null then perform internal.refresh_native_attention(e.school_id,learner);end if;
 end if;
 return answer;
end$$;
revoke execute on function internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
