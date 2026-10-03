begin;
-- Legacy assessments stay published. Customer preparation creates a closed draft.
do $$declare item record;begin
 for item in select conname from pg_constraint where conrelid='app.assessments'::regclass and contype='c'and pg_get_constraintdef(oid)like'%status%'loop execute format('alter table app.assessments drop constraint %I',item.conname);end loop;
end$$;
alter table app.assessments add check(status in('DRAFT','PUBLISHED'));
alter table app.assessments add column preparation_version integer not null default 1 check(preparation_version>0);
alter table app.assessments add column intended_submission_kind text not null default'TEXT'check(intended_submission_kind in('TEXT','QUIZ'));
alter table app.assessments add column intended_model text not null default'numeric'check(intended_model in('numeric','rubric'));
update app.assessments set intended_submission_kind=submission_kind,intended_model=model;
alter table app.assessments add check(status<>'DRAFT'or assignment_state='CLOSED');
drop policy assessments_read on app.assessments;
create policy assessments_read on app.assessments for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment')and"authorization".can_read_course(school_id,course_id)and(status='PUBLISHED'or"authorization".can_manage_course(school_id,course_id)));
create function internal.prepare_assessment(target uuid,title_value text,instruction_value text,due_value timestamptz,maximum numeric,reference_value uuid,rubric_value uuid,expected integer)returns uuid language plpgsql security definer set search_path=''as $$
declare a app.assessments;begin
 perform internal.lock_academic_course("authorization".school_id(),"authorization".assessment_course("authorization".school_id(),target));
 select*into a from app.assessments where school_id="authorization".school_id()and id=target for update;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".academic_access(a.school_id)or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Assessment preparation denied'using errcode='42501';end if;
 if a.status<>'DRAFT'or expected is null or expected<>a.preparation_version or exists(select 1 from app.submissions where school_id=a.school_id and assessment_id=a.id)or maximum is null or maximum<=0 or maximum>100000 or length(btrim(title_value))not between 1 and 200 or length(btrim(instruction_value))not between 1 and 10000 then raise exception 'Assessment preparation changed'using errcode='22023';end if;
 if reference_value is not null and reference_value is distinct from a.academic_reference_id then perform internal.link_assessment_reference(a.id,reference_value,a.policy_version);end if;
 select*into a from app.assessments where school_id=a.school_id and id=a.id;
 if a.intended_model='rubric'and rubric_value is not null and rubric_value is distinct from(select rubric_id from app.assessment_rubrics where school_id=a.school_id and assessment_id=a.id)then perform internal.configure_assessment_rubric(a.id,rubric_value,a.policy_version);end if;
 if a.intended_model='numeric'and rubric_value is not null then raise exception 'Numeric preparation cannot configure a rubric'using errcode='22023';end if;
 update app.assessments set title=title_value,instructions=instruction_value,due_at=due_value,max_score=maximum,preparation_version=preparation_version+1 where school_id=a.school_id and id=a.id;return a.id;
end$$;
create function internal.publish_prepared_assessment(target uuid,expected_preparation integer,expected_policy integer,expected_availability integer)returns uuid language plpgsql security definer set search_path=''as $$
declare a app.assessments;begin
 perform internal.lock_academic_course("authorization".school_id(),"authorization".assessment_course("authorization".school_id(),target));
 select*into a from app.assessments where school_id="authorization".school_id()and id=target for update;
 if not found or not"authorization".academic_access(a.school_id)or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Assessment publication denied'using errcode='42501';end if;
 if a.status<>'DRAFT'or a.preparation_version is distinct from expected_preparation or a.policy_version is distinct from expected_policy or a.availability_version is distinct from expected_availability or a.model<>a.intended_model or not exists(select 1 from app.courses where school_id=a.school_id and id=a.course_id and status='PUBLISHED')or not exists(select 1 from app.school_custom_references where school_id=a.school_id and id=a.academic_reference_id and status='APPROVED')or(a.intended_model='rubric'and not exists(select 1 from app.assessment_rubrics where school_id=a.school_id and assessment_id=a.id))or(a.intended_submission_kind='QUIZ'and not exists(select 1 from app.published_quizzes where school_id=a.school_id and assessment_id=a.id))or(a.intended_submission_kind='TEXT'and a.submission_kind<>'TEXT')or exists(select 1 from app.submissions where school_id=a.school_id and assessment_id=a.id)then raise exception 'Assessment configuration requires review'using errcode='22023';end if;
 update app.assessments set status='PUBLISHED',assignment_state='OPEN',availability_version=availability_version+1,preparation_version=preparation_version+1 where school_id=a.school_id and id=a.id;return a.id;
end$$;
-- Repeat publication at every source boundary, rather than relying on hiding the draft.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.require_assessment_available(uuid)'::regprocedure);anchor:='if a.assignment_state<>''OPEN''';if position(anchor in definition)=0 then raise exception 'Assessment availability source changed'using errcode='22023';end if;execute replace(definition,anchor,'if a.status<>''PUBLISHED''or a.assignment_state<>''OPEN''');
 definition:=pg_get_functiondef('"authorization".can_submit_assessment(uuid,uuid)'::regprocedure);anchor:='and a.assignment_state=''OPEN''';if position(anchor in definition)=0 then raise exception 'Assessment submit source changed'using errcode='22023';end if;execute replace(definition,anchor,'and a.status=''PUBLISHED''and a.assignment_state=''OPEN''');
 definition:=pg_get_functiondef('internal.read_own_assessment_submissions(uuid[])'::regprocedure);anchor:='a.id=id and a.course_id=any(permitted_courses)';if position(anchor in definition)=0 then raise exception 'Assessment own source changed'using errcode='22023';end if;execute replace(definition,anchor,'a.id=id and a.status=''PUBLISHED''and a.course_id=any(permitted_courses)');
end$$;
create function internal.submission_published_assessment()returns trigger language plpgsql security definer set search_path=''as $$begin
 if not exists(select 1 from app.assessments where school_id=new.school_id and id=new.assessment_id and status='PUBLISHED')then raise exception 'Published assessment required'using errcode='22023';end if;return new;
end$$;
create trigger submission_published_assessment before insert on app.submissions for each row execute function internal.submission_published_assessment();
-- The learner's recorded attempt uses its immutable question version after closure.
create or replace function internal.read_published_quiz(target_assessment uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare q app.quiz_versions;a app.assessments;attempt app.quiz_attempts;safe_questions jsonb;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment;
 if not found or a.status<>'PUBLISHED'or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_read_course(a.school_id,a.course_id)or"authorization".current_role(a.school_id)='parent'then raise exception 'Quiz read denied'using errcode='42501';end if;
 if"authorization".current_role(a.school_id)='student'then select*into attempt from app.quiz_attempts where school_id=a.school_id and assessment_id=a.id and learner_id="authorization".actor_id();if not found then perform internal.require_assessment_available(a.id);else if not"authorization".can_learn_course(a.school_id,a.course_id)then raise exception 'Quiz history denied'using errcode='42501';end if;end if;end if;
 if attempt.id is not null then select*into q from app.quiz_versions where school_id=a.school_id and id=attempt.quiz_id and assessment_id=a.id;else select qv.*into q from app.published_quizzes pq join app.quiz_versions qv on qv.school_id=pq.school_id and qv.id=pq.quiz_id where pq.school_id=a.school_id and pq.assessment_id=a.id;end if;
 if q.id is null then raise exception 'Published quiz unavailable'using errcode='22023';end if;
 select jsonb_agg(item-'correctOptionKey'order by ordinal)into safe_questions from jsonb_array_elements(q.questions)with ordinality value(item,ordinal);
 return jsonb_build_object('id',q.id,'assessmentId',a.id,'version',q.version,'questions',safe_questions,'policyVersion',a.policy_version);
end$$;
-- New lifecycle events are validated and acknowledged through the existing restricted worker.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.process_learner_event(uuid,uuid)'::regprocedure);anchor:='begin';if position(anchor in definition)=0 then raise exception 'Worker source dispatch changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'begin'||chr(10)||' if exists(select 1 from internal.outbox_events event where event.id=target_event and event.type in(''assessment.preparation'',''assessment.publish''))then select*into e from internal.outbox_events where id=target_event for update;if e.state<>''PROCESSING''or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()or e.entity_type<>''assessment''or not exists(select 1 from app.assessments where school_id=e.school_id and id=e.entity_id)then raise exception ''Invalid assessment lifecycle source''using errcode=''22023'';end if;insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception ''Assessment acknowledgement lease changed''using errcode=''22023'';end if;return jsonb_build_object(''status'',''ACKNOWLEDGED'');end if;'||chr(10));execute definition;
end$$;
revoke execute on function internal.prepare_assessment(uuid,text,text,timestamptz,numeric,uuid,uuid,integer),internal.publish_prepared_assessment(uuid,integer,integer,integer),internal.submission_published_assessment()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.prepare_assessment(uuid,text,text,timestamptz,numeric,uuid,uuid,integer),internal.publish_prepared_assessment(uuid,integer,integer,integer)to cuevo_api;
revoke execute on function internal.read_published_quiz(uuid)from public,anon,authenticated,service_role,cuevo_worker;
grant execute on function internal.read_published_quiz(uuid)to cuevo_api;
commit;
