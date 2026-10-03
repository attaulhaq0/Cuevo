-- Destination-specific, opt-in synthetic analytics. Domain source/outbox authority is unchanged.
begin;
create table internal.posthog_school_activation(
 school_id uuid primary key references app.schools(id),enabled boolean not null,
 environment text not null check(environment in('QA','DEMO','STAGING')),
 key_version integer not null check(key_version>0),activated_at timestamptz not null,
 configured_at timestamptz not null default clock_timestamp()
);
create table internal.posthog_delivery(
 event_id uuid primary key references internal.outbox_events(id),destination text not null default 'POSTHOG_393668' check(destination='POSTHOG_393668'),
 state text not null default 'PROCESSING' check(state in('PROCESSING','RETRY','ACCEPTED','FAILED')),
 environment text not null check(environment in('QA','DEMO','STAGING')),key_version integer not null check(key_version>0),
 attempts integer not null default 1 check(attempts between 1 and 5),lease_token uuid,lease_until timestamptz,
 available_at timestamptz not null default clock_timestamp(),insert_id text check(insert_id is null or insert_id~'^[a-f0-9]{64}$'),
 accepted_at timestamptz,last_error_code text check(last_error_code is null or last_error_code in('CAPTURE_OUTCOME_UNKNOWN','CAPTURE_RETRY_REQUIRED','CAPTURE_POLICY_UNAVAILABLE','CAPTURE_SCHEMA_REQUIRES_REVIEW','CAPTURE_LEASE_EXHAUSTED')),
 check((state='PROCESSING' and lease_token is not null and lease_until is not null)or(state<>'PROCESSING'and lease_token is null and lease_until is null)),
 check((state='ACCEPTED')=(accepted_at is not null and insert_id is not null))
);
alter table internal.posthog_school_activation enable row level security;
alter table internal.posthog_school_activation force row level security;
alter table internal.posthog_delivery enable row level security;
alter table internal.posthog_delivery force row level security;
revoke all on internal.posthog_school_activation,internal.posthog_delivery from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create index posthog_delivery_retry_idx on internal.posthog_delivery(available_at,event_id)where state='RETRY';
create index posthog_delivery_lease_idx on internal.posthog_delivery(lease_until,event_id)where state='PROCESSING';
create index posthog_completed_source_idx on internal.outbox_events(occurred_at,id)where state='COMPLETED'and type in('activity.complete','submission.create','submission.resubmitted','quiz.submitted','result.released','rubric.result.released','recommendation.approved','recommendation.rejected','intervention.created','intervention.completed','reassessment.linked','outcome.measured','community.post_created','diagnostic.browser');

create function internal.posthog_school_allowed(target_school uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(exists(select 1 from app.schools school join internal.posthog_school_activation activation on activation.school_id=school.id
  where school.id=target_school and school.status='active'and activation.enabled
  and exists(select 1 from app.people person where person.school_id=school.id)
  and exists(select 1 from app.memberships member where member.school_id=school.id and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp()))
  and not exists(select 1 from app.memberships member left join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id where member.school_id=school.id and person.synthetic is distinct from true)
  and not exists(select 1 from app.people person where person.school_id=school.id and person.synthetic is distinct from true)
  and(select policy.analytics_enabled from app.school_policy_versions policy where policy.school_id=school.id order by policy.version desc limit 1)is true),false)
$$;
create function internal.posthog_activation_context(target_school uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('environment',activation.environment,'keyVersion',activation.key_version,'activatedAt',activation.activated_at)
 from internal.posthog_school_activation activation where activation.school_id=target_school and internal.posthog_school_allowed(target_school)
$$;
create function internal.configure_posthog_school(target_school uuid,target_enabled boolean,target_environment text,target_key_version integer)returns boolean
language plpgsql security definer set search_path=''as $$begin
 if current_setting('app.runtime_env',true)is distinct from'local'or target_enabled is null or target_environment is null or target_environment not in('QA','DEMO','STAGING')or target_key_version is null or target_key_version<1 then raise exception 'Explicit local synthetic activation required'using errcode='22023';end if;
 if not exists(select 1 from app.schools school where school.id=target_school and school.status='active')or not exists(select 1 from app.people person where person.school_id=target_school)
 or not exists(select 1 from app.memberships member where member.school_id=target_school and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp()))
 or exists(select 1 from app.memberships member left join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id where member.school_id=target_school and person.synthetic is distinct from true)
 or exists(select 1 from app.people person where person.school_id=target_school and person.synthetic is distinct from true)
 or(target_enabled and(select policy.analytics_enabled from app.school_policy_versions policy where policy.school_id=target_school order by policy.version desc limit 1)is distinct from true)
 then raise exception 'Current approved entirely synthetic school required'using errcode='42501';end if;
 insert into internal.posthog_school_activation(school_id,enabled,environment,key_version,activated_at)
 values(target_school,target_enabled,target_environment,target_key_version,clock_timestamp())
 on conflict(school_id)do update set enabled=excluded.enabled,environment=excluded.environment,key_version=excluded.key_version,activated_at=excluded.activated_at,configured_at=clock_timestamp();
 return true;
end$$;

-- The diagnostics owner replaces only this getter with a strict source projection.
create function internal.posthog_event_diagnostics(target_event uuid)returns jsonb language sql stable security definer set search_path=''as $$select null::jsonb$$;
create function internal.posthog_source_event_allowed(target_event uuid)returns boolean language plpgsql stable security definer set search_path=''as $$
declare event internal.outbox_events;begin
 select source.*into event from internal.outbox_events source where source.id=target_event;
 if not found or event.state<>'COMPLETED'or event.version<1 or not exists(select 1 from app.people person where person.school_id=event.school_id and person.actor_id=event.actor_id and person.synthetic)then return false;end if;
 if event.type='diagnostic.browser'then return event.version=1 and internal.posthog_event_diagnostics(event.id)is not null;
 elsif event.type='activity.complete'then return event.entity_type='activity'and exists(select 1 from app.activity_completions source where source.school_id=event.school_id and source.id=event.entity_id and source.learner_id=event.actor_id);
 elsif event.type in('submission.create','submission.resubmitted')then return event.entity_type='submission'and exists(select 1 from app.submissions source where source.school_id=event.school_id and source.id=event.entity_id and source.learner_id=event.actor_id and source.revision=event.version);
 elsif event.type='quiz.submitted'then return event.entity_type='quiz_attempt'and event.version=1 and exists(select 1 from app.quiz_attempts source where source.school_id=event.school_id and source.id=event.entity_id and source.learner_id=event.actor_id);
 elsif event.type='result.released'then return event.entity_type='result'and exists(select 1 from app.result_revisions source where source.school_id=event.school_id and source.id=event.entity_id and source.created_by=event.actor_id and source.revision=event.version);
 elsif event.type='rubric.result.released'then return event.entity_type='result'and exists(select 1 from app.rubric_result_revisions source where source.school_id=event.school_id and source.id=event.entity_id and source.created_by=event.actor_id and source.revision=event.version);
 elsif event.type in('recommendation.approved','recommendation.rejected')then return exists(select 1 from app.human_decisions source where source.school_id=event.school_id and source.recommendation_id=event.entity_id and source.actor_id=event.actor_id and source.decision=case event.type when'recommendation.approved'then'APPROVE'else'REJECT'end);
 elsif event.type='intervention.created'then return event.entity_type='intervention'and exists(select 1 from app.interventions source join app.human_decisions decision on decision.school_id=source.school_id and decision.recommendation_id=source.recommendation_id where source.school_id=event.school_id and source.id=event.entity_id and decision.actor_id=event.actor_id and decision.decision='APPROVE');
 elsif event.type='intervention.completed'then return event.entity_type='intervention'and exists(select 1 from app.intervention_completions source where source.school_id=event.school_id and source.intervention_id=event.entity_id and source.learner_id=event.actor_id);
 elsif event.type='reassessment.linked'then return event.entity_type='intervention'and exists(select 1 from app.interventions source join internal.audit_events audit on audit.school_id=source.school_id and audit.entity_id=source.id and audit.actor_id=event.actor_id and audit.action=event.type and audit.outcome='succeeded'where source.school_id=event.school_id and source.id=event.entity_id and source.completed_at is not null and source.follow_up_assessment_id is not null);
 elsif event.type='outcome.measured'then return event.entity_type='outcome'and exists(select 1 from app.outcome_measurements source join internal.audit_events audit on audit.school_id=source.school_id and audit.entity_id=source.id and audit.actor_id=event.actor_id and audit.action=event.type and audit.outcome='succeeded'where source.school_id=event.school_id and source.id=event.entity_id);
 elsif event.type='community.post_created'then return exists(select 1 from app.community_posts source where source.school_id=event.school_id and source.id=event.entity_id and source.actor_id=event.actor_id);
 end if;return false;
end$$;

create function internal.claim_posthog_delivery(batch_size integer,lease_seconds integer,target_key_version integer)
returns table(id uuid,school_id uuid,actor_id uuid,type text,occurred_at timestamptz,lease_token uuid,environment text,key_version integer,actor_role text,diagnostics jsonb)
language plpgsql security definer set search_path=''as $$begin
 if batch_size is distinct from 1 or lease_seconds is distinct from 30 or target_key_version is null or target_key_version<1 then raise exception 'Single bounded analytics claim required'using errcode='22023';end if;
 update internal.posthog_delivery receipt set state='FAILED',lease_token=null,lease_until=null,last_error_code='CAPTURE_LEASE_EXHAUSTED'where receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp()and receipt.attempts>=5;
 return query with candidates as(
  select event.id,activation.environment,activation.key_version from internal.outbox_events event
  join internal.posthog_school_activation activation on activation.school_id=event.school_id
  join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id
  left join internal.posthog_delivery receipt on receipt.event_id=event.id
  where event.state='COMPLETED'and event.occurred_at>=activation.activated_at and activation.enabled and activation.key_version=target_key_version
  and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp())
  and internal.posthog_school_allowed(event.school_id)and internal.posthog_source_event_allowed(event.id)
  and(receipt.event_id is null or(receipt.environment=activation.environment and receipt.key_version=activation.key_version and receipt.attempts<5 and((receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp())or(receipt.state='RETRY'and receipt.available_at<=clock_timestamp()))))
  order by event.occurred_at,event.id for update of event skip locked limit 1
 ),claimed as(
  insert into internal.posthog_delivery as receipt(event_id,environment,key_version,lease_token,lease_until)
  select candidate.id,candidate.environment,candidate.key_version,gen_random_uuid(),clock_timestamp()+interval'30 seconds'from candidates candidate
  on conflict(event_id)do update set state='PROCESSING',attempts=receipt.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until,last_error_code=null
  where receipt.attempts<5 and receipt.environment=excluded.environment and receipt.key_version=excluded.key_version and((receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp())or(receipt.state='RETRY'and receipt.available_at<=clock_timestamp()))
  returning receipt.event_id,receipt.lease_token,receipt.environment,receipt.key_version
 )select event.id,event.school_id,event.actor_id,event.type,event.occurred_at,claimed.lease_token,claimed.environment,claimed.key_version,member.role,internal.posthog_event_diagnostics(event.id)
 from claimed join internal.outbox_events event on event.id=claimed.event_id join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id;
end$$;
create function internal.posthog_delivery_allowed(target_event uuid,current_lease uuid,target_key_version integer)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(exists(select 1 from internal.posthog_delivery receipt join internal.outbox_events event on event.id=receipt.event_id
 join internal.posthog_school_activation activation on activation.school_id=event.school_id join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id
 where receipt.event_id=target_event and receipt.state='PROCESSING'and receipt.lease_token=current_lease and receipt.lease_until>clock_timestamp()and receipt.key_version=target_key_version
 and activation.key_version=receipt.key_version and activation.environment=receipt.environment and event.occurred_at>=activation.activated_at
 and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp())
 and internal.posthog_school_allowed(event.school_id)and internal.posthog_source_event_allowed(event.id)),false)
$$;
create function internal.accept_posthog_delivery(target_event uuid,current_lease uuid,target_insert_id text)returns boolean language plpgsql security definer set search_path=''as $$declare affected integer;begin
 if target_insert_id is null or target_insert_id!~'^[a-f0-9]{64}$'then raise exception 'Minimized destination identity required'using errcode='22023';end if;
 -- Confirmed bytes cannot be recalled. Policy revocation blocks new sends, not this truthful receipt.
 update internal.posthog_delivery receipt set state='ACCEPTED',insert_id=target_insert_id,accepted_at=clock_timestamp(),lease_token=null,lease_until=null,last_error_code=null
 where receipt.event_id=target_event and receipt.state='PROCESSING'and receipt.lease_token=current_lease and receipt.lease_until>clock_timestamp();
 get diagnostics affected=row_count;return affected=1;
end$$;
create function internal.fail_posthog_delivery(target_event uuid,current_lease uuid,error_code text)returns boolean language plpgsql security definer set search_path=''as $$declare affected integer;begin
 if error_code is null or error_code not in('CAPTURE_OUTCOME_UNKNOWN','CAPTURE_RETRY_REQUIRED','CAPTURE_POLICY_UNAVAILABLE','CAPTURE_SCHEMA_REQUIRES_REVIEW')then raise exception 'Fixed analytics failure code required'using errcode='22023';end if;
 update internal.posthog_delivery receipt set state=case when receipt.attempts>=5 then'FAILED'else'RETRY'end,available_at=clock_timestamp()+make_interval(secs=>least(300,30*(2^(receipt.attempts-1))::integer)),last_error_code=error_code,lease_token=null,lease_until=null
 where receipt.event_id=target_event and receipt.state='PROCESSING'and receipt.lease_token=current_lease and receipt.lease_until>clock_timestamp();
 get diagnostics affected=row_count;return affected=1;
end$$;
create function internal.posthog_delivery_due()returns boolean language sql volatile security definer set search_path=''as $$
 select exists(select 1 from internal.outbox_events event join internal.posthog_school_activation activation on activation.school_id=event.school_id
 join app.memberships member on member.school_id=event.school_id and member.actor_id=event.actor_id left join internal.posthog_delivery receipt on receipt.event_id=event.id
 where event.state='COMPLETED'and activation.enabled and event.occurred_at>=activation.activated_at
 and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp())
 and internal.posthog_school_allowed(event.school_id)and internal.posthog_source_event_allowed(event.id)
 and(receipt.event_id is null or(receipt.environment=activation.environment and receipt.key_version=activation.key_version and receipt.attempts<5 and((receipt.state='PROCESSING'and receipt.lease_until<=clock_timestamp())or(receipt.state='RETRY'and receipt.available_at<=clock_timestamp())))))
$$;
-- Preserve the existing wake/processor/recovery ownership, now including confirmed-source delivery.
create or replace function internal.worker_dispatch_due()returns boolean language sql volatile security definer set search_path=''as $$
 select exists(select 1 from internal.outbox_events event where event.state='PENDING'and event.attempt_count<event.max_attempts and event.available_at<=clock_timestamp()or event.state='PROCESSING'and event.lease_until<=clock_timestamp())or internal.posthog_delivery_due()
$$;
create function internal.posthog_completed_wake()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.state='COMPLETED'and old.state is distinct from new.state then perform internal.request_worker_wake();end if;return new;
exception when others then return new;
end$$;
create trigger posthog_delivery_completed_wake after update of state on internal.outbox_events for each row execute function internal.posthog_completed_wake();
revoke execute on function internal.posthog_school_allowed(uuid),internal.posthog_activation_context(uuid),internal.configure_posthog_school(uuid,boolean,text,integer),internal.posthog_event_diagnostics(uuid),internal.posthog_source_event_allowed(uuid),internal.claim_posthog_delivery(integer,integer,integer),internal.posthog_delivery_allowed(uuid,uuid,integer),internal.accept_posthog_delivery(uuid,uuid,text),internal.fail_posthog_delivery(uuid,uuid,text),internal.posthog_delivery_due(),internal.posthog_completed_wake()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.claim_posthog_delivery(integer,integer,integer),internal.posthog_delivery_allowed(uuid,uuid,integer),internal.accept_posthog_delivery(uuid,uuid,text),internal.fail_posthog_delivery(uuid,uuid,text)to cuevo_worker;
commit;
