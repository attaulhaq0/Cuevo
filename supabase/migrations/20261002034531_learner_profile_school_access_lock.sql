begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_learner_profile(uuid)'::regprocedure);
 if position('perform internal.lock_school_access_mutation(school);'in definition)=0 then raise exception 'Expected learner profile lock source missing';end if;
 definition:=replace(definition,'perform internal.lock_school_access_mutation(school);','perform pg_advisory_xact_lock(hashtextextended(school::text||'':school-access-mutations'',0));');
 execute definition;
end$$;
commit;
