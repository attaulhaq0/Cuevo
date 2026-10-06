begin;
-- Ignored profiling candidate: preserve current source admission and reuse it across separate denominators.
CREATE OR REPLACE FUNCTION internal.read_intelligence_evaluation(window_days integer, target_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare school uuid:="authorization".school_id();assessed integer;accepted integer;unevaluated integer;unobserved integer;reviews integer;useful integer;useful_den integer;unsupported integer;grounding_den integer;privacy_issue integer;privacy_den integer;invalid_tool integer;tool_den integer;overrides integer;decision_den integer;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)not in('admin','teacher')then raise exception 'Evaluation metrics denied'using errcode='42501';end if;
 if window_days is null or window_days not between 1 and 365 or target_mode is null or target_mode not in('FIXTURE','LIVE')then raise exception 'Bounded evaluation window required'using errcode='22023';end if;
 with candidates as materialized(
  select run.*from app.intelligence_runs run
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
 ),baseline_sources as materialized(
  select baseline.*,assessment.course_id as baseline_course_id
  from internal.improvement_result_sources baseline
  join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where baseline.school_id=school and baseline.id in(select candidate.baseline_result_id from candidates candidate)
 ),baseline_scoped as materialized(
  select baseline.*from baseline_sources baseline
  where internal.insight_result_allowed(school,baseline.id,baseline.learner_id,baseline.baseline_course_id,baseline.reference_id,baseline.reference_version,true)
 ),matched_runs as materialized(
  select run.*from candidates run
  join baseline_scoped baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id
 ),runs as materialized(
  select run.*from matched_runs run
  where internal.intelligence_evaluation_source_allowed(run.id)
 ),output_counts as(
  select count(*)filter(where observation.outcome in('ACCEPTED','REJECTED')) assessed_count,
   count(*)filter(where observation.outcome='ACCEPTED') accepted_count,
   count(*)filter(where observation.outcome='NOT_EVALUATED') unevaluated_count,
   count(*)filter(where run.state<>'REASONING'and observation.run_id is null) unobserved_count
  from runs run left join internal.intelligence_output_observations observation on observation.school_id=run.school_id and observation.run_id=run.id
 ),review_counts as(
  select count(*) reviews_count,
   count(*)filter(where review.usefulness='USEFUL') useful_count,
   count(*)filter(where review.usefulness<>'UNKNOWN') useful_den_count,
   count(*)filter(where review.grounding='UNSUPPORTED_CLAIM_OBSERVED') unsupported_count,
   count(*)filter(where review.grounding<>'UNKNOWN') grounding_den_count,
   count(*)filter(where review.privacy='CONTEXT_ISSUE_OBSERVED') privacy_issue_count,
   count(*)filter(where review.privacy<>'UNKNOWN') privacy_den_count,
   count(*)filter(where review.tool_safety='INVALID_TOOL_OBSERVED') invalid_tool_count,
   count(*)filter(where review.tool_safety<>'UNKNOWN') tool_den_count
  from internal.intelligence_quality_reviews review join runs run on run.id=review.run_id where review.school_id=school
 ),decision_counts as(
  select count(*)filter(where observation.overridden) overrides_count,count(*) decision_den_count
  from internal.intelligence_decision_observations observation join runs run on run.id=observation.run_id where observation.school_id=school
 )
 select output_counts.assessed_count,output_counts.accepted_count,output_counts.unevaluated_count,output_counts.unobserved_count,
  review_counts.reviews_count,review_counts.useful_count,review_counts.useful_den_count,review_counts.unsupported_count,review_counts.grounding_den_count,
  review_counts.privacy_issue_count,review_counts.privacy_den_count,review_counts.invalid_tool_count,review_counts.tool_den_count,
  decision_counts.overrides_count,decision_counts.decision_den_count
 into assessed,accepted,unevaluated,unobserved,reviews,useful,useful_den,unsupported,grounding_den,privacy_issue,privacy_den,invalid_tool,tool_den,overrides,decision_den
 from output_counts cross join review_counts cross join decision_counts;
 return jsonb_build_object('scope','CURRENT_AUTHORIZED_RUNS','structuralAcceptance',jsonb_build_object('numerator',accepted,'denominator',assessed,'rate',case when assessed=0 then null else accepted::numeric/assessed end),'unevaluatedAttempts',unevaluated,'legacyUnobservedRuns',unobserved,'humanReviewCount',reviews,
  'usefulness',jsonb_build_object('numerator',useful,'denominator',useful_den,'rate',case when useful_den=0 then null else useful::numeric/useful_den end),
  'unsupportedClaim',jsonb_build_object('numerator',unsupported,'denominator',grounding_den,'rate',case when grounding_den=0 then null else unsupported::numeric/grounding_den end),
  'privacyIssue',jsonb_build_object('numerator',privacy_issue,'denominator',privacy_den,'rate',case when privacy_den=0 then null else privacy_issue::numeric/privacy_den end),
  'invalidTool',jsonb_build_object('numerator',invalid_tool,'denominator',tool_den,'rate',case when tool_den=0 then null else invalid_tool::numeric/tool_den end),
  'humanOverride',jsonb_build_object('numerator',overrides,'denominator',decision_den,'rate',case when decision_den=0 then null else overrides::numeric/decision_den end),'limitation','OBSERVED_SAMPLE_NOT_QUALITY_CERTIFICATION');
end$function$;

-- Ignored profiling candidate: bound native source expansion to filtered run baseline identities.
CREATE OR REPLACE FUNCTION internal.read_intelligence_metrics(window_days integer, target_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare school uuid:="authorization".school_id();completed integer;failed integer;grounded integer;decided integer;approved integer;finished integer;measured integer;improved integer;latency numeric;cost_total numeric;reserved_total numeric;unknown_cost integer;estimated_count integer;answer jsonb;
begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)not in('admin','teacher')then raise exception 'Intelligence metrics denied'using errcode='42501';end if;
 if window_days is null or window_days not between 1 and 365 or target_mode is null or target_mode not in('FIXTURE','LIVE')then raise exception 'Bounded metric window required'using errcode='22023';end if;
 with candidates as materialized(
  select run.*from app.intelligence_runs run
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
 ),baseline_sources as materialized(
  select baseline.*,assessment.course_id as baseline_course_id
  from internal.improvement_result_sources baseline
  join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where baseline.school_id=school and baseline.id in(select candidate.baseline_result_id from candidates candidate)
 ),baseline_scoped as materialized(
  select baseline.*from baseline_sources baseline
  where internal.insight_result_allowed(school,baseline.id,baseline.learner_id,baseline.baseline_course_id,baseline.reference_id,baseline.reference_version,true)
 ),runs as materialized(
  select run.*,baseline.learner_id as baseline_learner_id,baseline.baseline_course_id,
   baseline.reference_id as baseline_reference_id,baseline.reference_version as baseline_reference_version
  from candidates run join baseline_scoped baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id
 ),sources as materialized(
  select run.state,run.evaluation_status,run.latency_ms,run.cost,run.cost_basis,run.reserved_budget,proposal.status proposal_status,intervention.status intervention_status,case when outcome.model='numeric'then outcome.status else null end outcome_status
  from runs run
  left join app.recommendations proposal on proposal.school_id=run.school_id and proposal.intelligence_run_id=run.id
  left join app.interventions intervention on intervention.school_id=proposal.school_id and intervention.recommendation_id=proposal.id
   and"authorization".can_access_intervention(school,intervention.id,true)
   and(intervention.follow_up_assessment_id is null or exists(select 1 from app.assessments followup where followup.school_id=school and followup.id=intervention.follow_up_assessment_id and followup.course_id=run.baseline_course_id and"authorization".can_read_course(school,followup.course_id)and"authorization".programme_course_allowed(school,followup.course_id,run.baseline_learner_id)))
  left join app.outcome_measurements outcome on outcome.school_id=intervention.school_id and outcome.intervention_id=intervention.id
   and internal.insight_outcome_allowed(school,outcome.id,run.baseline_learner_id,run.baseline_course_id,run.baseline_reference_id,run.baseline_reference_version)
 )select count(*)filter(where state='PROPOSAL_READY'),count(*)filter(where state='FAILED'),count(*)filter(where evaluation_status='PASSED'),count(*)filter(where proposal_status in('APPROVED','REJECTED')),count(*)filter(where proposal_status='APPROVED'),count(*)filter(where intervention_status in('COMPLETED','MEASURED')),count(*)filter(where outcome_status is not null),count(*)filter(where outcome_status='improved'),avg(latency_ms)filter(where state='PROPOSAL_READY'),coalesce(sum(cost)filter(where state='PROPOSAL_READY'and cost_basis in('DETERMINISTIC_FIXTURE','CONFIGURED_TOKEN_RATES')),0),coalesce(sum(reserved_budget)filter(where cost_basis='BUDGET_RESERVATION'or state='FAILED'and reserved_budget>0),0),count(*)filter(where cost_basis in('BUDGET_RESERVATION','CONFIGURED_TOKEN_RATES','LEGACY_UNSPECIFIED')or state='FAILED'and reserved_budget>0),count(*)filter(where state='PROPOSAL_READY'and cost_basis in('DETERMINISTIC_FIXTURE','CONFIGURED_TOKEN_RATES'))
 into completed,failed,grounded,decided,approved,finished,measured,improved,latency,cost_total,reserved_total,unknown_cost,estimated_count from sources;
 answer:=jsonb_build_object('windowDays',window_days,'mode',target_mode,'scope','CURRENT_AUTHORIZED_RUNS','completedRuns',completed,'failedRuns',failed,'groundedResponse',jsonb_build_object('numerator',grounded,'denominator',completed,'rate',case when completed=0 then null else grounded::numeric/completed end),'acceptance',jsonb_build_object('numerator',approved,'denominator',decided,'rate',case when decided=0 then null else approved::numeric/decided end),'completion',jsonb_build_object('numerator',finished,'denominator',approved,'rate',case when approved=0 then null else finished::numeric/approved end),'observedImprovement',jsonb_build_object('numerator',improved,'denominator',measured,'rate',case when measured=0 then null else improved::numeric/measured end),'meanLatencyMs',latency,'totalCost',cost_total,'costPerApprovedWorkflow',case when approved=0 or unknown_cost>0 then null else cost_total/approved end,'costAccounting',jsonb_build_object('basis','CONFIGURED_ESTIMATES_ONLY','estimatedRuns',estimated_count,'reservedBudget',reserved_total,'unknownBilledCostRuns',unknown_cost,'billedCost',null),'unsupportedClaimRate',null,'unauthorizedContextLeakageRate',null,'invalidToolCallRate',null,'humanOverrideRate',null,'unknownMetricReason','NO_DEDICATED_OBSERVATION_DENOMINATOR');answer:=answer||jsonb_build_object('evaluation',internal.read_intelligence_evaluation(window_days,target_mode));return answer;
end$function$;

revoke execute on function internal.read_intelligence_metrics(integer,text),internal.read_intelligence_evaluation(integer,text) from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_metrics(integer,text) to cuevo_api;
commit;
