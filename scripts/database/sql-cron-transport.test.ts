import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const path='supabase/migrations/20261015110814_sql_cron_managed_transport.sql';
const source=readFileSync(path,'utf8');
const section=(name:string)=>{const marker='-- '+name+'\n',start=source.indexOf(marker);assert(start>=0);const rest=source.slice(start+marker.length),next=rest.search(/\n-- \d{2}-[^\n]+\.sql\n/);return next<0?rest:rest.slice(0,next);};
const guard=source.split('$guard$')[1];
const driver=source.split('$driver$')[1];
const probe=source.split('$probe$')[1];

test('append-only source introduces no extension retirement, role default or scheduled execution',()=>{
 assert(source.length>10000);assert(!source.includes('\r'));
 const executable=source.replace(/^\s*--.*$/gm,'');
 assert.doesNotMatch(executable,/^\s*(?:create|drop|alter)\s+extension\b|^\s*alter\s+role\b|\bcron\.(?:schedule|alter_job|unschedule)\s*\(/im);
 assert.equal((executable.match(/\bcreate\s+table\b/gi)??[]).length,0);
 assert.match(source,/sql_enabled boolean not null default false/);
 assert.match(source,/transport_mode text not null default'PG_NET_EDGE_V1'/);
 assert.match(source,/sql_event_id uuid references internal\.outbox_events\(id\)/);
});

test('refusal callback binds original session and role without grant repair or current-user elevation',()=>{
 assert.match(guard,/session_user in\('postgres','supabase_admin'\)/);
 assert.match(guard,/coalesce\(original_role,'none'\) in\('none','postgres','supabase_admin'\)/);
 assert.doesNotMatch(guard.replace(/^\s*--.*$/gm,''),/\bcurrent_user\b|\b(?:grant|revoke|set_config)\b|alter\s+owner/i);
 assert.match(guard,/errcode='42501'/);
 for(const tag of ['CREATE EXTENSION','ALTER EXTENSION','DROP EXTENSION'])assert(source.includes("'"+tag+"'"));
 assert(source.includes("md5(p.prosrc)='"+createHash('md5').update(guard).digest('hex')+"'"));
});

test('reserved-role skip has explicit managed NOLOGIN and custom nonreserved SET-closure contracts',()=>{
 assert(source.includes("regexp_replace(btrim(value),'\\*$','')"));
 assert(source.includes("rolname=role_name and not rolcanlogin"));
 assert(source.includes('not role_name=any(reserved_roles)'));
 assert.match(source,/recursive runtime_roles[\s\S]*rolname in\('cuevo_api','cuevo_worker'\)[\s\S]*rolname=any\(reserved_roles\)/);
 assert.match(source,/Managed reserved-role event-trigger callbacks are intentionally skipped/);
 assert(source.includes('This does not prove external Data API isolation.'));
});

test('guard bypass settings include current/reset, original LOGIN defaults and both parameter permissions',()=>{
 assert(source.includes("name='session_replication_role'\n   and setting='origin'and reset_val='origin'"));
 assert(source.includes("name='event_triggers'and setting='on'and reset_val='on'"));
 assert.match(source,/recursive login_paths[\s\S]*m\.member[\s\S]*m\.roleid/);
 for(const parameter of ['session_replication_role','event_triggers'])for(const permission of ['SET','ALTER SYSTEM'])assert(source.includes("has_parameter_privilege(principal,'"+parameter+"','"+permission+"')"));
 for(const parameter of ['session_replication_role','event_triggers'])for(const permission of ['SET','ALTER SYSTEM'])assert(source.includes("has_parameter_privilege(original_login.oid,'"+parameter+"','"+permission+"')"));
 assert(source.includes("value<>'event_triggers=on'"));
 assert(source.includes("value<>'session_replication_role=origin'"));
});

test('managed Cron uses effective schema reachability while Vault retains strict raw ACL rules',()=>{
 assert(source.includes("case when retired then array['vault']else array['net','vault']end"));
 assert.match(source,/recursive cron_actors[\s\S]*'service_role','authenticator'[\s\S]*has_schema_privilege\(principal,to_regnamespace\('cron'\),'USAGE,CREATE'\)/);
 assert(source.includes("polrelid=to_regclass(required_name)and polcmd in('r','*')"));
 assert(source.includes("(username = CURRENT_USER)"));
 assert(source.includes("extname='pg_cron'and extversion='1.6.4'"));
 assert(source.includes("p.proowner<>(select oid from pg_roles where rolname='supabase_admin')or p.prosecdef"));
 for(const token of ['vault.decrypted_secrets','has_any_column_privilege','has_sequence_privilege','aclexplode','MAINTAIN','realtime_helper'])assert(source.includes(token));
 assert(source.includes("transport_version=1 and transport_mode='PG_NET_EDGE_V1'"));
 assert(source.includes("externalAcceptance','UNOBSERVED'"));
});

test('driver keeps canonical authority and a fresh five-second invoker CALL per phase',()=>{
 assert.match(source,/create procedure internal\.run_sql_worker\(expected_generation bigint\)\nlanguage plpgsql security invoker as \$driver\$/);
 assert.match(driver,/expected_generation is null or expected_generation<1/);
 assert(driver.includes('1000<>5000'));
 assert(driver.includes('internal.claim_outbox(1,30,expected_generation)'));
 assert(driver.includes("internal.outbox_event_owner(held.type)<>'WORKER'"));
 assert.doesNotMatch(driver,/update\s+internal\.outbox_events|net\.|posthog.*(?:claim|capture)|when\s+query_canceled\s+then/i);
 assert(driver.indexOf("window_end:=clock_timestamp()+interval'20 seconds'")<driver.indexOf('internal.claim_outbox'));
 assert(driver.includes("interval'15 seconds'"));
 assert(driver.includes('sql_phase_started_at=null,sql_failure_started_at=null'));
 for(const [phase,call] of [['PROCESSING','receipt:=internal.process_learner_event'],['FAILING','acknowledged:=internal.fail_outbox']]){
  const start=driver.indexOf("sql_phase='"+phase+"'");assert(start>=0);assert(driver.indexOf('commit;',start)<driver.indexOf(call));
 }
 assert(driver.includes("in('PROCESSING','FAILING','UNKNOWN')"));
 assert(driver.includes("outcome='PROCESSING_RECEIPT_UNKNOWN'"));
 assert(driver.includes('held.lease_token is distinct from control.sql_lease_token'));
});

test('configuration keeps positive original generation, held leases and private readiness on activation',()=>{
 const config=section('05-truthful-sql-configuration-v2.sql');
 assert.equal((config.match(/if not found then return false/g)??[]).length,4);
 assert.equal((config.match(/current_setting\('role'\)not in\('none','postgres'\)/g)??[]).length,4);
 assert(config.includes('previous_generation=9223372036854775807'));
 assert(config.includes('lease_until>clock_timestamp()'));
 assert(config.includes('if internal.sql_worker_transport_private()is not true then raise exception'));
 assert(source.includes("schedule='1 second'and command='CALL internal.run_sql_worker('||control.execution_generation::text||');'"));
});

test('mode1 preserves original sender and mode2 returns a committed hint without invented network receipt',()=>{
 const wake=section('06-retired-wake-v2.sql');
 assert(wake.includes('internal.send_worker_wake_before_sql(target_wake,target_endpoint,target_secret_name)'));
 assert(wake.includes('internal.request_worker_wake_before_sql()'));
 assert(wake.includes('then return null;'));
 assert(wake.includes('sql_hint_at=clock_timestamp()'));
 assert.doesNotMatch(wake,/net\.http_post|return\s+[1-9][0-9]*\s*;/i);
 assert(wake.includes("pg_get_functiondef('internal.outbox_worker_wake_trigger()'::regprocedure)"));
});

test('native mechanics probe keeps original start, commits A and requires cumulative timeout before B',()=>{
 assert.match(source,/create procedure internal\.rehearse_sql_cron_commit_timeout\(operation_sha256 text\)\nlanguage plpgsql security invoker as \$probe\$/);
 assert(probe.includes('started_at:=statement_timestamp()'));
 assert(probe.indexOf('sql_rehearsal_started_at=started_at')<probe.indexOf('commit;'));
 assert(probe.includes('pg_sleep(2)'));assert(probe.includes('pg_sleep(4)'));
 assert(probe.indexOf('sql_rehearsal_a_at=clock_timestamp()')<probe.indexOf('pg_sleep(4)'));
 assert(probe.includes('sql_rehearsal_started_at is not null'));
 assert.doesNotMatch(probe,/security definer|exception\s+when|set_config|\bset\s+statement_timeout/i);
});
