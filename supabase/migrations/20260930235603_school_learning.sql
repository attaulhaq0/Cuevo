-- School-authored learning; no official curriculum or qualification rules are implied.
begin;
create function "authorization".can_teach_subject(target_school uuid,target_class uuid,target_subject uuid) returns boolean language sql stable security definer set search_path='' as $$
select coalesce("authorization".can_access_school(target_school) and "authorization".has_entitlement(target_school,'learning') and exists(select 1 from app.classes c where c.school_id=target_school and c.id=target_class and c.status='active') and (
 "authorization".current_role(target_school)='admin' or ("authorization".current_role(target_school)='teacher' and exists(select 1 from app.teacher_assignments t where t.school_id=target_school and t.class_id=target_class and t.subject_id=target_subject and t.teacher_actor_id="authorization".actor_id() and t.status='active' and t.effective_from<=now() and (t.effective_to is null or t.effective_to>now())))),false)
$$;
create table app.courses (
 school_id uuid not null,id uuid not null default gen_random_uuid(),class_id uuid not null,subject_id uuid not null,created_by uuid not null,
 title text not null check(length(title) between 1 and 200),description text not null check(length(description)<=4000),
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED')),created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,class_id) references app.classes(school_id,id),foreign key(school_id,subject_id) references app.subjects(school_id,id),foreign key(school_id,created_by) references app.memberships(school_id,actor_id)
);
create index courses_class_idx on app.courses(school_id,class_id,id);
create function "authorization".can_manage_course(target_school uuid,target_course uuid) returns boolean language sql stable security definer set search_path='' as $$
select coalesce(exists(select 1 from app.courses c where c.school_id=target_school and c.id=target_course and "authorization".can_teach_subject(c.school_id,c.class_id,c.subject_id) and (c.created_by="authorization".actor_id() or "authorization".current_role(target_school)='admin')),false)
$$;
create function "authorization".can_read_course(target_school uuid,target_course uuid) returns boolean language sql stable security definer set search_path='' as $$
select coalesce("authorization".has_entitlement(target_school,'learning') and exists(select 1 from app.courses c join app.classes cl on cl.school_id=c.school_id and cl.id=c.class_id where c.school_id=target_school and c.id=target_course and cl.status='active' and "authorization".can_view_class(c.school_id,c.class_id) and (
 "authorization".can_manage_course(target_school,target_course) or "authorization".current_role(target_school)='coordinator' or (c.status='PUBLISHED' and "authorization".current_role(target_school) in ('student','parent')))),false)
$$;
create table app.units (
 school_id uuid not null,id uuid not null default gen_random_uuid(),course_id uuid not null,title text not null check(length(title) between 1 and 200),sequence integer not null check(sequence between 1 and 10000),
 primary key(school_id,id),foreign key(school_id,course_id) references app.courses(school_id,id),unique(school_id,course_id,sequence)
);
create index units_course_idx on app.units(school_id,course_id,id);
create table app.lessons (
 school_id uuid not null,id uuid not null default gen_random_uuid(),unit_id uuid not null,title text not null check(length(title) between 1 and 200),sequence integer not null check(sequence between 1 and 10000),body text not null check(length(body) between 1 and 50000),status text not null default 'PUBLISHED' check(status='PUBLISHED'),
 primary key(school_id,id),foreign key(school_id,unit_id) references app.units(school_id,id),unique(school_id,unit_id,sequence)
);
create index lessons_unit_idx on app.lessons(school_id,unit_id,id);
create table app.activities (
 school_id uuid not null,id uuid not null default gen_random_uuid(),lesson_id uuid not null,title text not null check(length(title) between 1 and 200),kind text not null check(kind in ('reading','practice','assignment','quiz','reflection')),instructions text not null check(length(instructions) between 1 and 10000),sequence integer not null check(sequence between 1 and 10000),
 primary key(school_id,id),foreign key(school_id,lesson_id) references app.lessons(school_id,id),unique(school_id,lesson_id,sequence)
);
create index activities_lesson_idx on app.activities(school_id,lesson_id,id);
create function "authorization".unit_course(target_school uuid,target_unit uuid) returns uuid language sql stable security definer set search_path='' as $$select course_id from app.units where school_id=target_school and id=target_unit$$;
create function "authorization".lesson_course(target_school uuid,target_lesson uuid) returns uuid language sql stable security definer set search_path='' as $$select "authorization".unit_course(school_id,unit_id) from app.lessons where school_id=target_school and id=target_lesson$$;
create function "authorization".activity_course(target_school uuid,target_activity uuid) returns uuid language sql stable security definer set search_path='' as $$select "authorization".lesson_course(school_id,lesson_id) from app.activities where school_id=target_school and id=target_activity$$;
create function "authorization".can_learn_course(target_school uuid,target_course uuid) returns boolean language sql stable security definer set search_path='' as $$
select coalesce("authorization".current_role(target_school)='student' and "authorization".can_read_course(target_school,target_course) and exists(select 1 from app.courses c join app.enrollments e on e.school_id=c.school_id and e.class_id=c.class_id where c.school_id=target_school and c.id=target_course and c.status='PUBLISHED' and e.student_actor_id="authorization".actor_id() and e.status='active' and e.effective_from<=now() and (e.effective_to is null or e.effective_to>now())),false)
$$;
create table app.activity_completions (
 school_id uuid not null,id uuid not null default gen_random_uuid(),activity_id uuid not null,learner_id uuid not null,reflection text check(length(reflection)<=10000),completed_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,activity_id) references app.activities(school_id,id),foreign key(school_id,learner_id) references app.memberships(school_id,actor_id),unique(school_id,activity_id,learner_id)
);
create index completions_learner_idx on app.activity_completions(school_id,learner_id,id);
create table app.assessments (
 school_id uuid not null,id uuid not null default gen_random_uuid(),course_id uuid not null,created_by uuid not null,title text not null check(length(title) between 1 and 200),instructions text not null check(length(instructions) between 1 and 10000),max_score numeric not null check(max_score>0 and max_score<=100000),due_at timestamptz,status text not null default 'PUBLISHED' check(status='PUBLISHED'),policy_version integer not null default 1 check(policy_version=1),
 primary key(school_id,id),foreign key(school_id,course_id) references app.courses(school_id,id),foreign key(school_id,created_by) references app.memberships(school_id,actor_id)
);
create index assessments_course_idx on app.assessments(school_id,course_id,id);
create function "authorization".assessment_course(target_school uuid,target_assessment uuid) returns uuid language sql stable security definer set search_path='' as $$select course_id from app.assessments where school_id=target_school and id=target_assessment$$;
create table app.submissions (
 school_id uuid not null,id uuid not null default gen_random_uuid(),assessment_id uuid not null,learner_id uuid not null,content text not null check(length(content) between 1 and 50000),status text not null default 'SUBMITTED' check(status='SUBMITTED'),revision integer not null default 1 check(revision=1),submitted_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,assessment_id) references app.assessments(school_id,id),foreign key(school_id,learner_id) references app.memberships(school_id,actor_id),unique(school_id,assessment_id,learner_id)
);
create index submissions_learner_idx on app.submissions(school_id,learner_id,id);
create index submissions_assessment_idx on app.submissions(school_id,assessment_id,id);
do $$declare tab text;begin foreach tab in array array['courses','units','lessons','activities','activity_completions','assessments','submissions'] loop execute format('alter table app.%I enable row level security',tab); execute format('alter table app.%I force row level security',tab);end loop;end$$;
create policy courses_read on app.courses for select to cuevo_api using("authorization".can_read_course(school_id,id));
create policy courses_insert on app.courses for insert to cuevo_api with check(created_by="authorization".actor_id() and "authorization".can_teach_subject(school_id,class_id,subject_id));
create policy courses_publish on app.courses for update to cuevo_api using("authorization".can_manage_course(school_id,id)) with check("authorization".can_manage_course(school_id,id));
create policy units_read on app.units for select to cuevo_api using("authorization".can_read_course(school_id,course_id));
create policy units_insert on app.units for insert to cuevo_api with check("authorization".can_manage_course(school_id,course_id));
create policy lessons_read on app.lessons for select to cuevo_api using("authorization".can_read_course(school_id,"authorization".unit_course(school_id,unit_id)));
create policy lessons_insert on app.lessons for insert to cuevo_api with check("authorization".can_manage_course(school_id,"authorization".unit_course(school_id,unit_id)));
create policy activities_read on app.activities for select to cuevo_api using("authorization".can_read_course(school_id,"authorization".lesson_course(school_id,lesson_id)));
create policy activities_insert on app.activities for insert to cuevo_api with check("authorization".can_manage_course(school_id,"authorization".lesson_course(school_id,lesson_id)));
create policy completions_read on app.activity_completions for select to cuevo_api using("authorization".can_read_course(school_id,"authorization".activity_course(school_id,activity_id)) and (learner_id="authorization".actor_id() or "authorization".can_manage_course(school_id,"authorization".activity_course(school_id,activity_id))));
create policy completions_insert on app.activity_completions for insert to cuevo_api with check(learner_id="authorization".actor_id() and "authorization".can_learn_course(school_id,"authorization".activity_course(school_id,activity_id)));
create policy assessments_read on app.assessments for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment') and "authorization".can_read_course(school_id,course_id));
create policy assessments_insert on app.assessments for insert to cuevo_api with check(created_by="authorization".actor_id() and "authorization".has_entitlement(school_id,'assessment') and "authorization".can_manage_course(school_id,course_id));
create policy submissions_read on app.submissions for select to cuevo_api using("authorization".has_entitlement(school_id,'assessment') and ("authorization".can_manage_course(school_id,"authorization".assessment_course(school_id,assessment_id)) or (learner_id="authorization".actor_id() and "authorization".can_learn_course(school_id,"authorization".assessment_course(school_id,assessment_id)))));
create policy submissions_insert on app.submissions for insert to cuevo_api with check(learner_id="authorization".actor_id() and "authorization".has_entitlement(school_id,'assessment') and "authorization".can_learn_course(school_id,"authorization".assessment_course(school_id,assessment_id)));
create function internal.learning_revision_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Learning revisions are immutable' using errcode='55000';end$$;
create trigger completion_immutable before update or delete on app.activity_completions for each row execute function internal.learning_revision_immutable();
create trigger submission_immutable before update or delete on app.submissions for each row execute function internal.learning_revision_immutable();
revoke all on app.courses,app.units,app.lessons,app.activities,app.activity_completions,app.assessments,app.submissions from public,anon,authenticated,service_role,cuevo_worker,cuevo_api;
grant select,insert on app.courses,app.units,app.lessons,app.activities,app.activity_completions,app.assessments,app.submissions to cuevo_api;
grant update(status) on app.courses to cuevo_api;
revoke execute on function "authorization".can_teach_subject(uuid,uuid,uuid),"authorization".can_manage_course(uuid,uuid),"authorization".can_read_course(uuid,uuid),"authorization".unit_course(uuid,uuid),"authorization".lesson_course(uuid,uuid),"authorization".activity_course(uuid,uuid),"authorization".can_learn_course(uuid,uuid),"authorization".assessment_course(uuid,uuid) from public,anon,authenticated,service_role,cuevo_worker;
grant execute on function "authorization".can_teach_subject(uuid,uuid,uuid),"authorization".can_manage_course(uuid,uuid),"authorization".can_read_course(uuid,uuid),"authorization".unit_course(uuid,uuid),"authorization".lesson_course(uuid,uuid),"authorization".activity_course(uuid,uuid),"authorization".can_learn_course(uuid,uuid),"authorization".assessment_course(uuid,uuid) to cuevo_api;
revoke execute on function internal.learning_revision_immutable() from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
