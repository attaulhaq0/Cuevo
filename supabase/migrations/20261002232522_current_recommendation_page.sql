-- Current proposal paging shares only identical immutable authorization inputs.
-- The unchanged source helper remains the authority for every equivalence group.
begin;
create function internal.read_current_recommendation_page(page_limit integer,page_cursor uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());answer jsonb;candidate_count integer;
begin
 if not"authorization".improvement_access(school)or role_name is null or role_name not in('admin','coordinator','teacher')then raise exception 'Current staff proposal review required'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Bounded proposal page required'using errcode='22023';end if;
 with candidates as materialized(
  select proposal.*from app.recommendations proposal where proposal.school_id=school and(page_cursor is null or proposal.id>page_cursor)order by proposal.id limit 10001
 ),sources as materialized(
  select proposal.*,run.id as source_run_id,
   case when proposal.intelligence_run_id is null then true else run.id is not null and run.school_id=proposal.school_id and run.learner_id=proposal.learner_id and run.baseline_result_id=proposal.baseline_result_id and run.actor_id=proposal.created_by and run.generation_mode=proposal.generation_mode end as linked,
   jsonb_build_object('learner',proposal.learner_id,'reference',proposal.reference_id,'baseline',proposal.baseline_result_id,'evidence',proposal.evidence_ids,
    'runSchool',run.school_id,'runActor',run.actor_id,'runLearner',run.learner_id,'runBaseline',run.baseline_result_id,'mode',run.generation_mode,'policy',run.policy_version,
    'classification',run.data_classification,'state',run.state,'prompt',run.prompt_digest,'binding',run.execution_binding_id,'bindingVersion',run.execution_binding_version,
    'nativeContext',run.context_references,'storedContext',detail.context)as authority
  from candidates proposal left join app.intelligence_runs run on run.school_id=proposal.school_id and run.id=proposal.intelligence_run_id
  left join app.intelligence_context_details detail on detail.school_id=run.school_id and detail.run_id=run.id
 ),representatives as materialized(
  -- Full JSONB equality, including exact saved arrays/content, establishes reuse.
  -- A digest, matching baseline alone or current top-N retrieval is insufficient.
  select distinct on(authority)authority,id,baseline_result_id from sources where linked order by authority,id
 ),authorized as materialized(
  select authority from representatives where internal.recommendation_source_allowed(school,id)
   and(role_name='coordinator'or"authorization".can_manage_baseline(school,baseline_result_id))
 ),permitted as materialized(
  select source.*from sources source join authorized permission on permission.authority=source.authority where source.linked order by source.id limit page_limit+1
 ),visible as materialized(select*from permitted order by id limit page_limit)
 select(select count(*)from candidates),jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',proposal.id,'learnerId',proposal.learner_id,'referenceId',proposal.reference_id,'baselineResultId',proposal.baseline_result_id,'origin',proposal.origin,'generationMode',proposal.generation_mode,'intelligenceRunId',proposal.intelligence_run_id,
  'observation',proposal.observation,'evidenceIds',proposal.evidence_ids,'interpretation',proposal.interpretation,'recommendation',proposal.recommendation,'rationale',proposal.rationale,'uncertainty',proposal.uncertainty,'activityTitle',proposal.activity_title,'instructions',proposal.instructions,'status',proposal.status,'createdAt',proposal.created_at,'selectedActivityId',proposal.selected_activity_id,'analysis',proposal.analysis,'promptDigest',proposal.prompt_digest)order by proposal.id),'[]'::jsonb),
  'nextCursor',case when(select count(*)from permitted)>page_limit then(select id from visible order by id desc limit 1)else null end)
 into candidate_count,answer from visible proposal;
 if candidate_count>10000 then raise exception 'Proposal source coverage requires review before paging'using errcode='22023';end if;
 if octet_length(answer::text)>500000 then raise exception 'Proposal page requires smaller content'using errcode='22023';end if;
 return answer;
end$$;
revoke execute on function internal.read_current_recommendation_page(integer,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_current_recommendation_page(integer,uuid)to cuevo_api;
commit;
