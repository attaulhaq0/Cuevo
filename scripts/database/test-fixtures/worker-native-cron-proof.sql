-- Private mechanics fixture, only inside one admitted disposable engine.
-- The operator adds the exact frozen source digest default before granting INSERT.
create schema cuevo_cron_probe;
revoke all on schema cuevo_cron_probe from public,anon,authenticated,service_role,cuevo_api;
create table cuevo_cron_probe.stages (
 stage text not null check(stage in('A','B','B_FAILED','TIMEOUT_A','TIMEOUT_DONE','CUM_A','CUM_B','CUM_DONE','DENY_DEFINER','DENY_SET')),
 backend_pid integer not null default pg_catalog.pg_backend_pid(),
 transaction_id text not null default pg_catalog.txid_current()::text,
 session_identity text not null default session_user,
 current_identity text not null default current_user,
 database_name text not null default pg_catalog.current_database(),
 observed_at timestamptz not null default pg_catalog.clock_timestamp(),
 statement_started_at timestamptz not null default pg_catalog.statement_timestamp(),
 timeout_ms integer not null default (pg_catalog.date_part('epoch',pg_catalog.current_setting('statement_timeout')::interval)*1000)::integer
);
alter table cuevo_cron_probe.stages enable row level security;
create policy restricted_probe_insert on cuevo_cron_probe.stages for insert to cuevo_worker
with check(session_user='cuevo_worker' and current_user='cuevo_worker');
revoke all on cuevo_cron_probe.stages from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

create procedure cuevo_cron_probe.commit_then_fail()
language plpgsql security invoker as $$
begin
 insert into cuevo_cron_probe.stages(stage) values('A');
 commit;
 begin
  insert into cuevo_cron_probe.stages(stage) values('B');
  raise division_by_zero;
 exception when division_by_zero then null;
 end;
 insert into cuevo_cron_probe.stages(stage) values('B_FAILED');
 commit;
 raise exception using errcode='P0001',message='CUEVO_CONTROLLED_FINAL_FAILURE';
end $$;

create procedure cuevo_cron_probe.commit_then_timeout()
language plpgsql security invoker as $$
begin
 insert into cuevo_cron_probe.stages(stage) values('TIMEOUT_A');
 commit;
 perform pg_catalog.pg_sleep(6);
 insert into cuevo_cron_probe.stages(stage) values('TIMEOUT_DONE');
 commit;
end $$;

create procedure cuevo_cron_probe.cumulative_timeout()
language plpgsql security invoker as $$
begin
 perform pg_catalog.pg_sleep(3);
 insert into cuevo_cron_probe.stages(stage) values('CUM_A');
 commit;
 perform pg_catalog.pg_sleep(3);
 insert into cuevo_cron_probe.stages(stage) values('CUM_B');
 commit;
 insert into cuevo_cron_probe.stages(stage) values('CUM_DONE');
 commit;
end $$;

create procedure cuevo_cron_probe.denied_definer()
language plpgsql security definer as $$
begin
 insert into cuevo_cron_probe.stages(stage) values('DENY_DEFINER');
 commit;
end $$;
create procedure cuevo_cron_probe.denied_set()
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 insert into cuevo_cron_probe.stages(stage) values('DENY_SET');
 commit;
end $$;
revoke execute on all procedures in schema cuevo_cron_probe from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
