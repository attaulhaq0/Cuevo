begin;
-- The worker's current learner/intelligence processor remains the canonical
-- delegate for every other event. Task-demand receipts do not update pupil state.
create function internal.thinking_focus_event_source_allowed(target_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from internal.outbox_events e join app.thinking_focus_revisions r on r.school_id=e.school_id and r.id=e.entity_id where e.id=target_event and e.type in('thinking_focus.drafted','thinking_focus.reviewed')and e.entity_type='thinking_focus'and e.version=r.revision and e.metadata->>'schemaVersion'='1'and e.metadata->>'sourceVersion'=r.source_version and ((e.type='thinking_focus.drafted'and r.state='AWAITING_REVIEW')or(e.type='thinking_focus.reviewed'and r.state in('APPROVED','REJECTED','WITHDRAWN')))),false)
$$;
-- Retain the exact prior authority as a private delegate; do not copy processors.
alter function internal.process_learner_event(uuid,uuid) rename to process_before_thinking_focus;
create function internal.process_learner_event(target_event uuid,current_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare event internal.outbox_events;
begin
 select * into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Invalid event lease'using errcode='22023';end if;
 if event.type not in('thinking_focus.drafted','thinking_focus.reviewed')then return internal.process_before_thinking_focus(target_event,current_lease);end if;
 if not internal.thinking_focus_event_source_allowed(target_event)then raise exception 'Task focus receipt source unavailable'using errcode='22023';end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Task focus lease expired before acknowledgement'using errcode='22023';end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end$$;
revoke execute on function internal.thinking_focus_event_source_allowed(uuid),internal.process_before_thinking_focus(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;