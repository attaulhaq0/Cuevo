begin;
do $$begin if md5(pg_get_functiondef('internal.intervention_history_allowed(uuid,uuid)'::regprocedure))<>'3f1e47a64f32a7faa32a879ea6680e98'then raise exception 'Intervention history authority requires review'using errcode='22023';end if;end$$;
-- Bind the exact retained baseline before the unchanged historical read checks.
create or replace function internal.intervention_history_allowed(target_school uuid,target_intervention uuid)returns boolean
language sql stable security definer set search_path=''as $$
with candidate as materialized(
 select result.learner_id,result.parent_visible,result.assessment_id
 from app.interventions intervention join internal.improvement_result_sources result on result.school_id=intervention.school_id and result.id=intervention.baseline_result_id
 where intervention.school_id=target_school and intervention.id=target_intervention
)
select coalesce("authorization".improvement_access(target_school)and exists(select 1 from candidate result
 where"authorization".can_read_academic_source(target_school,result.learner_id,result.parent_visible,result.assessment_id)
 and"authorization".current_learner_course(target_school,(select course_id from app.assessments where school_id=target_school and id=result.assessment_id),result.learner_id)
 and"authorization".current_role(target_school)in('admin','coordinator','teacher','student')),false)
$$;
commit;
