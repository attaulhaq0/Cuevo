begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,pg_catalog;
select plan(3);
select ok(position('timeout_milliseconds:=30000' in pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure))>0,'wake response budget accommodates bounded processing without delaying academic commit');
select ok(position('interval''60 seconds''' in pg_get_functiondef('internal.request_worker_wake_before_rollout()'::regprocedure))>0,'invocation coordination lease remains longer than transport and bounded processing');
select ok(position('internal.request_worker_wake_before_rollout()' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0 and position('admission_paused' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0,'admission wrapper preserves original timing implementation and refuses paused wake');
select*from finish();
rollback;
