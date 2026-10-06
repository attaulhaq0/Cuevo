begin;
-- Qualify function parameters where the resource table has the same target column names.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_learning_resource_page(uuid,text,uuid,integer,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'resource.course_id=target_course and resource.target_kind=target_kind and resource.target_id=target_id',
  'resource.course_id=read_learning_resource_page.target_course and resource.target_kind=read_learning_resource_page.target_kind and resource.target_id=read_learning_resource_page.target_id');
 if definition=previous then raise exception 'Resource page parameter predicate changed'using errcode='22023';end if;execute definition;
 -- The INSERT values also use explicit parameter scope, independent from its target column list.
 definition:=pg_get_functiondef('internal.learning_resource_command(text,uuid,text,uuid,uuid,jsonb,text,text,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'values(school,rid,target_course,target_kind,target_id,payload->>''title''',
  'values(school,rid,learning_resource_command.target_course,learning_resource_command.target_kind,learning_resource_command.target_id,payload->>''title''');
 if definition=previous then raise exception 'Resource command parameter values changed'using errcode='22023';end if;execute definition;
end$$;
commit;
