-- Qualify exact claim source columns without changing recipient or authorization semantics.
begin;

create or replace function internal.claim_school_account_invitation(target_request uuid,secret_digest text,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare actor uuid:="authorization".actor_id();session_id uuid;school uuid;source internal.school_account_requests;token internal.school_account_token_digests;prior internal.school_account_claims;member app.memberships;response jsonb;reservation jsonb;begin
 if target_request is null or actor is null or secret_digest is null or secret_digest!~'^[a-f0-9]{64}$'
 or command_key is null or length(command_key)not between 1 and 200 or fingerprint is null or fingerprint!~'^[a-f0-9]{64}$'
 or request_id is null or length(request_id)not between 1 and 200 then raise exception 'Exact bounded account claim required'using errcode='22023';end if;
 begin session_id:=nullif(current_setting('app.session_id',true),'')::uuid;exception when invalid_text_representation then raise exception 'Current account session required'using errcode='42501';end;
 if session_id is null or"authorization".is_current_session(session_id)is distinct from true then raise exception 'Current account session required'using errcode='42501';end if;
 select request.school_id into school from internal.school_account_requests request where request.id=target_request;
 if not found then raise exception 'Approved account request required'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 -- Match ordinary school membership protection before any request/member locks.
 perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 -- Serialize approval/control changes without manufacturing a selected school actor.
 perform 1 from internal.school_account_runtime_control control where control.singleton for share;
 select request.*into source from internal.school_account_requests request where request.id=target_request and request.school_id=school for update;
 perform internal.require_school_account_claim_source(source);
 if not exists(select 1 from auth.users account join auth.sessions session on session.user_id=account.id
  where account.id=actor and account.id=source.provider_user_id and account.email=source.email and account.email_confirmed_at is not null
  and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())
 and session.id=session_id and(session.not_after is null or session.not_after>clock_timestamp()))then raise exception 'Current verified recipient account required'using errcode='42501';end if;
 perform 1 from internal.outbox_events event where event.school_id=school and event.entity_id=source.id and event.type='school.account.provisioning_requested'and event.deduplication_key='school-account:'||source.id::text||':1'for share;
 if not found then raise exception 'Exact completed account effect source required'using errcode='42501';end if;
 select admission_token.*into token from internal.school_account_token_digests admission_token where admission_token.request_id=source.id and admission_token.school_id=source.school_id and admission_token.request_revision=1 and admission_token.purpose='invite'and admission_token.token_digest=secret_digest for update;
 if not found or token.provider_user_id is distinct from actor or token.expires_at<=clock_timestamp()
 or internal.school_account_admission_effect_ready(source,token)is distinct from true then raise exception 'Exact confirmed delivery and admission token required'using errcode='42501';end if;
 select membership.*into member from app.memberships membership where membership.school_id=school and membership.actor_id=actor for update;
 select claim.*into prior from internal.school_account_claims claim where claim.request_id=source.id for update;
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
 insert into app.memberships as membership(school_id,actor_id,role,status,effective_from)values(school,actor,source.role,'active',now())returning membership.*into member;
 insert into app.people(school_id,actor_id,display_name,synthetic)values(school,actor,source.display_name,true);
 response:=jsonb_build_object('id',source.id,'schoolId',school,'userId',actor,'role',source.role,'status','CLAIMED','revision',2);
 insert into internal.school_account_claims(request_id,school_id,actor_id,approved_revision,claimed_revision,member_revision,command_key,fingerprint,receipt)
 values(source.id,school,actor,1,2,member.revision,command_key,fingerprint,response);
 insert into internal.school_account_token_consumptions(token_id,request_id,school_id,actor_id,request_revision,claimed_revision)values(token.id,source.id,school,actor,1,2);
 insert into internal.school_account_request_revisions(request_id,school_id,revision,status,intent_snapshot,created_by,reason)
 values(source.id,school,2,'CLAIMED',internal.school_account_intent(source),actor,'Recipient explicitly accepted the exact approved school account invitation.');
 update internal.school_account_requests as request set current_revision=2,current_status='CLAIMED'where request.id=source.id returning request.*into source;
 perform set_config('app.school_id',school::text,true);
 reservation:=internal.begin_command(command_key,'school.account.claim',fingerprint);
 if reservation->>'state'is distinct from'NEW'then raise exception 'Canonical account claim identity already exists'using errcode='22023';end if;
 perform internal.append_audit('school.account.claimed','school_account_request',source.id,request_id,'succeeded',jsonb_build_object('requestRevision',2));
 perform internal.enqueue_event('school.account.claimed','school_account_request',source.id,2,jsonb_build_object('requestRevision',2),'school-account-claimed:'||source.id::text||':2');
 perform internal.finish_command(command_key,'school.account.claim',fingerprint,response);
 return response;
end$$;

revoke execute on function internal.claim_school_account_invitation(uuid,text,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_school_account_invitation(uuid,text,text,text,text)to cuevo_api;
commit;
