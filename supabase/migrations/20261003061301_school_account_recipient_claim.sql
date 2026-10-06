-- Exact recipient membership claim after approved Auth and delivery effect receipts.
begin;

create table internal.school_account_claims (
 request_id uuid primary key,
 school_id uuid not null,
 actor_id uuid not null,
 approved_revision integer not null check(approved_revision=1),
 claimed_revision integer not null check(claimed_revision=2),
 member_revision integer not null check(member_revision>0),
 command_key text not null check(length(command_key)between 1 and 200),
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 receipt jsonb not null check(jsonb_typeof(receipt)='object'and octet_length(receipt::text)<=16384),
 claimed_at timestamptz not null default clock_timestamp(),
 unique(actor_id,command_key),
 unique(request_id,school_id,actor_id),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
alter table internal.school_account_claims enable row level security;
alter table internal.school_account_claims force row level security;
revoke all on internal.school_account_claims from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger school_account_claim_immutable before update or delete on internal.school_account_claims for each row execute function internal.academic_history_immutable();
create trigger school_account_claim_no_truncate before truncate on internal.school_account_claims for each statement execute function internal.academic_history_immutable();

create table internal.school_account_token_consumptions (
 token_id uuid primary key references internal.school_account_token_digests(id),
 request_id uuid not null,
 school_id uuid not null,
 actor_id uuid not null,
 request_revision integer not null check(request_revision=1),
 claimed_revision integer not null check(claimed_revision=2),
 consumed_at timestamptz not null default clock_timestamp(),
 unique(request_id),
 foreign key(request_id,school_id,actor_id)references internal.school_account_claims(request_id,school_id,actor_id),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id)
);
alter table internal.school_account_token_consumptions enable row level security;
alter table internal.school_account_token_consumptions force row level security;
revoke all on internal.school_account_token_consumptions from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger school_account_token_consumption_immutable before update or delete on internal.school_account_token_consumptions for each row execute function internal.academic_history_immutable();
create trigger school_account_token_consumption_no_truncate before truncate on internal.school_account_token_consumptions for each statement execute function internal.academic_history_immutable();

create function internal.require_school_account_claim_source(source internal.school_account_requests)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or source.provider_user_id is distinct from"authorization".actor_id()then raise exception 'Exact approved recipient source required'using errcode='42501';end if;
 perform internal.require_school_account_runtime(source.school_id,source.control_revision);
 if source.expires_at<=clock_timestamp()
 or not exists(select 1 from app.memberships approver join auth.users account on account.id=approver.actor_id
  where approver.school_id=source.school_id and approver.actor_id=source.requested_by and approver.revision=source.approving_member_revision
  and approver.role='admin'and approver.status='active'and approver.effective_from<=clock_timestamp()and(approver.effective_to is null or approver.effective_to>clock_timestamp())
  and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.context'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from app.entitlements entitlement where entitlement.school_id=source.school_id and entitlement.code='school.operations'and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp()))
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=source.school_id and revision.revision=source.current_revision and revision.status=source.current_status and revision.intent_snapshot=internal.school_account_intent(source))
 then raise exception 'Current approved school account source required'using errcode='42501';end if;
end$$;

create function internal.claim_school_account_invitation(target_request uuid,secret_digest text,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare actor uuid:="authorization".actor_id();session_id uuid;school uuid;source internal.school_account_requests;token internal.school_account_token_digests;prior internal.school_account_claims;member app.memberships;response jsonb;reservation jsonb;begin
 if target_request is null or actor is null or secret_digest is null or secret_digest!~'^[a-f0-9]{64}$'
 or command_key is null or length(command_key)not between 1 and 200 or fingerprint is null or fingerprint!~'^[a-f0-9]{64}$'
 or request_id is null or length(request_id)not between 1 and 200 then raise exception 'Exact bounded account claim required'using errcode='22023';end if;
 begin session_id:=nullif(current_setting('app.session_id',true),'')::uuid;exception when invalid_text_representation then raise exception 'Current account session required'using errcode='42501';end;
 if session_id is null or"authorization".is_current_session(session_id)is distinct from true then raise exception 'Current account session required'using errcode='42501';end if;
 select school_id into school from internal.school_account_requests where id=target_request;
 if not found then raise exception 'Approved account request required'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 -- Match ordinary school membership protection before any request/member locks.
 perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 -- Serialize approval/control changes without manufacturing a selected school actor.
 perform 1 from internal.school_account_runtime_control where singleton for share;
 select*into source from internal.school_account_requests where id=target_request and school_id=school for update;
 perform internal.require_school_account_claim_source(source);
 if not exists(select 1 from auth.users account join auth.sessions session on session.user_id=account.id
  where account.id=actor and account.id=source.provider_user_id and account.email=source.email and account.email_confirmed_at is not null
  and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())
 and session.id=session_id and(session.not_after is null or session.not_after>clock_timestamp()))then raise exception 'Current verified recipient account required'using errcode='42501';end if;
 perform 1 from internal.outbox_events event where event.school_id=school and event.entity_id=source.id and event.type='school.account.provisioning_requested'and event.deduplication_key='school-account:'||source.id::text||':1'for share;
 if not found then raise exception 'Exact completed account effect source required'using errcode='42501';end if;
 select*into token from internal.school_account_token_digests where request_id=source.id and school_id=source.school_id and request_revision=1 and purpose='invite'and token_digest=secret_digest for update;
 if not found or token.provider_user_id is distinct from actor or token.expires_at<=clock_timestamp()
 or internal.school_account_admission_effect_ready(source,token)is distinct from true then raise exception 'Exact confirmed delivery and admission token required'using errcode='42501';end if;
 select*into member from app.memberships where school_id=school and actor_id=actor for update;
 select*into prior from internal.school_account_claims where request_id=source.id for update;
 if found then
  if prior.actor_id<>actor or prior.command_key<>command_key or prior.fingerprint<>fingerprint then raise exception 'Original claim identity changed'using errcode='22023';end if;
  if source.current_status<>'CLAIMED'or source.current_revision<>prior.claimed_revision or member.actor_id is null or member.role<>source.role or member.revision<>prior.member_revision or member.status<>'active'
  or member.effective_from>clock_timestamp()or(member.effective_to is not null and member.effective_to<=clock_timestamp())
  or not exists(select 1 from app.people person where person.school_id=school and person.actor_id=actor and person.synthetic is true and person.display_name=source.display_name)
  or not exists(select 1 from internal.school_account_token_consumptions consumed where consumed.token_id=token.id and consumed.request_id=source.id and consumed.actor_id=actor and consumed.request_revision=1 and consumed.claimed_revision=2)
  then raise exception 'Current claimed membership source required'using errcode='42501';end if;
  perform set_config('app.school_id',school::text,true);
  reservation:=internal.begin_command(command_key,'school.account.claim',fingerprint);
  if reservation->>'state' is distinct from'COMPLETED'or reservation->'response'is distinct from prior.receipt then raise exception 'Original canonical claim receipt unavailable'using errcode='22023';end if;
  return prior.receipt;
 end if;
 if source.current_status<>'REQUESTED'or source.current_revision<>1 then raise exception 'Current invitation is not open for claim'using errcode='42501';end if;
 if member.actor_id is not null or exists(select 1 from internal.school_account_token_consumptions consumed where consumed.token_id=token.id)
 or exists(select 1 from internal.school_account_claims existing where existing.actor_id=actor and existing.command_key=command_key)
 then raise exception 'Existing membership or consumed claim requires review'using errcode='22023';end if;
 -- Current-school authorization evaluates effective windows at transaction time.
 insert into app.memberships(school_id,actor_id,role,status,effective_from)values(school,actor,source.role,'active',now())returning*into member;
 insert into app.people(school_id,actor_id,display_name,synthetic)values(school,actor,source.display_name,true);
 response:=jsonb_build_object('id',source.id,'schoolId',school,'userId',actor,'role',source.role,'status','CLAIMED','revision',2);
 insert into internal.school_account_claims(request_id,school_id,actor_id,approved_revision,claimed_revision,member_revision,command_key,fingerprint,receipt)
 values(source.id,school,actor,1,2,member.revision,command_key,fingerprint,response);
 insert into internal.school_account_token_consumptions(token_id,request_id,school_id,actor_id,request_revision,claimed_revision)values(token.id,source.id,school,actor,1,2);
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason)
 values(source.id,school,2,'CLAIMED',internal.school_account_intent(source),actor,'Recipient explicitly accepted the exact approved school account invitation.');
 update internal.school_account_requests set current_revision=2,current_status='CLAIMED'where id=source.id returning*into source;
 perform set_config('app.school_id',school::text,true);
 reservation:=internal.begin_command(command_key,'school.account.claim',fingerprint);
 if reservation->>'state'is distinct from'NEW'then raise exception 'Canonical account claim identity already exists'using errcode='22023';end if;
 perform internal.append_audit('school.account.claimed','school_account_request',source.id,request_id,'succeeded',jsonb_build_object('requestRevision',2));
 perform internal.enqueue_event('school.account.claimed','school_account_request',source.id,2,jsonb_build_object('requestRevision',2),'school-account-claimed:'||source.id::text||':2');
 perform internal.finish_command(command_key,'school.account.claim',fingerprint,response);
 return response;
end$$;

alter function internal.process_learner_event(uuid,uuid)rename to process_before_school_account_claims;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;source internal.school_account_requests;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Invalid account claim event lease'using errcode='22023';end if;
 if internal.outbox_event_owner(event.type)is distinct from'WORKER'then raise exception 'Account event belongs to Auth executor'using errcode='42501';end if;
 if event.type<>'school.account.claimed'then return internal.process_before_school_account_claims(target_event,current_lease);end if;
 select*into source from internal.school_account_requests where id=event.entity_id and school_id=event.school_id;
 if not found or event.entity_type<>'school_account_request'or event.version<>2 or event.metadata is distinct from'{"requestRevision":2}'::jsonb
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=event.school_id and revision.revision=2 and revision.status='CLAIMED'and revision.created_by=event.actor_id and revision.intent_snapshot=internal.school_account_intent(source))
 or not exists(select 1 from internal.school_account_claims claim where claim.request_id=source.id and claim.school_id=event.school_id and claim.actor_id=event.actor_id and claim.claimed_revision=2)
 or not exists(select 1 from internal.audit_events audit where audit.school_id=event.school_id and audit.actor_id=event.actor_id and audit.entity_type='school_account_request'and audit.entity_id=event.entity_id and audit.action='school.account.claimed'and audit.outcome='succeeded'and audit.metadata=event.metadata)
 then raise exception 'Exact immutable account claim source required'using errcode='22023';end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Account claim acknowledgment lease changed'using errcode='22023';end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end$$;

revoke execute on function internal.require_school_account_claim_source(internal.school_account_requests)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
revoke execute on function internal.claim_school_account_invitation(uuid,text,text,text,text),internal.process_before_school_account_claims(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_school_account_invitation(uuid,text,text,text,text)to cuevo_api;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
