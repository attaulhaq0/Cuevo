-- Current exact leaf authority is computed once within each page request.
-- Canonical delegates retain every source/fact predicate; no verdict survives the call.
begin;
create function internal.recommendation_page_verdict(verdicts jsonb,kind text,arguments jsonb)returns boolean
language plpgsql immutable set search_path=''as $$declare value jsonb;begin
 value:=verdicts->jsonb_build_array(kind,arguments)::text;
 if value is null or jsonb_typeof(value)not in('boolean','null')then raise exception 'Current page source verdict unavailable'using errcode='42501';end if;
 return case when value='null'::jsonb then null else(value::text)::boolean end;
end$$;
revoke execute on function internal.recommendation_page_verdict(jsonb,text,jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Clone only effective canonical authority, replacing full argument tuples.
-- Each copied predicate remains in its existing dependency order and purpose.
do $$declare signature text;definition text;original_name text;delegate_name text;calls text[];call_name text;call_start integer;open_position integer;close_position integer;cursor_position integer;depth integer;argument_text text;replacement text;header_end integer;is_leaf boolean;kind text;target_call text;expected_hash text;
begin
 foreach signature in array array[
  '"authorization".can_read_academic_source(uuid,uuid,boolean,uuid)',
  '"authorization".can_mark_submission(uuid,uuid)',
  'internal.native_academic_source_allowed(uuid,uuid,boolean)',
  '"authorization".can_manage_baseline(uuid,uuid)',
  'internal.intelligence_context(uuid)',
  'internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean)',
  'internal.insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text)',
  'internal.require_native_insight_scope(uuid)',
  'internal.require_stored_insight_scope(uuid)',
  'internal.recommendation_source_allowed(uuid,uuid)'
 ]loop
  definition:=pg_get_functiondef(signature::regprocedure);
  expected_hash:=case signature
   when'"authorization".can_read_academic_source(uuid,uuid,boolean,uuid)'then'1503f7a02024fbdd5dc6a4aa2d321397'
   when'"authorization".can_mark_submission(uuid,uuid)'then'2a57a831e50edfdebdeb9ecd1a83322c'
   when'internal.native_academic_source_allowed(uuid,uuid,boolean)'then'57ed37eecb103a7f6dce61818dbb2c8f'
   when'"authorization".can_manage_baseline(uuid,uuid)'then'd4a064693cc04a0ae3d0ed7b274d7270'
   when'internal.intelligence_context(uuid)'then'c35adaaf82f44a2c542f2ee702cb3e29'
   when'internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean)'then'754d4ab01be0f8ab35a468f2e6e9df78'
   when'internal.insight_outcome_allowed(uuid,uuid,uuid,uuid,uuid,text)'then'b4cd97ff86ffd4866d9e0e9459a21e4c'
   when'internal.require_native_insight_scope(uuid)'then'10744f6e39dc0b20be89db15156ca273'
   when'internal.require_stored_insight_scope(uuid)'then'453d00c731d0750739809c70907266f0'
   when'internal.recommendation_source_allowed(uuid,uuid)'then'029c48bec2a07296b129320951558d3b'end;
  if expected_hash is null or md5(definition)<>expected_hash then raise exception 'Canonical page authority body requires review: %',signature using errcode='22023';end if;
  original_name:=substring(signature from 1 for position('('in signature)-1);
  delegate_name:='internal.page_'||replace(replace(split_part(original_name,'.',2),'"',''),'"','');
  definition:=replace(definition,'FUNCTION '||original_name||'(','FUNCTION '||delegate_name||'(');
  if position('FUNCTION '||delegate_name||'('in definition)=0 then raise exception 'Canonical page delegate signature changed: %',signature using errcode='22023';end if;
  header_end:=position(')'in definition);definition:=overlay(definition placing ', page_verdicts jsonb'from header_end for 0);
  calls:=array[
   '"authorization".can_read_academic_source','"authorization".can_mark_submission','internal.native_academic_source_allowed','"authorization".can_manage_baseline','internal.intelligence_context','internal.insight_result_allowed','internal.insight_outcome_allowed','internal.require_native_insight_scope','internal.require_stored_insight_scope',
   '"authorization".can_read_course','"authorization".can_manage_course','"authorization".current_learner_course','"authorization".programme_course_allowed','"authorization".can_view_person','"authorization".can_read_academic','internal.insight_published_option','internal.observation_source_allowed'
  ];
  foreach call_name in array calls loop
   cursor_position:=header_end+length(', page_verdicts jsonb');
   loop
    call_start:=strpos(substring(definition from cursor_position),call_name||'(');
    exit when call_start=0;call_start:=call_start+cursor_position-1;
    open_position:=call_start+length(call_name);close_position:=open_position+1;depth:=1;
    while depth>0 and close_position<=length(definition)loop
     if substring(definition from close_position for 1)='('then depth:=depth+1;elsif substring(definition from close_position for 1)=')'then depth:=depth-1;end if;
     close_position:=close_position+1;
    end loop;
    if depth<>0 then raise exception 'Canonical page call changed'using errcode='22023';end if;
    argument_text:=substring(definition from open_position+1 for close_position-open_position-2);
    is_leaf:=call_name=any(calls[10:17]);
    if is_leaf then
     kind:=case call_name when'"authorization".can_read_course'then'COURSE_READ'when'"authorization".can_manage_course'then'COURSE_MANAGE'when'"authorization".current_learner_course'then'LEARNER_COURSE'when'"authorization".programme_course_allowed'then'PROGRAMME_COURSE'when'"authorization".can_view_person'then'PERSON'when'"authorization".can_read_academic'then'ACADEMIC_READ'when'internal.insight_published_option'then'PUBLISHED_OPTION'else'OBSERVATION'end;
     replacement:='internal.recommendation_page_verdict(page_verdicts,'||quote_literal(kind)||',jsonb_build_array('||argument_text||'))';
    else
     target_call:='internal.page_'||replace(split_part(call_name,'.',2),'"','');replacement:=target_call||'('||argument_text||',page_verdicts)';
    end if;
    replacement:=' '||replacement||' ';
    definition:=overlay(definition placing replacement from call_start for close_position-call_start);cursor_position:=call_start+length(replacement);
   end loop;
  end loop;
  execute definition;
  execute format('revoke execute on function %s from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',replace(replace(signature,original_name,delegate_name),')',',jsonb)'));
 end loop;
end$$;

create function internal.recommendation_page_source_verdicts(page_cursor uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare school uuid:="authorization".school_id();verdicts jsonb;
begin
 with candidates as materialized(
  select proposal.*from app.recommendations proposal where proposal.school_id=school and(page_cursor is null or proposal.id>page_cursor)order by proposal.id limit 10001
 ),contexts as materialized(
  select candidate.learner_id,candidate.baseline_result_id,
   case when"authorization".current_role(school)in('teacher','admin')and run.id is not null and run.actor_id=candidate.created_by and run.learner_id=candidate.learner_id and run.baseline_result_id=candidate.baseline_result_id and run.generation_mode=candidate.generation_mode then detail.context else null end as context
  from candidates candidate left join app.intelligence_runs run on run.school_id=candidate.school_id and run.id=candidate.intelligence_run_id
  left join app.intelligence_context_details detail on detail.school_id=run.school_id and detail.run_id=run.id
 ),safe_contexts as materialized(
  select learner_id,baseline_result_id,case when jsonb_typeof(context)='object'then context else null end as context,
   case when jsonb_typeof(context->'recentResults')='array'then context->'recentResults'else'[]'::jsonb end as recent,
   case when jsonb_typeof(context->'priorInterventions')='array'then context->'priorInterventions'else'[]'::jsonb end as prior,
   case when jsonb_typeof(context->'observations')='array'then context->'observations'else'[]'::jsonb end as observations,
   case when jsonb_typeof(context->'learningOptions')='array'then context->'learningOptions'else'[]'::jsonb end as options
  from contexts
 ),actual_prior as materialized(
  select context.learner_id,context.context,intervention.baseline_result_id,intervention.follow_up_assessment_id,outcome.baseline_result_id as outcome_baseline,outcome.follow_up_result_id as outcome_followup
  from safe_contexts context cross join lateral jsonb_array_elements(context.prior)saved
  left join app.interventions intervention on intervention.school_id=school and intervention.id=case when(saved->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then(saved->>'id')::uuid else null end
  left join app.outcome_measurements outcome on outcome.school_id=school and outcome.id=case when(saved->'outcome'->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then(saved->'outcome'->>'id')::uuid else null end
 ),result_ids as materialized(
  select baseline_result_id as id from safe_contexts
  union select(source->>'resultId')::uuid from safe_contexts cross join lateral jsonb_array_elements(recent)source where(source->>'resultId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select(source->>'baselineResultId')::uuid from safe_contexts cross join lateral jsonb_array_elements(prior)source where(source->>'baselineResultId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select(source->'outcome'->>'followUpResultId')::uuid from safe_contexts cross join lateral jsonb_array_elements(prior)source where(source->'outcome'->>'followUpResultId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select baseline_result_id from actual_prior
  union select outcome_baseline from actual_prior
  union select outcome_followup from actual_prior
 ),source_context as materialized(
  select result.learner_id,assessment.course_id from internal.improvement_result_sources result join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id where result.school_id=school and result.id in(select id from result_ids)
  union select learner_id,(context->>'courseId')::uuid from safe_contexts where(context->>'courseId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select(context->>'learnerId')::uuid,(context->>'courseId')::uuid from safe_contexts where(context->>'courseId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'and(context->>'learnerId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select context.learner_id,assessment.course_id from safe_contexts context cross join lateral jsonb_array_elements(context.prior)saved join app.interventions intervention on intervention.school_id=school and intervention.id=case when(saved->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then(saved->>'id')::uuid else null end join app.assessments assessment on assessment.school_id=intervention.school_id and assessment.id=intervention.follow_up_assessment_id
 ),observations as materialized(
  select distinct(source->>'id')::uuid as id from safe_contexts cross join lateral jsonb_array_elements(observations)source where(source->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ),courses as materialized(select distinct course_id from source_context),people as materialized(select distinct learner_id from source_context union select learner_id from safe_contexts),pairs as materialized(select distinct learner_id,course_id from source_context),options as materialized(select distinct(source->>'activityId')::uuid as id,source as saved from safe_contexts cross join lateral jsonb_array_elements(options)source where(source->>'activityId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),entries as materialized(
  select jsonb_build_array('COURSE_READ',jsonb_build_array(school,course_id))::text as key,to_jsonb("authorization".can_read_course(school,course_id))as value from courses
  union all select jsonb_build_array('COURSE_MANAGE',jsonb_build_array(school,course_id))::text,to_jsonb("authorization".can_manage_course(school,course_id))from courses
  union all select jsonb_build_array('LEARNER_COURSE',jsonb_build_array(school,course_id,learner_id))::text,to_jsonb("authorization".current_learner_course(school,course_id,learner_id))from pairs
  union all select jsonb_build_array('PROGRAMME_COURSE',jsonb_build_array(school,course_id,learner_id))::text,to_jsonb("authorization".programme_course_allowed(school,course_id,learner_id))from pairs
  union all select jsonb_build_array('PERSON',jsonb_build_array(school,learner_id))::text,to_jsonb("authorization".can_view_person(school,learner_id))from people
  union all select jsonb_build_array('ACADEMIC_READ',jsonb_build_array(school,learner_id,parent_allowed))::text,to_jsonb("authorization".can_read_academic(school,learner_id,parent_allowed))from people cross join(values(true),(false))parent(parent_allowed)
  union all select jsonb_build_array('PUBLISHED_OPTION',jsonb_build_array(school,id,saved))::text,to_jsonb(internal.insight_published_option(school,id,saved))from options
  union all select jsonb_build_array('OBSERVATION',jsonb_build_array(school,id))::text,to_jsonb(internal.observation_source_allowed(school,id))from observations
 )select coalesce(jsonb_object_agg(key,coalesce(value,'null'::jsonb)),'{}'::jsonb)into verdicts from entries;
 return verdicts;
end$$;
revoke execute on function internal.recommendation_page_source_verdicts(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_current_recommendation_page(integer,uuid)'::regprocedure);
 anchor:='candidate_count integer;';if position(anchor in definition)=0 then raise exception 'Current page declaration changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'page_verdicts jsonb;');
 anchor:=' with candidates as materialized(';if position(anchor in definition)=0 then raise exception 'Current page candidate boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,' page_verdicts:=internal.recommendation_page_source_verdicts(page_cursor);'||chr(10)||anchor);
 anchor:='internal.recommendation_source_allowed(school,id)';if position(anchor in definition)=0 then raise exception 'Current page source authority changed'using errcode='22023';end if;definition:=replace(definition,anchor,'internal.page_recommendation_source_allowed(school,id,page_verdicts)');
 anchor:='"authorization".can_manage_baseline(school,baseline_result_id)';if position(anchor in definition)=0 then raise exception 'Current page baseline authority changed'using errcode='22023';end if;definition:=replace(definition,anchor,' internal.page_can_manage_baseline(school,baseline_result_id,page_verdicts) ');execute definition;
end$$;
commit;
