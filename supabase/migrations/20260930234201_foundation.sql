-- Cuevo private foundation. Migration SQL is the source of truth; runtime roles never own objects.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='cuevo_api') then
    create role cuevo_api nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='cuevo_worker') then
    create role cuevo_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
-- PostgreSQL 17 creates role membership with SET disabled; the trusted migration owner
-- needs explicit SET permission for local verification and credential provisioning.
grant cuevo_api,cuevo_worker to postgres with inherit false, set true;
create schema app;
create schema internal;
create schema "authorization";
revoke all on schema app, internal, "authorization" from public, anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated, service_role;
-- PUBLIC has an implicit global EXECUTE default; a schema-level REVOKE cannot
-- remove that global default for future functions. Revoke globally for this owner.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;
-- Supabase owns supabase_admin defaults; postgres cannot alter that provider role.
-- Business migrations create postgres-owned objects only, in unexposed private schemas.
alter default privileges for role postgres in schema app, internal, "authorization" revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app, internal, "authorization" revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app, internal, "authorization" revoke execute on functions from public, anon, authenticated, service_role;
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
   revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
 end if;
end $$;

create table app.schools (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 country_code text not null check(country_code ~ '^[A-Z]{2}$'), status text not null default 'active' check(status in ('active','suspended','archived')),
 languages text[] not null default array['en','ar'], created_at timestamptz not null default now()
);
create table app.memberships (
 id uuid not null default gen_random_uuid(), school_id uuid not null references app.schools(id), actor_id uuid not null,
 role text not null check(role in ('admin','coordinator','teacher','student','parent')),
 status text not null default 'active' check(status in ('active','suspended','revoked')),
 effective_from timestamptz not null default now(), effective_to timestamptz,
 created_at timestamptz not null default now(), primary key(school_id,actor_id), unique(school_id,id),
 check(effective_to is null or effective_to > effective_from)
);
create index memberships_actor_idx on app.memberships(actor_id,school_id);
create table app.people (
 school_id uuid not null, actor_id uuid not null, display_name text not null check(length(display_name) between 1 and 200),
 synthetic boolean not null default false, created_at timestamptz not null default now(),
 primary key(school_id,actor_id), foreign key(school_id,actor_id) references app.memberships(school_id,actor_id)
);
create table app.entitlements (
 school_id uuid not null references app.schools(id), code text not null check(code ~ '^[a-z][a-z0-9._-]{1,99}$'),
 enabled boolean not null default false, effective_from timestamptz not null default now(), effective_to timestamptz,
 primary key(school_id,code), check(effective_to is null or effective_to > effective_from)
);
create table app.academic_years (
 school_id uuid not null references app.schools(id), id uuid not null default gen_random_uuid(), name text not null,
 starts_on date not null, ends_on date not null, primary key(school_id,id), check(ends_on > starts_on)
);
create table app.terms (
 school_id uuid not null, id uuid not null default gen_random_uuid(), academic_year_id uuid not null, name text not null,
 starts_on date not null, ends_on date not null, primary key(school_id,id),
 foreign key(school_id,academic_year_id) references app.academic_years(school_id,id), check(ends_on > starts_on)
);
create index terms_year_idx on app.terms(school_id,academic_year_id);
create table app.year_groups (
 school_id uuid not null references app.schools(id), id uuid not null default gen_random_uuid(), name text not null,
 ordinal integer not null check(ordinal >= 0), primary key(school_id,id), unique(school_id,ordinal)
);
create table app.classes (
 school_id uuid not null, id uuid not null default gen_random_uuid(), academic_year_id uuid not null, year_group_id uuid not null,
 name text not null, status text not null default 'active' check(status in ('active','archived')), primary key(school_id,id),
 foreign key(school_id,academic_year_id) references app.academic_years(school_id,id),
 foreign key(school_id,year_group_id) references app.year_groups(school_id,id)
);
create index classes_year_idx on app.classes(school_id,academic_year_id);
create index classes_group_idx on app.classes(school_id,year_group_id);
create table app.subjects (
 school_id uuid not null references app.schools(id), id uuid not null default gen_random_uuid(), name text not null,
 primary key(school_id,id)
);
create table app.enrollments (
 school_id uuid not null, class_id uuid not null, student_actor_id uuid not null,
 status text not null default 'active' check(status in ('active','revoked','completed')),
 effective_from timestamptz not null default now(), effective_to timestamptz, primary key(school_id,class_id,student_actor_id),
 foreign key(school_id,class_id) references app.classes(school_id,id),
 foreign key(school_id,student_actor_id) references app.memberships(school_id,actor_id),
 check(effective_to is null or effective_to > effective_from)
);
create index enrollments_student_idx on app.enrollments(school_id,student_actor_id,class_id);
create table app.teacher_assignments (
 school_id uuid not null, class_id uuid not null, subject_id uuid not null, teacher_actor_id uuid not null,
 status text not null default 'active' check(status in ('active','revoked')),
 effective_from timestamptz not null default now(), effective_to timestamptz,
 primary key(school_id,class_id,subject_id,teacher_actor_id),
 foreign key(school_id,class_id) references app.classes(school_id,id),
 foreign key(school_id,subject_id) references app.subjects(school_id,id),
 foreign key(school_id,teacher_actor_id) references app.memberships(school_id,actor_id),
 check(effective_to is null or effective_to > effective_from)
);
create index teacher_assignments_teacher_idx on app.teacher_assignments(school_id,teacher_actor_id,class_id);
create index teacher_assignments_subject_idx on app.teacher_assignments(school_id,subject_id);
create table app.parent_relationships (
 school_id uuid not null, parent_actor_id uuid not null, student_actor_id uuid not null,
 relationship_type text not null check(relationship_type in ('parent','guardian')),
 status text not null default 'active' check(status in ('active','revoked','pending')),
 effective_from timestamptz not null default now(), effective_to timestamptz,
 primary key(school_id,parent_actor_id,student_actor_id),
 foreign key(school_id,parent_actor_id) references app.memberships(school_id,actor_id),
 foreign key(school_id,student_actor_id) references app.memberships(school_id,actor_id),
 check(effective_to is null or effective_to > effective_from)
);
create index parent_relationships_student_idx on app.parent_relationships(school_id,student_actor_id,parent_actor_id);

create function "authorization".actor_id() returns uuid language plpgsql stable set search_path='' as $$
begin return nullif(current_setting('app.actor_id',true),'')::uuid;
exception when invalid_text_representation then return null; end $$;
create function "authorization".school_id() returns uuid language plpgsql stable set search_path='' as $$
begin return nullif(current_setting('app.school_id',true),'')::uuid;
exception when invalid_text_representation then return null; end $$;
-- Owner-powered lookup avoids RLS recursion. Identity is the server-verified transaction context.
create function "authorization".current_role(target_school uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from app.memberships m join app.schools s on s.id=m.school_id
 where m.school_id=target_school and m.actor_id="authorization".actor_id()
 and m.status='active' and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now()) and s.status='active'
$$;
create function "authorization".has_entitlement(target_school uuid, entitlement_code text) returns boolean language sql stable security definer set search_path='' as $$
 select "authorization".current_role(target_school) is not null and exists(
 select 1 from app.entitlements e where e.school_id=target_school and e.code=entitlement_code and e.enabled
 and e.effective_from<=now() and (e.effective_to is null or e.effective_to>now()))
$$;
create function "authorization".can_access_school(target_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select target_school="authorization".school_id() and "authorization".has_entitlement(target_school,'school.context')
$$;
create function "authorization".can_view_person(target_school uuid,target_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select "authorization".can_access_school(target_school) and (
 target_actor="authorization".actor_id() or "authorization".current_role(target_school) in ('admin','coordinator') or (
 exists(select 1 from app.memberships m where m.school_id=target_school and m.actor_id=target_actor and m.role='student'
 and m.status='active' and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())) and (
 ("authorization".current_role(target_school)='parent' and exists(select 1 from app.parent_relationships r where r.school_id=target_school
 and r.parent_actor_id="authorization".actor_id() and r.student_actor_id=target_actor and r.status='active'
 and r.effective_from<=now() and (r.effective_to is null or r.effective_to>now()))) or
 ("authorization".current_role(target_school)='teacher' and exists(select 1 from app.teacher_assignments t join app.enrollments e
 on e.school_id=t.school_id and e.class_id=t.class_id where t.school_id=target_school and t.teacher_actor_id="authorization".actor_id()
 and e.student_actor_id=target_actor and t.status='active' and e.status='active' and t.effective_from<=now() and e.effective_from<=now()
 and (t.effective_to is null or t.effective_to>now()) and (e.effective_to is null or e.effective_to>now()))) )))
$$;
create function "authorization".can_view_class(target_school uuid,target_class uuid) returns boolean language sql stable security definer set search_path='' as $$
 select "authorization".can_access_school(target_school) and (
 "authorization".current_role(target_school) in ('admin','coordinator') or
 ("authorization".current_role(target_school)='teacher' and exists(select 1 from app.teacher_assignments t where t.school_id=target_school
 and t.class_id=target_class and t.teacher_actor_id="authorization".actor_id() and t.status='active' and t.effective_from<=now() and (t.effective_to is null or t.effective_to>now()))) or
 ("authorization".current_role(target_school) in ('student','parent') and exists(select 1 from app.enrollments e where e.school_id=target_school
 and e.class_id=target_class and e.status='active' and e.effective_from<=now() and (e.effective_to is null or e.effective_to>now())
 and "authorization".can_view_person(target_school,e.student_actor_id))))
$$;
create function "authorization".current_memberships() returns table(membership_id uuid,actor_id uuid,school_id uuid,school_name text,display_name text,role text,entitlement_codes text[])
language sql stable security definer set search_path='' as $$
 select m.id,m.actor_id,m.school_id,s.name,p.display_name,m.role,
 coalesce((select array_agg(e.code order by e.code) from app.entitlements e where e.school_id=m.school_id and e.enabled
 and e.effective_from<=now() and (e.effective_to is null or e.effective_to>now())),array[]::text[])
 from app.memberships m join app.schools s on s.id=m.school_id join app.people p on p.school_id=m.school_id and p.actor_id=m.actor_id
 where m.actor_id="authorization".actor_id() and m.status='active' and s.status='active'
 and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())
$$;
create function "authorization".is_current_session(target_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select "authorization".actor_id() is not null and exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=target_session and s.user_id="authorization".actor_id() and (s.not_after is null or s.not_after>now())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
$$;

create table internal.audit_events (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references app.schools(id), actor_id uuid not null,
 action text not null, entity_type text not null, entity_id uuid not null, request_id text not null,
 outcome text not null check(outcome in ('succeeded','denied','failed')), metadata jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default clock_timestamp(), foreign key(school_id,actor_id) references app.memberships(school_id,actor_id),
 check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384)
);
create index audit_school_time_idx on internal.audit_events(school_id,occurred_at desc);
create index audit_actor_idx on internal.audit_events(school_id,actor_id);
create table internal.idempotency_keys (
 school_id uuid not null, actor_id uuid not null, key text not null, command text not null, fingerprint text not null,
 state text not null default 'IN_PROGRESS' check(state in ('IN_PROGRESS','COMPLETED')), response jsonb,
 created_at timestamptz not null default now(), completed_at timestamptz, primary key(school_id,actor_id,key,command),
 foreign key(school_id,actor_id) references app.memberships(school_id,actor_id),
 check(length(key) between 1 and 200 and length(command) between 1 and 100), check(fingerprint ~ '^[a-f0-9]{64}$'),
 check((state='IN_PROGRESS' and response is null and completed_at is null) or (state='COMPLETED' and response is not null and completed_at is not null))
);
create table internal.outbox_events (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references app.schools(id), actor_id uuid not null,
 type text not null, entity_type text not null, entity_id uuid not null, version integer not null check(version>0), metadata jsonb not null,
 deduplication_key text not null, occurred_at timestamptz not null default clock_timestamp(),
 state text not null default 'PENDING' check(state in ('PENDING','PROCESSING','COMPLETED','FAILED')),
 attempt_count integer not null default 0 check(attempt_count>=0), max_attempts integer not null default 5 check(max_attempts between 1 and 10),
 available_at timestamptz not null default clock_timestamp(), lease_token uuid, lease_until timestamptz, completed_at timestamptz, last_error_code text,
 unique(school_id,deduplication_key), foreign key(school_id,actor_id) references app.memberships(school_id,actor_id),
 check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
 check(length(deduplication_key) between 1 and 200), check(length(type) between 1 and 100 and length(entity_type) between 1 and 100),
 check((state='PROCESSING' and lease_token is not null and lease_until is not null) or (state<>'PROCESSING' and lease_token is null and lease_until is null))
);
create index outbox_pending_idx on internal.outbox_events(available_at,occurred_at) where state='PENDING';
create index outbox_lease_idx on internal.outbox_events(lease_until) where state='PROCESSING';
create index outbox_actor_idx on internal.outbox_events(school_id,actor_id);

create function internal.require_context() returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce("authorization".can_access_school("authorization".school_id()),false) then raise exception 'Current school context required' using errcode='42501'; end if;
end $$;
create function internal.begin_command(command_key text,command_name text,request_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing internal.idempotency_keys; inserted integer;
begin
 perform internal.require_context();
 if command_key is null or length(command_key) not between 1 and 200 or command_name is null or length(command_name) not between 1 and 100
 or request_fingerprint is null or request_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid command identity' using errcode='22023'; end if;
 insert into internal.idempotency_keys(school_id,actor_id,key,command,fingerprint) values("authorization".school_id(),"authorization".actor_id(),command_key,command_name,request_fingerprint) on conflict do nothing;
 get diagnostics inserted=row_count;
 select * into existing from internal.idempotency_keys where school_id="authorization".school_id() and actor_id="authorization".actor_id() and key=command_key and command=command_name for update;
 if existing.fingerprint<>request_fingerprint then raise exception 'Idempotency fingerprint mismatch' using errcode='22023'; end if;
 return jsonb_build_object('state',case when inserted=1 then 'NEW' else existing.state end,'response',existing.response);
end $$;
create or replace function internal.finish_command(command_key text,command_name text,request_fingerprint text,command_response jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare existing internal.idempotency_keys;
begin
 perform internal.require_context();
 select * into existing from internal.idempotency_keys where school_id="authorization".school_id() and actor_id="authorization".actor_id() and key=command_key and command=command_name for update;
 if not found or request_fingerprint is null or existing.fingerprint<>request_fingerprint or command_response is null or octet_length(command_response::text)>65536 then raise exception 'Invalid command completion' using errcode='22023'; end if;
 if existing.state='COMPLETED' then
  if existing.response<>command_response then raise exception 'Completed command is immutable' using errcode='22023'; end if; return;
 end if;
 update internal.idempotency_keys set state='COMPLETED',response=command_response,completed_at=clock_timestamp() where school_id=existing.school_id and actor_id=existing.actor_id and key=existing.key and command=existing.command;
end $$;
create function internal.append_audit(action_name text,target_type text,target_id uuid,source_request_id text,action_outcome text,action_metadata jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare audit_id uuid;
begin
 perform internal.require_context();
 if length(action_name) not between 1 and 100 or length(target_type) not between 1 and 100 or length(source_request_id) not between 1 and 200 then raise exception 'Invalid audit identity' using errcode='22023'; end if;
 insert into internal.audit_events(school_id,actor_id,action,entity_type,entity_id,request_id,outcome,metadata)
 values("authorization".school_id(),"authorization".actor_id(),action_name,target_type,target_id,source_request_id,action_outcome,action_metadata) returning id into audit_id;
 return audit_id;
end $$;
create function internal.enqueue_event(event_type text,target_type text,target_id uuid,event_version integer,event_metadata jsonb,event_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing internal.outbox_events;
begin
 perform internal.require_context();
 insert into internal.outbox_events(school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
 values("authorization".school_id(),"authorization".actor_id(),event_type,target_type,target_id,event_version,event_metadata,event_key) on conflict(school_id,deduplication_key) do nothing;
 select * into existing from internal.outbox_events where school_id="authorization".school_id() and deduplication_key=event_key;
 if existing.actor_id<>"authorization".actor_id() or existing.type<>event_type or existing.entity_type<>target_type or existing.entity_id<>target_id or existing.version<>event_version or existing.metadata<>event_metadata then raise exception 'Outbox key mismatch' using errcode='22023'; end if;
 return existing.id;
end $$;
create function internal.audit_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Audit records are immutable' using errcode='55000'; end $$;
create trigger audit_no_update_delete before update or delete on internal.audit_events for each row execute function internal.audit_immutable();
create trigger audit_no_truncate before truncate on internal.audit_events for each statement execute function internal.audit_immutable();

create or replace function internal.claim_outbox(batch_size integer,lease_seconds integer)
returns table(id uuid,school_id uuid,actor_id uuid,type text,entity_type text,entity_id uuid,version integer,metadata jsonb,occurred_at timestamptz,lease_token uuid,attempt_count integer)
language plpgsql security definer set search_path='' as $$
begin
 if batch_size is null or lease_seconds is null or batch_size not between 1 and 100 or lease_seconds not between 5 and 300 then raise exception 'Invalid outbox lease bounds' using errcode='22023'; end if;
 update internal.outbox_events o set state='FAILED',lease_token=null,lease_until=null,last_error_code='LEASE_EXHAUSTED'
 where o.state='PROCESSING' and o.lease_until<clock_timestamp() and o.attempt_count>=o.max_attempts;
 return query with selected as (
 select o.id from internal.outbox_events o where o.attempt_count<o.max_attempts and (
 (o.state='PENDING' and o.available_at<=clock_timestamp()) or (o.state='PROCESSING' and o.lease_until<clock_timestamp()))
 order by o.occurred_at,o.id for update skip locked limit batch_size)
 update internal.outbox_events o set state='PROCESSING',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>lease_seconds),attempt_count=o.attempt_count+1
 from selected where o.id=selected.id returning o.id,o.school_id,o.actor_id,o.type,o.entity_type,o.entity_id,o.version,o.metadata,o.occurred_at,o.lease_token,o.attempt_count;
end $$;
create function internal.complete_outbox(event_id uuid,current_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 update internal.outbox_events set state='COMPLETED',completed_at=clock_timestamp(),lease_token=null,lease_until=null
 where id=event_id and state='PROCESSING' and lease_token=current_lease and lease_until>clock_timestamp();
 get diagnostics affected=row_count; return affected=1;
end $$;
create or replace function internal.fail_outbox(event_id uuid,current_lease uuid,error_code text,retry_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if retry_seconds is null or retry_seconds not between 0 and 3600 or error_code is null or error_code !~ '^[A-Z0-9_]{1,100}$' then raise exception 'Invalid retry metadata' using errcode='22023'; end if;
 update internal.outbox_events set state=case when attempt_count>=max_attempts then 'FAILED' else 'PENDING' end,
 last_error_code=error_code,available_at=clock_timestamp()+make_interval(secs=>retry_seconds),lease_token=null,lease_until=null
 where id=event_id and state='PROCESSING' and lease_token=current_lease and lease_until>clock_timestamp();
 get diagnostics affected=row_count; return affected=1;
end $$;

do $$ declare record_table record; begin
 for record_table in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app','internal') and c.relkind='r' loop
 execute format('alter table %I.%I enable row level security',record_table.nspname,record_table.relname);
 execute format('alter table %I.%I force row level security',record_table.nspname,record_table.relname);
 end loop;
end $$;
create policy school_read on app.schools for select to cuevo_api using("authorization".can_access_school(id));
create policy people_read on app.people for select to cuevo_api using("authorization".can_view_person(school_id,actor_id));
create policy membership_read on app.memberships for select to cuevo_api using("authorization".can_view_person(school_id,actor_id));
create policy entitlement_read on app.entitlements for select to cuevo_api using("authorization".can_access_school(school_id));
create policy year_read on app.academic_years for select to cuevo_api using("authorization".can_access_school(school_id));
create policy term_read on app.terms for select to cuevo_api using("authorization".can_access_school(school_id));
create policy year_group_read on app.year_groups for select to cuevo_api using("authorization".can_access_school(school_id));
create policy subject_read on app.subjects for select to cuevo_api using("authorization".can_access_school(school_id));
create policy class_read on app.classes for select to cuevo_api using("authorization".can_view_class(school_id,id));
create policy enrollment_read on app.enrollments for select to cuevo_api using("authorization".can_view_class(school_id,class_id) and "authorization".can_view_person(school_id,student_actor_id));
create policy teacher_assignment_read on app.teacher_assignments for select to cuevo_api using("authorization".can_access_school(school_id) and ("authorization".current_role(school_id) in ('admin','coordinator') or teacher_actor_id="authorization".actor_id()));
create policy parent_relationship_read on app.parent_relationships for select to cuevo_api using("authorization".can_access_school(school_id) and ("authorization".current_role(school_id) in ('admin','coordinator') or parent_actor_id="authorization".actor_id()));

revoke all on all tables in schema app,internal from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on all functions in schema "authorization",internal from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant usage on schema app,"authorization",internal to cuevo_api;
grant select on all tables in schema app to cuevo_api;
grant execute on all functions in schema "authorization" to cuevo_api;
grant execute on function internal.begin_command(text,text,text),internal.finish_command(text,text,text,jsonb),internal.append_audit(text,text,uuid,text,text,jsonb),internal.enqueue_event(text,text,uuid,integer,jsonb,text) to cuevo_api;
grant usage on schema internal to cuevo_worker;
grant execute on function internal.claim_outbox(integer,integer),internal.complete_outbox(uuid,uuid),internal.fail_outbox(uuid,uuid,text,integer) to cuevo_worker;
commit;
