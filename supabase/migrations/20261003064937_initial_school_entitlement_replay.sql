-- Qualify the exact approved entitlement SRF; preserve applied initial admission history.
begin;
create or replace function internal.admit_initial_school(payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare v_payload jsonb:=$1;v_command_key text:=$2;v_fingerprint text:=$3;v_request_id text:=$4;intent jsonb;operator uuid;school uuid;administrator uuid;original internal.initial_school_admissions;member app.memberships;admission uuid;response jsonb;begin
 if v_command_key is null or length(v_command_key)not between 1 and 200 or v_fingerprint is null or v_fingerprint!~'^[a-f0-9]{64}$'or v_request_id is null or length(v_request_id)not between 1 and 200 then raise exception 'Bounded initial admission command identity required'using errcode='22023';end if;
 if session_user<>'postgres'then raise exception 'Initial admission is owner-only'using errcode='42501';end if;
 intent:=internal.initial_school_payload(v_payload);school:=(intent->>'schoolId')::uuid;administrator:=(intent->>'adminId')::uuid;
 operator:=internal.require_initial_school_operator((intent->>'controlRevision')::integer,(intent->>'operatorSessionId')::uuid);
 if administrator=operator then raise exception 'Separate consenting first administrator required'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-access-mutations',0));
 perform pg_advisory_xact_lock(hashtextextended(school::text||':admin-memberships',0));
 perform pg_advisory_xact_lock(hashtextextended(operator::text||':initial-school-key:'||v_command_key,0));
 perform pg_advisory_xact_lock(hashtextextended(administrator::text||':initial-school-administrator',0));
 -- Bound provider lifecycle/session waits before repeating current identity checks.
 perform 1 from auth.users account where account.id in(operator,administrator)order by account.id for share;
 perform 1 from auth.sessions session where session.id in((intent->>'operatorSessionId')::uuid,(intent->>'adminSessionId')::uuid)order by session.id for share;
 operator:=internal.require_initial_school_operator((intent->>'controlRevision')::integer,(intent->>'operatorSessionId')::uuid);
 if not exists(select 1 from auth.users account join auth.sessions session on session.user_id=account.id where account.id=administrator and account.email=intent->>'adminEmail'and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp())and session.id=(intent->>'adminSessionId')::uuid and(session.not_after is null or session.not_after>clock_timestamp()))then raise exception 'Current exact consenting administrator account required'using errcode='42501';end if;
 select*into original from internal.initial_school_admissions stored where stored.operator_id=operator and stored.command_key=v_command_key for share;
 if found then
  perform internal.require_synthetic_intelligence_school(school);
  if original.fingerprint is distinct from v_fingerprint or original.intent_snapshot is distinct from intent or original.school_id is distinct from school or original.administrator_id is distinct from administrator or original.control_revision is distinct from(intent->>'controlRevision')::integer then raise exception 'Original reviewed admission key changed'using errcode='22023';end if;
  select*into member from app.memberships where school_id=school and actor_id=administrator for share;
  if not found or member.role<>'admin'or member.status<>'active'or member.revision<>original.administrator_member_revision or member.effective_from>clock_timestamp()or(member.effective_to is not null and member.effective_to<=clock_timestamp())
  or not exists(select 1 from app.schools source where source.id=school and source.status='active'and source.name=btrim(intent->>'name')and source.country_code=intent->>'countryCode'and source.languages=array(select language#>>'{}'from jsonb_array_elements(intent->'languages')language))
  or not exists(select 1 from app.people person where person.school_id=school and person.actor_id=administrator and person.synthetic and person.display_name=btrim(intent->>'adminDisplayName'))
  or exists(select 1 from jsonb_array_elements_text(intent->'entitlements')requested(code) where not exists(select 1 from app.entitlements entitlement where entitlement.school_id=school and entitlement.code=requested.code and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp())))
  or not exists(select 1 from internal.idempotency_keys receipt where receipt.school_id=school and receipt.actor_id=administrator and receipt.key=v_command_key and receipt.command='school.initial.admit'and receipt.fingerprint=original.fingerprint and receipt.state='COMPLETED'and receipt.response=original.receipt)
  or not exists(select 1 from internal.audit_events audit where audit.school_id=school and audit.actor_id=administrator and audit.action='school.initial_admitted'and audit.entity_type='initial_school_admission'and audit.entity_id=original.id and audit.outcome='succeeded'and audit.metadata=jsonb_build_object('admissionRevision',1,'operatorId',operator))
  or not exists(select 1 from internal.outbox_events event where event.school_id=school and event.actor_id=administrator and event.type='school.initial_admitted'and event.entity_type='initial_school_admission'and event.entity_id=original.id and event.version=1 and event.metadata='{"admissionRevision":1}'::jsonb and event.deduplication_key='initial-school:'||original.id::text||':1')
  then raise exception 'Current originally admitted administrator source required'using errcode='42501';end if;
  return original.receipt;
 end if;
 if exists(select 1 from app.schools where id=school)or exists(select 1 from internal.initial_school_admissions where school_id=school)
 or exists(select 1 from app.memberships where actor_id=administrator)or exists(select 1 from app.people where actor_id=administrator)
 or exists(select 1 from internal.school_account_requests where provider_user_id=administrator)then raise exception 'New unaffiliated administrator and new school source required'using errcode='22023';end if;
 admission:=gen_random_uuid();response:=jsonb_build_object('id',school,'administratorId',administrator,'admissionId',admission,'status','ADMITTED');
 insert into internal.initial_school_admissions(id,school_id,operator_id,operator_session_id,administrator_id,administrator_session_id,control_revision,command_key,fingerprint,intent_snapshot,receipt,administrator_member_revision)
 values(admission,school,operator,(intent->>'operatorSessionId')::uuid,administrator,(intent->>'adminSessionId')::uuid,(intent->>'controlRevision')::integer,v_command_key,v_fingerprint,intent,response,1);
 insert into app.schools(id,name,country_code,languages)values(school,btrim(intent->>'name'),intent->>'countryCode',array(select language#>>'{}'from jsonb_array_elements(intent->'languages')language));
 insert into app.memberships(school_id,actor_id,role,status,effective_from)values(school,administrator,'admin','active',now())returning*into member;
 insert into app.people(school_id,actor_id,display_name,synthetic)values(school,administrator,btrim(intent->>'adminDisplayName'),true);
 perform internal.require_synthetic_intelligence_school(school);
 insert into app.entitlements(school_id,code,enabled,effective_from)select school,requested.code,true,now()from jsonb_array_elements_text(intent->'entitlements')requested(code);
 -- These canonical rows identify the actual consenting first administrator verified above.
 -- The pre-school immutable source separately identifies the operator; actor GUC is never switched.
 insert into internal.audit_events(school_id,actor_id,action,entity_type,entity_id,request_id,outcome,metadata)
 values(school,administrator,'school.initial_admitted','initial_school_admission',admission,v_request_id,'succeeded',jsonb_build_object('admissionRevision',1,'operatorId',operator));
 insert into internal.outbox_events(school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)
 values(school,administrator,'school.initial_admitted','initial_school_admission',admission,1,jsonb_build_object('admissionRevision',1),'initial-school:'||admission::text||':1');
 insert into internal.idempotency_keys(school_id,actor_id,key,command,fingerprint,state,response,completed_at)
 values(school,administrator,v_command_key,'school.initial.admit',v_fingerprint,'COMPLETED',response,clock_timestamp());
 return response;
end$$;

revoke execute on function internal.admit_initial_school(jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
