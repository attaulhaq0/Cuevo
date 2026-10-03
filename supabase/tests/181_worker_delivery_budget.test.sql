begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,pg_catalog;
select plan(2);
select ok(position('timeout_milliseconds:=30000' in pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure))>0,'wake response budget accommodates bounded processing without delaying academic commit');
select ok(position('interval''60 seconds''' in pg_get_functiondef('internal.request_worker_wake()'::regprocedure))>0,'invocation coordination lease remains longer than transport and bounded processing');
select*from finish();
rollback;
