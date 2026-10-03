begin;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.validate_school_payload(text,jsonb)'::regprocedure);
 anchor:='fields-array[''expectedRevision'']';if position(anchor in definition)=0 then raise exception 'School access field source changed'using errcode='22023';end if;
 execute replace(definition,anchor,'array_remove(fields,''expectedRevision'')');
end$$;
commit;
