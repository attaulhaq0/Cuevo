-- Explicit local operator-approved first school. No Auth creation, mail or public tenant API.
begin;
create table internal.initial_school_admissions (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null unique references app.schools(id)deferrable initially deferred,
 operator_id uuid not null,
 operator_session_id uuid not null,
 administrator_id uuid not null,
 administrator_session_id uuid not null,
 control_revision integer not null references internal.school_account_runtime_revisions(revision),
 command_key text not null check(length(command_key)between 1 and 200),
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 intent_snapshot jsonb not null check(jsonb_typeof(intent_snapshot)='object'and octet_length(intent_snapshot::text)<=16384),
 receipt jsonb not null check(jsonb_typeof(receipt)='object'and octet_length(receipt::text)<=1024),
 administrator_member_revision integer not null check(administrator_member_revision=1),
 approved_at timestamptz not null default clock_timestamp(),
 unique(operator_id,command_key),
 check(operator_id<>administrator_id)
);
alter table internal.initial_school_admissions enable row level security;
alter table internal.initial_school_admissions force row level security;
revoke all on internal.initial_school_admissions from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger initial_school_admissions_immutable before update or delete on internal.initial_school_admissions for each row execute function internal.academic_history_immutable();
create trigger initial_school_admissions_no_truncate before truncate on internal.initial_school_admissions for each statement execute function internal.academic_history_immutable();

create function internal.initial_school_payload(payload jsonb)returns jsonb
language plpgsql immutable set search_path=''as $$
declare fields text[]:=array['schoolId','name','countryCode','languages','adminId','adminEmail','adminDisplayName','adminSessionId','operatorSessionId','controlRevision','entitlements','reason','confirmApproval'];known text[]:=array['school.context','school.operations','learning','assessment','curriculum','learner.state','improvement','community','portfolio','restricted.records'];begin
 if payload is null or jsonb_typeof(payload)is distinct from'object'or octet_length(payload::text)>16384 or not(payload?&fields)
 or exists(select 1 from jsonb_object_keys(payload)field where field<>all(fields))
 or jsonb_typeof(payload->'schoolId')is distinct from'string'or payload->>'schoolId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or jsonb_typeof(payload->'adminId')is distinct from'string'or payload->>'adminId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or jsonb_typeof(payload->'adminSessionId')is distinct from'string'or payload->>'adminSessionId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or jsonb_typeof(payload->'operatorSessionId')is distinct from'string'or payload->>'operatorSessionId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or jsonb_typeof(payload->'controlRevision')is distinct from'number'or payload->>'controlRevision'!~'^[1-9][0-9]{0,8}$'
 or jsonb_typeof(payload->'name')is distinct from'string'or length(btrim(payload->>'name'))not between 1 and 200
 or jsonb_typeof(payload->'adminDisplayName')is distinct from'string'or length(btrim(payload->>'adminDisplayName'))not between 1 and 200
 or jsonb_typeof(payload->'countryCode')is distinct from'string'or payload->>'countryCode'!~'^[A-Z]{2}$'
 or jsonb_typeof(payload->'adminEmail')is distinct from'string'or payload->>'adminEmail'<>lower(btrim(payload->>'adminEmail'))or length(payload->>'adminEmail')not between 3 and 254 or payload->>'adminEmail'~'[[:space:]]'or payload->>'adminEmail'!~'^[^@]+@[^@]+\.[^@]+$'
 or jsonb_typeof(payload->'reason')is distinct from'string'or length(btrim(payload->>'reason'))not between 1 and 1000
 or payload->'confirmApproval'is distinct from'true'::jsonb then raise exception 'Exact confirmed initial school intent required'using errcode='22023';end if;
 if jsonb_typeof(payload->'languages')is distinct from'array'or jsonb_array_length(payload->'languages')not between 1 and 2
 or exists(select 1 from jsonb_array_elements(payload->'languages')language where jsonb_typeof(language)is distinct from'string'or (language#>>'{}')not in('en','ar'))
 or(select count(distinct language#>>'{}')from jsonb_array_elements(payload->'languages')language)<>jsonb_array_length(payload->'languages')then raise exception 'Bounded approved English/Arabic languages required'using errcode='22023';end if;
 if jsonb_typeof(payload->'entitlements')is distinct from'array'or jsonb_array_length(payload->'entitlements')not between 2 and 10
 or not(payload->'entitlements'?&array['school.context','school.operations'])
 or exists(select 1 from jsonb_array_elements(payload->'entitlements')capability where jsonb_typeof(capability)is distinct from'string'or(capability#>>'{}')<>all(known))
 or(select count(distinct capability#>>'{}')from jsonb_array_elements(payload->'entitlements')capability)<>jsonb_array_length(payload->'entitlements')then raise exception 'Explicit known initial capabilities required'using errcode='22023';end if;
 return payload;
end$$;

create function internal.require_initial_school_operator(expected_revision integer,target_session uuid)returns uuid
language plpgsql security definer set search_path=''as $$
declare control internal.school_account_runtime_control;actor uuid:="authorization".actor_id();begin
 if session_user<>'postgres'or actor is null or expected_revision is null or target_session is null or current_setting('app.runtime_env',true)is distinct from'local'then raise exception 'Exact local owner operator session required'using errcode='42501';end if;
 select*into control from internal.school_account_runtime_control where singleton for share;
 if not found or not control.enabled or control.mode<>'LOCAL_SYNTHETIC'or control.project_ref is distinct from'LOCAL_CUEVO'or control.database_oid is distinct from(select oid from pg_catalog.pg_database where datname=current_database())
 or control.revision is distinct from expected_revision or control.approved_operator_id is distinct from actor
 or not exists(select 1 from internal.school_account_runtime_revisions history where history.revision=control.revision and history.enabled and history.mode=control.mode and history.database_oid=control.database_oid and history.project_ref=control.project_ref and history.approved_operator_id=actor and history.approved_at=control.approved_at)
 or not exists(select 1 from auth.users account join auth.sessions session on session.user_id=account.id where account.id=actor and session.id=target_session and(session.not_after is null or session.not_after>clock_timestamp())and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))then raise exception 'Current exact approved operator session required'using errcode='42501';end if;
 return actor;
end$$;

create function internal.admit_initial_school(payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
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
  or exists(select 1 from jsonb_array_elements_text(intent->'entitlements')code where not exists(select 1 from app.entitlements entitlement where entitlement.school_id=school and entitlement.code=code and entitlement.enabled and entitlement.effective_from<=clock_timestamp()and(entitlement.effective_to is null or entitlement.effective_to>clock_timestamp())))
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
 insert into app.entitlements(school_id,code,enabled,effective_from)select school,code,true,now()from jsonb_array_elements_text(intent->'entitlements')code;
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

alter function internal.process_learner_event(uuid,uuid)rename to process_before_initial_school_admission;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;source internal.initial_school_admissions;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if not found or event.state is distinct from'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Current initial admission event lease required'using errcode='22023';end if;
 if internal.outbox_event_owner(event.type)is distinct from'WORKER'then raise exception 'Initial admission handler cannot execute Auth effects'using errcode='42501';end if;
 if event.type<>'school.initial_admitted'then return internal.process_before_initial_school_admission(target_event,current_lease);end if;
 select*into source from internal.initial_school_admissions where id=event.entity_id and school_id=event.school_id;
 if not found or event.actor_id is distinct from source.administrator_id or event.entity_type is distinct from'initial_school_admission'or event.version is distinct from 1 or event.metadata is distinct from'{"admissionRevision":1}'::jsonb or event.deduplication_key is distinct from'initial-school:'||source.id::text||':1'
 or not exists(select 1 from internal.school_access_revisions revision where revision.school_id=source.school_id and revision.resource='memberships'and revision.source_key=source.administrator_id::text and revision.revision=1 and revision.actor_id=source.operator_id and revision.record->>'role'='admin'and revision.record->>'status'='active')
 or not exists(select 1 from internal.audit_events audit where audit.school_id=source.school_id and audit.actor_id=source.administrator_id and audit.action='school.initial_admitted'and audit.entity_type='initial_school_admission'and audit.entity_id=source.id and audit.outcome='succeeded'and audit.metadata=jsonb_build_object('admissionRevision',1,'operatorId',source.operator_id))
 or not exists(select 1 from internal.idempotency_keys receipt where receipt.school_id=source.school_id and receipt.actor_id=source.administrator_id and receipt.key=source.command_key and receipt.command='school.initial.admit'and receipt.fingerprint=source.fingerprint and receipt.state='COMPLETED'and receipt.response=source.receipt)
 then raise exception 'Exact immutable initial admission source required'using errcode='22023';end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,source.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Initial admission acknowledgment lease changed'using errcode='22023';end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end$$;
revoke execute on function internal.initial_school_payload(jsonb),internal.require_initial_school_operator(integer,uuid),internal.admit_initial_school(jsonb,text,text,text),internal.process_before_initial_school_admission(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
