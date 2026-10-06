begin;
-- can_mark_submission's actor/course guards were already resolved in courses.
-- Keep its exact learner/class condition explicit instead of rejoining all sources
-- inside the same helper for each candidate. Current student/programme guards remain.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_current_marking_page(integer,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'and"authorization".can_mark_submission(school,submission.id)',
  'and exists(select 1 from app.courses enrolled_course join app.enrollments enrollment on enrollment.school_id=enrolled_course.school_id and enrollment.class_id=enrolled_course.class_id where enrolled_course.school_id=school and enrolled_course.id=assessment.course_id and enrollment.student_actor_id=submission.learner_id and enrollment.status=''active''and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now()))');
 if definition=previous then raise exception 'Current marking candidate source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
