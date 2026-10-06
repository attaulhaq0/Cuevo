begin;
-- Keep activity completion and learner revision source types distinct, with explicit foreign keys.
alter table app.habit_observations add column activity_completion_id uuid;
alter table app.habit_observations add column submission_id uuid;
update app.habit_observations set activity_completion_id=source_object_id;
do $$declare constraint_name text;begin
 for constraint_name in select conname from pg_constraint where conrelid='app.habit_observations'::regclass and ((contype='c'and pg_get_constraintdef(oid)like'%kind%')or(contype='c'and pg_get_constraintdef(oid)like'%source_type%')or(contype='f'and confrelid='app.activity_completions'::regclass))loop execute format('alter table app.habit_observations drop constraint %I',constraint_name);end loop;
end$$;
alter table app.habit_observations add check(kind in('practice','reflection','revision'));
alter table app.habit_observations add foreign key(school_id,activity_completion_id)references app.activity_completions(school_id,id);
alter table app.habit_observations add foreign key(school_id,submission_id,learner_id)references app.submissions(school_id,id,learner_id);
alter table app.habit_observations add check((source_type='ACTIVITY_COMPLETION'and kind in('practice','reflection')and activity_completion_id=source_object_id and submission_id is null)or(source_type='SUBMISSION_REVISION'and kind='revision'and submission_id=source_object_id and activity_completion_id is null));
create function internal.habit_activity_source()returns trigger language plpgsql set search_path=''as $$begin if new.source_type='ACTIVITY_COMPLETION'then new.activity_completion_id:=new.source_object_id;end if;return new;end$$;
create trigger habit_activity_source before insert on app.habit_observations for each row execute function internal.habit_activity_source();

create function internal.refresh_revision_habit(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$
declare count_revision integer;ids uuid[];events uuid[];start_at timestamptz;days integer;
begin
 select development_window_days into days from app.learner_state_policies where school_id=target_school;
 if days is null then raise exception 'Approved development policy required'using errcode='22023';end if;
 start_at:=clock_timestamp()-make_interval(days=>days);
 select count(*),coalesce(array_agg(id),array[]::uuid[])into count_revision,ids from(select id from app.habit_observations where school_id=target_school and learner_id=target_learner and kind='revision'and occurred_at>=start_at limit 1001)bounded;
 if count_revision>1000 then raise exception 'Revision projection requires bounded review'using errcode='22023';end if;
 select coalesce(array_agg(distinct event_id),array[]::uuid[])into events from(select event_id from(
  select unnest(source_event_ids)event_id from app.learner_state_snapshots where school_id=target_school and learner_id=target_learner
  union select source_event_id from app.habit_observations where school_id=target_school and learner_id=target_learner and kind='revision'
 )sources limit 1001)bounded;
 if cardinality(events)>1000 then raise exception 'Revision sources require bounded review'using errcode='22023';end if;
 update app.learner_state_snapshots set development=jsonb_set(development,'{revision}',jsonb_build_object('count',case when count_revision>0 then count_revision else null end,'observationIds',ids)),source_event_ids=events where school_id=target_school and learner_id=target_learner;
end$$;
alter function internal.process_learner_event(uuid,uuid)rename to process_native_learning_event;
revoke execute on function internal.process_native_learning_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare e internal.outbox_events;s app.submissions;r app.submission_returns;answer jsonb;observation uuid;
begin
 select*into e from internal.outbox_events where id=target_event for update;
 if not found or e.state<>'PROCESSING'or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()then raise exception 'Invalid event lease'using errcode='22023';end if;
 if e.type='submission.resubmitted'then
  select*into s from app.submissions where school_id=e.school_id and id=e.entity_id;
  select*into r from app.submission_returns where school_id=e.school_id and id=s.return_id;
  if s.id is null or r.id is null or e.entity_type<>'submission'or e.actor_id<>s.learner_id or s.revision<=1 or r.submission_id<>s.previous_submission_id or r.learner_id<>s.learner_id or r.assessment_id<>s.assessment_id or s.submitted_at<r.created_at then raise exception 'Invalid feedback revision source'using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(e.school_id::text||':learner:'||s.learner_id::text,0));
  if exists(select 1 from internal.processed_events pe where pe.event_id=e.id or(pe.school_id=e.school_id and pe.source_type='SUBMISSION_REVISION'and pe.source_id=s.id))then insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','DUPLICATE_SOURCE');end if;
  if not exists(select 1 from app.entitlements where school_id=e.school_id and code='learner.state'and enabled and effective_from<=now()and(effective_to is null or effective_to>now()))then raise exception 'Learner state unavailable'using errcode='42501';end if;
  insert into app.habit_observations(school_id,learner_id,kind,source_type,source_object_id,submission_id,occurred_at,source_event_id)values(e.school_id,s.learner_id,'revision','SUBMISSION_REVISION',s.id,s.id,s.submitted_at,e.id)returning id into observation;
  insert into internal.processed_events(event_id,school_id,source_type,source_id)values(e.id,e.school_id,'SUBMISSION_REVISION',s.id);
  insert into app.learner_state_snapshots(school_id,learner_id,version,academic,development,engagement,support,impact,source_event_ids)values(e.school_id,s.learner_id,1,'[]','{"practice":{"count":null,"observationIds":[]},"revision":{"count":null,"observationIds":[]},"reflection":{"count":null,"observationIds":[]},"windowStart":null,"windowEnd":null}','{"completedActivityCount":null,"lastCompletedAt":null}','{"activeInterventionIds":[],"items":[]}','{"status":"unmeasured","measurementIds":[],"outcomes":[]}',array[e.id])on conflict(school_id,learner_id)do update set version=app.learner_state_snapshots.version+1,generated_at=clock_timestamp();
  perform internal.refresh_revision_habit(e.school_id,s.learner_id);perform internal.refresh_native_academic(e.school_id,s.learner_id);perform internal.refresh_support_impact(e.school_id,s.learner_id);
  insert into internal.outbox_events(school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)values(e.school_id,e.actor_id,'learner_state.updated','learner',s.learner_id,1,'{}','state:'||e.id::text),(e.school_id,e.actor_id,'habit.observed','observation',observation,1,'{}','habit:'||e.id::text)on conflict(school_id,deduplication_key)do nothing;
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','PROCESSED','learnerId',s.learner_id);
 elsif e.type in('submission.draft_saved','submission.returned','submission.closed','quiz.created','quiz.published','quiz.submitted','assessment.availability','curriculum.configured')or e.type like'school.%'then
  insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;
  if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception 'Lease expired before acknowledgement'using errcode='22023';end if;return jsonb_build_object('status','ACKNOWLEDGED');
 end if;
 answer:=internal.process_native_learning_event(target_event,current_lease);
 if answer->>'status'='PROCESSED'then perform internal.refresh_revision_habit(e.school_id,(answer->>'learnerId')::uuid);end if;
 return answer;
end$$;
revoke execute on function internal.refresh_revision_habit(uuid,uuid),internal.habit_activity_source(),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
