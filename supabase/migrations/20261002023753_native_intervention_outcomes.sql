begin;
alter table app.outcome_measurements add column model text not null default'numeric'check(model in('numeric','rubric'));
alter table app.outcome_measurements add column native_baseline jsonb;
alter table app.outcome_measurements add column native_follow_up jsonb;
alter table app.outcome_measurements add column comparability text;
alter table app.outcome_measurements alter column difference drop not null;
alter table app.outcome_measurements alter column minimum_change drop not null;
alter table app.outcome_measurements alter column baseline_score drop not null;
alter table app.outcome_measurements alter column baseline_max_score drop not null;
alter table app.outcome_measurements alter column follow_up_score drop not null;
alter table app.outcome_measurements alter column follow_up_max_score drop not null;
alter table app.outcome_measurements add check((model='numeric'and difference is not null and minimum_change is not null and baseline_score is not null and baseline_max_score is not null and follow_up_score is not null and follow_up_max_score is not null and native_baseline is null and native_follow_up is null and comparability is null)or(model='rubric'and difference is null and minimum_change is null and baseline_score is null and baseline_max_score is null and follow_up_score is null and follow_up_max_score is null and native_baseline is not null and native_follow_up is not null and native_baseline->>'type'='rubric'and native_follow_up->>'type'='rubric'and not(native_baseline?'score')and not(native_follow_up?'score')and native_baseline->'normalized'='null'::jsonb and native_follow_up->'normalized'='null'::jsonb and comparability='UNKNOWN'and status='inconclusive'and reason='NO_APPROVED_RUBRIC_COMPARISON_POLICY'));
do $$declare constraint_name text;found_count integer:=0;begin
 for constraint_name in select conname from pg_constraint where conrelid='app.outcome_measurements'::regclass and contype='f'and confrelid='app.result_revisions'::regclass loop found_count:=found_count+1;execute format('alter table app.outcome_measurements drop constraint %I',constraint_name);end loop;
 if found_count<>2 then raise exception 'Native outcome source FKs changed'using errcode='22023';end if;
end$$;
alter table app.outcome_measurements add foreign key(school_id,baseline_result_id,learner_id)references internal.academic_result_sources(school_id,id,learner_id);
alter table app.outcome_measurements add foreign key(school_id,follow_up_result_id,learner_id)references internal.academic_result_sources(school_id,id,learner_id);
create function internal.native_intervention_outcome_allowed(target_school uuid,target_outcome uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(exists(select 1 from app.outcome_measurements outcome join app.interventions task on task.school_id=outcome.school_id and task.id=outcome.intervention_id join internal.improvement_result_sources baseline on baseline.school_id=outcome.school_id and baseline.id=outcome.baseline_result_id join internal.improvement_result_sources followup on followup.school_id=outcome.school_id and followup.id=outcome.follow_up_result_id join app.assessments baseline_assessment on baseline_assessment.school_id=baseline.school_id and baseline_assessment.id=baseline.assessment_id join app.assessments followup_assessment on followup_assessment.school_id=followup.school_id and followup_assessment.id=followup.assessment_id join app.submissions submission on submission.school_id=followup.school_id and submission.id=followup.submission_id
 where outcome.school_id=target_school and outcome.id=target_outcome and outcome.model='rubric'and baseline.model='rubric'and followup.model='rubric'and outcome.learner_id=task.learner_id and baseline.learner_id=outcome.learner_id and followup.learner_id=outcome.learner_id and baseline.reference_id=followup.reference_id and baseline.reference_version=followup.reference_version and baseline.native_result->>'rubricId'=followup.native_result->>'rubricId'and baseline.native_result->>'rubricVersion'=followup.native_result->>'rubricVersion'and baseline_assessment.course_id=followup_assessment.course_id and followup.assessment_id=task.follow_up_assessment_id and task.completed_at is not null and submission.submitted_at>task.completed_at and followup.created_at>task.completed_at
 and outcome.native_baseline=baseline.native_result and outcome.native_follow_up=followup.native_result and outcome.comparability='UNKNOWN'and outcome.status='inconclusive'and outcome.reason='NO_APPROVED_RUBRIC_COMPARISON_POLICY'
 and internal.result_source_current(target_school,baseline.id)and internal.result_source_current(target_school,followup.id)),false)
$$;
create function internal.measure_native_intervention(target uuid,followup_id uuid)returns uuid language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();task app.interventions;baseline internal.improvement_result_sources;followup internal.improvement_result_sources;existing app.outcome_measurements;id uuid;begin
 select*into task from app.interventions where school_id=school and id=target for update;if not found or not"authorization".can_access_intervention(school,target,true)then raise exception 'Native reassessment source denied'using errcode='42501';end if;
 select*into baseline from internal.improvement_result_sources where school_id=school and id=task.baseline_result_id;select*into followup from internal.improvement_result_sources where school_id=school and id=followup_id;
 if baseline.id is null or followup.id is null or baseline.model<>'rubric'or followup.model<>'rubric'or task.completed_at is null or followup.assessment_id is distinct from task.follow_up_assessment_id or baseline.learner_id<>task.learner_id or followup.learner_id<>task.learner_id or baseline.reference_id<>followup.reference_id or baseline.reference_version<>followup.reference_version or baseline.native_result->>'rubricId'is distinct from followup.native_result->>'rubricId'or baseline.native_result->>'rubricVersion'is distinct from followup.native_result->>'rubricVersion'or not internal.native_academic_source_allowed(school,baseline.id,true)or not internal.native_academic_source_allowed(school,followup.id,true)or followup.created_at<=task.completed_at or not exists(select 1 from app.submissions submission where submission.school_id=school and submission.id=followup.submission_id and submission.submitted_at>task.completed_at)then raise exception 'Compatible native follow-up evidence required'using errcode='22023';end if;
 select*into existing from app.outcome_measurements where school_id=school and intervention_id=target;if found then if existing.model<>'rubric'or existing.follow_up_result_id<>followup_id then raise exception 'Native outcome immutable'using errcode='22023';end if;return existing.id;end if;
 insert into app.outcome_measurements(school_id,intervention_id,learner_id,baseline_result_id,follow_up_result_id,status,reason,model,native_baseline,native_follow_up,comparability)values(school,target,task.learner_id,baseline.id,followup.id,'inconclusive','NO_APPROVED_RUBRIC_COMPARISON_POLICY','rubric',baseline.native_result,followup.native_result,'UNKNOWN')returning outcome_measurements.id into id;
 update app.interventions task_update set status='MEASURED'where task_update.school_id=school and task_update.id=target;return id;
end$$;
create function internal.native_outcome_integrity()returns trigger language plpgsql security definer set search_path=''as $$declare baseline internal.improvement_result_sources;followup internal.improvement_result_sources;begin
 select*into baseline from internal.improvement_result_sources where school_id=new.school_id and id=new.baseline_result_id;select*into followup from internal.improvement_result_sources where school_id=new.school_id and id=new.follow_up_result_id;
 if baseline.id is null or followup.id is null or baseline.model is distinct from new.model or followup.model is distinct from new.model or baseline.learner_id<>new.learner_id or followup.learner_id<>new.learner_id then raise exception 'Native outcome source model mismatch'using errcode='22023';end if;
 if new.model='rubric'and(new.native_baseline is distinct from baseline.native_result or new.native_follow_up is distinct from followup.native_result or baseline.native_result->>'rubricId'is distinct from followup.native_result->>'rubricId')then raise exception 'Exact native outcome descriptors required'using errcode='22023';end if;return new;
end$$;
create trigger native_outcome_integrity before insert on app.outcome_measurements for each row execute function internal.native_outcome_integrity();
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.measure_intervention(uuid,uuid,numeric)'::regprocedure);anchor:='select*into i from app.interventions';if position(anchor in definition)=0 then raise exception 'Native measurement dispatch changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if exists(select 1 from app.interventions native join internal.improvement_result_sources source on source.school_id=native.school_id and source.id=native.baseline_result_id where native.school_id="authorization".school_id()and native.id=target and source.model=''rubric'')then return internal.measure_native_intervention(target,followup_id);end if;'||anchor);execute definition;
end$$;
create function internal.native_outcome_value(target_school uuid,target_outcome uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',outcome.id,'interventionId',outcome.intervention_id,'baselineResultId',outcome.baseline_result_id,'followUpResultId',outcome.follow_up_result_id,'status',outcome.status,'reason',outcome.reason,'limitation',outcome.limitation,'measuredAt',outcome.measured_at)
 ||case when outcome.model='rubric'then jsonb_build_object('model','rubric','baseline',outcome.native_baseline,'followUp',outcome.native_follow_up,'comparability','UNKNOWN')else jsonb_build_object('difference',outcome.difference,'minimumChange',outcome.minimum_change,'baseline',jsonb_build_object('score',outcome.baseline_score,'maxScore',outcome.baseline_max_score),'followUp',jsonb_build_object('score',outcome.follow_up_score,'maxScore',outcome.follow_up_max_score))end
 from app.outcome_measurements outcome where outcome.school_id=target_school and outcome.id=target_outcome
$$;
create function internal.intervention_outcome_projection(target_outcome uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare school uuid:="authorization".school_id();outcome app.outcome_measurements;begin
 select*into outcome from app.outcome_measurements where school_id=school and id=target_outcome;
 if not found or not internal.intervention_history_allowed(school,outcome.intervention_id)or(outcome.model='rubric'and not internal.native_intervention_outcome_allowed(school,outcome.id))or(outcome.model='numeric'and not exists(select 1 from app.result_revisions source where source.school_id=school and source.id=outcome.follow_up_result_id and"authorization".can_read_academic_source(source.school_id,source.learner_id,source.parent_visible,source.assessment_id)))then raise exception 'Native outcome read denied'using errcode='42501';end if;return internal.native_outcome_value(school,target_outcome);
end$$;
drop policy outcome_read on app.outcome_measurements;
create policy outcome_read on app.outcome_measurements for select to cuevo_api using(internal.intervention_history_allowed(school_id,intervention_id)and case when model='rubric'then internal.native_intervention_outcome_allowed(school_id,id)else exists(select 1 from app.result_revisions result where result.school_id=outcome_measurements.school_id and result.id=outcome_measurements.follow_up_result_id and"authorization".can_read_academic_source(result.school_id,result.learner_id,result.parent_visible,result.assessment_id))end);
-- Native outcome events use the same source processor and support/state owner.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.process_support_learning_event(uuid,uuid)'::regprocedure);anchor:='or not exists(select 1 from app.result_revisions b join app.result_revisions f';if position(anchor in definition)=0 then raise exception 'Native worker outcome validation changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'or not(case when o.model=''rubric''then internal.native_intervention_outcome_allowed(o.school_id,o.id)else exists(select 1 from app.result_revisions b join app.result_revisions f');
 anchor:='and o.baseline_max_score=b.max_score and o.follow_up_max_score=f.max_score)';if position(anchor in definition)=0 then raise exception 'Native worker outcome scale changed'using errcode='22023';end if;definition:=replace(definition,anchor,anchor||'end)');execute definition;
end$$;
do $$declare definition text;first integer;last integer;anchor text;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 first:=position('select coalesce(jsonb_agg(jsonb_build_object('||chr(10)||'  ''id'',o.id' in definition);last:=position(' )order by o.measured_at,o.id)'in definition);
 if first=0 or last<=first then raise exception 'Native support outcome projection changed'using errcode='22023';end if;
 definition:=overlay(definition placing 'select coalesce(jsonb_agg(internal.native_outcome_value(target_school,o.id)'from first for last-first+2);execute definition;
end$$;
-- Native outcomes retain observed evidence but do not enter the comparable
-- improvement denominator. Numeric metrics retain their existing policy.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_intelligence_metrics(integer,text)'::regprocedure);anchor:='outcome.status outcome_status';if position(anchor in definition)=0 then raise exception 'Native outcome metrics source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'case when outcome.model=''numeric''then outcome.status else null end outcome_status');execute definition;
end$$;
revoke execute on function internal.native_intervention_outcome_allowed(uuid,uuid),internal.measure_native_intervention(uuid,uuid),internal.intervention_outcome_projection(uuid),internal.native_outcome_value(uuid,uuid),internal.native_outcome_integrity()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.intervention_outcome_projection(uuid)to cuevo_api;
commit;
