begin;
create or replace function internal.refresh_revision_habit(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$
declare count_revision integer;ids_revision uuid[];count_practice integer;ids_practice uuid[];count_reflection integer;ids_reflection uuid[];events uuid[];start_at timestamptz;end_at timestamptz;days integer;
begin
 select development_window_days into days from app.learner_state_policies where school_id=target_school;
 if days is null then raise exception 'Approved development policy required'using errcode='22023';end if;
 end_at:=clock_timestamp();start_at:=end_at-make_interval(days=>days);
 select count(*)filter(where kind='revision'),coalesce(array_agg(id)filter(where kind='revision'),array[]::uuid[]),count(*)filter(where kind='practice'),coalesce(array_agg(id)filter(where kind='practice'),array[]::uuid[]),count(*)filter(where kind='reflection'),coalesce(array_agg(id)filter(where kind='reflection'),array[]::uuid[])
 into count_revision,ids_revision,count_practice,ids_practice,count_reflection,ids_reflection from(select id,kind from app.habit_observations where school_id=target_school and learner_id=target_learner and occurred_at>=start_at and occurred_at<=end_at limit 1001)bounded;
 if count_revision+count_practice+count_reflection>1000 then raise exception 'Development projection requires bounded review'using errcode='22023';end if;
 select coalesce(array_agg(distinct event_id),array[]::uuid[])into events from(select event_id from(
  select unnest(source_event_ids)event_id from app.learner_state_snapshots where school_id=target_school and learner_id=target_learner
  union select source_event_id from app.habit_observations where school_id=target_school and learner_id=target_learner
 )sources limit 1001)bounded;
 if cardinality(events)>1000 then raise exception 'Development sources require bounded review'using errcode='22023';end if;
 update app.learner_state_snapshots set development=jsonb_build_object('completeness','RECORDED_ONLY','practice',jsonb_build_object('count',count_practice,'observationIds',ids_practice),'reflection',jsonb_build_object('count',count_reflection,'observationIds',ids_reflection),'revision',jsonb_build_object('count',case when count_revision>0 then count_revision else null end,'observationIds',ids_revision),'windowStart',start_at,'windowEnd',end_at),source_event_ids=events where school_id=target_school and learner_id=target_learner;
end$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.process_learner_event(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'if not exists(select 1 from app.entitlements where school_id=e.school_id',
  'if not exists(select 1 from app.schools where id=e.school_id and status=''active'')or not exists(select 1 from app.entitlements where school_id=e.school_id');
 execute definition;
end$$;
commit;
