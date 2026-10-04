-- Explicit observation window approval and bounded recovery on the existing outbox.
begin;
create table internal.learner_observation_policy_revisions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references app.schools(id),version integer not null check(version>0),development_window_days integer not null check(development_window_days between 1 and 365),approved_by uuid not null,approved_at timestamptz,reason text,provenance text not null check(provenance in('HISTORICAL','ADMIN_APPROVED')),command_key text,fingerprint text,receipt jsonb,
 unique(school_id,version),unique(school_id,id),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id),check((provenance='HISTORICAL'and approved_at is null and reason is null and command_key is null and fingerprint is null and receipt is null)or(provenance='ADMIN_APPROVED'and approved_at is not null and length(btrim(reason))between 1 and 1000 and command_key is not null and fingerprint~'^[a-f0-9]{64}$'and receipt is not null))
);
insert into internal.learner_observation_policy_revisions(school_id,version,development_window_days,approved_by,provenance)select school_id,version,development_window_days,approved_by,'HISTORICAL'from app.learner_state_policies;
alter table app.learner_state_policies add column approval_id uuid;
update app.learner_state_policies current_policy set approval_id=history.id from internal.learner_observation_policy_revisions history where history.school_id=current_policy.school_id and history.version=current_policy.version;
alter table app.learner_state_policies add foreign key(school_id,approval_id)references internal.learner_observation_policy_revisions(school_id,id);
alter table app.learner_state_snapshots add column observation_policy_version integer;

create table internal.learner_observation_refresh_sources(
 event_id uuid primary key references internal.outbox_events(id),school_id uuid not null references app.schools(id),policy_id uuid not null references internal.learner_observation_policy_revisions(id),kind text not null check(kind in('PAGE','LEARNER')),learner_id uuid,cursor_id uuid,created_at timestamptz not null default clock_timestamp(),check((kind='PAGE'and learner_id is null)or(kind='LEARNER'and learner_id is not null and cursor_id is null))
);
create table internal.learner_observation_recovery_sources(
 event_id uuid primary key references internal.outbox_events(id),original_event_id uuid not null references internal.outbox_events(id),school_id uuid not null references app.schools(id),policy_id uuid not null references internal.learner_observation_policy_revisions(id),learner_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(original_event_id,policy_id)
);
alter table internal.outbox_events add constraint observation_outbox_school_id_unique unique(school_id,id);
alter table internal.learner_observation_refresh_sources add foreign key(school_id,event_id)references internal.outbox_events(school_id,id);
alter table internal.learner_observation_refresh_sources add foreign key(school_id,policy_id)references internal.learner_observation_policy_revisions(school_id,id);
alter table internal.learner_observation_recovery_sources add foreign key(school_id,event_id)references internal.outbox_events(school_id,id);
alter table internal.learner_observation_recovery_sources add foreign key(school_id,original_event_id)references internal.outbox_events(school_id,id);
alter table internal.learner_observation_recovery_sources add foreign key(school_id,policy_id)references internal.learner_observation_policy_revisions(school_id,id);
do $$declare tab text;begin foreach tab in array array['learner_observation_policy_revisions','learner_observation_refresh_sources','learner_observation_recovery_sources']loop
 execute format('alter table internal.%I enable row level security',tab);execute format('alter table internal.%I force row level security',tab);execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);
 execute format('create trigger immutable_record before update or delete on internal.%I for each row execute function internal.academic_history_immutable()',tab);execute format('create trigger immutable_truncate before truncate on internal.%I for each statement execute function internal.academic_history_immutable()',tab);
end loop;end$$;

create function internal.current_learner_observation_policy(target_school uuid)returns internal.learner_observation_policy_revisions language plpgsql stable security definer set search_path=''as $$
declare current_policy app.learner_state_policies;history internal.learner_observation_policy_revisions;begin
 select*into current_policy from app.learner_state_policies where school_id=target_school;
 if current_policy.school_id is null then return null;end if;
 select*into history from internal.learner_observation_policy_revisions where id=current_policy.approval_id and school_id=target_school and version=current_policy.version and development_window_days=current_policy.development_window_days and approved_by=current_policy.approved_by;
 return history;
end$$;
create function internal.read_learner_observation_policy()returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();history internal.learner_observation_policy_revisions;has_policy boolean;begin
 if not"authorization".has_entitlement(school,'school.context')or not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)not in('admin','coordinator','teacher')then raise exception 'Current observation policy read scope required'using errcode='42501';end if;
 history:=internal.current_learner_observation_policy(school);select exists(select 1 from app.learner_state_policies where school_id=school)into has_policy;
 return jsonb_build_object('schoolId',school,'status',case when not has_policy then'UNCONFIGURED'when history.id is null then'REQUIRES_REVIEW'else'CONFIGURED'end,'policy',case when history.id is null then null else jsonb_build_object('version',history.version,'developmentWindowDays',history.development_window_days,'approvedByName',(select nullif(btrim(display_name),'')from app.people where school_id=school and actor_id=history.approved_by),'approvedAt',history.approved_at)end);
end$$;
create function internal.approve_learner_observation_policy(input jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare v_input jsonb:=$1;v_key text:=$2;v_fingerprint text:=$3;v_request text:=$4;school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();current_policy app.learner_state_policies;history internal.learner_observation_policy_revisions;prior internal.idempotency_keys;reservation jsonb;version_value integer;revision_id uuid:=gen_random_uuid();event_id uuid;response jsonb;begin
 if not"authorization".has_entitlement(school,'school.context')or not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)<>'admin'then raise exception 'Current administrator observation approval required'using errcode='42501';end if;
 if v_input is null or jsonb_typeof(v_input)<>'object'or not(v_input?&array['developmentWindowDays','expectedVersion','reason','confirmApproval'])or v_input-'developmentWindowDays'-'expectedVersion'-'reason'-'confirmApproval'<>'{}'::jsonb or v_input->'confirmApproval'is distinct from'true'::jsonb or jsonb_typeof(v_input->'developmentWindowDays')is distinct from'number'or coalesce(v_input->>'developmentWindowDays','')!~'^[1-9][0-9]{0,2}$'or(v_input->>'developmentWindowDays')::integer not between 1 and 365 or jsonb_typeof(v_input->'expectedVersion')is distinct from'number'or coalesce(v_input->>'expectedVersion','')!~'^[0-9]{1,9}$'or jsonb_typeof(v_input->'reason')is distinct from'string'or length(btrim(v_input->>'reason'))not between 1 and 1000 then raise exception 'Explicit bounded observation window required'using errcode='22023';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(school::text||':school-access-mutations',0));
 perform pg_advisory_xact_lock(hashtextextended(school::text||':learner-observation-policy',0));
 if not"authorization".has_entitlement(school,'school.context')or not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)<>'admin'then raise exception 'Current administrator observation approval required'using errcode='42501';end if;
 select*into current_policy from app.learner_state_policies where school_id=school for update;version_value:=coalesce(current_policy.version,0);
 select*into prior from internal.idempotency_keys where school_id=school and actor_id=actor and key=v_key and command='learner.observation_policy.approve'for update;
 if prior.key is not null then
  history:=internal.current_learner_observation_policy(school);
  if prior.fingerprint is distinct from v_fingerprint or prior.state<>'COMPLETED'or history.id is null or history.command_key is distinct from v_key or history.fingerprint is distinct from v_fingerprint or history.version<>(v_input->>'expectedVersion')::integer+1 or history.development_window_days<>(v_input->>'developmentWindowDays')::integer or history.approved_by<>actor or history.receipt is distinct from prior.response then raise exception 'Current original observation approval changed'using errcode='22023';end if;
  reservation:=internal.begin_command(v_key,'learner.observation_policy.approve',v_fingerprint);return prior.response;
 end if;
 if version_value<>(v_input->>'expectedVersion')::integer then raise exception 'Observation policy version changed'using errcode='22023';end if;
 history:=internal.current_learner_observation_policy(school);if version_value>0 and history.id is null then raise exception 'Existing observation policy requires review'using errcode='22023';end if;
 reservation:=internal.begin_command(v_key,'learner.observation_policy.approve',v_fingerprint);if reservation->>'state'<>'NEW'then raise exception 'Observation approval in progress'using errcode='22023';end if;
 response:=jsonb_build_object('id',revision_id,'schoolId',school,'version',version_value+1,'developmentWindowDays',(v_input->>'developmentWindowDays')::integer,'status','APPROVED','refreshStatus','PENDING');
 insert into internal.learner_observation_policy_revisions(id,school_id,version,development_window_days,approved_by,approved_at,reason,provenance,command_key,fingerprint,receipt)values(revision_id,school,version_value+1,(v_input->>'developmentWindowDays')::integer,actor,clock_timestamp(),btrim(v_input->>'reason'),'ADMIN_APPROVED',v_key,v_fingerprint,response);
 insert into app.learner_state_policies(school_id,version,development_window_days,approved_by,approval_id)values(school,version_value+1,(v_input->>'developmentWindowDays')::integer,actor,revision_id)on conflict(school_id)do update set version=excluded.version,development_window_days=excluded.development_window_days,approved_by=excluded.approved_by,approval_id=excluded.approval_id;
 perform internal.append_audit('learner.observation_policy.approved','learner_observation_policy',revision_id,v_request,'succeeded',jsonb_build_object('policyVersion',version_value+1));
 event_id:=internal.enqueue_event('learner.observation_policy.approved','learner_observation_policy',revision_id,1,jsonb_build_object('policyVersion',version_value+1),'observation-policy:'||revision_id::text);
 insert into internal.learner_observation_refresh_sources(event_id,school_id,policy_id,kind)values(event_id,school,revision_id,'PAGE');
 perform internal.finish_command(v_key,'learner.observation_policy.approve',v_fingerprint,response);return response;
end$$;

create function internal.learner_observation_event_source(original internal.outbox_events)returns uuid language plpgsql stable security definer set search_path=''as $$
declare learner uuid;course uuid;begin
 if original.type='activity.complete'then
  select completion.learner_id,unit.course_id into learner,course from app.activity_completions completion join app.activities activity on activity.school_id=completion.school_id and activity.id=completion.activity_id join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where completion.school_id=original.school_id and completion.id=original.entity_id and original.actor_id=completion.learner_id and original.entity_type='activity';
 elsif original.type='result.released'then
  select result.learner_id,assessment.course_id into learner,course from app.result_revisions result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id join app.academic_evidence evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id where result.school_id=original.school_id and result.id=original.entity_id and result.created_by=original.actor_id and original.entity_type='result'and exists(select 1 from app.current_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id);
 elsif original.type='rubric.result.released'then
  select result.learner_id,assessment.course_id into learner,course from app.rubric_result_revisions result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id join app.rubric_evidence evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id where result.school_id=original.school_id and result.id=original.entity_id and result.created_by=original.actor_id and original.entity_type='result'and exists(select 1 from app.current_rubric_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id);
 elsif original.type='submission.resubmitted'then
  select submission.learner_id,assessment.course_id into learner,course from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id join app.submission_returns returned on returned.school_id=submission.school_id and returned.id=submission.return_id and returned.submission_id=submission.previous_submission_id and returned.learner_id=submission.learner_id and returned.assessment_id=submission.assessment_id where submission.school_id=original.school_id and submission.id=original.entity_id and original.actor_id=submission.learner_id and original.entity_type='submission'and submission.revision>1 and submission.submitted_at>=returned.created_at;
 end if;
 if learner is null or course is null or not exists(select 1 from app.memberships member where member.school_id=original.school_id and member.actor_id=learner and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))or not"authorization".current_learner_course(original.school_id,course,learner)then return null;end if;
 return learner;
end$$;

create function internal.process_learner_observation_policy_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;source internal.learner_observation_refresh_sources;policy internal.learner_observation_policy_revisions;current_policy internal.learner_observation_policy_revisions;original internal.outbox_events;candidate record;next_cursor uuid;found_count integer:=0;created_id uuid;recovery_id uuid;ready boolean;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if event.id is null or event.state<>'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Current observation processing lease required'using errcode='22023';end if;
 select*into source from internal.learner_observation_refresh_sources where event_id=event.id;select*into policy from internal.learner_observation_policy_revisions where id=source.policy_id and school_id=source.school_id;
 if source.event_id is null or policy.id is null or policy.provenance<>'ADMIN_APPROVED'or event.school_id<>source.school_id or event.actor_id<>policy.approved_by or event.version<>1 or event.metadata<>jsonb_build_object('policyVersion',policy.version)or(source.kind='PAGE'and(event.type not in('learner.observation_policy.approved','learner.observation_policy.refresh_page')or event.entity_id<>policy.id or event.entity_type<>'learner_observation_policy'))or(source.kind='LEARNER'and(event.type<>'learner.observation_policy.refresh'or event.entity_id<>source.learner_id or event.entity_type<>'learner'))then raise exception 'Exact observation policy source required'using errcode='42501';end if;
 if event.deduplication_key is distinct from(case when source.kind='LEARNER'then'observation-refresh:'||policy.id::text||':'||source.learner_id::text when source.cursor_id is null then'observation-policy:'||policy.id::text else'observation-page:'||policy.id::text||':'||source.cursor_id::text end)then raise exception 'Exact observation delivery key required'using errcode='42501';end if;
 if not exists(select 1 from internal.audit_events audit where audit.school_id=policy.school_id and audit.actor_id=policy.approved_by and audit.action='learner.observation_policy.approved'and audit.entity_type='learner_observation_policy'and audit.entity_id=policy.id and audit.outcome='succeeded'and audit.metadata=jsonb_build_object('policyVersion',policy.version))
 or not exists(select 1 from internal.idempotency_keys command where command.school_id=policy.school_id and command.actor_id=policy.approved_by and command.key=policy.command_key and command.command='learner.observation_policy.approve'and command.state='COMPLETED'and command.fingerprint=policy.fingerprint and command.response=policy.receipt)then raise exception 'Canonical observation approval evidence required'using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(source.school_id::text||':learner-observation-policy',0));current_policy:=internal.current_learner_observation_policy(source.school_id);
 if current_policy.id is distinct from policy.id then
  insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Superseded observation lease changed'using errcode='22023';end if;return jsonb_build_object('status','SUPERSEDED');
 end if;
 if not exists(select 1 from app.schools where id=source.school_id and status='active')or not exists(select 1 from app.entitlements where school_id=source.school_id and code='learner.state'and enabled and effective_from<=now()and(effective_to is null or effective_to>now()))then raise exception 'Current observation school required'using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(source.school_id::text||':learner-observation-policy',0));
 if source.kind='PAGE'then
  for candidate in select member.actor_id from app.memberships member where member.school_id=source.school_id and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and(source.cursor_id is null or member.actor_id>source.cursor_id)and exists(select 1 from internal.outbox_events fact where fact.school_id=member.school_id and fact.type in('activity.complete','result.released','rubric.result.released','submission.resubmitted')and internal.learner_observation_event_source(fact)=member.actor_id)order by member.actor_id limit 11 loop
   found_count:=found_count+1;if found_count>10 then exit;end if;next_cursor:=candidate.actor_id;
   created_id:=gen_random_uuid();insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,max_attempts)values(created_id,source.school_id,policy.approved_by,'learner.observation_policy.refresh','learner',candidate.actor_id,1,jsonb_build_object('policyVersion',policy.version),'observation-refresh:'||policy.id::text||':'||candidate.actor_id::text,10)on conflict(school_id,deduplication_key)do nothing;
   select id into created_id from internal.outbox_events where school_id=source.school_id and deduplication_key='observation-refresh:'||policy.id::text||':'||candidate.actor_id::text;
   insert into internal.learner_observation_refresh_sources(event_id,school_id,policy_id,kind,learner_id)values(created_id,source.school_id,policy.id,'LEARNER',candidate.actor_id)on conflict(event_id)do nothing;
  end loop;
  if found_count>10 then
   created_id:=gen_random_uuid();insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)values(created_id,source.school_id,policy.approved_by,'learner.observation_policy.refresh_page','learner_observation_policy',policy.id,1,jsonb_build_object('policyVersion',policy.version),'observation-page:'||policy.id::text||':'||next_cursor::text)on conflict(school_id,deduplication_key)do nothing;
   select id into created_id from internal.outbox_events where school_id=source.school_id and deduplication_key='observation-page:'||policy.id::text||':'||next_cursor::text;insert into internal.learner_observation_refresh_sources(event_id,school_id,policy_id,kind,cursor_id)values(created_id,source.school_id,policy.id,'PAGE',next_cursor)on conflict(event_id)do nothing;
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended(source.school_id::text||':learner:'||source.learner_id::text,0));ready:=true;
  -- Recovery of at most10 original failed source events per delivery. Original failure bytes stay intact.
  for original in select original_event.*from internal.outbox_events original_event where original_event.school_id=source.school_id and original_event.state='FAILED'and original_event.type in('activity.complete','result.released','rubric.result.released','submission.resubmitted')and internal.learner_observation_event_source(original_event)=source.learner_id and not exists(select 1 from internal.processed_events processed where processed.school_id=original_event.school_id and processed.source_id=original_event.entity_id and processed.source_type in('COMPLETION','RESULT','RUBRIC_RESULT','SUBMISSION_REVISION'))and not exists(select 1 from internal.learner_observation_recovery_sources recovery where recovery.original_event_id=original_event.id and recovery.policy_id=policy.id)order by original_event.id limit 10 loop
   if internal.learner_observation_event_source(original)is distinct from source.learner_id then continue;end if;
   recovery_id:=gen_random_uuid();insert into internal.outbox_events(id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,occurred_at)values(recovery_id,original.school_id,original.actor_id,original.type,original.entity_type,original.entity_id,original.version,original.metadata,'observation-recovery:'||policy.id::text||':'||original.id::text,original.occurred_at);
   insert into internal.learner_observation_recovery_sources(event_id,original_event_id,school_id,policy_id,learner_id)values(recovery_id,original.id,source.school_id,policy.id,source.learner_id);ready:=false;
  end loop;
  if exists(select 1 from internal.learner_observation_recovery_sources recovery join internal.outbox_events delivery on delivery.id=recovery.event_id where recovery.school_id=source.school_id and recovery.policy_id=policy.id and recovery.learner_id=source.learner_id and delivery.state='FAILED')then
   update internal.outbox_events set state='FAILED',lease_token=null,lease_until=null,last_error_code='OBSERVATION_SOURCE_REQUIRES_REVIEW'where id=event.id and state='PROCESSING'and lease_token=current_lease and lease_until>clock_timestamp();if not found then raise exception 'Observation review lease changed'using errcode='22023';end if;return jsonb_build_object('status','REQUIRES_REVIEW');
  end if;
  if exists(select 1 from internal.learner_observation_recovery_sources recovery join internal.outbox_events delivery on delivery.id=recovery.event_id where recovery.school_id=source.school_id and recovery.policy_id=policy.id and recovery.learner_id=source.learner_id and delivery.state<>'COMPLETED')then ready:=false;end if;
  if exists(select 1 from internal.outbox_events pending where pending.school_id=source.school_id and pending.state in('PENDING','PROCESSING')and pending.type in('activity.complete','result.released','rubric.result.released','submission.resubmitted')and internal.learner_observation_event_source(pending)=source.learner_id and not exists(select 1 from internal.processed_events processed where processed.school_id=pending.school_id and processed.source_id=pending.entity_id and processed.source_type in('COMPLETION','RESULT','RUBRIC_RESULT','SUBMISSION_REVISION')))then ready:=false;end if;
  if not ready then update internal.outbox_events set state=case when attempt_count>=10 then'FAILED'else'PENDING'end,lease_token=null,lease_until=null,available_at=clock_timestamp()+interval'5 seconds',max_attempts=10,last_error_code='OBSERVATION_RECOVERY_PENDING'where id=event.id and state='PROCESSING'and lease_token=current_lease and lease_until>clock_timestamp();if not found then raise exception 'Observation wait lease changed'using errcode='22023';end if;return jsonb_build_object('status','WAITING');end if;
  if not exists(select 1 from app.memberships member where member.school_id=source.school_id and member.actor_id=source.learner_id and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))then raise exception 'Current refresh learner required'using errcode='42501';end if;
  if not exists(select 1 from app.learner_state_snapshots where school_id=source.school_id and learner_id=source.learner_id)then insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Unknown-source refresh lease changed'using errcode='22023';end if;return jsonb_build_object('status','NO_SOURCE');end if;
  perform internal.refresh_revision_habit(source.school_id,source.learner_id);perform internal.refresh_native_academic(source.school_id,source.learner_id);perform internal.refresh_support_impact(source.school_id,source.learner_id);
 end if;
 insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;
 if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Observation policy completion lease changed'using errcode='22023';end if;
 return jsonb_build_object('status',case when source.kind='PAGE'then'PLANNED'else'REFRESHED'end);
end$$;

alter function internal.process_learner_event(uuid,uuid)rename to process_before_learner_observation_policy;
create function internal.process_learner_event(target_event uuid,current_lease uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare event internal.outbox_events;recovery internal.learner_observation_recovery_sources;original internal.outbox_events;policy internal.learner_observation_policy_revisions;answer jsonb;begin
 select*into event from internal.outbox_events where id=target_event for update;
 if event.id is null or event.state<>'PROCESSING'or event.lease_token is distinct from current_lease or event.lease_until<=clock_timestamp()then raise exception 'Current learner event lease required'using errcode='22023';end if;
 if internal.outbox_event_owner(event.type)is distinct from'WORKER'then raise exception 'Event belongs to another executor'using errcode='42501';end if;
 if event.type in('learner.observation_policy.approved','learner.observation_policy.refresh_page','learner.observation_policy.refresh')then return internal.process_learner_observation_policy_event(target_event,current_lease);end if;
 select*into recovery from internal.learner_observation_recovery_sources where event_id=event.id;
 if recovery.event_id is not null then
  perform pg_advisory_xact_lock_shared(hashtextextended(recovery.school_id::text||':learner-observation-policy',0));
  select*into original from internal.outbox_events where id=recovery.original_event_id;
  if original.id is null or original.school_id<>recovery.school_id or event.school_id<>recovery.school_id or original.state<>'FAILED'or event.actor_id<>original.actor_id or event.type<>original.type or event.entity_type<>original.entity_type or event.entity_id<>original.entity_id or event.version<>original.version or event.metadata<>original.metadata or event.occurred_at<>original.occurred_at or event.deduplication_key<>'observation-recovery:'||recovery.policy_id::text||':'||original.id::text or not exists(select 1 from internal.learner_observation_policy_revisions revision where revision.id=recovery.policy_id and revision.school_id=recovery.school_id and revision.provenance='ADMIN_APPROVED')then raise exception 'Exact original observation recovery source required'using errcode='42501';end if;
  policy:=internal.current_learner_observation_policy(recovery.school_id);
  if policy.id is distinct from recovery.policy_id then insert into internal.processed_events(event_id,school_id)values(event.id,event.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(event.id,current_lease)is distinct from true then raise exception 'Superseded recovery lease changed'using errcode='22023';end if;return jsonb_build_object('status','SUPERSEDED');end if;
  if internal.learner_observation_event_source(original)is distinct from recovery.learner_id then raise exception 'Current original source scope required'using errcode='42501';end if;
 end if;
 if event.type in('activity.complete','result.released','rubric.result.released','submission.resubmitted')then
  perform pg_advisory_xact_lock_shared(hashtextextended(event.school_id::text||':learner-observation-policy',0));policy:=internal.current_learner_observation_policy(event.school_id);if policy.id is null then raise exception 'Current approved observation policy source required'using errcode='22023';end if;
 end if;
 answer:=internal.process_before_learner_observation_policy(target_event,current_lease);return answer;
end$$;

-- Future seed/import writes remain explicit historical records with unknown approval time.
create function internal.record_legacy_learner_observation_policy()returns trigger language plpgsql security definer set search_path=''as $$declare history_id uuid;begin
 if new.approval_id is null then
  insert into internal.learner_observation_policy_revisions(school_id,version,development_window_days,approved_by,provenance)values(new.school_id,new.version,new.development_window_days,new.approved_by,'HISTORICAL')returning id into history_id;new.approval_id:=history_id;
 end if;return new;
end$$;
create trigger a_learner_observation_policy_history before insert on app.learner_state_policies for each row execute function internal.record_legacy_learner_observation_policy();
create function internal.guard_learner_observation_policy()returns trigger language plpgsql security definer set search_path=''as $$begin
 if not exists(select 1 from internal.learner_observation_policy_revisions revision where revision.id=new.approval_id and revision.school_id=new.school_id and revision.version=new.version and revision.development_window_days=new.development_window_days and revision.approved_by=new.approved_by)then raise exception 'Exact immutable observation approval required'using errcode='22023';end if;
 return new;
end$$;
create trigger learner_observation_policy_consistent before insert or update on app.learner_state_policies for each row execute function internal.guard_learner_observation_policy();

-- Policy stamps only follow a real source-backed snapshot refresh.
alter function internal.refresh_revision_habit(uuid,uuid)rename to refresh_revision_habit_before_observation_policy;
create function internal.refresh_revision_habit(target_school uuid,target_learner uuid)returns void language plpgsql security definer set search_path=''as $$declare policy_version integer;history internal.learner_observation_policy_revisions;begin
 perform pg_advisory_xact_lock_shared(hashtextextended(target_school::text||':learner-observation-policy',0));history:=internal.current_learner_observation_policy(target_school);if history.id is null then raise exception 'Current approved observation source required'using errcode='22023';end if;
 select version into policy_version from app.learner_state_policies where school_id=target_school for share;
 if policy_version is null then raise exception 'Approved observation window required'using errcode='22023';end if;
 perform internal.refresh_revision_habit_before_observation_policy(target_school,target_learner);
 update app.learner_state_snapshots set observation_policy_version=policy_version where school_id=target_school and learner_id=target_learner;
 -- Refresh current practice-signal version from retained observations, never award XP or invent a fact.
 update app.learner_signals signal set rule_version=policy_version,count=(select count(*)from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and observation.kind='practice'and observation.occurred_at>=clock_timestamp()-make_interval(days=>history.development_window_days)and observation.occurred_at<=clock_timestamp()),window_start=clock_timestamp()-make_interval(days=>history.development_window_days),window_end=clock_timestamp(),observation_ids=array(select observation.id from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and observation.kind='practice'and observation.occurred_at>=clock_timestamp()-make_interval(days=>history.development_window_days)and observation.occurred_at<=clock_timestamp()order by observation.occurred_at,observation.id limit 1000),expires_at=(select min(observation.occurred_at)+make_interval(days=>history.development_window_days)from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and observation.kind='practice'and observation.occurred_at>=clock_timestamp()-make_interval(days=>history.development_window_days)and observation.occurred_at<=clock_timestamp())
 where signal.school_id=target_school and signal.learner_id=target_learner and exists(select 1 from app.habit_observations observation where observation.school_id=target_school and observation.learner_id=target_learner and observation.kind='practice'and observation.occurred_at>=clock_timestamp()-make_interval(days=>history.development_window_days)and observation.occurred_at<=clock_timestamp());
end$$;
-- Replace only known private caller definitions so incremental sessions cannot retain the renamed helper OID.
do $$declare signature text;definition text;begin
 foreach signature in array array['internal.process_core_learning_event(uuid,uuid)','internal.process_all_domain_sources(uuid,uuid)','internal.process_native_learning_event(uuid,uuid)','internal.process_support_learning_event(uuid,uuid)','internal.process_learner_observation_policy_event(uuid,uuid)']loop
  if to_regprocedure(signature)is null then continue;end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  if position('internal.refresh_revision_habit('in definition)>0 then execute definition;end if;
 end loop;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);anchor:='is_stale:=end_at is null or end_at<clock_timestamp()-interval ''60 seconds'';';
 if position(anchor in definition)=0 then raise exception 'Current projection freshness source changed';end if;
 definition:=replace(definition,anchor,'is_stale:=end_at is null or end_at<clock_timestamp()-interval ''60 seconds''or snapshot.observation_policy_version is distinct from(select version from app.learner_state_policies where school_id=school);');execute definition;
end$$;

revoke execute on function internal.current_learner_observation_policy(uuid),internal.read_learner_observation_policy(),internal.approve_learner_observation_policy(jsonb,text,text,text),internal.record_legacy_learner_observation_policy(),internal.guard_learner_observation_policy(),internal.refresh_revision_habit_before_observation_policy(uuid,uuid),internal.refresh_revision_habit(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_learner_observation_policy(),internal.approve_learner_observation_policy(jsonb,text,text,text)to cuevo_api;
revoke execute on function internal.learner_observation_event_source(internal.outbox_events),internal.process_learner_observation_policy_event(uuid,uuid),internal.process_before_learner_observation_policy(uuid,uuid),internal.process_learner_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.process_learner_event(uuid,uuid)to cuevo_worker;
commit;
