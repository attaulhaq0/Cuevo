-- Exact School-owned Auth effect bookkeeping. No provider/SMTP/claim/runtime activation.
begin;

create table internal.school_account_effect_leases (
 lease_token uuid primary key,
 event_id uuid not null references internal.outbox_events(id),
 request_id uuid not null,
 school_id uuid not null,
 request_revision integer not null check(request_revision=1),
 actor_id uuid not null,
 attempt_number integer not null check(attempt_number between 1 and 10),
 leased_at timestamptz not null,
 expires_at timestamptz not null,
 unique(event_id,attempt_number),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(request_id,request_revision)references internal.school_account_request_revisions(request_id,revision),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id),
 check(expires_at>leased_at and expires_at<=leased_at+interval'60 seconds')
);
create table internal.school_account_effect_attempts (
 attempt_id uuid primary key,
 event_id uuid not null references internal.outbox_events(id),
 request_id uuid not null,
 school_id uuid not null,
 request_revision integer not null check(request_revision=1),
 lease_token uuid not null references internal.school_account_effect_leases(lease_token),
 step text not null check(step in('CREATE','LINK','DELIVERY')),
 step_number integer not null check(step_number between 1 and 10),
 prior_state text not null check(prior_state in('NOT_ATTEMPTED','OUTCOME_UNKNOWN','CONFIRMED')),
 token_digest text,
 started_at timestamptz not null default clock_timestamp(),
 unique(event_id,step,step_number),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(request_id,request_revision)references internal.school_account_request_revisions(request_id,revision),
 check((step='LINK'and token_digest is not null and token_digest~'^[a-f0-9]{64}$')or(step<>'LINK'and token_digest is null)),
 check(step='CREATE'or step_number=1)
);
create table internal.school_account_effect_receipts (
 attempt_id uuid primary key references internal.school_account_effect_attempts(attempt_id),
 state text not null check(state in('CONFIRMED','OUTCOME_UNKNOWN','REQUIRES_REVIEW')),
 code text not null check(code in('IDENTITY_CONFIRMED','PROVIDER_OUTCOME_UNKNOWN','PROVIDER_RESPONSE_UNCONFIRMED','IDENTITY_NOT_CONFIRMED','IDENTITY_MISMATCH','PROVIDER_REJECTED','LINK_NOT_CONFIRMED','EMAIL_NOT_CONFIRMED','LINK_RESPONSE_UNCONFIRMED','LINK_CONSUMPTION_UNKNOWN','LINK_GENERATED','DELIVERY_ACCEPTED','DELIVERY_OUTCOME_UNKNOWN','LINK_SECRET_UNAVAILABLE','EFFECT_LEASE_EXPIRED')),
 email_confirmed boolean,
 recorded_at timestamptz not null default clock_timestamp()
);
create table internal.school_account_token_digests (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null,
 request_id uuid not null,
 request_revision integer not null check(request_revision=1),
 event_id uuid not null references internal.outbox_events(id),
 link_attempt_id uuid not null unique references internal.school_account_effect_attempts(attempt_id),
 provider_user_id uuid not null,
 purpose text not null check(purpose='invite'),
 token_digest text not null unique check(token_digest~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 unique(request_id,request_revision,purpose),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(request_id,request_revision)references internal.school_account_request_revisions(request_id,revision),
 check(expires_at>created_at)
);
create table internal.school_account_effect_results (
 lease_token uuid primary key references internal.school_account_effect_leases(lease_token),
 event_id uuid not null references internal.outbox_events(id),
 request_id uuid not null,
 school_id uuid not null,
 request_revision integer not null check(request_revision=1),
 status text not null check(status in('AWAITING_CLAIM','REQUIRES_REVIEW','OUTCOME_UNKNOWN')),
 provider_state text not null check(provider_state in('CONFIRMED','REQUIRES_REVIEW','OUTCOME_UNKNOWN')),
 delivery_state text not null check(delivery_state in('ACCEPTED','REQUIRES_REVIEW','OUTCOME_UNKNOWN')),
 code text not null check(code in('DELIVERY_ACCEPTED','EFFECT_REQUIRES_REVIEW','EFFECT_OUTCOME_UNKNOWN','REQUEST_REVOKED','EFFECT_LEASE_EXHAUSTED')),
 completed_at timestamptz not null default clock_timestamp(),
 foreign key(school_id,request_id)references internal.school_account_requests(school_id,id),
 foreign key(request_id,request_revision)references internal.school_account_request_revisions(request_id,revision),
 check(status<>'AWAITING_CLAIM'or(provider_state='CONFIRMED'and delivery_state='ACCEPTED'and code='DELIVERY_ACCEPTED'))
);

do $$declare table_name text;begin
 foreach table_name in array array['school_account_effect_leases','school_account_effect_attempts','school_account_effect_receipts','school_account_token_digests','school_account_effect_results']loop
  execute format('alter table internal.%I enable row level security',table_name);
  execute format('alter table internal.%I force row level security',table_name);
  execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',table_name);
  execute format('create trigger %I before update or delete on internal.%I for each row execute function internal.academic_history_immutable()',table_name||'_immutable',table_name);
  execute format('create trigger %I before truncate on internal.%I for each statement execute function internal.academic_history_immutable()',table_name||'_no_truncate',table_name);
 end loop;
end$$;

-- Ordinary API identity verifies its session before the actor transaction. SQL repeats current
-- confirmed actor/provider lifecycle, inviter revision, school, entitlement and local approval.
create function internal.lock_school_account_effect_source(target_request uuid,allow_revoked boolean)
returns internal.school_account_requests language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();begin
 if target_request is null or school is null or actor is null or allow_revoked is null then raise exception 'Exact account effect context required'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 perform internal.require_school_admin();
 if not exists(select 1 from auth.users account where account.id=actor and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))then raise exception 'Current verified effect administrator required'using errcode='42501';end if;
 -- Serialize operation admission with a current operator pause/revision update.
 perform 1 from internal.school_account_runtime_control where singleton for share;
 select*into source from internal.school_account_requests where id=target_request and school_id=school for update;
 if not found or source.requested_by is distinct from actor then raise exception 'Original approving account actor required'using errcode='42501';end if;
 perform internal.require_school_account_request(source,not allow_revoked);
 if not((source.current_status='REQUESTED'and source.current_revision=1 and source.expires_at>clock_timestamp())or(allow_revoked and source.current_status='REVOKED'and source.current_revision=2))then raise exception 'Current approved effect revision required'using errcode='42501';end if;
 return source;
end$$;

create function internal.require_school_account_effect_event(source internal.school_account_requests,event internal.outbox_events)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if source.id is null or event.id is null or event.school_id is distinct from source.school_id or event.actor_id is distinct from source.requested_by
 or event.type is distinct from'school.account.provisioning_requested'or internal.outbox_event_owner(event.type)is distinct from'SCHOOL_ACCOUNT_AUTH'
 or event.entity_type is distinct from'school_account_request'or event.entity_id is distinct from source.id or event.version is distinct from 1
 or event.metadata is distinct from'{"requestRevision":1}'::jsonb or event.deduplication_key is distinct from'school-account:'||source.id::text||':1'
 or not exists(select 1 from internal.school_account_request_revisions revision where revision.request_id=source.id and revision.school_id=source.school_id and revision.revision=1 and revision.status='REQUESTED'and revision.created_by=source.requested_by and revision.intent_snapshot=internal.school_account_intent(source))
 or not exists(select 1 from internal.audit_events audit where audit.school_id=source.school_id and audit.actor_id=source.requested_by and audit.action='school.account.invited'and audit.entity_type='school_account_request'and audit.entity_id=source.id and audit.outcome='succeeded'and audit.metadata='{"requestRevision":1}'::jsonb)
 then raise exception 'Exact approved account effect event required'using errcode='42501';end if;
end$$;

create function internal.latest_school_account_effect(target_event uuid,target_step text)
returns table(attempt_id uuid,lease_token uuid,step_number integer,state text,code text,email_confirmed boolean)
language sql stable security definer set search_path=''as $$
 select attempt.attempt_id,attempt.lease_token,attempt.step_number,receipt.state,receipt.code,receipt.email_confirmed
 from internal.school_account_effect_attempts attempt left join internal.school_account_effect_receipts receipt on receipt.attempt_id=attempt.attempt_id
 where attempt.event_id=target_event and attempt.step=target_step order by attempt.step_number desc limit 1
$$;

create function internal.school_account_effect_result_receipt(result internal.school_account_effect_results)returns jsonb
language sql stable set search_path=''as $$
 select jsonb_build_object('id',result.request_id,'schoolId',result.school_id,'eventId',result.event_id,'requestRevision',result.request_revision,'status',result.status,'providerState',result.provider_state,'deliveryState',result.delivery_state)
$$;

create function internal.read_school_account_effect(target_request uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;result internal.school_account_effect_results;begin
 if target_request is null then raise exception 'Exact account effect status required'using errcode='42501';end if;
 perform internal.require_school_admin();
 select*into source from internal.school_account_requests where id=target_request and school_id="authorization".school_id();
 if not found or source.requested_by is distinct from"authorization".actor_id()
 or not((source.current_status='REQUESTED'and source.current_revision=1)or(source.current_status in('CLAIMED','REVOKED')and source.current_revision=2))
 or not exists(select 1 from auth.users account where account.id=source.requested_by and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))then raise exception 'Current approving effect status actor required'using errcode='42501';end if;
 perform internal.require_school_account_request(source,false);
 select*into event from internal.outbox_events where school_id=source.school_id and deduplication_key='school-account:'||source.id::text||':1';
 perform internal.require_school_account_effect_event(source,event);
 select stored.*into result from internal.school_account_effect_results stored join internal.school_account_effect_leases lease on lease.lease_token=stored.lease_token
 where stored.event_id=event.id and stored.request_id=source.id and stored.school_id=source.school_id and stored.request_revision=1
 and lease.event_id=event.id and lease.request_id=source.id and lease.school_id=source.school_id and lease.request_revision=1 and lease.actor_id=source.requested_by order by lease.attempt_number desc limit 1;
 if source.current_status='REVOKED'and(result.lease_token is null or result.code<>'REQUEST_REVOKED')then
  return jsonb_build_object('state',event.state,'receipt',jsonb_build_object('id',source.id,'schoolId',source.school_id,'eventId',event.id,'requestRevision',1,'status','REQUIRES_REVIEW','providerState',coalesce(result.provider_state,'OUTCOME_UNKNOWN'),'deliveryState',coalesce(result.delivery_state,'OUTCOME_UNKNOWN')));
 end if;
 return jsonb_build_object('state',event.state,'receipt',case when result.lease_token is not null then internal.school_account_effect_result_receipt(result)else null end);
end$$;

create function internal.claim_school_account_effect(target_request uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;lease uuid;leased_time timestamptz;created record;linked record;delivered record;begin
 source:=internal.lock_school_account_effect_source(target_request,false);
 select*into event from internal.outbox_events where school_id=source.school_id and deduplication_key='school-account:'||source.id::text||':1'for update;
 if not found then raise exception 'Approved account effect event missing'using errcode='42501';end if;
 perform internal.require_school_account_effect_event(source,event);
 if event.attempt_count<>(select count(*)from internal.school_account_effect_leases prior where prior.event_id=event.id)then raise exception 'Exact account effect attempt history required'using errcode='42501';end if;
 if(select count(*)from internal.outbox_events where school_id=source.school_id and entity_type='school_account_request'and entity_id=source.id and type='school.account.provisioning_requested')<>1 then raise exception 'Ambiguous account effect event requires review'using errcode='42501';end if;
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
 'priorDeliveryState',case when delivered.attempt_id is null then'NOT_ATTEMPTED'when delivered.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end);
end$$;

create function internal.begin_school_account_effect_step(target_event uuid,current_lease uuid,target_step text,target_attempt uuid,token_digest text)returns boolean
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
 if target_step='LINK'and(created.state is distinct from'CONFIRMED'or linked.attempt_id is not null)then raise exception 'Confirmed identity and untouched link required'using errcode='22023';end if;
 if target_step='DELIVERY'and(linked.state is distinct from'CONFIRMED'or latest.attempt_id is not null)then raise exception 'Confirmed link and untouched delivery required'using errcode='22023';end if;
 next_number:=coalesce(latest.step_number,0)+1;
 insert into internal.school_account_effect_attempts(attempt_id,event_id,request_id,school_id,request_revision,lease_token,step,step_number,prior_state,token_digest)
 values(target_attempt,event.id,source.id,source.school_id,1,current_lease,target_step,next_number,case when latest.attempt_id is null then'NOT_ATTEMPTED'when latest.state='CONFIRMED'then'CONFIRMED'else'OUTCOME_UNKNOWN'end,token_digest);
 if target_step='LINK'then insert into internal.school_account_token_digests(school_id,request_id,request_revision,event_id,link_attempt_id,provider_user_id,purpose,token_digest,expires_at)
  values(source.school_id,source.id,1,event.id,target_attempt,source.provider_user_id,'invite',token_digest,source.expires_at);end if;
 return true;
end$$;

create function internal.finish_school_account_effect_step(target_event uuid,current_lease uuid,target_step text,target_attempt uuid,receipt jsonb)returns boolean
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
 select*into prior from internal.school_account_effect_receipts where attempt_id=target_attempt for share;
 if found then if prior.state is distinct from receipt_state or prior.code is distinct from receipt_code or prior.email_confirmed is distinct from confirmed then raise exception 'Original effect receipt is immutable'using errcode='22023';end if;return true;end if;
 insert into internal.school_account_effect_receipts(attempt_id,state,code,email_confirmed)values(target_attempt,receipt_state,receipt_code,confirmed);
 return true;
end$$;

create function internal.finish_school_account_effect(target_event uuid,current_lease uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare source internal.school_account_requests;event internal.outbox_events;lease internal.school_account_effect_leases;result internal.school_account_effect_results;created record;linked record;delivered record;provider_state text;delivery_state text;status text;code text;begin
 if target_event is null or current_lease is null then raise exception 'Exact account effect completion required'using errcode='22023';end if;
 select entity_id into source.id from internal.outbox_events where id=target_event;source:=internal.lock_school_account_effect_source(source.id,true);
 select*into event from internal.outbox_events where id=target_event for update;perform internal.require_school_account_effect_event(source,event);
 select*into lease from internal.school_account_effect_leases where lease_token=current_lease for share;
 if not found or lease.event_id is distinct from event.id or lease.request_id is distinct from source.id or lease.actor_id is distinct from source.requested_by then raise exception 'Exact account completion lease provenance required'using errcode='22023';end if;
 select*into result from internal.school_account_effect_results where lease_token=current_lease for share;
 if found then
  if lease.expires_at<=clock_timestamp()or exists(select 1 from internal.school_account_effect_leases later where later.event_id=event.id and later.attempt_number>lease.attempt_number)
  or result.event_id is distinct from event.id or result.request_id is distinct from source.id or result.school_id is distinct from source.school_id or result.request_revision is distinct from 1
  then raise exception 'Current original completion receipt required'using errcode='22023';end if;
  if source.current_status='REVOKED'and result.code<>'REQUEST_REVOKED'then raise exception 'Completed account admission was subsequently revoked'using errcode='42501';end if;
  return internal.school_account_effect_result_receipt(result);
 end if;
 if event.state is distinct from'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until is distinct from lease.expires_at or lease.expires_at<=clock_timestamp()then raise exception 'Current completion lease required'using errcode='22023';end if;
 if exists(select 1 from internal.school_account_effect_attempts attempt where attempt.event_id=event.id and not exists(select 1 from internal.school_account_effect_receipts receipt where receipt.attempt_id=attempt.attempt_id))then raise exception 'Original account effect must settle before completion'using errcode='22023';end if;
 select*into created from internal.latest_school_account_effect(event.id,'CREATE');select*into linked from internal.latest_school_account_effect(event.id,'LINK');select*into delivered from internal.latest_school_account_effect(event.id,'DELIVERY');
 provider_state:=case when created.state='CONFIRMED'and linked.state='CONFIRMED'then'CONFIRMED'when created.state='REQUIRES_REVIEW'or linked.state='REQUIRES_REVIEW'then'REQUIRES_REVIEW'else'OUTCOME_UNKNOWN'end;
 delivery_state:=case when delivered.state='CONFIRMED'then'ACCEPTED'when delivered.state='REQUIRES_REVIEW'then'REQUIRES_REVIEW'else'OUTCOME_UNKNOWN'end;
 status:=case when source.current_status='REVOKED'then'REQUIRES_REVIEW'when provider_state='CONFIRMED'and delivery_state='ACCEPTED'then'AWAITING_CLAIM'when provider_state='REQUIRES_REVIEW'or delivery_state='REQUIRES_REVIEW'then'REQUIRES_REVIEW'else'OUTCOME_UNKNOWN'end;
 code:=case when source.current_status='REVOKED'then'REQUEST_REVOKED'when status='AWAITING_CLAIM'then'DELIVERY_ACCEPTED'when status='REQUIRES_REVIEW'then'EFFECT_REQUIRES_REVIEW'else'EFFECT_OUTCOME_UNKNOWN'end;
 insert into internal.school_account_effect_results(lease_token,event_id,request_id,school_id,request_revision,status,provider_state,delivery_state,code)
 values(current_lease,event.id,source.id,source.school_id,1,status,provider_state,delivery_state,code)returning*into result;
 update internal.outbox_events set state=case when status in('AWAITING_CLAIM','REQUIRES_REVIEW')then'COMPLETED'when linked.attempt_id is null and event.attempt_count<10 then'PENDING'else'FAILED'end,
 completed_at=case when status in('AWAITING_CLAIM','REQUIRES_REVIEW')then clock_timestamp()end,lease_token=null,lease_until=null,last_error_code=case when status='AWAITING_CLAIM'then null else code end,available_at=clock_timestamp()where id=event.id;
 if status in('AWAITING_CLAIM','REQUIRES_REVIEW')then insert into internal.processed_events(event_id,school_id)values(event.id,source.school_id)on conflict(event_id)do nothing;end if;
 perform internal.append_audit('school.account.effect_completed','school_account_request',source.id,'school-account-effect:'||current_lease::text,'succeeded',jsonb_build_object('requestRevision',1,'status',status,'providerState',provider_state,'deliveryState',delivery_state,'code',code));
 return internal.school_account_effect_result_receipt(result);
end$$;

-- Effect evidence only: caller-owned claim/replay repeats current person/session/source authority.
-- Supports original REQUESTED revision1 and exact CLAIMED revision2 replay; no raw caller grant.
create function internal.school_account_admission_effect_ready(source internal.school_account_requests,token internal.school_account_token_digests)returns boolean
language sql stable security definer set search_path=''as $$
 select coalesce(source.id is not null and token.id is not null and source.current_status in('REQUESTED','CLAIMED')and source.current_revision=case when source.current_status='CLAIMED'then 2 else 1 end
 and token.school_id=source.school_id and token.request_id=source.id and token.request_revision=1 and token.provider_user_id=source.provider_user_id and token.purpose='invite'and token.expires_at=source.expires_at and token.expires_at>clock_timestamp()
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
 where event.id=token.event_id and event.school_id=source.school_id and event.actor_id=source.requested_by and event.type='school.account.provisioning_requested'and event.entity_type='school_account_request'and event.entity_id=source.id and event.version=1 and event.metadata='{"requestRevision":1}'::jsonb and event.deduplication_key='school-account:'||source.id::text||':1'and event.state='COMPLETED'
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

revoke execute on function internal.lock_school_account_effect_source(uuid,boolean),internal.require_school_account_effect_event(internal.school_account_requests,internal.outbox_events),
 internal.latest_school_account_effect(uuid,text),internal.school_account_effect_result_receipt(internal.school_account_effect_results),internal.school_account_admission_effect_ready(internal.school_account_requests,internal.school_account_token_digests),
 internal.read_school_account_effect(uuid),internal.claim_school_account_effect(uuid),internal.begin_school_account_effect_step(uuid,uuid,text,uuid,text),internal.finish_school_account_effect_step(uuid,uuid,text,uuid,jsonb),internal.finish_school_account_effect(uuid,uuid)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_school_account_effect(uuid),internal.claim_school_account_effect(uuid),internal.begin_school_account_effect_step(uuid,uuid,text,uuid,text),internal.finish_school_account_effect_step(uuid,uuid,text,uuid,jsonb),internal.finish_school_account_effect(uuid,uuid)to cuevo_api;
commit;
