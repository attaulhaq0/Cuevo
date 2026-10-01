begin;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_class_learning_summary(uuid,integer,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'observation.kind=kind','observation.kind=read_class_learning_summary.kind');
 definition:=replace(definition,'where intervention.school_id=school and intervention.learner_id=person.actor_id and assessment.course_id=any(courses)',
  'where intervention.school_id=school and intervention.learner_id=person.actor_id and assessment.course_id=any(courses)and(intervention.follow_up_assessment_id is null or exists(select 1 from app.assessments reassessment where reassessment.school_id=school and reassessment.id=intervention.follow_up_assessment_id and reassessment.course_id=any(courses)and"authorization".programme_course_allowed(school,reassessment.course_id,person.actor_id)))');
 definition:=replace(definition,'join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id where outcome.school_id=school',
  'join app.assessments assessment on assessment.school_id=baseline.school_id and assessment.id=baseline.assessment_id join app.result_revisions followup on followup.school_id=outcome.school_id and followup.id=outcome.follow_up_result_id join app.assessments followup_assessment on followup_assessment.school_id=followup.school_id and followup_assessment.id=followup.assessment_id where followup.learner_id=person.actor_id and followup.reference_id=baseline.reference_id and followup.reference_version=baseline.reference_version and followup.max_score=baseline.max_score and followup_assessment.id=intervention.follow_up_assessment_id and followup_assessment.course_id=any(courses)and"authorization".programme_course_allowed(school,followup_assessment.course_id,person.actor_id)and outcome.school_id=school');
 if definition=previous or position('observation.kind=read_class_learning_summary.kind'in definition)=0 or position('followup.reference_version=baseline.reference_version'in definition)=0 then raise exception 'Class summary source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
