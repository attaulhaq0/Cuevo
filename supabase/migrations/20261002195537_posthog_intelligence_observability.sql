-- Draft only. The coordinator must create the append-only migration with the CLI after the frozen run.
-- Custom Cuevo telemetry preserves configured estimates, held reservations and unknown billing.
begin;

create function internal.enqueue_intelligence_observation() returns trigger
language plpgsql security definer set search_path='' as $$
declare run app.intelligence_runs;
begin
 select * into run from app.intelligence_runs where school_id=new.school_id and id=new.run_id;
 if run.id is null or run.school_id is distinct from "authorization".school_id() or run.actor_id is distinct from "authorization".actor_id() then
  raise exception 'Intelligence observation source context required' using errcode='42501';
 end if;
 -- REJECTED is inserted before FAILED in the same transaction. Terminal checks occur after commit.
 perform internal.enqueue_event('intelligence.run_observed','intelligence_run',run.id,1,
  '{"intelligenceSchemaVersion":1}'::jsonb,'intelligence-run-observed:'||run.id::text);
 return new;
end $$;
create trigger intelligence_observation_outbox after insert on internal.intelligence_output_observations
for each row execute function internal.enqueue_intelligence_observation();

create function internal.enqueue_intelligence_quality_observation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.school_id is distinct from "authorization".school_id() or new.reviewer_id is distinct from "authorization".actor_id() then
  raise exception 'Intelligence review source context required' using errcode='42501';
 end if;
 perform internal.enqueue_event('intelligence.quality.reviewed','intelligence_quality_review',new.id,1,
  '{"intelligenceSchemaVersion":1}'::jsonb,'intelligence-quality-reviewed:'||new.id::text);
 return new;
end $$;
create trigger intelligence_quality_outbox after insert on internal.intelligence_quality_reviews
for each row execute function internal.enqueue_intelligence_quality_observation();

-- Exact immutable source validation is shared by domain acknowledgment and destination admission.
create function internal.intelligence_observability_source_allowed(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
  select 1 from internal.outbox_events event
  join app.intelligence_runs run on run.school_id=event.school_id and run.id=event.entity_id
  join internal.intelligence_output_observations observation on observation.school_id=run.school_id and observation.run_id=run.id
  where event.id=target_event and event.type='intelligence.run_observed' and event.entity_type='intelligence_run' and event.version=1
   and event.actor_id=run.actor_id and event.metadata='{"intelligenceSchemaVersion":1}'::jsonb
   and event.deduplication_key='intelligence-run-observed:'||run.id::text and observation.observed_at<=event.occurred_at
   and ((run.state='PROPOSAL_READY' and run.evaluation_status='PASSED' and observation.outcome='ACCEPTED' and run.failure_code is null)
    or (run.state='FAILED' and run.evaluation_status='FAILED' and observation.outcome in('REJECTED','NOT_EVALUATED') and run.failure_code is not null
     and (observation.outcome<>'REJECTED' or run.failure_code='INTELLIGENCE_REQUIRES_REVIEW')))
   and exists(select 1 from internal.audit_events audit where audit.school_id=run.school_id and audit.entity_type='intelligence_run'
    and audit.entity_id=run.id and audit.actor_id=run.actor_id
    and ((run.state='PROPOSAL_READY' and audit.action='intelligence.proposal_ready' and audit.outcome='succeeded')
     or (run.state='FAILED' and audit.action='intelligence.failed' and audit.outcome='failed')))
 ) or exists(
  select 1 from internal.outbox_events event
  join internal.intelligence_quality_reviews review on review.school_id=event.school_id and review.id=event.entity_id
  join app.intelligence_runs run on run.school_id=review.school_id and run.id=review.run_id
  where event.id=target_event and event.type='intelligence.quality.reviewed' and event.entity_type='intelligence_quality_review' and event.version=1
   and event.actor_id=review.reviewer_id and event.metadata='{"intelligenceSchemaVersion":1}'::jsonb
   and event.deduplication_key='intelligence-quality-reviewed:'||review.id::text and review.created_at<=event.occurred_at
   and run.state='PROPOSAL_READY' and run.evaluation_status='PASSED'
   and exists(select 1 from internal.audit_events audit where audit.school_id=review.school_id and audit.entity_type='intelligence_run'
    and audit.entity_id=run.id and audit.actor_id=review.reviewer_id and audit.action='intelligence.quality.reviewed' and audit.outcome='succeeded'
    and audit.metadata=jsonb_build_object('reviewId',review.id))
 ),false)
$$;

create function internal.posthog_intelligence_event_run(target_event uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select source.run_id from (
  select event.entity_id run_id from internal.outbox_events event where event.id=target_event and event.type='intelligence.run_observed'
  union all select review.run_id from internal.outbox_events event join internal.intelligence_quality_reviews review
   on review.school_id=event.school_id and review.id=event.entity_id where event.id=target_event and event.type='intelligence.quality.reviewed'
  union all select proposal.intelligence_run_id from internal.outbox_events event join app.recommendations proposal
   on proposal.school_id=event.school_id and proposal.id=event.entity_id where event.id=target_event and event.type in('recommendation.approved','recommendation.rejected')
  union all select proposal.intelligence_run_id from internal.outbox_events event join app.interventions task
   on task.school_id=event.school_id and task.id=event.entity_id join app.recommendations proposal
   on proposal.school_id=task.school_id and proposal.id=task.recommendation_id
   where event.id=target_event and event.type in('intervention.created','intervention.completed','reassessment.linked')
  union all select proposal.intelligence_run_id from internal.outbox_events event join app.outcome_measurements outcome
   on outcome.school_id=event.school_id and outcome.id=event.entity_id join app.interventions task
   on task.school_id=outcome.school_id and task.id=outcome.intervention_id join app.recommendations proposal
   on proposal.school_id=task.school_id and proposal.id=task.recommendation_id where event.id=target_event and event.type='outcome.measured'
 ) source where source.run_id is not null limit 1
$$;

-- Not an AI retrieval API. The ungranted owner helper returns a fixed metadata projection.
create function internal.posthog_event_context(target_event uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare event internal.outbox_events; run app.intelligence_runs; binding internal.intelligence_execution_bindings;
 observation internal.intelligence_output_observations; review internal.intelligence_quality_reviews;
 decision app.human_decisions; task app.interventions; outcome app.outcome_measurements;
 stored jsonb; answer jsonb; overridden boolean;
 previous_actor text:=current_setting('app.actor_id',true); previous_school text:=current_setting('app.school_id',true);
begin
 select * into event from internal.outbox_events where id=target_event;
 select * into run from app.intelligence_runs where school_id=event.school_id and id=internal.posthog_intelligence_event_run(target_event);
 if run.id is null or run.execution_binding_id is null then return null; end if;
 if event.type in('intelligence.run_observed','intelligence.quality.reviewed') and not internal.intelligence_observability_source_allowed(target_event) then return null; end if;
 select * into observation from internal.intelligence_output_observations where school_id=run.school_id and run_id=run.id;
 select * into binding from internal.intelligence_execution_bindings where school_id=run.school_id and id=run.execution_binding_id
  and version=run.execution_binding_version and policy_version=run.policy_version and effective_at<=clock_timestamp();
 if observation.run_id is null or binding.id is null or not internal.valid_intelligence_execution_manifest(binding.manifest)
  or run.provider !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' or run.model !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
  or run.purpose is distinct from binding.manifest->>'purpose' or run.generation_mode is distinct from binding.manifest->>'mode'
  or run.provider is distinct from binding.manifest->>'provider' or run.model is distinct from binding.manifest->>'model'
  or run.prompt_id is distinct from binding.manifest->>'promptId' or run.prompt_version is distinct from binding.manifest->>'promptVersion'
  or run.prompt_digest is distinct from binding.manifest->>'promptDigest' or run.data_classification is distinct from binding.manifest->>'dataClassification'
  or run.max_tokens is distinct from (binding.manifest->>'maxOutputTokens')::integer or run.timeout_ms is distinct from (binding.manifest->>'timeoutMs')::integer
  or run.max_cost is distinct from (binding.manifest->>'maxCost')::numeric
  or binding.id is distinct from (select current_binding.id from internal.intelligence_execution_bindings current_binding
   where current_binding.school_id=run.school_id and current_binding.policy_version=run.policy_version order by current_binding.version desc limit 1)
  or (run.state='PROPOSAL_READY' and (observation.outcome<>'ACCEPTED' or run.failure_code is not null))
  or (run.state='FAILED' and (observation.outcome not in('REJECTED','NOT_EVALUATED') or run.failure_code is null))
  or run.state not in('PROPOSAL_READY','FAILED') then return null; end if;
 begin
  -- Persisted run/event actors establish separate current authority; no caller-selected actor is trusted.
  perform set_config('app.school_id',run.school_id::text,true); perform set_config('app.actor_id',run.actor_id::text,true);
  perform internal.require_context();
  if "authorization".current_role(run.school_id) not in('teacher','admin') then raise exception 'Intelligence actor scope lost' using errcode='42501'; end if;
  perform internal.require_stored_insight_scope(run.id);
  perform set_config('app.actor_id',event.actor_id::text,true); perform internal.require_context();
  if event.type in('intelligence.run_observed','intelligence.quality.reviewed','recommendation.approved','recommendation.rejected') then
   if "authorization".current_role(run.school_id) not in('teacher','admin') then raise exception 'Intelligence review scope lost' using errcode='42501'; end if;
   perform internal.require_stored_insight_scope(run.id);
  else
   select source.* into task from app.interventions source where source.school_id=event.school_id
    and source.id=case when event.type='outcome.measured' then (select source_outcome.intervention_id from app.outcome_measurements source_outcome
     where source_outcome.school_id=event.school_id and source_outcome.id=event.entity_id) else event.entity_id end;
   if task.id is null or not "authorization".can_access_intervention(run.school_id,task.id,event.type<>'intervention.completed') then
    raise exception 'Intelligence support scope lost' using errcode='42501';
   end if;
   if event.type='outcome.measured' then perform internal.intervention_outcome_projection(event.entity_id); end if;
  end if;
  select context into stored from app.intelligence_context_details where school_id=run.school_id and run_id=run.id;
  answer:=jsonb_build_object('runId',run.id,'purpose',run.purpose,'generationMode',run.generation_mode,'provider',run.provider,'model',run.model,
   'promptVersion',run.prompt_version,'promptDigest',run.prompt_digest,'evaluationVersion',binding.manifest->>'evaluationVersion',
   'contextDigest',encode(sha256(convert_to(jsonb_build_object('baseline',run.context_references,'details',stored,'trace',run.tool_trace)::text,'UTF8')),'hex'),
   'contextCounts',jsonb_build_object('results',case when stored is null then null else jsonb_array_length(stored->'recentResults') end,
    'observations',case when stored is null then null else jsonb_array_length(stored->'observations') end,
    'priorInterventions',case when stored is null then null else jsonb_array_length(stored->'priorInterventions') end,
    'activities',case when stored is null then null else jsonb_array_length(stored->'learningOptions') end),
   'runState',run.state,'outputObservation',observation.outcome,'failureCode',run.failure_code,
   'inputTokens',run.input_tokens,'outputTokens',run.output_tokens,'latencyMs',run.latency_ms,
   'costBasis',run.cost_basis,'cost',run.cost,'reservedBudget',run.reserved_budget);
  if event.type='intelligence.quality.reviewed' then
   select * into review from internal.intelligence_quality_reviews where school_id=event.school_id and id=event.entity_id;
   answer:=answer||jsonb_build_object('review',jsonb_build_object('usefulness',review.usefulness,'grounding',review.grounding,'privacy',review.privacy,'toolSafety',review.tool_safety));
  elsif event.type in('recommendation.approved','recommendation.rejected') then
   select * into decision from app.human_decisions where school_id=event.school_id and recommendation_id=event.entity_id and actor_id=event.actor_id;
   select source.overridden into overridden from internal.intelligence_decision_observations source where source.school_id=event.school_id
    and source.run_id=run.id and source.decision_id=decision.id;
   answer:=answer||jsonb_build_object('decisionOverride',overridden);
  elsif event.type='outcome.measured' then
   select * into outcome from app.outcome_measurements where school_id=event.school_id and id=event.entity_id;
   answer:=answer||jsonb_build_object('outcome',jsonb_build_object('status',outcome.status,'model',outcome.model,
    'comparability',case when outcome.model='rubric' then outcome.comparability else 'COMPARABLE' end));
  end if;
 exception when insufficient_privilege or no_data_found or invalid_parameter_value then answer:=null;
 end;
 perform set_config('app.actor_id',coalesce(previous_actor,''),true); perform set_config('app.school_id',coalesce(previous_school,''),true);
 return answer;
exception when others then
 perform set_config('app.actor_id',coalesce(previous_actor,''),true); perform set_config('app.school_id',coalesce(previous_school,''),true);
 raise;
end $$;

alter function internal.posthog_source_event_allowed(uuid) rename to posthog_source_before_intelligence;
create function internal.posthog_source_event_allowed(target_event uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare event internal.outbox_events; run_id uuid;
begin
 select * into event from internal.outbox_events where id=target_event;
 if event.type in('intelligence.run_observed','intelligence.quality.reviewed') then
  return event.state='COMPLETED' and exists(select 1 from app.people person where person.school_id=event.school_id and person.actor_id=event.actor_id and person.synthetic)
   and internal.intelligence_observability_source_allowed(target_event) and internal.posthog_event_context(target_event) is not null;
 end if;
 if not internal.posthog_source_before_intelligence(target_event) then return false; end if;
 run_id:=internal.posthog_intelligence_event_run(target_event);
 if exists(select 1 from app.intelligence_runs run where run.school_id=event.school_id and run.id=run_id and run.execution_binding_id is not null) then
  return internal.posthog_event_context(target_event) is not null;
 end if;
 return true;
end $$;

-- Delegate all lease/environment/policy/cutoff/attempt behavior to the unchanged four-argument implementation.
alter function internal.claim_posthog_delivery(integer,integer,integer,text) rename to claim_posthog_before_intelligence;
-- Recompile stored bodies after the allowlist rename so cached plans resolve the new gate.
do $$begin
 execute pg_get_functiondef('internal.claim_posthog_before_intelligence(integer,integer,integer,text)'::regprocedure);
 execute pg_get_functiondef('internal.posthog_delivery_due()'::regprocedure);
end $$;
create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer,target_environment text)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb,ai_context jsonb)
language sql volatile security definer set search_path='' as $$
 select source.*,internal.posthog_event_context(source.id)
 from internal.claim_posthog_before_intelligence(batch_size,lease_seconds,target_key_version,target_environment) source
$$;
-- Repeat the new projection gate during pre-POST revalidation while preserving the existing lease/policy gate.
create or replace function internal.posthog_delivery_allowed(target_event uuid,current_lease uuid,target_key_version integer,target_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(target_environment in('QA','DEMO','STAGING') and exists(select 1 from internal.posthog_delivery receipt
  where receipt.event_id=target_event and receipt.environment=target_environment and receipt.key_version=target_key_version)
  and internal.posthog_delivery_allowed(target_event,current_lease,target_key_version)
  and internal.posthog_source_event_allowed(target_event),false)
$$;

alter function internal.process_learner_event(uuid,uuid) rename to process_before_intelligence_observability;
create function internal.process_learner_event(target_event uuid,current_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event internal.outbox_events;
begin
 select * into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING' or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp() then
  raise exception 'Invalid event lease' using errcode='22023';
 end if;
 if event.type not in('intelligence.run_observed','intelligence.quality.reviewed') then return internal.process_before_intelligence_observability(target_event,current_lease); end if;
 if not internal.intelligence_observability_source_allowed(target_event) then raise exception 'Intelligence observation source unavailable' using errcode='22023'; end if;
 insert into internal.processed_events(event_id,school_id) values(event.id,event.school_id) on conflict(event_id) do nothing;
 if internal.complete_outbox(event.id,current_lease) is distinct from true then raise exception 'Observation lease expired before acknowledgment' using errcode='22023'; end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end $$;

create index posthog_intelligence_completed_source_idx on internal.outbox_events(occurred_at,id)
where state='COMPLETED' and type in('intelligence.run_observed','intelligence.quality.reviewed');

revoke execute on function internal.enqueue_intelligence_observation(),internal.enqueue_intelligence_quality_observation(),
 internal.intelligence_observability_source_allowed(uuid),internal.posthog_intelligence_event_run(uuid),internal.posthog_event_context(uuid),
 internal.posthog_source_before_intelligence(uuid),internal.posthog_source_event_allowed(uuid),
 internal.claim_posthog_before_intelligence(integer,integer,integer,text),internal.claim_posthog_delivery(integer,integer,integer,text),
 internal.process_before_intelligence_observability(uuid,uuid),internal.process_learner_event(uuid,uuid)
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_posthog_delivery(integer,integer,integer,text),internal.process_learner_event(uuid,uuid) to cuevo_worker;
commit;
