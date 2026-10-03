begin;
-- Native rubric runs belong in workflow and explicit human-review denominators.
-- Descriptor-only outcomes retain UNKNOWN comparability; no scalar is invented.
do $$
declare signature text;definition text;anchor text:='join app.result_revisions baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id';expected_count integer;actual_count integer;
begin
 foreach signature in array array['internal.read_intelligence_metrics(integer,text)','internal.read_intelligence_evaluation(integer,text)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  expected_count:=case signature when 'internal.read_intelligence_metrics(integer,text)'then 2 else 3 end;
  actual_count:=(length(definition)-length(replace(definition,anchor,'')))/length(anchor);
  if actual_count<>expected_count then raise exception 'Native workflow metric source changed: %',signature using errcode='22023';end if;
  if signature='internal.read_intelligence_metrics(integer,text)'and(position('case when outcome.model=''numeric''then outcome.status else null end outcome_status'in definition)=0 or position('''costAccounting'''in definition)=0)then
   raise exception 'Native metric comparison or cost boundary changed'using errcode='22023';
  end if;
  definition:=replace(definition,anchor,'join internal.improvement_result_sources baseline on baseline.school_id=run.school_id and baseline.id=run.baseline_result_id');
  execute definition;
 end loop;
end$$;
-- Keep the existing sole API surface and owner-only observation helper.
revoke execute on function internal.read_intelligence_metrics(integer,text),internal.read_intelligence_evaluation(integer,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_metrics(integer,text)to cuevo_api;
commit;
