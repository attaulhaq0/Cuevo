begin;
-- Founder-approved provider/service-role trust is limited to managed net/Vault.
-- This predicate inspects catalog metadata only. Hosted HTTP exposure is verified separately.
do $$declare sender oid;configuration oid;definition text;begin
 sender:=to_regprocedure('internal.send_worker_wake(uuid,text,text)');
 configuration:=to_regprocedure('internal.configure_worker_dispatch(boolean,text,text,boolean)');
 if sender is null or configuration is null or to_regprocedure('internal.worker_transport_private()')is null then
  raise exception 'Existing worker transport boundary required'using errcode='22023';
 end if;
 definition:=pg_get_functiondef(sender);
 if position('internal.worker_transport_private()'in definition)=0 or position('X-Cuevo-Wake-Signature'in definition)=0
 or position('timeout_milliseconds := 30000'in definition)=0 and position('timeout_milliseconds:=30000'in definition)=0
 or position('Bearer 'in definition)>0 then raise exception 'Signed worker transport boundary changed'using errcode='22023';end if;
 if position('internal.worker_transport_private()'in pg_get_functiondef(configuration))=0 then
  raise exception 'Worker activation boundary changed'using errcode='22023';end if;
end$$;

create or replace function internal.worker_transport_private()returns boolean
language plpgsql stable security definer set search_path=''as $$
declare role_name text;principal oid;current_namespace record;current_object record;current_routine record;browser_principal record;required_name text;
 realtime_helper oid:=to_regprocedure('authorization.community_realtime_topic(text)');
 table_permissions text:='SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
begin
 if current_setting('server_version_num')::integer<170000 then return false;end if;
 table_permissions:=table_permissions||',MAINTAIN';
 -- Missing fixed roles, schemas or protected relations are UNKNOWN, never a pass.
 foreach role_name in array array['anon','authenticated','cuevo_api','cuevo_worker','service_role','postgres','supabase_admin']loop
  if not exists(select 1 from pg_roles where rolname=role_name)then return false;end if;
 end loop;
 foreach required_name in array array['net','vault','app','internal','authorization']loop
  if not exists(select 1 from pg_namespace where nspname=required_name)then return false;end if;
 end loop;
 if exists(select 1 from pg_namespace namespace join pg_roles owner on owner.oid=namespace.nspowner
  where namespace.nspname in('net','vault')and owner.rolname not in('postgres','supabase_admin'))then return false;end if;
 foreach required_name in array array['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets']loop
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
  if exists(select 1 from pg_roles where oid=principal and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
   or rolname in('service_role','authenticator','postgres','supabase_admin','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_database_owner')))then return false;end if;
  if exists(select 1 from pg_auth_members where member=principal and admin_option)then return false;end if;
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
   join pg_namespace namespace on namespace.oid=object.relnamespace where namespace.nspname in('net','vault')and object.relkind in('r','v','m','f','p','S')loop
   if current_object.relkind='S'then
    if has_sequence_privilege(principal,current_object.oid,'USAGE,SELECT,UPDATE')then return false;end if;
   elsif current_object.relkind in('r','v','m','f','p')then
    if has_table_privilege(principal,current_object.oid,table_permissions)or has_any_column_privilege(principal,current_object.oid,'SELECT,INSERT,UPDATE,REFERENCES')then return false;end if;
   end if;
  end loop;
  -- Future provider routines are checked too. PUBLIC EXECUTE without schema
  -- USAGE is unreachable; granting both opens a capability and fails closed.
  for current_routine in select routine.oid,routine.pronamespace from pg_proc routine
   join pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname in('net','vault')loop
   if has_schema_privilege(principal,current_routine.pronamespace,'USAGE')and has_function_privilege(principal,current_routine.oid,'EXECUTE')then return false;end if;
  end loop;
  if role_name in('cuevo_api','cuevo_worker')and exists(select 1 from pg_namespace
   where nspname in('net','vault')and has_schema_privilege(principal,oid,'USAGE'))then return false;end if;
  -- SET-only intermediate roles must not invoke the owner-authority transport.
  foreach required_name in array array['internal.configure_worker_dispatch(boolean,text,text,boolean)','internal.send_worker_wake(uuid,text,text)','internal.request_worker_wake()','internal.worker_transport_private()']loop
   if to_regprocedure(required_name)is null or has_function_privilege(principal,to_regprocedure(required_name),'EXECUTE')then return false;end if;
  end loop;
 end loop;

 -- PUBLIC is an ACL grantee, not a fictitious SQL login. Inspect its grants directly.
 for current_namespace in select oid,nspacl,nspowner from pg_namespace where nspname<>'information_schema'and nspname!~'^pg_'loop
  if exists(select 1 from aclexplode(coalesce(current_namespace.nspacl,acldefault('n',current_namespace.nspowner)))privilege
   where privilege.grantee=0 and privilege.privilege_type='CREATE')then return false;end if;
 end loop;
 for current_object in select object.oid,object.relkind,object.relacl,object.relowner from pg_class object
  join pg_namespace namespace on namespace.oid=object.relnamespace where namespace.nspname in('net','vault')and object.relkind in('r','v','m','f','p','S')loop
  if not exists(select 1 from pg_roles where oid=current_object.relowner and rolname in('postgres','supabase_admin'))then return false;end if;
  if exists(select 1 from aclexplode(coalesce(current_object.relacl,acldefault(case when current_object.relkind='S'then'S'::"char"else'r'::"char"end,current_object.relowner)))privilege
   where privilege.grantee=0 and privilege.privilege_type in('USAGE','SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'))then return false;end if;
  if exists(select 1 from pg_attribute column_info cross join lateral aclexplode(column_info.attacl)privilege
   where column_info.attrelid=current_object.oid and not column_info.attisdropped and column_info.attnum>0 and privilege.grantee=0
   and privilege.privilege_type in('SELECT','INSERT','UPDATE','REFERENCES'))then return false;end if;
 end loop;
 for current_routine in select routine.oid,routine.proowner,routine.proacl,namespace.nspacl,namespace.nspowner from pg_proc routine
  join pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname in('net','vault')loop
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
 foreach required_name in array array['internal.configure_worker_dispatch(boolean,text,text,boolean)','internal.send_worker_wake(uuid,text,text)','internal.request_worker_wake()','internal.worker_transport_private()']loop
  if to_regprocedure(required_name)is null then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role','cuevo_api','cuevo_worker']loop
   if has_function_privilege(role_name,to_regprocedure(required_name),'EXECUTE')then return false;end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end$$;
revoke execute on function internal.worker_transport_private()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
