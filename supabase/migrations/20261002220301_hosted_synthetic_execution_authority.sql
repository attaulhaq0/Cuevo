-- Explicit hosted fixture provenance, populated synthetic school authority and staged capture.
-- Created with the Supabase migration CLI. No policy, school or destination is activated here.
begin;
create function internal.require_synthetic_intelligence_school(target_school uuid)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if target_school is null
 or not exists(select 1 from app.schools school where school.id=target_school and school.status='active')
 or not exists(select 1 from app.people person where person.school_id=target_school)
 or not exists(select 1 from app.memberships member where member.school_id=target_school and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp()))
 or exists(select 1 from app.memberships member left join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id where member.school_id=target_school and person.synthetic is distinct from true)
 or exists(select 1 from app.people person where person.school_id=target_school and person.synthetic is distinct from true)
 then raise exception 'Populated entirely synthetic intelligence school required'using errcode='42501';end if;
end$$;
revoke execute on function internal.require_synthetic_intelligence_school(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Preserve the exact source-controlled prompt/digest/limits validator while admitting a truthful fixture location.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.valid_intelligence_execution_manifest(jsonb)'::regprocedure);
 anchor:='not in(''LOCAL_SYNTHETIC_FIXTURE'',''SYNTHETIC_ONLY'',''APPROVED'')';
 if position(anchor in definition)=0 then raise exception 'Known manifest data policies changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'not in(''LOCAL_SYNTHETIC_FIXTURE'',''HOSTED_SYNTHETIC_FIXTURE'',''SYNTHETIC_ONLY'',''APPROVED'')');
 anchor:='manifest->>''providerDataPolicy''<>''LOCAL_SYNTHETIC_FIXTURE''';
 if position(anchor in definition)=0 then raise exception 'Known fixture manifest policy changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'manifest->>''providerDataPolicy''not in(''LOCAL_SYNTHETIC_FIXTURE'',''HOSTED_SYNTHETIC_FIXTURE'')');
 execute definition;
end$$;

-- Approval and every source-backed fixture execution recheck the entire school, not just the selected learner.
do $$declare signature text;definition text;anchor text;begin
 foreach signature in array array['internal.approve_intelligence_execution(jsonb,text)','internal.require_intelligence_execution(jsonb,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='perform pg_advisory_xact_lock_shared(hashtextextended(''school-intelligence-policy:''';
  if position(anchor in definition)=0 then raise exception 'Execution policy lock source changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,anchor,'if manifest->>''mode''=''FIXTURE''then perform internal.require_synthetic_intelligence_school(school);end if;'||anchor);
  if signature='internal.require_intelligence_execution(jsonb,uuid)'then
   anchor:='if binding.id is null and manifest->>''mode''=''FIXTURE''and policy.fixture_enabled';
   if position(anchor in definition)=0 then raise exception 'Local fixture source registration changed'using errcode='22023';end if;
   definition:=replace(definition,anchor,'if binding.id is null and manifest->>''mode''=''FIXTURE''and manifest->>''providerDataPolicy''=''LOCAL_SYNTHETIC_FIXTURE''and policy.fixture_enabled');
  end if;
  execute definition;
 end loop;
 definition:=pg_get_functiondef('internal.approve_school_intelligence_policy(jsonb,text,text,text)'::regprocedure);
 anchor:='perform pg_advisory_xact_lock(hashtextextended(''school-intelligence-policy:''';
 if position(anchor in definition)=0 then raise exception 'School fixture approval lock changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if(input->>''fixtureEnabled'')::boolean then perform internal.require_synthetic_intelligence_school(school);end if;'||anchor);execute definition;
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 anchor:='context:=internal.intelligence_context(baseline_id);';
 if position(anchor in definition)=0 then raise exception 'Fixture reservation source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if settings->>''mode''=''FIXTURE''then perform internal.require_synthetic_intelligence_school(school);end if;'||anchor);execute definition;
 -- Completion repeats current population even for retained legacy fixture attempts.
 definition:=pg_get_functiondef('internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)'::regprocedure);
 anchor:='begin'||chr(10);
 if position(anchor in definition)=0 then raise exception 'Fixture completion source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||' if exists(select 1 from app.intelligence_runs source where source.school_id="authorization".school_id()and source.id=target_run and source.generation_mode=''FIXTURE'')then perform internal.require_synthetic_intelligence_school("authorization".school_id());end if;'||chr(10));execute definition;
 foreach signature in array array['internal.require_stored_insight_scope(uuid)','internal.require_native_insight_scope(uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='perform internal.require_intelligence_policy(run.generation_mode,run.policy_version);';
  if position(anchor in definition)=0 then raise exception 'Stored fixture policy scope changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,anchor,'if run.generation_mode=''FIXTURE''then perform internal.require_synthetic_intelligence_school(run.school_id);end if;'||anchor);execute definition;
 end loop;
end$$;

-- This operator-only function retains all current approval/population/cutoff checks and existing grants.
-- Application credentials cannot set this deployment label to acquire activation authority.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.configure_posthog_before_policy_epoch(uuid,boolean,text,integer)'::regprocedure);
 anchor:='current_setting(''app.runtime_env'',true)is distinct from''local''';
 if position(anchor in definition)=0 then raise exception 'Analytics operator runtime gate changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'(current_setting(''app.runtime_env'',true)is distinct from''local''and(current_setting(''app.runtime_env'',true)is distinct from''synthetic-staging''or target_environment is distinct from''STAGING''))');
 definition:=replace(definition,'Explicit local synthetic activation required','Explicit local or hosted STAGING synthetic activation required');execute definition;
end$$;
commit;
