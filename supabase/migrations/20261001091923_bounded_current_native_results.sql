begin;
-- Resolve each role's current learner/course scope once; source row reads remain bounded native projections.
create function internal.list_current_native_results(page_limit integer,page_cursor uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();role_name text;learners uuid[];courses uuid[];rows jsonb;items jsonb;
begin
 if not"authorization".academic_access(school)then raise exception 'Current academic projection denied'using errcode='42501';end if;
 role_name:="authorization".current_role(school);
 if role_name='parent'then return internal.list_parent_current_results(page_limit,page_cursor);end if;
 if role_name not in('admin','coordinator','teacher','student')then raise exception 'Current academic role required'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Bounded academic page required'using errcode='22023';end if;
 if role_name='student'then learners:=array[actor];
 elsif role_name='teacher'then
  select coalesce(array_agg(distinct member.actor_id),array[]::uuid[])into learners from app.memberships member join app.enrollments enrollment on enrollment.school_id=member.school_id and enrollment.student_actor_id=member.actor_id join app.teacher_assignments assignment on assignment.school_id=enrollment.school_id and assignment.class_id=enrollment.class_id
  where member.school_id=school and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and assignment.teacher_actor_id=actor and assignment.status='active'and assignment.effective_from<=now()and(assignment.effective_to is null or assignment.effective_to>now());
 else
  -- Admin/coordinator directory visibility is tenant-wide as in can_view_person, including retained history.
  select coalesce(array_agg(member.actor_id),array[]::uuid[])into learners from app.memberships member where member.school_id=school;
 end if;
 if cardinality(learners)=0 then return jsonb_build_object('items','[]'::jsonb,'nextCursor',null);end if;
 select coalesce(array_agg(course.id),array[]::uuid[])into courses from app.courses course where course.school_id=school and"authorization".can_read_course(school,course.id);
 with candidates as materialized(
  select r.id,'numeric'::text model,r.school_id,r.submission_id,r.assessment_id,r.learner_id,r.revision,r.score,r.max_score,r.feedback,r.policy_version,r.reference_id,r.reference_version,r.evidence_id,r.created_at,r.created_by,r.parent_visible,jsonb_build_object('type','numeric','score',r.score,'maxScore',r.max_score,'policyVersion',r.policy_version)native_result
  from app.current_results current_source join app.result_revisions r on r.school_id=current_source.school_id and r.id=current_source.result_id join app.assessments assessment on assessment.school_id=r.school_id and assessment.id=r.assessment_id
  where r.school_id=school and r.learner_id=any(learners)and assessment.course_id=any(courses)and(page_cursor is null or r.id>page_cursor)
  and exists(select 1 from app.academic_evidence ev where ev.school_id=r.school_id and ev.id=r.evidence_id and ev.result_id=r.id and ev.learner_id=r.learner_id and ev.source_object_id=r.submission_id)
  and exists(select 1 from app.school_custom_references ref join app.school_custom_versions version on version.school_id=ref.school_id and version.id=ref.version_id where ref.school_id=r.school_id and ref.id=r.reference_id and ref.status='APPROVED'and version.version=r.reference_version)
  union all
  select r.id,'rubric'::text,r.school_id,r.submission_id,r.assessment_id,r.learner_id,r.revision,null::numeric,null::numeric,r.feedback,r.policy_version,r.reference_id,r.reference_version,r.evidence_id,r.created_at,r.created_by,r.parent_visible,r.native_result
  from app.current_rubric_results current_source join app.rubric_result_revisions r on r.school_id=current_source.school_id and r.id=current_source.result_id join app.assessments assessment on assessment.school_id=r.school_id and assessment.id=r.assessment_id
  where r.school_id=school and r.learner_id=any(learners)and assessment.course_id=any(courses)and(page_cursor is null or r.id>page_cursor)
  and exists(select 1 from app.rubric_evidence ev where ev.school_id=r.school_id and ev.id=r.evidence_id and ev.result_id=r.id and ev.learner_id=r.learner_id and ev.source_object_id=r.submission_id)
  and exists(select 1 from app.school_custom_references ref join app.school_custom_versions version on version.school_id=ref.school_id and version.id=ref.version_id where ref.school_id=r.school_id and ref.id=r.reference_id and ref.status='APPROVED'and version.version=r.reference_version)
 ),bounded as materialized(select*from candidates order by id limit page_limit+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'submissionId',b.submission_id,'assessmentId',b.assessment_id,'learnerId',b.learner_id,'revision',b.revision,'feedback',b.feedback,'status','RELEASED','policyVersion',b.policy_version,'referenceId',b.reference_id,'referenceVersion',b.reference_version,'evidenceId',b.evidence_id,'createdAt',b.created_at,'actorId',b.created_by,'parentVisible',b.parent_visible,'nativeResult',b.native_result,'assessmentTitle',a.title,'referenceTitle',ref.title,'model',b.model)||case when b.model='numeric'then jsonb_build_object('score',b.score,'maxScore',b.max_score)else'{}'::jsonb end order by b.id),'[]'::jsonb)into rows
 from bounded b join app.assessments a on a.school_id=b.school_id and a.id=b.assessment_id join app.school_custom_references ref on ref.school_id=b.school_id and ref.id=b.reference_id;
 if octet_length(rows::text)>500000 then raise exception 'Academic projection requires a smaller page'using errcode='22023';end if;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)into items from jsonb_array_elements(rows)with ordinality value(item,ordinal)where ordinal<=page_limit;
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(rows)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;
revoke execute on function internal.list_current_native_results(integer,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.list_current_native_results(integer,uuid)to cuevo_api;
commit;
