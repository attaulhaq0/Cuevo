begin;
create function internal.result_source_current(target_school uuid,target_result uuid)returns boolean language sql stable security definer set search_path=''as $$
select exists(select 1 from app.current_results result join app.result_revisions revision on revision.school_id=result.school_id and revision.id=result.result_id join app.current_submissions submission on submission.school_id=revision.school_id and submission.submission_id=revision.submission_id where result.school_id=target_school and result.result_id=target_result)
$$;
create function internal.intervention_history_allowed(target_school uuid,target_intervention uuid)returns boolean language sql stable security definer set search_path=''as $$
select coalesce("authorization".improvement_access(target_school)and exists(select 1 from app.interventions intervention join app.result_revisions result on result.school_id=intervention.school_id and result.id=intervention.baseline_result_id
 where intervention.school_id=target_school and intervention.id=target_intervention
 and"authorization".can_read_academic_source(target_school,result.learner_id,result.parent_visible,result.assessment_id)
 and"authorization".current_learner_course(target_school,(select course_id from app.assessments where school_id=target_school and id=result.assessment_id),result.learner_id)
 and"authorization".current_role(target_school)in('admin','coordinator','teacher','student')),false)
$$;
create function internal.intervention_requires_review(target_school uuid,target_intervention uuid)returns boolean language sql stable security definer set search_path=''as $$
select not exists(select 1 from app.interventions intervention where intervention.school_id=target_school and intervention.id=target_intervention and internal.result_source_current(target_school,intervention.baseline_result_id)
 and not exists(select 1 from app.outcome_measurements outcome where outcome.school_id=target_school and outcome.intervention_id=intervention.id and not internal.result_source_current(target_school,outcome.follow_up_result_id)))
$$;
drop policy intervention_read on app.interventions;
create policy intervention_read on app.interventions for select to cuevo_api using(internal.intervention_history_allowed(school_id,id));
drop policy outcome_read on app.outcome_measurements;
create policy outcome_read on app.outcome_measurements for select to cuevo_api using(internal.intervention_history_allowed(school_id,intervention_id)and exists(select 1 from app.result_revisions result where result.school_id=outcome_measurements.school_id and result.id=outcome_measurements.follow_up_result_id and"authorization".can_read_academic_source(result.school_id,result.learner_id,result.parent_visible,result.assessment_id)));
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.complete_intervention(uuid,text)'::regprocedure);
 definition:=replace(definition,'select*into existing from app.intervention_completions',
  'if internal.intervention_requires_review(i.school_id,i.id)then raise exception ''Support source changed; teacher review required''using errcode=''42501'';end if;select*into existing from app.intervention_completions');
 execute definition;
 definition:=pg_get_functiondef('internal.measure_intervention(uuid,uuid,numeric)'::regprocedure);
 definition:=replace(definition,'select*into existing from app.outcome_measurements',
  'if not internal.result_source_current(i.school_id,followup_id)then raise exception ''Current follow-up evidence required''using errcode=''22023'';end if;select*into existing from app.outcome_measurements');
 execute definition;
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);
 definition:=replace(definition,'"authorization".can_access_intervention(school,intervention.id,false)', ' internal.intervention_history_allowed(school,intervention.id)');
 definition:=replace(definition,'"authorization".can_access_intervention(school,outcome.intervention_id,false)', ' internal.intervention_history_allowed(school,outcome.intervention_id)');
 definition:=replace(definition,'''observedAt'',observed_at)', '''observedAt'',observed_at,''assessmentTitle'',(select title from app.assessments where school_id=school and id=assessment_id),''referenceTitle'',(select title from app.school_custom_references where school_id=school and id=reference_id))');
 definition:=replace(definition,'select coalesce(jsonb_agg(item),''[]''::jsonb)into items',
  'select coalesce(jsonb_agg(item||jsonb_build_object(''requiresReview'',internal.intervention_requires_review(school,(item->>''id'')::uuid),''reviewReason'',case when internal.intervention_requires_review(school,(item->>''id'')::uuid)then''ACADEMIC_SOURCE_CHANGED''else null end)),''[]''::jsonb)into items');
 definition:=replace(definition,'select coalesce(jsonb_agg(item),''[]''::jsonb)into outcomes',
  'select coalesce(jsonb_agg(item||jsonb_build_object(''requiresReview'',internal.intervention_requires_review(school,(item->>''interventionId'')::uuid),''reviewReason'',case when internal.intervention_requires_review(school,(item->>''interventionId'')::uuid)then''ACADEMIC_SOURCE_CHANGED''else null end)),''[]''::jsonb)into outcomes');
 execute definition;
end$$;
revoke execute on function internal.result_source_current(uuid,uuid),internal.intervention_history_allowed(uuid,uuid),internal.intervention_requires_review(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.intervention_history_allowed(uuid,uuid),internal.intervention_requires_review(uuid,uuid)to cuevo_api;
commit;
