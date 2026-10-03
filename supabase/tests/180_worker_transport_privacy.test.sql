begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,pg_catalog;
select no_plan();
select ok(to_regprocedure('internal.worker_transport_private()')is not null,'transport safety guard exists');
select is(internal.worker_transport_private(),true,'provider-owned network and Vault grants must be hardened before activation');
select ok(not has_function_privilege('authenticated','internal.send_worker_wake(uuid,text,text)','EXECUTE'),'browser cannot invoke signed network delivery');
select ok(not has_function_privilege('service_role','internal.send_worker_wake(uuid,text,text)','EXECUTE'),'service role cannot invoke private signed delivery');
select ok(not has_function_privilege('cuevo_api','internal.worker_transport_private()','EXECUTE'),'API cannot inspect operational secret permissions');
select ok(not has_function_privilege('cuevo_worker','internal.send_worker_wake(uuid,text,text)','EXECUTE'),'worker cannot select an endpoint or Vault key');
select ok(position('Bearer 'in pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure))=0,'network queue never receives a reusable bearer credential');
select ok(position('X-Cuevo-Wake-Signature'in pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure))>0,'network wake carries the one-use purpose signature');
select ok(position('internal.worker_transport_private()'in pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure))>0,'every delivery rechecks current transport permissions');
select ok(position('internal.worker_transport_private()'in pg_get_functiondef('internal.configure_worker_dispatch(boolean,text,text,boolean)'::regprocedure))>0,'activation rechecks current extension permissions');
select ok(position('''transportPrivate'''in pg_get_functiondef('internal.worker_dispatch_health()'::regprocedure))>0,'worker health distinguishes transport grant readiness');

-- Rollback-only guard substitution isolates unsafe-transport admission without changing provider-owned grants.
create or replace function internal.worker_transport_private()returns boolean language sql stable security definer set search_path=''as $$select false$$;
select throws_ok($$select internal.configure_worker_dispatch(true,'https://worker.example.test/functions/v1/cuevo-worker','worker-dispatch-token',false)$$,'22023',null,'unsafe extension grants refuse activation');
select throws_ok($$select internal.send_worker_wake('18000000-0000-4000-8000-000000000001','https://worker.example.test/functions/v1/cuevo-worker','worker-dispatch-token')$$,'22023',null,'permission drift prevents secret access and HTTP delivery');
select internal.configure_worker_dispatch(false,null,null,false);
select is((select enabled from internal.worker_dispatch_control),false,'unsafe transport remains disabled');
select*from finish();
rollback;
