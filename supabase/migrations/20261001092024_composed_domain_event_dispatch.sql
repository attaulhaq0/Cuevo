begin;
alter function internal.process_learner_event(uuid,uuid)rename to process_education_source_event;
revoke execute on function internal.process_education_source_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare e internal.outbox_events;
begin
 select*into e from internal.outbox_events where id=target_event for update;
 if not found or e.state<>'PROCESSING'or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()then raise exception 'Invalid event lease'using errcode='22023';end if;
 if e.type in('community.post_created','community.changed','moderation.reported')then return internal.process_community_event(target_event,current_lease);
 elsif e.type='asset.updated'then
  if not exists(select 1 from app.private_assets a where a.school_id=e.school_id and a.id=e.entity_id)or e.entity_type<>'asset'then raise exception 'Invalid asset source'using errcode='22023';end if;
  insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','ACKNOWLEDGED');
 else return internal.process_education_source_event(target_event,current_lease);end if;
end$$;
revoke execute on function internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
