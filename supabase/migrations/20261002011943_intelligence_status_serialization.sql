begin;
-- Serialize status reconciliation with model completion and other status readers.
-- Re-read the row after locking; a stale expired cursor never overwrites a terminal receipt.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_intelligence_run_status(integer,uuid,uuid)'::regprocedure);
 anchor:='if candidate.state=''REASONING''and candidate.lease_until<=clock_timestamp()then';
 if position(anchor in definition)=0 then raise exception 'Run status reconciliation shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'select*into candidate from app.intelligence_runs run where run.school_id=school and run.id=candidate.id and run.actor_id=actor for update;if not found then raise exception ''Run status scope changed''using errcode=''42501'';end if;perform internal.require_intelligence_policy(candidate.generation_mode,candidate.policy_version);'||anchor);
 execute definition;
end$$;
commit;
