begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'left join app.outcome_measurements o on c.id is not null and o.school_id=i.school_id',
  'left join app.outcome_measurements o on c.id is not null and exists(select 1 from internal.processed_events prerequisite where prerequisite.school_id=i.school_id and prerequisite.source_type=''REASSESSMENT''and prerequisite.source_id=i.id)and o.school_id=i.school_id');
 execute definition;
end$$;
commit;
