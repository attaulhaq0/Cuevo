begin;
create function internal.attention_source_current(signal app.attention_signal_revisions)returns boolean language plpgsql security definer set search_path=''as $$
declare policy app.attention_policies;row_item jsonb;source app.result_revisions;a app.assessments;source_id uuid;
begin
 select*into policy from app.attention_policies where school_id=signal.school_id order by version desc limit 1;if policy.id is null or policy.version<>signal.policy_version or signal.generated_at<clock_timestamp()-make_interval(days=>policy.window_days)then return false;end if;
 if not"authorization".can_view_person(signal.school_id,signal.learner_id)then return false;end if;
 if signal.type='native_result_decline'then
  for source_id in select(value)::uuid from jsonb_array_elements_text(jsonb_build_array(signal.context->>'baselineResultId',signal.context->>'followUpResultId'))loop
   select*into source from app.result_revisions where school_id=signal.school_id and id=source_id and learner_id=signal.learner_id;
   if not found or not"authorization".can_read_academic_source(source.school_id,source.learner_id,source.parent_visible,source.assessment_id)or not exists(select 1 from app.current_results where school_id=source.school_id and result_id=source.id)then return false;end if;
  end loop;
 elsif signal.type='missing_due_work'then
  for row_item in select*from jsonb_array_elements(signal.context->'missingAssessments')loop
   select*into a from app.assessments where school_id=signal.school_id and id=(row_item->>'id')::uuid;
   if not found or not"authorization".can_read_course(a.school_id,a.course_id)or not"authorization".programme_course_allowed(a.school_id,a.course_id,signal.learner_id)or a.assignment_state<>'OPEN'or a.due_at>=clock_timestamp()or a.due_at<clock_timestamp()-make_interval(days=>policy.window_days)or(a.available_from is not null and a.available_from>clock_timestamp())or(a.available_until is not null and a.available_until<=clock_timestamp())or not exists(select 1 from app.courses course join app.enrollments enrollment on enrollment.school_id=course.school_id and enrollment.class_id=course.class_id join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id where course.school_id=a.school_id and course.id=a.course_id and enrollment.student_actor_id=signal.learner_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and member.status='active'and member.role='student'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))or exists(select 1 from app.submissions where school_id=a.school_id and assessment_id=a.id and learner_id=signal.learner_id)then return false;end if;
  end loop;
 end if;return true;
exception when others then return false;
end$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.read_attention_signals(integer,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'and"authorization".can_view_person(school,revision.learner_id)order by',
  'and"authorization".can_view_person(school,revision.learner_id)and internal.attention_source_current(revision)order by');
 execute definition;
 definition:=pg_get_functiondef('internal.refresh_native_attention(uuid,uuid)'::regprocedure);
 definition:=replace(definition,
  'select coalesce(jsonb_agg(jsonb_build_object(''id'',a.id,''title'',a.title,''dueAt'',a.due_at)order by a.due_at,a.id),''[]''::jsonb)into missing_rows from app.assessments a',
  'select coalesce(jsonb_agg(missing_row order by due_at,assessment_id),''[]''::jsonb)into missing_rows from(select a.id assessment_id,a.due_at,jsonb_build_object(''id'',a.id,''title'',a.title,''dueAt'',a.due_at)missing_row from app.assessments a');
 definition:=replace(definition,
  's.assessment_id=a.id and s.learner_id=target_learner);',
  's.assessment_id=a.id and s.learner_id=target_learner)order by a.due_at,a.id limit 101)bounded_missing;');
 execute definition;
end$$;
revoke execute on function internal.attention_source_current(app.attention_signal_revisions)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
