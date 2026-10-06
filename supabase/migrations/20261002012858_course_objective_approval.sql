begin;
-- Course approvals extend the immutable programme context without replacing its source identity.
create table app.course_objective_approvals(
 school_id uuid not null,course_id uuid not null,reference_id uuid not null,academic_reference_id uuid not null,revision integer not null check(revision>0),reason text not null check(length(btrim(reason))between 1 and 2000),approved_by uuid not null,approved_at timestamptz not null default clock_timestamp(),
 primary key(school_id,course_id,reference_id),unique(school_id,academic_reference_id),unique(school_id,course_id,revision),
 foreign key(school_id,course_id)references app.programme_course_contexts(school_id,course_id),foreign key(school_id,reference_id)references app.curriculum_references(school_id,id),foreign key(school_id,academic_reference_id)references app.school_custom_references(school_id,id),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id)
);
alter table app.course_objective_approvals enable row level security;
alter table app.course_objective_approvals force row level security;
revoke all on app.course_objective_approvals from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger immutable_history before update or delete on app.course_objective_approvals for each row execute function internal.academic_history_immutable();
create trigger immutable_no_truncate before truncate on app.course_objective_approvals for each statement execute function internal.academic_history_immutable();
insert into app.course_objective_approvals(school_id,course_id,reference_id,academic_reference_id,revision,reason,approved_by)
select school_id,course_id,reference_id,academic_reference_id,1,'Original course programme configuration approved',approved_by from app.programme_course_contexts;
create function internal.record_initial_course_objective()returns trigger language plpgsql security definer set search_path=''as $$begin
 insert into app.course_objective_approvals(school_id,course_id,reference_id,academic_reference_id,revision,reason,approved_by)values(new.school_id,new.course_id,new.reference_id,new.academic_reference_id,1,'Original course programme configuration approved',new.approved_by);return new;
end$$;
create trigger course_objective_initial after insert on app.programme_course_contexts for each row execute function internal.record_initial_course_objective();

-- Imported references can inherit scope. Null never establishes subject equality on its own.
create function internal.course_objective_scope(target_school uuid,target_course uuid,target_reference uuid)returns boolean language sql stable security definer set search_path=''as $$
with recursive context as(
 select course.subject_id,programme.year_group_id,programme.pack_version_id,pinned.reference_id
 from app.programme_course_contexts pinned join app.courses course on course.school_id=pinned.school_id and course.id=pinned.course_id join app.classes class on class.school_id=course.school_id and class.id=course.class_id
 join app.programme_instances programme on programme.school_id=pinned.school_id and programme.id=pinned.programme_id
 where pinned.school_id=target_school and pinned.course_id=target_course and course.class_id=programme.class_id and course.subject_id=programme.subject_id and class.year_group_id=programme.year_group_id
),walk as(
 select seed.side,reference.id,reference.parent_id,reference.type,reference.subject_id,reference.year_group_id,array[reference.id]as visited,1 as depth
 from context cross join lateral(values('base',context.reference_id),('candidate',target_reference))seed(side,id)
 join app.curriculum_references reference on reference.school_id=target_school and reference.id=seed.id and reference.pack_version_id=context.pack_version_id and reference.type in('objective','outcome','criterion')
 union all
 select child.side,parent.id,parent.parent_id,parent.type,parent.subject_id,parent.year_group_id,child.visited||parent.id,child.depth+1
 from walk child join context on true join app.curriculum_references parent on parent.school_id=target_school and parent.id=child.parent_id and parent.pack_version_id=context.pack_version_id
 where child.depth<64 and not parent.id=any(child.visited)
)
select coalesce(exists(select 1 from context)and(select count(distinct side)from walk where parent_id is null)=2
 and(select count(*)from walk where side='base'and type='subject')=1 and(select count(*)from walk where side='candidate'and type='subject')=1
 and exists(select 1 from walk base join walk candidate on candidate.id=base.id where base.side='base'and candidate.side='candidate'and base.type='subject')
 and(select count(*)from walk where side='base'and type='year')<=1 and(select count(*)from walk where side='candidate'and type='year')<=1
 and(select max(id::text)from walk where side='base'and type='year')is not distinct from(select max(id::text)from walk where side='candidate'and type='year')
 and not exists(select 1 from walk cross join context where(walk.subject_id is not null and walk.subject_id<>context.subject_id)or(walk.year_group_id is not null and walk.year_group_id<>context.year_group_id)),false)
$$;
create function internal.require_course_objective_access(target_course uuid,manage boolean)returns void language plpgsql stable security definer set search_path=''as $$declare course app.courses;role_name text;begin
 select*into course from app.courses where school_id="authorization".school_id()and id=target_course;role_name:="authorization".current_role("authorization".school_id());
 if course.id is null or role_name is null or not"authorization".has_entitlement(course.school_id,'curriculum')or role_name not in('admin','coordinator','teacher')or(manage and role_name not in('admin','coordinator'))or not exists(select 1 from app.classes class where class.school_id=course.school_id and class.id=course.class_id and class.status='active')or not("authorization".can_manage_course(course.school_id,course.id)or(role_name='coordinator'and"authorization".can_view_class(course.school_id,course.class_id)))then raise exception 'Course objective access denied'using errcode='42501';end if;
 if exists(select 1 from app.programme_course_contexts pinned where pinned.school_id=course.school_id and pinned.course_id=course.id)and not exists(
  select 1 from app.programme_course_contexts pinned join app.programme_instances programme on programme.school_id=pinned.school_id and programme.id=pinned.programme_id join app.classes class on class.school_id=course.school_id and class.id=course.class_id
  join app.curriculum_versions pack on pack.school_id=programme.school_id and pack.id=programme.pack_version_id
  where pinned.school_id=course.school_id and pinned.course_id=course.id and programme.class_id=course.class_id and programme.subject_id=course.subject_id and class.year_group_id=programme.year_group_id and pack.synthetic and pack.kind='school_custom'and pack.source_status='VERIFIED'and pack.rights_status='PERMITTED'
 )then raise exception 'Pinned programme requires source review'using errcode='22023';end if;
end$$;
create function internal.approve_course_objective(target_course uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();reference app.curriculum_references;pinned app.programme_course_contexts;academic_version_id uuid;academic_id uuid;latest integer;reservation jsonb;receipt jsonb;
begin
 perform internal.require_course_objective_access(target_course,true);
 if payload is null or jsonb_typeof(payload)<>'object'or(payload->'confirmConfiguration')is distinct from'true'::jsonb or jsonb_typeof(payload->'referenceId')is distinct from'string'or jsonb_typeof(payload->'reason')is distinct from'string'or length(btrim(payload->>'reason'))not between 1 and 2000 or jsonb_typeof(payload->'expectedVersion')is distinct from'number'or(payload->>'expectedVersion')!~'^[1-9][0-9]*$'or exists(select 1 from jsonb_object_keys(payload)key where key not in('referenceId','reason','expectedVersion','confirmConfiguration'))then raise exception 'Explicit objective approval required'using errcode='22023';end if;
 perform 1 from app.courses where school_id=school and id=target_course for update;
 perform internal.require_course_objective_access(target_course,true);
 select*into pinned from app.programme_course_contexts where school_id=school and course_id=target_course;
 if not found or not internal.course_objective_scope(school,target_course,(payload->>'referenceId')::uuid)then raise exception 'Exact curriculum hierarchy scope requires review'using errcode='22023';end if;
 select*into reference from app.curriculum_references where school_id=school and id=(payload->>'referenceId')::uuid;
 if reference.title is null or length(btrim(reference.title))not between 1 and 200 or reference.description is null or length(btrim(reference.description))not between 1 and 4000 then raise exception 'Complete approved objective description required'using errcode='22023';end if;
 reservation:=internal.begin_command(command_key,'curriculum.course-objective.approve',fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';end if;if reservation->>'state'<>'NEW'then raise exception 'Objective approval in progress'using errcode='22023';end if;
 select max(revision)into latest from app.course_objective_approvals where school_id=school and course_id=target_course;
 if latest is distinct from(payload->>'expectedVersion')::integer or exists(select 1 from app.course_objective_approvals where school_id=school and course_id=target_course and reference_id=reference.id)then raise exception 'Objective approval list changed'using errcode='22023';end if;
 select saved.version_id into academic_version_id from app.school_custom_references saved where saved.school_id=school and saved.id=pinned.academic_reference_id;
 academic_id:=gen_random_uuid();
 insert into app.school_custom_references(school_id,id,version_id,title,description,status,created_by,approved_by,approved_at)values(school,academic_id,academic_version_id,reference.title,reference.description,'APPROVED',actor,actor,clock_timestamp());
 insert into app.course_objective_approvals(school_id,course_id,reference_id,academic_reference_id,revision,reason,approved_by)values(school,target_course,reference.id,academic_id,latest+1,btrim(payload->>'reason'),actor);
 receipt:=jsonb_build_object('id',reference.id,'courseId',target_course,'academicReferenceId',academic_id,'version',latest+1);
 perform internal.append_audit('curriculum.course-objective.approve','curriculum',target_course,request_id,'succeeded',jsonb_build_object('referenceId',reference.id,'academicReferenceId',academic_id,'version',latest+1));
 perform internal.enqueue_event('curriculum.configured','curriculum',target_course,latest+1,jsonb_build_object('referenceId',reference.id,'academicReferenceId',academic_id),md5('curriculum-objective:'||actor::text||':'||command_key));
 perform internal.finish_command(command_key,'curriculum.course-objective.approve',fingerprint,receipt);return receipt;
end$$;

create function internal.read_course_objective_page(target_course uuid,page_limit integer,page_cursor uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();context jsonb;items jsonb;next_cursor uuid;latest integer;ready boolean;
begin
 perform internal.require_course_objective_access(target_course,false);
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Invalid objective page'using errcode='22023';end if;
 select jsonb_build_object('courseTitle',course.title,'programmeName',programme.name,'packVersion',pack.version,'subjectName',subject.name,'yearGroupName',year_group.name),internal.course_objective_scope(school,target_course,pinned.reference_id)
 into context,ready from app.programme_course_contexts pinned join app.courses course on course.school_id=pinned.school_id and course.id=pinned.course_id
 join app.programme_instances programme on programme.school_id=pinned.school_id and programme.id=pinned.programme_id join app.curriculum_versions pack on pack.school_id=programme.school_id and pack.id=programme.pack_version_id
 join app.subjects subject on subject.school_id=course.school_id and subject.id=course.subject_id join app.year_groups year_group on year_group.school_id=programme.school_id and year_group.id=programme.year_group_id
 where pinned.school_id=school and pinned.course_id=target_course;
 if context is null then raise exception 'Course programme context required'using errcode='22023';end if;
 select max(revision)into latest from app.course_objective_approvals where school_id=school and course_id=target_course;
 with candidates as materialized(
  select reference.id,reference.title,reference.description,reference.type,parent.title as parent_title,pack.version,approval.academic_reference_id,approval.reason
  from app.programme_course_contexts pinned join app.programme_instances programme on programme.school_id=pinned.school_id and programme.id=pinned.programme_id
  join app.curriculum_versions pack on pack.school_id=programme.school_id and pack.id=programme.pack_version_id join app.curriculum_references reference on reference.school_id=pack.school_id and reference.pack_version_id=pack.id
  left join app.curriculum_references parent on parent.school_id=reference.school_id and parent.id=reference.parent_id
  left join app.course_objective_approvals approval on approval.school_id=pinned.school_id and approval.course_id=pinned.course_id and approval.reference_id=reference.id
  where pinned.school_id=school and pinned.course_id=target_course and(page_cursor is null or reference.id>page_cursor)and(approval.reference_id is not null or internal.course_objective_scope(school,target_course,reference.id))order by reference.id limit page_limit+1
 ),visible as(select*from candidates order by id limit page_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'academicReferenceId',academic_reference_id,'title',title,'description',description,'type',type,'parentTitle',parent_title,'approved',academic_reference_id is not null,'approvalReason',reason,'version',version)order by id),'[]'::jsonb),case when(select count(*)from candidates)>page_limit then(select id from visible order by id desc limit 1)end into items,next_cursor from visible;
 return context||jsonb_build_object('version',latest,'scopeStatus',case when ready then'READY'else'REQUIRES_REVIEW'end,'items',items,'nextCursor',next_cursor);
end$$;
create function internal.read_course_academic_references(target_course uuid,page_limit integer,page_cursor uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare school uuid:="authorization".school_id();items jsonb;next_cursor uuid;begin
 perform internal.require_course_objective_access(target_course,false);
 if not"authorization".academic_access(school)then raise exception 'Academic objective choices denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 then raise exception 'Invalid academic objective page'using errcode='22023';end if;
 with candidates as materialized(
 select reference.id,reference.title,reference.description,reference.code,version.version,reference.status,version.source_type,reference.created_by,reference.approved_by,
 (select parent.title from app.course_objective_approvals approval join app.curriculum_references source on source.school_id=approval.school_id and source.id=approval.reference_id left join app.curriculum_references parent on parent.school_id=source.school_id and parent.id=source.parent_id where approval.school_id=school and approval.course_id=target_course and approval.academic_reference_id=reference.id)as parent_title
 from app.school_custom_references reference join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
 where reference.school_id=school and reference.status='APPROVED'and(page_cursor is null or reference.id>page_cursor)
 and(not exists(select 1 from app.programme_course_contexts pinned where pinned.school_id=school and pinned.course_id=target_course)or exists(select 1 from app.course_objective_approvals approval where approval.school_id=school and approval.course_id=target_course and approval.academic_reference_id=reference.id))order by reference.id limit page_limit+1
 ),visible as(select*from candidates order by id limit page_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'code',code,'version',version,'status',status,'sourceType',source_type,'createdBy',created_by,'approvedBy',approved_by,'parentTitle',parent_title)order by id),'[]'::jsonb),case when(select count(*)from candidates)>page_limit then(select id from visible order by id desc limit 1)end into items,next_cursor from visible;
 return jsonb_build_object('items',items,'nextCursor',next_cursor);
end$$;
create or replace function internal.programme_assessment_context()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.academic_reference_id is not null and exists(select 1 from app.programme_course_contexts pinned where pinned.school_id=new.school_id and pinned.course_id=new.course_id)and not exists(select 1 from app.course_objective_approvals approval where approval.school_id=new.school_id and approval.course_id=new.course_id and approval.academic_reference_id=new.academic_reference_id)then raise exception 'Assessment objective is not approved for the pinned programme course'using errcode='22023';end if;return new;
end$$;
revoke execute on function internal.record_initial_course_objective(),internal.course_objective_scope(uuid,uuid,uuid),internal.require_course_objective_access(uuid,boolean),internal.approve_course_objective(uuid,jsonb,text,text,text),internal.read_course_objective_page(uuid,integer,uuid),internal.read_course_academic_references(uuid,integer,uuid),internal.programme_assessment_context()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.approve_course_objective(uuid,jsonb,text,text,text),internal.read_course_objective_page(uuid,integer,uuid),internal.read_course_academic_references(uuid,integer,uuid)to cuevo_api;
commit;
