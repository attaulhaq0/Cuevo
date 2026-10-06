-- Private source intent only; rollback fixture sends no provider request or mail.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();
select internal.configure_worker_dispatch(false,null,null,false);
select set_config('app.runtime_env','local',true);

select ok(to_regclass('internal.school_account_runtime_control')is not null,'account runtime control is private persisted state');
select ok(to_regclass('internal.school_account_requests')is not null,'approved invitation source exists without a pending membership');
select is((select enabled from internal.school_account_runtime_control where singleton),false,'invitation source runtime is disabled by default');
select is((select mode from internal.school_account_runtime_control where singleton),'DISABLED','default runtime does not assume local synthetic approval');
select ok(not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
 cross join pg_roles role where namespace.nspname='internal'and relation.relname in('school_account_runtime_control','school_account_runtime_revisions','school_account_requests','school_account_request_revisions')
 and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_table_privilege(role.oid,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),'all source/control tables deny raw application and Data API grants');
select ok(not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
 where namespace.nspname='internal'and relation.relname in('school_account_runtime_control','school_account_runtime_revisions','school_account_requests','school_account_request_revisions')and(not relation.relrowsecurity or not relation.relforcerowsecurity)),'all invitation/control records have enabled and forced RLS');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace cross join pg_roles role
 where namespace.nspname='internal'and routine.proname in('configure_local_school_account_runtime','require_school_account_runtime','school_account_intent','school_account_request_receipt','require_school_account_request','guard_school_account_request_intent')
 and role.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')and has_function_privilege(role.oid,routine.oid,'EXECUTE')),'owner helpers are not callable by runtime or Data API roles');
select ok(not exists(select 1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace cross join lateral aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))permission
 where namespace.nspname='internal'and routine.proname like'%school_account%'and permission.grantee=0 and permission.privilege_type='EXECUTE'),'PUBLIC has no new school-account function execution');
select ok(has_function_privilege('cuevo_api','internal.create_school_account_invitation(jsonb,text,text,text)','EXECUTE')and has_function_privilege('cuevo_api','internal.read_school_account_invitations(integer,uuid)','EXECUTE')and has_function_privilege('cuevo_api','internal.revoke_school_account_invitation(uuid,jsonb,text,text,text)','EXECUTE'),'only the three protected source entrypoints are granted to API');
select ok(not has_function_privilege('cuevo_worker','internal.create_school_account_invitation(jsonb,text,text,text)','EXECUTE')and not has_function_privilege('authenticated','internal.read_school_account_invitations(integer,uuid)','EXECUTE')and not has_function_privilege('service_role','internal.revoke_school_account_invitation(uuid,jsonb,text,text,text)','EXECUTE'),'worker and Data API cannot invoke invitation management');

create temporary table account_source_ids(kind text primary key,receipt jsonb not null);
grant select,insert,update on account_source_ids to cuevo_api;
set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"new@example.test","role":"student","reason":"Reviewed synthetic source","confirmInvitation":true}', 'source-disabled-0001',repeat('a',64),'source-test')$$,'42501',null,'disabled runtime denies before storing any request');
select throws_ok($$select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','API must not activate',0,true)$$,'42501',null,'ordinary API cannot configure operator runtime control');
reset role;
select is((select count(*)from internal.school_account_requests),0::bigint,'disabled requests have no persisted intent');
select throws_ok($$select internal.configure_local_school_account_runtime(true,0::oid,'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','Wrong database',0,true)$$,'42501',null,'operator approval is bound to exact current database identity');
select throws_ok($$select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),'other','20000000-0000-4000-8000-000000000001','Wrong project',0,true)$$,'42501',null,'operator approval does not admit another project');
select throws_ok($$select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','No confirmation',0,false)$$,'42501',null,'operator approval requires deliberate confirmation');
select is(internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','Explicit disposable synthetic source verification',0,true),1,'exact owner approval creates its first immutable control revision');

set local role cuevo_api;
insert into account_source_ids values('first',internal.create_school_account_invitation('{"displayName":"New learner","email":"NEW.Learner@Example.test","role":"student","reason":"Reviewed synthetic source","confirmInvitation":true}', 'source-invite-0001',repeat('a',64),'source-test'));
select is((select receipt->>'status'from account_source_ids where kind='first'),'REQUESTED','create confirms an invitation source without claiming provider or delivery success');
select is(internal.create_school_account_invitation('{"displayName":"New learner","email":"NEW.Learner@Example.test","role":"student","reason":"Reviewed synthetic source","confirmInvitation":true}', 'source-invite-0001',repeat('a',64),'source-replay'),(select receipt from account_source_ids where kind='first'),'same original command returns its exact admitted receipt');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"Different","email":"new@example.test","role":"student","reason":"Changed","confirmInvitation":true}', 'source-invite-0001',repeat('b',64),'source-test')$$,'22023',null,'changed payload fingerprint cannot reuse the original source key');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"new.learner@example.test","role":"student","reason":"Duplicate active recipient","confirmInvitation":true}', 'source-duplicate-0001',repeat('b',64),'source-test')$$,'22023',null,'same normalized current recipient cannot create an active duplicate request');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"other@example.test","role":"student","reason":"Extra privileges","confirmInvitation":true,"entitlements":["all"]}', 'source-extra-0001',repeat('b',64),'source-test')$$,'22023',null,'invitation source rejects unknown privilege fields');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"other@example.test","role":"student","reason":"Unconfirmed"}', 'source-unconfirmed-0001',repeat('b',64),'source-test')$$,'22023',null,'source repeats human confirmation independently of API schema');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":" other@example.test","role":"student","reason":"Bad email","confirmInvitation":true}', 'source-email-0001',repeat('b',64),'source-test')$$,'22023',null,'source recipient cannot hide whitespace normalization');
select throws_ok($$select internal.read_school_account_invitations(26,null)$$,'22023',null,'read refuses a page wider than25');
select throws_ok($$select internal.read_school_account_invitations(25,'19700000-0000-4000-8000-000000000099')$$,'42501',null,'arbitrary cursor cannot imply an authorized source position');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"Teacher denied","email":"teacher-denied@example.test","role":"student","reason":"No admin scope","confirmInvitation":true}', 'source-teacher-0001',repeat('c',64),'source-test')$$,'42501',null,'teacher cannot invite or change school role');
select throws_ok($$select internal.read_school_account_invitations(25,null)$$,'42501',null,'teacher cannot enumerate recipient emails');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.read_school_account_invitations(25,null)$$,'42501',null,'parent cannot enumerate invitation sources');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"Student denied","email":"student-denied@example.test","role":"student","reason":"No admin approval","confirmInvitation":true}', 'source-student-0001',repeat('c',64),'source-test')$$,'42501',null,'student cannot approve invitation source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000002',true);
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"Coordinator denied","email":"coordinator-denied@example.test","role":"student","reason":"No admin approval","confirmInvitation":true}', 'source-coordinator-0001',repeat('c',64),'source-test')$$,'42501',null,'coordinator cannot approve a school account role');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
reset role;
select is((select email from internal.school_account_requests where id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),'new.learner@example.test','source normalizes the approved email once for exact provider use');
select is((select extract(epoch from(expires_at-created_at))::bigint from internal.school_account_requests where id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),604800::bigint,'expiry is an exact168hours and not repriced on reads');
select is((select count(*)from internal.school_account_request_revisions where request_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),1::bigint,'original intent has one immutable source revision');
select is((select count(*)from app.memberships where actor_id=(select provider_user_id from internal.school_account_requests where id=(select(receipt->>'id')::uuid from account_source_ids where kind='first'))),0::bigint,'provider UUID is reserved without pending membership authority');
select is((select count(*)from auth.users where id=(select provider_user_id from internal.school_account_requests where id=(select(receipt->>'id')::uuid from account_source_ids where kind='first'))),0::bigint,'source creation does not provision an Auth account');
select is((select count(*)from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),1::bigint,'source and one reserved Auth event commit together');
select ok(not exists(select 1 from internal.audit_events where action='school.account.invited'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')and metadata::text~'learner|example|email|token|secret'),'invitation audit contains no recipient content or credential');
select is((select metadata from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),'{"requestRevision":1}'::jsonb,'reserved event includes only exact request revision metadata');
select throws_ok($$update internal.school_account_request_revisions set reason='Changed history'where request_id=(select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='first')$$,'55000',null,'immutable approved revision cannot be edited');
select throws_ok($$delete from internal.school_account_request_revisions where request_id=(select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='first')$$,'55000',null,'immutable approved revision cannot be deleted');
select throws_ok($$update internal.school_account_requests set email='different@example.test'where id=(select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='first')$$,'55000',null,'current pointer cannot rewrite approved recipient intent');

update app.people set synthetic=false where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"Mixed denied","email":"mixed@example.test","role":"student","reason":"Mixed population","confirmInvitation":true}', 'source-mixed-0001',repeat('c',64),'source-test')$$,'42501',null,'mixed real/synthetic school denies source creation');
reset role;
update app.people set synthetic=true where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
update app.entitlements set enabled=false where school_id='10000000-0000-4000-8000-000000000001'and code='school.operations';
set local role cuevo_api;
select throws_ok($$select internal.read_school_account_invitations(25,null)$$,'42501',null,'current entitlement loss denies source listing');
reset role;
update app.entitlements set enabled=true where school_id='10000000-0000-4000-8000-000000000001'and code='school.operations';

set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select internal.read_school_account_invitations(25,null)$$,'42501',null,'admin actor cannot select another school by header');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000132',true);
insert into account_source_ids values('foreign',internal.create_school_account_invitation('{"displayName":"Isolation learner","email":"isolation@example.test","role":"student","reason":"Reviewed isolation source","confirmInvitation":true}', 'source-isolation-0001',repeat('c',64),'source-test'));
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select internal.read_school_account_invitations(25,(select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='foreign'))$$,'42501',null,'cursor from another school is denied independently of membership header');
select throws_ok($$select internal.revoke_school_account_invitation((select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='first'),'{"expectedRevision":2,"reason":"Stale cancellation","confirmRevocation":true}','source-revoke-stale-0001',repeat('d',64),'source-test')$$,'22023',null,'stale cancellation cannot change the current invitation');
insert into account_source_ids values('revoked',internal.revoke_school_account_invitation((select(receipt->>'id')::uuid from account_source_ids where kind='first'),'{"expectedRevision":1,"reason":"Recipient cancellation reviewed","confirmRevocation":true}','source-revoke-0001',repeat('d',64),'source-test'));
select is((select receipt->>'status'from account_source_ids where kind='revoked'),'REVOKED','revocation is an explicit immutable request outcome');
select is((select(receipt->>'revision')::integer from account_source_ids where kind='revoked'),2,'revocation advances request source revision');
select is(internal.revoke_school_account_invitation((select(receipt->>'id')::uuid from account_source_ids where kind='first'),'{"expectedRevision":1,"reason":"Recipient cancellation reviewed","confirmRevocation":true}','source-revoke-0001',repeat('d',64),'source-replay'),(select receipt from account_source_ids where kind='revoked'),'original cancellation key reconciles its same current revoked source');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"NEW.Learner@Example.test","role":"student","reason":"Reviewed synthetic source","confirmInvitation":true}', 'source-invite-0001',repeat('a',64),'source-replay')$$,'42501',null,'revoked original invitation cannot replay as active admission');
reset role;
select is((select count(*)from internal.school_account_request_revisions where request_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),2::bigint,'revocation preserves the original and cancellation history');
select is((select count(*)from internal.outbox_events where type='school.account.invitation_revoked'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),1::bigint,'revocation emits one distinct source lifecycle event');
select is((select state from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),'COMPLETED','untouched exact pending Auth source gets a terminal cancellation');
select is((select last_error_code from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first')),'REQUEST_REVOKED','terminal Auth cancellation records its truthful reason rather than delivered mail');
create temporary table account_lifecycle_claim(id uuid,lease_token uuid);
grant select,insert on account_lifecycle_claim to cuevo_worker;
set local role cuevo_worker;
insert into account_lifecycle_claim select id,lease_token from internal.claim_outbox(100,30);
reset role;
delete from account_lifecycle_claim where id not in(select id from internal.outbox_events where type='school.account.invitation_revoked'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='first'));
select is((select count(*)from account_lifecycle_claim),1::bigint,'worker claimed the exact known revoked lifecycle source');
set local role cuevo_worker;
select lives_ok($$select internal.process_learner_event((select id from pg_temp.account_lifecycle_claim),(select lease_token from pg_temp.account_lifecycle_claim))$$,'worker acknowledges an exact immutable revocation source without Auth execution');
reset role;
select is((select state from internal.outbox_events where id=(select id from account_lifecycle_claim)),'COMPLETED','known lifecycle acknowledgment completes only its own source');
select is((select count(*)from internal.processed_events where event_id=(select id from account_lifecycle_claim)),1::bigint,'known lifecycle acknowledgment has its exact processed receipt');

-- A separately admitted Auth effect is never fabricated as cancelled/delivered by source revoke.
set local role cuevo_api;
insert into account_source_ids values('inflight',internal.create_school_account_invitation('{"displayName":"In-flight learner","email":"inflight@example.test","role":"student","reason":"Independent lease fixture","confirmInvitation":true}', 'source-inflight-0001',repeat('f',64),'source-test'));
reset role;
update internal.outbox_events set state='PROCESSING',attempt_count=1,lease_token='19700000-0000-4000-8000-000000000098',lease_until=clock_timestamp()+interval'60 seconds'
where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='inflight');
set local role cuevo_api;
select lives_ok($$select internal.revoke_school_account_invitation((select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='inflight'),'{"expectedRevision":1,"reason":"Stop after admission","confirmRevocation":true}','source-inflight-revoke-0001',repeat('f',64),'source-test')$$,'current request can revoke its future claim while an effect is in flight');
reset role;
select is((select state from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='inflight')),'PROCESSING','in-flight Auth state stays owned by its executor after source revocation');
select is((select lease_token from internal.outbox_events where type='school.account.provisioning_requested'and entity_id=(select(receipt->>'id')::uuid from account_source_ids where kind='inflight')),'19700000-0000-4000-8000-000000000098'::uuid,'source revocation cannot overwrite an admitted Auth lease');

-- A forged lifecycle actor cannot acknowledge another source even with a current lease.
insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,attempt_count,lease_token,lease_until)
values('10000000-0000-4000-8000-000000000001','19700000-0000-4000-8000-000000000090','20000000-0000-4000-8000-000000000004','school.account.invitation_revoked','school_account_request',(select(receipt->>'id')::uuid from account_source_ids where kind='first'),2,'{"requestRevision":2}','source-forged-revoke','PROCESSING',1,'19700000-0000-4000-8000-000000000091',clock_timestamp()+interval'60 seconds');
set local role cuevo_worker;
select throws_ok($$select internal.process_learner_event('19700000-0000-4000-8000-000000000090','19700000-0000-4000-8000-000000000091')$$,'22023',null,'forged lifecycle actor cannot acknowledge approved revocation history');
reset role;
select is((select count(*)from internal.processed_events where event_id='19700000-0000-4000-8000-000000000090'),0::bigint,'forged lifecycle source has no processed receipt');

-- The normal page limit is exercised with26 actual distinct approved source requests.
set local role cuevo_api;
do $$declare i integer;begin for i in 1..26 loop
 perform internal.create_school_account_invitation(jsonb_build_object('displayName','Page learner '||i,'email','page-'||i||'@example.test','role','student','reason','Bounded synthetic page source','confirmInvitation',true),'source-page-'||i,repeat('e',64),'source-test');
end loop;end$$;
insert into account_source_ids values('page',internal.read_school_account_invitations(25,null));
select is(jsonb_array_length((select receipt->'items'from account_source_ids where kind='page')),25,'ordinary page returns exactly25 admitted source rows');
select ok((select receipt->>'nextCursor'from account_source_ids where kind='page')is not null,'sentinel preserves continuation instead of claiming complete list');
select ok(jsonb_array_length(internal.read_school_account_invitations(25,(select(receipt->>'nextCursor')::uuid from account_source_ids where kind='page'))->'items')>0,'exact admitted page cursor reaches remaining source rows');
select ok(not exists(select 1 from jsonb_array_elements((select receipt->'items'from account_source_ids where kind='page'))item where item? 'admissionSecret'or item? 'tokenDigest'or item? 'providerKey'),'admin page includes no secret or token digest');
reset role;
select ok((select bool_and(revision.intent_snapshot=internal.school_account_intent(request))from internal.school_account_request_revisions revision join internal.school_account_requests request on request.id=revision.request_id),'every immutable revision pins exact approved source intent');

-- Membership revision invalidation is monotonic; never reset it to resurrect old approval.
update app.memberships set role='admin'where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000001';
set local role cuevo_api;
select throws_ok($$select internal.revoke_school_account_invitation((select(receipt->>'id')::uuid from pg_temp.account_source_ids where kind='first'),'{"expectedRevision":1,"reason":"Recipient cancellation reviewed","confirmRevocation":true}','source-revoke-0001',repeat('d',64),'source-replay')$$,'42501',null,'changed approving membership revision denies original-key source reconciliation');
reset role;
select throws_ok($$update internal.school_account_runtime_revisions set reason='Changed approval'where revision=1$$,'55000',null,'operator runtime approval history remains immutable');
select is(internal.configure_local_school_account_runtime(false,(select oid from pg_catalog.pg_database where datname=current_database()),'LOCAL_CUEVO','20000000-0000-4000-8000-000000000001','Pause synthetic provisioning',1,true),2,'operator pause records a distinct immutable control revision');
set local role cuevo_api;
select throws_ok($$select internal.read_school_account_invitations(25,null)$$,'42501',null,'operator pause denies even an existing authorized source read');
select throws_ok($$select internal.create_school_account_invitation('{"displayName":"New learner","email":"NEW.Learner@Example.test","role":"student","reason":"Reviewed synthetic source","confirmInvitation":true}', 'source-invite-0001',repeat('a',64),'source-replay')$$,'42501',null,'disabled control denies original invitation key replay');
reset role;
select *from finish();
rollback;
