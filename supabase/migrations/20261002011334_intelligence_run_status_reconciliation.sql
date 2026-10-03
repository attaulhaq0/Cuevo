begin;
-- Current self-actor status only. Expired reservations close through the existing
-- durable failure receipt; a status read never generates or retries a model call.
create function internal.read_intelligence_run_status(page_limit integer,page_cursor uuid,target_run uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();candidate app.intelligence_runs;items jsonb:='[]'::jsonb;row_value jsonb;count_value integer:=0;cursor_value uuid;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)not in('teacher','admin')then raise exception 'Run status denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Bounded run status page required'using errcode='22023';end if;
 if target_run is not null and not exists(select 1 from app.intelligence_runs run where run.school_id=school and run.id=target_run and run.actor_id=actor and"authorization".can_manage_baseline(school,run.baseline_result_id))then raise exception 'Run status source denied'using errcode='42501';end if;
 for candidate in select run.*from app.intelligence_runs run where run.school_id=school and run.actor_id=actor and(page_cursor is null or run.id>page_cursor)and(target_run is null or run.id=target_run)and"authorization".can_manage_baseline(school,run.baseline_result_id)order by run.id loop
  begin perform internal.require_intelligence_policy(candidate.generation_mode,candidate.policy_version);if exists(select 1 from app.intelligence_context_details detail where detail.school_id=school and detail.run_id=candidate.id)then perform internal.require_stored_insight_scope(candidate.id);else perform internal.intelligence_context(candidate.baseline_result_id);end if;
  exception when insufficient_privilege or invalid_parameter_value or no_data_found then if target_run is not null then raise exception 'Run status source denied'using errcode='42501';end if;continue;end;
  count_value:=count_value+1;if count_value>page_limit then exit;end if;
  if candidate.state='REASONING'and candidate.lease_until<=clock_timestamp()then
   perform internal.fail_intelligence_run(candidate.id,candidate.lease_token,'INTELLIGENCE_TIMEOUT','intelligence-status-reconciliation');
   select*into candidate from app.intelligence_runs where school_id=school and id=candidate.id;
  end if;
  select jsonb_build_object('id',candidate.id,'baselineResultId',candidate.baseline_result_id,'learnerId',candidate.learner_id,'learnerName',person.display_name,'assessmentTitle',assessment.title,'state',candidate.state,'generationMode',candidate.generation_mode,'provider',candidate.provider,'model',candidate.model,'failureCode',candidate.failure_code,'createdAt',candidate.created_at,'completedAt',candidate.completed_at,'outputTokens',candidate.output_tokens,'inputTokens',candidate.input_tokens,'latencyMs',candidate.latency_ms,'cost',candidate.cost,'costBasis',candidate.cost_basis,'reservedBudget',candidate.reserved_budget)
  into row_value from app.result_revisions result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id join app.people person on person.school_id=result.school_id and person.actor_id=result.learner_id where result.school_id=school and result.id=candidate.baseline_result_id;
  if row_value is null then raise exception 'Run status display context unavailable'using errcode='22023';end if;
  items:=items||jsonb_build_array(row_value);cursor_value:=candidate.id;
 end loop;
 if octet_length(items::text)>250000 then raise exception 'Run status page requires smaller content'using errcode='22023';end if;
 return jsonb_build_object('items',items,'nextCursor',case when count_value>page_limit then cursor_value else null end);
end$$;
revoke execute on function internal.read_intelligence_run_status(integer,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intelligence_run_status(integer,uuid,uuid)to cuevo_api;
commit;
