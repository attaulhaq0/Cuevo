-- Pin delivery admission to the runner's configured synthetic environment before a lease is taken.
begin;
create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer,target_environment text)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb)
language plpgsql security definer set search_path=''as $$begin
 if batch_size is distinct from 1 or lease_seconds is distinct from 30 or target_key_version is null or target_key_version<1 or target_environment is null or target_environment not in('QA','DEMO','STAGING')then raise exception 'Single environment-bound analytics claim required'using errcode='22023';end if;
 update internal.posthog_delivery receipt set state='FAILED',lease_token=null,lease_until=null,last_error_code='CAPTURE_LEASE_EXHAUSTED'where receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp()and receipt.attempts>=5 and receipt.environment=target_environment and receipt.key_version=target_key_version;
 return query with candidates as(
  select event.id,activation.environment,activation.key_version from internal.outbox_events event
  join internal.posthog_school_activation activation on activation.school_id=event.school_id
  join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id
  left join internal.posthog_delivery receipt on receipt.event_id=event.id
  where event.state='COMPLETED'and event.occurred_at>=activation.activated_at and activation.enabled and activation.key_version=target_key_version and activation.environment=target_environment
  and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp())
  and internal.posthog_school_allowed(event.school_id)and internal.posthog_source_event_allowed(event.id)
  and(receipt.event_id is null or(receipt.environment=activation.environment and receipt.key_version=activation.key_version and receipt.attempts<5 and((receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp())or(receipt.state='RETRY'and receipt.available_at<=clock_timestamp()))))
  order by event.occurred_at,event.id for update of event skip locked limit 1
 ),claimed as(
  insert into internal.posthog_delivery as receipt(event_id,environment,key_version,lease_token,lease_until)
  select candidate.id,candidate.environment,candidate.key_version,gen_random_uuid(),clock_timestamp()+interval'30 seconds'from candidates candidate
  on conflict(event_id)do update set state='PROCESSING',attempts=receipt.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until,last_error_code=null
  where receipt.attempts<5 and receipt.environment=excluded.environment and receipt.key_version=excluded.key_version and((receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp())or(receipt.state='RETRY'and receipt.available_at<=clock_timestamp()))
  returning receipt.event_id,receipt.lease_token,receipt.environment,receipt.key_version
 )select event.id,event.school_id,event.actor_id,event.type,event.occurred_at,claimed.lease_token,claimed.environment,claimed.key_version,member.role,internal.posthog_event_diagnostics(event.id)
 from claimed join internal.outbox_events event on event.id=claimed.event_id join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id;
end$$;
create function internal.posthog_delivery_allowed(target_event uuid,current_lease uuid,target_key_version integer,target_environment text)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(target_environment in('QA','DEMO','STAGING')and exists(select 1 from internal.posthog_delivery receipt where receipt.event_id=target_event and receipt.environment=target_environment and receipt.key_version=target_key_version)
 and internal.posthog_delivery_allowed(target_event,current_lease,target_key_version),false)
$$;
-- Historical function bodies remain intact, but runtime callers must provide explicit environment scope.
revoke execute on function internal.claim_posthog_delivery(integer,integer,integer),internal.posthog_delivery_allowed(uuid,uuid,integer),internal.claim_posthog_delivery(integer,integer,integer,text),internal.posthog_delivery_allowed(uuid,uuid,integer,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_posthog_delivery(integer,integer,integer,text),internal.posthog_delivery_allowed(uuid,uuid,integer,text)to cuevo_worker;
commit;
