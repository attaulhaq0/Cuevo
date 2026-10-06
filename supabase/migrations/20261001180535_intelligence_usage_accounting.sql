-- Preserve explicit model accounting without claiming that API usage is an invoice.
begin;
alter table app.intelligence_runs add column input_tokens integer check(input_tokens>=0);
alter table app.intelligence_runs add column cost_basis text not null default 'LEGACY_UNSPECIFIED'
 check(cost_basis in('DETERMINISTIC_FIXTURE','CONFIGURED_TOKEN_RATES','BUDGET_RESERVATION','LEGACY_UNSPECIFIED'));
alter table app.intelligence_runs add column reserved_budget numeric not null default 0 check(reserved_budget>=0 and reserved_budget<=10);

create or replace function internal.intelligence_run_immutable()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op<>'UPDATE'or old.state<>'REASONING' or (to_jsonb(new)-'state'-'grounded_output'-'output_tokens'-'input_tokens'-'cost'-'cost_basis'-'reserved_budget'-'latency_ms'-'evaluation_status'-'failure_code'-'lease_token'-'lease_until'-'completed_at')is distinct from(to_jsonb(old)-'state'-'grounded_output'-'output_tokens'-'input_tokens'-'cost'-'cost_basis'-'reserved_budget'-'latency_ms'-'evaluation_status'-'failure_code'-'lease_token'-'lease_until'-'completed_at')then raise exception 'Intelligence history immutable'using errcode='55000';end if;
 return new;
end$$;

-- The runtime supplies these settings; browser analysis commands cannot choose them.
alter function internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)rename to begin_authorized_teacher_insight_run;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.begin_authorized_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 if position('begin_teacher_insight_run.command_key'in definition)=0 then raise exception 'Intelligence replay alias requires review'using errcode='22023';end if;
 execute replace(definition,'begin_teacher_insight_run.command_key','begin_authorized_teacher_insight_run.command_key');
end$$;
revoke execute on function internal.begin_authorized_teacher_insight_run(text,text,uuid,jsonb,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.begin_teacher_insight_run(command_key text,request_fingerprint text,baseline_id uuid,settings jsonb,source_request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare reservation jsonb;basis text:=coalesce(settings->>'costBasis','LEGACY_UNSPECIFIED');context jsonb;school uuid:="authorization".school_id();prior_basis text;
begin
 context:=internal.intelligence_context(baseline_id);
 if settings?'syntheticOnly'and jsonb_typeof(settings->'syntheticOnly')is distinct from 'boolean'then raise exception 'Invalid intelligence data policy'using errcode='22023';end if;
 if basis not in('DETERMINISTIC_FIXTURE','CONFIGURED_TOKEN_RATES','BUDGET_RESERVATION','LEGACY_UNSPECIFIED')or(basis='DETERMINISTIC_FIXTURE'and settings->>'mode'<>'FIXTURE')or(basis in('CONFIGURED_TOKEN_RATES','BUDGET_RESERVATION')and settings->>'mode'<>'LIVE')then raise exception 'Invalid intelligence accounting basis'using errcode='22023';end if;
 if basis='BUDGET_RESERVATION'and settings->'syntheticOnly'is distinct from 'true'::jsonb then raise exception 'Unknown live pricing requires synthetic context'using errcode='22023';end if;
 if settings->'syntheticOnly'='true'::jsonb then
  -- Refuse mixed populations too: the local flag is not approval to process real pupils.
  if not exists(select 1 from app.people p join app.result_revisions r on r.school_id=p.school_id and r.learner_id=p.actor_id where r.school_id=school and r.id=baseline_id and p.synthetic)
   or not exists(select 1 from app.people p where p.school_id=school and p.actor_id="authorization".actor_id()and p.synthetic)
   or exists(select 1 from app.memberships m left join app.people p on p.school_id=m.school_id and p.actor_id=m.actor_id where m.school_id=school and p.synthetic is distinct from true)
   or exists(select 1 from app.people p where p.school_id=school and p.synthetic is distinct from true)
  then raise exception 'Synthetic intelligence population required'using errcode='42501';end if;
 end if;
 select run.cost_basis into prior_basis from app.intelligence_runs run where run.school_id=school and run.actor_id="authorization".actor_id()and run.command_key=begin_teacher_insight_run.command_key;
 if found and prior_basis<>'LEGACY_UNSPECIFIED'and prior_basis<>basis then raise exception 'Intelligence replay accounting changed'using errcode='22023';end if;
 reservation:=internal.begin_authorized_teacher_insight_run(command_key,request_fingerprint,baseline_id,settings-'syntheticOnly'-'costBasis',source_request_id);
 if reservation->>'state'='NEW'then
  update app.intelligence_runs set cost_basis=basis,reserved_budget=case when settings->>'mode'='LIVE'then(settings->>'maxCost')::numeric else 0 end
  where school_id=school and id=(reservation->>'runId')::uuid;
 end if;
 return reservation;
end$$;
revoke execute on function internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)to cuevo_api;

-- Both private completion implementations retain their original source/lease checks.
-- Fail if their known validation shape changed rather than weakening an unknown function.
do $$declare signature text;definition text;old_check text:='usage-''outputTokens''-''cost''-''latencyMs''<>''{}''::jsonb';begin
 foreach signature in array array['internal.complete_numeric_intelligence_run(uuid,uuid,jsonb,jsonb,text)','internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(old_check in definition)=0 or position('latency integer;'in definition)=0 or position('cost=cost_amount,latency_ms=latency'in definition)=0 then raise exception 'Intelligence usage implementation requires review'using errcode='22023';end if;
  definition:=replace(definition,'latency integer;','latency integer;input_count integer;basis text;');
  definition:=replace(definition,old_check,'usage-''outputTokens''-''inputTokens''-''cost''-''costBasis''-''latencyMs''<>''{}''::jsonb');
  definition:=replace(definition,'tokens:=(usage->>''outputTokens'')::integer;',
   'basis:=coalesce(usage->>''costBasis'',run.cost_basis);input_count:=(usage->>''inputTokens'')::integer;
   if basis not in(''DETERMINISTIC_FIXTURE'',''CONFIGURED_TOKEN_RATES'',''BUDGET_RESERVATION'',''LEGACY_UNSPECIFIED'')or(run.cost_basis<>''LEGACY_UNSPECIFIED''and basis<>run.cost_basis)or(usage?''inputTokens''and(input_count is null or input_count<0))or(basis<>''LEGACY_UNSPECIFIED''and input_count is null)or(basis=''DETERMINISTIC_FIXTURE''and(run.generation_mode<>''FIXTURE''or input_count<>0 or(usage->>''cost'')::numeric<>0))or(basis in(''CONFIGURED_TOKEN_RATES'',''BUDGET_RESERVATION'')and run.generation_mode<>''LIVE'')or(basis=''BUDGET_RESERVATION''and(usage->>''cost'')::numeric is distinct from run.reserved_budget)then raise exception ''Invalid intelligence usage basis''using errcode=''22023'';end if;
   tokens:=(usage->>''outputTokens'')::integer;');
  definition:=replace(definition,'cost=cost_amount,latency_ms=latency','cost=cost_amount,input_tokens=input_count,cost_basis=basis,latency_ms=latency');
  execute definition;
 end loop;
end$$;
revoke execute on function internal.complete_numeric_intelligence_run(uuid,uuid,jsonb,jsonb,text),internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Keep current-source metric authorization and domain denominators unchanged.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_intelligence_metrics(integer,text)'::regprocedure);
 if position('cost_total numeric;'in definition)=0 or position('run.latency_ms,run.cost,proposal.status'in definition)=0 or position('coalesce(sum(cost)filter(where state=''PROPOSAL_READY''),0)'in definition)=0 then raise exception 'Intelligence metrics implementation requires review'using errcode='22023';end if;
 definition:=replace(definition,'cost_total numeric;','cost_total numeric;reserved_total numeric;unknown_cost integer;estimated_count integer;');
 definition:=replace(definition,'run.latency_ms,run.cost,proposal.status','run.latency_ms,run.cost,run.cost_basis,run.reserved_budget,proposal.status');
 definition:=replace(definition,'coalesce(sum(cost)filter(where state=''PROPOSAL_READY''),0)',
  'coalesce(sum(cost)filter(where state=''PROPOSAL_READY''and cost_basis in(''DETERMINISTIC_FIXTURE'',''CONFIGURED_TOKEN_RATES'')),0),coalesce(sum(reserved_budget)filter(where cost_basis=''BUDGET_RESERVATION''or state=''FAILED''and reserved_budget>0),0),count(*)filter(where cost_basis in(''BUDGET_RESERVATION'',''CONFIGURED_TOKEN_RATES'',''LEGACY_UNSPECIFIED'')or state=''FAILED''and reserved_budget>0),count(*)filter(where state=''PROPOSAL_READY''and cost_basis in(''DETERMINISTIC_FIXTURE'',''CONFIGURED_TOKEN_RATES''))');
 definition:=replace(definition,'latency,cost_total from sources','latency,cost_total,reserved_total,unknown_cost,estimated_count from sources');
 definition:=replace(definition,'''costPerApprovedWorkflow'',case when approved=0 then null else cost_total/approved end',
  '''costPerApprovedWorkflow'',case when approved=0 or unknown_cost>0 then null else cost_total/approved end,''costAccounting'',jsonb_build_object(''basis'',''CONFIGURED_ESTIMATES_ONLY'',''estimatedRuns'',estimated_count,''reservedBudget'',reserved_total,''unknownBilledCostRuns'',unknown_cost,''billedCost'',null)');
 execute definition;
end$$;
revoke execute on function internal.read_intelligence_metrics(integer,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_metrics(integer,text)to cuevo_api;
commit;
