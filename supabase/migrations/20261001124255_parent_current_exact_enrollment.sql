begin;
-- A sibling can authorize a course, but never another child's current academic page.
-- Historical approved evidence remains governed by its established retained-read policy.
do $$declare definition text;previous text;guard text;begin
 definition:=pg_get_functiondef('internal.list_parent_current_results_scoped(integer,uuid,uuid)'::regprocedure);previous:=definition;
 guard:='assessment.course_id=any(courses)and exists(select 1 from app.courses exact_course join app.enrollments exact_enrollment on exact_enrollment.school_id=exact_course.school_id and exact_enrollment.class_id=exact_course.class_id where exact_course.school_id=r.school_id and exact_course.id=assessment.course_id and exact_enrollment.student_actor_id=r.learner_id and exact_enrollment.status=''active''and exact_enrollment.effective_from<=now()and(exact_enrollment.effective_to is null or exact_enrollment.effective_to>now()))';
 definition:=replace(definition,'assessment.course_id=any(courses)',guard);
 if definition=previous or(length(definition)-length(replace(definition,'exact_enrollment.student_actor_id=r.learner_id','')))/length('exact_enrollment.student_actor_id=r.learner_id')<>2 then raise exception 'Parent native candidate source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
