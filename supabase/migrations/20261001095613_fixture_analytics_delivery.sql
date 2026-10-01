begin;
create table internal.analytics_delivery(event_id uuid primary key references internal.outbox_events(id),state text not null default'PROCESSING'check(state in('PROCESSING','COMPLETED','FAILED')),attempts integer not null default 1 check(attempts between 1 and 5),lease_token uuid,lease_until timestamptz,insert_id text,completed_at timestamptz,check(insert_id is null or insert_id~'^[a-f0-9]{64}$'));
alter table internal.analytics_delivery enable row level security;alter table internal.analytics_delivery force row level security;
revoke all on internal.analytics_delivery from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.claim_analytics_delivery(batch_size integer,lease_seconds integer)returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid)language plpgsql security definer set search_path=''as $$
begin
 if batch_size is null or batch_size not between 1 and 100 or lease_seconds is null or lease_seconds not between 5 and 300 then raise exception 'Bounded analytics delivery required'using errcode='22023';end if;
 update internal.analytics_delivery d set state='FAILED',lease_token=null,lease_until=null where d.state='PROCESSING'and d.lease_until<clock_timestamp()and d.attempts>=5;
 return query with candidates as(
  select e.id from internal.outbox_events e join app.schools s on s.id=e.school_id join app.people person on person.school_id=e.school_id and person.actor_id=e.actor_id
  left join internal.analytics_delivery d on d.event_id=e.id
  where e.state='COMPLETED'and s.status='active'and person.synthetic and e.type in('activity.complete','submission.create','submission.resubmitted','quiz.submitted','result.released','rubric.result.released','recommendation.approved','recommendation.rejected','intervention.created','intervention.completed','reassessment.linked','outcome.measured','community.post_created')
   and exists(select 1 from app.school_policy_versions p where p.school_id=e.school_id and p.version=(select max(version)from app.school_policy_versions where school_id=e.school_id)and p.analytics_enabled)
   and(d.event_id is null or(d.state='PROCESSING'and d.lease_until<clock_timestamp()and d.attempts<5))
  order by e.occurred_at,e.id for update of e skip locked limit batch_size
 ),claimed as(
  insert into internal.analytics_delivery(event_id,lease_token,lease_until)select c.id,gen_random_uuid(),clock_timestamp()+make_interval(secs=>lease_seconds)from candidates c
  on conflict(event_id)do update set attempts=internal.analytics_delivery.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until
  returning event_id,analytics_delivery.lease_token
 )select e.id,e.school_id,e.actor_id,e.type,e.occurred_at,c.lease_token from claimed c join internal.outbox_events e on e.id=c.event_id;
end$$;
create function internal.complete_analytics_delivery(target_event uuid,current_lease uuid,target_insert_id text)returns boolean language plpgsql security definer set search_path=''as $$declare affected integer;begin
 if target_insert_id is null or target_insert_id!~'^[a-f0-9]{64}$'then raise exception 'Minimized analytics identity required'using errcode='22023';end if;
 update internal.analytics_delivery d set state='COMPLETED',insert_id=target_insert_id,completed_at=clock_timestamp(),lease_token=null,lease_until=null where d.event_id=target_event and d.state='PROCESSING'and d.lease_token=current_lease and d.lease_until>clock_timestamp()and exists(select 1 from internal.outbox_events e join app.people p on p.school_id=e.school_id and p.actor_id=e.actor_id where e.id=d.event_id and e.state='COMPLETED'and p.synthetic);
 get diagnostics affected=row_count;return affected=1;
end$$;
revoke execute on function internal.claim_analytics_delivery(integer,integer),internal.complete_analytics_delivery(uuid,uuid,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_analytics_delivery(integer,integer),internal.complete_analytics_delivery(uuid,uuid,text)to cuevo_worker;
commit;
