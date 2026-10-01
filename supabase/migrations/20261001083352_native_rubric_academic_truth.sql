-- Teacher-defined School Custom native rubrics. No issuer grades or scalar normalization.
begin;
create function internal.valid_rubric_definition(value jsonb)returns boolean language plpgsql immutable set search_path=''as $$
declare criterion jsonb;level jsonb;
begin
 if value is null or jsonb_typeof(value)<>'array'or jsonb_array_length(value)<1 or jsonb_array_length(value)>30 or octet_length(value::text)>500000 then return false;end if;
 if(select count(distinct item->>'key')from jsonb_array_elements(value)item)<>jsonb_array_length(value)then return false;end if;
 for criterion in select*from jsonb_array_elements(value)loop
  if jsonb_typeof(criterion)<>'object'or not(criterion?&array['key','title','levels'])or criterion-array['key','title','levels']<>'{}'::jsonb or jsonb_typeof(criterion->'key')<>'string'or criterion->>'key'!~'^[A-Za-z0-9_.:-]{1,100}$'or jsonb_typeof(criterion->'title')<>'string'or length(btrim(criterion->>'title'))not between 1 and 200 or jsonb_typeof(criterion->'levels')<>'array'or jsonb_array_length(criterion->'levels')not between 1 and 20 then return false;end if;
  if(select count(distinct item->>'key')from jsonb_array_elements(criterion->'levels')item)<>jsonb_array_length(criterion->'levels')then return false;end if;
  for level in select*from jsonb_array_elements(criterion->'levels')loop
   if jsonb_typeof(level)<>'object'or not(level?&array['key','label','description'])or level-array['key','label','description']<>'{}'::jsonb or jsonb_typeof(level->'key')<>'string'or level->>'key'!~'^[A-Za-z0-9_.:-]{1,100}$'or jsonb_typeof(level->'label')<>'string'or length(btrim(level->>'label'))not between 1 and 200 or jsonb_typeof(level->'description')<>'string'or length(btrim(level->>'description'))not between 1 and 2000 then return false;end if;
  end loop;
 end loop;return true;
exception when others then return false;
end$$;
create table app.rubric_versions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),course_id uuid not null,title text not null check(length(btrim(title))between 1 and 200),version text not null check(length(btrim(version))between 1 and 100),criteria jsonb not null check(internal.valid_rubric_definition(criteria)),source_type text not null default'SCHOOL_AUTHORED'check(source_type='SCHOOL_AUTHORED'),created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),unique(school_id,course_id,title,version),foreign key(school_id,course_id)references app.courses(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id)
);
create table app.assessment_rubrics(
 school_id uuid not null,assessment_id uuid not null,rubric_id uuid not null,configured_by uuid not null,configured_at timestamptz not null default clock_timestamp(),primary key(school_id,assessment_id),foreign key(school_id,assessment_id)references app.assessments(school_id,id),foreign key(school_id,rubric_id)references app.rubric_versions(school_id,id),foreign key(school_id,configured_by)references app.memberships(school_id,actor_id)
);
do $$declare model_constraint text;begin for model_constraint in select conname from pg_constraint where conrelid='app.assessments'::regclass and contype='c'and pg_get_constraintdef(oid)like'%model%'loop execute format('alter table app.assessments drop constraint %I',model_constraint);end loop;end$$;
alter table app.assessments add constraint assessment_native_model check(model in('numeric','rubric'));
create table app.rubric_marking_revisions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),submission_id uuid not null,learner_id uuid not null,revision integer not null check(revision>0),rubric_id uuid not null,native_result jsonb not null,feedback text not null check(length(feedback)<=10000),policy_version integer not null check(policy_version>0),reference_id uuid not null,source_object_id uuid not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),unique(school_id,id,learner_id),unique(school_id,id,submission_id,learner_id),unique(school_id,submission_id,revision),foreign key(school_id,submission_id,learner_id)references app.submissions(school_id,id,learner_id),foreign key(school_id,rubric_id)references app.rubric_versions(school_id,id),foreign key(school_id,reference_id)references app.school_custom_references(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),check(source_object_id=submission_id),check(native_result->>'type'='rubric'and not(native_result?'score')and not(native_result?'maxScore')and native_result->'normalized'='null'::jsonb)
);
create table app.rubric_result_revisions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),marking_id uuid not null,submission_id uuid not null,assessment_id uuid not null,learner_id uuid not null,revision integer not null check(revision>0),rubric_id uuid not null,native_result jsonb not null,feedback text not null,policy_version integer not null,reference_id uuid not null,reference_version text not null,evidence_id uuid not null,parent_visible boolean not null default false,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),previous_result_id uuid,
 primary key(school_id,id),unique(school_id,id,learner_id),unique(school_id,id,submission_id,learner_id),unique(school_id,marking_id),foreign key(school_id,marking_id,submission_id,learner_id)references app.rubric_marking_revisions(school_id,id,submission_id,learner_id),foreign key(school_id,assessment_id)references app.assessments(school_id,id),foreign key(school_id,rubric_id)references app.rubric_versions(school_id,id),foreign key(school_id,reference_id)references app.school_custom_references(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),foreign key(school_id,previous_result_id)references app.rubric_result_revisions(school_id,id),check(native_result->>'type'='rubric'and not(native_result?'score')and not(native_result?'maxScore')and native_result->'normalized'='null'::jsonb)
);
create table app.rubric_evidence(
 school_id uuid not null,id uuid not null default gen_random_uuid(),source_type text not null default'SUBMISSION'check(source_type='SUBMISSION'),source_object_id uuid not null,learner_id uuid not null,actor_id uuid not null,created_at timestamptz not null default clock_timestamp(),quality text not null default'TEACHER_ENTERED'check(quality='TEACHER_ENTERED'),reference_id uuid not null,reference_version text not null,policy_version integer not null,result_id uuid not null,revision integer not null,parent_visible boolean not null default false,review_status text not null default'APPROVED'check(review_status='APPROVED'),
 primary key(school_id,id),foreign key(school_id,source_object_id,learner_id)references app.submissions(school_id,id,learner_id),foreign key(school_id,result_id,learner_id)references app.rubric_result_revisions(school_id,id,learner_id)deferrable initially deferred,foreign key(school_id,reference_id)references app.school_custom_references(school_id,id),foreign key(school_id,actor_id)references app.memberships(school_id,actor_id)
);
alter table app.rubric_result_revisions add foreign key(school_id,evidence_id)references app.rubric_evidence(school_id,id)deferrable initially deferred;
create table app.current_rubric_results(
 school_id uuid not null,submission_id uuid not null,learner_id uuid not null,result_id uuid not null,updated_at timestamptz not null default clock_timestamp(),primary key(school_id,submission_id),foreign key(school_id,result_id,submission_id,learner_id)references app.rubric_result_revisions(school_id,id,submission_id,learner_id)
);
create index rubric_marking_submission_idx on app.rubric_marking_revisions(school_id,submission_id,revision desc);
create index rubric_results_learner_idx on app.rubric_result_revisions(school_id,learner_id,id);
create function internal.create_rubric(target_course uuid,rubric_title text,rubric_version text,definition jsonb)returns uuid language plpgsql security definer set search_path=''as $$declare rid uuid;begin
 perform internal.academic_require();if not"authorization".can_manage_course("authorization".school_id(),target_course)then raise exception 'Rubric author denied'using errcode='42501';end if;
 if not internal.valid_rubric_definition(definition)then raise exception 'Rubric criteria require review'using errcode='22023';end if;
 insert into app.rubric_versions(school_id,course_id,title,version,criteria,created_by)values("authorization".school_id(),target_course,rubric_title,rubric_version,definition,"authorization".actor_id())returning id into rid;return rid;
end$$;
create function internal.configure_assessment_rubric(target_assessment uuid,target_rubric uuid,expected_policy integer)returns uuid language plpgsql security definer set search_path=''as $$declare a app.assessments;r app.rubric_versions;begin
 perform internal.academic_require();select*into a from app.assessments where school_id="authorization".school_id()and id=target_assessment for update;
 if not found or not"authorization".can_manage_course(a.school_id,a.course_id)then raise exception 'Rubric assessment denied'using errcode='42501';end if;
 select*into r from app.rubric_versions where school_id=a.school_id and id=target_rubric;
 if expected_policy is null or a.policy_version<>expected_policy or r.id is null or r.course_id<>a.course_id or exists(select 1 from app.submissions s where s.school_id=a.school_id and s.assessment_id=a.id and(exists(select 1 from app.marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)or exists(select 1 from app.rubric_marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)))then raise exception 'Rubric context frozen or incompatible'using errcode='22023';end if;
 insert into app.assessment_rubrics(school_id,assessment_id,rubric_id,configured_by)values(a.school_id,a.id,r.id,"authorization".actor_id())on conflict(school_id,assessment_id)do update set rubric_id=excluded.rubric_id,configured_by=excluded.configured_by,configured_at=clock_timestamp();
 update app.assessments set model='rubric',policy_version=policy_version+1 where school_id=a.school_id and id=a.id;return a.id;
end$$;
create function internal.mark_rubric_submission(target_submission uuid,target_rubric uuid,choices jsonb,mark_feedback text,expected_policy integer,expected_revision integer,source_evidence boolean)returns uuid language plpgsql security definer set search_path=''as $$
declare s app.submissions;a app.assessments;r app.rubric_versions;latest integer;criterion jsonb;choice jsonb;selected_level jsonb;native_criteria jsonb:='[]';native jsonb;mid uuid;
begin
 perform internal.academic_require();if not"authorization".can_mark_submission("authorization".school_id(),target_submission)then raise exception 'Rubric marking denied'using errcode='42501';end if;
 select*into s from app.submissions where school_id="authorization".school_id()and id=target_submission for update;select*into a from app.assessments where school_id=s.school_id and id=s.assessment_id for share;
 select rv.*into r from app.assessment_rubrics ar join app.rubric_versions rv on rv.school_id=ar.school_id and rv.id=ar.rubric_id where ar.school_id=a.school_id and ar.assessment_id=a.id;
 select coalesce(max(revision),0)into latest from app.rubric_marking_revisions where school_id=s.school_id and submission_id=s.id;
 if a.model<>'rubric'or r.id is null or r.id is distinct from target_rubric or expected_policy is null or expected_policy<>a.policy_version or expected_revision is null or expected_revision<>latest or source_evidence is distinct from true or exists(select 1 from app.marking_revisions where school_id=s.school_id and submission_id=s.id)or not exists(select 1 from app.school_custom_references where school_id=a.school_id and id=a.academic_reference_id and status='APPROVED')then raise exception 'Invalid or stale native rubric context'using errcode='22023';end if;
 if choices is null or jsonb_typeof(choices)<>'array'or jsonb_array_length(choices)<>jsonb_array_length(r.criteria)or(select count(distinct item->>'criterionKey')from jsonb_array_elements(choices)item)<>jsonb_array_length(choices)then raise exception 'Complete unique criterion choices required'using errcode='22023';end if;
 for criterion in select*from jsonb_array_elements(r.criteria)loop
  select item into choice from jsonb_array_elements(choices)item where item->>'criterionKey'=criterion->>'key';
  if choice is null or jsonb_typeof(choice)<>'object'or not(choice?&array['criterionKey','levelKey'])or choice-array['criterionKey','levelKey']<>'{}'::jsonb or jsonb_typeof(choice->'criterionKey')<>'string'or jsonb_typeof(choice->'levelKey')<>'string'then raise exception 'Complete criterion choice required'using errcode='22023';end if;
  select item into selected_level from jsonb_array_elements(criterion->'levels')item where item->>'key'=choice->>'levelKey';
  if selected_level is null then raise exception 'Allowed criterion level required'using errcode='22023';end if;
  native_criteria:=native_criteria||jsonb_build_array(jsonb_build_object('criterionKey',criterion->>'key','criterionTitle',criterion->>'title','levelKey',selected_level->>'key','levelLabel',selected_level->>'label','levelDescription',selected_level->>'description'));
 end loop;
 native:=jsonb_build_object('type','rubric','rubricId',r.id,'rubricTitle',r.title,'rubricVersion',r.version,'policyVersion',a.policy_version,'normalized',null,'criteria',native_criteria);
 insert into app.rubric_marking_revisions(school_id,submission_id,learner_id,revision,rubric_id,native_result,feedback,policy_version,reference_id,source_object_id,created_by)values(s.school_id,s.id,s.learner_id,latest+1,r.id,native,mark_feedback,a.policy_version,a.academic_reference_id,s.id,"authorization".actor_id())returning id into mid;return mid;
end$$;
create function internal.release_rubric_marking(target_marking uuid,expected_revision integer,parent_allowed boolean)returns uuid language plpgsql security definer set search_path=''as $$
declare m app.rubric_marking_revisions;s app.submissions;a app.assessments;ref app.school_custom_references;v app.school_custom_versions;rid uuid;eid uuid:=gen_random_uuid();previous uuid;
begin
 perform internal.academic_require();select*into m from app.rubric_marking_revisions where school_id="authorization".school_id()and id=target_marking;
 if not found or not"authorization".can_mark_submission(m.school_id,m.submission_id)then raise exception 'Rubric release denied'using errcode='42501';end if;
 select*into s from app.submissions where school_id=m.school_id and id=m.submission_id for update;select*into a from app.assessments where school_id=s.school_id and id=s.assessment_id for share;
 if expected_revision is null or m.revision<>expected_revision or m.revision<>(select max(revision)from app.rubric_marking_revisions where school_id=m.school_id and submission_id=m.submission_id)or a.model<>'rubric'or a.policy_version<>m.policy_version or a.academic_reference_id is distinct from m.reference_id or m.rubric_id is distinct from(select rubric_id from app.assessment_rubrics where school_id=a.school_id and assessment_id=a.id)or m.source_object_id<>s.id or parent_allowed is null then raise exception 'Stale rubric release context'using errcode='22023';end if;
 select*into ref from app.school_custom_references where school_id=m.school_id and id=m.reference_id and status='APPROVED';if not found then raise exception 'Approved source reference required'using errcode='22023';end if;select*into v from app.school_custom_versions where school_id=ref.school_id and id=ref.version_id;
 select id into rid from app.rubric_result_revisions where school_id=m.school_id and marking_id=m.id;
 if found then if(select parent_visible from app.rubric_result_revisions where school_id=m.school_id and id=rid)is distinct from parent_allowed then raise exception 'Released visibility immutable'using errcode='22023';end if;return rid;end if;
 select result_id into previous from app.current_rubric_results where school_id=m.school_id and submission_id=s.id;
 rid:=gen_random_uuid();insert into app.rubric_result_revisions(school_id,id,marking_id,submission_id,assessment_id,learner_id,revision,rubric_id,native_result,feedback,policy_version,reference_id,reference_version,evidence_id,parent_visible,created_by,previous_result_id)values(m.school_id,rid,m.id,s.id,a.id,m.learner_id,m.revision,m.rubric_id,m.native_result,m.feedback,m.policy_version,ref.id,v.version,eid,parent_allowed,"authorization".actor_id(),previous);
 insert into app.rubric_evidence(school_id,id,source_object_id,learner_id,actor_id,reference_id,reference_version,policy_version,result_id,revision,parent_visible)values(m.school_id,eid,s.id,m.learner_id,"authorization".actor_id(),ref.id,v.version,m.policy_version,rid,m.revision,parent_allowed);
 insert into app.current_rubric_results(school_id,submission_id,learner_id,result_id)values(m.school_id,s.id,m.learner_id,rid)on conflict(school_id,submission_id)do update set result_id=excluded.result_id,updated_at=clock_timestamp();return rid;
end$$;
create function internal.numeric_marking_model_guard()returns trigger language plpgsql set search_path=''as $$begin
 if not exists(select 1 from app.submissions s join app.assessments a on a.school_id=s.school_id and a.id=s.assessment_id where s.school_id=new.school_id and s.id=new.submission_id and a.model='numeric')then raise exception 'Numeric mark requires numeric assessment'using errcode='22023';end if;return new;
end$$;
create trigger numeric_marking_model_guard before insert on app.marking_revisions for each row execute function internal.numeric_marking_model_guard();
create or replace function internal.assessment_context_immutable()returns trigger language plpgsql set search_path=''as $$begin
 if(new.max_score is distinct from old.max_score or new.model is distinct from old.model or new.academic_reference_id is distinct from old.academic_reference_id or new.policy_version is distinct from old.policy_version)and exists(select 1 from app.submissions s where s.school_id=old.school_id and s.assessment_id=old.id and(exists(select 1 from app.marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)or exists(select 1 from app.rubric_marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)))then raise exception 'Used assessment context is immutable'using errcode='55000';end if;return new;
end$$;
create function internal.assessment_rubric_immutable()returns trigger language plpgsql set search_path=''as $$begin
 if exists(select 1 from app.submissions s where s.school_id=old.school_id and s.assessment_id=old.assessment_id and(exists(select 1 from app.marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)or exists(select 1 from app.rubric_marking_revisions m where m.school_id=s.school_id and m.submission_id=s.id)))then raise exception 'Used rubric assignment is immutable'using errcode='55000';end if;
 if tg_op='DELETE'then return old;end if;return new;
end$$;
create trigger assessment_rubric_immutable before update or delete on app.assessment_rubrics for each row execute function internal.assessment_rubric_immutable();
do $$declare tab text;begin
 foreach tab in array array['rubric_versions','assessment_rubrics','rubric_marking_revisions','rubric_result_revisions','rubric_evidence','current_rubric_results']loop execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);end loop;
 foreach tab in array array['rubric_versions','rubric_marking_revisions','rubric_result_revisions','rubric_evidence']loop execute format('create trigger history_immutable before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);end loop;
 foreach tab in array array['rubric_versions','assessment_rubrics','rubric_marking_revisions','rubric_result_revisions','rubric_evidence','current_rubric_results']loop execute format('create trigger history_no_truncate before truncate on app.%I for each statement execute function internal.academic_history_immutable()',tab);end loop;
end$$;
create policy rubrics_read on app.rubric_versions for select to cuevo_api using("authorization".academic_access(school_id)and"authorization".can_read_course(school_id,course_id)and"authorization".current_role(school_id)<>'parent');
create policy rubric_assignments_read on app.assessment_rubrics for select to cuevo_api using("authorization".academic_access(school_id)and"authorization".current_role(school_id)<>'parent'and"authorization".can_read_course(school_id,"authorization".assessment_course(school_id,assessment_id)));
create policy rubric_markings_read on app.rubric_marking_revisions for select to cuevo_api using("authorization".can_mark_submission(school_id,submission_id));
create policy rubric_results_read on app.rubric_result_revisions for select to cuevo_api using("authorization".can_read_academic(school_id,learner_id,parent_visible));
create policy rubric_evidence_read on app.rubric_evidence for select to cuevo_api using("authorization".can_read_academic(school_id,learner_id,parent_visible));
create policy current_rubric_results_read on app.current_rubric_results for select to cuevo_api using("authorization".can_read_academic(school_id,learner_id,(select r.parent_visible from app.rubric_result_revisions r where r.school_id=current_rubric_results.school_id and r.id=current_rubric_results.result_id)));
revoke all on app.rubric_versions,app.assessment_rubrics,app.rubric_marking_revisions,app.rubric_result_revisions,app.rubric_evidence,app.current_rubric_results from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant select on app.rubric_versions,app.assessment_rubrics,app.rubric_marking_revisions,app.rubric_result_revisions,app.rubric_evidence,app.current_rubric_results to cuevo_api;
revoke execute on function internal.valid_rubric_definition(jsonb),internal.create_rubric(uuid,text,text,jsonb),internal.configure_assessment_rubric(uuid,uuid,integer),internal.mark_rubric_submission(uuid,uuid,jsonb,text,integer,integer,boolean),internal.release_rubric_marking(uuid,integer,boolean),internal.numeric_marking_model_guard(),internal.assessment_rubric_immutable(),internal.assessment_context_immutable()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.create_rubric(uuid,text,text,jsonb),internal.configure_assessment_rubric(uuid,uuid,integer),internal.mark_rubric_submission(uuid,uuid,jsonb,text,integer,integer,boolean),internal.release_rubric_marking(uuid,integer,boolean)to cuevo_api;
commit;
