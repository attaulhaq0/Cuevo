begin;
-- Source-locked synthetic QA observations. Raw exception, URL, DOM, text and identity fields are never admitted.
create function internal.valid_browser_diagnostic_observation(payload jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1024
  and payload ?& array['category','feature','status','timing','locale','viewport']
  and payload-array['category','feature','status','timing','locale','viewport']='{}'::jsonb
  and jsonb_typeof(payload->'category')='string' and payload->>'category' in ('api_request','api_error','response_invalid','runtime_error','unhandled_rejection','hydration_error')
  and jsonb_typeof(payload->'feature')='string' and payload->>'feature' in ('school','learning','academic','curriculum','progress','improvement','community','portfolio','development','files','session','other')
  and jsonb_typeof(payload->'status')='string' and payload->>'status' in ('success','unauthorized','denied','conflict','invalid','unavailable','unknown')
  and jsonb_typeof(payload->'timing')='string' and payload->>'timing' in ('under_250ms','250_to_999ms','1_to_4s','5_to_14s','15s_or_more','unknown')
  and jsonb_typeof(payload->'locale')='string' and payload->>'locale' in ('en','ar')
  and jsonb_typeof(payload->'viewport')='string' and payload->>'viewport' in ('mobile','tablet','desktop','unknown'),false)
$$;
create table internal.browser_diagnostics (
 id uuid primary key, school_id uuid not null references app.schools(id), actor_id uuid not null,
 payload jsonb not null check(internal.valid_browser_diagnostic_observation(payload)),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(school_id,actor_id) references app.memberships(school_id,actor_id),
 check(id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);
create index browser_diagnostics_school_time on internal.browser_diagnostics(school_id,created_at);
create index browser_diagnostics_actor_time on internal.browser_diagnostics(school_id,actor_id,created_at);
alter table internal.browser_diagnostics enable row level security;
alter table internal.browser_diagnostics force row level security;
revoke all on internal.browser_diagnostics from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger browser_diagnostics_immutable before update or delete on internal.browser_diagnostics for each row execute function internal.audit_immutable();
create trigger browser_diagnostics_no_truncate before truncate on internal.browser_diagnostics for each statement execute function internal.audit_immutable();

create function internal.browser_diagnostics_config() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform internal.require_context();
 return jsonb_build_object('enabled',internal.posthog_school_allowed("authorization".school_id()));
end $$;

create function internal.record_browser_diagnostic(input jsonb,source_request_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare school uuid:="authorization".school_id(); actor uuid:="authorization".actor_id(); diagnostic_id uuid; observation jsonb; existing internal.browser_diagnostics;
begin
 perform internal.require_context();
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'diagnosticId') is distinct from 'string'
  or input->>'diagnosticId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or not internal.valid_browser_diagnostic_observation(input-'diagnosticId')
  or source_request_id is null or length(source_request_id) not between 1 and 200 then
  raise exception 'Fixed browser diagnostic required' using errcode='22023';
 end if;
 diagnostic_id:=(input->>'diagnosticId')::uuid; observation:=input-'diagnosticId';
 -- Serialize this school's diagnostic rate budget, then check its current policy/population/activation.
 perform 1 from app.schools where id=school for update;
 perform internal.require_context();
 if not internal.posthog_school_allowed(school) then raise exception 'Current synthetic diagnostics approval required' using errcode='42501'; end if;
 select * into existing from internal.browser_diagnostics where id=diagnostic_id;
 if found then
  if existing.school_id<>school or existing.actor_id<>actor or existing.payload<>observation then raise exception 'Diagnostic identity mismatch' using errcode='22023'; end if;
  return jsonb_build_object('recorded',true,'duplicate',true);
 end if;
 if (select count(*) from internal.browser_diagnostics where school_id=school and actor_id=actor and created_at>clock_timestamp()-interval '1 minute')>=20
  or (select count(*) from internal.browser_diagnostics where school_id=school and created_at>clock_timestamp()-interval '1 minute')>=500 then
  raise exception 'Browser diagnostic budget reached' using errcode='P0003';
 end if;
 insert into internal.browser_diagnostics(id,school_id,actor_id,payload) values(diagnostic_id,school,actor,observation);
 perform internal.append_audit('diagnostic.browser.record','browser_diagnostic',diagnostic_id,source_request_id,'succeeded',jsonb_build_object('diagnosticSchemaVersion',1));
 perform internal.enqueue_event('diagnostic.browser','browser_diagnostic',diagnostic_id,1,jsonb_build_object('diagnosticSchemaVersion',1),'browser-diagnostic:'||actor::text||':'||diagnostic_id::text);
 return jsonb_build_object('recorded',true,'duplicate',false);
end $$;

-- The destination consumes a constructed source projection, never arbitrary outbox metadata.
create or replace function internal.posthog_event_diagnostics(target_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('category',diagnostic.payload->>'category','feature',diagnostic.payload->>'feature','status',diagnostic.payload->>'status',
  'timing',diagnostic.payload->>'timing','locale',diagnostic.payload->>'locale','viewport',diagnostic.payload->>'viewport')
 from internal.outbox_events event join internal.browser_diagnostics diagnostic on diagnostic.id=event.entity_id and diagnostic.school_id=event.school_id and diagnostic.actor_id=event.actor_id
 where event.id=target_event and event.type='diagnostic.browser' and event.entity_type='browser_diagnostic' and event.version=1
  and event.metadata='{"diagnosticSchemaVersion":1}'::jsonb and diagnostic.created_at<=event.occurred_at
  and internal.valid_browser_diagnostic_observation(diagnostic.payload)
  and exists(select 1 from internal.audit_events audit where audit.school_id=event.school_id and audit.actor_id=event.actor_id and audit.entity_id=diagnostic.id
   and audit.entity_type='browser_diagnostic' and audit.action='diagnostic.browser.record' and audit.outcome='succeeded' and audit.metadata='{"diagnosticSchemaVersion":1}'::jsonb)
$$;

alter function internal.process_learner_event(uuid,uuid) rename to process_before_browser_diagnostics;
revoke execute on function internal.process_before_browser_diagnostics(uuid,uuid) from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.process_learner_event(target_event uuid,current_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare event internal.outbox_events;
begin
 select * into event from internal.outbox_events where id=target_event for update;
 if not found or event.state<>'PROCESSING' or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp() then raise exception 'Invalid event lease' using errcode='22023'; end if;
 if event.type<>'diagnostic.browser' then return internal.process_before_browser_diagnostics(target_event,current_lease); end if;
 if internal.posthog_event_diagnostics(target_event) is null then raise exception 'Diagnostic source unavailable' using errcode='22023'; end if;
 insert into internal.processed_events(event_id,school_id) values(event.id,event.school_id) on conflict(event_id) do nothing;
 if internal.complete_outbox(event.id,current_lease) is distinct from true then raise exception 'Diagnostic lease expired before acknowledgment' using errcode='22023'; end if;
 return jsonb_build_object('status','ACKNOWLEDGED');
end $$;
revoke execute on function internal.valid_browser_diagnostic_observation(jsonb),internal.browser_diagnostics_config(),internal.record_browser_diagnostic(jsonb,text),internal.posthog_event_diagnostics(uuid),internal.process_learner_event(uuid,uuid) from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.browser_diagnostics_config(),internal.record_browser_diagnostic(jsonb,text) to cuevo_api;
grant execute on function internal.process_learner_event(uuid,uuid) to cuevo_worker;
commit;
