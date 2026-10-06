begin;
create function internal.require_gradebook_course(target_course uuid)returns void language plpgsql stable security definer set search_path=''as $$declare school uuid:="authorization".school_id();begin
 if not"authorization".academic_access(school)or"authorization".current_role(school)is null or"authorization".current_role(school)not in('teacher','admin')or not"authorization".can_manage_course(school,target_course)or not"authorization".can_read_course(school,target_course)then raise exception 'Gradebook course denied'using errcode='42501';end if;
end$$;
-- Called only after the enclosing purpose-specific page/detail authorizes the course and learner.
create function internal.gradebook_native_cell(target_school uuid,target_assessment uuid,target_learner uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare assessment app.assessments;source app.submissions;source_state text;mark jsonb;released jsonb;begin
 select*into assessment from app.assessments where school_id=target_school and id=target_assessment;
 select submission.*into source from app.current_submissions pointer join app.submissions submission on submission.school_id=pointer.school_id and submission.id=pointer.submission_id where pointer.school_id=target_school and pointer.assessment_id=target_assessment and pointer.learner_id=target_learner;
 select pointer.state into source_state from app.current_submissions pointer where pointer.school_id=target_school and pointer.submission_id=source.id;
 if source.id is not null then
  if assessment.model='rubric'then
   select jsonb_build_object('id',revision.id,'revision',revision.revision,'nativeResult',revision.native_result,'feedback',revision.feedback)into mark from app.rubric_marking_revisions revision where revision.school_id=target_school and revision.submission_id=source.id order by revision.revision desc limit 1;
   select jsonb_build_object('id',result.id,'evidenceId',result.evidence_id,'revision',result.revision,'nativeResult',result.native_result,'feedback',result.feedback,'referenceTitle',reference.title)into released from app.current_rubric_results pointer join app.rubric_result_revisions result on result.school_id=pointer.school_id and result.id=pointer.result_id join app.school_custom_references reference on reference.school_id=result.school_id and reference.id=result.reference_id where pointer.school_id=target_school and pointer.submission_id=source.id;
  else
   select jsonb_build_object('id',revision.id,'revision',revision.revision,'nativeResult',jsonb_build_object('type','numeric','score',revision.score,'maxScore',revision.max_score,'policyVersion',revision.policy_version),'feedback',revision.feedback)into mark from app.marking_revisions revision where revision.school_id=target_school and revision.submission_id=source.id order by revision.revision desc limit 1;
   select jsonb_build_object('id',result.id,'evidenceId',result.evidence_id,'revision',result.revision,'nativeResult',jsonb_build_object('type','numeric','score',result.score,'maxScore',result.max_score,'policyVersion',result.policy_version),'feedback',result.feedback,'referenceTitle',reference.title)into released from app.current_results pointer join app.result_revisions result on result.school_id=pointer.school_id and result.id=pointer.result_id join app.school_custom_references reference on reference.school_id=result.school_id and reference.id=result.reference_id where pointer.school_id=target_school and pointer.submission_id=source.id;
  end if;
 end if;
 return jsonb_build_object('assessmentId',assessment.id,'state',case when source.id is null then'NO_SUBMISSION'when source_state in('RETURNED','CLOSED')then source_state when mark is null then'UNMARKED'when released is not null and released->>'revision'=mark->>'revision'then'RELEASED'else'REVIEW'end,'submissionId',source.id,'submissionRevision',source.revision,'markingId',mark->'id','markingRevision',mark->'revision','policyVersion',assessment.policy_version,'nativeResult',mark->'nativeResult','releasedResult',released);
end$$;
create function internal.read_course_gradebook(target_course uuid,learner_limit integer,assessment_limit integer,learner_cursor uuid,assessment_cursor uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();course app.courses;context jsonb;columns jsonb;rows jsonb;learner_count integer;assessment_count integer;column_ids uuid[];next_learner uuid;next_assessment uuid;begin
 perform internal.require_gradebook_course(target_course);
 if learner_limit is null or learner_limit not between 1 and 25 or assessment_limit is null or assessment_limit not between 1 and 10 then raise exception 'Bounded gradebook page required'using errcode='22023';end if;
 select*into course from app.courses where school_id=school and id=target_course;
 select jsonb_build_object('courseId',course.id,'courseTitle',course.title,'className',class.name,'yearGroupName',year_group.name)into context from app.classes class join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id where class.school_id=school and class.id=course.class_id;
 select count(*)into assessment_count from app.assessments where school_id=school and course_id=target_course and status='PUBLISHED';
 with candidates as materialized(select assessment.id,assessment.title,assessment.model,assessment.policy_version,reference.title as reference_title from app.assessments assessment left join app.school_custom_references reference on reference.school_id=assessment.school_id and reference.id=assessment.academic_reference_id where assessment.school_id=school and assessment.course_id=target_course and assessment.status='PUBLISHED'and(assessment_cursor is null or assessment.id>assessment_cursor)order by assessment.id limit assessment_limit+1),visible as(select*from candidates order by id limit assessment_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'model',model,'referenceTitle',reference_title,'policyVersion',policy_version)order by id),'[]'::jsonb),coalesce(array_agg(id order by id),array[]::uuid[]),case when(select count(*)from candidates)>assessment_limit then(select id from visible order by id desc limit 1)end into columns,column_ids,next_assessment from visible;
 select count(*)into learner_count from app.enrollments enrollment where enrollment.school_id=school and enrollment.class_id=course.class_id and"authorization".current_learner_course(school,target_course,enrollment.student_actor_id);
 with candidates as materialized(select enrollment.student_actor_id as id,person.display_name from app.enrollments enrollment join app.people person on person.school_id=enrollment.school_id and person.actor_id=enrollment.student_actor_id where enrollment.school_id=school and enrollment.class_id=course.class_id and"authorization".current_learner_course(school,target_course,enrollment.student_actor_id)and(learner_cursor is null or enrollment.student_actor_id>learner_cursor)order by enrollment.student_actor_id limit learner_limit+1),visible as(select*from candidates order by id limit learner_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'learnerName',display_name,'cells',(select coalesce(jsonb_agg(internal.gradebook_native_cell(school,assessment_id,id)order by ordinal),'[]'::jsonb)from unnest(column_ids)with ordinality ids(assessment_id,ordinal)))order by id),'[]'::jsonb),case when(select count(*)from candidates)>learner_limit then(select id from visible order by id desc limit 1)end into rows,next_learner from visible;
 context:=context||jsonb_build_object('assessments',columns,'items',rows,'learnerTotal',learner_count,'assessmentTotal',assessment_count,'nextLearnerCursor',next_learner,'nextAssessmentCursor',next_assessment);
 if octet_length(context::text)>500000 then raise exception 'Select a smaller gradebook page'using errcode='22023';end if;return context;
end$$;
create function internal.read_gradebook_source(target_submission uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source app.submissions;assessment app.assessments;cell jsonb;current_mark jsonb;rubric jsonb;learner_name text;begin
 select*into source from app.submissions where school_id=school and id=target_submission;
 select*into assessment from app.assessments where school_id=school and id=source.assessment_id;
 perform internal.require_gradebook_course(assessment.course_id);
 if source.id is null or not"authorization".can_mark_submission(school,source.id)or not exists(select 1 from app.current_submissions pointer where pointer.school_id=school and pointer.submission_id=source.id)then raise exception 'Current gradebook source denied'using errcode='42501';end if;
 cell:=internal.gradebook_native_cell(school,assessment.id,source.learner_id);
 select display_name into learner_name from app.people where school_id=school and actor_id=source.learner_id;
 if assessment.model='rubric'then
  select jsonb_build_object('id',definition.id,'title',definition.title,'version',definition.version,'criteria',definition.criteria)into rubric from app.assessment_rubrics pinned join app.rubric_versions definition on definition.school_id=pinned.school_id and definition.id=pinned.rubric_id where pinned.school_id=school and pinned.assessment_id=assessment.id;
  select jsonb_build_object('id',mark.id,'revision',mark.revision,'feedback',mark.feedback,'model','rubric','nativeResult',mark.native_result,'resultId',case when cell->'releasedResult'->>'revision'=mark.revision::text then cell->'releasedResult'->'id'else null end,'status',case when cell->'releasedResult'->>'revision'=mark.revision::text then'RELEASED'else'REVIEW'end)into current_mark from app.rubric_marking_revisions mark where mark.school_id=school and mark.submission_id=source.id order by mark.revision desc limit 1;
 else
  select jsonb_build_object('id',mark.id,'revision',mark.revision,'feedback',mark.feedback,'model','numeric','score',mark.score,'maxScore',mark.max_score,'resultId',case when cell->'releasedResult'->>'revision'=mark.revision::text then cell->'releasedResult'->'id'else null end,'status',case when cell->'releasedResult'->>'revision'=mark.revision::text then'RELEASED'else'REVIEW'end)into current_mark from app.marking_revisions mark where mark.school_id=school and mark.submission_id=source.id order by mark.revision desc limit 1;
 end if;
 return jsonb_build_object('id',source.id,'assessmentId',assessment.id,'learnerId',source.learner_id,'content',source.content,'assessmentTitle',assessment.title,'learnerName',learner_name,'model',assessment.model,'policyVersion',assessment.policy_version,'referenceId',assessment.academic_reference_id,'submissionRevision',source.revision,'submissionStatus',(select pointer.state from app.current_submissions pointer where pointer.school_id=school and pointer.submission_id=source.id),'rubric',rubric,'currentResult',current_mark)||case when assessment.model='numeric'then jsonb_build_object('maxScore',assessment.max_score)else'{}'::jsonb end;
end$$;
create function internal.preview_gradebook_release(target_course uuid,selections jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();selection jsonb;source app.submissions;assessment app.assessments;cell jsonb;feedback text;reference_title text;learner_name text;items jsonb:='[]';begin
 perform internal.require_gradebook_course(target_course);
 if selections is null or jsonb_typeof(selections)<>'array'or jsonb_array_length(selections)not between 1 and 25 or(select count(distinct item->>'markingId')from jsonb_array_elements(selections)item)<>jsonb_array_length(selections)or(select count(distinct item->>'submissionId')from jsonb_array_elements(selections)item)<>jsonb_array_length(selections)then raise exception 'Bounded unique reviewed selections required'using errcode='22023';end if;
 for selection in select*from jsonb_array_elements(selections)loop
  if jsonb_typeof(selection)<>'object'or selection-'markingId'-'submissionId'-'expectedRevision'-'expectedSubmissionRevision'-'expectedPolicyVersion'-'parentVisible'<>'{}'::jsonb or jsonb_typeof(selection->'parentVisible')is distinct from'boolean'or jsonb_typeof(selection->'markingId')is distinct from'string'or jsonb_typeof(selection->'submissionId')is distinct from'string'or exists(select 1 from unnest(array['expectedRevision','expectedSubmissionRevision','expectedPolicyVersion'])key where jsonb_typeof(selection->key)is distinct from'number'or selection->>key!~'^[1-9][0-9]*$')then raise exception 'Explicit per-source release expectations required'using errcode='22023';end if;
  select*into source from app.submissions where school_id=school and id=(selection->>'submissionId')::uuid;
  select*into assessment from app.assessments where school_id=school and id=source.assessment_id;
  if source.id is null or assessment.course_id is distinct from target_course or not"authorization".current_submission_open(school,source.id)then raise exception 'Selected current release source denied'using errcode='42501';end if;
  cell:=internal.gradebook_native_cell(school,assessment.id,source.learner_id);
  if cell->>'state'<>'REVIEW'or cell->>'markingId'is distinct from selection->>'markingId'or(cell->>'markingRevision')::integer is distinct from(selection->>'expectedRevision')::integer or source.revision is distinct from(selection->>'expectedSubmissionRevision')::integer or assessment.policy_version is distinct from(selection->>'expectedPolicyVersion')::integer then raise exception 'Reviewed release source changed'using errcode='22023';end if;
  select title into reference_title from app.school_custom_references where school_id=school and id=assessment.academic_reference_id and status='APPROVED';if reference_title is null then raise exception 'Approved objective required'using errcode='22023';end if;
  if assessment.model='rubric'then select mark.feedback into feedback from app.rubric_marking_revisions mark where mark.school_id=school and mark.id=(selection->>'markingId')::uuid;else select mark.feedback into feedback from app.marking_revisions mark where mark.school_id=school and mark.id=(selection->>'markingId')::uuid;end if;
  select display_name into learner_name from app.people where school_id=school and actor_id=source.learner_id;
  items:=items||jsonb_build_array(jsonb_build_object('selection',selection,'learnerName',learner_name,'assessmentTitle',assessment.title,'referenceTitle',reference_title,'nativeResult',cell->'nativeResult','feedback',feedback));
 end loop;
 if octet_length(items::text)>500000 then raise exception 'Reviewed release preview requires a smaller selection'using errcode='22023';end if;return jsonb_build_object('courseId',target_course,'items',items);
end$$;
create function internal.release_gradebook_selection(target_course uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();selection jsonb;source app.submissions;assessment app.assessments;reservation jsonb;result_id uuid;released jsonb;items jsonb:='[]';receipt jsonb;begin
 perform internal.require_gradebook_course(target_course);
 if payload is null or jsonb_typeof(payload)<>'object'or payload-'selections'-'confirmRelease'<>'{}'::jsonb or payload->'confirmRelease'is distinct from'true'::jsonb or jsonb_typeof(payload->'selections')is distinct from'array'or jsonb_array_length(payload->'selections')not between 1 and 25 then raise exception 'Human confirmed selected release required'using errcode='22023';end if;
 perform internal.lock_academic_course(school,target_course);
 perform internal.require_gradebook_course(target_course);
 for selection in select item from jsonb_array_elements(payload->'selections')item order by item->>'submissionId'loop
  -- Ordinary release takes this identity lock before its submission lock too.
  perform pg_advisory_xact_lock(hashtextextended(school::text||':release:'||(selection->>'markingId'),0));
  select*into source from app.submissions where school_id=school and id=(selection->>'submissionId')::uuid for update;
  select*into assessment from app.assessments where school_id=school and id=source.assessment_id;
  if source.id is null or assessment.course_id is distinct from target_course or not"authorization".current_submission_open(school,source.id)then raise exception 'Selected current release source denied'using errcode='42501';end if;
 end loop;
 reservation:=internal.begin_command(command_key,'gradebook.release',fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';end if;if reservation->>'state'<>'NEW'then raise exception 'Selected release in progress'using errcode='22023';end if;
 perform internal.preview_gradebook_release(target_course,payload->'selections');
 for selection in select item from jsonb_array_elements(payload->'selections')item order by item->>'submissionId'loop
  select*into source from app.submissions where school_id=school and id=(selection->>'submissionId')::uuid;
  select*into assessment from app.assessments where school_id=school and id=source.assessment_id;
  if assessment.model='rubric'then result_id:=internal.release_rubric_marking((selection->>'markingId')::uuid,(selection->>'expectedRevision')::integer,(selection->>'parentVisible')::boolean);else result_id:=internal.release_marking((selection->>'markingId')::uuid,(selection->>'expectedRevision')::integer,(selection->>'parentVisible')::boolean);end if;
  released:=internal.gradebook_native_cell(school,assessment.id,source.learner_id)->'releasedResult';
  perform internal.append_audit('result.release','result',result_id,request_id,'succeeded',jsonb_build_object('academic',true,'model',assessment.model,'selectedRelease',true));
  perform internal.enqueue_event(case when assessment.model='rubric'then'rubric.result.released'else'result.released'end,'result',result_id,(selection->>'expectedRevision')::integer,jsonb_build_object('learnerId',source.learner_id,'referenceId',assessment.academic_reference_id,'resultId',result_id,'evidenceId',released->'evidenceId','revision',(selection->>'expectedRevision')::integer,'policyVersion',assessment.policy_version),md5('gradebook-release:'||"authorization".actor_id()::text||':'||command_key||':'||result_id::text));
  items:=items||jsonb_build_array(released||jsonb_build_object('submissionId',source.id,'assessmentId',assessment.id,'learnerId',source.learner_id));
 end loop;
 receipt:=jsonb_build_object('id',target_course,'items',items);perform internal.finish_command(command_key,'gradebook.release',fingerprint,receipt);return receipt;
end$$;
revoke execute on function internal.require_gradebook_course(uuid),internal.gradebook_native_cell(uuid,uuid,uuid),internal.read_course_gradebook(uuid,integer,integer,uuid,uuid),internal.read_gradebook_source(uuid),internal.preview_gradebook_release(uuid,jsonb),internal.release_gradebook_selection(uuid,jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_course_gradebook(uuid,integer,integer,uuid,uuid),internal.read_gradebook_source(uuid),internal.preview_gradebook_release(uuid,jsonb),internal.release_gradebook_selection(uuid,jsonb,text,text,text)to cuevo_api;
commit;
