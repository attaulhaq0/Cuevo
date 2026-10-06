-- Human labels are purpose-limited projections of an already authorized source.
begin;
create function internal.read_academic_evidence_context(target_evidence uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();evidence record;result record;context jsonb;duplicate boolean;publication boolean;
begin
 perform internal.require_context();
 if not"authorization".academic_access(school)then raise exception 'Academic evidence unavailable'using errcode='P0002';end if;
 select *into evidence from(
  select entry.*,'numeric'::text model from app.academic_evidence entry where entry.school_id=school and entry.id=target_evidence
  union all select entry.*,'rubric'::text model from app.rubric_evidence entry where entry.school_id=school and entry.id=target_evidence
 )source;
 if not found or not internal.retained_result_source_read_allowed(school,evidence.result_id)then raise exception 'Academic evidence unavailable'using errcode='P0002';end if;
 select source.*into result from internal.improvement_result_sources source
 where source.school_id=school and source.id=evidence.result_id and source.model=evidence.model
  and source.evidence_id=evidence.id and source.submission_id=evidence.source_object_id and source.learner_id=evidence.learner_id
  and source.reference_id=evidence.reference_id and source.reference_version=evidence.reference_version and source.policy_version=evidence.policy_version and source.revision=evidence.revision;
 if not found then raise exception 'Academic evidence unavailable'using errcode='P0002';end if;
 -- Current registered recorder name is disclosed only for this exact evidence actor.
 -- No people directory, contacts, peer identities or submitted work enter the response.
 select jsonb_build_object('status','REQUIRES_REVIEW','labelBasis','CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK','identityRequiresReview',true,
  'learnerName',nullif(btrim(learner.display_name),''),'recordedByName',nullif(btrim(recorder.display_name),''),
  'assessmentTitle',nullif(btrim(coalesce(snapshot.assessment_title,assessment.title)),''),
  'courseTitle',nullif(btrim(case when snapshot.submission_id is null then course.title else course_revision.title end),''),
  'className',nullif(btrim(class.name),''),'yearGroupName',nullif(btrim(year_group.name),''),'academicYearName',nullif(btrim(academic_year.name),''),
  'referenceTitle',nullif(btrim(reference.title),''),'submittedAt',submission.submitted_at,'submissionRevision',submission.revision)
 into context from app.submissions submission
 join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id and assessment.id=result.assessment_id
 join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
 join app.classes class on class.school_id=course.school_id and class.id=course.class_id
 join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id
 join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
 join app.school_custom_references reference on reference.school_id=school and reference.id=evidence.reference_id
 left join app.people learner on learner.school_id=school and learner.actor_id=evidence.learner_id
 left join app.people recorder on recorder.school_id=school and recorder.actor_id=evidence.actor_id
 left join app.learning_submission_context snapshot on snapshot.school_id=submission.school_id and snapshot.submission_id=submission.id
 left join app.learning_content_revisions course_revision on course_revision.school_id=course.school_id and course_revision.id=snapshot.course_revision_id and course_revision.resource='course'and course_revision.source_id=course.id and course_revision.course_id=course.id
 where submission.school_id=school and submission.id=evidence.source_object_id and submission.learner_id=evidence.learner_id;
 if context is null then raise exception 'Academic evidence context unavailable'using errcode='P0002';end if;
 select exists(select 1 from app.enrollments enrollment join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
  join app.people peer on peer.school_id=enrollment.school_id and peer.actor_id=enrollment.student_actor_id
  join app.assessments assessment on assessment.school_id=school and assessment.id=result.assessment_id
  join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
  where enrollment.school_id=school and enrollment.class_id=course.class_id and enrollment.student_actor_id<>evidence.learner_id
   and enrollment.status='active'and member.status='active'and member.role='student'
   and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())
   and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())
   and lower(btrim(peer.display_name))=lower(btrim(context->>'learnerName'))and"authorization".can_view_person(school,peer.actor_id))into duplicate;
 context:=context||jsonb_build_object('identityRequiresReview',duplicate,'status',case when not duplicate and not exists(select 1 from jsonb_each(context)item where item.value='null'::jsonb)then'READY'else'REQUIRES_REVIEW'end);
 publication:=internal.result_parent_published(school,evidence.result_id);
 return jsonb_build_object('id',evidence.id,'sourceType',evidence.source_type,'sourceObjectId',evidence.source_object_id,'learnerId',evidence.learner_id,'actorId',evidence.actor_id,
  'createdAt',evidence.created_at,'quality',evidence.quality,'referenceId',evidence.reference_id,'referenceVersion',evidence.reference_version,'policyVersion',evidence.policy_version,
  'resultId',evidence.result_id,'revision',evidence.revision,'visibility',case when publication then'PARENT_APPROVED'else'LEARNER_PRIVATE'end,'reviewStatus',evidence.review_status,'model',evidence.model,'context',context);
end$$;
revoke execute on function internal.read_academic_evidence_context(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_academic_evidence_context(uuid)to cuevo_api;
commit;
