begin;
-- Completion aggregation uses the same current learner/course allowlist once per read.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'completion_count integer;', 'authorized_courses uuid[];completion_count integer;');
 definition:=replace(definition,' completion_count:=null;last_completion:=null;',
  'select coalesce(array_agg(course.id),array[]::uuid[])into authorized_courses from app.courses course where course.school_id=school and"authorization".can_read_course(school,course.id)and"authorization".current_learner_course(school,course.id,target_learner);completion_count:=null;last_completion:=null;');
 definition:=replace(definition,'and"authorization".can_read_course(school,unit.course_id)and"authorization".current_learner_course(school,unit.course_id,target_learner)', 'and unit.course_id=any(authorized_courses)');
 if definition=previous or position('unit.course_id=any(authorized_courses)'in definition)=0 then raise exception 'Completion source projection changed'using errcode='22023';end if;execute definition;
end$$;
commit;
