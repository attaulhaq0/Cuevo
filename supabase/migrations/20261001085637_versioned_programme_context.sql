begin;
-- Versioned programme and independent overlay contexts. Official content remains pending review.
create table app.curriculum_versions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),pack_id text not null,kind text not null check(kind in('curriculum','jurisdiction','quality','school_custom')),framework text not null,programme text not null,version text not null,scope text not null,
 source_status text not null check(source_status in('VERIFIED','REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN')),rights_status text not null check(rights_status in('PERMITTED','REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN')),
 source_location text not null,source_checksum text,synthetic boolean not null,reason text not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),unique(school_id,pack_id,version),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),
 check(source_checksum is null or source_checksum~'^[a-f0-9]{64}$'),check((synthetic and kind='school_custom')or(not synthetic and source_status<>'VERIFIED'and rights_status<>'PERMITTED'))
);
create table app.curriculum_references(
 school_id uuid not null,id uuid not null default gen_random_uuid(),pack_version_id uuid not null,parent_id uuid,type text not null check(type in('stage','year','subject','strand','objective','outcome','criterion','syllabus_item','requirement','other')),
 title text not null,description text not null,code text,sequence integer not null check(sequence>=0),subject_id uuid,year_group_id uuid,created_by uuid not null,
 primary key(school_id,id),unique(school_id,id,pack_version_id),foreign key(school_id,pack_version_id)references app.curriculum_versions(school_id,id),foreign key(school_id,parent_id,pack_version_id)references app.curriculum_references(school_id,id,pack_version_id),foreign key(school_id,subject_id)references app.subjects(school_id,id),foreign key(school_id,year_group_id)references app.year_groups(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id)
);
create table app.programme_instances(
 school_id uuid not null,id uuid not null default gen_random_uuid(),pack_version_id uuid not null,name text not null,class_id uuid not null,subject_id uuid not null,year_group_id uuid not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,pack_version_id)references app.curriculum_versions(school_id,id),foreign key(school_id,class_id)references app.classes(school_id,id),foreign key(school_id,subject_id)references app.subjects(school_id,id),foreign key(school_id,year_group_id)references app.year_groups(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id)
);
create table app.programme_learners(
 school_id uuid not null,programme_id uuid not null,learner_id uuid not null,status text not null check(status in('active','revoked')),approved_by uuid not null,updated_at timestamptz not null default clock_timestamp(),
 primary key(school_id,programme_id,learner_id),foreign key(school_id,programme_id)references app.programme_instances(school_id,id),foreign key(school_id,learner_id)references app.memberships(school_id,actor_id),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id)
);
create table app.programme_course_contexts(
 school_id uuid not null,course_id uuid not null,programme_id uuid not null,reference_id uuid not null,academic_reference_id uuid not null,version integer not null default 1 check(version>0),approved_by uuid not null,
 primary key(school_id,course_id),foreign key(school_id,course_id)references app.courses(school_id,id),foreign key(school_id,programme_id)references app.programme_instances(school_id,id),foreign key(school_id,reference_id)references app.curriculum_references(school_id,id),foreign key(school_id,academic_reference_id)references app.school_custom_references(school_id,id),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id)
);
create table app.school_framework_contexts(
 school_id uuid not null,id uuid not null default gen_random_uuid(),pack_version_id uuid not null,axis text not null check(axis in('jurisdiction','quality')),status text not null check(status in('REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN')),approved_by uuid not null,
 primary key(school_id,id),unique(school_id,pack_version_id,axis),foreign key(school_id,pack_version_id)references app.curriculum_versions(school_id,id),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id)
);
create function internal.curriculum_config_require()returns void language plpgsql security definer set search_path=''as $$begin
 if not"authorization".has_entitlement("authorization".school_id(),'curriculum')or"authorization".current_role("authorization".school_id())not in('admin','coordinator')then raise exception 'Curriculum configuration denied'using errcode='42501';end if;
end$$;
create function internal.configure_curriculum(command_name text,target_id uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();rid uuid;receipt jsonb;reservation jsonb;pack app.curriculum_versions;programme app.programme_instances;reference app.curriculum_references;course app.courses;academic_id uuid;
begin
 perform internal.curriculum_config_require();
 if payload is null or jsonb_typeof(payload)<>'object'then raise exception 'Invalid curriculum input'using errcode='22023';end if;
 if command_name in('reference.create','programme.create','overlay.configure')then select*into pack from app.curriculum_versions where school_id=school and id=(payload->>'packVersionId')::uuid;if not found then raise exception 'Pack context denied'using errcode='42501';end if;end if;
 if command_name in('course.configure','learner.configure')then select*into programme from app.programme_instances where school_id=school and id=(payload->>'programmeId')::uuid;if not found then raise exception 'Programme denied'using errcode='42501';end if;select*into pack from app.curriculum_versions where school_id=school and id=programme.pack_version_id;end if;
 if command_name='course.configure'then select*into course from app.courses where school_id=school and id=target_id;select*into reference from app.curriculum_references where school_id=school and id=(payload->>'referenceId')::uuid;
  if course.id is null or not"authorization".can_manage_course(school,course.id)or reference.id is null or reference.pack_version_id<>programme.pack_version_id or course.class_id<>programme.class_id or course.subject_id<>programme.subject_id or reference.type not in('objective','outcome','criterion')or(reference.subject_id is not null and reference.subject_id<>course.subject_id)or(reference.year_group_id is not null and reference.year_group_id<>programme.year_group_id)then raise exception 'Course programme mismatch'using errcode='22023';end if;
 end if;
 if command_name='learner.configure'and not exists(select 1 from app.enrollments e join app.memberships m on m.school_id=e.school_id and m.actor_id=e.student_actor_id where e.school_id=school and e.class_id=programme.class_id and e.student_actor_id=(payload->>'learnerId')::uuid and e.status='active'and m.role='student'and m.status='active'and e.effective_from<=now()and(e.effective_to is null or e.effective_to>now()))then raise exception 'Programme learner denied'using errcode='42501';end if;
 if command_name in('programme.create','course.configure')and(not pack.synthetic or pack.kind<>'school_custom'or pack.source_status<>'VERIFIED'or pack.rights_status<>'PERMITTED')then raise exception 'Official pack requires academic and rights review'using errcode='22023';end if;
 reservation:=internal.begin_command(command_key,'curriculum.'||command_name,fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';end if;if reservation->>'state'<>'NEW'then raise exception 'Curriculum command in progress'using errcode='22023';end if;
 if command_name='version.create'then
  if (payload->>'synthetic')::boolean is distinct from true and(payload->>'sourceStatus'='VERIFIED'or payload->>'rightsStatus'='PERMITTED')or((payload->>'synthetic')::boolean and payload->>'kind'<>'school_custom')then raise exception 'Official source review required'using errcode='22023';end if;
  insert into app.curriculum_versions(school_id,pack_id,kind,framework,programme,version,scope,source_status,rights_status,source_location,source_checksum,synthetic,reason,created_by)values(school,payload->>'packId',payload->>'kind',payload->>'framework',payload->>'programme',payload->>'version',payload->>'scope',payload->>'sourceStatus',payload->>'rightsStatus',payload->>'sourceLocation',payload->>'sourceChecksum',(payload->>'synthetic')::boolean,payload->>'reason',actor)returning id into rid;
 elsif command_name='reference.create'then
  if not pack.synthetic then raise exception 'Official reference content requires source-locked import'using errcode='22023';end if;
  insert into app.curriculum_references(school_id,pack_version_id,parent_id,type,title,description,code,sequence,subject_id,year_group_id,created_by)values(school,pack.id,(payload->>'parentId')::uuid,payload->>'type',payload->>'title',payload->>'description',payload->>'code',(payload->>'sequence')::integer,(payload->>'subjectId')::uuid,(payload->>'yearGroupId')::uuid,actor)returning id into rid;
 elsif command_name='programme.create'then
  if(payload->>'confirmConfiguration')::boolean is distinct from true or not exists(select 1 from app.classes c where c.school_id=school and c.id=(payload->>'classId')::uuid and c.year_group_id=(payload->>'yearGroupId')::uuid and c.status='active')then raise exception 'Programme scope mismatch'using errcode='22023';end if;
  insert into app.programme_instances(school_id,pack_version_id,name,class_id,subject_id,year_group_id,created_by)values(school,pack.id,payload->>'name',(payload->>'classId')::uuid,(payload->>'subjectId')::uuid,(payload->>'yearGroupId')::uuid,actor)returning id into rid;
 elsif command_name='learner.configure'then
  if(payload->>'confirmAccessChange')::boolean is distinct from true then raise exception 'Human programme approval required'using errcode='22023';end if;
  insert into app.programme_learners(school_id,programme_id,learner_id,status,approved_by)values(school,programme.id,(payload->>'learnerId')::uuid,payload->>'status',actor)on conflict(school_id,programme_id,learner_id)do update set status=excluded.status,approved_by=excluded.approved_by,updated_at=clock_timestamp();rid:=programme.id;
 elsif command_name='overlay.configure'then
  if(payload->>'confirmConfiguration')::boolean is distinct from true or pack.kind<>payload->>'axis' then raise exception 'Overlay axis mismatch'using errcode='22023';end if;
  insert into app.school_framework_contexts(school_id,pack_version_id,axis,status,approved_by)values(school,pack.id,payload->>'axis',payload->>'status',actor)returning id into rid;
 elsif command_name='course.configure'then
  if(payload->>'confirmConfiguration')::boolean is distinct from true or(payload->>'expectedVersion')::integer<>1 or exists(select 1 from app.programme_course_contexts where school_id=school and course_id=course.id)then raise exception 'Used programme context immutable'using errcode='22023';end if;
  -- This explicitly approved synthetic school configuration is its academic owner; no official mapping is claimed.
  academic_id:=gen_random_uuid();rid:=gen_random_uuid();
  insert into app.school_custom_versions(school_id,id,version,created_by)values(school,rid,pack.version,actor);
  insert into app.school_custom_references(school_id,id,version_id,title,description,status,created_by,approved_by,approved_at)values(school,academic_id,rid,reference.title,reference.description,'APPROVED',actor,actor,clock_timestamp());
  insert into app.programme_course_contexts(school_id,course_id,programme_id,reference_id,academic_reference_id,approved_by)values(school,course.id,programme.id,reference.id,academic_id,actor);rid:=course.id;
 else raise exception 'Unknown curriculum command'using errcode='22023';end if;
 receipt:=jsonb_build_object('id',rid,'command',command_name,'schoolId',school,'academicReferenceId',academic_id);
 perform internal.append_audit('curriculum.'||command_name,'curriculum',rid,request_id,'succeeded','{}');perform internal.enqueue_event('curriculum.configured','curriculum',rid,1,'{}','curriculum:'||actor::text||':'||command_key);
 perform internal.finish_command(command_key,'curriculum.'||command_name,fingerprint,receipt);return receipt;
end$$;
do $$declare tab text;begin foreach tab in array array['curriculum_versions','curriculum_references','programme_instances','programme_learners','programme_course_contexts','school_framework_contexts']loop
 execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);
 execute format('create policy curriculum_read on app.%I for select to cuevo_api using("authorization".has_entitlement(school_id,''curriculum'')and"authorization".can_access_school(school_id)and"authorization".current_role(school_id)in(''admin'',''coordinator'',''teacher''))',tab);
 execute format('revoke all on app.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);execute format('grant select on app.%I to cuevo_api',tab);
 if tab<>'programme_learners'then execute format('create trigger immutable_history before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);end if;
end loop;end$$;
revoke execute on function internal.curriculum_config_require(),internal.configure_curriculum(text,uuid,jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.configure_curriculum(text,uuid,jsonb,text,text,text)to cuevo_api;
commit;
