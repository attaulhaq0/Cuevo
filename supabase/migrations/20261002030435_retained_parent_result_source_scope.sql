begin;
create function internal.retained_result_source_read_allowed(target_school uuid,target_result uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(exists(
  select 1 from internal.academic_result_sources source join app.submissions submission on submission.school_id=source.school_id and submission.id=(internal.native_academic_source(target_school,target_result)->>'submissionId')::uuid and submission.learner_id=source.learner_id
  join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
  where source.school_id=target_school and source.id=target_result and"authorization".academic_access(target_school)
  and exists(select 1 from app.school_custom_references reference join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id where reference.school_id=target_school and reference.id=(internal.native_academic_source(target_school,target_result)->>'referenceId')::uuid and reference.status='APPROVED'and version.version=internal.native_academic_source(target_school,target_result)->>'referenceVersion')
  and(source.model='numeric'and exists(select 1 from app.result_revisions result join app.academic_evidence evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id and evidence.reference_id=result.reference_id and evidence.reference_version=result.reference_version and evidence.policy_version=result.policy_version where result.school_id=target_school and result.id=source.id and result.submission_id=submission.id)
   or source.model='rubric'and exists(select 1 from app.rubric_result_revisions result join app.rubric_evidence evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id and evidence.reference_id=result.reference_id and evidence.reference_version=result.reference_version and evidence.policy_version=result.policy_version where result.school_id=target_school and result.id=source.id and result.submission_id=submission.id))
  and("authorization".current_role(target_school)<>'parent'and internal.result_source_read_allowed(target_school,target_result)
   or"authorization".current_role(target_school)='parent'and"authorization".can_read_academic(target_school,source.learner_id,internal.result_parent_published(target_school,target_result))
    and"authorization".programme_course_allowed(target_school,course.id,source.learner_id)
    and exists(select 1 from app.enrollments historical where historical.school_id=target_school and historical.class_id=course.class_id and historical.student_actor_id=source.learner_id and historical.effective_from<=submission.submitted_at and(historical.effective_to is null or historical.effective_to>submission.submitted_at)))
 ),false)
$$;
drop policy results_read on app.result_revisions;create policy results_read on app.result_revisions for select to cuevo_api using(internal.retained_result_source_read_allowed(school_id,id));
drop policy rubric_results_read on app.rubric_result_revisions;create policy rubric_results_read on app.rubric_result_revisions for select to cuevo_api using(internal.retained_result_source_read_allowed(school_id,id));
drop policy evidence_read on app.academic_evidence;create policy evidence_read on app.academic_evidence for select to cuevo_api using(internal.retained_result_source_read_allowed(school_id,result_id));
drop policy rubric_evidence_read on app.rubric_evidence;create policy rubric_evidence_read on app.rubric_evidence for select to cuevo_api using(internal.retained_result_source_read_allowed(school_id,result_id));
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_academic_revision_page(uuid,integer,uuid)'::regprocedure);anchor:='internal.result_source_read_allowed(school,source_result)';if position(anchor in definition)=0 then raise exception 'Retained history anchor changed'using errcode='22023';end if;definition:=replace(definition,anchor,'internal.retained_result_source_read_allowed(school,source_result)');anchor:='internal.result_source_read_allowed(school,source.id)';if position(anchor in definition)=0 then raise exception 'Retained history row changed'using errcode='22023';end if;execute replace(definition,anchor,'internal.retained_result_source_read_allowed(school,source.id)');
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_result_publication(uuid)'::regprocedure);anchor:='internal.result_source_read_allowed(school,target_result)';if position(anchor in definition)=0 then raise exception 'Retained publication projection changed'using errcode='22023';end if;execute replace(definition,anchor,'internal.retained_result_source_read_allowed(school,target_result)');
end$$;
revoke execute on function internal.retained_result_source_read_allowed(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.retained_result_source_read_allowed(uuid,uuid)to cuevo_api;
commit;
