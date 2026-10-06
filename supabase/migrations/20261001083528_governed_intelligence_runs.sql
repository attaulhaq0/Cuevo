-- Governed local fixture execution and durable source-linked intelligence proposals.
-- No provider credential, official curriculum authority, grade or permission write is added.
begin;
create table app.intelligence_policies (
 school_id uuid primary key references app.schools(id), version integer not null check(version>0),
 fixture_enabled boolean not null default false, live_enabled boolean not null default false,
 purpose text not null default 'NEXT_LEARNING_ACTION' check(purpose='NEXT_LEARNING_ACTION'),
 data_classification text not null default 'SCHOOL_CUSTOM_NUMERIC' check(data_classification='SCHOOL_CUSTOM_NUMERIC'),
 allowed_actions text[] not null default array['GUIDED_PRACTICE','REVIEW_FEEDBACK']::text[] check(cardinality(allowed_actions)between 1 and 2 and allowed_actions<@array['GUIDED_PRACTICE','REVIEW_FEEDBACK']::text[]),
 approved_by uuid not null, approved_at timestamptz not null default clock_timestamp(),
 foreign key(school_id,approved_by)references app.memberships(school_id,actor_id)
);
create table app.intelligence_runs (
 school_id uuid not null,id uuid not null default gen_random_uuid(),actor_id uuid not null,learner_id uuid not null,
 baseline_result_id uuid not null,command_key text not null,fingerprint text not null,
 purpose text not null check(purpose='NEXT_LEARNING_ACTION'),data_classification text not null check(data_classification='SCHOOL_CUSTOM_NUMERIC'),
 generation_mode text not null check(generation_mode in('FIXTURE','LIVE')),provider text not null,model text not null,
 prompt_id text not null,prompt_version text not null,policy_version integer not null,
 state text not null default 'REASONING'check(state in('REASONING','PROPOSAL_READY','FAILED')),
 context_references jsonb not null,tool_trace jsonb not null,grounded_output jsonb,
 timeout_ms integer not null check(timeout_ms between 1 and 30000),max_tokens integer not null check(max_tokens between 1 and 4000),max_cost numeric not null check(max_cost>0 and max_cost<=10),
 output_tokens integer,cost numeric,latency_ms integer,evaluation_status text not null default 'PENDING'check(evaluation_status in('PENDING','PASSED','FAILED')),
 failure_code text,lease_token uuid,lease_until timestamptz,request_id text not null,created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 primary key(school_id,id),unique(school_id,id,learner_id),unique(school_id,actor_id,command_key),
 foreign key(school_id,actor_id)references app.memberships(school_id,actor_id),
 foreign key(school_id,baseline_result_id,learner_id)references app.result_revisions(school_id,id,learner_id),
 check(fingerprint~'^[a-f0-9]{64}$'),check(length(command_key)between 1 and 200),
 check(length(provider)between 1 and 100 and length(model)between 1 and 100 and length(prompt_id)between 1 and 100 and length(prompt_version)between 1 and 100 and length(request_id)between 1 and 200),
 check(jsonb_typeof(context_references)='object'and octet_length(context_references::text)<=4096),
 check(jsonb_typeof(tool_trace)='array'and jsonb_array_length(tool_trace)=1 and octet_length(tool_trace::text)<=4096),
 check(grounded_output is null or octet_length(grounded_output::text)<=8192),
 check((state='REASONING'and lease_token is not null and lease_until is not null and completed_at is null and evaluation_status='PENDING')or(state<>'REASONING'and lease_token is null and lease_until is null and completed_at is not null)),
 check((state='PROPOSAL_READY'and evaluation_status='PASSED'and grounded_output is not null and output_tokens between 0 and max_tokens and cost between 0 and max_cost and latency_ms>=0 and failure_code is null)or state<>'PROPOSAL_READY'),
 check((state='FAILED'and evaluation_status='FAILED'and failure_code is not null)or state<>'FAILED')
);
create index intelligence_runs_learner_idx on app.intelligence_runs(school_id,learner_id,id);
alter table app.recommendations add column generation_mode text not null default 'HUMAN';
alter table app.recommendations add column intelligence_run_id uuid;
alter table app.recommendations drop constraint recommendations_origin_check;
alter table app.recommendations add constraint recommendations_origin_check check(origin in('TEACHER_AUTHORED','AI_GENERATED'));
alter table app.recommendations add constraint recommendation_generation_provenance check((origin='TEACHER_AUTHORED'and generation_mode='HUMAN'and intelligence_run_id is null)or(origin='AI_GENERATED'and generation_mode in('FIXTURE','LIVE')and intelligence_run_id is not null));
alter table app.recommendations add foreign key(school_id,intelligence_run_id,learner_id)references app.intelligence_runs(school_id,id,learner_id);
create unique index recommendation_run_unique on app.recommendations(school_id,intelligence_run_id)where intelligence_run_id is not null;
create function internal.intelligence_run_immutable()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op<>'UPDATE'or old.state<>'REASONING' or (to_jsonb(new)-'state'-'grounded_output'-'output_tokens'-'cost'-'latency_ms'-'evaluation_status'-'failure_code'-'lease_token'-'lease_until'-'completed_at')is distinct from(to_jsonb(old)-'state'-'grounded_output'-'output_tokens'-'cost'-'latency_ms'-'evaluation_status'-'failure_code'-'lease_token'-'lease_until'-'completed_at')then raise exception 'Intelligence history immutable'using errcode='55000';end if;
 return new;
end$$;
create trigger intelligence_run_no_rewrite before update or delete on app.intelligence_runs for each row execute function internal.intelligence_run_immutable();
create trigger intelligence_run_no_truncate before truncate on app.intelligence_runs for each statement execute function internal.academic_history_immutable();
revoke execute on function internal.intelligence_run_immutable()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.recommendation_run_provenance()returns trigger language plpgsql security definer set search_path=''as $$
begin
 if new.origin='AI_GENERATED'and not exists(select 1 from app.intelligence_runs ir where ir.school_id=new.school_id and ir.id=new.intelligence_run_id and ir.learner_id=new.learner_id and ir.baseline_result_id=new.baseline_result_id and ir.generation_mode=new.generation_mode and ir.actor_id=new.created_by and ir.state in('REASONING','PROPOSAL_READY')and ir.context_references->>'referenceId'=new.reference_id::text and new.evidence_ids=array[(ir.context_references->>'evidenceId')::uuid])then raise exception 'Recommendation run provenance mismatch'using errcode='22023';end if;
 return new;
end$$;
create trigger recommendation_run_provenance before insert or update on app.recommendations for each row execute function internal.recommendation_run_provenance();
revoke execute on function internal.recommendation_run_provenance()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Purpose-limited read tool. It retrieves only current approved immutable numeric evidence.
create function internal.intelligence_context(baseline_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r app.result_revisions;ref app.school_custom_references;v app.school_custom_versions;ev app.academic_evidence;
begin
 if not"authorization".can_manage_baseline("authorization".school_id(),baseline_id)then raise exception 'Analysis source denied'using errcode='42501';end if;
 select*into r from app.result_revisions where school_id="authorization".school_id()and id=baseline_id;
 select*into ref from app.school_custom_references where school_id=r.school_id and id=r.reference_id;
 select*into v from app.school_custom_versions where school_id=ref.school_id and id=ref.version_id;
 select*into ev from app.academic_evidence where school_id=r.school_id and id=r.evidence_id;
 if r.id is null or ref.status is distinct from 'APPROVED'or v.source_type is distinct from 'SCHOOL_AUTHORED'or v.rights_status is distinct from 'PERMITTED'or v.version is distinct from r.reference_version or ev.result_id is distinct from r.id or ev.learner_id is distinct from r.learner_id or ev.source_object_id is distinct from r.submission_id or not exists(select 1 from app.current_results cr where cr.school_id=r.school_id and cr.result_id=r.id)then raise exception 'Approved current evidence required'using errcode='P0002';end if;
 return jsonb_build_object('resultId',r.id,'evidenceId',r.evidence_id,'referenceId',r.reference_id,'referenceVersion',r.reference_version,'score',r.score,'maxScore',r.max_score);
end$$;
create function internal.require_intelligence_policy(target_mode text,target_version integer)returns void language plpgsql security definer set search_path=''as $$
begin
 if target_mode is null or target_mode not in('FIXTURE','LIVE')or target_version is null or not exists(select 1 from app.intelligence_policies p where p.school_id="authorization".school_id()and p.version=target_version and p.purpose='NEXT_LEARNING_ACTION'and((target_mode='FIXTURE'and p.fixture_enabled)or(target_mode='LIVE'and p.live_enabled)))then raise exception 'Approved intelligence policy required'using errcode='22023';end if;
end$$;
create function internal.begin_intelligence_run(command_key text,request_fingerprint text,baseline_id uuid,settings jsonb,source_request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare context jsonb;r app.result_revisions;existing app.intelligence_runs;reservation jsonb;run_id uuid;token uuid;mode text;policy_version integer;
begin
 context:=internal.intelligence_context(baseline_id);
 if settings is null or jsonb_typeof(settings)<>'object'or settings-'mode'-'provider'-'model'-'promptId'-'promptVersion'-'policyVersion'-'timeoutMs'-'maxTokens'-'maxCost'<>'{}'::jsonb then raise exception 'Invalid intelligence configuration'using errcode='22023';end if;
 mode:=settings->>'mode';policy_version:=(settings->>'policyVersion')::integer;
 perform internal.require_intelligence_policy(mode,policy_version);
 if mode='FIXTURE'and(settings->>'provider'<>'deterministic-fixture'or settings->>'model'<>'source-locked-v1')then raise exception 'Fixture provider mismatch'using errcode='22023';end if;
 if (settings->>'timeoutMs')::integer not between 1 and 30000 or(settings->>'maxTokens')::integer not between 1 and 4000 or(settings->>'maxCost')::numeric<=0 or(settings->>'maxCost')::numeric>10 then raise exception 'Invalid intelligence limits'using errcode='22023';end if;
 reservation:=internal.begin_command(command_key,'intelligence.analyze',request_fingerprint);
 select*into existing from app.intelligence_runs ir where ir.school_id="authorization".school_id()and ir.actor_id="authorization".actor_id()and ir.command_key=begin_intelligence_run.command_key for update;
 if found then
  if existing.baseline_result_id<>baseline_id or existing.fingerprint<>request_fingerprint then raise exception 'Intelligence command mismatch'using errcode='22023';end if;
  perform internal.require_intelligence_policy(existing.generation_mode,existing.policy_version);
  if existing.state='PROPOSAL_READY'then return jsonb_build_object('state','COMPLETED','response',reservation->'response');end if;
  if existing.state='FAILED'then return jsonb_build_object('state','FAILED','failureCode',existing.failure_code);end if;
  if existing.lease_until<=clock_timestamp()then
   update app.intelligence_runs set state='FAILED',failure_code='INTELLIGENCE_TIMEOUT',evaluation_status='FAILED',lease_token=null,lease_until=null,completed_at=clock_timestamp()where school_id=existing.school_id and id=existing.id;
   perform internal.finish_command(command_key,'intelligence.analyze',request_fingerprint,jsonb_build_object('failureCode','INTELLIGENCE_TIMEOUT'));
   perform internal.append_audit('intelligence.failed','intelligence_run',existing.id,source_request_id,'failed',jsonb_build_object('code','INTELLIGENCE_TIMEOUT','generationMode',existing.generation_mode));
   return jsonb_build_object('state','FAILED','failureCode','INTELLIGENCE_TIMEOUT');
  end if;
  return jsonb_build_object('state','IN_PROGRESS','runId',existing.id);
 end if;
 if reservation->>'state'<>'NEW'then raise exception 'Missing durable intelligence run'using errcode='22023';end if;
 select*into r from app.result_revisions where school_id="authorization".school_id()and id=baseline_id;
 token:=gen_random_uuid();
 insert into app.intelligence_runs(school_id,actor_id,learner_id,baseline_result_id,command_key,fingerprint,purpose,data_classification,generation_mode,provider,model,prompt_id,prompt_version,policy_version,context_references,tool_trace,timeout_ms,max_tokens,max_cost,lease_token,lease_until,request_id)
 values(r.school_id,"authorization".actor_id(),r.learner_id,r.id,command_key,request_fingerprint,'NEXT_LEARNING_ACTION','SCHOOL_CUSTOM_NUMERIC',mode,settings->>'provider',settings->>'model',settings->>'promptId',settings->>'promptVersion',policy_version,context,
 jsonb_build_array(jsonb_build_object('name','assessment.get_current_numeric_evidence','schemaVersion',1,'capability','READ','risk','LOW','approvalRequired',false,'idempotency','READ_ONLY','audit','RUN_CONTEXT','scope','CURRENT_TEACHER_LEARNER','input',jsonb_build_object('baselineResultId',r.id),'evidenceIds',jsonb_build_array(r.evidence_id))),
 (settings->>'timeoutMs')::integer,(settings->>'maxTokens')::integer,(settings->>'maxCost')::numeric,token,clock_timestamp()+make_interval(secs=>ceil((settings->>'timeoutMs')::numeric/1000)::integer+15),source_request_id)returning id into run_id;
 perform internal.append_audit('intelligence.started','intelligence_run',run_id,source_request_id,'succeeded',jsonb_build_object('generationMode',mode,'policyVersion',policy_version));
 return jsonb_build_object('state','NEW','runId',run_id,'leaseToken',token,'context',context);
end$$;
create function internal.complete_intelligence_run(target_run uuid,current_lease uuid,output jsonb,usage jsonb,source_request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;r app.result_revisions;context jsonb;fact jsonb;action text;rid uuid;response jsonb;tokens integer;cost_amount numeric;latency integer;
begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run and actor_id="authorization".actor_id()for update;
 if not found then raise exception 'Analysis run denied'using errcode='42501';end if;
 context:=internal.intelligence_context(run.baseline_result_id);perform internal.require_intelligence_policy(run.generation_mode,run.policy_version);
 if run.state<>'REASONING'or run.lease_token is distinct from current_lease or run.lease_until<=clock_timestamp()or context<>run.context_references then raise exception 'Analysis lease or source changed'using errcode='22023';end if;
 if output is null or jsonb_typeof(output)<>'object'or output-'evidenceIds'-'facts'-'action'-'reason'-'limitation'<>'{}'::jsonb or jsonb_typeof(output->'facts')is distinct from 'array'or jsonb_array_length(output->'facts')<>1 or output->'evidenceIds' is distinct from jsonb_build_array(context->'evidenceId')or output->>'reason' is distinct from 'REVIEW_RECORDED_RESULT'or output->>'limitation' is distinct from 'SINGLE_RESULT_NOT_CAUSAL'then raise exception 'Ungrounded analysis output'using errcode='22023';end if;
 fact:=output->'facts'->0;
 if fact is null or fact-'kind'<>context or fact->>'kind' is distinct from 'NUMERIC_RESULT'then raise exception 'Invalid factual analysis'using errcode='22023';end if;
 action:=output->>'action';
 if action is null or not exists(select 1 from app.intelligence_policies p where p.school_id=run.school_id and action=any(p.allowed_actions))then raise exception 'Analysis action denied'using errcode='22023';end if;
 if usage is null or jsonb_typeof(usage)<>'object'or usage-'outputTokens'-'cost'-'latencyMs'<>'{}'::jsonb then raise exception 'Invalid intelligence usage'using errcode='22023';end if;
 tokens:=(usage->>'outputTokens')::integer;cost_amount:=(usage->>'cost')::numeric;latency:=(usage->>'latencyMs')::integer;
 if tokens is null or tokens not between 0 and run.max_tokens or cost_amount is null or cost_amount<0 or cost_amount>run.max_cost or latency is null or latency<0 or latency>run.timeout_ms+1000 then raise exception 'Intelligence usage exceeded'using errcode='22023';end if;
 select*into r from app.result_revisions where school_id=run.school_id and id=run.baseline_result_id;
 -- Server rendering controls every learner factual statement and curriculum/authority instruction.
 insert into app.recommendations(school_id,learner_id,reference_id,baseline_result_id,origin,generation_mode,intelligence_run_id,observation,interpretation,recommendation,rationale,uncertainty,activity_title,instructions,evidence_ids,created_by)
 values(r.school_id,r.learner_id,r.reference_id,r.id,'AI_GENERATED',run.generation_mode,run.id,
 'The released numeric result is '||r.score::text||' / '||r.max_score::text||'.',
 'This single result may inform a teacher-selected next learning action.',
 case when action='GUIDED_PRACTICE'then'Try teacher-reviewed guided practice for the approved objective.'else'Review the teacher feedback for the approved objective.'end,
 'The proposal refers to the cited released result and preserves its native scale.',
 'One result does not establish a cause or a learner trait. A teacher must review the proposed action.',
 case when action='GUIDED_PRACTICE'then'Guided practice'else'Review feedback'end,
 case when action='GUIDED_PRACTICE'then'Use a teacher-approved example for this objective, practise it, and explain your approach.'else'Review the teacher feedback and explain one next step with your teacher.'end,
 array[r.evidence_id],"authorization".actor_id())returning id into rid;
 update app.intelligence_runs set state='PROPOSAL_READY',grounded_output=output,output_tokens=tokens,cost=cost_amount,latency_ms=latency,evaluation_status='PASSED',lease_token=null,lease_until=null,completed_at=clock_timestamp()where school_id=run.school_id and id=run.id;
 select jsonb_build_object('id',q.id,'learnerId',q.learner_id,'referenceId',q.reference_id,'baselineResultId',q.baseline_result_id,'origin',q.origin,'generationMode',q.generation_mode,'intelligenceRunId',q.intelligence_run_id,'observation',q.observation,'evidenceIds',q.evidence_ids,'interpretation',q.interpretation,'recommendation',q.recommendation,'rationale',q.rationale,'uncertainty',q.uncertainty,'activityTitle',q.activity_title,'instructions',q.instructions,'status',q.status,'createdAt',q.created_at)into response from app.recommendations q where q.school_id=run.school_id and q.id=rid;
 perform internal.append_audit('intelligence.proposal_ready','intelligence_run',run.id,source_request_id,'succeeded',jsonb_build_object('generationMode',run.generation_mode,'recommendationId',rid,'evaluationStatus','PASSED'));
 perform internal.append_audit('recommendation.created','recommendation',rid,source_request_id,'succeeded',jsonb_build_object('intelligenceRunId',run.id,'generationMode',run.generation_mode));
 perform internal.enqueue_event('recommendation.created','recommendation',rid,1,jsonb_build_object('intelligenceRunId',run.id,'generationMode',run.generation_mode),'recommendation.created:'||rid::text);
 perform internal.finish_command(run.command_key,'intelligence.analyze',run.fingerprint,response);
 return response;
end$$;
create function internal.fail_intelligence_run(target_run uuid,current_lease uuid,error_code text,source_request_id text)returns void language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;
begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run and actor_id="authorization".actor_id()for update;
 if not found then raise exception 'Analysis run denied'using errcode='42501';end if;
 perform internal.intelligence_context(run.baseline_result_id);perform internal.require_intelligence_policy(run.generation_mode,run.policy_version);
 if run.state<>'REASONING'or run.lease_token is distinct from current_lease then raise exception 'Analysis lease changed'using errcode='22023';end if;
 if error_code is null or error_code not in('INTELLIGENCE_TIMEOUT','INTELLIGENCE_LIMIT_EXCEEDED','INTELLIGENCE_PROVIDER_FAILED','INTELLIGENCE_REQUIRES_REVIEW','INTELLIGENCE_INSUFFICIENT_EVIDENCE','INTELLIGENCE_UNAVAILABLE')then raise exception 'Invalid sanitized analysis failure'using errcode='22023';end if;
 update app.intelligence_runs set state='FAILED',failure_code=error_code,evaluation_status='FAILED',lease_token=null,lease_until=null,completed_at=clock_timestamp()where school_id=run.school_id and id=run.id;
 perform internal.append_audit('intelligence.failed','intelligence_run',run.id,source_request_id,'failed',jsonb_build_object('code',error_code,'generationMode',run.generation_mode));
 perform internal.finish_command(run.command_key,'intelligence.analyze',run.fingerprint,jsonb_build_object('failureCode',error_code));
end$$;
-- Runtime reads are scoped, privileged writes remain purpose-limited private functions.
alter table app.intelligence_policies enable row level security;alter table app.intelligence_policies force row level security;
alter table app.intelligence_runs enable row level security;alter table app.intelligence_runs force row level security;
create policy intelligence_policy_read on app.intelligence_policies for select to cuevo_api using("authorization".improvement_access(school_id)and"authorization".current_role(school_id)in('teacher','coordinator','admin'));
create policy intelligence_run_read on app.intelligence_runs for select to cuevo_api using("authorization".can_manage_baseline(school_id,baseline_result_id)and actor_id="authorization".actor_id());
grant select on app.intelligence_policies,app.intelligence_runs to cuevo_api;
revoke all on app.intelligence_policies,app.intelligence_runs from public,anon,authenticated,service_role,cuevo_worker;
revoke execute on function internal.intelligence_context(uuid),internal.require_intelligence_policy(text,integer),internal.begin_intelligence_run(text,text,uuid,jsonb,text),internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text),internal.fail_intelligence_run(uuid,uuid,text,text)from public,anon,authenticated,service_role,cuevo_worker;
grant execute on function internal.begin_intelligence_run(text,text,uuid,jsonb,text),internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text),internal.fail_intelligence_run(uuid,uuid,text,text)to cuevo_api;
revoke execute on function internal.intelligence_context(uuid),internal.require_intelligence_policy(text,integer)from cuevo_api;
commit;
