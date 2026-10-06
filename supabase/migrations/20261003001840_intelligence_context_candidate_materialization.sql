-- Materialize exact current source identities before expensive authorization.
-- No early top-N limit: denied rows cannot displace an authorized source.
begin;
do $$declare definition text;selection_start integer;selection_end integer;option_start integer;option_end integer;replacement text;signature text;begin
 definition:=pg_get_functiondef('internal.teacher_insight_context(uuid)'::regprocedure);
 selection_start:=position(' select coalesce(jsonb_agg(source order by created_at desc,id)'in definition);
 selection_end:=position(' select coalesce(jsonb_agg(source order by occurred_at desc,id)'in definition);
 if selection_start=0 or selection_end<=selection_start or position('internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true)'in definition)=0 then raise exception 'Numeric context current source selection changed'using errcode='22023';end if;
 replacement:=$selection$
 with candidates as materialized(
  select r.id,r.created_at,r.evidence_id,r.reference_id,r.reference_version,r.score,r.max_score
  from app.current_results current_result join app.result_revisions r on r.school_id=current_result.school_id and r.id=current_result.result_id
  join app.assessments assessment on assessment.school_id=r.school_id and assessment.id=r.assessment_id
  where r.school_id=school and r.learner_id=baseline.learner_id and assessment.course_id=course.id and r.reference_id=baseline.reference_id and r.reference_version=baseline.reference_version and r.max_score=baseline.max_score
 ),bounded as materialized(
  select r.id,r.created_at,jsonb_build_object('resultId',r.id,'evidenceId',r.evidence_id,'referenceId',r.reference_id,'referenceVersion',r.reference_version,'score',r.score,'maxScore',r.max_score)source
  from candidates r where internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true)
  order by(r.id=baseline_id)desc,r.created_at desc,r.id limit 10
 )
 select coalesce(jsonb_agg(source order by created_at desc,id),'[]'::jsonb)into recent from bounded;
 $selection$;
 definition:=overlay(definition placing replacement from selection_start for selection_end-selection_start);execute definition;

 definition:=pg_get_functiondef('internal.teacher_native_insight_context(uuid)'::regprocedure);
 selection_start:=position(' select coalesce(jsonb_agg(source order by priority,created_at desc,id)'in definition);
 selection_end:=position(' select coalesce(jsonb_agg(source order by occurred_at desc,id)'in definition);
 if selection_start=0 or selection_end<=selection_start or position('internal.native_academic_source_allowed(school,result.id,true)'in definition)=0 then raise exception 'Native context current source selection changed'using errcode='22023';end if;
 replacement:=$selection$
 with candidates as materialized(
  select result.id,result.created_at,result.evidence_id,result.reference_id,result.reference_version,result.native_result
  from internal.improvement_result_sources result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id
  where result.school_id=school and result.learner_id=baseline.learner_id and result.model='rubric'and assessment.course_id=course.id and result.reference_id=baseline.reference_id and result.reference_version=baseline.reference_version
 ),bounded as materialized(
  select result.id,result.created_at,case when result.id=baseline_id then 0 else 1 end priority,
   jsonb_build_object('resultId',result.id,'evidenceId',result.evidence_id,'referenceId',result.reference_id,'referenceVersion',result.reference_version,'nativeResult',result.native_result)source
  from candidates result where internal.native_academic_source_allowed(school,result.id,true)
  order by(result.id=baseline_id)desc,result.created_at desc,result.id limit 10
 )
 select coalesce(jsonb_agg(source order by priority,created_at desc,id),'[]'::jsonb)into recent from bounded;
 $selection$;
 definition:=overlay(definition placing replacement from selection_start for selection_end-selection_start);execute definition;

 -- The published source function already overwrites the old raw activity query.
 -- Remove only that dead retrieval; keep its exact authoritative replacement.
 foreach signature in array array['internal.teacher_insight_context(uuid)','internal.teacher_native_insight_context(uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  option_start:=position(' select coalesce(jsonb_agg(source order by sequence,id)'in definition);
  option_end:=position('options:=internal.insight_published_options(school,course.id);'in definition);
  if option_start=0 or option_end<=option_start or position('from app.activities activity'in substring(definition from option_start for option_end-option_start))=0 then raise exception 'Published context option replacement changed'using errcode='22023';end if;
  definition:=overlay(definition placing ''from option_start for option_end-option_start);execute definition;
 end loop;
end$$;
commit;
