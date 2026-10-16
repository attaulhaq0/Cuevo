begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,pg_catalog;
select plan(6);
select ok(to_regprocedure('internal.send_worker_wake_before_sql(uuid,text,text)')is not null,'the preserved network sender exists for its original delivery budget');
select ok(to_regprocedure('internal.request_worker_wake_before_sql()')is not null,'the preserved pause-aware request wrapper exists');
select ok(position('timeout_milliseconds:=30000' in pg_get_functiondef(to_regprocedure('internal.send_worker_wake_before_sql(uuid,text,text)')))>0,'wake response budget accommodates bounded processing without delaying academic commit');
select ok(position('interval''60 seconds''' in pg_get_functiondef(to_regprocedure('internal.request_worker_wake_before_rollout()')))>0,'invocation coordination lease remains longer than transport and bounded processing');
select ok(position('return internal.request_worker_wake_before_rollout()' in pg_get_functiondef(to_regprocedure('internal.request_worker_wake_before_sql()')))>0
 and position('admission_paused' in pg_get_functiondef(to_regprocedure('internal.request_worker_wake_before_sql()')))>0,'preserved request wrapper retains the original timing implementation and refuses paused wake');
select ok(position('return internal.request_worker_wake_before_sql()' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0
 and position('admission_paused' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0
 and position('transport_mode=''SQL_CRON_LIBPQ_V2''' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0
 and position('not control.sql_enabled' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0,'current request wrapper preserves the exact legacy chain and refuses paused or disabled SQL admission');
select*from finish();
rollback;
