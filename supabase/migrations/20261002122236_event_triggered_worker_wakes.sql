begin;
-- Best-effort transport wakes the existing durable outbox; it never stores domain work.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
revoke usage on schema net,vault from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke all on all tables in schema net,vault from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create table internal.worker_dispatch_control(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 endpoint text,
 vault_secret_name text,
 allow_local boolean not null default false,
 state text not null default'DISABLED'check(state in('DISABLED','IDLE','REQUESTED','RUNNING','BACKOFF')),
 wake_id uuid,
 lease_expires_at timestamptz,
 network_request_id bigint,
 next_attempt_at timestamptz not null default clock_timestamp(),
 failure_count integer not null default 0 check(failure_count between 0 and 10),
 last_requested_at timestamptz,
 last_started_at timestamptz,
 last_finished_at timestamptz,
 last_error_code text check(last_error_code is null or last_error_code in('WAKE_TRANSPORT_UNAVAILABLE','WORKER_REQUIRES_REVIEW','WORKER_FAILURE_RECEIPT_UNKNOWN','WORKER_NO_PROGRESS','WAKE_LEASE_EXPIRED')),
 last_processed_count integer not null default 0 check(last_processed_count between 0 and 100),
 check(not enabled or(endpoint is not null and vault_secret_name is not null)),
 check((state in('REQUESTED','RUNNING')and enabled and wake_id is not null and lease_expires_at is not null)or(state not in('REQUESTED','RUNNING')and wake_id is null and lease_expires_at is null)),
 check(enabled or state='DISABLED')
);
alter table internal.worker_dispatch_control enable row level security;
alter table internal.worker_dispatch_control force row level security;
revoke all on internal.worker_dispatch_control from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
insert into internal.worker_dispatch_control(singleton)values(true);

create function internal.worker_dispatch_due()returns boolean language sql volatile security definer set search_path=''as $$
 select exists(select 1 from internal.outbox_events event where
  event.state='PENDING'and event.attempt_count<event.max_attempts and event.available_at<=clock_timestamp()
  or event.state='PROCESSING'and event.lease_until<=clock_timestamp())
$$;

create function internal.configure_worker_dispatch(target_enabled boolean,target_endpoint text,target_secret_name text,target_allow_local boolean)returns boolean
language plpgsql security definer set search_path=''as $$begin
 if target_enabled is null or target_allow_local is null then raise exception 'Explicit worker dispatch configuration required'using errcode='22023';end if;
 if target_enabled then
  if target_secret_name is null or target_secret_name!~'^[A-Za-z][A-Za-z0-9_-]{0,99}$'or target_endpoint is null then raise exception 'Fixed endpoint and Vault reference required'using errcode='22023';end if;
  if target_allow_local then
   -- Operator-local attestation adds defense; deployment tooling must also verify the actual Cuevo project.
   if current_setting('app.runtime_env',true)is distinct from'local'or target_endpoint<>'http://supabase_kong_cuevo:8000/functions/v1/cuevo-worker'then raise exception 'Guarded local worker endpoint required'using errcode='22023';end if;
  elsif target_endpoint!~'^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:443)?/functions/v1/cuevo-worker$'or lower(split_part(split_part(target_endpoint,'/',3),':',1))in('localhost','127.0.0.1','host.docker.internal','supabase_kong_cuevo')then
   raise exception 'Fixed remote HTTPS worker endpoint required'using errcode='22023';
  end if;
 elsif target_endpoint is not null or target_secret_name is not null or target_allow_local then raise exception 'Paused configuration clears transport references'using errcode='22023';end if;
 update internal.worker_dispatch_control set enabled=target_enabled,endpoint=target_endpoint,vault_secret_name=target_secret_name,allow_local=target_allow_local,
  state=case when target_enabled then'IDLE'else'DISABLED'end,wake_id=null,lease_expires_at=null,network_request_id=null,next_attempt_at=clock_timestamp(),failure_count=0,last_error_code=null;
 return true;
end$$;

create function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint
language plpgsql security definer set search_path=''as $$declare token text;request_id bigint;begin
 select secret.decrypted_secret into token from vault.decrypted_secrets secret where secret.name=target_secret_name;
 if token is null or length(token)not between 20 and 4096 or token~'[[:cntrl:]]'then raise exception 'Worker transport unavailable'using errcode='22023';end if;
 select net.http_post(url:=target_endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('version',1,'wakeId',target_wake),timeout_milliseconds:=1000)into request_id;
 if request_id is null then raise exception 'Worker transport unavailable'using errcode='22023';end if;
 return request_id;
end$$;

create function internal.request_worker_wake()returns boolean language plpgsql security definer set search_path=''as $$
declare control internal.worker_dispatch_control;generation uuid;request_id bigint;failures integer;begin
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or not control.enabled or control.next_attempt_at>clock_timestamp()or not internal.worker_dispatch_due()then return false;end if;
 if control.state in('REQUESTED','RUNNING')and control.lease_expires_at>clock_timestamp()then return false;end if;
 generation:=gen_random_uuid();
 begin request_id:=internal.send_worker_wake(generation,control.endpoint,control.vault_secret_name);
 exception when others then
  failures:=least(control.failure_count+1,10);
  update internal.worker_dispatch_control set state='BACKOFF',wake_id=null,lease_expires_at=null,network_request_id=null,failure_count=failures,
   next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,30*(2^least(failures-1,4))::integer)),last_error_code='WAKE_TRANSPORT_UNAVAILABLE'where singleton;
  return false;
 end;
 update internal.worker_dispatch_control set state='REQUESTED',wake_id=generation,lease_expires_at=clock_timestamp()+interval'60 seconds',network_request_id=request_id,last_requested_at=clock_timestamp(),
  last_error_code=case when control.state in('REQUESTED','RUNNING')then'WAKE_LEASE_EXPIRED'else null end where singleton;
 return true;
exception when lock_not_available then return false;when others then return false;
end$$;

create function internal.begin_worker_wake(target_wake uuid)returns boolean language plpgsql security definer set search_path=''as $$
declare control internal.worker_dispatch_control;begin
 if coalesce((internal.worker_health()->>'ready')::boolean,false)is not true then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or not control.enabled or control.state<>'REQUESTED'or control.wake_id is distinct from target_wake or control.lease_expires_at<=clock_timestamp()then return false;end if;
 -- The 60-second invocation lease starts at issuance and is never silently extended by admission.
 update internal.worker_dispatch_control set state='RUNNING',last_started_at=clock_timestamp()where singleton;
 return true;
exception when lock_not_available then return false;
end$$;

create function internal.finish_worker_wake(target_wake uuid,target_status text,target_processed integer)returns boolean language plpgsql security definer set search_path=''as $$
declare control internal.worker_dispatch_control;failures integer;due boolean;begin
 if target_status is null or target_status not in('COMPLETED','REQUIRES_REVIEW','FAILURE_RECEIPT_UNKNOWN')or target_processed is null or target_processed not between 0 and 100 then raise exception 'Sanitized bounded worker outcome required'using errcode='22023';end if;
 if coalesce((internal.worker_health()->>'ready')::boolean,false)is not true then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or not control.enabled or control.state<>'RUNNING'or control.wake_id is distinct from target_wake or control.lease_expires_at<=clock_timestamp()then return false;end if;
 due:=internal.worker_dispatch_due();
 if target_status='COMPLETED'and(target_processed>0 or not due)then
  update internal.worker_dispatch_control set state='IDLE',wake_id=null,lease_expires_at=null,network_request_id=null,failure_count=0,next_attempt_at=clock_timestamp(),last_finished_at=clock_timestamp(),last_processed_count=target_processed,last_error_code=null where singleton;
  if due then perform internal.request_worker_wake();end if;
 else
  failures:=least(control.failure_count+1,10);
  update internal.worker_dispatch_control set state='BACKOFF',wake_id=null,lease_expires_at=null,network_request_id=null,failure_count=failures,last_finished_at=clock_timestamp(),last_processed_count=target_processed,
   next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,30*(2^least(failures-1,4))::integer)),
   last_error_code=case target_status when'REQUIRES_REVIEW'then'WORKER_REQUIRES_REVIEW'when'FAILURE_RECEIPT_UNKNOWN'then'WORKER_FAILURE_RECEIPT_UNKNOWN'else'WORKER_NO_PROGRESS'end where singleton;
 end if;
 return true;
exception when lock_not_available then return false;
end$$;

create function internal.worker_dispatch_health()returns jsonb language plpgsql security definer set search_path=''as $$
declare health jsonb;control internal.worker_dispatch_control;begin
 health:=internal.worker_health();
 if coalesce((health->>'ready')::boolean,false)is not true then return jsonb_build_object('ready',false);end if;
 select*into control from internal.worker_dispatch_control where singleton;
 return health||jsonb_build_object('enabled',control.enabled,'state',control.state,'leaseExpiresAt',control.lease_expires_at,'nextAttemptAt',control.next_attempt_at,'failureCount',control.failure_count,
  'lastRequestedAt',control.last_requested_at,'lastStartedAt',control.last_started_at,'lastFinishedAt',control.last_finished_at,'lastErrorCode',control.last_error_code,'lastProcessedCount',control.last_processed_count,
  'dueWork',internal.worker_dispatch_due());
end$$;

create function internal.outbox_worker_wake_trigger()returns trigger language plpgsql security definer set search_path=''as $$begin
 perform internal.request_worker_wake();return null;
exception when others then return null;
end$$;
create trigger outbox_worker_wake after insert on internal.outbox_events for each statement execute function internal.outbox_worker_wake_trigger();

revoke execute on function internal.worker_dispatch_due(),internal.configure_worker_dispatch(boolean,text,text,boolean),internal.send_worker_wake(uuid,text,text),internal.request_worker_wake(),internal.begin_worker_wake(uuid),internal.finish_worker_wake(uuid,text,integer),internal.worker_dispatch_health(),internal.outbox_worker_wake_trigger()
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.begin_worker_wake(uuid),internal.finish_worker_wake(uuid,text,integer),internal.worker_dispatch_health()to cuevo_worker;
-- Recovery scheduling and endpoint/Vault provisioning remain an explicit operator activation.
commit;
