begin;
-- Read-only native projections retain the original immutable source identities;
-- rubric rows never receive a fabricated score or maximum.
create view internal.improvement_result_sources as
 select r.*, 'numeric'::text model,jsonb_build_object('type','numeric','score',r.score,'maxScore',r.max_score,'policyVersion',r.policy_version,'normalized',null)native_result from app.result_revisions r
 union all select r.school_id,r.id,r.marking_id,r.submission_id,r.assessment_id,r.learner_id,r.revision,null::numeric score,null::numeric max_score,r.feedback,r.policy_version,r.reference_id,r.reference_version,r.evidence_id,r.parent_visible,r.created_by,r.created_at,r.previous_result_id,'rubric'::text model,r.native_result from app.rubric_result_revisions r;
create view internal.improvement_evidence_sources as
 select school_id,id,source_type,source_object_id,learner_id,actor_id,created_at,quality,reference_id,reference_version,policy_version,result_id,revision,parent_visible,review_status from app.academic_evidence
 union all select school_id,id,source_type,source_object_id,learner_id,actor_id,created_at,quality,reference_id,reference_version,policy_version,result_id,revision,parent_visible,review_status from app.rubric_evidence;
create view internal.improvement_current_results as
 select school_id,submission_id,learner_id,result_id,updated_at from app.current_results
 union all select school_id,submission_id,learner_id,result_id,updated_at from app.current_rubric_results;
revoke all on internal.improvement_result_sources,internal.improvement_evidence_sources,internal.improvement_current_results from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
-- Recommendations, tasks and runs point at the same private native identity.
-- Scalar numeric outcome foreign keys remain until descriptor-only measurement
-- is explicitly implemented; they cannot accept rubric data accidentally.
do $$declare tab text;constraint_name text;found_count integer;begin
 foreach tab in array array['recommendations','interventions','intelligence_runs']loop
  found_count:=0;
  for constraint_name in select conname from pg_constraint where conrelid=format('app.%I',tab)::regclass and contype='f'and confrelid='app.result_revisions'::regclass and pg_get_constraintdef(oid)like'%baseline_result_id%'loop
   found_count:=found_count+1;execute format('alter table app.%I drop constraint %I',tab,constraint_name);
  end loop;
  if found_count<>1 then raise exception 'Native improvement source FK changed: %',tab using errcode='22023';end if;
  execute format('alter table app.%I add foreign key(school_id,baseline_result_id,learner_id)references internal.academic_result_sources(school_id,id,learner_id)',tab);
 end loop;
end$$;
create or replace function "authorization".can_manage_baseline(target_school uuid,target_result uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce("authorization".improvement_access(target_school)and exists(select 1 from internal.improvement_result_sources result where result.school_id=target_school and result.id=target_result and"authorization".can_mark_submission(target_school,result.submission_id)
 and internal.native_academic_source_allowed(target_school,result.id,true)),false)
$$;
create or replace function internal.result_source_current(target_school uuid,target_result uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from internal.improvement_current_results current_result join internal.improvement_result_sources source on source.school_id=current_result.school_id and source.id=current_result.result_id join app.current_submissions submitted on submitted.school_id=source.school_id and submitted.submission_id=source.submission_id where current_result.school_id=target_school and current_result.result_id=target_result)
$$;
-- Reuse the existing command/read predicates with the native source projection.
-- Assert every intended substitution instead of silently adapting an unknown body.
do $$declare signature text;definition text;begin
 foreach signature in array array['"authorization".can_access_intervention(uuid,uuid,boolean)','internal.intervention_history_allowed(uuid,uuid)','internal.recommendation_source_allowed(uuid,uuid)','internal.create_recommendation(uuid,jsonb)','internal.intervention_option_current(uuid,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('app.result_revisions'in definition)=0 then raise exception 'Native owner source changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,'app.result_revisions','internal.improvement_result_sources');execute definition;
 end loop;
end$$;
revoke execute on function "authorization".can_manage_baseline(uuid,uuid),internal.result_source_current(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function "authorization".can_manage_baseline(uuid,uuid)to cuevo_api;
create or replace function internal.link_reassessment(target uuid,assessment_id uuid)returns uuid language plpgsql security definer set search_path=''as $$declare task app.interventions;baseline internal.improvement_result_sources;followup app.assessments;begin
 select*into task from app.interventions where school_id="authorization".school_id()and id=target for update;
 if not found or not"authorization".can_access_intervention(task.school_id,task.id,true)then raise exception 'Reassessment denied'using errcode='42501';end if;
 select*into baseline from internal.improvement_result_sources where school_id=task.school_id and id=task.baseline_result_id;select*into followup from app.assessments where school_id=task.school_id and id=assessment_id;
 if task.completed_at is null or baseline.id is null or followup.id is null or followup.id=baseline.assessment_id or followup.course_id is distinct from(select course_id from app.assessments where school_id=task.school_id and id=baseline.assessment_id)or followup.academic_reference_id is distinct from baseline.reference_id or followup.model is distinct from baseline.model
 or(baseline.model='numeric'and followup.max_score is distinct from baseline.max_score)or(baseline.model='rubric'and not exists(select 1 from app.assessment_rubrics linked where linked.school_id=task.school_id and linked.assessment_id=followup.id and linked.rubric_id=(baseline.native_result->>'rubricId')::uuid))
 or(task.follow_up_assessment_id is not null and task.follow_up_assessment_id<>assessment_id)then raise exception 'Incompatible native follow-up assessment'using errcode='22023';end if;
 update app.interventions set follow_up_assessment_id=assessment_id where school_id=task.school_id and id=task.id;return task.id;
end$$;
revoke execute on function internal.link_reassessment(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.link_reassessment(uuid,uuid)to cuevo_api;
commit;
