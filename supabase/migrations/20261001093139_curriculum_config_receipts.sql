begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.configure_curriculum(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'not"authorization".can_manage_course(school,course.id)',
  'not("authorization".can_manage_course(school,course.id)or("authorization".current_role(school)=''coordinator''and"authorization".can_view_class(school,course.class_id)))');
 definition:=replace(definition,'''curriculum:''||actor::text||'':''||command_key',
  'md5(''curriculum:''||actor::text||'':''||command_name||'':''||command_key)');
 execute definition;
end$$;
commit;
