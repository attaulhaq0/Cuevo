begin;
create table app.intelligence_budget_policies(school_id uuid not null,id uuid not null default gen_random_uuid(),version integer not null check(version>0),currency text not null check(currency='USD'),school_daily_limit numeric not null check(school_daily_limit>0 and school_daily_limit<=100000),actor_daily_limit numeric not null check(actor_daily_limit>0 and actor_daily_limit<=school_daily_limit),max_concurrent_runs integer not null check(max_concurrent_runs between 1 and 100),reason text not null,approved_by uuid not null,approved_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,version),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id));
create table internal.intelligence_budget_reservations(school_id uuid not null,run_id uuid not null,actor_id uuid not null,period_day date not null,currency text not null default'USD'check(currency='USD'),amount numeric not null check(amount>0 and amount<=10),policy_id uuid not null,created_at timestamptz not null default clock_timestamp(),primary key(school_id,run_id),foreign key(school_id,run_id)references app.intelligence_runs(school_id,id),foreign key(school_id,policy_id)references app.intelligence_budget_policies(school_id,id));
create index intelligence_budget_period on internal.intelligence_budget_reservations(period_day,school_id,actor_id);
do $$declare tab text;begin foreach tab in array array['intelligence_budget_policies']loop execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);execute format('create trigger budget_immutable before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);end loop;end$$;
alter table internal.intelligence_budget_reservations enable row level security;alter table internal.intelligence_budget_reservations force row level security;
create trigger reservation_immutable before update or delete on internal.intelligence_budget_reservations for each row execute function internal.academic_history_immutable();
revoke all on app.intelligence_budget_policies,internal.intelligence_budget_reservations from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.read_intelligence_budget()returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();policy app.intelligence_budget_policies;day date:=(clock_timestamp()at time zone'UTC')::date;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)<>'admin'then raise exception 'Budget read denied'using errcode='42501';end if;
 select*into policy from app.intelligence_budget_policies where school_id=school order by version desc limit 1;
 return jsonb_build_object('currency','USD','period','UTC_DAY','policy',case when policy.id is null then null else jsonb_build_object('id',policy.id,'version',policy.version,'currency','USD','schoolDailyLimit',policy.school_daily_limit,'actorDailyLimit',policy.actor_daily_limit,'maxConcurrentRuns',policy.max_concurrent_runs,'approvedAt',policy.approved_at)end,
 'schoolReserved',(select coalesce(sum(held.max_cost),0)from app.intelligence_runs held where held.school_id=school and held.generation_mode='LIVE'and(held.created_at at time zone'UTC')::date=day),'actorReserved',(select coalesce(sum(held.max_cost),0)from app.intelligence_runs held where held.school_id=school and held.actor_id=actor and held.generation_mode='LIVE'and(held.created_at at time zone'UTC')::date=day),'billedCost',null);
end$$;
create function internal.approve_intelligence_budget(input jsonb,command_key text,fingerprint text,request_id text)returns void language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();current_version integer;reservation jsonb;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)<>'admin'then raise exception 'Budget approval denied'using errcode='42501';end if;
 if input is null or jsonb_typeof(input)<>'object'or input-'currency'-'schoolDailyLimit'-'actorDailyLimit'-'maxConcurrentRuns'-'expectedVersion'-'confirmApproval'-'reason'<>'{}'::jsonb or input->>'currency'is distinct from'USD'or input->'confirmApproval'is distinct from'true'::jsonb or input->>'reason'is null or length(btrim(input->>'reason'))not between 1 and 1000 then raise exception 'Explicit budget policy required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('intelligence-budget-policy:'||school::text,0));
 reservation:=internal.begin_command(command_key,'intelligence.budget.approve',fingerprint);if reservation->>'state'='COMPLETED'then return;end if;
 select coalesce(max(version),0)into current_version from app.intelligence_budget_policies where school_id=school;
 if (input->>'expectedVersion')::integer is distinct from current_version then raise exception 'Budget policy version changed'using errcode='22023';end if;
 insert into app.intelligence_budget_policies(school_id,version,currency,school_daily_limit,actor_daily_limit,max_concurrent_runs,reason,approved_by)values(school,current_version+1,'USD',(input->>'schoolDailyLimit')::numeric,(input->>'actorDailyLimit')::numeric,(input->>'maxConcurrentRuns')::integer,input->>'reason',"authorization".actor_id());
 perform internal.append_audit('intelligence.budget.approved','school',school,request_id,'succeeded',jsonb_build_object('version',current_version+1,'currency','USD'));
 perform internal.finish_command(command_key,'intelligence.budget.approve',fingerprint,jsonb_build_object('id',school,'version',current_version+1));
end$$;
create function internal.reserve_intelligence_budget(target_run uuid,global_limit numeric)returns void language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();run app.intelligence_runs;policy app.intelligence_budget_policies;day date:=(clock_timestamp()at time zone'UTC')::date;used_global numeric;used_school numeric;used_actor numeric;concurrent integer;begin
 if global_limit is null or global_limit<=0 or global_limit>1000000 then raise exception 'Explicit global reservation ceiling required'using errcode='22023';end if;
 select*into run from app.intelligence_runs where school_id=school and id=target_run and actor_id=actor;
 if not found or run.state<>'REASONING'or run.generation_mode<>'LIVE'or not"authorization".can_manage_baseline(school,run.baseline_result_id)then raise exception 'Budget source reservation denied'using errcode='42501';end if;
 if exists(select 1 from internal.intelligence_budget_reservations where school_id=school and run_id=target_run)then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('intelligence-budget-policy:'||school::text,0));
 select*into policy from app.intelligence_budget_policies where school_id=school order by version desc limit 1;
 if policy.id is null then raise exception 'Approved school live budget required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('intelligence-global-budget:'||day::text,0));
 perform pg_advisory_xact_lock(hashtextextended('intelligence-school-budget:'||school::text||':'||day::text,0));
 -- Older live attempts remain full held caps too; ledger rollout does not make their
 -- unresolved billed cost zero. Exclude only the new uncommitted candidate itself.
 select coalesce(sum(held.max_cost),0),coalesce(sum(held.max_cost)filter(where held.school_id=school),0),coalesce(sum(held.max_cost)filter(where held.school_id=school and held.actor_id=actor),0)into used_global,used_school,used_actor from app.intelligence_runs held where held.generation_mode='LIVE'and(held.created_at at time zone'UTC')::date=day and held.id<>target_run;
 select count(*)into concurrent from app.intelligence_runs active where active.school_id=school and active.generation_mode='LIVE'and active.state='REASONING';
 if used_global+run.max_cost>global_limit or used_school+run.max_cost>policy.school_daily_limit or used_actor+run.max_cost>policy.actor_daily_limit or concurrent>policy.max_concurrent_runs then raise exception 'Live reservation budget exceeded'using errcode='22023';end if;
 insert into internal.intelligence_budget_reservations(school_id,run_id,actor_id,period_day,amount,policy_id)values(school,run.id,actor,day,run.max_cost,policy.id);
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 anchor:='settings-''syntheticOnly''-''costBasis''-''promptDigest''';if position(anchor in definition)=0 then raise exception 'Run settings budget projection changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'-''globalDailyBudget''');
 anchor:='if reservation->>''state''=''NEW''then';
 if position(anchor in definition)=0 then raise exception 'Run budget reservation timing changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||' if settings->>''mode''=''LIVE''then perform internal.reserve_intelligence_budget((reservation->>''runId'')::uuid,(settings->>''globalDailyBudget'')::numeric);end if; ');
 execute definition;
end$$;
revoke execute on function internal.read_intelligence_budget(),internal.approve_intelligence_budget(jsonb,text,text,text),internal.reserve_intelligence_budget(uuid,numeric)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_budget(),internal.approve_intelligence_budget(jsonb,text,text,text)to cuevo_api;
commit;
