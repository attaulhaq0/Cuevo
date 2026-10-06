begin;
do $$declare definition text;anchor text:='stored jsonb;source jsonb;basis text;';begin
 definition:=pg_get_functiondef('internal.validate_native_intelligence_analysis(uuid,jsonb)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Native analysis declaration changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'stored jsonb;basis text;');execute definition;
end$$;
revoke execute on function internal.validate_native_intelligence_analysis(uuid,jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
