begin;
-- A bounded learner-owned source projection; caller input never selects another learner.
create function internal.read_own_assessment_submissions(assessment_ids uuid[])returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();candidate_courses uuid[];permitted_courses uuid[];items jsonb;person_name text;
begin
 if not"authorization".can_access_school(school)or not"authorization".has_entitlement(school,'assessment')or"authorization".current_role(school)<>'student'then raise exception 'Own submission read denied'using errcode='42501';end if;
 if assessment_ids is null or cardinality(assessment_ids)>100 or array_position(assessment_ids,null)is not null then raise exception 'Bounded assessment IDs required'using errcode='22023';end if;
 if cardinality(assessment_ids)=0 then return'[]'::jsonb;end if;
 select coalesce(array_agg(distinct a.course_id),array[]::uuid[])into candidate_courses from app.assessments a where a.school_id=school and a.id=any(assessment_ids);
 select coalesce(array_agg(course),array[]::uuid[])into permitted_courses from unnest(candidate_courses)course where"authorization".can_learn_course(school,course);
 if exists(select 1 from unnest(assessment_ids)id where not exists(select 1 from app.assessments a where a.school_id=school and a.id=id and a.course_id=any(permitted_courses)))then raise exception 'Assessment source unavailable'using errcode='42501';end if;
 select p.display_name into person_name from app.people p where p.school_id=school and p.actor_id=actor;
 if person_name is null or length(btrim(person_name))=0 then raise exception 'Learner context unavailable'using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'assessmentId',s.assessment_id,'learnerId',s.learner_id,'content',s.content,'status',cs.state,'revision',s.revision,'submittedAt',s.submitted_at,'previousSubmissionId',s.previous_submission_id,'sourceReturnId',s.return_id,'assessmentTitle',a.title,'learnerName',person_name,'returnId',ret.id,'returnFeedback',ret.feedback,'returnedAt',ret.created_at)order by s.assessment_id),'[]'::jsonb)into items
 from app.current_submissions cs join app.submissions s on s.school_id=cs.school_id and s.id=cs.submission_id and s.assessment_id=cs.assessment_id and s.learner_id=cs.learner_id
 join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id
 left join app.submission_returns ret on ret.school_id=s.school_id and ret.submission_id=s.id and ret.assessment_id=s.assessment_id and ret.learner_id=s.learner_id
 where cs.school_id=school and cs.learner_id=actor and cs.assessment_id=any(assessment_ids)and a.course_id=any(permitted_courses);
 -- At most 100 source records; the API adaptively pages whole assessment/source envelopes at 500KB.
 return items;
end$$;
revoke execute on function internal.read_own_assessment_submissions(uuid[])from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_own_assessment_submissions(uuid[])to cuevo_api;
commit;
