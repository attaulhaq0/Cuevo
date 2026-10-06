begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'''followUpAssessmentId'',case when exists',
  '''followUpAssessmentId'',case when c.id is not null and exists');
 execute definition;
end$$;
commit;
