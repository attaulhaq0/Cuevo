begin;
-- Coordinators retain portfolio/evidence metadata, not raw submitted answer authority.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_portfolio_source_work(uuid,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'role_name not in(''admin'',''coordinator'',''teacher'',''student'',''parent'')','role_name not in(''admin'',''teacher'',''student'',''parent'')');
 if definition=previous then raise exception 'Portfolio source-work role guard changed'using errcode='22023';end if;execute definition;
end$$;
commit;
