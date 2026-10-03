begin;
-- Guard null input in the private preparation command as well as the API contract.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.prepare_assessment(uuid,text,text,timestamptz,numeric,uuid,uuid,integer)'::regprocedure);
 anchor:='or maximum>100000 or length(btrim(title_value))';
 if position(anchor in definition)=0 then raise exception 'Assessment preparation validation shape changed'using errcode='22023';end if;
 execute replace(definition,anchor,'or maximum>100000 or title_value is null or instruction_value is null or length(btrim(title_value))');
end$$;
-- Creation/RETURNING does not need a stable self-lookup; direct metadata must repeat draft scope.
create or replace function internal.read_assessment_rubric_identity(target_school uuid,target_assessment uuid)returns uuid language plpgsql security definer set search_path=''as $$
declare assessment app.assessments;rubric uuid;begin
 if target_school is distinct from"authorization".school_id()or not"authorization".has_entitlement(target_school,'assessment')then raise exception 'Assessment metadata denied'using errcode='42501';end if;
 select*into assessment from app.assessments where school_id=target_school and id=target_assessment;
 if not found or not"authorization".can_read_course(target_school,assessment.course_id)or(assessment.status='DRAFT'and not"authorization".can_manage_course(target_school,assessment.course_id))then raise exception 'Assessment rubric identity denied'using errcode='42501';end if;
 if assessment.model<>'rubric'then return null;end if;
 select rubric_id into rubric from app.assessment_rubrics where school_id=target_school and assessment_id=target_assessment;return rubric;
end$$;
revoke execute on function internal.read_assessment_rubric_identity(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_assessment_rubric_identity(uuid,uuid)to cuevo_api;
commit;
