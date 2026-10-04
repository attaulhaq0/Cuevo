-- Align the explicit waiting receipt with the already-recorded terminal retry state.
begin;
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.process_learner_observation_policy_event(uuid,uuid)'::regprocedure);
 anchor:='if not ready then update internal.outbox_events set state=case when attempt_count>=10 then''FAILED''else''PENDING''end,lease_token=null,lease_until=null,available_at=clock_timestamp()+interval''5 seconds'',max_attempts=10,last_error_code=''OBSERVATION_RECOVERY_PENDING''where id=event.id and state=''PROCESSING''and lease_token=current_lease and lease_until>clock_timestamp();if not found then raise exception ''Observation wait lease changed''using errcode=''22023'';end if;return jsonb_build_object(''status'',''WAITING'');end if;';
 replacement:='if not ready then update internal.outbox_events set state=case when attempt_count>=10 then''FAILED''else''PENDING''end,lease_token=null,lease_until=null,available_at=clock_timestamp()+interval''5 seconds'',max_attempts=10,last_error_code=case when attempt_count>=10 then''OBSERVATION_RECOVERY_EXHAUSTED''else''OBSERVATION_RECOVERY_PENDING''end where id=event.id and state=''PROCESSING''and lease_token=current_lease and lease_until>clock_timestamp();if not found then raise exception ''Observation wait lease changed''using errcode=''22023'';end if;return jsonb_build_object(''status'',case when event.attempt_count>=10 then''REQUIRES_REVIEW''else''WAITING''end);end if;';
 if position(anchor in definition)=0 then raise exception 'Expected observation wait retry boundary changed';end if;
 execute replace(definition,anchor,replacement);
end$$;
revoke execute on function internal.process_learner_observation_policy_event(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
