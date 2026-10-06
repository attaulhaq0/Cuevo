begin;
create function internal.analytics_delivery_allowed(target_event uuid,current_lease uuid)returns boolean language sql stable security definer set search_path=''as $$
select coalesce(exists(select 1 from internal.analytics_delivery delivery join internal.outbox_events event on event.id=delivery.event_id join app.schools school on school.id=event.school_id join app.people person on person.school_id=event.school_id and person.actor_id=event.actor_id
 where delivery.event_id=target_event and delivery.state='PROCESSING'and delivery.lease_token=current_lease and delivery.lease_until>clock_timestamp()and event.state='COMPLETED'and school.status='active'and person.synthetic
 and exists(select 1 from app.school_policy_versions policy where policy.school_id=event.school_id and policy.version=(select max(latest_policy.version)from app.school_policy_versions latest_policy where latest_policy.school_id=event.school_id)and policy.analytics_enabled)),false)
$$;
create or replace function internal.complete_analytics_delivery(target_event uuid,current_lease uuid,target_insert_id text)returns boolean language plpgsql security definer set search_path=''as $$declare affected integer;begin
 if target_insert_id is null or target_insert_id!~'^[a-f0-9]{64}$'then raise exception 'Minimized analytics identity required'using errcode='22023';end if;
 if not internal.analytics_delivery_allowed(target_event,current_lease)then return false;end if;
 update internal.analytics_delivery delivery set state='COMPLETED',insert_id=target_insert_id,completed_at=clock_timestamp(),lease_token=null,lease_until=null where delivery.event_id=target_event and delivery.state='PROCESSING'and delivery.lease_token=current_lease and delivery.lease_until>clock_timestamp();
 get diagnostics affected=row_count;return affected=1;
end$$;
revoke execute on function internal.analytics_delivery_allowed(uuid,uuid),internal.complete_analytics_delivery(uuid,uuid,text)from public,anon,authenticated,service_role,cuevo_api;
grant execute on function internal.analytics_delivery_allowed(uuid,uuid),internal.complete_analytics_delivery(uuid,uuid,text)to cuevo_worker;
commit;
