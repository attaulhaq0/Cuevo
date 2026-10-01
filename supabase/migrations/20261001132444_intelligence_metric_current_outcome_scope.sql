begin;
create or replace function internal.read_intelligence_metrics(window_days integer,target_mode text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();completed integer;failed integer;grounded integer;decided integer;approved integer;finished integer;measured integer;improved integer;latency numeric;cost_total numeric;answer jsonb;
begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)not in('admin','teacher')then raise exception 'Intelligence metrics denied'using errcode='42501';end if;
 if window_days is null or window_days not between 1 and 365 or target_mode is null or target_mode not in('FIXTURE','LIVE')then raise exception 'Bounded metric window required'using errcode='22023';end if;
 with runs as materialized(
  select run.*from app.intelligence_runs run join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  where run.school_id=school and run.generation_mode=target_mode and run.created_at>=clock_timestamp()-make_interval(days=>window_days)
   and internal.insight_result_allowed(school,baseline.id,baseline.learner_id,assessment.course_id,baseline.reference_id,baseline.reference_version,true)
 ),sources as materialized(
  select run.state,run.evaluation_status,run.latency_ms,run.cost,proposal.status proposal_status,intervention.status intervention_status,outcome.status outcome_status
  from runs run
  join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id
  join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id
  left join app.recommendations proposal on proposal.school_id=run.school_id and proposal.intelligence_run_id=run.id
  left join app.interventions intervention on intervention.school_id=proposal.school_id and intervention.recommendation_id=proposal.id
   and"authorization".can_access_intervention(school,intervention.id,true)
   and(intervention.follow_up_assessment_id is null or exists(select 1 from app.assessments followup where followup.school_id=school and followup.id=intervention.follow_up_assessment_id and followup.course_id=assessment.course_id and"authorization".can_read_course(school,followup.course_id)and"authorization".programme_course_allowed(school,followup.course_id,baseline.learner_id)))
  left join app.outcome_measurements outcome on outcome.school_id=intervention.school_id and outcome.intervention_id=intervention.id
   and internal.insight_outcome_allowed(school,outcome.id,baseline.learner_id,assessment.course_id,baseline.reference_id,baseline.reference_version)
 )select count(*)filter(where state='PROPOSAL_READY'),count(*)filter(where state='FAILED'),count(*)filter(where evaluation_status='PASSED'),count(*)filter(where proposal_status in('APPROVED','REJECTED')),count(*)filter(where proposal_status='APPROVED'),count(*)filter(where intervention_status in('COMPLETED','MEASURED')),count(*)filter(where outcome_status is not null),count(*)filter(where outcome_status='improved'),avg(latency_ms)filter(where state='PROPOSAL_READY'),coalesce(sum(cost)filter(where state='PROPOSAL_READY'),0)
 into completed,failed,grounded,decided,approved,finished,measured,improved,latency,cost_total from sources;
 answer:=jsonb_build_object('windowDays',window_days,'mode',target_mode,'scope','CURRENT_AUTHORIZED_RUNS','completedRuns',completed,'failedRuns',failed,'groundedResponse',jsonb_build_object('numerator',grounded,'denominator',completed,'rate',case when completed=0 then null else grounded::numeric/completed end),'acceptance',jsonb_build_object('numerator',approved,'denominator',decided,'rate',case when decided=0 then null else approved::numeric/decided end),'completion',jsonb_build_object('numerator',finished,'denominator',approved,'rate',case when approved=0 then null else finished::numeric/approved end),'observedImprovement',jsonb_build_object('numerator',improved,'denominator',measured,'rate',case when measured=0 then null else improved::numeric/measured end),'meanLatencyMs',latency,'totalCost',cost_total,'costPerApprovedWorkflow',case when approved=0 then null else cost_total/approved end,'unsupportedClaimRate',null,'unauthorizedContextLeakageRate',null,'invalidToolCallRate',null,'humanOverrideRate',null,'unknownMetricReason','NO_DEDICATED_OBSERVATION_DENOMINATOR');return answer;
end$$;
revoke execute on function internal.read_intelligence_metrics(integer,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_metrics(integer,text)to cuevo_api;
commit;
