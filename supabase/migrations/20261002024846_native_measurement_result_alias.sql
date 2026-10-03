begin;
do $$declare definition text;anchor text:='existing app.outcome_measurements;id uuid;';begin
 definition:=pg_get_functiondef('internal.measure_native_intervention(uuid,uuid)'::regprocedure);
 if position(anchor in definition)=0 or position('returning outcome_measurements.id into id;'in definition)=0 or position('return id;'in definition)=0 then raise exception 'Native measurement result alias changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'existing app.outcome_measurements;measured_id uuid;');
 definition:=replace(definition,'returning outcome_measurements.id into id;','returning outcome_measurements.id into measured_id;');
 definition:=replace(definition,'return id;','return measured_id;');execute definition;
end$$;
revoke execute on function internal.measure_native_intervention(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
