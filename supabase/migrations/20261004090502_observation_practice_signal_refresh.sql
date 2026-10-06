-- Refresh an existing source-backed practice signal or create it when a widened
-- approved window first includes retained observations. No awards or grades change.
begin;
create or replace function internal.refresh_revision_habit(target_school uuid,target_learner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare policy_version integer;history internal.learner_observation_policy_revisions;
end_at timestamptz;start_at timestamptz;count_value integer;ids uuid[];events uuid[];first_at timestamptz;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended(target_school::text||':learner-observation-policy',0));
 history:=internal.current_learner_observation_policy(target_school);
 if history.id is null then raise exception 'Current approved observation source required'using errcode='22023';end if;
 select version into policy_version from app.learner_state_policies where school_id=target_school for share;
 if policy_version is null then raise exception 'Approved observation window required'using errcode='22023';end if;
 perform internal.refresh_revision_habit_before_observation_policy(target_school,target_learner);
 update app.learner_state_snapshots set observation_policy_version=policy_version where school_id=target_school and learner_id=target_learner;
 -- A policy alone cannot create a learner projection or a signal.
 if not found then return;end if;
 end_at:=clock_timestamp();start_at:=end_at-make_interval(days=>history.development_window_days);
 select count(*),min(occurred_at)into count_value,first_at from app.habit_observations
 where school_id=target_school and learner_id=target_learner and kind='practice'and occurred_at>=start_at and occurred_at<=end_at;
 if count_value=0 then return;end if;
 select coalesce(array_agg(id order by occurred_at,id),array[]::uuid[]),coalesce(array_agg(distinct source_event_id),array[]::uuid[])into ids,events
 from(select id,occurred_at,source_event_id from app.habit_observations
 where school_id=target_school and learner_id=target_learner and kind='practice'and occurred_at>=start_at and occurred_at<=end_at
 order by occurred_at,id limit 1000)bounded;
 insert into app.learner_signals(school_id,learner_id,count,rule_version,window_start,window_end,source_event_ids,observation_ids,expires_at)
 values(target_school,target_learner,count_value,policy_version,start_at,end_at,events,ids,first_at+make_interval(days=>history.development_window_days))
 on conflict(school_id,learner_id,type)do update set count=excluded.count,rule_version=excluded.rule_version,
 window_start=excluded.window_start,window_end=excluded.window_end,source_event_ids=excluded.source_event_ids,
 observation_ids=excluded.observation_ids,expires_at=excluded.expires_at,created_at=clock_timestamp();
end$$;
revoke execute on function internal.refresh_revision_habit(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
