begin;
-- The pinned rubric identity is assessment metadata, separate from private definition rows.
create function internal.read_assessment_rubric_identity(target_school uuid,target_assessment uuid)returns uuid language plpgsql security definer set search_path=''as $$
declare assessment app.assessments;rubric uuid;
begin
 if target_school is distinct from"authorization".school_id()or not"authorization".has_entitlement(target_school,'assessment')then raise exception 'Assessment metadata denied'using errcode='42501';end if;
 select*into assessment from app.assessments where school_id=target_school and id=target_assessment;
 if not found or not"authorization".can_read_course(target_school,assessment.course_id)then raise exception 'Assessment rubric identity denied'using errcode='42501';end if;
 if assessment.model<>'rubric'then return null;end if;
 select rubric_id into rubric from app.assessment_rubrics where school_id=target_school and assessment_id=target_assessment;return rubric;
end$$;
revoke execute on function internal.read_assessment_rubric_identity(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_assessment_rubric_identity(uuid,uuid)to cuevo_api;
commit;
