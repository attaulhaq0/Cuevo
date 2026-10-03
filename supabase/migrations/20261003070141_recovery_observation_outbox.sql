-- Recovery observations commit canonical audit/outbox/receipt together.
begin;
create or replace function internal.create_school_account_recovery(target_user uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
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
 if exists(select 1 from internal.school_account_requests prior where prior.school_id=school and prior.provider_user_id=v_user and prior.purpose='recovery'and prior.expires_at>clock_timestamp()and prior.current_status not in('REVOKED','REQUIRES_REVIEW')and not exists(select 1 from internal.school_account_recovery_completions completed where completed.request_id=prior.id))then raise exception 'Existing current recovery requires review'using errcode='22023';end if;
 select revision into approver_revision from app.memberships where school_id=school and actor_id=actor for share;
 insert into internal.school_account_requests(school_id,requested_by,provider_user_id,display_name,email,role,approving_member_revision,control_revision,created_at,expires_at,purpose,target_member_revision)
 values(school,actor,v_user,person.display_name,email,recipient.role,approver_revision,control,created_time,created_time+interval'168 hours','recovery',recipient.revision)returning*into source;
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason,created_at)values(source.id,school,1,'REQUESTED',internal.school_account_intent(source),actor,btrim(v_payload->>'reason'),created_time);
 perform internal.append_audit('school.account.recovery_requested','school_account_request',source.id,v_request,'succeeded','{"requestRevision":1}'::jsonb);
 perform internal.enqueue_event('school.account.recovery_requested','school_account_request',source.id,1,'{"requestRevision":1}'::jsonb,'school-account:'||source.id::text||':1');
 response:=internal.school_account_request_receipt(source);perform internal.finish_command(v_key,'school.account.recovery.request',v_fingerprint,response);return response;
end$$;

alter function internal.process_learner_event(uuid,uuid)rename to process_before_school_account_recovery_events;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;source internal.school_account_requests;authorized internal.school_account_recovery_authorizations;completion internal.school_account_recovery_completions;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if not found or event.state is distinct from'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Current recovery observation event lease required'using errcode='22023';end if;
 if internal.outbox_event_owner(event.type)is distinct from'WORKER'then raise exception 'Recovery observations cannot execute Auth effects'using errcode='42501';end if;
 if event.type not in('school.account.recovery_authorized','school.account.recovery_completed')then return internal.process_before_school_account_recovery_events(target_event,current_lease);end if;
 select*into source from internal.school_account_requests where id=event.entity_id and school_id=event.school_id;
 select*into authorized from internal.school_account_recovery_authorizations where request_id=event.entity_id and school_id=event.school_id;
 if source.id is null or source.purpose is distinct from'recovery'or authorized.request_id is null or event.actor_id is distinct from source.provider_user_id or authorized.actor_id is distinct from event.actor_id
 or event.entity_type is distinct from'school_account_request'or event.version is distinct from 1 or event.metadata is distinct from'{"requestRevision":1}'::jsonb
 or event.deduplication_key is distinct from(case event.type when'school.account.recovery_authorized'then'school-account-recovery-authorized:'else'school-account-recovery-completed:'end)||source.id::text||':1'
 or not exists(select 1 from internal.school_account_request_revisions original where original.request_id=source.id and original.school_id=source.school_id and original.revision=1 and original.status='REQUESTED'and original.intent_snapshot=internal.school_account_intent(source))
 or not exists(select 1 from internal.school_account_token_digests token where token.id=authorized.token_id and token.request_id=source.id and token.school_id=source.school_id and token.provider_user_id=event.actor_id and token.request_revision=1 and token.purpose='recovery')
 or authorized.receipt is distinct from jsonb_build_object('id',source.id,'schoolId',source.school_id,'userId',event.actor_id,'status','AUTHORIZED','revision',1)
 or not exists(select 1 from internal.audit_events audit where audit.school_id=source.school_id and audit.actor_id=event.actor_id and audit.entity_id=source.id and audit.entity_type='school_account_request'and audit.action=event.type and audit.outcome='succeeded'and audit.metadata='{"requestRevision":1}'::jsonb)
 then raise exception 'Exact immutable recovery observation source required'using errcode='22023';end if;
 if event.type='school.account.recovery_completed'then
  select*into completion from internal.school_account_recovery_completions where request_id=source.id and school_id=source.school_id;
  if not found or completion.actor_id is distinct from event.actor_id or completion.session_id is distinct from authorized.session_id or completion.password_digest is not distinct from authorized.password_digest
  or completion.receipt is distinct from jsonb_build_object('id',source.id,'schoolId',source.school_id,'userId',event.actor_id,'status','COMPLETED','revision',1)
  or not exists(select 1 from internal.idempotency_keys canonical where canonical.school_id=source.school_id and canonical.actor_id=event.actor_id and canonical.key=completion.command_key and canonical.command='school.account.recovery.complete'and canonical.fingerprint=completion.fingerprint and canonical.state='COMPLETED'and canonical.response=completion.receipt)
  then raise exception 'Exact immutable changed-password observation required'using errcode='22023';end if;
 elsif not exists(select 1 from internal.idempotency_keys canonical where canonical.school_id=source.school_id and canonical.actor_id=event.actor_id and canonical.key=authorized.command_key and canonical.command='school.account.recovery.authorize'and canonical.fingerprint=authorized.fingerprint and canonical.state='COMPLETED'and canonical.response=authorized.receipt)then raise exception 'Exact original recovery authorization receipt required'using errcode='22023';end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,source.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Recovery observation acknowledgment lease changed'using errcode='22023';end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end$$;


create or replace function internal.authorize_school_account_recovery(target_request uuid,secret_digest text,command_key text,fingerprint text,request_id text)returns jsonb
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
 perform internal.enqueue_event('school.account.recovery_authorized','school_account_request',source.id,1,'{"requestRevision":1}'::jsonb,'school-account-recovery-authorized:'||source.id::text||':1');
 perform internal.finish_command(v_key,'school.account.recovery.authorize',v_fingerprint,response);return response;
end$$;


create or replace function internal.complete_school_account_recovery(target_request uuid,command_key text,fingerprint text,request_id text)returns jsonb
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
 perform internal.enqueue_event('school.account.recovery_completed','school_account_request',source.id,1,'{"requestRevision":1}'::jsonb,'school-account-recovery-completed:'||source.id::text||':1');
 perform internal.finish_command(v_key,'school.account.recovery.complete',v_fingerprint,response);return response;
end$$;

revoke execute on function internal.create_school_account_recovery(uuid,jsonb,text,text,text),internal.authorize_school_account_recovery(uuid,text,text,text,text),internal.complete_school_account_recovery(uuid,text,text,text),internal.process_before_school_account_recovery_events(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.create_school_account_recovery(uuid,jsonb,text,text,text),internal.authorize_school_account_recovery(uuid,text,text,text,text),internal.complete_school_account_recovery(uuid,text,text,text)to cuevo_api;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
