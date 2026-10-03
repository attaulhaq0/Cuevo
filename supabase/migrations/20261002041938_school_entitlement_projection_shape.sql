begin;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.school_list(text,jsonb)'::regprocedure);
 anchor:='''''effectiveTo'''',effective_to,''''revision'''',revision)row from app.entitlements';
 -- The entitlement table has no access-revision column; revisions belong to membership/relationship sources.
 if position(anchor in definition)=0 then raise exception 'Expected entitlement projection source missing';end if;
 execute replace(definition,anchor,'''''effectiveTo'''',effective_to)row from app.entitlements');
end$$;
commit;
