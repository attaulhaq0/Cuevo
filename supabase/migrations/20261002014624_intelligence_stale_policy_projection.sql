begin;
-- A withdrawn policy makes the saved proposal unavailable; it does not make a
-- current authorized proposal page fail. Keep unexpected database errors visible.
do $$declare definition text;anchor text:='exception when insufficient_privilege or no_data_found then return false;end;';begin
 definition:=pg_get_functiondef('internal.recommendation_source_allowed(uuid,uuid)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Recommendation source projection changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'exception when insufficient_privilege or no_data_found or invalid_parameter_value then return false;end;');
 execute definition;
end$$;
revoke execute on function internal.recommendation_source_allowed(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.recommendation_source_allowed(uuid,uuid)to cuevo_api;
commit;
