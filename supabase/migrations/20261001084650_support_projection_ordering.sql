begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'left join app.outcome_measurements o on o.school_id=i.school_id','left join app.outcome_measurements o on c.id is not null and o.school_id=i.school_id');
 definition:=replace(definition,'where i.school_id=target_school and i.learner_id=target_learner and exists',
  'where i.school_id=target_school and i.learner_id=target_learner and exists');
 execute definition;
end$$;
-- Refuse oversized native histories before materializing their JSON or provenance arrays.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.refresh_native_academic(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'begin'||chr(10)||' select coalesce',
  'begin'||chr(10)||' if (select count(*)from(select 1 from app.current_results where school_id=target_school and learner_id=target_learner union all select 1 from app.current_rubric_results where school_id=target_school and learner_id=target_learner limit 101)bounded)>100 then raise exception ''Native projection requires bounded review''using errcode=''22023'';end if;'||chr(10)||' select coalesce');
 definition:=replace(definition,')sources;',')sources limit 1001;');
 -- LIMIT belongs inside the source query, before aggregation; replace the union container explicitly.
 definition:=replace(definition,'select coalesce(array_agg(distinct event_id),array[]::uuid[])into events from(',
  'select coalesce(array_agg(distinct event_id),array[]::uuid[])into events from(select event_id from(');
 definition:=replace(definition,')sources limit 1001;',')sources limit 1001)bounded_sources;');
 execute definition;
end$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.refresh_support_impact(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'select coalesce(array_agg(distinct event_id),array[]::uuid[]) into events from (',
  'select coalesce(array_agg(distinct event_id),array[]::uuid[]) into events from (select event_id from (');
 definition:=replace(definition,') sources;',') sources limit 1001) bounded_sources;');
 execute definition;
end$$;
commit;
