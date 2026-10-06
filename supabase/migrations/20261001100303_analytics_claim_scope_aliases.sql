begin;
create or replace function internal.claim_analytics_delivery(batch_size integer,lease_seconds integer)returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid)language plpgsql security definer set search_path=''as $$
begin
 if batch_size is null or batch_size not between 1 and 100 or lease_seconds is null or lease_seconds not between 5 and 300 then raise exception 'Bounded analytics delivery required'using errcode='22023';end if;
 update internal.analytics_delivery delivery set state='FAILED',lease_token=null,lease_until=null where delivery.state='PROCESSING'and delivery.lease_until<clock_timestamp()and delivery.attempts>=5;
 return query with candidates as(
  select event.id from internal.outbox_events event join app.schools school on school.id=event.school_id join app.people person on person.school_id=event.school_id and person.actor_id=event.actor_id
  left join internal.analytics_delivery delivery on delivery.event_id=event.id
  where event.state='COMPLETED'and school.status='active'and person.synthetic and event.type in('activity.complete','submission.create','submission.resubmitted','quiz.submitted','result.released','rubric.result.released','recommendation.approved','recommendation.rejected','intervention.created','intervention.completed','reassessment.linked','outcome.measured','community.post_created')
   and exists(select 1 from app.school_policy_versions policy where policy.school_id=event.school_id and policy.version=(select max(latest_policy.version)from app.school_policy_versions latest_policy where latest_policy.school_id=event.school_id)and policy.analytics_enabled)
   and(delivery.event_id is null or(delivery.state='PROCESSING'and delivery.lease_until<clock_timestamp()and delivery.attempts<5))
  order by event.occurred_at,event.id for update of event skip locked limit batch_size
 ),claimed as(
  insert into internal.analytics_delivery as receipt(event_id,lease_token,lease_until)select candidate.id,gen_random_uuid(),clock_timestamp()+make_interval(secs=>lease_seconds)from candidates candidate
  on conflict(event_id)do update set attempts=receipt.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until
  returning receipt.event_id,receipt.lease_token
 )select event.id,event.school_id,event.actor_id,event.type,event.occurred_at,claimed.lease_token from claimed join internal.outbox_events event on event.id=claimed.event_id;
end$$;
revoke execute on function internal.claim_analytics_delivery(integer,integer)from public,anon,authenticated,service_role,cuevo_api;
grant execute on function internal.claim_analytics_delivery(integer,integer)to cuevo_worker;
commit;
