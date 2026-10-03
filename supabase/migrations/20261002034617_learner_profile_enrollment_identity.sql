begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_learner_profile(uuid)'::regprocedure);
 if position('select enrollment.id,class.id class_id'in definition)=0 then raise exception 'Expected learner enrollment source missing';end if;
 definition:=replace(definition,'select enrollment.id,class.id class_id','select md5(enrollment.class_id::text||enrollment.student_actor_id::text)::uuid id,class.id class_id');
 execute definition;
end$$;
commit;
