-- Managed SQL Cron transport source. Created by verified Supabase CLI 2.119.0.
-- Application only: no extension installation/retirement, role setting or job.
-- Preserve all 231 previously applied migration bytes and original receipts.
-- Guard registration + managed Cron 1.6.4 defaults were observed in one root-run
-- rollback-only rehearsal; exact whole snapshot restoration was observed.
-- Custom API/worker SET roles received exact guard refusals. Managed anon/auth
-- reserved callbacks were skipped by Supautils, so their NOLOGIN/private-RPC
-- channel boundary is explicit. This does not prove external Data API isolation.
-- Source application, persistent guard/retirement, native 5s/commit behavior,
-- runtime execution and full customer acceptance remain separate gated work.

-- 03-phase-adapter.sql
-- Append-only SOURCE PROPOSAL. Existing231 migration files remain unchanged.
-- Materialized through the verified migration creator; no original SQL replay.
alter table internal.worker_dispatch_control
 add column transport_version integer not null default 1 check(transport_version in(1,2)),
 add column transport_mode text not null default'PG_NET_EDGE_V1' check(transport_mode in('PG_NET_EDGE_V1','SQL_CRON_LIBPQ_V2')),
 add column sql_enabled boolean not null default false,
 add column sql_job_id bigint,
 add column sql_phase text not null default'IDLE'check(sql_phase in('IDLE','CLAIMED','PROCESSING','FAIL_DUE','FAILING','UNKNOWN')),
 add column sql_event_id uuid references internal.outbox_events(id),
 add column sql_lease_token uuid,
 add column sql_claimed_at timestamptz,
 add column sql_phase_started_at timestamptz,
 add column sql_failure_started_at timestamptz,
 add column sql_deadline timestamptz,
 add column sql_hint_at timestamptz,
 add column sql_outcome text,
 add column sql_operation_sha256 text check(sql_operation_sha256 is null or sql_operation_sha256~'^[a-f0-9]{64}$'),
 add column sql_rehearsal_started_at timestamptz,
 add column sql_rehearsal_a_at timestamptz,
 add column sql_rehearsal_b_at timestamptz,
 add column sql_rehearsal_pid integer,
 add column sql_rehearsal_start_txid text,
 add column sql_rehearsal_txid text,
 add constraint sql_transport_is_not_edge check(not sql_enabled or
  (transport_version=2 and transport_mode='SQL_CRON_LIBPQ_V2'and not enabled
   and endpoint is null and vault_secret_name is null and network_request_id is null
   and execution_generation is not null and execution_generation>0 and sql_job_id is not null)),
 add constraint sql_phase_pointer check((sql_phase='IDLE'and sql_event_id is null and sql_lease_token is null)
  or(sql_phase<>'IDLE'and sql_event_id is not null and sql_lease_token is not null and sql_deadline is not null));

-- Exact canonical receipt protocol, not a new domain/award implementation.
create function internal.sql_processing_receipt_outcome(receipt jsonb)returns text
language plpgsql immutable set search_path=''as $receipt$
declare keys text;status text;awards numeric;
begin
 if jsonb_typeof(receipt)<>'object'then return'PROCESSING_RECEIPT_UNKNOWN';end if;
 select string_agg(key,','order by key)into keys from jsonb_object_keys(receipt) as fields(key);
 status:=receipt->>'status';
 if status in('ACKNOWLEDGED','DUPLICATE','DUPLICATE_SOURCE','COMPLETED','PLANNED','REFRESHED','NO_SOURCE','SUPERSEDED')and keys='status'then return'COMPLETED';end if;
 if status in('WAITING','REQUIRES_REVIEW')and keys='status'then return status;end if;
 if status='PROCESSED'and keys='learnerId,status'and jsonb_typeof(receipt->'learnerId')='string'
  and(receipt->>'learnerId')~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'then return'COMPLETED';end if;
 if status in('AWARDED','ACKNOWLEDGED_DISABLED')and keys='awards,status'and jsonb_typeof(receipt->'awards')='number'then
  awards:=(receipt->>'awards')::numeric;
  if awards>=0 and awards<=9007199254740991 and awards=trunc(awards)
   and(status='AWARDED'or awards=0)then return'COMPLETED';end if;
 end if;
 return'PROCESSING_RECEIPT_UNKNOWN';
end $receipt$;

-- Exactly one phase per fresh top-level CALL. No procedure SET clause, no
-- SECURITY DEFINER and no outer exception subtransaction around COMMIT.
create procedure internal.run_sql_worker(expected_generation bigint)
language plpgsql security invoker as $driver$
declare control internal.worker_dispatch_control;held internal.outbox_events;
 claimed record;window_end timestamptz;receipt jsonb;outcome text;failed boolean:=false;acknowledged boolean;
begin
 if session_user<>'postgres'or current_user<>'postgres'or current_setting('role')not in('none','postgres')then
  raise exception 'Original SQL Cron operator required'using errcode='42501';end if;
 if expected_generation is null or expected_generation<1 then raise exception 'Positive exact generation required'using errcode='22023';end if;
 if current_setting('cron.use_background_workers')<>'off'or
  extract(epoch from current_setting('statement_timeout')::interval)*1000<>5000 then
  raise exception 'Native LIBPQ five-second session required'using errcode='22023';end if;
 begin select*into control from internal.worker_dispatch_control where singleton for update nowait;
 exception when lock_not_available then return;end;
 if not found or not control.sql_enabled or control.transport_version<>2
  or control.transport_mode<>'SQL_CRON_LIBPQ_V2'or control.execution_generation is distinct from expected_generation
  or internal.sql_worker_transport_private()is not true then return;end if;

 if control.sql_phase='IDLE'then
  -- Pause blocks NEW claims; held completion/failure remains authoritative.
  if control.admission_paused or control.next_attempt_at>clock_timestamp()then return;end if;
  window_end:=clock_timestamp()+interval'20 seconds';
  if window_end-clock_timestamp()<interval'15 seconds'then return;end if;
  select*into claimed from internal.claim_outbox(1,30,expected_generation);
  if not found then return;end if;
  update internal.worker_dispatch_control set sql_phase='CLAIMED',sql_event_id=claimed.id,
   sql_lease_token=claimed.lease_token,sql_claimed_at=clock_timestamp(),sql_phase_started_at=null,sql_failure_started_at=null,
   sql_deadline=window_end,sql_outcome=null where singleton;
  commit;return;
 end if;

 select*into held from internal.outbox_events where id=control.sql_event_id for update;
 if not found or held.state<>'PROCESSING'or held.lease_token is distinct from control.sql_lease_token
  or held.lease_until<=clock_timestamp()then
  -- Canonical state/lease settlement, never replay/reset of the original event.
  update internal.worker_dispatch_control set sql_phase='IDLE',sql_event_id=null,sql_lease_token=null where singleton;
  commit;return;
 end if;
 if internal.outbox_event_owner(held.type)<>'WORKER'then raise exception 'Other executor event'using errcode='42501';end if;
 if control.sql_phase in('PROCESSING','FAILING','UNKNOWN')then
  -- Cancellation/disconnect/unknown acknowledgement cannot authorize fail/replay.
  -- Original event/lease/attempt and phase clocks survive to canonical expiry.
  return;
 end if;
 if control.sql_phase='CLAIMED'then
  if control.sql_deadline-clock_timestamp()<interval'10 seconds'then
   update internal.worker_dispatch_control set sql_phase='UNKNOWN',sql_outcome='DEADLINE_REACHED',next_attempt_at=clock_timestamp()+interval'30 seconds'where singleton;
   commit;return;
  end if;
  update internal.worker_dispatch_control set sql_phase='PROCESSING',sql_phase_started_at=clock_timestamp()where singleton;
  commit;
  -- This start commit intentionally leaves a durable original pointer on crash.
  begin
   receipt:=internal.process_learner_event(control.sql_event_id,control.sql_lease_token);
   outcome:=internal.sql_processing_receipt_outcome(receipt);
  exception when others then failed:=true;outcome:='REQUIRES_REVIEW';end;
  -- OTHERS deliberately excludes query_canceled: timeout is UNKNOWN/lease recovery.
  begin select*into control from internal.worker_dispatch_control where singleton for update nowait;
  exception when lock_not_available then return;end;
  if control.sql_phase<>'PROCESSING'or control.sql_event_id is distinct from held.id
   or control.sql_lease_token is distinct from held.lease_token then return;end if;
  if failed then
   update internal.worker_dispatch_control set sql_phase='FAIL_DUE',sql_outcome=outcome where singleton;
  elsif outcome='PROCESSING_RECEIPT_UNKNOWN'then
   -- Commit possible canonical effects; NEVER call fail_outbox on malformed receipt.
   update internal.worker_dispatch_control set sql_phase='UNKNOWN',sql_outcome=outcome,next_attempt_at=clock_timestamp()+interval'30 seconds'where singleton;
  else
   update internal.worker_dispatch_control set sql_phase='IDLE',sql_event_id=null,sql_lease_token=null,
    sql_outcome=outcome,last_processed_count=case when outcome='COMPLETED'then 1 else 0 end,last_finished_at=clock_timestamp()where singleton;
  end if;
  commit;return;
 end if;
 if control.sql_phase='FAIL_DUE'then
  if control.sql_deadline-clock_timestamp()<interval'5 seconds'then
   update internal.worker_dispatch_control set sql_phase='UNKNOWN',sql_outcome='DEADLINE_REACHED'where singleton;
   commit;return;end if;
  update internal.worker_dispatch_control set sql_phase='FAILING',sql_failure_started_at=clock_timestamp()where singleton;
  commit;
  -- Original failure attempt is now latched before forwarding. Timeout/lost
  -- acknowledgement remainsFAILING and can only settle canonical state/lease.
  acknowledged:=internal.fail_outbox(control.sql_event_id,control.sql_lease_token,'PROCESSING_REQUIRES_REVIEW',30);
  update internal.worker_dispatch_control set sql_phase=case when acknowledged is true then'IDLE'else'UNKNOWN'end,
   sql_event_id=case when acknowledged is true then null else sql_event_id end,
   sql_lease_token=case when acknowledged is true then null else sql_lease_token end,
   sql_outcome=case when acknowledged is true then'REQUIRES_REVIEW'else'FAILURE_RECEIPT_UNKNOWN'end,
   last_finished_at=clock_timestamp(),next_attempt_at=clock_timestamp()+interval'30 seconds'where singleton;
  commit;return;
 end if;
end $driver$;
revoke execute on function internal.sql_processing_receipt_outcome(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on procedure internal.run_sql_worker(bigint)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- External PostHog and AI/orchestrator effects remain existing Node/Edge/API
-- executors with their own school/source/lease/approval/destination receipts.
-- SQL Cron executes only existing WORKER-owned canonical SQL and never JS/HTTP.

-- 01-refusal-guard.sql
-- SOURCE PROPOSAL ONLY: append through a CLI-created migration after review.
-- No provider operation, extension enable/drop, owner transfer or grant repair.
create function internal.guard_runtime_extension_management() returns event_trigger
language plpgsql security definer set search_path='' as $guard$
declare original_role text:=current_setting('role',true);
begin
 -- Supautils may elevate current_user. The original login and SET-role remain
 -- the authorization inputs; this guard only refuses, never elevates or repairs.
 if session_user in('postgres','supabase_admin') and
  coalesce(original_role,'none') in('none','postgres','supabase_admin') then return;end if;
 raise exception 'Runtime extension management is not authorized' using errcode='42501';
end
$guard$;
revoke execute on function internal.guard_runtime_extension_management()
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Existing trusted postgres/Supautils CREATE EVENT TRIGGER route is prospective:
-- actual registration, creator/function owner and native denial must be proved.
create event trigger cuevo_runtime_extension_refusal on ddl_command_start
 when tag in('CREATE EXTENSION','ALTER EXTENSION','DROP EXTENSION')
 execute function internal.guard_runtime_extension_management();

-- No claim that this trigger can recursively guard its own DROP/ALTER. Ordinary
-- ownership, no privileged-role/parameter route and no callable owner bridge
-- must protect it. Readiness below verifies the actual native metadata each time.

-- 04-versioned-private-boundary-v8.sql
-- SOURCE PROPOSAL: shared existing Vault/PUBLIC/membership/RPC logic, versioned target only.
create or replace function internal.worker_transport_boundary_private(retired boolean)returns boolean
language plpgsql stable security definer set search_path=''as $$
declare scopes text[]:=case when retired then array['vault']else array['net','vault']end;control internal.worker_dispatch_control;role_name text;principal oid;current_namespace record;current_object record;current_routine record;browser_principal record;required_name text;
 realtime_helper oid:=to_regprocedure('authorization.community_realtime_topic(text)');
 reserved_roles text[];original_login record;
 table_permissions text:='SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
begin
 if current_setting('server_version_num')::integer<170000 then return false;end if;
 table_permissions:=table_permissions||',MAINTAIN';

 if retired then
  select*into control from internal.worker_dispatch_control where singleton;
  if not found or control.transport_version<>2 or control.transport_mode<>'SQL_CRON_LIBPQ_V2'
   or control.sql_operation_sha256 is null or control.execution_generation is null or control.execution_generation<1 then return false;end if;
  -- Managed reserved-role event-trigger callbacks are intentionally skipped by
  -- Supautils. They are protected by NOLOGIN and the existing private RPC/channel
  -- boundary; only nonreserved custom runtime roles receive this DDL guard.
  if not exists(select 1 from pg_settings where name='supautils.reserved_roles'and setting=reset_val)then return false;end if;
  -- A trailing asterisk marks a settings-modifiable exact reserved role; it is
  -- not a prefix wildcard. Normalize only that documented suffix and whitespace.
  select array_agg(regexp_replace(btrim(value),'\*$',''))into reserved_roles
   from regexp_split_to_table(current_setting('supautils.reserved_roles'),',')as fields(value);
  foreach role_name in array array['anon','authenticated']loop
   if not exists(select 1 from pg_roles where rolname=role_name and not rolcanlogin)
    or not role_name=any(reserved_roles)then return false;end if;
  end loop;
  for principal in with recursive runtime_roles(oid)as(
   select oid from pg_roles where rolname in('cuevo_api','cuevo_worker')
   union select m.roleid from pg_auth_members m join runtime_roles child on child.oid=m.member
  )select oid from runtime_roles loop
   if exists(select 1 from pg_roles where oid=principal and rolname=any(reserved_roles))then return false;end if;
  end loop;
  -- A role's original LOGIN defaults apply before SET ROLE. Include inverse
  -- membership paths and the managed authenticator, plus current/reset globals.
  if not exists(select 1 from pg_settings where name='session_replication_role'
   and setting='origin'and reset_val='origin')then return false;end if;
  if not exists(select 1 from pg_settings where name='event_triggers'and setting='on'and reset_val='on')then return false;end if;
  for original_login in with recursive login_paths(oid)as(
   select oid from pg_roles where rolname in('anon','authenticated','cuevo_api','cuevo_worker','authenticator')
   union select m.member from pg_auth_members m join login_paths target on target.oid=m.roleid
  )select oid from login_paths loop
   if not exists(select 1 from pg_roles where oid=original_login.oid and rolname in('postgres','supabase_admin'))
    and(has_parameter_privilege(original_login.oid,'session_replication_role','SET')or has_parameter_privilege(original_login.oid,'session_replication_role','ALTER SYSTEM')
     or has_parameter_privilege(original_login.oid,'event_triggers','SET')or has_parameter_privilege(original_login.oid,'event_triggers','ALTER SYSTEM'))then return false;end if;
   if exists(select 1 from pg_db_role_setting settings cross join lateral unnest(settings.setconfig)value
    where settings.setrole in(0,original_login.oid)and settings.setdatabase in(0,(select oid from pg_database where datname=current_database()))
    and(value like'session_replication_role=%'and value<>'session_replication_role=origin'
     or value like'event_triggers=%'and value<>'event_triggers=on'))then return false;end if;
  end loop;
  if exists(select 1 from pg_extension where extname='pg_net')or to_regnamespace('net')is not null then return false;end if;
  if current_setting('cron.use_background_workers',true)is distinct from'off'then return false;end if;
  if not exists(select 1 from pg_extension where extname='pg_cron'and extversion='1.6.4'
   and extowner=(select oid from pg_roles where rolname='supabase_admin'))then return false;end if;
  if not exists(select 1 from pg_namespace where nspname='cron'and nspowner=(select oid from pg_roles where rolname='supabase_admin'))then return false;end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cron'
   and c.relowner<>(select oid from pg_roles where rolname='supabase_admin'))then return false;end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='cron'
   and(p.proowner<>(select oid from pg_roles where rolname='supabase_admin')or p.prosecdef))then return false;end if;
  if to_regclass('cron.job')is null or to_regclass('cron.job_run_details')is null then return false;end if;
  if not exists(select 1 from pg_class where oid=to_regclass('cron.job')and relkind='r'and relrowsecurity)then return false;end if;
  if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a
   where n.nspname='cron'and a.grantee=0 and a.privilege_type in('USAGE','CREATE'))then return false;end if;
  if exists(select 1 from pg_policy where polrelid=to_regclass('cron.job')and polcmd in('r','*')
   and pg_get_expr(polqual,polrelid)is distinct from'(username = CURRENT_USER)'
   and pg_get_expr(polqual,polrelid)is distinct from'(username = CURRENT_USER::text)')then return false;end if;
  if not exists(select 1 from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='postgres')
   and setdatabase=(select oid from pg_database where datname=current_database())and setconfig @> array['statement_timeout=5s'])then return false;end if;
  if not exists(select 1 from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
   where e.evtname='cuevo_runtime_extension_refusal'and e.evtevent='ddl_command_start'and e.evtenabled='O'
   and e.evttags @> array['CREATE EXTENSION','ALTER EXTENSION','DROP EXTENSION']and cardinality(e.evttags)=3
   and e.evtowner=(select oid from pg_roles where rolname='postgres')and p.proowner=e.evtowner
   and p.prosecdef and p.proconfig @> array['search_path=""']and md5(p.prosrc)='1ad1a6b0ae5cf6286291f9e4068a8acb')then return false;end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('internal.run_sql_worker(bigint)')and prokind='p'
   and not prosecdef and proconfig is null and proowner=(select oid from pg_roles where rolname='postgres'))then return false;end if;
  if not exists(select 1 from cron.job where jobid=control.sql_job_id and username='postgres'and database=current_database()
   and nodename=current_setting('cron.host')and nodeport=current_setting('port')::integer and jobname='cuevo-sql-outbox-v2'and active and schedule='1 second'and command='CALL internal.run_sql_worker('||control.execution_generation::text||');')then return false;end if;
 end if;
 if retired then
  for principal in with recursive cron_actors(oid)as(
   select oid from pg_roles where rolname in('anon','authenticated','cuevo_api','cuevo_worker','service_role','authenticator')
   union select m.roleid from pg_auth_members m join cron_actors child on child.oid=m.member
  )select oid from cron_actors loop
   if has_schema_privilege(principal,to_regnamespace('cron'),'USAGE,CREATE')then return false;end if;
  end loop;
  foreach required_name in array array['cron.job','cron.job_run_details']loop
   if not exists(select 1 from pg_class where oid=to_regclass(required_name)and relkind='r'and relrowsecurity)then return false;end if;
   if not exists(select 1 from pg_policy where polrelid=to_regclass(required_name)and polcmd in('r','*')
    and pg_get_expr(polqual,polrelid)in('(username = CURRENT_USER)','(username = CURRENT_USER::text)'))then return false;end if;
   if exists(select 1 from pg_policy where polrelid=to_regclass(required_name)
    and pg_get_expr(polqual,polrelid)is distinct from'(username = CURRENT_USER)'
    and pg_get_expr(polqual,polrelid)is distinct from'(username = CURRENT_USER::text)')then return false;end if;
  end loop;
 end if;
 -- Managed Cron metadata/sequence raw PUBLIC SELECT and own-run DELETE are
 -- accepted only behind unreachable schema USAGE and own-user RLS. Cron is not
 -- included in the strict Vault raw-ACL scan; no provider grant repair is needed.
 -- Cron metadata is not Vault: unreachable raw PUBLIC SELECT alone is allowed,
 -- while every runtime/SET path has no namespace/scheduler rights and own-job RLS
 -- is required. Unknown native metadata cannot pass this versioned contract.
 -- Missing fixed roles, schemas or protected relations are UNKNOWN, never a pass.
 foreach role_name in array array['anon','authenticated','cuevo_api','cuevo_worker','service_role','postgres','supabase_admin']loop
  if not exists(select 1 from pg_roles where rolname=role_name)then return false;end if;
 end loop;
 foreach required_name in array array['app','internal','authorization']||scopes loop
  if not exists(select 1 from pg_namespace where nspname=required_name)then return false;end if;
 end loop;
 if exists(select 1 from pg_namespace namespace join pg_roles owner on owner.oid=namespace.nspowner
  where namespace.nspname=any(scopes)and owner.rolname not in('postgres','supabase_admin'))then return false;end if;
 foreach required_name in array case when retired then array['cron.job','cron.job_run_details','vault.secrets','vault.decrypted_secrets']else array['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets']end loop
  if not exists(select 1 from pg_class where oid=to_regclass(required_name)
   and(required_name='vault.decrypted_secrets'and relkind='v'or required_name<>'vault.decrypted_secrets'and relkind='r'))then return false;end if;
 end loop;
 if realtime_helper is null or not exists(select 1 from pg_proc routine join pg_roles owner on owner.oid=routine.proowner
  where routine.oid=realtime_helper and routine.prorettype='boolean'::regtype and routine.prosecdef and routine.provolatile='s'
  and owner.rolname='postgres'and routine.proconfig @> array['search_path=""'])then return false;end if;

 -- Traverse every membership, including NOINHERIT/SET-only paths. A dormant route
 -- to a privileged owner is not safe merely because the current session has not SET it.
 for principal in with recursive principals(oid)as(
  select oid from pg_roles where rolname in('anon','authenticated','cuevo_api','cuevo_worker')
  union select membership.roleid from pg_auth_members membership join principals child on child.oid=membership.member
 )select oid from principals loop
  select rolname into role_name from pg_roles where oid=principal;
  if retired and role_name=current_setting('supautils.privileged_role',true)then return false;end if;
  if exists(select 1 from pg_roles where oid=principal and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
   or rolname in('service_role','authenticator','postgres','supabase_admin','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_database_owner','supabase_privileged_role')))then return false;end if;
  if exists(select 1 from pg_auth_members where member=principal and admin_option)then return false;end if;
  if retired and has_schema_privilege(principal,to_regnamespace('cron'),'USAGE')then return false;end if;
  -- Cron raw PUBLIC SELECT is harmless only while schema USAGE is unreachable.
  -- Vault keeps its original stricter raw ACL/table/column/sequence checks.
  if retired and(has_parameter_privilege(principal,'session_replication_role','SET')or has_parameter_privilege(principal,'session_replication_role','ALTER SYSTEM')
   or has_parameter_privilege(principal,'event_triggers','SET')or has_parameter_privilege(principal,'event_triggers','ALTER SYSTEM')
   or exists(select 1 from pg_db_role_setting settings cross join lateral unnest(settings.setconfig)value
    where settings.setrole in(0,principal)and settings.setdatabase in(0,(select oid from pg_database where datname=current_database()))
    and(value like'session_replication_role=%'and value<>'session_replication_role=origin'
     or value like'event_triggers=%'and value<>'event_triggers=on')))then return false;end if;
  -- Untrusted C USAGE alone is not C-create authority; superuser/file/CREATE/owner
  -- and reachable elevated bridges are denied by these unchanged checks.
  -- An untrusted role cannot create or replace an owner-authority wrapper anywhere
  -- outside PostgreSQL's temporary/system schemas, or own a trusted object.
  for current_namespace in select oid,nspname,nspowner from pg_namespace
   where nspname<>'information_schema'and nspname!~'^pg_'loop
   if current_namespace.nspowner=principal or has_schema_privilege(principal,current_namespace.oid,'CREATE')then return false;end if;
  end loop;
  if exists(select 1 from pg_class object join pg_namespace namespace on namespace.oid=object.relnamespace
   where object.relowner=principal and namespace.nspname<>'information_schema'and namespace.nspname!~'^pg_')
   or exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
   where routine.proowner=principal and namespace.nspname<>'information_schema'and namespace.nspname!~'^pg_')then return false;end if;

  for current_object in select object.oid,object.relkind,object.relacl,object.relowner from pg_class object
   join pg_namespace namespace on namespace.oid=object.relnamespace where namespace.nspname=any(scopes)and object.relkind in('r','v','m','f','p','S')loop
   if current_object.relkind='S'then
    if has_sequence_privilege(principal,current_object.oid,'USAGE,SELECT,UPDATE')then return false;end if;
   elsif current_object.relkind in('r','v','m','f','p')then
    if has_table_privilege(principal,current_object.oid,table_permissions)or has_any_column_privilege(principal,current_object.oid,'SELECT,INSERT,UPDATE,REFERENCES')then return false;end if;
   end if;
  end loop;
  -- Future provider routines are checked too. PUBLIC EXECUTE without schema
  -- USAGE is unreachable; granting both opens a capability and fails closed.
  for current_routine in select routine.oid,routine.pronamespace from pg_proc routine
   join pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname=any(scopes)loop
   if has_schema_privilege(principal,current_routine.pronamespace,'USAGE')and has_function_privilege(principal,current_routine.oid,'EXECUTE')then return false;end if;
  end loop;
  if role_name in('cuevo_api','cuevo_worker')and exists(select 1 from pg_namespace
   where nspname=any(scopes)and has_schema_privilege(principal,oid,'USAGE'))then return false;end if;
  -- SET-only intermediate roles must not invoke the owner-authority transport.
  foreach required_name in array array['internal.configure_worker_dispatch(boolean,text,text,boolean)','internal.send_worker_wake(uuid,text,text)','internal.request_worker_wake()','internal.worker_transport_private()','internal.worker_transport_boundary_private(boolean)','internal.sql_worker_transport_private()','internal.worker_transport_status_v2()','internal.guard_runtime_extension_management()','internal.send_worker_wake_before_sql(uuid,text,text)','internal.request_worker_wake_before_sql()','internal.prepare_sql_cron_transport(text)','internal.configure_sql_worker(bigint,bigint,bigint,text)','internal.pause_sql_worker(bigint,text)','internal.resume_sql_worker(bigint,bigint,bigint,text)','internal.rehearse_sql_cron_commit_timeout(text)','internal.run_sql_worker(bigint)']loop
   if to_regprocedure(required_name)is null or has_function_privilege(principal,to_regprocedure(required_name),'EXECUTE')then return false;end if;
  end loop;
 end loop;

 -- PUBLIC is an ACL grantee, not a fictitious SQL login. Inspect its grants directly.
 for current_namespace in select oid,nspacl,nspowner from pg_namespace where nspname<>'information_schema'and nspname!~'^pg_'loop
  if exists(select 1 from aclexplode(coalesce(current_namespace.nspacl,acldefault('n',current_namespace.nspowner)))privilege
   where privilege.grantee=0 and privilege.privilege_type='CREATE')then return false;end if;
 end loop;
 for current_object in select object.oid,object.relkind,object.relacl,object.relowner from pg_class object
  join pg_namespace namespace on namespace.oid=object.relnamespace where namespace.nspname=any(scopes)and object.relkind in('r','v','m','f','p','S')loop
  if not exists(select 1 from pg_roles where oid=current_object.relowner and rolname in('postgres','supabase_admin'))then return false;end if;
  if exists(select 1 from aclexplode(coalesce(current_object.relacl,acldefault(case when current_object.relkind='S'then'S'::"char"else'r'::"char"end,current_object.relowner)))privilege
   where privilege.grantee=0 and privilege.privilege_type in('USAGE','SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'))then return false;end if;
  if exists(select 1 from pg_attribute column_info cross join lateral aclexplode(column_info.attacl)privilege
   where column_info.attrelid=current_object.oid and not column_info.attisdropped and column_info.attnum>0 and privilege.grantee=0
   and privilege.privilege_type in('SELECT','INSERT','UPDATE','REFERENCES'))then return false;end if;
 end loop;
 for current_routine in select routine.oid,routine.proowner,routine.proacl,namespace.nspacl,namespace.nspowner from pg_proc routine
  join pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname=any(scopes)loop
  if not exists(select 1 from pg_roles where oid=current_routine.proowner and rolname in('postgres','supabase_admin'))then return false;end if;
  if exists(select 1 from aclexplode(coalesce(current_routine.nspacl,acldefault('n',current_routine.nspowner)))privilege where privilege.grantee=0 and privilege.privilege_type='USAGE')
   and exists(select 1 from aclexplode(coalesce(current_routine.proacl,acldefault('f',current_routine.proowner)))privilege where privilege.grantee=0 and privilege.privilege_type='EXECUTE')then return false;end if;
 end loop;

 -- Provider service_role is trusted only for managed objects, never Cuevo RPC.
 -- Retain exactly one separately source-reviewed authenticated Realtime predicate.
 for current_routine in select routine.oid,routine.proowner,routine.proacl from pg_proc routine
  join pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname in('app','internal','authorization')loop
  if not exists(select 1 from pg_roles where oid=current_routine.proowner and rolname='postgres')then return false;end if;
  if exists(select 1 from aclexplode(coalesce(current_routine.proacl,acldefault('f',current_routine.proowner)))privilege
   where privilege.grantee=0 and privilege.privilege_type='EXECUTE')then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role']loop
   if has_function_privilege(role_name,current_routine.oid,'EXECUTE')and not(role_name='authenticated'and current_routine.oid=realtime_helper)then return false;end if;
  end loop;
 end loop;
 -- Browser-origin SET-only paths cannot add another private RPC capability.
 for browser_principal in with recursive browser_principals(origin,oid)as(
  select rolname,oid from pg_roles where rolname in('anon','authenticated')
  union select child.origin,membership.roleid from pg_auth_members membership join browser_principals child on child.oid=membership.member
 )select origin,oid from browser_principals loop
  for current_routine in select routine.oid from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
   where namespace.nspname in('app','internal','authorization')loop
   if has_function_privilege(browser_principal.oid,current_routine.oid,'EXECUTE')and not(browser_principal.origin='authenticated'and current_routine.oid=realtime_helper)then return false;end if;
  end loop;
 end loop;
 foreach required_name in array array['internal.configure_worker_dispatch(boolean,text,text,boolean)','internal.send_worker_wake(uuid,text,text)','internal.request_worker_wake()','internal.worker_transport_private()','internal.worker_transport_boundary_private(boolean)','internal.sql_worker_transport_private()','internal.worker_transport_status_v2()','internal.guard_runtime_extension_management()','internal.send_worker_wake_before_sql(uuid,text,text)','internal.request_worker_wake_before_sql()','internal.prepare_sql_cron_transport(text)','internal.configure_sql_worker(bigint,bigint,bigint,text)','internal.pause_sql_worker(bigint,text)','internal.resume_sql_worker(bigint,bigint,bigint,text)','internal.rehearse_sql_cron_commit_timeout(text)','internal.run_sql_worker(bigint)']loop
  if to_regprocedure(required_name)is null then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role','cuevo_api','cuevo_worker']loop
   if has_function_privilege(role_name,to_regprocedure(required_name),'EXECUTE')then return false;end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end$$;

revoke execute on function internal.worker_transport_boundary_private(boolean)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create or replace function internal.worker_transport_private()returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from internal.worker_dispatch_control where singleton and transport_version=1 and transport_mode='PG_NET_EDGE_V1')and internal.worker_transport_boundary_private(false)
$$;
create function internal.sql_worker_transport_private()returns boolean language sql stable security definer set search_path=''as $$
 select internal.worker_transport_boundary_private(true)
$$;
create function internal.worker_transport_status_v2()returns jsonb language plpgsql stable security definer set search_path=''as $$
declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton;
 return jsonb_build_object('version',2,'mode',control.transport_mode,'private',internal.sql_worker_transport_private(),
  'enabled',control.sql_enabled,'generation',control.execution_generation::text,'phase',control.sql_phase,
  'execution',case when control.transport_mode='SQL_CRON_LIBPQ_V2'then'SQL_CRON_LIBPQ'else'LEGACY_PG_NET_EDGE'end,'externalExecutor','NODE_EDGE_REQUIRED','externalAcceptance','UNOBSERVED');
end$$;
revoke execute on function internal.worker_transport_private(),internal.sql_worker_transport_private(),internal.worker_transport_status_v2()
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
-- Old Boolean is LEGACY ONLY and remains false after retirement. It does not
-- certify the new transport or falsely complete the original231 old-net stage.

-- 05-truthful-sql-configuration-v2.sql
create function internal.prepare_sql_cron_transport(operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres'or current_user<>'postgres'or current_setting('role')not in('none','postgres')then raise exception 'Operator configuration required'using errcode='42501';end if;
 if operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found then return false;end if;
 if control.enabled or control.sql_enabled or control.admission_paused or control.sql_phase<>'IDLE'
  or exists(select 1 from internal.outbox_events where state='PROCESSING'and lease_until>clock_timestamp())
  or exists(select 1 from internal.posthog_delivery where state='PROCESSING'and lease_until>clock_timestamp())then return false;end if;
 -- This acknowledgement is only the same saved disabled PREPARED intent.
 -- Cron/job/generation/timeout/retirement readiness is required at configure.
 if control.sql_operation_sha256 is not null then return control.sql_operation_sha256=operation_sha256
  and control.transport_version=2 and control.transport_mode='SQL_CRON_LIBPQ_V2'
  and control.sql_event_id is null and control.sql_lease_token is null
  and control.endpoint is null and control.vault_secret_name is null and control.network_request_id is null;end if;
 update internal.worker_dispatch_control set transport_version=2,transport_mode='SQL_CRON_LIBPQ_V2',sql_operation_sha256=operation_sha256,
  endpoint=null,vault_secret_name=null,network_request_id=null,sql_enabled=false where singleton;
 return true;
end$$;

create function internal.configure_sql_worker(previous_generation bigint,desired_generation bigint,target_job bigint,operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres'or current_user<>'postgres'or current_setting('role')not in('none','postgres')then raise exception 'Operator configuration required'using errcode='42501';end if;
 if operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'or target_job is null or target_job<1
  or desired_generation is null or(previous_generation is null and desired_generation<>1)
  or(previous_generation is not null and(previous_generation<1 or previous_generation=9223372036854775807 or desired_generation<>previous_generation+1))then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found then return false;end if;
 if control.sql_enabled then return control.execution_generation=desired_generation and control.sql_job_id=target_job and control.sql_operation_sha256=operation_sha256 and internal.sql_worker_transport_private()is true;end if;
 if control.enabled or control.transport_mode<>'SQL_CRON_LIBPQ_V2'or control.sql_operation_sha256 is distinct from operation_sha256
  or control.execution_generation is distinct from previous_generation or control.sql_phase<>'IDLE'
  or exists(select 1 from internal.outbox_events where state='PROCESSING'and lease_until>clock_timestamp())
  or exists(select 1 from internal.posthog_delivery where state='PROCESSING'and lease_until>clock_timestamp())then return false;end if;
 update internal.worker_dispatch_control set execution_generation=desired_generation,sql_job_id=target_job,sql_enabled=true,
  admission_paused=false,rollout_operation_sha256=null where singleton;
 if internal.sql_worker_transport_private()is not true then raise exception 'Actual SQL transport private contract unproved'using errcode='42501';end if;
 return true;
end$$;

create function internal.pause_sql_worker(expected_generation bigint,operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres'or current_user<>'postgres'or current_setting('role')not in('none','postgres')then raise exception 'Operator pause required'using errcode='42501';end if;
 if expected_generation is null or expected_generation<1 or operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found then return false;end if;
 if not control.sql_enabled or control.execution_generation is distinct from expected_generation then return false;end if;
 if control.admission_paused then return control.rollout_operation_sha256=operation_sha256;end if;
 update internal.worker_dispatch_control set admission_paused=true,rollout_operation_sha256=operation_sha256 where singleton;return true;
end$$;

-- A release does not bypass held leases. Reconfiguration after pause uses the
-- same exact job/generation/private checks, no implicit fallback to old Edge.
create function internal.resume_sql_worker(previous_generation bigint,desired_generation bigint,target_job bigint,operation_sha256 text)returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 if session_user<>'postgres'or current_user<>'postgres'or current_setting('role')not in('none','postgres')then raise exception 'Operator resume required'using errcode='42501';end if;
 if previous_generation is null or previous_generation<1 or previous_generation=9223372036854775807
  or desired_generation is distinct from previous_generation+1 or target_job is null or target_job<1
  or operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'then return false;end if;
 select*into control from internal.worker_dispatch_control where singleton for update;
 if not found then return false;end if;
 if not control.sql_enabled or not control.admission_paused or control.rollout_operation_sha256 is distinct from operation_sha256
  or control.execution_generation is distinct from previous_generation
  or exists(select 1 from internal.outbox_events where state='PROCESSING'and lease_until>clock_timestamp())
  or exists(select 1 from internal.posthog_delivery where state='PROCESSING'and lease_until>clock_timestamp())then return false;end if;
 update internal.worker_dispatch_control set execution_generation=desired_generation,sql_job_id=target_job,admission_paused=false,
  rollout_operation_sha256=null,sql_phase='IDLE',sql_event_id=null,sql_lease_token=null where singleton;
 if internal.sql_worker_transport_private()is not true then raise exception 'Current SQL transport generation unproved'using errcode='42501';end if;
 return true;
end$$;
revoke execute on function internal.prepare_sql_cron_transport(text),internal.configure_sql_worker(bigint,bigint,bigint,text),
 internal.pause_sql_worker(bigint,text),internal.resume_sql_worker(bigint,bigint,bigint,text)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- 06-retired-wake-v2.sql
-- Preserve actual current mode1 implementations behind private forwarding.
alter function internal.send_worker_wake(uuid,text,text)rename to send_worker_wake_before_sql;
alter function internal.request_worker_wake()rename to request_worker_wake_before_sql;
revoke execute on function internal.send_worker_wake_before_sql(uuid,text,text),internal.request_worker_wake_before_sql()
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
-- No SQL-mode HTTP call or fabricated positive network_request_id.
-- Replaced under exact operator source review before RESTRICT retirement.
create or replace function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton;
 if control.transport_version=2 and control.transport_mode='SQL_CRON_LIBPQ_V2'
  and target_wake is not null and target_endpoint is null and target_secret_name is null then return null;end if;
 return internal.send_worker_wake_before_sql(target_wake,target_endpoint,target_secret_name);
end$$;
create or replace function internal.request_worker_wake()returns boolean
language plpgsql security definer set search_path=''as $$declare control internal.worker_dispatch_control;begin
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found or control.admission_paused then return false;end if;
 if control.transport_version=2 and control.transport_mode='SQL_CRON_LIBPQ_V2'then
  if not control.sql_enabled then return false;end if;
  -- Committed hint only; canonical event/lease and Cron remain execution owners.
  update internal.worker_dispatch_control set sql_hint_at=clock_timestamp()where singleton;
  return true;
 end if;
 return internal.request_worker_wake_before_sql();
exception when lock_not_available then return false;when others then return false;
end$$;
revoke execute on function internal.send_worker_wake(uuid,text,text),internal.request_worker_wake()
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Rebind original named calls after rename; no domain or source logic changes.
do $$begin
 execute pg_get_functiondef('internal.request_worker_wake_before_rollout()'::regprocedure);
 execute pg_get_functiondef('internal.outbox_worker_wake_trigger()'::regprocedure);
 execute pg_get_functiondef('internal.posthog_completed_wake()'::regprocedure);
end$$;

-- 02-managed-libpq-rehearsal-v3.sql
-- SOURCE PROPOSAL; no statement in this file has been executed on the project.
-- Root must approve the exact source/hash/project/operation and extension/job.
-- Role+database setting is a SEPARATE operation/session, never SET;CALL in one
-- multi-statement query. It affects ALL NEW postgres sessions in this database,
-- including operator/Management sessions, not only Cron. Existing reset is120s.
-- Explicit reviewed read/DDL transactions may set their own bounded LOCAL value;
-- application worker budgets remain5s. Restore prior scoped row exactly if aborted.
-- alter role postgres in database postgres set statement_timeout='5s';

create procedure internal.rehearse_sql_cron_commit_timeout(operation_sha256 text)
language plpgsql security invoker as $probe$
declare control internal.worker_dispatch_control;started_at timestamptz;affected integer;
begin
 if session_user<>'postgres' or current_user<>'postgres' or current_setting('role')not in('none','postgres') then
  raise exception 'Original trusted operator session required'using errcode='42501';end if;
 if current_setting('cron.use_background_workers')<>'off' or current_database()<>'postgres' then
  raise exception 'Actual managed LIBPQ mode required'using errcode='22023';end if;
 if extract(epoch from current_setting('statement_timeout')::interval)*1000<>5000 then
  raise exception 'Pre-existing five-second session timeout required'using errcode='22023';end if;
 if operation_sha256 is null or operation_sha256!~'^[a-f0-9]{64}$'then
  raise exception 'Exact reviewed rehearsal operation required'using errcode='22023';end if;
 select*into control from internal.worker_dispatch_control where singleton for update nowait;
 if not found then raise exception 'Original singleton missing'using errcode='22023';end if;
 if control.enabled or control.sql_enabled or control.sql_phase<>'IDLE' or control.sql_rehearsal_started_at is not null or control.sql_rehearsal_a_at is not null or
  control.sql_operation_sha256 is distinct from operation_sha256 then
  raise exception 'Original disabled rehearsal intent required'using errcode='22023';end if;
 started_at:=statement_timestamp();
 update internal.worker_dispatch_control set sql_rehearsal_started_at=started_at,sql_rehearsal_pid=pg_backend_pid(),sql_rehearsal_start_txid=pg_current_xact_id()::text where singleton;
 commit;
 perform pg_sleep(2);
 update internal.worker_dispatch_control set sql_rehearsal_a_at=clock_timestamp(),
  sql_rehearsal_pid=pg_backend_pid(),sql_rehearsal_txid=pg_current_xact_id()::text where singleton;
 commit;
 -- Native five-second cancellation must preserve A and prevent B. No event,
 -- learner, award, queue, account or original231 journal is changed by this probe.
 perform pg_sleep(4);
 update internal.worker_dispatch_control set sql_rehearsal_b_at=clock_timestamp()where singleton;
 commit;
end
$probe$;
revoke execute on procedure internal.rehearse_sql_cron_commit_timeout(text)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Root-approved Cron command MUST be exactly one top-level CALL, no BEGIN/SET:
-- CALL internal.rehearse_sql_cron_commit_timeout('<actual approved operation SHA>');
-- Schedule one original owned job, observe actual LIBPQ owner/database/5s setting,
-- original native start/end, A pid/transaction/clock, terminal timeout and B absent,
-- then remove ONLY the original owned job. Unknown acknowledgement: inspect only,
-- never schedule/unschedule a replacement or reset A to rerun the original probe.

-- Require native A minus original statement start about2s, and native end minus
-- original statement start around5s with scheduler feedback measured separately.
-- A timer reset at A could permit B around6s, before its new expiry around7s.
-- A survives, B absent and exact native timeout are all required; missing isUNKNOWN.
