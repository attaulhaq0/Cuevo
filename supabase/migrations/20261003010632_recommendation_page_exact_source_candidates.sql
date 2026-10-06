-- Exact source candidates must be materialized before limited verdict-map access.
-- SQL predicate order is not authority; unrelated rows must not consume map keys.
begin;
create or replace function internal.page_can_read_academic_source(target_school uuid,target_learner uuid,parent_allowed boolean,target_assessment uuid,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select assessment.course_id from app.assessments assessment where assessment.school_id=target_school and assessment.id=target_assessment)
 select coalesce(internal.recommendation_page_verdict(page_verdicts,'ACADEMIC_READ',jsonb_build_array(target_school,target_learner,parent_allowed))and exists(select 1 from candidate
  where internal.recommendation_page_verdict(page_verdicts,'COURSE_READ',jsonb_build_array(target_school,candidate.course_id))
   and internal.recommendation_page_verdict(page_verdicts,'PROGRAMME_COURSE',jsonb_build_array(target_school,candidate.course_id,target_learner))
   and("authorization".current_role(target_school)in('admin','coordinator','parent')or internal.recommendation_page_verdict(page_verdicts,'LEARNER_COURSE',jsonb_build_array(target_school,candidate.course_id,target_learner)))),false)
$$;
create or replace function internal.page_can_mark_submission(target_school uuid,target_submission uuid,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select submission.learner_id,assessment.course_id from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id where submission.school_id=target_school and submission.id=target_submission)
 select coalesce("authorization".academic_access(target_school)and"authorization".current_role(target_school)in('teacher','admin')and exists(select 1 from candidate
  where internal.recommendation_page_verdict(page_verdicts,'COURSE_MANAGE',jsonb_build_array(target_school,candidate.course_id))
   and internal.recommendation_page_verdict(page_verdicts,'PERSON',jsonb_build_array(target_school,candidate.learner_id))
   and internal.recommendation_page_verdict(page_verdicts,'LEARNER_COURSE',jsonb_build_array(target_school,candidate.course_id,candidate.learner_id))),false)
$$;
create or replace function internal.page_native_academic_source_allowed(target_school uuid,target_result uuid,require_current boolean,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(
  select source.*,coalesce(numeric.submission_id,rubric.submission_id)as submission_id,assessment.id as assessment_id,assessment.course_id,
   internal.result_parent_published(target_school,source.id)as parent_visible
  from internal.academic_result_sources source left join app.result_revisions numeric on numeric.school_id=source.school_id and numeric.id=source.numeric_result_id left join app.rubric_result_revisions rubric on rubric.school_id=source.school_id and rubric.id=source.rubric_result_id
  join app.assessments assessment on assessment.school_id=source.school_id and assessment.id=coalesce(numeric.assessment_id,rubric.assessment_id)
  join app.school_custom_references reference on reference.school_id=source.school_id and reference.id=coalesce(numeric.reference_id,rubric.reference_id)join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
  where source.school_id=target_school and source.id=target_result and require_current is not null and reference.status='APPROVED'and version.version=coalesce(numeric.reference_version,rubric.reference_version)
   and((source.model='numeric'and exists(select 1 from app.academic_evidence evidence where evidence.school_id=target_school and evidence.id=numeric.evidence_id and evidence.result_id=numeric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=numeric.submission_id and evidence.reference_id=numeric.reference_id and evidence.reference_version=numeric.reference_version and evidence.policy_version=numeric.policy_version))or(source.model='rubric'and exists(select 1 from app.rubric_evidence evidence where evidence.school_id=target_school and evidence.id=rubric.evidence_id and evidence.result_id=rubric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=rubric.submission_id and evidence.reference_id=rubric.reference_id and evidence.reference_version=rubric.reference_version and evidence.policy_version=rubric.policy_version)))
   and(not require_current or(exists(select 1 from app.current_submissions current_submission where current_submission.school_id=target_school and current_submission.submission_id=coalesce(numeric.submission_id,rubric.submission_id))and((source.model='numeric'and exists(select 1 from app.current_results current_result where current_result.school_id=target_school and current_result.result_id=numeric.id))or(source.model='rubric'and exists(select 1 from app.current_rubric_results current_result where current_result.school_id=target_school and current_result.result_id=rubric.id)))))
 )select coalesce(exists(select 1 from candidate where internal.page_can_read_academic_source(target_school,candidate.learner_id,candidate.parent_visible,candidate.assessment_id,page_verdicts)
  and(not require_current or internal.recommendation_page_verdict(page_verdicts,'LEARNER_COURSE',jsonb_build_array(target_school,candidate.course_id,candidate.learner_id)))),false)
$$;
create or replace function internal.page_can_manage_baseline(target_school uuid,target_result uuid,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select result.id,result.submission_id from internal.improvement_result_sources result where result.school_id=target_school and result.id=target_result)
 select coalesce("authorization".improvement_access(target_school)and exists(select 1 from candidate where internal.page_can_mark_submission(target_school,candidate.submission_id,page_verdicts)and internal.page_native_academic_source_allowed(target_school,candidate.id,true,page_verdicts)),false)
$$;
create or replace function internal.page_insight_result_allowed(target_school uuid,target_result uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text,require_current boolean,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(
  select result.id,assessment.course_id,result.learner_id from internal.improvement_result_sources result
  join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id
  join internal.improvement_evidence_sources evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id
  join app.school_custom_references reference on reference.school_id=result.school_id and reference.id=result.reference_id
  join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
  where result.school_id=target_school and result.id=target_result and result.learner_id=target_learner and assessment.course_id=target_course and result.reference_id=target_reference and result.reference_version=target_version and reference.status='APPROVED'and version.version=result.reference_version
   and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id
   and(not require_current or exists(select 1 from internal.improvement_current_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id))
 )select coalesce(exists(select 1 from candidate where internal.page_can_manage_baseline(target_school,candidate.id,page_verdicts)
  and internal.recommendation_page_verdict(page_verdicts,'COURSE_READ',jsonb_build_array(target_school,candidate.course_id))and internal.recommendation_page_verdict(page_verdicts,'PROGRAMME_COURSE',jsonb_build_array(target_school,candidate.course_id,candidate.learner_id))),false)
$$;
create or replace function internal.page_insight_outcome_allowed(target_school uuid,target_outcome uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text,page_verdicts jsonb)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(
  select baseline.id as baseline_id,followup.id as followup_id from app.outcome_measurements outcome join app.interventions intervention on intervention.school_id=outcome.school_id and intervention.id=outcome.intervention_id
  join app.result_revisions baseline on baseline.school_id=outcome.school_id and baseline.id=outcome.baseline_result_id join app.result_revisions followup on followup.school_id=outcome.school_id and followup.id=outcome.follow_up_result_id join app.submissions submission on submission.school_id=followup.school_id and submission.id=followup.submission_id
  where outcome.school_id=target_school and outcome.id=target_outcome and outcome.learner_id=target_learner and intervention.learner_id=target_learner and intervention.baseline_result_id=baseline.id and intervention.follow_up_assessment_id=followup.assessment_id and intervention.completed_at is not null
   and followup.max_score=baseline.max_score and outcome.difference=followup.score-baseline.score and outcome.baseline_score=baseline.score and outcome.follow_up_score=followup.score and outcome.baseline_max_score=baseline.max_score and outcome.follow_up_max_score=followup.max_score and submission.submitted_at>intervention.completed_at and followup.created_at>intervention.completed_at
 )select coalesce(exists(select 1 from candidate where internal.page_insight_result_allowed(target_school,candidate.baseline_id,target_learner,target_course,target_reference,target_version,false,page_verdicts)and internal.page_insight_result_allowed(target_school,candidate.followup_id,target_learner,target_course,target_reference,target_version,true,page_verdicts)),false)
$$;
-- Existing helper permissions remain private after CREATE OR REPLACE.
revoke execute on function internal.page_can_read_academic_source(uuid,uuid,boolean,uuid,jsonb),internal.page_can_mark_submission(uuid,uuid,jsonb),internal.page_native_academic_source_allowed(uuid,uuid,boolean,jsonb),internal.page_can_manage_baseline(uuid,uuid,jsonb),internal.page_insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean,jsonb),internal.page_insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text,jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
