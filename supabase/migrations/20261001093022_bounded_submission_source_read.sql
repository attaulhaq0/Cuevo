begin;
-- Raw submitted work stays staff-owned-course or enrolled-self scoped; parent access is always denied.
create function internal.read_submission_page(page_limit integer,page_cursor uuid,history_source uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();role_name text;courses uuid[];learners uuid[];source app.submissions;rows jsonb;items jsonb;
begin
 if not"authorization".can_access_school(school)or not"authorization".has_entitlement(school,'assessment')then raise exception 'Submission read denied'using errcode='42501';end if;
 role_name:="authorization".current_role(school);if role_name not in('admin','teacher','student')then raise exception 'Raw submission role denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Bounded submission page required'using errcode='22023';end if;
 if role_name='student'then learners:=array[actor];select coalesce(array_agg(c.id),array[]::uuid[])into courses from app.courses c where c.school_id=school and"authorization".can_learn_course(school,c.id);
 else
  select coalesce(array_agg(c.id),array[]::uuid[])into courses from app.courses c where c.school_id=school and"authorization".can_manage_course(school,c.id);
  select coalesce(array_agg(m.actor_id),array[]::uuid[])into learners from app.memberships m where m.school_id=school and(role_name='admin'or(m.role='student'and m.status='active'and m.effective_from<=now()and(m.effective_to is null or m.effective_to>now())));
 end if;
 if history_source is not null then
  select s.*into source from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id where s.school_id=school and s.id=history_source and a.course_id=any(courses)and s.learner_id=any(learners);
  if not found then raise exception 'Submission history unavailable'using errcode='42501';end if;
 end if;
 with bounded as materialized(
  select s.*,cs.state as current_state from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id left join app.current_submissions cs on cs.school_id=s.school_id and cs.submission_id=s.id
  where s.school_id=school and a.course_id=any(courses)and s.learner_id=any(learners)and(page_cursor is null or s.id>page_cursor)
   and((history_source is null and cs.submission_id=s.id)or(history_source is not null and s.assessment_id=source.assessment_id and s.learner_id=source.learner_id))
  order by s.id limit page_limit+1
 )select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'assessmentId',s.assessment_id,'learnerId',s.learner_id,'content',s.content,'status',coalesce(s.current_state,s.status),'revision',s.revision,'submittedAt',s.submitted_at,'previousSubmissionId',s.previous_submission_id,'sourceReturnId',s.return_id,'assessmentTitle',a.title,'learnerName',p.display_name,'returnId',ret.id,'returnFeedback',ret.feedback,'returnedAt',ret.created_at)order by s.id),'[]'::jsonb)into rows
 from bounded s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id join app.people p on p.school_id=s.school_id and p.actor_id=s.learner_id left join app.submission_returns ret on ret.school_id=s.school_id and ret.submission_id=s.id;
 if octet_length(rows::text)>500000 then raise exception 'Submission page requires a smaller view'using errcode='22023';end if;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)into items from jsonb_array_elements(rows)with ordinality value(item,ordinal)where ordinal<=page_limit;
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(rows)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;
revoke execute on function internal.read_submission_page(integer,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_submission_page(integer,uuid,uuid)to cuevo_api;
commit;
