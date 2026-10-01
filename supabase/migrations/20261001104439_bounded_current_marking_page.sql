begin;
-- Resolve current staff course authority once. Authorize source candidates before
-- the 100+1 boundary, then load native detail without repeated application RLS joins.
create function internal.read_current_marking_page(page_limit integer,page_cursor uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text;courses uuid[];rows jsonb;items jsonb;
begin
 if not"authorization".academic_access(school)then raise exception 'Marking page denied'using errcode='42501';end if;
 role_name:="authorization".current_role(school);if role_name not in('admin','teacher')then raise exception 'Marking role denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Bounded marking page required'using errcode='22023';end if;
 select coalesce(array_agg(course.id),array[]::uuid[])into courses from app.courses course where course.school_id=school and"authorization".can_manage_course(school,course.id)and"authorization".can_read_course(school,course.id);
 with bounded as materialized(
  select submission.*,current_source.state as current_state from app.current_submissions current_source
  join app.submissions submission on submission.school_id=current_source.school_id and submission.id=current_source.submission_id
  join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
  where submission.school_id=school and assessment.course_id=any(courses)and(page_cursor is null or submission.id>page_cursor)
  and"authorization".can_mark_submission(school,submission.id)
  and"authorization".programme_course_allowed(school,assessment.course_id,submission.learner_id)
  and exists(select 1 from app.memberships member where member.school_id=school and member.actor_id=submission.learner_id and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))
  order by submission.id limit page_limit+1
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',source.id,'assessmentId',source.assessment_id,'learnerId',source.learner_id,'content',source.content,'submissionRevision',source.revision,'submissionStatus',source.current_state,'assessmentTitle',assessment.title,'learnerName',person.display_name,'model',assessment.model,'policyVersion',assessment.policy_version,'referenceId',assessment.academic_reference_id,'rubric',case when assessment.model='rubric'then rubric.definition else null end,'currentResult',case when assessment.model='rubric'then rubric_mark.native_mark else numeric_mark.native_mark end)||case when assessment.model='numeric'then jsonb_build_object('maxScore',assessment.max_score)else'{}'::jsonb end order by source.id),'[]'::jsonb)into rows
 from bounded source join app.assessments assessment on assessment.school_id=source.school_id and assessment.id=source.assessment_id
 join app.people person on person.school_id=source.school_id and person.actor_id=source.learner_id
 left join lateral(select jsonb_build_object('id',definition.id,'title',definition.title,'version',definition.version,'criteria',definition.criteria)definition from app.assessment_rubrics pinned join app.rubric_versions definition on definition.school_id=pinned.school_id and definition.id=pinned.rubric_id where pinned.school_id=source.school_id and pinned.assessment_id=source.assessment_id)rubric on assessment.model='rubric'
 left join lateral(select jsonb_build_object('id',mark.id,'revision',mark.revision,'model','numeric','score',mark.score,'maxScore',mark.max_score,'feedback',mark.feedback,'status',case when exists(select 1 from app.result_revisions released where released.school_id=mark.school_id and released.marking_id=mark.id)then 'RELEASED'else 'REVIEW'end)native_mark from app.marking_revisions mark where mark.school_id=source.school_id and mark.submission_id=source.id order by mark.revision desc limit 1)numeric_mark on assessment.model='numeric'
 left join lateral(select jsonb_build_object('id',mark.id,'revision',mark.revision,'model','rubric','nativeResult',mark.native_result,'feedback',mark.feedback,'status',case when exists(select 1 from app.rubric_result_revisions released where released.school_id=mark.school_id and released.marking_id=mark.id)then 'RELEASED'else 'REVIEW'end)native_mark from app.rubric_marking_revisions mark where mark.school_id=source.school_id and mark.submission_id=source.id order by mark.revision desc limit 1)rubric_mark on assessment.model='rubric';
 if octet_length(rows::text)>500000 then raise exception 'Marking page requires a smaller view'using errcode='22023';end if;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)into items from jsonb_array_elements(rows)with ordinality value(item,ordinal)where ordinal<=page_limit;
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(rows)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;
revoke execute on function internal.read_current_marking_page(integer,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_current_marking_page(integer,uuid)to cuevo_api;
commit;
