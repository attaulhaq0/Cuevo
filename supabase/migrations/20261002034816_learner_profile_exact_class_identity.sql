begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_learner_profile(uuid)'::regprocedure);
 if position('select md5(enrollment.class_id::text||enrollment.student_actor_id::text)::uuid id,class.id class_id'in definition)=0 then raise exception 'Expected learner enrollment projection missing';end if;
 definition:=replace(definition,'select md5(enrollment.class_id::text||enrollment.student_actor_id::text)::uuid id,class.id class_id','select class.id class_id');
 definition:=replace(definition,'jsonb_build_object(''id'',id,''classId'',class_id','jsonb_build_object(''classId'',class_id');
 execute definition;
end$$;
commit;
