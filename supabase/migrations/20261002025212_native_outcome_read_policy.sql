begin;
create function internal.can_read_native_outcome(target_school uuid,target_outcome uuid)returns boolean language plpgsql stable security definer set search_path=''as $$declare outcome app.outcome_measurements;begin
 if target_school is distinct from"authorization".school_id()or not"authorization".improvement_access(target_school)or"authorization".current_role(target_school)not in('admin','coordinator','teacher','student')then return false;end if;
 select*into outcome from app.outcome_measurements where school_id=target_school and id=target_outcome;
 if not found or outcome.model<>'rubric'or not internal.intervention_history_allowed(target_school,outcome.intervention_id)then return false;end if;
 return internal.native_intervention_outcome_allowed(target_school,target_outcome);
end$$;
drop policy outcome_read on app.outcome_measurements;
create policy outcome_read on app.outcome_measurements for select to cuevo_api using(internal.intervention_history_allowed(school_id,intervention_id)and case when model='rubric'then internal.can_read_native_outcome(school_id,id)else exists(select 1 from app.result_revisions result where result.school_id=outcome_measurements.school_id and result.id=outcome_measurements.follow_up_result_id and"authorization".can_read_academic_source(result.school_id,result.learner_id,result.parent_visible,result.assessment_id))end);
revoke execute on function internal.can_read_native_outcome(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.can_read_native_outcome(uuid,uuid)to cuevo_api;
commit;
