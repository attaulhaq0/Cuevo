-- Rollback-only recipient claim fixture. No provider, SMTP or network operation is called.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
select internal.configure_worker_dispatch(false,null,null,false);
select set_config('app.runtime_env','local',true);

select ok(to_regprocedure('internal.claim_school_account_invitation(uuid,text,text,text,text)')is not null,'one private recipient claim entrypoint exists');
select ok(has_function_privilege('cuevo_api','internal.claim_school_account_invitation(uuid,text,text,text,text)','EXECUTE'),'API can call the purpose-only recipient claim');
select ok(not has_function_privilege('authenticated','internal.claim_school_account_invitation(uuid,text,text,text,text)','EXECUTE')and not has_function_privilege('service_role','internal.claim_school_account_invitation(uuid,text,text,text,text)','EXECUTE')and not has_function_privilege('cuevo_worker','internal.claim_school_account_invitation(uuid,text,text,text,text)','EXECUTE'),'Data API and worker cannot claim school membership');
select ok(not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace cross join pg_roles role
 where namespace.nspname='internal'and relation.relname in('school_account_claims','school_account_token_consumptions')and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_table_privilege(role.oid,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),'claim and consumption ledgers have no raw runtime grants');
select ok(not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='internal'and relation.relname in('school_account_claims','school_account_token_consumptions')and(not relation.relrowsecurity or not relation.relforcerowsecurity)),'claim and consumption ledgers use FORCE RLS');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace cross join pg_roles role
 where namespace.nspname='internal'and routine.proname in('require_school_account_claim_source','process_before_school_account_claims')and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,routine.oid,'EXECUTE')),'claim helpers cannot bypass recipient or worker source validation');

create temporary table claim_fixture(kind text primary key,request_id uuid not null,user_id uuid not null,session_id uuid not null,token_id uuid not null,digest text not null,event_id uuid not null);
grant select on claim_fixture to cuevo_api,cuevo_worker;
select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','Explicit rollback claim fixture approval',(select revision from internal.school_account_runtime_control where singleton),true);

-- The helper creates a complete immutable source/effect fixture through owner functions,
-- never a broad API role or a fabricated live-provider delivery claim.
create function pg_temp.prepare_claim_fixture(label text)returns void language plpgsql set search_path=''as $$
declare response jsonb;source internal.school_account_requests;context jsonb;create_attempt uuid:=gen_random_uuid();link_attempt uuid:=gen_random_uuid();delivery_attempt uuid:=gen_random_uuid();session_identity uuid:=gen_random_uuid();digest_value text:=md5(label)||md5(label||':token');begin
 perform set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);perform set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
 response:=internal.create_school_account_invitation(jsonb_build_object('displayName','Claim learner '||label,'email','claim-'||label||'@example.test','role','student','reason','Rollback-only exact claim verification','confirmInvitation',true),'claim-source-'||label,repeat('a',64),'claim-fixture');
 select*into source from internal.school_account_requests where id=(response->>'id')::uuid;
 insert into auth.users(id,email,is_anonymous)values(source.provider_user_id,source.email,false);
 insert into auth.sessions(id,user_id,created_at,updated_at,not_after)values(session_identity,source.provider_user_id,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval'15 minutes');
 context:=internal.claim_school_account_effect(source.id);
 if context->>'state'is distinct from'ADMITTED'then raise exception 'Exact effect fixture source not admitted';end if;
 if internal.begin_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'CREATE',create_attempt,null)is distinct from true then raise exception 'Create fixture step not admitted';end if;
 if internal.finish_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'CREATE',create_attempt,'{"state":"CONFIRMED","code":"IDENTITY_CONFIRMED","emailConfirmed":null}'::jsonb)is distinct from true then raise exception 'Create fixture receipt not confirmed';end if;
 if internal.begin_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'LINK',link_attempt,digest_value)is distinct from true then raise exception 'Link fixture step not admitted';end if;
 if internal.finish_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'LINK',link_attempt,'{"state":"CONFIRMED","code":"LINK_GENERATED"}'::jsonb)is distinct from true then raise exception 'Link fixture receipt not confirmed';end if;
 if internal.begin_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'DELIVERY',delivery_attempt,null)is distinct from true then raise exception 'Delivery fixture step not admitted';end if;
 if internal.finish_school_account_effect_step((context->>'eventId')::uuid,(context->>'leaseToken')::uuid,'DELIVERY',delivery_attempt,'{"state":"CONFIRMED","code":"DELIVERY_ACCEPTED"}'::jsonb)is distinct from true then raise exception 'Delivery fixture receipt not confirmed';end if;
 response:=internal.finish_school_account_effect((context->>'eventId')::uuid,(context->>'leaseToken')::uuid);
 if response->>'status'is distinct from'AWAITING_CLAIM'then raise exception 'Confirmed fixture outcome not established';end if;
 -- SQL fixture records the verified provider fact; the real Auth redemption is a separate integration gate.
 update auth.users set email_confirmed_at=clock_timestamp()where id=source.provider_user_id;
 insert into pg_temp.claim_fixture(kind,request_id,user_id,session_id,token_id,digest,event_id)
 select label,source.id,source.provider_user_id,session_identity,token.id,digest_value,(context->>'eventId')::uuid from internal.school_account_token_digests token where token.request_id=source.id and token.token_digest=digest_value;
 if not found then raise exception 'Exact fixture token missing';end if;
end$$;

select pg_temp.prepare_claim_fixture('first');
select is((select count(*)from app.memberships where actor_id=(select user_id from claim_fixture where kind='first')),0::bigint,'fixture provider identity has no school membership before recipient claim');
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='first'),true);
select set_config('app.school_id','',true);
select set_config('app.session_id',(select session_id::text from claim_fixture where kind='first'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),repeat('f',64),'claim-wrong-token',repeat('b',64),'claim-test')$$,'42501',null,'wrong digest cannot consume an approved request');
select set_config('app.session_id','',true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-no-session',repeat('b',64),'claim-test')$$,'42501',null,'missing current session fails before membership mutation');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select set_config('app.session_id',(select session_id::text from claim_fixture where kind='first'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-other-user',repeat('b',64),'claim-test')$$,'42501',null,'another actor cannot reuse the recipient session or token');
reset role;
update auth.users set email_confirmed_at=null where id=(select user_id from claim_fixture where kind='first');
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='first'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-unconfirmed',repeat('b',64),'claim-test')$$,'42501',null,'unconfirmed provider email cannot create school access');
reset role;
update auth.users set email_confirmed_at=clock_timestamp(),is_anonymous=true where id=(select user_id from claim_fixture where kind='first');
set local role cuevo_api;
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-anonymous',repeat('b',64),'claim-test')$$,'42501',null,'anonymous provider identity cannot claim membership');
reset role;
update auth.users set is_anonymous=false,email='wrong@example.test'where id=(select user_id from claim_fixture where kind='first');
set local role cuevo_api;
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-wrong-email',repeat('b',64),'claim-test')$$,'42501',null,'verified provider email must match the approved normalized recipient');
reset role;
update auth.users set email=(select request.email from internal.school_account_requests request join claim_fixture fixture on fixture.request_id=request.id where fixture.kind='first')where id=(select user_id from claim_fixture where kind='first');
update auth.sessions set not_after=clock_timestamp()-interval'1 second'where id=(select session_id from claim_fixture where kind='first');
set local role cuevo_api;
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-expired-session',repeat('b',64),'claim-test')$$,'42501',null,'expired session denies membership even with a valid token');
reset role;
update auth.sessions set not_after=clock_timestamp()+interval'15 minutes'where id=(select session_id from claim_fixture where kind='first');

create temporary table claim_receipt(receipt jsonb not null);grant select,insert on claim_receipt to cuevo_api;
set local role cuevo_api;
select set_config('app.school_id','',true);
insert into claim_receipt select internal.claim_school_account_invitation((select request_id from claim_fixture where kind='first'),(select digest from claim_fixture where kind='first'),'claim-first-original',repeat('b',64),'claim-test');
select is((select receipt->>'status'from claim_receipt),'CLAIMED','recipient receives a confirmed school claim without token or email');
select is((select receipt->>'role'from claim_receipt),'student','role comes only from the approved invitation');
select is((select(receipt->>'revision')::integer from claim_receipt),2,'claim creates the immutable second source revision');
select ok(not(select receipt? 'email'or receipt? 'token'or receipt? 'digest'from claim_receipt),'claim receipt excludes recipient email and admission secrets');
select set_config('app.school_id','',true);
select is(internal.claim_school_account_invitation((select request_id from claim_fixture where kind='first'),(select digest from claim_fixture where kind='first'),'claim-first-original',repeat('b',64),'claim-replay'),(select receipt from claim_receipt),'same key replays its exact currently authorized claim');
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-new-key',repeat('b',64),'claim-test')$$,'22023',null,'consumed admission cannot issue a second claim with another key');
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-first-original',repeat('c',64),'claim-test')$$,'22023',null,'original claim key cannot change its fingerprint');
reset role;
select is((select count(*)from internal.school_account_token_consumptions where request_id=(select request_id from claim_fixture where kind='first')),1::bigint,'one immutable token consumption is recorded');
select is((select count(*)from internal.school_account_claims where request_id=(select request_id from claim_fixture where kind='first')),1::bigint,'one private claim source is retained');
select is((select count(*)from app.memberships where school_id='10000000-0000-4000-8000-000000000001'and actor_id=(select user_id from claim_fixture where kind='first')),1::bigint,'one exact active school membership exists');
select is((select count(*)from internal.school_access_revisions where school_id='10000000-0000-4000-8000-000000000001'and resource='memberships'and source_key=(select user_id::text from claim_fixture where kind='first')),1::bigint,'existing membership revision history participates in the atomic claim');
select is((select count(*)from internal.outbox_events where entity_id=(select request_id from claim_fixture where kind='first')and type='school.account.claimed'),1::bigint,'canonical claim produces one known worker source event');
select is((select count(*)from app.enrollments where student_actor_id=(select user_id from claim_fixture where kind='first')),0::bigint,'claim does not invent enrollment');
select is((select count(*)from app.parent_relationships where parent_actor_id=(select user_id from claim_fixture where kind='first')),0::bigint,'claim does not invent guardian access');
select throws_ok($$update internal.school_account_claims set receipt='{}'where request_id=(select request_id from pg_temp.claim_fixture where kind='first')$$,'55000',null,'claim receipt history cannot be rewritten');
select throws_ok($$delete from internal.school_account_token_consumptions where request_id=(select request_id from pg_temp.claim_fixture where kind='first')$$,'55000',null,'consumption cannot be deleted to reuse the token');
create temporary table claim_event_lease(id uuid,lease uuid);grant select on claim_event_lease to cuevo_worker;
insert into claim_event_lease select id,gen_random_uuid()from internal.outbox_events where entity_id=(select request_id from claim_fixture where kind='first')and type='school.account.claimed';
update internal.outbox_events set state='PROCESSING',lease_token=(select lease from claim_event_lease),lease_until=clock_timestamp()+interval'60 seconds',attempt_count=1 where id=(select id from claim_event_lease);
set local role cuevo_worker;
select lives_ok($$select internal.process_learner_event((select id from pg_temp.claim_event_lease),(select lease from pg_temp.claim_event_lease))$$,'known claim lifecycle event validates exact source and acknowledgment without provider effects');
reset role;
select is((select state from internal.outbox_events where id=(select id from claim_event_lease)),'COMPLETED','claim lifecycle acknowledgment completes its exact worker event');
select is((select count(*)from internal.processed_events where event_id=(select id from claim_event_lease)),1::bigint,'claim lifecycle acknowledgment records one processed identity');

-- An exception after the membership write must roll back every consequential claim record.
select pg_temp.prepare_claim_fixture('atomic');
create function pg_temp.reject_atomic_claim()returns trigger language plpgsql set search_path=''as $$begin
 if new.actor_id=(select user_id from pg_temp.claim_fixture where kind='atomic')then raise exception 'Injected atomic audit failure'using errcode='P0001';end if;return new;
end$$;
create trigger reject_atomic_claim_fixture before insert on internal.audit_events for each row execute function pg_temp.reject_atomic_claim();
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='atomic'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='atomic'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='atomic'),(select digest from pg_temp.claim_fixture where kind='atomic'),'claim-atomic-failure',repeat('e',64),'claim-test')$$,'P0001',null,'injected failure after membership insert rejects the entire claim');
reset role;
drop trigger reject_atomic_claim_fixture on internal.audit_events;
select is((select count(*)from app.memberships where actor_id=(select user_id from claim_fixture where kind='atomic')),0::bigint,'failed claim leaves no membership');
select is((select count(*)from app.people where actor_id=(select user_id from claim_fixture where kind='atomic')),0::bigint,'failed claim leaves no person record');
select is((select count(*)from internal.school_account_token_consumptions where request_id=(select request_id from claim_fixture where kind='atomic')),0::bigint,'failed claim leaves token unconsumed');
select is((select count(*)from internal.school_account_claims where request_id=(select request_id from claim_fixture where kind='atomic')),0::bigint,'failed claim leaves no receipt ledger');
select is((select current_status from internal.school_account_requests where id=(select request_id from claim_fixture where kind='atomic')),'REQUESTED','failed claim preserves original request source');
select is((select count(*)from internal.outbox_events where entity_id=(select request_id from claim_fixture where kind='atomic')and type='school.account.claimed'),0::bigint,'failed claim has no successful outbox acknowledgment');

-- Revoked current access never revives through an original claim receipt.
update app.memberships set status='revoked'where school_id='10000000-0000-4000-8000-000000000001'and actor_id=(select user_id from claim_fixture where kind='first');
set local role cuevo_api;
select set_config('app.school_id','',true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='first'),(select digest from pg_temp.claim_fixture where kind='first'),'claim-first-original',repeat('b',64),'claim-replay')$$,'42501',null,'revoked current membership denies old claim replay');
reset role;

-- A complete effect does not authorize a request that the administrator later revoked.
select pg_temp.prepare_claim_fixture('revoked');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select internal.revoke_school_account_invitation((select request_id from claim_fixture where kind='revoked'),'{"expectedRevision":1,"reason":"Cancel before recipient claim","confirmRevocation":true}','claim-source-revoke',repeat('d',64),'claim-fixture');
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='revoked'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='revoked'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='revoked'),(select digest from pg_temp.claim_fixture where kind='revoked'),'claim-revoked',repeat('d',64),'claim-test')$$,'42501',null,'revoked source blocks a delivered current recipient');
reset role;
select is((select count(*)from internal.school_account_claims where request_id=(select request_id from claim_fixture where kind='revoked')),0::bigint,'denied revoked claim writes no private claim record');

select pg_temp.prepare_claim_fixture('scope');
update app.people set synthetic=false where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='scope'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='scope'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='scope'),(select digest from pg_temp.claim_fixture where kind='scope'),'claim-mixed',repeat('f',64),'claim-test')$$,'42501',null,'mixed real/synthetic school cannot activate an invitation claim');
reset role;
update app.people set synthetic=true where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
update app.entitlements set enabled=false where school_id='10000000-0000-4000-8000-000000000001'and code='school.operations';
set local role cuevo_api;
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='scope'),(select digest from pg_temp.claim_fixture where kind='scope'),'claim-disabled-entitlement',repeat('f',64),'claim-test')$$,'42501',null,'current approval entitlement loss blocks claim');
reset role;
update app.entitlements set enabled=true where school_id='10000000-0000-4000-8000-000000000001'and code='school.operations';
update auth.users set banned_until=clock_timestamp()+interval'1 day'where id=(select user_id from claim_fixture where kind='scope');
set local role cuevo_api;
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='scope'),(select digest from pg_temp.claim_fixture where kind='scope'),'claim-banned-recipient',repeat('f',64),'claim-test')$$,'42501',null,'banned provider account cannot activate a membership');
reset role;
update auth.users set banned_until=null where id=(select user_id from claim_fixture where kind='scope');

-- Request expiry is a fixed source fact. This fixture creates an already elapsed
-- source by temporarily changing only this rollback fixture's guarded source bytes.
-- Triggers are restored before the denied runtime call; this is not a production repair.
select pg_temp.prepare_claim_fixture('expiry');
-- Flush the fixture's deferred source/claim FK events before temporary trigger DDL.
set constraints all immediate;
alter table internal.school_account_requests disable trigger school_account_request_intent_immutable;
alter table internal.school_account_request_revisions disable trigger school_account_request_history_immutable;
alter table internal.school_account_token_digests disable trigger school_account_token_digests_immutable;
update internal.school_account_requests set created_at=now()-interval'169 hours',expires_at=now()-interval'1 hour'where id=(select request_id from claim_fixture where kind='expiry');
update internal.school_account_request_revisions revision set intent_snapshot=internal.school_account_intent(source)from internal.school_account_requests source where source.id=revision.request_id and source.id=(select request_id from claim_fixture where kind='expiry');
update internal.school_account_token_digests token set created_at=clock_timestamp()-interval'2 hours',expires_at=(select expires_at from internal.school_account_requests where id=token.request_id)where request_id=(select request_id from claim_fixture where kind='expiry');
alter table internal.school_account_token_digests enable trigger school_account_token_digests_immutable;
alter table internal.school_account_request_revisions enable trigger school_account_request_history_immutable;
alter table internal.school_account_requests enable trigger school_account_request_intent_immutable;
-- Later source fixtures insert the request and its initial revision atomically.
set constraints all deferred;
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='expiry'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='expiry'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='expiry'),(select digest from pg_temp.claim_fixture where kind='expiry'),'claim-expired',repeat('f',64),'claim-test')$$,'42501',null,'fixed expired request and token cannot activate membership');
reset role;

select pg_temp.prepare_claim_fixture('conflict');
insert into app.memberships(school_id,actor_id,role,status,effective_from)select'10000000-0000-4000-8000-000000000001',user_id,'teacher','revoked',clock_timestamp()from claim_fixture where kind='conflict';
insert into app.people(school_id,actor_id,display_name,synthetic)select'10000000-0000-4000-8000-000000000001',user_id,'Existing revoked school account',true from claim_fixture where kind='conflict';
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='conflict'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='conflict'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='conflict'),(select digest from pg_temp.claim_fixture where kind='conflict'),'claim-conflict',repeat('d',64),'claim-test')$$,'22023',null,'existing revoked role cannot be reactivated through an invitation');
reset role;

select pg_temp.prepare_claim_fixture('operator');
update app.memberships set role='admin'where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000001';
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='operator'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='operator'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='operator'),(select digest from pg_temp.claim_fixture where kind='operator'),'claim-approver-revision',repeat('d',64),'claim-test')$$,'42501',null,'a new approving membership revision invalidates an older admission intent');
reset role;
select internal.configure_local_school_account_runtime(false,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','Pause before claim',(select revision from internal.school_account_runtime_control where singleton),true);
set local role cuevo_api;
select set_config('app.actor_id',(select user_id::text from claim_fixture where kind='operator'),true);select set_config('app.school_id','',true);select set_config('app.session_id',(select session_id::text from claim_fixture where kind='operator'),true);
select throws_ok($$select internal.claim_school_account_invitation((select request_id from pg_temp.claim_fixture where kind='operator'),(select digest from pg_temp.claim_fixture where kind='operator'),'claim-control-disabled',repeat('d',64),'claim-test')$$,'42501',null,'operator pause denies a delivered source claim');
reset role;
select *from finish();
rollback;
