-- Read-time Improvement context reuses the exact authorized Academic evidence owner.
-- It never enters command receipts, measurement history, outbox or worker values.
begin;
create function internal.read_intervention_context(target_intervention uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();task app.interventions;baseline internal.improvement_result_sources;evidence jsonb;context jsonb;display jsonb;label_key text;label_value text;duplicate_caption boolean;
begin
 perform internal.require_context();
 if not internal.intervention_history_allowed(school,target_intervention)then raise exception 'Intervention context denied'using errcode='42501';end if;
 select*into task from app.interventions where school_id=school and id=target_intervention;
 display:=jsonb_build_object('interventionId',task.id,'baselineResultId',task.baseline_result_id,'learnerId',task.learner_id,'referenceId',task.reference_id,
  'status','REQUIRES_REVIEW','labelBasis','CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK','identityRequiresReview',false,
  'learnerName',null,'courseTitle',null,'className',null,'yearGroupName',null,'academicYearName',null);
 select*into baseline from internal.improvement_result_sources source where source.school_id=school and source.id=task.baseline_result_id and source.learner_id=task.learner_id and source.reference_id=task.reference_id;
 if not found then return display;end if;
 begin
  evidence:=internal.read_academic_evidence_context(baseline.evidence_id);
 exception when sqlstate 'P0002'then return display;
 end;
 -- A retained Academic read has its own current authority and exact evidence binding.
 -- Keep it behind the narrower Intervention purpose, including Parent denial.
 if evidence->>'id'is distinct from baseline.evidence_id::text or evidence->>'resultId'is distinct from baseline.id::text
  or evidence->>'sourceObjectId'is distinct from baseline.submission_id::text or evidence->>'learnerId'is distinct from task.learner_id::text
  or evidence->>'referenceId'is distinct from task.reference_id::text or evidence->>'referenceVersion'is distinct from baseline.reference_version
  or evidence->>'policyVersion'is distinct from baseline.policy_version::text or evidence->>'revision'is distinct from baseline.revision::text
  or evidence->>'model'is distinct from baseline.model then return display;end if;
 context:=evidence->'context';
 if context->>'labelBasis'is distinct from'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK'or context->>'status'not in('READY','REQUIRES_REVIEW')or jsonb_typeof(context->'identityRequiresReview')is distinct from'boolean'then return display;end if;
 display:=display||jsonb_build_object('identityRequiresReview',context->'identityRequiresReview');
 foreach label_key in array array['learnerName','courseTitle','className','yearGroupName','academicYearName']loop
  label_value:=nullif(btrim(context->>label_key),'');
  if length(label_value)>200 or label_value~*'^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{8}|[0-9a-f]{40}|[0-9a-f]{64})$'then label_value:=null;end if;
  display:=display||jsonb_build_object(label_key,label_value);
 end loop;
 -- Teacher Home's identity caption is class/year, so equal captions in another
 -- authorized source class cannot disambiguate same-name learners. Disclose
 -- only a review flag; inaccessible peer existence never enters self reads.
 select "authorization".current_role(school)in('admin','coordinator','teacher')and exists(
  select 1 from app.people peer join app.enrollments enrollment on enrollment.school_id=peer.school_id and enrollment.student_actor_id=peer.actor_id
  join app.classes class on class.school_id=enrollment.school_id and class.id=enrollment.class_id and class.status='active'
  join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id
  join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
  where peer.school_id=school and peer.actor_id<>task.learner_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())
   and lower(btrim(peer.display_name))=lower(display->>'learnerName')and lower(btrim(class.name))=lower(display->>'className')
   and lower(btrim(year_group.name))=lower(display->>'yearGroupName')and lower(btrim(academic_year.name))=lower(display->>'academicYearName')
   and "authorization".can_view_person(school,peer.actor_id)and"authorization".can_view_class(school,class.id)
   and exists(select 1 from app.courses course where course.school_id=school and course.class_id=class.id and"authorization".can_read_course(school,course.id)and"authorization".current_learner_course(school,course.id,peer.actor_id))
 )into duplicate_caption;
 if duplicate_caption then display:=display||jsonb_build_object('identityRequiresReview',true);end if;
 if context->>'status'='READY'and display->'identityRequiresReview'='false'::jsonb and not exists(select 1 from jsonb_each(display)item where item.value='null'::jsonb)then display:=display||jsonb_build_object('status','READY');end if;
 return display;
end$$;
revoke execute on function internal.read_intervention_context(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_intervention_context(uuid)to cuevo_api;
commit;
