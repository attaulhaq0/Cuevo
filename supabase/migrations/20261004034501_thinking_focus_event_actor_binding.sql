begin;
-- An acknowledgement must identify the actor that committed this exact revision,
-- including a publisher-created lineage retaining an earlier independent review.
create or replace function internal.thinking_focus_event_source_allowed(target_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from internal.outbox_events e join app.thinking_focus_revisions r on r.school_id=e.school_id and r.id=e.entity_id where e.id=target_event and e.actor_id=r.created_by and e.type in('thinking_focus.drafted','thinking_focus.reviewed')and e.entity_type='thinking_focus'and e.version=r.revision and e.metadata->>'schemaVersion'='1'and e.metadata->>'sourceVersion'=r.source_version and ((e.type='thinking_focus.drafted'and r.state='AWAITING_REVIEW')or(e.type='thinking_focus.reviewed'and r.state in('APPROVED','REJECTED','WITHDRAWN')))),false)
$$;
revoke execute on function internal.thinking_focus_event_source_allowed(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
