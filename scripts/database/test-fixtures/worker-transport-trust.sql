begin;
set local search_path=extensions,pg_catalog;
select no_plan();
-- All fixtures and permission drift are rolled back. No Vault values or queue rows are read.
select ok(to_regprocedure('internal.worker_transport_private()')is not null,'expanded existing transport predicate is present');
select is(internal.worker_transport_private(),true,'actual current untrusted transport metadata is safe before fixture drift');
select ok((select not enabled and state='DISABLED'from internal.worker_dispatch_control where singleton),'new migration has not activated delivery');
select ok(has_function_privilege('authenticated','authorization.community_realtime_topic(text)','EXECUTE'),'exact protected Realtime helper remains admitted');
select ok(not has_function_privilege('service_role','authorization.community_realtime_topic(text)','EXECUTE'),'provider service role gains no Realtime private helper');
select ok(not has_function_privilege('service_role','internal.send_worker_wake(uuid,text,text)','EXECUTE'),'provider trust grants no Cuevo signed delivery');
select ok(not has_function_privilege('cuevo_worker','internal.worker_transport_private()','EXECUTE'),'worker cannot inspect the transport predicate directly');

-- Own only synthetic objects in provider schemas; do not alter managed relations/functions.
-- The local SQL runner has provider-owner support for these rollback-only test objects.
create table net.cuevo_transport_trust_probe(id bigint,marker text);
alter table net.cuevo_transport_trust_probe owner to postgres;
create index cuevo_transport_trust_probe_index on net.cuevo_transport_trust_probe(id);
create type net.cuevo_transport_trust_probe_type as(marker text);
alter type net.cuevo_transport_trust_probe_type owner to postgres;
create sequence net.cuevo_transport_trust_probe_sequence;
alter sequence net.cuevo_transport_trust_probe_sequence owner to postgres;
create table vault.cuevo_transport_trust_probe(marker text);
alter table vault.cuevo_transport_trust_probe owner to postgres;
create function net.cuevo_transport_trust_probe_function()returns boolean language sql as $$select true$$;
alter function net.cuevo_transport_trust_probe_function()owner to postgres;
revoke all on net.cuevo_transport_trust_probe,vault.cuevo_transport_trust_probe from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke all on sequence net.cuevo_transport_trust_probe_sequence from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on function net.cuevo_transport_trust_probe_function()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
select is(internal.worker_transport_private(),true,'safe synthetic indexes/composite types do not invalidate metadata admission');

grant select on vault.cuevo_transport_trust_probe to service_role;
grant select,insert,update,delete,truncate,references,trigger,maintain on net.cuevo_transport_trust_probe to service_role;
grant usage,select,update on sequence net.cuevo_transport_trust_probe_sequence to service_role;
grant execute on function net.cuevo_transport_trust_probe_function()to service_role;
select is(internal.worker_transport_private(),true,'trusted service provider grants alone do not refuse a safe untrusted boundary');

create function pg_temp.transport_grant_cases()returns setof text language plpgsql as $$
declare target text;principal text;permission text;statement text;safe boolean;begin
 foreach target in array array['net.cuevo_transport_trust_probe','vault.cuevo_transport_trust_probe']loop
  foreach principal in array array['PUBLIC','anon','authenticated','cuevo_api','cuevo_worker']loop
   foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']loop
    statement:=format('grant %s on %s to %I',permission,target,principal);
    if principal='PUBLIC'then statement:=format('grant %s on %s to public',permission,target);end if;
    execute statement;safe:=internal.worker_transport_private();
    return next extensions.is(safe,false,'protected relation '||permission||' refuses '||principal);
    if principal='PUBLIC'then execute format('revoke %s on %s from public',permission,target);
    else execute format('revoke %s on %s from %I',permission,target,principal);end if;
   end loop;
   foreach permission in array array['SELECT','INSERT','UPDATE','REFERENCES']loop
    if principal='PUBLIC'then execute format('grant %s(marker)on %s to public',permission,target);
    else execute format('grant %s(marker)on %s to %I',permission,target,principal);end if;
    return next extensions.is(internal.worker_transport_private(),false,'protected column '||permission||' refuses '||principal);
    if principal='PUBLIC'then execute format('revoke %s(marker)on %s from public',permission,target);
    else execute format('revoke %s(marker)on %s from %I',permission,target,principal);end if;
   end loop;
  end loop;
 end loop;
 foreach principal in array array['PUBLIC','anon','authenticated','cuevo_api','cuevo_worker']loop
  foreach permission in array array['USAGE','SELECT','UPDATE']loop
   if principal='PUBLIC'then execute format('grant %s on sequence net.cuevo_transport_trust_probe_sequence to public',permission);
   else execute format('grant %s on sequence net.cuevo_transport_trust_probe_sequence to %I',permission,principal);end if;
   return next extensions.is(internal.worker_transport_private(),false,'protected sequence '||permission||' refuses '||principal);
   if principal='PUBLIC'then execute format('revoke %s on sequence net.cuevo_transport_trust_probe_sequence from public',permission);
   else execute format('revoke %s on sequence net.cuevo_transport_trust_probe_sequence from %I',permission,principal);end if;
  end loop;
 end loop;
 return next extensions.is(internal.worker_transport_private(),true,'all individual synthetic object grant drift is restored');
end$$;
select *from pg_temp.transport_grant_cases();

-- Callable future routines are refused. Default EXECUTE alone remains unreachable.
grant execute on function net.cuevo_transport_trust_probe_function()to public;
select is(internal.worker_transport_private(),true,'PUBLIC routine execute alone with unreachable schema remains safe');
grant usage on schema net to authenticated;
select is(internal.worker_transport_private(),false,'schema plus default execute reaches current or future provider routine');
revoke usage on schema net from authenticated;
grant usage on schema net to public;
select is(internal.worker_transport_private(),false,'PUBLIC schema plus execute opens network capability');
revoke usage on schema net from public;
revoke execute on function net.cuevo_transport_trust_probe_function()from public;
select is(internal.worker_transport_private(),true,'restored unreachable routine metadata is safe');

-- Exact private helper exception cannot broaden to another signature or wrapper.
create function internal.cuevo_transport_trust_probe_function()returns boolean language sql as $$select true$$;
alter function internal.cuevo_transport_trust_probe_function()owner to postgres;
revoke execute on function internal.cuevo_transport_trust_probe_function()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function pg_temp.transport_private_cases()returns setof text language plpgsql as $$
declare principal text;begin
 foreach principal in array array['PUBLIC','anon','authenticated','service_role']loop
  if principal='PUBLIC'then execute 'grant execute on function internal.cuevo_transport_trust_probe_function()to public';
  else execute format('grant execute on function internal.cuevo_transport_trust_probe_function()to %I',principal);end if;
  return next extensions.is(internal.worker_transport_private(),false,'private wrapper execute refuses '||principal);
  if principal='PUBLIC'then execute 'revoke execute on function internal.cuevo_transport_trust_probe_function()from public';
  else execute format('revoke execute on function internal.cuevo_transport_trust_probe_function()from %I',principal);end if;
 end loop;
 return next extensions.is(internal.worker_transport_private(),true,'private helper grant restoration is safe');
end$$;
select *from pg_temp.transport_private_cases();

grant execute on function internal.worker_transport_private()to cuevo_worker;
select is(internal.worker_transport_private(),false,'worker grant to private operational predicate refuses admission');
revoke execute on function internal.worker_transport_private()from cuevo_worker;
grant execute on function internal.send_worker_wake(uuid,text,text)to service_role;
select is(internal.worker_transport_private(),false,'trusted provider cannot bridge through Cuevo signed sender');
revoke execute on function internal.send_worker_wake(uuid,text,text)from service_role;

-- Privilege routes are refused even with NOINHERIT or a multi-hop SET-only path.
create role cuevo_transport_trust_probe_role nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant execute on function internal.send_worker_wake(uuid,text,text)to cuevo_transport_trust_probe_role;
grant cuevo_transport_trust_probe_role to cuevo_api with inherit false,set true;
select is(internal.worker_transport_private(),false,'SET-only intermediate sender capability refuses API transport');
revoke cuevo_transport_trust_probe_role from cuevo_api;
revoke execute on function internal.send_worker_wake(uuid,text,text)from cuevo_transport_trust_probe_role;
grant execute on function internal.cuevo_transport_trust_probe_function()to cuevo_transport_trust_probe_role;
grant cuevo_transport_trust_probe_role to authenticated with inherit false,set true;
select is(internal.worker_transport_private(),false,'SET-only browser intermediate private wrapper is refused');
revoke cuevo_transport_trust_probe_role from authenticated;
revoke execute on function internal.cuevo_transport_trust_probe_function()from cuevo_transport_trust_probe_role;
select is(internal.worker_transport_private(),true,'SET-only private capability drift is restored');
grant service_role to cuevo_transport_trust_probe_role with inherit false,set true;
grant cuevo_transport_trust_probe_role to cuevo_worker with inherit false,set true;
select is(internal.worker_transport_private(),false,'multi-hop SET-only provider membership refuses custom worker');
revoke cuevo_transport_trust_probe_role from cuevo_worker;
revoke service_role from cuevo_transport_trust_probe_role;
grant cuevo_transport_trust_probe_role to cuevo_api with inherit true,set false;
grant select on net.cuevo_transport_trust_probe to cuevo_transport_trust_probe_role;
select is(internal.worker_transport_private(),false,'inherited nonprivileged role table grant is still a secret-network path');
revoke select on net.cuevo_transport_trust_probe from cuevo_transport_trust_probe_role;
revoke cuevo_transport_trust_probe_role from cuevo_api;
alter role cuevo_transport_trust_probe_role bypassrls;
grant cuevo_transport_trust_probe_role to authenticated with inherit false,set false;
select is(internal.worker_transport_private(),false,'dormant browser membership to privileged role refuses transport');
revoke cuevo_transport_trust_probe_role from authenticated;
alter role cuevo_transport_trust_probe_role nobypassrls;

create function pg_temp.transport_role_cases()returns setof text language plpgsql as $$
declare attribute text;begin
 foreach attribute in array array['SUPERUSER','BYPASSRLS','CREATEROLE','CREATEDB','REPLICATION']loop
  execute format('alter role cuevo_worker %s',attribute);
  return next extensions.is(internal.worker_transport_private(),false,'custom worker '||attribute||' refuses transport');
  execute format('alter role cuevo_worker NO%s',attribute);
 end loop;
 return next extensions.is(internal.worker_transport_private(),true,'custom role attributes restored');
end$$;
select *from pg_temp.transport_role_cases();

grant create on schema public to cuevo_api;
select is(internal.worker_transport_private(),false,'custom API schema CREATE can replace an owner-authority bridge');
revoke create on schema public from cuevo_api;
grant create on schema public to public;
select is(internal.worker_transport_private(),false,'PUBLIC CREATE can introduce an exposed bridge');
revoke create on schema public from public;
alter table net.cuevo_transport_trust_probe owner to cuevo_worker;
select is(internal.worker_transport_private(),false,'custom worker object ownership refuses transport');
alter table net.cuevo_transport_trust_probe owner to postgres;
revoke all on net.cuevo_transport_trust_probe from cuevo_worker;
alter function net.cuevo_transport_trust_probe_function()owner to cuevo_transport_trust_probe_role;
select is(internal.worker_transport_private(),false,'unreviewed transport function owner refuses admission');
alter function net.cuevo_transport_trust_probe_function()owner to postgres;
revoke execute on function net.cuevo_transport_trust_probe_function()from public;

-- A missing required schema/object fails before any secret or network read.
alter table net.cuevo_transport_trust_probe rename to cuevo_transport_trust_probe_restored;
select is(internal.worker_transport_private(),true,'optional metadata name does not substitute for required protected relation');
alter schema vault rename to cuevo_transport_trust_missing_vault;
select is(internal.worker_transport_private(),false,'missing required protected view remains unknown and refused');
alter schema cuevo_transport_trust_missing_vault rename to vault;
select is(internal.worker_transport_private(),true,'all bounded synthetic catalog drift restored');
select *from finish();
rollback;
