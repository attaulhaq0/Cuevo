begin;
create function internal.attention_comparison_current(signal app.attention_signal_revisions)returns boolean language plpgsql security definer set search_path=''as $$
declare policy app.attention_policies;recent app.result_revisions;baseline app.result_revisions;start_at timestamptz;
begin
 if not exists(select 1 from app.memberships member where member.school_id=signal.school_id and member.actor_id=signal.learner_id and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))then return false;end if;
 if signal.type<>'native_result_decline'then return true;end if;
 select*into policy from app.attention_policies where school_id=signal.school_id order by version desc limit 1;
 if policy.id is null or policy.version<>signal.policy_version then return false;end if;start_at:=clock_timestamp()-make_interval(days=>policy.window_days);
 -- A newly released but undelivered result invalidates the old comparison immediately.
 -- Read-time source checks never pretend the async worker has already projected that result.
 select r.*into recent from app.current_results current_result join app.result_revisions r on r.school_id=current_result.school_id and r.id=current_result.result_id
 join app.school_custom_references reference on reference.school_id=r.school_id and reference.id=r.reference_id
 join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
 join app.assessments assessment on assessment.school_id=r.school_id and assessment.id=r.assessment_id
 join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
 where r.school_id=signal.school_id and r.learner_id=signal.learner_id and r.max_score=policy.max_score and r.created_at>=start_at
 and version.source_type='SCHOOL_AUTHORED'and reference.status='APPROVED'and version.version=r.reference_version and course.status='PUBLISHED'
 and"authorization".programme_course_allowed(r.school_id,course.id,r.learner_id)
 and exists(select 1 from app.enrollments enrollment where enrollment.school_id=r.school_id and enrollment.class_id=course.class_id and enrollment.student_actor_id=r.learner_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now()))
 order by r.created_at desc,r.id desc limit 1;
 if recent.id is null or recent.id::text is distinct from signal.context->>'followUpResultId'then return false;end if;
 select r.*into baseline from app.current_results current_result join app.result_revisions r on r.school_id=current_result.school_id and r.id=current_result.result_id
 join app.assessments assessment on assessment.school_id=r.school_id and assessment.id=r.assessment_id
 join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
 where r.school_id=recent.school_id and r.learner_id=recent.learner_id and r.reference_id=recent.reference_id and r.reference_version=recent.reference_version
 and r.max_score=recent.max_score and r.assessment_id<>recent.assessment_id and r.created_at>=start_at and r.created_at<recent.created_at and course.status='PUBLISHED'
 and"authorization".programme_course_allowed(r.school_id,course.id,r.learner_id)
 and exists(select 1 from app.enrollments enrollment where enrollment.school_id=r.school_id and enrollment.class_id=course.class_id and enrollment.student_actor_id=r.learner_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now()))
 order by r.created_at desc,r.id desc limit 1;
 return baseline.id is not null and baseline.id::text=signal.context->>'baselineResultId'and baseline.score-recent.score>=policy.minimum_decline;
exception when others then return false;
end$$;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.attention_source_current(app.attention_signal_revisions)'::regprocedure);previous:=definition;
 definition:=replace(definition,'if not"authorization".can_view_person(signal.school_id,signal.learner_id)then return false;end if;',
  'if not"authorization".can_view_person(signal.school_id,signal.learner_id)or not internal.attention_comparison_current(signal)then return false;end if;');
 if definition=previous then raise exception 'Attention current-source guard shape changed'using errcode='22023';end if;execute definition;
 definition:=pg_get_functiondef('internal.refresh_attention_command(uuid,integer,text,text,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'expected_policy<>(select max(version)from app.attention_policies where school_id="authorization".school_id())',
  'expected_policy is distinct from(select max(version)from app.attention_policies where school_id="authorization".school_id())');
 if definition=previous then raise exception 'Attention policy version guard shape changed'using errcode='22023';end if;execute definition;
end$$;
revoke execute on function internal.attention_comparison_current(app.attention_signal_revisions)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
