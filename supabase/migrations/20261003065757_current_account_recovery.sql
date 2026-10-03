-- Exact current-account recovery reuses the private invitation effect/token ledger.
-- No public email intake, provider call, password write, role grant or runtime activation.
begin;
alter table internal.school_account_requests add column purpose text not null default'invite'check(purpose in('invite','recovery'));
alter table internal.school_account_requests add column target_member_revision integer;
alter table internal.school_account_requests add constraint school_account_request_purpose_target check((purpose='invite'and target_member_revision is null)or(purpose='recovery'and target_member_revision is not null and target_member_revision>0));
alter table internal.school_account_requests drop constraint school_account_requests_provider_user_id_key;
create unique index school_account_invitation_provider_identity on internal.school_account_requests(provider_user_id)where purpose='invite';
alter table internal.school_account_token_digests drop constraint school_account_token_digests_purpose_check;
alter table internal.school_account_token_digests add constraint school_account_token_digests_purpose_check check(purpose in('invite','recovery'));

create or replace function internal.guard_school_account_request_intent()returns trigger language plpgsql set search_path=''as $$begin
 if new.id is distinct from old.id or new.school_id is distinct from old.school_id or new.requested_by is distinct from old.requested_by
 or new.provider_user_id is distinct from old.provider_user_id or new.display_name is distinct from old.display_name or new.email is distinct from old.email
 or new.role is distinct from old.role or new.approving_member_revision is distinct from old.approving_member_revision or new.control_revision is distinct from old.control_revision
 or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at or new.purpose is distinct from old.purpose or new.target_member_revision is distinct from old.target_member_revision
 or new.current_revision is distinct from old.current_revision+1 then raise exception 'School account intent and ordered revision are immutable'using errcode='55000';end if;
 return new;
end$$;
create or replace function internal.school_account_intent(source internal.school_account_requests)returns jsonb
language sql stable set search_path=''as $$
 select jsonb_build_object('schoolId',source.school_id,'requestedBy',source.requested_by,'providerUserId',source.provider_user_id,'displayName',source.display_name,'email',source.email,'role',source.role,
 'approvingMemberRevision',source.approving_member_revision,'controlRevision',source.control_revision,'createdAt',to_char(source.created_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expiresAt',to_char(source.expires_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'classification','LOCAL_SYNTHETIC')
 ||case when source.purpose='recovery'then jsonb_build_object('purpose','recovery','targetMemberRevision',source.target_member_revision)else'{}'::jsonb end
$$;

create function internal.require_school_account_source_authority(source internal.school_account_requests,require_open boolean)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or require_open is null then raise exception 'Exact account source authority required'using errcode='42501';end if;
 perform internal.require_school_account_runtime(source.school_id,source.control_revision);
 if not exists(select 1 from app.memberships approver join auth.users account on account.id=approver.actor_id where approver.school_id=source.school_id and approver.actor_id=source.requested_by and approver.revision=source.approving_member_revision and approver.role='admin'and approver.status='active'and approver.effective_from<=clock_timestamp()and(approver.effective_to is null or approver.effective_to>clock_timestamp())and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.context'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.operations'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=source.school_id and revision.revision=source.current_revision and revision.status=source.current_status and revision.intent_snapshot=internal.school_account_intent(source))
 or(source.purpose='recovery'and not exists(select 1 from app.memberships recipient join app.people person on person.school_id=recipient.school_id and person.actor_id=recipient.actor_id join auth.users account on account.id=recipient.actor_id where recipient.school_id=source.school_id and recipient.actor_id=source.provider_user_id and recipient.role=source.role and recipient.revision=source.target_member_revision and recipient.status='active'and recipient.effective_from<=clock_timestamp()and(recipient.effective_to is null or recipient.effective_to>clock_timestamp())and person.synthetic and person.display_name=source.display_name and account.email=source.email and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())))
 then raise exception 'Current approved school account source required'using errcode='42501';end if;
 if require_open and(source.expires_at<=clock_timestamp()or source.current_status in('CLAIMED','REVOKED','REQUIRES_REVIEW'))then raise exception 'Open current school account request required'using errcode='42501';end if;
end$$;
create or replace function internal.require_school_account_request(source internal.school_account_requests,require_open boolean)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or source.school_id is distinct from"authorization".school_id()then raise exception 'Exact school account request required'using errcode='42501';end if;
 perform internal.require_school_account_source_authority(source,require_open);
end$$;
create or replace function internal.require_school_account_claim_source(source internal.school_account_requests)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or source.purpose is distinct from'invite'or source.provider_user_id is distinct from"authorization".actor_id()or source.expires_at<=clock_timestamp()then raise exception 'Exact approved invitation recipient source required'using errcode='42501';end if;
 perform internal.require_school_account_source_authority(source,false);
end$$;

create function internal.create_school_account_recovery(target_user uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare v_user uuid:=$1;v_payload jsonb:=$2;v_key text:=$3;v_fingerprint text:=$4;v_request text:=$5;school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();recipient app.memberships;person app.people;source internal.school_account_requests;email text;control integer;approver_revision integer;reservation jsonb;response jsonb;created_time timestamptz:=clock_timestamp();begin
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 perform internal.require_school_admin();perform 1 from internal.school_account_runtime_control where singleton for share;control:=internal.require_school_account_runtime(school);
 if v_user is null or v_payload is null or jsonb_typeof(v_payload)is distinct from'object'or not(v_payload?&array['expectedMembershipRevision','reason','confirmRecovery'])
 or exists(select 1 from jsonb_object_keys(v_payload)field where field not in('expectedMembershipRevision','reason','confirmRecovery'))
 or jsonb_typeof(v_payload->'expectedMembershipRevision')is distinct from'number'or v_payload->>'expectedMembershipRevision'!~'^[1-9][0-9]{0,8}$'
 or jsonb_typeof(v_payload->'reason')is distinct from'string'or length(btrim(v_payload->>'reason'))not between 1 and 1000 or v_payload->'confirmRecovery'is distinct from'true'::jsonb then raise exception 'Confirmed exact recovery source required'using errcode='22023';end if;
 select*into recipient from app.memberships where school_id=school and actor_id=v_user for share;
 select*into person from app.people where school_id=school and actor_id=v_user;
 select account.email into email from auth.users account where account.id=v_user and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())for share;
 if recipient.actor_id is null or recipient.status<>'active'or recipient.effective_from>clock_timestamp()or(recipient.effective_to is not null and recipient.effective_to<=clock_timestamp())or recipient.revision<>(v_payload->>'expectedMembershipRevision')::integer or person.actor_id is null or not person.synthetic or email is null or email<>lower(btrim(email))or email!~'^[^@]+@[^@]+\.[^@]+$'then raise exception 'Current exact confirmed recovery recipient required'using errcode='42501';end if;
 reservation:=internal.begin_command(v_key,'school.account.recovery.request',v_fingerprint);
 if reservation->>'state'='COMPLETED'then
  select*into source from internal.school_account_requests where id=(reservation->'response'->>'id')::uuid and school_id=school for update;
  perform internal.require_school_account_request(source,true);
  if source.purpose is distinct from'recovery'or source.provider_user_id is distinct from v_user or source.requested_by is distinct from actor then raise exception 'Original recovery source required'using errcode='42501';end if;return reservation->'response';
 elsif reservation->>'state'<>'NEW'then raise exception 'Recovery source command in progress'using errcode='22023';end if;
 if exists(select 1 from internal.school_account_requests prior where prior.school_id=school and prior.provider_user_id=v_user and prior.purpose='recovery'and prior.expires_at>clock_timestamp()and prior.current_status not in('REVOKED','REQUIRES_REVIEW'))then raise exception 'Existing current recovery requires review'using errcode='22023';end if;
 select revision into approver_revision from app.memberships where school_id=school and actor_id=actor for share;
 insert into internal.school_account_requests(school_id,requested_by,provider_user_id,display_name,email,role,approving_member_revision,control_revision,created_at,expires_at,purpose,target_member_revision)
 values(school,actor,v_user,person.display_name,email,recipient.role,approver_revision,control,created_time,created_time+interval'168 hours','recovery',recipient.revision)returning*into source;
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason,created_at)values(source.id,school,1,'REQUESTED',internal.school_account_intent(source),actor,btrim(v_payload->>'reason'),created_time);
 perform internal.append_audit('school.account.recovery_requested','school_account_request',source.id,v_request,'succeeded','{"requestRevision":1}'::jsonb);
 perform internal.enqueue_event('school.account.recovery_requested','school_account_request',source.id,1,'{"requestRevision":1}'::jsonb,'school-account:'||source.id::text||':1');
 response:=internal.school_account_request_receipt(source);perform internal.finish_command(v_key,'school.account.recovery.request',v_fingerprint,response);return response;
end$$;

create or replace function internal.read_school_account_invitations(page_limit integer,page_cursor uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();items jsonb;source internal.school_account_requests;begin
 perform internal.require_school_admin();perform internal.require_school_account_runtime(school);
 if page_limit is null or page_limit not between 1 and 25 then raise exception 'Bounded invitation page required'using errcode='22023';end if;
 if page_cursor is not null and not exists(select 1 from internal.school_account_requests request where request.school_id=school and request.id=page_cursor)then raise exception 'Current school invitation cursor required'using errcode='42501';end if;
 items:='[]'::jsonb;
 for source in select*from internal.school_account_requests where school_id=school and(page_cursor is null or id>page_cursor)order by id limit page_limit+1 loop
  -- Historical status remains truthful; expiry/control loss never rewrites immutable intent.
  items:=items||jsonb_build_array(internal.school_account_request_receipt(source)||jsonb_build_object('purpose',source.purpose,'displayName',source.display_name,'email',source.email,'role',source.role,'userId',case when source.current_status in('IDENTITY_CONFIRMED','LINK_PENDING','DELIVERY_ACCEPTED','CLAIMED')then source.provider_user_id else null end));
 end loop;
 return jsonb_build_object('items',case when jsonb_array_length(items)>page_limit then items-page_limit else items end,'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;

create or replace function internal.revoke_school_account_invitation(target_request uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
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
 and event.type=case when source.purpose='recovery'then'school.account.recovery_requested'else'school.account.provisioning_requested'end and event.version=1 and event.metadata='{"requestRevision":1}'::jsonb
 and event.state='PENDING'and event.attempt_count=0 and event.lease_token is null and event.lease_until is null;
 response:=internal.school_account_request_receipt(source);
 perform internal.finish_command(command_key,'school.account.revoke',fingerprint,response);
 return response;
end$$;

-- Generalized existing effect bodies are appended below, followed by recipient authorization.
-- sha256(bytea) is PostgreSQL's built-in hash; no optional extension/provider operation.

create or replace function internal.require_school_account_effect_event(source internal.school_account_requests,event internal.outbox_events)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or event.id is null or event.school_id is distinct from source.school_id or event.actor_id is distinct from source.requested_by
 or event.type is distinct from(case when source.purpose='recovery'then'school.account.recovery_requested'else'school.account.provisioning_requested'end)or internal.outbox_event_owner(event.type)is distinct from'SCHOOL_ACCOUNT_AUTH'
 or event.entity_type is distinct from'school_account_request'or event.entity_id is distinct from source.id or event.version is distinct from 1
 or event.metadata is distinct from'{"requestRevision":1}'::jsonb or event.deduplication_key is distinct from'school-account:'||source.id::text||':1'
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=source.school_id and revision.revision=1 and revision.status='REQUESTED'and revision.created_by=source.requested_by and revision.intent_snapshot=internal.school_account_intent(source))
 or not exists(select 1 from internal.audit_events audit where audit.school_id=source.school_id and audit.actor_id=source.requested_by and audit.action=case when source.purpose='recovery'then'school.account.recovery_requested'else'school.account.invited'end and audit.entity_type='school_account_request'and audit.entity_id=source.id and audit.outcome='succeeded'and audit.metadata='{"requestRevision":1}'::jsonb)
 then raise exception 'Exact approved account effect event required'using errcode='42501';end if;
end$$;

create or replace function internal.claim_school_account_effect(target_request uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;lease uuid;leased_time timestamptz;created record;linked record;delivered record;begin
 source:=internal.lock_school_account_effect_source(target_request,false);
 select*into event from internal.outbox_events where school_id=source.school_id and deduplication_key='school-account:'||source.id::text||':1'for update;
 if not found then raise exception 'Approved account effect event missing'using errcode='42501';end if;
 perform internal.require_school_account_effect_event(source,event);
 if event.attempt_count<>(select count(*)from internal.school_account_effect_leases prior where prior.event_id=event.id)then raise exception 'Exact account effect attempt history required'using errcode='42501';end if;
 if(select count(*)from internal.outbox_events where school_id=source.school_id and entity_type='school_account_request'and entity_id=source.id and type=case when source.purpose='recovery'then'school.account.recovery_requested'else'school.account.provisioning_requested'end)<>1 then raise exception 'Ambiguous account effect event requires review'using errcode='42501';end if;
 if event.state='PROCESSING'and event.lease_until>clock_timestamp()then raise exception 'Account effect already admitted'using errcode='22023';end if;
 if event.state not in('PENDING','PROCESSING')or(event.state='PENDING'and event.available_at>clock_timestamp())then return null;end if;
 if event.state='PROCESSING'then
  if not exists(select 1 from internal.school_account_effect_leases prior where prior.event_id=event.id and prior.lease_token=event.lease_token and prior.request_id=source.id and prior.actor_id=source.requested_by and prior.request_revision=1 and prior.expires_at=event.lease_until)then raise exception 'Original effect lease provenance required'using errcode='42501';end if;
  -- This successful exact claim commits unknown observations; throwing here would roll them back.
  insert into internal.school_account_effect_receipts(attempt_id,state,code)
  select attempt.attempt_id,'OUTCOME_UNKNOWN','EFFECT_LEASE_EXPIRED'from internal.school_account_effect_attempts attempt
  where attempt.event_id=event.id and attempt.lease_token=event.lease_token and not exists(select 1 from internal.school_account_effect_receipts receipt where receipt.attempt_id=attempt.attempt_id);
 end if;
 if event.attempt_count>=10 then
  if event.lease_token is not null then insert into internal.school_account_effect_results(lease_token,event_id,request_id,school_id,request_revision,status,provider_state,delivery_state,code)
   values(event.lease_token,event.id,source.id,source.school_id,1,'OUTCOME_UNKNOWN','OUTCOME_UNKNOWN','OUTCOME_UNKNOWN','EFFECT_LEASE_EXHAUSTED')on conflict(lease_token)do nothing;end if;
  update internal.outbox_events set state='FAILED',lease_token=null,lease_until=null,last_error_code='EFFECT_LEASE_EXHAUSTED'where id=event.id;return null;
 end if;
 leased_time:=clock_timestamp();lease:=gen_random_uuid();
 insert into internal.school_account_effect_leases(lease_token,event_id,request_id,school_id,request_revision,actor_id,attempt_number,leased_at,expires_at)
 values(lease,event.id,source.id,source.school_id,1,source.requested_by,event.attempt_count+1,leased_time,least(leased_time+interval'60 seconds',source.expires_at));
 update internal.outbox_events set state='PROCESSING',max_attempts=10,attempt_count=event.attempt_count+1,lease_token=lease,lease_until=least(leased_time+interval'60 seconds',source.expires_at),last_error_code=null where id=event.id;
 select*into created from internal.latest_school_account_effect(event.id,'CREATE');
 select*into linked from internal.latest_school_account_effect(event.id,'LINK');
 select*into delivered from internal.latest_school_account_effect(event.id,'DELIVERY');
 return jsonb_build_object('eventId',event.id,'leaseToken',lease,'requestId',source.id,'schoolId',source.school_id,'userId',source.provider_user_id,'email',source.email,
 'requestRevision',1,'expiresAt',source.expires_at,'leaseExpiresAt',least(leased_time+interval'60 seconds',source.expires_at),'state','ADMITTED',
 'priorCreateState',case when created.attempt_id is null then'NOT_ATTEMPTED'when created.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end,
 'priorLinkState',case when linked.attempt_id is null then'NOT_ATTEMPTED'when linked.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end,
 'priorDeliveryState',case when delivered.attempt_id is null then'NOT_ATTEMPTED'when delivered.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end)||case when source.purpose='recovery'then jsonb_build_object('purpose','recovery')else'{}'::jsonb end;
end$$;

create or replace function internal.begin_school_account_effect_step(target_event uuid,current_lease uuid,target_step text,target_attempt uuid,token_digest text)returns boolean
language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;lease internal.school_account_effect_leases;created record;linked record;latest record;next_number integer;begin
 if target_event is null or current_lease is null or target_attempt is null or target_step is null or target_step not in('CREATE','LINK','DELIVERY')
 or(target_step='LINK'and(token_digest is null or token_digest!~'^[a-f0-9]{64}$'))or(target_step<>'LINK'and token_digest is not null)then raise exception 'Bounded exact account step required'using errcode='22023';end if;
 select entity_id into source.id from internal.outbox_events where id=target_event;
 source:=internal.lock_school_account_effect_source(source.id,false);
 select*into event from internal.outbox_events where id=target_event for update;perform internal.require_school_account_effect_event(source,event);
 select*into lease from internal.school_account_effect_leases where lease_token=current_lease for share;
 if not found or lease.event_id is distinct from event.id or lease.request_id is distinct from source.id or lease.actor_id is distinct from source.requested_by
 or event.state is distinct from'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until is distinct from lease.expires_at or lease.expires_at<=clock_timestamp()then raise exception 'Current account effect lease required'using errcode='22023';end if;
 if exists(select 1 from internal.school_account_effect_attempts where attempt_id=target_attempt)then return false;end if;
 if exists(select 1 from internal.school_account_effect_attempts attempt where attempt.event_id=event.id and not exists(select 1 from internal.school_account_effect_receipts receipt where receipt.attempt_id=attempt.attempt_id))then raise exception 'Original external step must settle'using errcode='22023';end if;
 select*into created from internal.latest_school_account_effect(event.id,'CREATE');select*into linked from internal.latest_school_account_effect(event.id,'LINK');
 select*into latest from internal.latest_school_account_effect(event.id,target_step);
 if target_step='CREATE'and linked.attempt_id is not null then raise exception 'Account creation cannot repeat after link work'using errcode='22023';end if;
 -- Recovery CREATE is a reserved read-only exact UUID observation, never account creation.
 if source.purpose='recovery'and not exists(select 1 from auth.users account where account.id=source.provider_user_id and account.email=source.email and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))then raise exception 'Current confirmed recovery identity required'using errcode='42501';end if;
 if target_step='LINK'and(created.state is distinct from'CONFIRMED'or linked.attempt_id is not null)then raise exception 'Confirmed identity and untouched link required'using errcode='22023';end if;
 if target_step='DELIVERY'and(linked.state is distinct from'CONFIRMED'or latest.attempt_id is not null)then raise exception 'Confirmed link and untouched delivery required'using errcode='22023';end if;
 next_number:=coalesce(latest.step_number,0)+1;
 insert into internal.school_account_effect_attempts(attempt_id,event_id,request_id,school_id,request_revision,lease_token,step,step_number,prior_state,token_digest)
 values(target_attempt,event.id,source.id,source.school_id,1,current_lease,target_step,next_number,case when latest.attempt_id is null then'NOT_ATTEMPTED'when latest.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end,token_digest);
 if target_step='LINK'then insert into internal.school_account_token_digests(school_id,request_id,request_revision,event_id,link_attempt_id,provider_user_id,purpose,token_digest,expires_at)
  values(source.school_id,source.id,1,event.id,target_attempt,source.provider_user_id,source.purpose,token_digest,source.expires_at);end if;
 return true;
end$$;

create or replace function internal.finish_school_account_effect_step(target_event uuid,current_lease uuid,target_step text,target_attempt uuid,receipt jsonb)returns boolean
language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;lease internal.school_account_effect_leases;attempt internal.school_account_effect_attempts;prior internal.school_account_effect_receipts;receipt_state text;receipt_code text;confirmed boolean;begin
 if target_event is null or current_lease is null or target_attempt is null or target_step is null or target_step not in('CREATE','LINK','DELIVERY')
 or receipt is null or jsonb_typeof(receipt)is distinct from'object'or octet_length(receipt::text)>1024
 or not(receipt?&array['state','code'])or jsonb_typeof(receipt->'state')is distinct from'string'or jsonb_typeof(receipt->'code')is distinct from'string'
 or exists(select 1 from jsonb_object_keys(receipt)field where field not in('state','code','emailConfirmed'))then raise exception 'Minimized exact account effect receipt required'using errcode='22023';end if;
 receipt_state:=receipt->>'state';receipt_code:=receipt->>'code';
 if receipt_state not in('CONFIRMED','OUTCOME_UNKNOWN','REQUIRES_REVIEW')then raise exception 'Fixed account effect outcome required'using errcode='22023';end if;
 if target_step='CREATE'and receipt_state='CONFIRMED'then
  if receipt_code<>'IDENTITY_CONFIRMED'or not(receipt?'emailConfirmed')or jsonb_typeof(receipt->'emailConfirmed')not in('boolean','null')then raise exception 'Confirmed exact account identity receipt required'using errcode='22023';end if;
  confirmed:=case when receipt->'emailConfirmed'='null'::jsonb then null else(receipt->>'emailConfirmed')::boolean end;
 elsif receipt?'emailConfirmed'then raise exception 'Confirmation belongs only to exact created identity'using errcode='22023';end if;
 if not((target_step='CREATE'and((receipt_state='CONFIRMED'and receipt_code='IDENTITY_CONFIRMED')or(receipt_state='OUTCOME_UNKNOWN'and receipt_code in('PROVIDER_OUTCOME_UNKNOWN','PROVIDER_RESPONSE_UNCONFIRMED','IDENTITY_NOT_CONFIRMED'))or(receipt_state='REQUIRES_REVIEW'and receipt_code in('IDENTITY_MISMATCH','PROVIDER_REJECTED'))))
 or(target_step='LINK'and((receipt_state='CONFIRMED'and receipt_code='LINK_GENERATED')or(receipt_state='OUTCOME_UNKNOWN'and receipt_code in('PROVIDER_OUTCOME_UNKNOWN','PROVIDER_RESPONSE_UNCONFIRMED','IDENTITY_NOT_CONFIRMED','LINK_NOT_CONFIRMED','LINK_RESPONSE_UNCONFIRMED','LINK_CONSUMPTION_UNKNOWN'))or(receipt_state='REQUIRES_REVIEW'and receipt_code in('IDENTITY_MISMATCH','PROVIDER_REJECTED','EMAIL_NOT_CONFIRMED'))))
 or(target_step='DELIVERY'and((receipt_state='CONFIRMED'and receipt_code='DELIVERY_ACCEPTED')or(receipt_state='OUTCOME_UNKNOWN'and receipt_code in('DELIVERY_OUTCOME_UNKNOWN','LINK_SECRET_UNAVAILABLE')))))then raise exception 'Step-specific fixed account effect code required'using errcode='22023';end if;
 select entity_id into source.id from internal.outbox_events where id=target_event;
 source:=internal.lock_school_account_effect_source(source.id,true);
 select*into event from internal.outbox_events where id=target_event for update;perform internal.require_school_account_effect_event(source,event);
 select*into lease from internal.school_account_effect_leases where lease_token=current_lease for share;
 if not found or lease.event_id is distinct from event.id or lease.request_id is distinct from source.id or lease.actor_id is distinct from source.requested_by
 or event.state is distinct from'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until is distinct from lease.expires_at or lease.expires_at<=clock_timestamp()then raise exception 'Original current account effect lease required'using errcode='22023';end if;
 select*into attempt from internal.school_account_effect_attempts where attempt_id=target_attempt for share;
 if not found or attempt.event_id is distinct from event.id or attempt.request_id is distinct from source.id or attempt.lease_token is distinct from current_lease or attempt.step is distinct from target_step then raise exception 'Exact reserved account effect attempt required'using errcode='22023';end if;
 if target_step='CREATE'and receipt_state='CONFIRMED'and not exists(select 1 from auth.users account where account.id=source.provider_user_id and account.email=source.email and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())and((account.email_confirmed_at is not null and confirmed is true)or(account.email_confirmed_at is null and confirmed is distinct from true)))then raise exception 'Current exact provider identity does not confirm this receipt'using errcode='42501';end if;
 if source.purpose='recovery'and target_step='CREATE'and receipt_state='CONFIRMED'and confirmed is distinct from true then raise exception 'Recovery identity requires confirmed provider email'using errcode='42501';end if;
 select*into prior from internal.school_account_effect_receipts where attempt_id=target_attempt for share;
 if found then if prior.state is distinct from receipt_state or prior.code is distinct from receipt_code or prior.email_confirmed is distinct from confirmed then raise exception 'Original effect receipt is immutable'using errcode='22023';end if;return true;end if;
 insert into internal.school_account_effect_receipts(attempt_id,state,code,email_confirmed)values(target_attempt,receipt_state,receipt_code,confirmed);
 return true;
end$$;

create function internal.school_account_effect_ready(source internal.school_account_requests,token internal.school_account_token_digests)returns boolean
language sql stable security definer set search_path=''as $$
 select coalesce(source.id is not null and token.id is not null and source.current_status in('REQUESTED','CLAIMED')and source.current_revision=case when source.current_status='CLAIMED'then 2 else 1 end
 and token.school_id=source.school_id and token.request_id=source.id and token.request_revision=1 and token.provider_user_id=source.provider_user_id and token.purpose=source.purpose and token.expires_at=source.expires_at and token.expires_at>clock_timestamp()
 and exists(select 1 from internal.school_account_request_revisions original where original.request_id=source.id and original.revision=1 and original.status='REQUESTED'and original.created_by=source.requested_by and original.intent_snapshot=internal.school_account_intent(source))
 and exists(select 1 from internal.outbox_events event
 cross join lateral internal.latest_school_account_effect(event.id,'CREATE')created
 cross join lateral internal.latest_school_account_effect(event.id,'LINK')linked
 cross join lateral internal.latest_school_account_effect(event.id,'DELIVERY')delivered
 cross join lateral(select result.*from internal.school_account_effect_results result join internal.school_account_effect_leases lease on lease.lease_token=result.lease_token where result.event_id=event.id order by lease.attempt_number desc limit 1)result
 join internal.school_account_effect_attempts create_attempt on create_attempt.attempt_id=created.attempt_id
 join internal.school_account_effect_attempts link_attempt on link_attempt.attempt_id=linked.attempt_id
 join internal.school_account_effect_attempts delivery_attempt on delivery_attempt.attempt_id=delivered.attempt_id
 join internal.school_account_effect_leases create_lease on create_lease.lease_token=create_attempt.lease_token
 join internal.school_account_effect_leases link_lease on link_lease.lease_token=link_attempt.lease_token
 join internal.school_account_effect_leases delivery_lease on delivery_lease.lease_token=delivery_attempt.lease_token
 join internal.school_account_effect_leases result_lease on result_lease.lease_token=result.lease_token
 where event.id=token.event_id and event.school_id=source.school_id and event.actor_id=source.requested_by and event.type=case when source.purpose='recovery'then'school.account.recovery_requested'else'school.account.provisioning_requested'end and event.entity_type='school_account_request'and event.entity_id=source.id and event.version=1 and event.metadata='{"requestRevision":1}'::jsonb and event.deduplication_key='school-account:'||source.id::text||':1'and event.state='COMPLETED'
 and result.request_id=source.id and result.school_id=source.school_id and result.request_revision=1 and result.status='AWAITING_CLAIM'and result.provider_state='CONFIRMED'and result.delivery_state='ACCEPTED'and result.code='DELIVERY_ACCEPTED'
 and created.state='CONFIRMED'and created.code='IDENTITY_CONFIRMED'and linked.state='CONFIRMED'and linked.code='LINK_GENERATED'and delivered.state='CONFIRMED'and delivered.code='DELIVERY_ACCEPTED'
 and create_attempt.event_id=event.id and create_attempt.request_id=source.id and create_attempt.school_id=source.school_id and create_attempt.request_revision=1 and create_attempt.step='CREATE'
 and link_attempt.event_id=event.id and link_attempt.request_id=source.id and link_attempt.school_id=source.school_id and link_attempt.request_revision=1 and link_attempt.step='LINK'
 and delivery_attempt.event_id=event.id and delivery_attempt.request_id=source.id and delivery_attempt.school_id=source.school_id and delivery_attempt.request_revision=1 and delivery_attempt.step='DELIVERY'
 and create_lease.event_id=event.id and create_lease.request_id=source.id and create_lease.school_id=source.school_id and create_lease.request_revision=1 and create_lease.actor_id=source.requested_by
 and link_lease.event_id=event.id and link_lease.request_id=source.id and link_lease.school_id=source.school_id and link_lease.request_revision=1 and link_lease.actor_id=source.requested_by
 and delivery_lease.event_id=event.id and delivery_lease.request_id=source.id and delivery_lease.school_id=source.school_id and delivery_lease.request_revision=1 and delivery_lease.actor_id=source.requested_by
 and result_lease.event_id=event.id and result_lease.request_id=source.id and result_lease.school_id=source.school_id and result_lease.request_revision=1 and result_lease.actor_id=source.requested_by
 and create_lease.attempt_number<=link_lease.attempt_number and link_lease.attempt_number<=delivery_lease.attempt_number and delivery_lease.attempt_number<=result_lease.attempt_number
 and linked.attempt_id=token.link_attempt_id and link_attempt.token_digest=token.token_digest
 and not exists(select 1 from internal.school_account_effect_leases later where later.event_id=event.id and later.attempt_number>result_lease.attempt_number)),false)
$$;

create or replace function internal.school_account_admission_effect_ready(source internal.school_account_requests,token internal.school_account_token_digests)returns boolean
language sql stable security definer set search_path=''as $$select coalesce(source.purpose='invite'and token.purpose='invite'and internal.school_account_effect_ready(source,token),false)$$;

create table internal.school_account_recovery_authorizations (
 request_id uuid primary key references internal.school_account_requests(id),
 school_id uuid not null,
 token_id uuid not null unique references internal.school_account_token_digests(id),
 actor_id uuid not null,
 session_id uuid not null,
 request_revision integer not null check(request_revision=1),
 password_digest text not null check(password_digest~'^[a-f0-9]{64}$'),
 command_key text not null check(length(command_key)between 1 and 200),
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 receipt jsonb not null check(jsonb_typeof(receipt)='object'and octet_length(receipt::text)<=1024),
 authorized_at timestamptz not null default clock_timestamp(),
 unique(actor_id,command_key),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
create table internal.school_account_recovery_completions (
 request_id uuid primary key references internal.school_account_recovery_authorizations(request_id),
 school_id uuid not null,
 actor_id uuid not null,
 session_id uuid not null,
 password_digest text not null check(password_digest~'^[a-f0-9]{64}$'),
 command_key text not null check(length(command_key)between 1 and 200),
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 receipt jsonb not null check(jsonb_typeof(receipt)='object'and octet_length(receipt::text)<=1024),
 completed_at timestamptz not null default clock_timestamp(),
 unique(actor_id,command_key),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
do $$declare table_name text;begin
 foreach table_name in array array['school_account_recovery_authorizations','school_account_recovery_completions']loop
  execute format('alter table internal.%I enable row level security',table_name);execute format('alter table internal.%I force row level security',table_name);
  execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',table_name);
  execute format('create trigger %I before update or delete on internal.%I for each row execute function internal.academic_history_immutable()',table_name||'_immutable',table_name);
  execute format('create trigger %I before truncate on internal.%I for each statement execute function internal.academic_history_immutable()',table_name||'_no_truncate',table_name);
 end loop;
end$$;

create function internal.lock_school_account_recovery_recipient(target_request uuid)returns internal.school_account_requests
language plpgsql security definer set search_path=''as $$
declare actor uuid:="authorization".actor_id();session_id uuid;school uuid;source internal.school_account_requests;event internal.outbox_events;begin
 if actor is null or target_request is null or nullif(current_setting('app.school_id',true),'')is not null then raise exception 'Own purpose-only recovery context required'using errcode='42501';end if;
 begin session_id:=nullif(current_setting('app.session_id',true),'')::uuid;exception when invalid_text_representation then raise exception 'Own current recovery session required'using errcode='42501';end;
 if session_id is null or"authorization".is_current_session(session_id)is distinct from true then raise exception 'Current recovery session required'using errcode='42501';end if;
 select request.school_id into school from internal.school_account_requests request where request.id=target_request;
 if not found then raise exception 'Exact approved recovery required'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 perform 1 from internal.school_account_runtime_control where singleton for share;
 select request.*into source from internal.school_account_requests request where request.id=target_request and request.school_id=school for update;
 if not found or source.purpose is distinct from'recovery'or source.provider_user_id is distinct from actor or source.current_status is distinct from'REQUESTED'or source.current_revision is distinct from 1 or source.expires_at<=clock_timestamp()then raise exception 'Current own recovery source required'using errcode='42501';end if;
 perform internal.require_school_account_source_authority(source,true);
 select*into event from internal.outbox_events where school_id=school and deduplication_key='school-account:'||source.id::text||':1'for share;
 perform internal.require_school_account_effect_event(source,event);
 if event.state is distinct from'COMPLETED'then raise exception 'Confirmed recovery delivery required'using errcode='42501';end if;
 perform 1 from auth.users account where account.id=actor for share;
 perform 1 from auth.sessions session where session.id=session_id and session.user_id=actor for share;
 if not exists(select 1 from auth.users account join auth.sessions session on session.user_id=account.id where account.id=actor and account.email=source.email and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())and session.id=session_id and(session.not_after is null or session.not_after>clock_timestamp())and length(coalesce(account.encrypted_password,''))>0)then raise exception 'Current verified password recovery account required'using errcode='42501';end if;
 return source;
end$$;

create function internal.authorize_school_account_recovery(target_request uuid,secret_digest text,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare v_request uuid:=$1;v_digest text:=$2;v_key text:=$3;v_fingerprint text:=$4;v_trace text:=$5;source internal.school_account_requests;token internal.school_account_token_digests;prior internal.school_account_recovery_authorizations;session_id uuid;password_digest text;response jsonb;reservation jsonb;begin
 if v_request is null or v_digest is null or v_digest!~'^[a-f0-9]{64}$'or v_key is null or length(v_key)not between 1 and 200 or v_fingerprint is null or v_fingerprint!~'^[a-f0-9]{64}$'or v_trace is null or length(v_trace)not between 1 and 200 then raise exception 'Exact bounded recovery authorization required'using errcode='22023';end if;
 source:=internal.lock_school_account_recovery_recipient(v_request);session_id:=nullif(current_setting('app.session_id',true),'')::uuid;
 select*into token from internal.school_account_token_digests stored where stored.request_id=source.id and stored.school_id=source.school_id and stored.request_revision=1 and stored.purpose='recovery'and stored.token_digest=v_digest for share;
 if not found or not internal.school_account_effect_ready(source,token)then raise exception 'Exact confirmed recovery token required'using errcode='42501';end if;
 select encode(sha256(convert_to(account.encrypted_password,'UTF8')),'hex')into password_digest from auth.users account where account.id=source.provider_user_id;
 select*into prior from internal.school_account_recovery_authorizations stored where stored.request_id=source.id for share;
 if found then
  if prior.command_key is distinct from v_key or prior.fingerprint is distinct from v_fingerprint or prior.token_id is distinct from token.id or prior.actor_id is distinct from source.provider_user_id or prior.session_id is distinct from session_id or prior.password_digest is distinct from password_digest then raise exception 'Original recovery authorization requires current review'using errcode='22023';end if;
  if not exists(select 1 from internal.idempotency_keys canonical where canonical.school_id=source.school_id and canonical.actor_id=source.provider_user_id and canonical.key=v_key and canonical.command='school.account.recovery.authorize'and canonical.fingerprint=v_fingerprint and canonical.state='COMPLETED'and canonical.response=prior.receipt)then raise exception 'Original canonical recovery authorization unavailable'using errcode='22023';end if;
  return prior.receipt;
 end if;
 if exists(select 1 from internal.school_account_token_consumptions used where used.token_id=token.id)then raise exception 'Consumed invitation cannot authorize recovery'using errcode='42501';end if;
 response:=jsonb_build_object('id',source.id,'schoolId',source.school_id,'userId',source.provider_user_id,'status','AUTHORIZED','revision',1);
 insert into internal.school_account_recovery_authorizations(request_id,school_id,token_id,actor_id,session_id,request_revision,password_digest,command_key,fingerprint,receipt)
 values(source.id,source.school_id,token.id,source.provider_user_id,session_id,1,password_digest,v_key,v_fingerprint,response);
 perform set_config('app.school_id',source.school_id::text,true);
 reservation:=internal.begin_command(v_key,'school.account.recovery.authorize',v_fingerprint);if reservation->>'state'is distinct from'NEW'then raise exception 'Original recovery authorization key changed'using errcode='22023';end if;
 perform internal.append_audit('school.account.recovery_authorized','school_account_request',source.id,v_trace,'succeeded','{"requestRevision":1}'::jsonb);
 perform internal.finish_command(v_key,'school.account.recovery.authorize',v_fingerprint,response);return response;
end$$;

create function internal.complete_school_account_recovery(target_request uuid,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare v_request uuid:=$1;v_key text:=$2;v_fingerprint text:=$3;v_trace text:=$4;source internal.school_account_requests;original_authorization internal.school_account_recovery_authorizations;completion internal.school_account_recovery_completions;token internal.school_account_token_digests;session_id uuid;password_digest text;response jsonb;reservation jsonb;begin
 if v_request is null or v_key is null or length(v_key)not between 1 and 200 or v_fingerprint is null or v_fingerprint!~'^[a-f0-9]{64}$'or v_trace is null or length(v_trace)not between 1 and 200 then raise exception 'Exact bounded recovery completion required'using errcode='22023';end if;
 source:=internal.lock_school_account_recovery_recipient(v_request);session_id:=nullif(current_setting('app.session_id',true),'')::uuid;
 select*into original_authorization from internal.school_account_recovery_authorizations stored where stored.request_id=source.id for share;
 if not found or original_authorization.actor_id is distinct from source.provider_user_id or original_authorization.session_id is distinct from session_id then raise exception 'Own original recovery authorization required'using errcode='42501';end if;
 select*into token from internal.school_account_token_digests stored where stored.id=original_authorization.token_id and stored.request_id=source.id and stored.school_id=source.school_id and stored.purpose='recovery'for share;
 if not found or not internal.school_account_effect_ready(source,token)then raise exception 'Original confirmed recovery token required'using errcode='42501';end if;
 select encode(sha256(convert_to(account.encrypted_password,'UTF8')),'hex')into password_digest from auth.users account where account.id=source.provider_user_id;
 if password_digest is null then raise exception 'Current provider password comparison unavailable'using errcode='42501';end if;
 if password_digest is not distinct from original_authorization.password_digest then raise exception 'Provider password remains unchanged'using errcode='P0002';end if;
 select*into completion from internal.school_account_recovery_completions stored where stored.request_id=source.id for share;
 if found then
  if completion.command_key is distinct from v_key or completion.fingerprint is distinct from v_fingerprint or completion.actor_id is distinct from source.provider_user_id or completion.session_id is distinct from session_id or completion.password_digest is distinct from password_digest then raise exception 'Original recovery completion changed'using errcode='22023';end if;
  if not exists(select 1 from internal.idempotency_keys canonical where canonical.school_id=source.school_id and canonical.actor_id=source.provider_user_id and canonical.key=v_key and canonical.command='school.account.recovery.complete'and canonical.fingerprint=v_fingerprint and canonical.state='COMPLETED'and canonical.response=completion.receipt)then raise exception 'Original canonical recovery completion unavailable'using errcode='22023';end if;return completion.receipt;
 end if;
 response:=jsonb_build_object('id',source.id,'schoolId',source.school_id,'userId',source.provider_user_id,'status','COMPLETED','revision',1);
 insert into internal.school_account_recovery_completions(request_id,school_id,actor_id,session_id,password_digest,command_key,fingerprint,receipt)values(source.id,source.school_id,source.provider_user_id,session_id,password_digest,v_key,v_fingerprint,response);
 perform set_config('app.school_id',source.school_id::text,true);
 reservation:=internal.begin_command(v_key,'school.account.recovery.complete',v_fingerprint);if reservation->>'state'is distinct from'NEW'then raise exception 'Original recovery completion key changed'using errcode='22023';end if;
 perform internal.append_audit('school.account.recovery_completed','school_account_request',source.id,v_trace,'succeeded','{"requestRevision":1}'::jsonb);
 perform internal.finish_command(v_key,'school.account.recovery.complete',v_fingerprint,response);return response;
end$$;

revoke execute on function internal.guard_school_account_request_intent(),internal.school_account_intent(internal.school_account_requests),internal.require_school_account_source_authority(internal.school_account_requests,boolean),internal.require_school_account_request(internal.school_account_requests,boolean),internal.require_school_account_claim_source(internal.school_account_requests),
 internal.create_school_account_recovery(uuid,jsonb,text,text,text),internal.require_school_account_effect_event(internal.school_account_requests,internal.outbox_events),internal.claim_school_account_effect(uuid),internal.begin_school_account_effect_step(uuid,uuid,text,uuid,text),internal.finish_school_account_effect_step(uuid,uuid,text,uuid,jsonb),
 internal.school_account_effect_ready(internal.school_account_requests,internal.school_account_token_digests),internal.school_account_admission_effect_ready(internal.school_account_requests,internal.school_account_token_digests),internal.lock_school_account_recovery_recipient(uuid),internal.authorize_school_account_recovery(uuid,text,text,text,text),internal.complete_school_account_recovery(uuid,text,text,text)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.create_school_account_recovery(uuid,jsonb,text,text,text),internal.claim_school_account_effect(uuid),internal.begin_school_account_effect_step(uuid,uuid,text,uuid,text),internal.finish_school_account_effect_step(uuid,uuid,text,uuid,jsonb),internal.authorize_school_account_recovery(uuid,text,text,text,text),internal.complete_school_account_recovery(uuid,text,text,text)to cuevo_api;
commit;
