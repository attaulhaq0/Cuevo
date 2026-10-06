begin;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_class_learning_summary(uuid,integer,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'kind text;','observation_kind text;');
 definition:=replace(definition,'foreach kind in array','foreach observation_kind in array');
 definition:=replace(definition,'observation.kind=read_class_learning_summary.kind','observation.kind=observation_kind');
 definition:=replace(definition,'jsonb_build_object(kind,jsonb_build_object','jsonb_build_object(observation_kind,jsonb_build_object');
 if definition=previous or position('observation.kind=observation_kind'in definition)=0 or position('foreach observation_kind'in definition)=0 then raise exception 'Class observation loop source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
