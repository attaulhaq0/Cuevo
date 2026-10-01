-- Genuine submission lifecycle and teacher-authored single-choice quizzes; no grade release.
begin;
alter table app.assessments add column available_from timestamptz;
alter table app.assessments add column available_until timestamptz;
alter table app.assessments add column allow_late boolean not null default true;
alter table app.assessments add column assignment_state text not null default'OPEN'check(assignment_state in('OPEN','CLOSED'));
alter table app.assessments add column availability_version integer not null default 1 check(availability_version>0);
alter table app.assessments add column submission_kind text not null default'TEXT'check(submission_kind in('TEXT','QUIZ'));
alter table app.assessments add check(available_from is null or available_until is null or available_from<available_until);
create function internal.require_assessment_available(target_assessment uuid)returns void language plpgsql security definer set search_path=''as $$declare a app.assessments;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for share;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_learn_course(a.school_id,a.course_id)then raise exception 'Assignment denied'using errcode='42501';end if;
 if a.assignment_state<>'OPEN'or(a.available_from is not null and a.available_from>clock_timestamp())or(a.available_until is not null and a.available_until<=clock_timestamp())or(not a.allow_late and a.due_at is not null and a.due_at<clock_timestamp())then raise exception 'Assignment unavailable'using errcode='22023';end if;
end$$;
alter table app.submissions add column previous_submission_id uuid;
alter table app.submissions add column return_id uuid;
do $$declare item record;begin
 for item in select conname,contype,pg_get_constraintdef(oid)definition from pg_constraint where conrelid='app.submissions'::regclass loop
  if(item.contype='c'and(item.definition like'%revision%'or item.definition like'%status%'))or(item.contype='u'and item.definition='UNIQUE (school_id, assessment_id, learner_id)')then execute format('alter table app.submissions drop constraint %I',item.conname);end if;
 end loop;
end$$;
alter table app.submissions add check(revision>0);
alter table app.submissions add check(status in('SUBMITTED','RESUBMITTED'));
alter table app.submissions add unique(school_id,assessment_id,learner_id,revision);
alter table app.submissions add unique(school_id,id,assessment_id,learner_id);
alter table app.submissions add foreign key(school_id,previous_submission_id,learner_id)references app.submissions(school_id,id,learner_id);
create table app.submission_returns(
 school_id uuid not null,id uuid not null default gen_random_uuid(),submission_id uuid not null,assessment_id uuid not null,learner_id uuid not null,source_revision integer not null check(source_revision>0),feedback text not null check(length(btrim(feedback))between 1 and 10000),actor_id uuid not null,created_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,submission_id),unique(school_id,id,submission_id,learner_id),foreign key(school_id,submission_id,assessment_id,learner_id)references app.submissions(school_id,id,assessment_id,learner_id),foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
alter table app.submissions add foreign key(school_id,return_id,previous_submission_id,learner_id)references app.submission_returns(school_id,id,submission_id,learner_id);
alter table app.submissions add check((revision=1 and previous_submission_id is null and return_id is null and status='SUBMITTED')or(revision>1 and previous_submission_id is not null and return_id is not null and status='RESUBMITTED'));
create table app.current_submissions(
 school_id uuid not null,assessment_id uuid not null,learner_id uuid not null,submission_id uuid not null,state text not null check(state in('SUBMITTED','RETURNED','RESUBMITTED','CLOSED')),updated_at timestamptz not null default clock_timestamp(),primary key(school_id,assessment_id,learner_id),foreign key(school_id,submission_id,assessment_id,learner_id)references app.submissions(school_id,id,assessment_id,learner_id)
);
insert into app.current_submissions(school_id,assessment_id,learner_id,submission_id,state)select school_id,assessment_id,learner_id,id,status from app.submissions;
create table app.submission_drafts(
 school_id uuid not null,id uuid not null default gen_random_uuid(),assessment_id uuid not null,learner_id uuid not null,content text not null check(length(content)<=50000),revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,assessment_id,learner_id),foreign key(school_id,assessment_id)references app.assessments(school_id,id),foreign key(school_id,learner_id)references app.memberships(school_id,actor_id)
);
create table app.submission_closures(
 school_id uuid not null,id uuid not null default gen_random_uuid(),submission_id uuid not null,learner_id uuid not null,actor_id uuid not null,created_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,submission_id),foreign key(school_id,submission_id,learner_id)references app.submissions(school_id,id,learner_id),foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
create function "authorization".current_submission_open(target_school uuid,target_submission uuid)returns boolean language sql stable security definer set search_path=''as $$select coalesce("authorization".can_mark_submission(target_school,target_submission)and exists(select 1 from app.current_submissions c where c.school_id=target_school and c.submission_id=target_submission and c.state in('SUBMITTED','RESUBMITTED')),false)$$;
create function internal.configure_assessment_availability(target_assessment uuid,starts_at timestamptz,ends_at timestamptz,accept_late boolean,target_state text,expected_version integer)returns uuid language plpgsql security definer set search_path=''as $$declare a app.assessments;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for update;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Availability denied'using errcode='42501';end if;
 if accept_late is null or target_state is null or target_state not in('OPEN','CLOSED')or expected_version is null or expected_version<>a.availability_version or(starts_at is not null and ends_at is not null and starts_at>=ends_at)then raise exception 'Invalid availability version'using errcode='22023';end if;
 update app.assessments set available_from=starts_at,available_until=ends_at,allow_late=accept_late,assignment_state=target_state,availability_version=availability_version+1 where school_id=a.school_id and id=a.id;return a.id;
end$$;
create function internal.save_submission_draft(target_assessment uuid,draft_content text,expected_revision integer)returns uuid language plpgsql security definer set search_path=''as $$declare existing app.submission_drafts;did uuid;begin
 perform internal.require_assessment_available(target_assessment);perform pg_advisory_xact_lock(hashtextextended("authorization".school_id()::text||':submission:'||target_assessment::text||':'||"authorization".actor_id()::text,0));
 if exists(select 1 from app.current_submissions where school_id="authorization".school_id()and assessment_id=target_assessment and learner_id="authorization".actor_id()and state<>'RETURNED')or not exists(select 1 from app.assessments where school_id="authorization".school_id()and id=target_assessment and submission_kind='TEXT')then raise exception 'Draft source unavailable'using errcode='22023';end if;
 select*into existing from app.submission_drafts where school_id="authorization".school_id()and assessment_id=target_assessment and learner_id="authorization".actor_id()for update;
 if expected_revision is null or expected_revision<>coalesce(existing.revision,0)or draft_content is null or length(draft_content)>50000 then raise exception 'Draft changed'using errcode='22023';end if;
 insert into app.submission_drafts(school_id,assessment_id,learner_id,content,revision)values("authorization".school_id(),target_assessment,"authorization".actor_id(),draft_content,1)on conflict(school_id,assessment_id,learner_id)do update set content=excluded.content,revision=app.submission_drafts.revision+1,updated_at=clock_timestamp()returning id into did;return did;
end$$;
create function internal.create_learning_submission(target_assessment uuid,submission_content text)returns uuid language plpgsql security definer set search_path=''as $$declare sid uuid;begin
 perform internal.require_assessment_available(target_assessment);perform pg_advisory_xact_lock(hashtextextended("authorization".school_id()::text||':submission:'||target_assessment::text||':'||"authorization".actor_id()::text,0));
 if exists(select 1 from app.current_submissions where school_id="authorization".school_id()and assessment_id=target_assessment and learner_id="authorization".actor_id())or not exists(select 1 from app.assessments where school_id="authorization".school_id()and id=target_assessment and submission_kind='TEXT')then raise exception 'Initial submission source unavailable'using errcode='22023';end if;
 insert into app.submissions(school_id,assessment_id,learner_id,content)values("authorization".school_id(),target_assessment,"authorization".actor_id(),submission_content)returning id into sid;return sid;
end$$;
create function internal.return_learning_submission(target_submission uuid,return_feedback text,expected_revision integer)returns uuid language plpgsql security definer set search_path=''as $$declare s app.submissions;c app.current_submissions;rid uuid;begin
 if not"authorization".current_submission_open("authorization".school_id(),target_submission)then raise exception 'Return denied'using errcode='42501';end if;
 select*into s from app.submissions where school_id="authorization".school_id()and id=target_submission for update;select*into c from app.current_submissions where school_id=s.school_id and assessment_id=s.assessment_id and learner_id=s.learner_id for update;
 if c.submission_id<>s.id or c.state not in('SUBMITTED','RESUBMITTED')or expected_revision is null or expected_revision<>s.revision or return_feedback is null or length(btrim(return_feedback))not between 1 and 10000 or not exists(select 1 from app.assessments where school_id=s.school_id and id=s.assessment_id and submission_kind='TEXT')then raise exception 'Return source changed'using errcode='22023';end if;
 insert into app.submission_returns(school_id,submission_id,assessment_id,learner_id,source_revision,feedback,actor_id)values(s.school_id,s.id,s.assessment_id,s.learner_id,s.revision,return_feedback,"authorization".actor_id())returning id into rid;
 update app.current_submissions set state='RETURNED',updated_at=clock_timestamp()where school_id=s.school_id and assessment_id=s.assessment_id and learner_id=s.learner_id;return rid;
end$$;
create function internal.resubmit_learning_submission(prior_submission uuid,target_return uuid,submission_content text,expected_revision integer)returns uuid language plpgsql security definer set search_path=''as $$declare s app.submissions;c app.current_submissions;r app.submission_returns;sid uuid;begin
 select*into s from app.submissions where school_id="authorization".school_id()and id=prior_submission for update;
 if not found or s.learner_id<>"authorization".actor_id()then raise exception 'Resubmission denied'using errcode='42501';end if;perform internal.require_assessment_available(s.assessment_id);
 select*into c from app.current_submissions where school_id=s.school_id and assessment_id=s.assessment_id and learner_id=s.learner_id for update;select*into r from app.submission_returns where school_id=s.school_id and id=target_return;
 if c.submission_id<>s.id or c.state<>'RETURNED'or r.id is null or r.submission_id<>s.id or r.learner_id<>s.learner_id or r.source_revision<>s.revision or expected_revision is null or expected_revision<>s.revision or r.created_at>clock_timestamp()then raise exception 'Feedback source changed'using errcode='22023';end if;
 insert into app.submissions(school_id,assessment_id,learner_id,content,revision,status,previous_submission_id,return_id)values(s.school_id,s.assessment_id,s.learner_id,submission_content,s.revision+1,'RESUBMITTED',s.id,r.id)returning id into sid;return sid;
end$$;
create function internal.close_learning_submission(target_submission uuid,expected_revision integer)returns uuid language plpgsql security definer set search_path=''as $$declare s app.submissions;c app.current_submissions;cid uuid;begin
 if not"authorization".current_submission_open("authorization".school_id(),target_submission)then raise exception 'Close denied'using errcode='42501';end if;
 select*into s from app.submissions where school_id="authorization".school_id()and id=target_submission for update;select*into c from app.current_submissions where school_id=s.school_id and assessment_id=s.assessment_id and learner_id=s.learner_id for update;
 if c.submission_id<>s.id or expected_revision is null or expected_revision<>s.revision then raise exception 'Close source changed'using errcode='22023';end if;
 insert into app.submission_closures(school_id,submission_id,learner_id,actor_id)values(s.school_id,s.id,s.learner_id,"authorization".actor_id())returning id into cid;update app.current_submissions set state='CLOSED',updated_at=clock_timestamp()where school_id=s.school_id and assessment_id=s.assessment_id and learner_id=s.learner_id;return cid;
end$$;
-- Academic inserts serialize with current-source transitions; historical reads retain their old scope.
create function internal.current_submission_academic_guard()returns trigger language plpgsql security definer set search_path=''as $$declare c app.current_submissions;begin
 select*into c from app.current_submissions where school_id=new.school_id and submission_id=new.submission_id for update;
 if not found or c.state not in('SUBMITTED','RESUBMITTED')or not"authorization".can_mark_submission(new.school_id,new.submission_id)then raise exception 'Current submitted source required for academic write'using errcode='22023';end if;return new;
end$$;
create trigger current_submission_academic_guard before insert on app.marking_revisions for each row execute function internal.current_submission_academic_guard();
create trigger current_submission_academic_guard before insert on app.result_revisions for each row execute function internal.current_submission_academic_guard();
create trigger current_submission_academic_guard before insert on app.rubric_marking_revisions for each row execute function internal.current_submission_academic_guard();
create trigger current_submission_academic_guard before insert on app.rubric_result_revisions for each row execute function internal.current_submission_academic_guard();
-- Every source insertion, including trusted fixtures, advances one current pointer without rewriting history.
create function internal.submission_source_current()returns trigger language plpgsql security definer set search_path=''as $$declare current_source app.current_submissions;prior app.submissions;r app.submission_returns;begin
 perform pg_advisory_xact_lock(hashtextextended(new.school_id::text||':submission:'||new.assessment_id::text||':'||new.learner_id::text,0));
 select*into current_source from app.current_submissions where school_id=new.school_id and assessment_id=new.assessment_id and learner_id=new.learner_id for update;
 if new.revision=1 then if current_source.submission_id is not null then raise exception 'Initial source exists'using errcode='22023';end if;
 else
  select*into prior from app.submissions where school_id=new.school_id and id=new.previous_submission_id;select*into r from app.submission_returns where school_id=new.school_id and id=new.return_id;
  if current_source.submission_id is distinct from prior.id or current_source.state<>'RETURNED'or prior.id is null or prior.assessment_id<>new.assessment_id or prior.learner_id<>new.learner_id or new.revision<>prior.revision+1 or r.submission_id is distinct from prior.id or r.learner_id<>new.learner_id then raise exception 'Invalid immutable source progression'using errcode='22023';end if;
 end if;
 insert into app.current_submissions(school_id,assessment_id,learner_id,submission_id,state)values(new.school_id,new.assessment_id,new.learner_id,new.id,new.status)on conflict(school_id,assessment_id,learner_id)do update set submission_id=excluded.submission_id,state=excluded.state,updated_at=clock_timestamp();
 delete from app.submission_drafts where school_id=new.school_id and assessment_id=new.assessment_id and learner_id=new.learner_id;return new;
end$$;
create trigger submission_source_current after insert on app.submissions for each row execute function internal.submission_source_current();
create function internal.valid_quiz_questions(value jsonb)returns boolean language plpgsql immutable set search_path=''as $$declare q jsonb;option jsonb;begin
 if value is null or jsonb_typeof(value)<>'array'or jsonb_array_length(value)not between 1 and 30 or octet_length(value::text)>300000 or(select count(distinct item->>'key')from jsonb_array_elements(value)item)<>jsonb_array_length(value)then return false;end if;
 for q in select*from jsonb_array_elements(value)loop
  if jsonb_typeof(q)<>'object'or not(q?&array['key','prompt','options','correctOptionKey'])or q-array['key','prompt','options','correctOptionKey']<>'{}'::jsonb or jsonb_typeof(q->'key')<>'string'or q->>'key'!~'^[A-Za-z0-9_.:-]{1,100}$'or jsonb_typeof(q->'prompt')<>'string'or length(btrim(q->>'prompt'))not between 1 and 4000 or jsonb_typeof(q->'options')<>'array'or jsonb_array_length(q->'options')not between 2 and 10 or jsonb_typeof(q->'correctOptionKey')<>'string'then return false;end if;
  if(select count(distinct item->>'key')from jsonb_array_elements(q->'options')item)<>jsonb_array_length(q->'options')or not exists(select 1 from jsonb_array_elements(q->'options')item where item->>'key'=q->>'correctOptionKey')then return false;end if;
  for option in select*from jsonb_array_elements(q->'options')loop
   if jsonb_typeof(option)<>'object'or not(option?&array['key','label'])or option-array['key','label']<>'{}'::jsonb or jsonb_typeof(option->'key')<>'string'or option->>'key'!~'^[A-Za-z0-9_.:-]{1,100}$'or jsonb_typeof(option->'label')<>'string'or length(btrim(option->>'label'))not between 1 and 2000 then return false;end if;
  end loop;
 end loop;return true;
exception when others then return false;
end$$;
create table app.quiz_versions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),assessment_id uuid not null,version text not null check(length(btrim(version))between 1 and 100),questions jsonb not null check(internal.valid_quiz_questions(questions)),created_by uuid not null,created_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,assessment_id,version),unique(school_id,id,assessment_id),foreign key(school_id,assessment_id)references app.assessments(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id)
);
create table app.published_quizzes(
 school_id uuid not null,assessment_id uuid not null,quiz_id uuid not null,published_by uuid not null,published_at timestamptz not null default clock_timestamp(),primary key(school_id,assessment_id),foreign key(school_id,quiz_id,assessment_id)references app.quiz_versions(school_id,id,assessment_id),foreign key(school_id,published_by)references app.memberships(school_id,actor_id)
);
create table app.quiz_attempts(
 school_id uuid not null,id uuid not null default gen_random_uuid(),quiz_id uuid not null,assessment_id uuid not null,learner_id uuid not null,submission_id uuid not null,answers jsonb not null,checked_answers jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,quiz_id,learner_id),foreign key(school_id,quiz_id,assessment_id)references app.quiz_versions(school_id,id,assessment_id),foreign key(school_id,submission_id,assessment_id,learner_id)references app.submissions(school_id,id,assessment_id,learner_id),check(jsonb_typeof(answers)='array'and jsonb_typeof(checked_answers)='array'and jsonb_array_length(answers)between 1 and 30)
);
create function internal.create_quiz_version(target_assessment uuid,quiz_version text,questions jsonb)returns uuid language plpgsql security definer set search_path=''as $$declare a app.assessments;qid uuid;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for update;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Quiz author denied'using errcode='42501';end if;
 if not internal.valid_quiz_questions(questions)or exists(select 1 from app.submissions where school_id=a.school_id and assessment_id=a.id)then raise exception 'Quiz version unavailable'using errcode='22023';end if;
 insert into app.quiz_versions(school_id,assessment_id,version,questions,created_by)values(a.school_id,a.id,quiz_version,questions,"authorization".actor_id())returning id into qid;return qid;
end$$;
create function internal.publish_quiz_version(target_assessment uuid,target_quiz uuid,expected_policy integer)returns uuid language plpgsql security definer set search_path=''as $$declare a app.assessments;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for update;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Quiz publish denied'using errcode='42501';end if;
 if expected_policy is null or expected_policy<>a.policy_version or not exists(select 1 from app.quiz_versions where school_id=a.school_id and id=target_quiz and assessment_id=a.id)or exists(select 1 from app.submissions where school_id=a.school_id and assessment_id=a.id)then raise exception 'Quiz source frozen or changed'using errcode='22023';end if;
 insert into app.published_quizzes(school_id,assessment_id,quiz_id,published_by)values(a.school_id,a.id,target_quiz,"authorization".actor_id())on conflict(school_id,assessment_id)do update set quiz_id=excluded.quiz_id,published_by=excluded.published_by,published_at=clock_timestamp();
 update app.assessments set submission_kind='QUIZ',policy_version=policy_version+1 where school_id=a.school_id and id=a.id;return target_quiz;
end$$;
create function internal.read_published_quiz(target_assessment uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare q app.quiz_versions;a app.assessments;safe_questions jsonb;begin
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment;
 if not found or not"authorization".has_entitlement(a.school_id,'assessment')or not"authorization".can_read_course(a.school_id,a.course_id)or"authorization".current_role(a.school_id)='parent'then raise exception 'Quiz read denied'using errcode='42501';end if;
 if"authorization".current_role(a.school_id)='student'then perform internal.require_assessment_available(a.id);end if;
 select qv.*into q from app.published_quizzes pq join app.quiz_versions qv on qv.school_id=pq.school_id and qv.id=pq.quiz_id where pq.school_id=a.school_id and pq.assessment_id=a.id;
 if q.id is null then raise exception 'Published quiz unavailable'using errcode='22023';end if;
 select jsonb_agg(item-'correctOptionKey'order by ordinal)into safe_questions from jsonb_array_elements(q.questions)with ordinality value(item,ordinal);
 return jsonb_build_object('id',q.id,'assessmentId',a.id,'version',q.version,'questions',safe_questions,'policyVersion',a.policy_version);
end$$;
create function internal.submit_quiz_attempt(target_assessment uuid,target_quiz uuid,submitted_answers jsonb)returns uuid language plpgsql security definer set search_path=''as $$
declare q app.quiz_versions;a app.assessments;question jsonb;answer jsonb;chosen jsonb;checked jsonb:='[]';source_answers jsonb:='[]';sid uuid;aid uuid;
begin
 perform internal.require_assessment_available(target_assessment);perform pg_advisory_xact_lock(hashtextextended("authorization".school_id()::text||':submission:'||target_assessment::text||':'||"authorization".actor_id()::text,0));
 select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for share;
 select qv.*into q from app.published_quizzes pq join app.quiz_versions qv on qv.school_id=pq.school_id and qv.id=pq.quiz_id where pq.school_id=a.school_id and pq.assessment_id=a.id;
 if q.id is null or q.id is distinct from target_quiz or a.submission_kind<>'QUIZ'or exists(select 1 from app.current_submissions where school_id=a.school_id and assessment_id=a.id and learner_id="authorization".actor_id())then raise exception 'Quiz attempt source changed'using errcode='22023';end if;
 if submitted_answers is null or jsonb_typeof(submitted_answers)<>'array'or jsonb_array_length(submitted_answers)<>jsonb_array_length(q.questions)or(select count(distinct item->>'questionKey')from jsonb_array_elements(submitted_answers)item)<>jsonb_array_length(submitted_answers)then raise exception 'Complete unique quiz answers required'using errcode='22023';end if;
 for question in select*from jsonb_array_elements(q.questions)loop
  select item into answer from jsonb_array_elements(submitted_answers)item where item->>'questionKey'=question->>'key';
  if answer is null or jsonb_typeof(answer)<>'object'or not(answer?&array['questionKey','optionKey'])or answer-array['questionKey','optionKey']<>'{}'::jsonb or jsonb_typeof(answer->'questionKey')<>'string'or jsonb_typeof(answer->'optionKey')<>'string'then raise exception 'Explicit question answer required'using errcode='22023';end if;
  select item into chosen from jsonb_array_elements(question->'options')item where item->>'key'=answer->>'optionKey';if chosen is null then raise exception 'Allowed answer option required'using errcode='22023';end if;
  checked:=checked||jsonb_build_array(jsonb_build_object('questionKey',question->>'key','optionKey',answer->>'optionKey','status',case when answer->>'optionKey'=question->>'correctOptionKey'then'CORRECT'else'INCORRECT'end));
  source_answers:=source_answers||jsonb_build_array(jsonb_build_object('questionKey',question->>'key','prompt',question->>'prompt','selectedOptionKey',chosen->>'key','selectedOptionLabel',chosen->>'label'));
 end loop;
 insert into app.submissions(school_id,assessment_id,learner_id,content)values(a.school_id,a.id,"authorization".actor_id(),jsonb_build_object('type','QUIZ_ANSWERS','quizId',q.id,'quizVersion',q.version,'answers',source_answers)::text)returning id into sid;
 insert into app.quiz_attempts(school_id,quiz_id,assessment_id,learner_id,submission_id,answers,checked_answers)values(a.school_id,q.id,a.id,"authorization".actor_id(),sid,submitted_answers,checked)returning id into aid;return aid;
end$$;
-- RLS repeat availability independently of controller hiding. The helper is intentionally narrow.
create function "authorization".can_submit_assessment(target_school uuid,target_assessment uuid)returns boolean language plpgsql stable security definer set search_path=''as $$declare a app.assessments;begin
 select*into a from app.assessments where school_id=target_school and id=target_assessment;
 return coalesce("authorization".has_entitlement(target_school,'assessment')and"authorization".can_learn_course(target_school,a.course_id)and a.assignment_state='OPEN'and(a.available_from is null or a.available_from<=now())and(a.available_until is null or a.available_until>now())and(a.allow_late or a.due_at is null or a.due_at>=now()),false);
end$$;
drop policy submissions_insert on app.submissions;
create policy submissions_insert on app.submissions for insert to cuevo_api with check(learner_id="authorization".actor_id()and"authorization".can_submit_assessment(school_id,assessment_id));
create function internal.learning_submission_kind_frozen()returns trigger language plpgsql set search_path=''as $$begin
 if new.submission_kind is distinct from old.submission_kind and exists(select 1 from app.submissions where school_id=old.school_id and assessment_id=old.id)then raise exception 'Used submission kind immutable'using errcode='55000';end if;return new;
end$$;
create trigger submission_kind_frozen before update on app.assessments for each row execute function internal.learning_submission_kind_frozen();
do $$declare tab text;begin
 foreach tab in array array['current_submissions','submission_drafts','submission_returns','submission_closures','quiz_versions','published_quizzes','quiz_attempts']loop execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);end loop;
 foreach tab in array array['submission_returns','submission_closures','quiz_versions','quiz_attempts']loop execute format('create trigger source_history_immutable before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);end loop;
 foreach tab in array array['submission_returns','submission_closures','quiz_versions','quiz_attempts','current_submissions','published_quizzes']loop execute format('create trigger source_no_truncate before truncate on app.%I for each statement execute function internal.academic_history_immutable()',tab);end loop;
end$$;
create policy current_submissions_read on app.current_submissions for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment')and("authorization".can_manage_course(school_id,"authorization".assessment_course(school_id,assessment_id))or(learner_id="authorization".actor_id()and"authorization".can_learn_course(school_id,"authorization".assessment_course(school_id,assessment_id)))));
create policy drafts_read on app.submission_drafts for select to cuevo_api using(learner_id="authorization".actor_id()and"authorization".can_submit_assessment(school_id,assessment_id));
create policy returns_read on app.submission_returns for select to cuevo_api using("authorization".can_mark_submission(school_id,submission_id)or(learner_id="authorization".actor_id()and"authorization".can_learn_course(school_id,"authorization".assessment_course(school_id,assessment_id))));
create policy closures_read on app.submission_closures for select to cuevo_api using("authorization".can_mark_submission(school_id,submission_id)or(learner_id="authorization".actor_id()and"authorization".can_view_person(school_id,learner_id)));
create policy quizzes_author_read on app.quiz_versions for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment')and"authorization".can_manage_course(school_id,"authorization".assessment_course(school_id,assessment_id)));
create policy published_quizzes_read on app.published_quizzes for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment')and"authorization".can_read_course(school_id,"authorization".assessment_course(school_id,assessment_id))and"authorization".current_role(school_id)<>'parent');
create policy quiz_attempt_read on app.quiz_attempts for select to cuevo_api using("authorization".can_mark_submission(school_id,submission_id)or(learner_id="authorization".actor_id()and"authorization".can_learn_course(school_id,"authorization".assessment_course(school_id,assessment_id))));
revoke all on app.current_submissions,app.submission_drafts,app.submission_returns,app.submission_closures,app.quiz_versions,app.published_quizzes,app.quiz_attempts from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant select on app.current_submissions,app.submission_drafts,app.submission_returns,app.submission_closures,app.quiz_versions,app.published_quizzes,app.quiz_attempts to cuevo_api;
revoke execute on function internal.require_assessment_available(uuid),internal.configure_assessment_availability(uuid,timestamptz,timestamptz,boolean,text,integer),internal.save_submission_draft(uuid,text,integer),internal.create_learning_submission(uuid,text),internal.return_learning_submission(uuid,text,integer),internal.resubmit_learning_submission(uuid,uuid,text,integer),internal.close_learning_submission(uuid,integer),internal.current_submission_academic_guard(),internal.submission_source_current(),internal.valid_quiz_questions(jsonb),internal.create_quiz_version(uuid,text,jsonb),internal.publish_quiz_version(uuid,uuid,integer),internal.read_published_quiz(uuid),internal.submit_quiz_attempt(uuid,uuid,jsonb),internal.learning_submission_kind_frozen(),"authorization".current_submission_open(uuid,uuid),"authorization".can_submit_assessment(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.require_assessment_available(uuid),internal.configure_assessment_availability(uuid,timestamptz,timestamptz,boolean,text,integer),internal.save_submission_draft(uuid,text,integer),internal.create_learning_submission(uuid,text),internal.return_learning_submission(uuid,text,integer),internal.resubmit_learning_submission(uuid,uuid,text,integer),internal.close_learning_submission(uuid,integer),internal.create_quiz_version(uuid,text,jsonb),internal.publish_quiz_version(uuid,uuid,integer),internal.read_published_quiz(uuid),internal.submit_quiz_attempt(uuid,uuid,jsonb),"authorization".current_submission_open(uuid,uuid),"authorization".can_submit_assessment(uuid,uuid)to cuevo_api;
commit;
