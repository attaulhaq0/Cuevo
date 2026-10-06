begin;
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.read_learner_profile(uuid)'::regprocedure);
 anchor:='perform pg_advisory_xact_lock(hashtextextended(school::text||'':school-access-mutations'',0));';
 if position(anchor in definition)=0 then raise exception 'Expected profile school access lock missing';end if;
 definition:=replace(definition,anchor,'perform pg_advisory_xact_lock_shared(hashtextextended(school::text||'':school-access-mutations'',0));');
 anchor:='from app.courses course join app.classes class on class.school_id=course.school_id and class.id=course.class_id';
 replacement:='from app.enrollments current_enrollment join app.courses course on course.school_id=current_enrollment.school_id and course.class_id=current_enrollment.class_id join app.classes class on class.school_id=course.school_id and class.id=course.class_id';
 if position(anchor in definition)=0 then raise exception 'Expected profile course source join missing';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:='where course.school_id=school and course.status=''PUBLISHED''';
 if position(anchor in definition)=0 then raise exception 'Expected profile course source filter missing';end if;
 definition:=replace(definition,anchor,'where current_enrollment.school_id=school and current_enrollment.student_actor_id=target_learner and current_enrollment.status=''active''and current_enrollment.effective_from<=now()and(current_enrollment.effective_to is null or current_enrollment.effective_to>now())and course.school_id=school and course.status=''PUBLISHED''');
 execute definition;
end$$;
alter function internal.read_learner_profile(uuid)set jit='off';
commit;
