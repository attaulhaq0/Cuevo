-- Application contracts only. No Cron extension, schedule, driver execution or
-- provider operation is needed. All fixtures and temporary grants roll back.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role,cuevo_api,cuevo_worker;
set local search_path=extensions,pg_catalog;
select no_plan();

create temporary table sql_cron_original_control as
 select to_jsonb(control)as record from internal.worker_dispatch_control control where singleton;
select is((select count(*)from sql_cron_original_control),1::bigint,
 'the original singleton exists before contract fixtures');

-- Missing production code is a TAP failure, rather than a test-suite abort.
-- This helper calls the actual classifier; it never supplies its implementation.
create function pg_temp.sql_receipt_outcome(receipt jsonb)returns text
language plpgsql set search_path=''as $$declare outcome text;begin
 if to_regprocedure('internal.sql_processing_receipt_outcome(jsonb)')is null then return null;end if;
 execute 'select internal.sql_processing_receipt_outcome($1)'into outcome using receipt;
 return outcome;
end$$;

select ok(to_regprocedure('internal.sql_processing_receipt_outcome(jsonb)')is not null,
 'the actual private SQL processing receipt classifier exists');

-- Literal expectations come from the canonical receipt protocol. A widened
-- status/shape, an unsafe award count, or a guessed missing receipt must fail.
select is(pg_temp.sql_receipt_outcome(receipt),expected,description)
from(values
 (1,'{"status":"ACKNOWLEDGED"}'::jsonb,'COMPLETED','exact acknowledgement confirms its documented event semantics'),
 (2,'{"status":"DUPLICATE"}'::jsonb,'COMPLETED','exact event duplicate is a recognized acknowledgement'),
 (3,'{"status":"DUPLICATE_SOURCE"}'::jsonb,'COMPLETED','exact source duplicate is a recognized acknowledgement'),
 (4,'{"status":"COMPLETED"}'::jsonb,'COMPLETED','exact completion receipt is recognized'),
 (5,'{"status":"PLANNED"}'::jsonb,'COMPLETED','exact planning receipt is recognized'),
 (6,'{"status":"REFRESHED"}'::jsonb,'COMPLETED','exact refresh receipt is recognized'),
 (7,'{"status":"NO_SOURCE"}'::jsonb,'COMPLETED','exact no-source receipt is recognized without inventing a source'),
 (8,'{"status":"SUPERSEDED"}'::jsonb,'COMPLETED','exact supersession receipt is recognized'),
 (9,'{"status":"WAITING"}'::jsonb,'WAITING','waiting remains deferred instead of completed'),
 (10,'{"status":"REQUIRES_REVIEW"}'::jsonb,'REQUIRES_REVIEW','review remains review instead of completed'),
 (11,'{"status":"PROCESSED","learnerId":"22200000-0000-4000-8000-000000000001"}'::jsonb,'COMPLETED','processed receipt requires a complete UUID learner identity'),
 (12,'{"status":"PROCESSED","learnerId":"ABCDEF12-ABCD-4ABC-8ABC-ABCDEF123456"}'::jsonb,'COMPLETED','canonical UUID recognition is case insensitive'),
 (13,'{"status":"AWARDED","awards":0}'::jsonb,'COMPLETED','zero earned awards is an explicit valid count'),
 (14,'{"status":"AWARDED","awards":1}'::jsonb,'COMPLETED','positive integer award count is recognized'),
 (15,'{"status":"AWARDED","awards":9007199254740991}'::jsonb,'COMPLETED','largest canonical safe integer award count is recognized'),
 (16,'{"status":"AWARDED","awards":1.0}'::jsonb,'COMPLETED','integer-valued JSON number retains canonical numeric semantics'),
 (17,'{"status":"ACKNOWLEDGED_DISABLED","awards":0}'::jsonb,'COMPLETED','disabled recognition requires an explicit zero award count'),
 (18,null::jsonb,'PROCESSING_RECEIPT_UNKNOWN','SQL NULL receipt remains unknown'),
 (19,'null'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','JSON null receipt remains unknown'),
 (20,'[]'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','array receipt is not an acknowledgement'),
 (21,'[{"status":"COMPLETED"}]'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','an acknowledgement wrapped in an array remains unknown'),
 (22,'"COMPLETED"'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','string receipt is not an acknowledgement'),
 (23,'1'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','numeric receipt is not an acknowledgement'),
 (24,'false'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','boolean receipt is not an acknowledgement'),
 (25,'{}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','missing status remains unknown'),
 (26,'{"status":null}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','null status remains unknown'),
 (27,'{"status":true}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','non-string status remains unknown'),
 (28,'{"status":"UNKNOWN_STATUS"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','unrecognized status cannot confirm effects'),
 (29,'{"status":"completed"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','status protocol is case sensitive'),
 (30,'{"status":"COMPLETED","extra":null}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','extra acknowledgement field remains unknown even when null'),
 (31,'{"status":"WAITING","extra":1}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','extra waiting field cannot bypass exact receipt shape'),
 (32,'{"status":"REQUIRES_REVIEW","reason":"fixture"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','extra review field cannot bypass exact receipt shape'),
 (33,'{"status":"PROCESSED"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','missing learner identity cannot confirm processing'),
 (34,'{"status":"PROCESSED","learnerId":null}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','null learner identity remains unknown'),
 (35,'{"status":"PROCESSED","learnerId":222}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','numeric learner identity remains unknown'),
 (36,'{"status":"PROCESSED","learnerId":"22200000"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','shortened learner identity remains unknown'),
 (37,'{"status":"PROCESSED","learnerId":"22200000-0000-4000-8000-00000000000z"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','non-hex learner UUID remains unknown'),
 (38,'{"status":"PROCESSED","learnerId":"22200000-0000-4000-8000-000000000001","awards":0}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','processed receipt rejects an additional award field'),
 (39,'{"status":"AWARDED"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','missing award count remains unknown instead of zero'),
 (40,'{"status":"AWARDED","awards":null}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','null award count remains unknown instead of zero'),
 (41,'{"status":"AWARDED","awards":"0"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','string award count is not coerced to a number'),
 (42,'{"status":"AWARDED","awards":false}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','boolean award count is not coerced to zero'),
 (43,'{"status":"AWARDED","awards":-1}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','negative award count is rejected'),
 (44,'{"status":"AWARDED","awards":0.5}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','fractional award count is rejected'),
 (45,'{"status":"AWARDED","awards":9007199254740992}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','first unsafe integer award count is rejected'),
 (46,'{"status":"AWARDED","awards":1,"extra":true}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','award receipt rejects extra fields'),
 (47,'{"status":"ACKNOWLEDGED_DISABLED","awards":1}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','disabled receipt cannot acknowledge positive awards'),
 (48,'{"status":"ACKNOWLEDGED_DISABLED","awards":-1}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','disabled receipt cannot acknowledge negative awards'),
 (49,'{"status":"ACKNOWLEDGED_DISABLED","awards":"0"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','disabled receipt requires numeric zero'),
 (50,'{"status":"ACKNOWLEDGED_DISABLED"}'::jsonb,'PROCESSING_RECEIPT_UNKNOWN','disabled receipt cannot guess a missing zero count')
)as cases(ordinal,receipt,expected,description)
order by ordinal;

-- Metadata determines whether PostgreSQL permits transaction control, and
-- effective ACL checks include inherited and PUBLIC grants for every actor.
create temporary table sql_cron_private_routines(signature text primary key,kind text);
insert into sql_cron_private_routines values
 ('internal.sql_processing_receipt_outcome(jsonb)','f'),
 ('internal.run_sql_worker(bigint)','p'),
 ('internal.rehearse_sql_cron_commit_timeout(text)','p'),
 ('internal.guard_runtime_extension_management()','f'),
 ('internal.worker_transport_boundary_private(boolean)','f'),
 ('internal.send_worker_wake_before_sql(uuid,text,text)','f'),
 ('internal.request_worker_wake_before_sql()','f'),
 ('internal.sql_worker_transport_private()','f'),
 ('internal.worker_transport_status_v2()','f'),
 ('internal.prepare_sql_cron_transport(text)','f'),
 ('internal.configure_sql_worker(bigint,bigint,bigint,text)','f'),
 ('internal.pause_sql_worker(bigint,text)','f'),
 ('internal.resume_sql_worker(bigint,bigint,bigint,text)','f');

select is((select prokind::text from pg_proc where oid=to_regprocedure(expected.signature)),expected.kind,
 expected.signature||' exists with the intended routine kind')
from sql_cron_private_routines expected order by signature;
select is((select prosecdef from pg_proc where oid=to_regprocedure('internal.run_sql_worker(bigint)')),false,
 'SQL phase driver is an invoker procedure so top-level COMMIT is permitted');
select is((select proconfig from pg_proc where oid=to_regprocedure('internal.run_sql_worker(bigint)')),null::text[],
 'SQL phase driver has no procedure SET clause that would prohibit COMMIT');
select is((select prosecdef from pg_proc where oid=to_regprocedure('internal.rehearse_sql_cron_commit_timeout(text)')),false,
 'native timeout rehearsal is an invoker procedure');
select is((select proconfig from pg_proc where oid=to_regprocedure('internal.rehearse_sql_cron_commit_timeout(text)')),null::text[],
 'native timeout rehearsal has no procedure SET clause');

select ok(not coalesce(has_function_privilege(actor.oid,to_regprocedure(expected.signature),'EXECUTE'),true),
 actor.rolname||' cannot execute '||expected.signature)
from sql_cron_private_routines expected cross join pg_roles actor
where actor.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')
order by expected.signature,actor.rolname;
select ok(to_regprocedure(expected.signature)is not null and not exists(
 select 1 from pg_proc routine cross join lateral
 aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))permission
 where routine.oid=to_regprocedure(expected.signature)and permission.grantee=0 and permission.privilege_type='EXECUTE'),
 'PUBLIC cannot execute '||expected.signature)
from sql_cron_private_routines expected order by signature;
select ok(not has_table_privilege(actor.oid,'internal.worker_dispatch_control','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege(actor.oid,'internal.worker_dispatch_control','SELECT,INSERT,UPDATE,REFERENCES'),
 actor.rolname||' gains no raw SQL transport control access')
from pg_roles actor where actor.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker')order by actor.rolname;

-- Exercise actual permission denials, using invalid procedure arguments so a
-- mistaken grant cannot enter a native phase or write a rehearsal marker.
set local role anon;
select throws_ok($$select internal.sql_processing_receipt_outcome('{"status":"COMPLETED"}'::jsonb)$$,'42501',null,'anonymous browser cannot classify private processing receipts');
select throws_ok($$call internal.run_sql_worker(null::bigint)$$,'42501',null,'anonymous browser cannot run a SQL worker phase');
select throws_ok($$call internal.rehearse_sql_cron_commit_timeout(null::text)$$,'42501',null,'anonymous browser cannot run the native rehearsal');
reset role;
set local role authenticated;
select throws_ok($$select internal.sql_processing_receipt_outcome('{"status":"COMPLETED"}'::jsonb)$$,'42501',null,'authenticated browser cannot classify private processing receipts');
select throws_ok($$call internal.run_sql_worker(null::bigint)$$,'42501',null,'authenticated browser cannot run a SQL worker phase');
select throws_ok($$call internal.rehearse_sql_cron_commit_timeout(null::text)$$,'42501',null,'authenticated browser cannot run the native rehearsal');
reset role;
set local role service_role;
select throws_ok($$select internal.sql_processing_receipt_outcome('{"status":"COMPLETED"}'::jsonb)$$,'42501',null,'service role cannot classify private processing receipts');
select throws_ok($$call internal.run_sql_worker(null::bigint)$$,'42501',null,'service role cannot run a SQL worker phase');
select throws_ok($$call internal.rehearse_sql_cron_commit_timeout(null::text)$$,'42501',null,'service role cannot run the native rehearsal');
reset role;
set local role cuevo_api;
select throws_ok($$select internal.sql_processing_receipt_outcome('{"status":"COMPLETED"}'::jsonb)$$,'42501',null,'application API cannot classify private processing receipts');
select throws_ok($$call internal.run_sql_worker(null::bigint)$$,'42501',null,'application API cannot run a SQL worker phase');
select throws_ok($$call internal.rehearse_sql_cron_commit_timeout(null::text)$$,'42501',null,'application API cannot run the native rehearsal');
reset role;
set local role cuevo_worker;
select throws_ok($$select internal.sql_processing_receipt_outcome('{"status":"COMPLETED"}'::jsonb)$$,'42501',null,'restricted worker cannot classify private SQL transport receipts');
select throws_ok($$call internal.run_sql_worker(null::bigint)$$,'42501',null,'restricted worker cannot run a SQL worker phase');
select throws_ok($$call internal.rehearse_sql_cron_commit_timeout(null::text)$$,'42501',null,'restricted worker cannot run the native rehearsal');
reset role;

-- Test deployed defaults and CHECK constraints on a temporary LIKE table, so
-- this suite works even when the actual singleton has an operator configuration.
create temporary table sql_cron_default_control
 (like internal.worker_dispatch_control including defaults including constraints);
insert into sql_cron_default_control default values;
select is((select to_jsonb(control)->>'transport_version'from sql_cron_default_control control),'1',
 'fresh control defaults to the existing transport version');
select is((select to_jsonb(control)->>'transport_mode'from sql_cron_default_control control),'PG_NET_EDGE_V1',
 'fresh control retains existing mode until an explicit operator preparation');
select is((select to_jsonb(control)->>'sql_enabled'from sql_cron_default_control control),'false',
 'source installation cannot silently enable SQL execution');
select is((select to_jsonb(control)->>'enabled'from sql_cron_default_control control),'false',
 'source installation cannot silently enable legacy dispatch');
select is((select to_jsonb(control)->>'sql_phase'from sql_cron_default_control control),'IDLE',
 'fresh SQL control has no admitted phase');
select is((select to_jsonb(control)->'sql_event_id'from sql_cron_default_control control),'null'::jsonb,
 'fresh SQL control has no event pointer');
select is((select to_jsonb(control)->'sql_lease_token'from sql_cron_default_control control),'null'::jsonb,
 'fresh SQL control has no canonical lease token');
select is((select to_jsonb(control)->'sql_deadline'from sql_cron_default_control control),'null'::jsonb,
 'fresh SQL control has no invented processing deadline');
select is((select to_jsonb(control)->'sql_job_id'from sql_cron_default_control control),'null'::jsonb,
 'fresh SQL control has no invented Cron job');
select is((select to_jsonb(control)->'sql_operation_sha256'from sql_cron_default_control control),'null'::jsonb,
 'fresh SQL control has no invented operator operation');
select throws_ok($$update pg_temp.sql_cron_default_control set sql_enabled=true$$,'23514',null,
 'unconfigured mode one cannot enable SQL execution');
select throws_ok($$update pg_temp.sql_cron_default_control set sql_phase='CLAIMED'$$,'23514',null,
 'claimed phase requires an actual event, token and original deadline');

select is((select to_jsonb(control)from internal.worker_dispatch_control control where singleton),
 (select record from sql_cron_original_control),
 'receipt, permission and default fixtures preserve the actual singleton');
select*from finish();
rollback;
