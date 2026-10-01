begin;
create or replace function "authorization".can_read_course(target_school uuid,target_course uuid)returns boolean language sql stable security definer set search_path=''as $$
select coalesce("authorization".has_entitlement(target_school,'learning')and exists(select 1 from app.courses c join app.classes cl on cl.school_id=c.school_id and cl.id=c.class_id where c.school_id=target_school and c.id=target_course and cl.status='active'and"authorization".can_view_class(c.school_id,c.class_id)and(
 "authorization".can_manage_course(target_school,target_course)or"authorization".current_role(target_school)='coordinator'or(c.status='PUBLISHED'and(
 ("authorization".current_role(target_school)='student'and"authorization".programme_course_allowed(target_school,target_course,"authorization".actor_id()))or
 ("authorization".current_role(target_school)='parent'and exists(select 1 from app.parent_relationships rel join app.memberships member on member.school_id=rel.school_id and member.actor_id=rel.student_actor_id join app.enrollments e on e.school_id=member.school_id and e.student_actor_id=member.actor_id where rel.school_id=target_school and rel.parent_actor_id="authorization".actor_id()and rel.status='active'and rel.effective_from<=now()and(rel.effective_to is null or rel.effective_to>now())and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and e.class_id=c.class_id and e.status='active'and e.effective_from<=now()and(e.effective_to is null or e.effective_to>now())and"authorization".programme_course_allowed(target_school,target_course,member.actor_id)))
 )))),false)
$$;
-- Retained native sources require the selected learner's programme rather than a sibling's context.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.list_current_native_results(integer,uuid)'::regprocedure);
 definition:=replace(definition,'assessment.course_id=any(courses)and(page_cursor',
  'assessment.course_id=any(courses)and(role_name not in(''student'',''parent'')or"authorization".programme_course_allowed(school,assessment.course_id,r.learner_id))and(page_cursor');
 execute definition;
 definition:=pg_get_functiondef('internal.list_parent_current_results(integer,uuid)'::regprocedure);
 definition:=replace(definition,'assessment.course_id=any(courses)and(page_cursor',
  'assessment.course_id=any(courses)and"authorization".programme_course_allowed(school,assessment.course_id,r.learner_id)and(page_cursor');
 execute definition;
 definition:=pg_get_functiondef('internal.portfolio_source(text,uuid,boolean)'::regprocedure);
 definition:=replace(definition,'and"authorization".can_read_academic(r.school_id,r.learner_id,r.parent_visible)',
  'and("authorization".current_role(r.school_id)not in(''student'',''parent'')or"authorization".programme_course_allowed(r.school_id,a.course_id,r.learner_id))and"authorization".can_read_academic(r.school_id,r.learner_id,r.parent_visible)');
 execute definition;
end$$;
create function "authorization".can_read_academic_source(target_school uuid,target_learner uuid,parent_allowed boolean,target_assessment uuid)returns boolean language sql stable security definer set search_path=''as $$
select "authorization".can_read_academic(target_school,target_learner,parent_allowed)and("authorization".current_role(target_school)not in('student','parent')or exists(select 1 from app.assessments a where a.school_id=target_school and a.id=target_assessment and"authorization".programme_course_allowed(target_school,a.course_id,target_learner)))
$$;
drop policy results_read on app.result_revisions;
create policy results_read on app.result_revisions for select to cuevo_api using("authorization".can_read_academic_source(school_id,learner_id,parent_visible,assessment_id));
drop policy evidence_read on app.academic_evidence;
create policy evidence_read on app.academic_evidence for select to cuevo_api using("authorization".can_read_academic(school_id,learner_id,parent_visible)and exists(select 1 from app.result_revisions r where r.school_id=academic_evidence.school_id and r.id=academic_evidence.result_id));
drop policy rubric_results_read on app.rubric_result_revisions;
create policy rubric_results_read on app.rubric_result_revisions for select to cuevo_api using("authorization".can_read_academic_source(school_id,learner_id,parent_visible,assessment_id));
drop policy rubric_evidence_read on app.rubric_evidence;
create policy rubric_evidence_read on app.rubric_evidence for select to cuevo_api using("authorization".can_read_academic(school_id,learner_id,parent_visible)and exists(select 1 from app.rubric_result_revisions r where r.school_id=rubric_evidence.school_id and r.id=rubric_evidence.result_id));
revoke execute on function "authorization".can_read_academic_source(uuid,uuid,boolean,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function "authorization".can_read_academic_source(uuid,uuid,boolean,uuid)to cuevo_api;
drop policy courses_read on app.courses;
create policy courses_read on app.courses for select to cuevo_api using("authorization".can_read_course(school_id,id));
commit;
