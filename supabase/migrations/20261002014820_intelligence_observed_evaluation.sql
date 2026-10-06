begin;
create table internal.intelligence_output_observations(
 school_id uuid not null,run_id uuid not null,outcome text not null check(outcome in('ACCEPTED','REJECTED','NOT_EVALUATED')),
 observed_at timestamptz not null default clock_timestamp(),primary key(school_id,run_id),
 foreign key(school_id,run_id)references app.intelligence_runs(school_id,id));
create table internal.intelligence_quality_reviews(
 school_id uuid not null,id uuid not null default gen_random_uuid(),run_id uuid not null,reviewer_id uuid not null,
 usefulness text not null check(usefulness in('USEFUL','NOT_USEFUL','UNKNOWN')),
 grounding text not null check(grounding in('SUPPORTED','UNSUPPORTED_CLAIM_OBSERVED','UNKNOWN')),
 privacy text not null check(privacy in('NO_ISSUE_OBSERVED','CONTEXT_ISSUE_OBSERVED','UNKNOWN')),
 tool_safety text not null check(tool_safety in('NO_ISSUE_OBSERVED','INVALID_TOOL_OBSERVED','UNKNOWN')),
 reason text not null check(length(btrim(reason))between 1 and 1000),created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),unique(school_id,run_id,reviewer_id),foreign key(school_id,run_id)references app.intelligence_runs(school_id,id),
 foreign key(school_id,reviewer_id)references app.memberships(school_id,actor_id));
create table internal.intelligence_decision_observations(
 school_id uuid not null,run_id uuid not null,decision_id uuid not null,overridden boolean not null,
 observed_at timestamptz not null default clock_timestamp(),primary key(school_id,run_id),
 foreign key(school_id,run_id)references app.intelligence_runs(school_id,id),foreign key(school_id,decision_id)references app.human_decisions(school_id,id));
do $$declare tab text;begin foreach tab in array array['intelligence_output_observations','intelligence_quality_reviews','intelligence_decision_observations']loop
 execute format('alter table internal.%I enable row level security',tab);execute format('alter table internal.%I force row level security',tab);
 execute format('create trigger observation_immutable before update or delete on internal.%I for each row execute function internal.academic_history_immutable()',tab);
 execute format('create trigger observation_no_truncate before truncate on internal.%I for each statement execute function internal.academic_history_immutable()',tab);
 execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);
end loop;end$$;
-- New terminal runs receive an observation in the same durable transition. Older
-- terminal history remains unobserved and is not assigned inferred quality.
create function internal.observe_intelligence_terminal()returns trigger language plpgsql security definer set search_path=''as $$begin
 if old.state='REASONING'and new.state<>'REASONING'then
  insert into internal.intelligence_output_observations(school_id,run_id,outcome)values(new.school_id,new.id,case when new.state='PROPOSAL_READY'then'ACCEPTED'else'NOT_EVALUATED'end)on conflict(school_id,run_id)do nothing;
 end if;return new;end$$;
create trigger intelligence_terminal_observation after update on app.intelligence_runs for each row execute function internal.observe_intelligence_terminal();
-- A received output rejection is explicitly recorded before the established
-- failure command. If that command fails, both writes roll back atomically.
create function internal.fail_intelligence_run(target_run uuid,current_lease uuid,error_code text,source_request_id text,output_rejected boolean)returns void language plpgsql security definer set search_path=''as $$declare run app.intelligence_runs;begin
 if output_rejected is null or(output_rejected and error_code is distinct from'INTELLIGENCE_REQUIRES_REVIEW')then raise exception 'Invalid output observation'using errcode='22023';end if;
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run and actor_id="authorization".actor_id()for update;
 if not found or run.state<>'REASONING'or run.lease_token is distinct from current_lease then raise exception 'Output observation source denied'using errcode='42501';end if;
 perform internal.require_stored_insight_scope(target_run);
 if output_rejected then insert into internal.intelligence_output_observations(school_id,run_id,outcome)values(run.school_id,run.id,'REJECTED');end if;
 perform internal.fail_intelligence_run(target_run,current_lease,error_code,source_request_id);
end$$;
create function internal.read_intelligence_quality_review(target_run uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare run app.intelligence_runs;review internal.intelligence_quality_reviews;begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run;
 if not found or run.state<>'PROPOSAL_READY'or"authorization".current_role(run.school_id)not in('teacher','admin')then raise exception 'Human review source denied'using errcode='42501';end if;
 perform internal.require_stored_insight_scope(target_run);
 select*into review from internal.intelligence_quality_reviews where school_id=run.school_id and run_id=run.id and reviewer_id="authorization".actor_id();
 return jsonb_build_object('id',run.id,'runId',run.id,'review',case when review.id is null then null else jsonb_build_object('id',review.id,'runId',review.run_id,'reviewerId',review.reviewer_id,'usefulness',review.usefulness,'grounding',review.grounding,'privacy',review.privacy,'toolSafety',review.tool_safety,'reason',review.reason,'createdAt',review.created_at)end);
end$$;
create function internal.record_intelligence_quality_review(target_run uuid,input jsonb,command_key text,fingerprint text,request_id text)returns void language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();run app.intelligence_runs;reservation jsonb;review_id uuid;begin
 if input is null or jsonb_typeof(input)<>'object'or not(input?&array['usefulness','grounding','privacy','toolSafety','confirmReview','reason'])or input-'usefulness'-'grounding'-'privacy'-'toolSafety'-'confirmReview'-'reason'<>'{}'::jsonb
  or input->'confirmReview'is distinct from'true'::jsonb or input->>'usefulness'is null or input->>'usefulness'not in('USEFUL','NOT_USEFUL','UNKNOWN')or input->>'grounding'is null or input->>'grounding'not in('SUPPORTED','UNSUPPORTED_CLAIM_OBSERVED','UNKNOWN')
  or input->>'privacy'is null or input->>'privacy'not in('NO_ISSUE_OBSERVED','CONTEXT_ISSUE_OBSERVED','UNKNOWN')or input->>'toolSafety'is null or input->>'toolSafety'not in('NO_ISSUE_OBSERVED','INVALID_TOOL_OBSERVED','UNKNOWN')
  or jsonb_typeof(input->'reason')is distinct from'string'or length(btrim(input->>'reason'))not between 1 and 1000 then raise exception 'Explicit structured human review required'using errcode='22023';end if;
 select*into run from app.intelligence_runs where school_id=school and id=target_run for update;
 if not found or run.state<>'PROPOSAL_READY'or"authorization".current_role(school)not in('teacher','admin')then raise exception 'Human review source denied'using errcode='42501';end if;
 perform internal.require_stored_insight_scope(target_run);
 reservation:=internal.begin_command(command_key,'intelligence.quality.review',fingerprint);if reservation->>'state'='COMPLETED'then return;end if;
 if exists(select 1 from internal.intelligence_quality_reviews where school_id=school and run_id=run.id and reviewer_id="authorization".actor_id())then raise exception 'Human quality review is immutable'using errcode='22023';end if;
 insert into internal.intelligence_quality_reviews(school_id,run_id,reviewer_id,usefulness,grounding,privacy,tool_safety,reason)values(school,run.id,"authorization".actor_id(),input->>'usefulness',input->>'grounding',input->>'privacy',input->>'toolSafety',input->>'reason')returning id into review_id;
 perform internal.append_audit('intelligence.quality.reviewed','intelligence_run',run.id,request_id,'succeeded',jsonb_build_object('reviewId',review_id));
 perform internal.finish_command(command_key,'intelligence.quality.review',fingerprint,jsonb_build_object('id',review_id,'runId',run.id));
end$$;
-- Rejection and changed approved content are observed overrides. A decision is
-- never an inferred quality judgment, and old decisions stay unobserved.
create function internal.observe_intelligence_decision()returns trigger language plpgsql security definer set search_path=''as $$declare decision app.human_decisions;proposal app.recommendations;changed boolean;begin
 select*into proposal from app.recommendations where school_id=new.school_id and id=new.recommendation_id;
 if proposal.intelligence_run_id is null then return new;end if;
 if tg_table_name='human_decisions'then
  if new.decision<>'REJECT'then return new;end if;decision:=new;changed:=true;
 else
  select*into decision from app.human_decisions where school_id=new.school_id and recommendation_id=new.recommendation_id;
  if decision.id is null or decision.decision<>'APPROVE'then raise exception 'Approved decision observation missing'using errcode='22023';end if;
  changed:=new.title is distinct from proposal.activity_title or new.instructions is distinct from proposal.instructions;
 end if;
 insert into internal.intelligence_decision_observations(school_id,run_id,decision_id,overridden)values(new.school_id,proposal.intelligence_run_id,decision.id,changed);return new;
end$$;
create trigger intelligence_rejected_decision after insert on app.human_decisions for each row execute function internal.observe_intelligence_decision();
create trigger intelligence_approved_decision after insert on app.interventions for each row execute function internal.observe_intelligence_decision();
create function internal.intelligence_evaluation_source_allowed(target_run uuid)returns boolean language plpgsql stable security definer set search_path=''as $$begin
 perform internal.require_stored_insight_scope(target_run);return true;
 exception when insufficient_privilege or no_data_found or invalid_parameter_value then return false;
end$$;
create function internal.read_intelligence_evaluation(window_days integer,target_mode text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();assessed integer;accepted integer;unevaluated integer;unobserved integer;reviews integer;useful integer;useful_den integer;unsupported integer;grounding_den integer;privacy_issue integer;privacy_den integer;invalid_tool integer;tool_den integer;overrides integer;decision_den integer;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)not in('admin','teacher')then raise exception 'Evaluation metrics denied'using errcode='42501';end if;
 if window_days is null or window_days not between 1 and 365 or target_mode is null or target_mode not in('FIXTURE','LIVE')then raise exception 'Bounded evaluation window required'using errcode='22023';end if;
 with runs as materialized(select run.*from app.intelligence_runs run join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
   and internal.insight_result_allowed(school,baseline.id,baseline.learner_id,assessment.course_id,baseline.reference_id,baseline.reference_version,true)and internal.intelligence_evaluation_source_allowed(run.id))
 select count(*)filter(where observation.outcome in('ACCEPTED','REJECTED')),count(*)filter(where observation.outcome='ACCEPTED'),count(*)filter(where observation.outcome='NOT_EVALUATED'),count(*)filter(where run.state<>'REASONING'and observation.run_id is null)
 into assessed,accepted,unevaluated,unobserved from runs run left join internal.intelligence_output_observations observation on observation.school_id=run.school_id and observation.run_id=run.id;
 with runs as materialized(select run.id from app.intelligence_runs run join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
   and internal.insight_result_allowed(school,baseline.id,baseline.learner_id,assessment.course_id,baseline.reference_id,baseline.reference_version,true)and internal.intelligence_evaluation_source_allowed(run.id))
 select count(*),count(*)filter(where review.usefulness='USEFUL'),count(*)filter(where review.usefulness<>'UNKNOWN'),count(*)filter(where review.grounding='UNSUPPORTED_CLAIM_OBSERVED'),count(*)filter(where review.grounding<>'UNKNOWN'),count(*)filter(where review.privacy='CONTEXT_ISSUE_OBSERVED'),count(*)filter(where review.privacy<>'UNKNOWN'),count(*)filter(where review.tool_safety='INVALID_TOOL_OBSERVED'),count(*)filter(where review.tool_safety<>'UNKNOWN')
 into reviews,useful,useful_den,unsupported,grounding_den,privacy_issue,privacy_den,invalid_tool,tool_den from internal.intelligence_quality_reviews review join runs run on run.id=review.run_id where review.school_id=school;
 with runs as materialized(select run.id from app.intelligence_runs run join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
   and internal.insight_result_allowed(school,baseline.id,baseline.learner_id,assessment.course_id,baseline.reference_id,baseline.reference_version,true)and internal.intelligence_evaluation_source_allowed(run.id))
 select count(*)filter(where observation.overridden),count(*)into overrides,decision_den from internal.intelligence_decision_observations observation join runs run on run.id=observation.run_id where observation.school_id=school;
 return jsonb_build_object('scope','CURRENT_AUTHORIZED_RUNS','structuralAcceptance',jsonb_build_object('numerator',accepted,'denominator',assessed,'rate',case when assessed=0 then null else accepted::numeric/assessed end),'unevaluatedAttempts',unevaluated,'legacyUnobservedRuns',unobserved,'humanReviewCount',reviews,
  'usefulness',jsonb_build_object('numerator',useful,'denominator',useful_den,'rate',case when useful_den=0 then null else useful::numeric/useful_den end),
  'unsupportedClaim',jsonb_build_object('numerator',unsupported,'denominator',grounding_den,'rate',case when grounding_den=0 then null else unsupported::numeric/grounding_den end),
  'privacyIssue',jsonb_build_object('numerator',privacy_issue,'denominator',privacy_den,'rate',case when privacy_den=0 then null else privacy_issue::numeric/privacy_den end),
  'invalidTool',jsonb_build_object('numerator',invalid_tool,'denominator',tool_den,'rate',case when tool_den=0 then null else invalid_tool::numeric/tool_den end),
  'humanOverride',jsonb_build_object('numerator',overrides,'denominator',decision_den,'rate',case when decision_den=0 then null else overrides::numeric/decision_den end),'limitation','OBSERVED_SAMPLE_NOT_QUALITY_CERTIFICATION');
end$$;
do $$declare definition text;anchor text:='return answer;';begin
 definition:=pg_get_functiondef('internal.read_intelligence_metrics(integer,text)'::regprocedure);if position(anchor in definition)=0 then raise exception 'Intelligence metric return changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'answer:=answer||jsonb_build_object(''evaluation'',internal.read_intelligence_evaluation(window_days,target_mode));'||anchor);execute definition;
end$$;
revoke execute on function internal.observe_intelligence_terminal(),internal.observe_intelligence_decision(),internal.fail_intelligence_run(uuid,uuid,text,text,boolean),internal.read_intelligence_quality_review(uuid),internal.record_intelligence_quality_review(uuid,jsonb,text,text,text),internal.read_intelligence_evaluation(integer,text),internal.intelligence_evaluation_source_allowed(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.fail_intelligence_run(uuid,uuid,text,text,boolean),internal.read_intelligence_quality_review(uuid),internal.record_intelligence_quality_review(uuid,jsonb,text,text,text)to cuevo_api;
commit;
