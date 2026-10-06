-- Private invitation intent only. No runtime, provider, mail, claim or hosted activation.
begin;

create table internal.school_account_runtime_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 mode text not null default 'DISABLED' check(mode in('DISABLED','LOCAL_SYNTHETIC')),
 database_oid oid,
 project_ref text,
 revision integer not null default 0 check(revision>=0),
 approved_operator_id uuid,
 approved_at timestamptz,
 reason text,
 check((enabled and mode='LOCAL_SYNTHETIC' and database_oid is not null and project_ref='LOCAL_CUEVO' and approved_operator_id is not null and approved_at is not null and reason is not null and length(btrim(reason))between 1 and 1000)
 or(not enabled and mode='DISABLED' and database_oid is null and project_ref is null and approved_operator_id is null and approved_at is null and reason is null))
);
insert into internal.school_account_runtime_control(singleton)values(true);

create table internal.school_account_runtime_revisions (
 revision integer primary key check(revision>0),
 enabled boolean not null,
 mode text not null check(mode in('DISABLED','LOCAL_SYNTHETIC')),
 database_oid oid not null,
 project_ref text not null check(project_ref='LOCAL_CUEVO'),
 approved_operator_id uuid not null,
 reason text not null check(length(btrim(reason))between 1 and 1000),
 approved_at timestamptz not null default clock_timestamp(),
 check(enabled=(mode='LOCAL_SYNTHETIC'))
);

create table internal.school_account_requests (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references app.schools(id),
 requested_by uuid not null,
 provider_user_id uuid not null unique default gen_random_uuid(),
 display_name text not null check(length(btrim(display_name))between 1 and 200),
 email text not null check(email=lower(btrim(email))and length(email)between 3 and 254 and email!~'[[:space:]]'and email~'^[^@]+@[^@]+\.[^@]+$'),
 role text not null check(role in('admin','coordinator','teacher','student','parent')),
 approving_member_revision integer not null check(approving_member_revision>0),
 control_revision integer not null references internal.school_account_runtime_revisions(revision),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 current_revision integer not null default 1 check(current_revision>0),
 current_status text not null default 'REQUESTED' check(current_status in('REQUESTED','SOURCE_ACKNOWLEDGED','IDENTITY_CONFIRMED','LINK_PENDING','DELIVERY_ACCEPTED','CLAIMED','REVOKED','REQUIRES_REVIEW','OUTCOME_UNKNOWN')),
 foreign key(school_id,requested_by)references app.memberships(school_id,actor_id),
 unique(school_id,id),
 check(expires_at=created_at+interval'168 hours')
);
create index school_account_requests_school_cursor on internal.school_account_requests(school_id,id);
create index school_account_requests_recipient on internal.school_account_requests(school_id,email,expires_at)where current_status not in('CLAIMED','REVOKED','REQUIRES_REVIEW');

create table internal.school_account_request_revisions (
 request_id uuid not null,
 school_id uuid not null,
 revision integer not null check(revision>0),
 status text not null check(status in('REQUESTED','SOURCE_ACKNOWLEDGED','IDENTITY_CONFIRMED','LINK_PENDING','DELIVERY_ACCEPTED','CLAIMED','REVOKED','REQUIRES_REVIEW','OUTCOME_UNKNOWN')),
 intent_snapshot jsonb not null check(jsonb_typeof(intent_snapshot)='object'and octet_length(intent_snapshot::text)<=16384),
 created_by uuid not null,
 reason text not null check(length(btrim(reason))between 1 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,revision),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(school_id,created_by)references app.memberships(school_id,actor_id)
);
alter table internal.school_account_requests add constraint school_account_current_revision_fk foreign key(id,current_revision)references internal.school_account_request_revisions(request_id,revision)deferrable initially deferred;

do $$declare table_name text;begin
 foreach table_name in array array['school_account_runtime_control','school_account_runtime_revisions','school_account_requests','school_account_request_revisions']loop
  execute format('alter table internal.%I enable row level security',table_name);
  execute format('alter table internal.%I force row level security',table_name);
  execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',table_name);
 end loop;
end$$;
create trigger school_account_runtime_history_immutable before update or delete on internal.school_account_runtime_revisions for each row execute function internal.academic_history_immutable();
create trigger school_account_runtime_history_no_truncate before truncate on internal.school_account_runtime_revisions for each statement execute function internal.academic_history_immutable();
create trigger school_account_request_history_immutable before update or delete on internal.school_account_request_revisions for each row execute function internal.academic_history_immutable();
create trigger school_account_request_history_no_truncate before truncate on internal.school_account_request_revisions for each statement execute function internal.academic_history_immutable();
create trigger school_account_request_no_delete before delete on internal.school_account_requests for each row execute function internal.academic_history_immutable();
create trigger school_account_request_no_truncate before truncate on internal.school_account_requests for each statement execute function internal.academic_history_immutable();

create function internal.guard_school_account_request_intent()returns trigger language plpgsql set search_path=''as $$begin
 if new.id is distinct from old.id or new.school_id is distinct from old.school_id or new.requested_by is distinct from old.requested_by
 or new.provider_user_id is distinct from old.provider_user_id or new.display_name is distinct from old.display_name or new.email is distinct from old.email
 or new.role is distinct from old.role or new.approving_member_revision is distinct from old.approving_member_revision or new.control_revision is distinct from old.control_revision
 or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at
 or new.current_revision is distinct from old.current_revision+1 then raise exception 'School account intent and ordered revision are immutable'using errcode='55000';end if;
 return new;
end$$;
create trigger school_account_request_intent_immutable before update on internal.school_account_requests for each row execute function internal.guard_school_account_request_intent();

create function internal.configure_local_school_account_runtime(target_enabled boolean,target_database_oid oid,target_project_ref text,target_operator uuid,target_reason text,expected_revision integer,confirm_configuration boolean)returns integer
language plpgsql security definer set search_path=''as $$
declare control internal.school_account_runtime_control;database_identity oid;approved_time timestamptz:=clock_timestamp();begin
 if session_user<>'postgres' or target_enabled is null or confirm_configuration is distinct from true
 or target_project_ref is distinct from'LOCAL_CUEVO'or target_operator is null or length(btrim(coalesce(target_reason,'')))not between 1 and 1000
 or expected_revision is null then raise exception 'Explicit local owner approval required'using errcode='42501';end if;
 select oid into database_identity from pg_catalog.pg_database where datname=current_database();
 if target_database_oid is distinct from database_identity or current_setting('app.runtime_env',true)is distinct from'local'then raise exception 'Exact local account target required'using errcode='42501';end if;
 if not exists(select 1 from auth.users actor where actor.id=target_operator and actor.email_confirmed_at is not null and actor.is_anonymous is false and actor.deleted_at is null and(actor.banned_until is null or actor.banned_until<=clock_timestamp()))then raise exception 'Current verified operator account required'using errcode='42501';end if;
 select*into control from internal.school_account_runtime_control where singleton for update;
 if not found or control.revision<>expected_revision then raise exception 'Current account runtime approval revision changed'using errcode='22023';end if;
 insert into internal.school_account_runtime_revisions(revision,enabled,mode,database_oid,project_ref,approved_operator_id,reason,approved_at)
 values(control.revision+1,target_enabled,case when target_enabled then'LOCAL_SYNTHETIC'else'DISABLED'end,database_identity,'LOCAL_CUEVO',target_operator,btrim(target_reason),approved_time);
 update internal.school_account_runtime_control set revision=control.revision+1,enabled=target_enabled,mode=case when target_enabled then'LOCAL_SYNTHETIC'else'DISABLED'end,
 database_oid=case when target_enabled then database_identity end,project_ref=case when target_enabled then'LOCAL_CUEVO'end,
 approved_operator_id=case when target_enabled then target_operator end,approved_at=case when target_enabled then approved_time end,reason=case when target_enabled then btrim(target_reason)end where singleton;
 return control.revision+1;
end$$;

create function internal.require_school_account_runtime(target_school uuid,expected_control_revision integer default null)returns integer
language plpgsql stable security definer set search_path=''as $$
declare control internal.school_account_runtime_control;begin
 select*into control from internal.school_account_runtime_control where singleton;
 if not found or not control.enabled or control.mode<>'LOCAL_SYNTHETIC'or control.project_ref is distinct from'LOCAL_CUEVO'
 or control.database_oid is distinct from(select oid from pg_catalog.pg_database where datname=current_database())
 or expected_control_revision is not null and expected_control_revision<>control.revision
 or not exists(select 1 from internal.school_account_runtime_revisions history where history.revision=control.revision and history.enabled and history.mode=control.mode and history.database_oid=control.database_oid and history.project_ref=control.project_ref and history.approved_operator_id=control.approved_operator_id and history.approved_at=control.approved_at)
 or not exists(select 1 from auth.users operator where operator.id=control.approved_operator_id and operator.email_confirmed_at is not null and operator.is_anonymous is false and operator.deleted_at is null and(operator.banned_until is null or operator.banned_until<=clock_timestamp()))
 then raise exception 'Current local synthetic account runtime approval required'using errcode='42501';end if;
 perform internal.require_synthetic_intelligence_school(target_school);
 return control.revision;
end$$;

create function internal.school_account_intent(source internal.school_account_requests)returns jsonb
language sql stable set search_path=''as $$
 select jsonb_build_object('schoolId',source.school_id,'requestedBy',source.requested_by,'providerUserId',source.provider_user_id,'displayName',source.display_name,'email',source.email,'role',source.role,
 'approvingMemberRevision',source.approving_member_revision,'controlRevision',source.control_revision,'createdAt',to_char(source.created_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expiresAt',to_char(source.expires_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'classification','LOCAL_SYNTHETIC')
$$;

create function internal.school_account_request_receipt(source internal.school_account_requests)returns jsonb
language sql stable set search_path=''as $$
 select jsonb_build_object('id',source.id,'schoolId',source.school_id,'revision',source.current_revision,'status',source.current_status,'createdAt',source.created_at,'expiresAt',source.expires_at)
$$;

create function internal.require_school_account_request(source internal.school_account_requests,require_open boolean)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or source.school_id is distinct from"authorization".school_id()or require_open is null then raise exception 'Exact school account request required'using errcode='42501';end if;
 perform internal.require_school_account_runtime(source.school_id,source.control_revision);
 if not exists(select 1 from app.memberships approver join auth.users account on account.id=approver.actor_id where approver.school_id=source.school_id and approver.actor_id=source.requested_by and approver.revision=source.approving_member_revision and approver.role='admin'and approver.status='active'and approver.effective_from<=clock_timestamp()and(approver.effective_to is null or approver.effective_to>clock_timestamp())and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.context'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.operations'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=source.school_id and revision.revision=source.current_revision and revision.status=source.current_status and revision.intent_snapshot=internal.school_account_intent(source))
 then raise exception 'Current approved school account source required'using errcode='42501';end if;
 if require_open and(source.expires_at<=clock_timestamp()or source.current_status in('CLAIMED','REVOKED','REQUIRES_REVIEW'))then raise exception 'Open current school account request required'using errcode='42501';end if;
end$$;

create function internal.create_school_account_invitation(payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();control_revision integer;member_revision integer;source internal.school_account_requests;reservation jsonb;response jsonb;created_time timestamptz:=clock_timestamp();recipient text;begin
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 perform internal.require_school_admin();
 control_revision:=internal.require_school_account_runtime(school);
 if payload is null or jsonb_typeof(payload)<>'object'or not(payload?&array['displayName','email','role','reason','confirmInvitation'])
 or exists(select 1 from jsonb_object_keys(payload)field where field not in('displayName','email','role','reason','confirmInvitation'))
 or jsonb_typeof(payload->'displayName')is distinct from'string'or length(btrim(payload->>'displayName'))not between 1 and 200
 or jsonb_typeof(payload->'email')is distinct from'string'or length(payload->>'email')not between 3 and 254 or payload->>'email'<>btrim(payload->>'email')or payload->>'email'~'[[:space:]]'or payload->>'email'!~'^[^@]+@[^@]+\.[^@]+$'
 or jsonb_typeof(payload->'role')is distinct from'string'or payload->>'role'not in('admin','coordinator','teacher','student','parent')
 or jsonb_typeof(payload->'reason')is distinct from'string'or length(btrim(payload->>'reason'))not between 1 and 1000
 or payload->'confirmInvitation'is distinct from'true'::jsonb then raise exception 'Confirmed bounded school account intent required'using errcode='22023';end if;
 if payload->>'role'='admin'then perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));perform internal.require_school_admin();end if;
 reservation:=internal.begin_command(command_key,'school.account.invite',fingerprint);
 if reservation->>'state'='COMPLETED'then
  select*into source from internal.school_account_requests where id=(reservation->'response'->>'id')::uuid and school_id=school for update;
  perform internal.require_school_account_request(source,true);
  if source.requested_by<>actor then raise exception 'Original invitation actor required'using errcode='42501';end if;
  return reservation->'response';
 elsif reservation->>'state'<>'NEW'then raise exception 'School account request in progress'using errcode='22023';end if;
 recipient:=lower(payload->>'email');
 if exists(select 1 from internal.school_account_requests existing where existing.school_id=school and existing.email=recipient and existing.expires_at>clock_timestamp()and existing.current_status not in('CLAIMED','REVOKED','REQUIRES_REVIEW'))then raise exception 'Active recipient request requires review'using errcode='22023';end if;
 select revision into member_revision from app.memberships where school_id=school and actor_id=actor for share;
 insert into internal.school_account_requests(school_id,requested_by,display_name,email,role,approving_member_revision,control_revision,created_at,expires_at)
 values(school,actor,btrim(payload->>'displayName'),recipient,payload->>'role',member_revision,control_revision,created_time,created_time+interval'168 hours')returning*into source;
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason,created_at)
 values(source.id,school,1,'REQUESTED',internal.school_account_intent(source),actor,btrim(payload->>'reason'),created_time);
 perform internal.append_audit('school.account.invited','school_account_request',source.id,request_id,'succeeded',jsonb_build_object('requestRevision',1));
 perform internal.enqueue_event('school.account.provisioning_requested','school_account_request',source.id,1,jsonb_build_object('requestRevision',1),'school-account:'||source.id::text||':1');
 response:=internal.school_account_request_receipt(source);
 perform internal.finish_command(command_key,'school.account.invite',fingerprint,response);
 return response;
end$$;

create function internal.read_school_account_invitations(page_limit integer,page_cursor uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();items jsonb;source internal.school_account_requests;begin
 perform internal.require_school_admin();perform internal.require_school_account_runtime(school);
 if page_limit is null or page_limit not between 1 and 25 then raise exception 'Bounded invitation page required'using errcode='22023';end if;
 if page_cursor is not null and not exists(select 1 from internal.school_account_requests request where request.school_id=school and request.id=page_cursor)then raise exception 'Current school invitation cursor required'using errcode='42501';end if;
 items:='[]'::jsonb;
 for source in select*from internal.school_account_requests where school_id=school and(page_cursor is null or id>page_cursor)order by id limit page_limit+1 loop
  -- Historical status remains truthful; expiry/control loss never rewrites immutable intent.
  items:=items||jsonb_build_array(internal.school_account_request_receipt(source)||jsonb_build_object('displayName',source.display_name,'email',source.email,'role',source.role,'userId',case when source.current_status in('IDENTITY_CONFIRMED','LINK_PENDING','DELIVERY_ACCEPTED','CLAIMED')then source.provider_user_id else null end));
 end loop;
 return jsonb_build_object('items',case when jsonb_array_length(items)>page_limit then items-page_limit else items end,'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;

create function internal.revoke_school_account_invitation(target_request uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();source internal.school_account_requests;reservation jsonb;response jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 perform internal.require_school_admin();perform internal.require_school_account_runtime(school);
 perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));perform internal.require_school_admin();
 if target_request is null or payload is null or jsonb_typeof(payload)<>'object'or not(payload?&array['expectedRevision','reason','confirmRevocation'])
 or exists(select 1 from jsonb_object_keys(payload)field where field not in('expectedRevision','reason','confirmRevocation'))
 or jsonb_typeof(payload->'expectedRevision')is distinct from'number'or payload->>'expectedRevision'!~'^[1-9][0-9]*$'
 or jsonb_typeof(payload->'reason')is distinct from'string'or length(btrim(payload->>'reason'))not between 1 and 1000
 or payload->'confirmRevocation'is distinct from'true'::jsonb then raise exception 'Confirmed current invitation cancellation required'using errcode='22023';end if;
 select*into source from internal.school_account_requests where id=target_request and school_id=school for update;
 if not found then raise exception 'Current school request required'using errcode='42501';end if;
 perform internal.require_school_account_request(source,false);
 if source.current_status='CLAIMED'then raise exception 'Claimed account requires separate membership review'using errcode='22023';end if;
 reservation:=internal.begin_command(command_key,'school.account.revoke',fingerprint);
 if reservation->>'state'='COMPLETED'then
  if source.current_status<>'REVOKED'or source.current_revision<>(reservation->'response'->>'revision')::integer then raise exception 'Current revoked request changed'using errcode='42501';end if;
  return reservation->'response';
 elsif reservation->>'state'<>'NEW'then raise exception 'School account cancellation in progress'using errcode='22023';end if;
 if source.current_status='REVOKED'or source.current_revision<>(payload->>'expectedRevision')::integer then raise exception 'Current invitation revision changed'using errcode='22023';end if;
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason)
 values(source.id,school,source.current_revision+1,'REVOKED',internal.school_account_intent(source),actor,btrim(payload->>'reason'));
 update internal.school_account_requests set current_revision=source.current_revision+1,current_status='REVOKED'where id=source.id returning*into source;
 -- All future admission digests/effects are revision-scoped; this pointer invalidates the old revision.
 perform internal.append_audit('school.account.invitation_revoked','school_account_request',source.id,request_id,'succeeded',jsonb_build_object('requestRevision',source.current_revision));
 perform internal.enqueue_event('school.account.invitation_revoked','school_account_request',source.id,source.current_revision,jsonb_build_object('requestRevision',source.current_revision),'school-account-revoked:'||source.id::text||':'||source.current_revision::text);
 -- Only an untouched exact pending Auth event can be terminally cancelled here.
 -- An admitted/in-flight/prior-attempt effect keeps its own authoritative receipt.
 update internal.outbox_events event set state='COMPLETED',completed_at=clock_timestamp(),last_error_code='REQUEST_REVOKED'
 where event.school_id=school and event.entity_type='school_account_request'and event.entity_id=source.id and event.actor_id=source.requested_by
 and event.type='school.account.provisioning_requested'and event.version=1 and event.metadata='{"requestRevision":1}'::jsonb
 and event.state='PENDING'and event.attempt_count=0 and event.lease_token is null and event.lease_until is null;
 response:=internal.school_account_request_receipt(source);
 perform internal.finish_command(command_key,'school.account.revoke',fingerprint,response);
 return response;
end$$;

-- A lifecycle acknowledgment validates its immutable source; it performs no Auth or mail effect.
alter function internal.process_learner_event(uuid,uuid)rename to process_before_school_account_sources;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;source internal.school_account_requests;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Invalid school account lifecycle event lease'using errcode='22023';end if;
 if internal.outbox_event_owner(event.type)is distinct from'WORKER'then raise exception 'School account event belongs to Auth executor'using errcode='42501';end if;
 if event.type<>'school.account.invitation_revoked'then return internal.process_before_school_account_sources(target_event,current_lease);end if;
 select*into source from internal.school_account_requests where id=event.entity_id and school_id=event.school_id;
 if not found or event.entity_type<>'school_account_request'or event.metadata is distinct from jsonb_build_object('requestRevision',event.version)
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=event.school_id and revision.revision=event.version and revision.status='REVOKED'and revision.created_by=event.actor_id and revision.intent_snapshot=internal.school_account_intent(source))
 or not exists(select 1 from internal.audit_events audit where audit.school_id=event.school_id and audit.actor_id=event.actor_id and audit.entity_type='school_account_request'and audit.entity_id=event.entity_id and audit.action='school.account.invitation_revoked'and audit.outcome='succeeded'and audit.metadata=jsonb_build_object('requestRevision',event.version))
 then raise exception 'Exact school account revocation source required'using errcode='22023';end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'School account lifecycle acknowledgment lease changed'using errcode='22023';end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end$$;

revoke execute on function internal.guard_school_account_request_intent(),internal.configure_local_school_account_runtime(boolean,oid,text,uuid,text,integer,boolean),internal.require_school_account_runtime(uuid,integer),
 internal.school_account_intent(internal.school_account_requests),internal.school_account_request_receipt(internal.school_account_requests),internal.require_school_account_request(internal.school_account_requests,boolean),
 internal.create_school_account_invitation(jsonb,text,text,text),internal.read_school_account_invitations(integer,uuid),internal.revoke_school_account_invitation(uuid,jsonb,text,text,text)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on function internal.process_before_school_account_sources(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
grant execute on function internal.create_school_account_invitation(jsonb,text,text,text),internal.read_school_account_invitations(integer,uuid),internal.revoke_school_account_invitation(uuid,jsonb,text,text,text)to cuevo_api;
commit;
