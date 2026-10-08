begin;

-- Graceful operator admission pause is separate from destructive transport disable.
alter table internal.worker_dispatch_control
 add column admission_paused boolean not null default false,
 add column last_completed_wake_id uuid,
 add column execution_generation bigint check(execution_generation>0),
 add column rollout_operation_sha256 text check(rollout_operation_sha256 is null or rollout_operation_sha256~'^[a-f0-9]{64}$'),
 add constraint worker_rollout_pause_owner check(admission_paused=(rollout_operation_sha256 is not null));
revoke all on internal.worker_dispatch_control from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create function internal.pause_worker_admission(expected_endpoint text,expected_secret_name text,expected_generation bigint,operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres' or current_user<>'postgres' then raise exception 'Operator worker admission required'using errcode='42501';end if;
 if operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'then raise exception 'Exact rollout operation required'using errcode='22023';end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found or not control.enabled or control.allow_local or control.endpoint is distinct from expected_endpoint or control.vault_secret_name is distinct from expected_secret_name or control.execution_generation is distinct from expected_generation then return false;end if;
 if control.admission_paused then return control.rollout_operation_sha256=operation_sha256;end if;
 update internal.worker_dispatch_control set admission_paused=true,rollout_operation_sha256=operation_sha256 where singleton;return true;
end$$;

create function internal.resume_worker_admission(expected_endpoint text,expected_secret_name text,previous_generation bigint,desired_generation bigint,operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres' or current_user<>'postgres' then raise exception 'Operator worker admission required'using errcode='42501';end if;
 if operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'or(previous_generation is null and desired_generation is distinct from 1)or(previous_generation is not null and(previous_generation<1 or previous_generation=9223372036854775807 or desired_generation is distinct from previous_generation+1))then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found or not control.enabled or control.allow_local or not control.admission_paused or control.rollout_operation_sha256 is distinct from operation_sha256 or control.endpoint is distinct from expected_endpoint or control.vault_secret_name is distinct from expected_secret_name or control.execution_generation is distinct from previous_generation then return false;end if;
 if control.state in('REQUESTED','RUNNING')and control.lease_expires_at>clock_timestamp()then return false;end if;
 if exists(select 1 from internal.outbox_events where internal.outbox_event_owner(type)='WORKER'and state='PROCESSING'and lease_until>clock_timestamp())or exists(select 1 from internal.posthog_delivery where state='PROCESSING'and lease_until>clock_timestamp())then return false;end if;
 update internal.worker_dispatch_control set admission_paused=false,execution_generation=desired_generation,rollout_operation_sha256=null,
  state='IDLE',wake_id=null,lease_expires_at=null,network_request_id=null where singleton;return true;
end$$;

-- Preserve original domain implementations behind owner-only wrappers. Taking a
-- shared control-row lock serializes every new claim with operator pause.
alter function internal.claim_outbox(integer,integer)rename to claim_outbox_before_rollout;
create function internal.claim_outbox(batch_size integer,lease_seconds integer,release_generation bigint)
returns table(id uuid,school_id uuid,actor_id uuid,type text,entity_type text,entity_id uuid,version integer,metadata jsonb,occurred_at timestamptz,lease_token uuid,attempt_count integer)
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for share;
 if not found or control.admission_paused or control.execution_generation is distinct from release_generation then return;end if;
 return query select*from internal.claim_outbox_before_rollout(batch_size,lease_seconds);
end$$;
create function internal.claim_outbox(batch_size integer,lease_seconds integer)
returns table(id uuid,school_id uuid,actor_id uuid,type text,entity_type text,entity_id uuid,version integer,metadata jsonb,occurred_at timestamptz,lease_token uuid,attempt_count integer)
language sql volatile security definer set search_path=''as $$select*from internal.claim_outbox(batch_size,lease_seconds,null::bigint)$$;

alter function internal.claim_posthog_delivery(integer,integer,integer,text)rename to claim_posthog_before_rollout;
create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer,target_environment text,release_generation bigint)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb,ai_context jsonb)
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for share;
 if not found or control.admission_paused or control.execution_generation is distinct from release_generation then return;end if;
 return query select*from internal.claim_posthog_before_rollout(batch_size,lease_seconds,target_key_version,target_environment);
end$$;
create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer,target_environment text)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb,ai_context jsonb)
language sql volatile security definer set search_path=''as $$select*from internal.claim_posthog_delivery(batch_size,lease_seconds,target_key_version,target_environment,null::bigint)$$;

-- The superseded environment-unqualified overload keeps its original denied
-- runtime ACL, and even an operator call must obey the same admission fence.
alter function internal.claim_posthog_delivery(integer,integer,integer)rename to claim_posthog_legacy_before_rollout;
create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb)
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for share;
 if not found or control.admission_paused or control.execution_generation is not null then return;end if;
 return query select*from internal.claim_posthog_legacy_before_rollout(batch_size,lease_seconds,target_key_version);
end$$;

alter function internal.begin_worker_wake(uuid)rename to begin_worker_wake_before_rollout;
create function internal.begin_worker_wake(target_wake uuid,release_generation bigint)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or control.admission_paused or control.execution_generation is distinct from release_generation then return false;end if;
 return internal.begin_worker_wake_before_rollout(target_wake);
exception when lock_not_available then return false;end$$;
create function internal.begin_worker_wake(target_wake uuid)returns boolean language sql volatile security definer set search_path=''as $$select internal.begin_worker_wake(target_wake,null::bigint)$$;

alter function internal.request_worker_wake()rename to request_worker_wake_before_rollout;
create function internal.request_worker_wake()returns boolean language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or control.admission_paused then return false;end if;
 return internal.request_worker_wake_before_rollout();
exception when lock_not_available then return false;end$$;

-- Existing SQL bodies must resolve the public guarded functions after renames,
-- rather than retaining cached references to the owner-only pre-rollout names.
do $$begin
 execute pg_get_functiondef('internal.finish_worker_wake(uuid,text,integer)'::regprocedure);
 execute pg_get_functiondef('internal.outbox_worker_wake_trigger()'::regprocedure);
 execute pg_get_functiondef('internal.posthog_completed_wake()'::regprocedure);
 execute pg_get_functiondef('internal.worker_health()'::regprocedure);
end$$;

alter function internal.finish_worker_wake(uuid,text,integer)rename to finish_worker_wake_before_rollout;
create function internal.finish_worker_wake(target_wake uuid,target_status text,target_processed integer)returns boolean
language plpgsql security definer set search_path=''as $$declare finished boolean;begin
 finished:=internal.finish_worker_wake_before_rollout(target_wake,target_status,target_processed);
 if finished and target_status='COMPLETED'then
  update internal.worker_dispatch_control set last_completed_wake_id=target_wake where singleton and last_error_code is null;
 end if;
 return finished;
end$$;

revoke execute on function internal.pause_worker_admission(text,text,bigint,text),internal.resume_worker_admission(text,text,bigint,bigint,text),
 internal.claim_outbox_before_rollout(integer,integer),internal.claim_outbox(integer,integer),internal.claim_outbox(integer,integer,bigint),
 internal.claim_posthog_before_rollout(integer,integer,integer,text),internal.claim_posthog_delivery(integer,integer,integer,text),internal.claim_posthog_delivery(integer,integer,integer,text,bigint),
 internal.claim_posthog_legacy_before_rollout(integer,integer,integer),internal.claim_posthog_delivery(integer,integer,integer),
 internal.begin_worker_wake_before_rollout(uuid),internal.begin_worker_wake(uuid),internal.begin_worker_wake(uuid,bigint),internal.request_worker_wake_before_rollout(),internal.request_worker_wake()
 ,internal.finish_worker_wake_before_rollout(uuid,text,integer),internal.finish_worker_wake(uuid,text,integer)
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_outbox(integer,integer),internal.claim_outbox(integer,integer,bigint),internal.claim_posthog_delivery(integer,integer,integer,text),
 internal.claim_posthog_delivery(integer,integer,integer,text,bigint),internal.begin_worker_wake(uuid),internal.begin_worker_wake(uuid,bigint)to cuevo_worker;
grant execute on function internal.finish_worker_wake(uuid,text,integer)to cuevo_worker;

commit;
