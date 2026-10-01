begin;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.teacher_insight_context(uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'answer jsonb;','answer jsonb;window_days integer;');
 definition:=replace(definition,'select*into reference from app.school_custom_references', 'select development_window_days into window_days from app.learner_state_policies where school_id=school;select*into reference from app.school_custom_references');
 definition:=replace(definition,'o.occurred_at>=clock_timestamp()-interval''14 days''','window_days is not null and o.occurred_at>=clock_timestamp()-make_interval(days=>window_days)');
 definition:=replace(definition,'left join app.outcome_measurements outcome on outcome.school_id=i.school_id and outcome.intervention_id=i.id',
 'left join app.outcome_measurements outcome on outcome.school_id=i.school_id and outcome.intervention_id=i.id and exists(select 1 from app.result_revisions followup join app.assessments followup_assessment on followup_assessment.school_id=followup.school_id and followup_assessment.id=followup.assessment_id where followup.school_id=school and followup.id=outcome.follow_up_result_id and followup.learner_id=baseline.learner_id and followup.reference_id=r.reference_id and followup.reference_version=r.reference_version and followup.max_score=r.max_score and followup_assessment.id=i.follow_up_assessment_id and followup_assessment.course_id=course.id and"authorization".programme_course_allowed(school,followup_assessment.course_id,baseline.learner_id))');
 definition:=replace(definition,'i.learner_id=baseline.learner_id and a.course_id=course.id',
 'i.learner_id=baseline.learner_id and a.course_id=course.id and(i.follow_up_assessment_id is null or exists(select 1 from app.assessments reassessment where reassessment.school_id=school and reassessment.id=i.follow_up_assessment_id and reassessment.course_id=course.id and"authorization".programme_course_allowed(school,reassessment.course_id,baseline.learner_id)))');
 if definition=previous or position('window_days is not null'in definition)=0 or position('followup.reference_version=r.reference_version'in definition)=0 then raise exception 'Insight source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
