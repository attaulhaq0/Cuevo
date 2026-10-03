begin;
-- Provider-owned extension grants require verified owner hardening before activation.
-- The scheduler stores only one-use signatures, never a reusable worker credential.
create function internal.worker_transport_private()returns boolean language plpgsql stable security definer set search_path=''as $$
declare role_name text;object_name text;namespace_name text;relation oid;begin
 foreach namespace_name in array array['net','vault']loop
  if not exists(select 1 from pg_namespace where nspname=namespace_name)then return false;end if;
  if exists(select 1 from pg_namespace namespace cross join lateral aclexplode(coalesce(namespace.nspacl,acldefault('n',namespace.nspowner)))privilege
   where namespace.nspname=namespace_name and privilege.grantee=0 and privilege.privilege_type='USAGE')then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role','cuevo_api','cuevo_worker']loop
   if has_schema_privilege(role_name,namespace_name,'USAGE')then return false;end if;
  end loop;
 end loop;
 foreach object_name in array array['net.http_request_queue','net._http_response','vault.decrypted_secrets']loop
  relation:=to_regclass(object_name);if relation is null then return false;end if;
  if exists(select 1 from pg_class object cross join lateral aclexplode(coalesce(object.relacl,acldefault('r',object.relowner)))privilege
   where object.oid=relation and privilege.grantee=0 and privilege.privilege_type in('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role','cuevo_api','cuevo_worker']loop
   if has_table_privilege(role_name,relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')or has_any_column_privilege(role_name,relation,'SELECT,INSERT,UPDATE,REFERENCES')then return false;end if;
  end loop;
  if exists(select 1 from pg_attribute column_info cross join lateral aclexplode(column_info.attacl)privilege
   where column_info.attrelid=relation and not column_info.attisdropped and column_info.attnum>0 and privilege.grantee=0 and privilege.privilege_type in('SELECT','INSERT','UPDATE','REFERENCES'))then return false;end if;
 end loop;
 return true;
end$$;
revoke execute on function internal.worker_transport_private()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.configure_worker_dispatch(boolean,text,text,boolean)'::regprocedure);
 anchor:=' if target_enabled then';
 if position(anchor in definition)=0 then raise exception 'Worker activation boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||' if not internal.worker_transport_private()then raise exception ''Worker transport permissions require operator review''using errcode=''22023'';end if;');execute definition;
 definition:=pg_get_functiondef('internal.worker_dispatch_health()'::regprocedure);
 anchor:='return health||jsonb_build_object(''enabled'',control.enabled';
 if position(anchor in definition)=0 then raise exception 'Worker transport health boundary changed'using errcode='22023';end if;
 execute replace(definition,anchor,'return health||jsonb_build_object(''transportPrivate'',internal.worker_transport_private(),''enabled'',control.enabled');
end$$;

create or replace function internal.send_worker_wake(target_wake uuid,target_endpoint text,target_secret_name text)returns bigint
language plpgsql security definer set search_path=''as $$declare token text;request_id bigint;issued_seconds bigint;message text;signature text;begin
 if not internal.worker_transport_private()then raise exception 'Worker transport unavailable'using errcode='22023';end if;
 select secret.decrypted_secret into token from vault.decrypted_secrets secret where secret.name=target_secret_name;
 if token is null or token!~'^[a-f0-9]{64}$'or target_wake is null then raise exception 'Worker transport unavailable'using errcode='22023';end if;
 issued_seconds:=floor(extract(epoch from clock_timestamp()))::bigint;
 message:='cuevo.worker.wake.v1'||chr(10)||issued_seconds::text||chr(10)||target_wake::text;
 signature:=encode(extensions.hmac(convert_to(message,'UTF8'),convert_to(token,'UTF8'),'sha256'),'hex');
 select net.http_post(url:=target_endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Cuevo-Wake-Time',issued_seconds::text,'X-Cuevo-Wake-Signature',signature),
  body:=jsonb_build_object('version',1,'wakeId',target_wake),timeout_milliseconds:=1000)into request_id;
 if request_id is null then raise exception 'Worker transport unavailable'using errcode='22023';end if;
 return request_id;
end$$;
revoke execute on function internal.send_worker_wake(uuid,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
