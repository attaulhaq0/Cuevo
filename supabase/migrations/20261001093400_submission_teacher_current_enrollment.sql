begin;
-- Staff raw work is scoped to the learner's current enrollment in the specific managed course class.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_submission_page(integer,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'s.learner_id=any(learners)',
  's.learner_id=any(learners)and(role_name<>''teacher''or exists(select 1 from app.courses enrolled_course join app.enrollments current_enrollment on current_enrollment.school_id=enrolled_course.school_id and current_enrollment.class_id=enrolled_course.class_id where enrolled_course.school_id=s.school_id and enrolled_course.id=a.course_id and current_enrollment.student_actor_id=s.learner_id and current_enrollment.status=''active''and current_enrollment.effective_from<=now()and(current_enrollment.effective_to is null or current_enrollment.effective_to>now())))');
 execute definition;
end$$;
commit;
