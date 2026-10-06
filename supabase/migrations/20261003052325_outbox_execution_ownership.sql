begin;

-- Fixed event types own execution. Caller metadata never selects an executor.
create function internal.outbox_event_owner(event_type text) returns text
language sql immutable strict set search_path='' as $$
 select case when event_type in('school.account.provisioning_requested','school.account.recovery_requested')
 then 'SCHOOL_ACCOUNT_AUTH' else 'WORKER' end
$$;
revoke execute on function internal.outbox_event_owner(text) from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create or replace function internal.claim_outbox(batch_size integer,lease_seconds integer)
returns table(id uuid,school_id uuid,actor_id uuid,type text,entity_type text,entity_id uuid,version integer,metadata jsonb,occurred_at timestamptz,lease_token uuid,attempt_count integer)
language plpgsql security definer set search_path='' as $$
begin
 if batch_size is null or lease_seconds is null or batch_size not between 1 and 100 or lease_seconds not between 5 and 300 then raise exception 'Invalid outbox lease bounds' using errcode='22023'; end if;
 update internal.outbox_events o set state='FAILED',lease_token=null,lease_until=null,last_error_code='LEASE_EXHAUSTED'
 where internal.outbox_event_owner(o.type)='WORKER' and o.state='PROCESSING' and o.lease_until<clock_timestamp() and o.attempt_count>=o.max_attempts;
 return query with selected as (
 select o.id from internal.outbox_events o where internal.outbox_event_owner(o.type)='WORKER' and o.attempt_count<o.max_attempts and (
 (o.state='PENDING' and o.available_at<=clock_timestamp()) or (o.state='PROCESSING' and o.lease_until<clock_timestamp()))
 order by o.occurred_at,o.id for update skip locked limit batch_size)
 update internal.outbox_events o set state='PROCESSING',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>lease_seconds),attempt_count=o.attempt_count+1
 from selected where o.id=selected.id returning o.id,o.school_id,o.actor_id,o.type,o.entity_type,o.entity_id,o.version,o.metadata,o.occurred_at,o.lease_token,o.attempt_count;
end $$;

create or replace function internal.complete_outbox(event_id uuid,current_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 update internal.outbox_events set state='COMPLETED',completed_at=clock_timestamp(),lease_token=null,lease_until=null
 where id=event_id and internal.outbox_event_owner(type)='WORKER' and state='PROCESSING' and lease_token=current_lease and lease_until>clock_timestamp();
 get diagnostics affected=row_count; return affected=1;
end $$;

create or replace function internal.fail_outbox(event_id uuid,current_lease uuid,error_code text,retry_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if retry_seconds is null or retry_seconds not between 0 and 3600 or error_code is null or error_code !~ '^[A-Z0-9_]{1,100}$' then raise exception 'Invalid retry metadata' using errcode='22023'; end if;
 update internal.outbox_events set state=case when attempt_count>=max_attempts then 'FAILED' else 'PENDING' end,
 last_error_code=error_code,available_at=clock_timestamp()+make_interval(secs=>retry_seconds),lease_token=null,lease_until=null
 where id=event_id and internal.outbox_event_owner(type)='WORKER' and state='PROCESSING' and lease_token=current_lease and lease_until>clock_timestamp();
 get diagnostics affected=row_count; return affected=1;
end $$;

-- Preserve the composed source processor unchanged behind an owner-only guard.
alter function internal.process_learner_event(uuid,uuid) rename to process_before_account_execution_ownership;
create function internal.process_learner_event(target_event uuid,current_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event internal.outbox_events;
begin
 select * into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING' or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp() then
  raise exception 'Invalid event lease' using errcode='22023';
 end if;
 if internal.outbox_event_owner(event.type) is distinct from 'WORKER' then
  raise exception 'Event belongs to another executor' using errcode='42501';
 end if;
 return internal.process_before_account_execution_ownership(target_event,current_lease);
end $$;

create or replace function internal.worker_health() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('scope','WORKER','ready',
 exists(select 1 from pg_roles r where r.rolname=session_user and not r.rolsuper and not r.rolbypassrls
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('app','internal','authorization')and c.relowner=r.oid)
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('app','internal','authorization')and p.proowner=r.oid))
 and has_function_privilege(session_user,'internal.process_learner_event(uuid,uuid)','EXECUTE')
 and has_function_privilege(session_user,'internal.claim_outbox(integer,integer)','EXECUTE')
 and has_function_privilege(session_user,'internal.fail_outbox(uuid,uuid,text,integer)','EXECUTE'),
 'pendingCount',(select count(*)from internal.outbox_events where internal.outbox_event_owner(type)='WORKER' and state='PENDING'),
 'failedCount',(select count(*)from internal.outbox_events where internal.outbox_event_owner(type)='WORKER' and state='FAILED'),
 'oldestPendingAt',(select min(occurred_at)from internal.outbox_events where internal.outbox_event_owner(type)='WORKER' and state='PENDING'))
$$;

create or replace function internal.worker_dispatch_due() returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from internal.outbox_events event where internal.outbox_event_owner(event.type)='WORKER' and (
 event.state='PENDING'and event.attempt_count<event.max_attempts and event.available_at<=clock_timestamp()
 or event.state='PROCESSING'and event.lease_until<=clock_timestamp())) or internal.posthog_delivery_due()
$$;

revoke execute on function internal.process_before_account_execution_ownership(uuid,uuid),internal.process_learner_event(uuid,uuid),
 internal.worker_health(),internal.worker_dispatch_due(),internal.claim_outbox(integer,integer),internal.complete_outbox(uuid,uuid),internal.fail_outbox(uuid,uuid,text,integer)
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid),internal.worker_health(),internal.claim_outbox(integer,integer),
 internal.complete_outbox(uuid,uuid),internal.fail_outbox(uuid,uuid,text,integer) to cuevo_worker;
commit;
