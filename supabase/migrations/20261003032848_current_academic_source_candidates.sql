-- Bind exact source rows before costly current permission checks.
-- Same canonical leaves, source facts, null semantics and five-second runtime budget.
begin;
-- Refuse replay against an unexpected source graph. Applied history remains unchanged.
do $$declare signature text;digest text;begin
 for signature,digest in select *from(values
 ('"authorization".can_read_academic_source(uuid,uuid,boolean,uuid)','1503f7a02024fbdd5dc6a4aa2d321397'),
 ('"authorization".can_mark_submission(uuid,uuid)','2a57a831e50edfdebdeb9ecd1a83322c'),
 ('internal.native_academic_source_allowed(uuid,uuid,boolean)','57ed37eecb103a7f6dce61818dbb2c8f'),
 ('"authorization".can_manage_baseline(uuid,uuid)','d4a064693cc04a0ae3d0ed7b274d7270'),
 ('internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean)','754d4ab01be0f8ab35a468f2e6e9df78')
 )expected(signature,digest)loop
  if md5(pg_get_functiondef(signature::regprocedure))<>digest then raise exception 'Current academic source authority requires independent review: %',signature using errcode='22023';end if;
 end loop;
end$$;

create or replace function "authorization".can_read_academic_source(target_school uuid,target_learner uuid,parent_allowed boolean,target_assessment uuid)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select assessment.course_id from app.assessments assessment where assessment.school_id=target_school and assessment.id=target_assessment)
 select coalesce("authorization".can_read_academic(target_school,target_learner,parent_allowed)and exists(select 1 from candidate
  where "authorization".can_read_course(target_school,candidate.course_id)
   and "authorization".programme_course_allowed(target_school,candidate.course_id,target_learner)
   and("authorization".current_role(target_school)in('admin','coordinator','parent')or "authorization".current_learner_course(target_school,candidate.course_id,target_learner))),false)
$$;
create or replace function "authorization".can_mark_submission(target_school uuid,target_submission uuid)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select submission.learner_id,assessment.course_id from app.submissions submission join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id where submission.school_id=target_school and submission.id=target_submission)
 select coalesce("authorization".academic_access(target_school)and"authorization".current_role(target_school)in('teacher','admin')and exists(select 1 from candidate
  where "authorization".can_manage_course(target_school,candidate.course_id)
   and "authorization".can_view_person(target_school,candidate.learner_id)
   and "authorization".current_learner_course(target_school,candidate.course_id,candidate.learner_id)),false)
$$;
create or replace function internal.native_academic_source_allowed(target_school uuid,target_result uuid,require_current boolean)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(
  select source.*,coalesce(numeric.submission_id,rubric.submission_id)as submission_id,assessment.id as assessment_id,assessment.course_id,
   internal.result_parent_published(target_school,source.id)as parent_visible
  from internal.academic_result_sources source left join app.result_revisions numeric on numeric.school_id=source.school_id and numeric.id=source.numeric_result_id left join app.rubric_result_revisions rubric on rubric.school_id=source.school_id and rubric.id=source.rubric_result_id
  join app.assessments assessment on assessment.school_id=source.school_id and assessment.id=coalesce(numeric.assessment_id,rubric.assessment_id)
  join app.school_custom_references reference on reference.school_id=source.school_id and reference.id=coalesce(numeric.reference_id,rubric.reference_id)join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
  where source.school_id=target_school and source.id=target_result and require_current is not null and reference.status='APPROVED'and version.version=coalesce(numeric.reference_version,rubric.reference_version)
   and((source.model='numeric'and exists(select 1 from app.academic_evidence evidence where evidence.school_id=target_school and evidence.id=numeric.evidence_id and evidence.result_id=numeric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=numeric.submission_id and evidence.reference_id=numeric.reference_id and evidence.reference_version=numeric.reference_version and evidence.policy_version=numeric.policy_version))or(source.model='rubric'and exists(select 1 from app.rubric_evidence evidence where evidence.school_id=target_school and evidence.id=rubric.evidence_id and evidence.result_id=rubric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=rubric.submission_id and evidence.reference_id=rubric.reference_id and evidence.reference_version=rubric.reference_version and evidence.policy_version=rubric.policy_version)))
   and(not require_current or(exists(select 1 from app.current_submissions current_submission where current_submission.school_id=target_school and current_submission.submission_id=coalesce(numeric.submission_id,rubric.submission_id))and((source.model='numeric'and exists(select 1 from app.current_results current_result where current_result.school_id=target_school and current_result.result_id=numeric.id))or(source.model='rubric'and exists(select 1 from app.current_rubric_results current_result where current_result.school_id=target_school and current_result.result_id=rubric.id)))))
 )select coalesce(exists(select 1 from candidate where "authorization".can_read_academic_source(target_school,candidate.learner_id,candidate.parent_visible,candidate.assessment_id)
  and(not require_current or "authorization".current_learner_course(target_school,candidate.course_id,candidate.learner_id))),false)
$$;
create or replace function "authorization".can_manage_baseline(target_school uuid,target_result uuid)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(select result.id,result.submission_id from internal.improvement_result_sources result where result.school_id=target_school and result.id=target_result)
 select coalesce("authorization".improvement_access(target_school)and exists(select 1 from candidate where "authorization".can_mark_submission(target_school,candidate.submission_id)and internal.native_academic_source_allowed(target_school,candidate.id,true)),false)
$$;
create or replace function internal.insight_result_allowed(target_school uuid,target_result uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text,require_current boolean)returns boolean
language sql stable security definer set search_path=''as $$
 with candidate as materialized(
  select result.id,assessment.course_id,result.learner_id from internal.improvement_result_sources result
  join app.assessments assessment on assessment.school_id=result.school_id and assessment.id=result.assessment_id
  join internal.improvement_evidence_sources evidence on evidence.school_id=result.school_id and evidence.id=result.evidence_id
  join app.school_custom_references reference on reference.school_id=result.school_id and reference.id=result.reference_id
  join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
  where result.school_id=target_school and result.id=target_result and result.learner_id=target_learner and assessment.course_id=target_course and result.reference_id=target_reference and result.reference_version=target_version and reference.status='APPROVED'and version.version=result.reference_version
   and evidence.result_id=result.id and evidence.learner_id=result.learner_id and evidence.source_object_id=result.submission_id
   and(not require_current or exists(select 1 from internal.improvement_current_results current_result where current_result.school_id=result.school_id and current_result.result_id=result.id))
 )select coalesce(exists(select 1 from candidate where "authorization".can_manage_baseline(target_school,candidate.id)
  and "authorization".can_read_course(target_school,candidate.course_id)and "authorization".programme_course_allowed(target_school,candidate.course_id,candidate.learner_id)),false)
$$;

-- Regenerate all five changed nodes from canonical authority, preserving full leaf tuples.
-- Existing exact-candidate outcome/context/replay delegates remain unchanged.
do $$declare signature text;definition text;original_name text;delegate_name text;calls text[];call_name text;call_start integer;open_position integer;close_position integer;cursor_position integer;depth integer;argument_text text;replacement text;header_end integer;is_leaf boolean;kind text;target_call text;expected_hash text;
begin
 foreach signature in array array[
  '"authorization".can_read_academic_source(uuid,uuid,boolean,uuid)',
  '"authorization".can_mark_submission(uuid,uuid)',
  'internal.native_academic_source_allowed(uuid,uuid,boolean)',
  '"authorization".can_manage_baseline(uuid,uuid)',
  'internal.insight_result_allowed(uuid,uuid,uuid,uuid,uuid,text,boolean)'
 ]loop
  definition:=pg_get_functiondef(signature::regprocedure);
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


-- CREATE OR REPLACE preserves canonical grants; no new runtime authority is granted.
commit;
