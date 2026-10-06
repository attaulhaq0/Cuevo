-- Current human selection context. No new identity, recipient grants or historical caption token.
begin;

create function internal.school_selection_key(value text)returns text language sql immutable set search_path=''as $$
 select lower(regexp_replace(btrim(normalize(coalesce(value,''),NFKC)),'[[:space:]]+',' ','g'))
$$;

create function internal.school_person_selection_candidates(target_class uuid default null)
returns table(id uuid,record jsonb,selection_context jsonb)language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor_role text:="authorization".current_role("authorization".school_id());begin
 if not"authorization".school_operations_access(school)then raise exception 'Current School selection scope required'using errcode='42501';end if;
 if target_class is null then
  if actor_role not in('admin','coordinator')then raise exception 'Current School directory scope required'using errcode='42501';end if;
 elsif actor_role not in('admin','teacher')or not"authorization".can_view_class(school,target_class)then raise exception 'Current attendance class required'using errcode='42501';end if;
 return query
 with admitted as materialized(
  select member.actor_id,person.display_name,member.role,member.status,member.effective_from,member.effective_to,member.revision,person.synthetic
  from app.memberships member join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id
  where member.school_id=school and(target_class is null or(member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and"authorization".can_record_attendance(school,target_class,member.actor_id)))
 ),contexts as materialized(
  select admitted.*,context.amount,context.valid,context.classes,
   case when context.amount>25 or not context.valid then'UNAVAILABLE'when context.amount=0 then'NONE'else'CURRENT'end as enrollment_state
  from admitted cross join lateral(
   select count(*)amount,coalesce(bool_and(nullif(btrim(source.class_name),'')is not null and nullif(btrim(source.group_name),'')is not null and nullif(btrim(source.year_name),'')is not null),true)valid,
    coalesce(jsonb_agg(jsonb_build_object('className',source.class_name,'yearGroupName',source.group_name,'academicYearName',source.year_name)order by internal.school_selection_key(source.class_name),internal.school_selection_key(source.group_name),internal.school_selection_key(source.year_name)),'[]'::jsonb)classes
   from(select class.name class_name,year_group.name group_name,academic_year.name year_name
    from app.enrollments enrollment join app.classes class on class.school_id=enrollment.school_id and class.id=enrollment.class_id
    join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id
    join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
    where enrollment.school_id=school and enrollment.student_actor_id=admitted.actor_id and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and class.status='active'
    and"authorization".can_view_class(school,class.id)and(target_class is null or class.id=target_class)
    order by class.id limit 26)source
  )context
 ),keys as materialized(
  select contexts.*,jsonb_build_array(internal.school_selection_key(display_name),role,
   case when enrollment_state='UNAVAILABLE'then'[]'::jsonb else(select coalesce(jsonb_agg(jsonb_build_array(internal.school_selection_key(item->>'className'),internal.school_selection_key(item->>'yearGroupName'),internal.school_selection_key(item->>'academicYearName'))order by internal.school_selection_key(item->>'className'),internal.school_selection_key(item->>'yearGroupName'),internal.school_selection_key(item->>'academicYearName')),'[]'::jsonb)from jsonb_array_elements(classes)item)end)::text caption_key
  from contexts
 ),marked as materialized(select keys.*,count(*)over(partition by caption_key)duplicates from keys)
 select marked.actor_id,
  jsonb_build_object('id',marked.actor_id,'displayName',nullif(btrim(marked.display_name),''),'role',marked.role,'status',marked.status,'effectiveFrom',marked.effective_from,'effectiveTo',marked.effective_to,'synthetic',marked.synthetic,'revision',marked.revision),
  jsonb_build_object('status',case when marked.duplicates=1 and marked.enrollment_state<>'UNAVAILABLE'and nullif(btrim(marked.display_name),'')is not null then'READY'else'REQUIRES_REVIEW'end,'enrollmentState',marked.enrollment_state,'classes',case when marked.enrollment_state='CURRENT'then marked.classes else'[]'::jsonb end)
 from marked;
end$$;

create function internal.school_person_selection_context(target_person uuid,target_class uuid default null)returns jsonb
language sql stable security definer set search_path=''as $$select candidate.selection_context from internal.school_person_selection_candidates(target_class)candidate where candidate.id=target_person$$;

create function internal.school_record_selection_candidates(resource text)returns table(id uuid,record jsonb)
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();begin
 if not"authorization".school_operations_access(school)or"authorization".current_role(school)not in('admin','coordinator','teacher')then raise exception 'Current School staff selection scope required'using errcode='42501';end if;
 return query
 with admitted as materialized(
  select year.id,jsonb_build_object('id',year.id,'name',year.name,'startsOn',year.starts_on,'endsOn',year.ends_on)record,jsonb_build_array(internal.school_selection_key(year.name),year.starts_on,year.ends_on)::text caption from app.academic_years year where resource='years'and year.school_id=school
  union all select year_group.id,jsonb_build_object('id',year_group.id,'name',year_group.name,'ordinal',year_group.ordinal),jsonb_build_array(internal.school_selection_key(year_group.name),year_group.ordinal)::text from app.year_groups year_group where resource='year-groups'and year_group.school_id=school
  union all select class.id,jsonb_build_object('id',class.id,'name',class.name,'academicYearId',class.academic_year_id,'yearGroupId',class.year_group_id,'status',class.status,'academicYearName',academic_year.name,'yearGroupName',year_group.name),jsonb_build_array(internal.school_selection_key(class.name),internal.school_selection_key(year_group.name),internal.school_selection_key(academic_year.name))::text from app.classes class join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id where resource='classes'and class.school_id=school and"authorization".can_view_class(school,class.id)
  union all select term.id,jsonb_build_object('id',term.id,'name',term.name,'academicYearId',term.academic_year_id,'academicYearName',academic_year.name,'startsOn',term.starts_on,'endsOn',term.ends_on),jsonb_build_array(internal.school_selection_key(term.name),internal.school_selection_key(academic_year.name),term.starts_on,term.ends_on)::text from app.terms term join app.academic_years academic_year on academic_year.school_id=term.school_id and academic_year.id=term.academic_year_id where resource='terms'and term.school_id=school
  union all select subject.id,jsonb_build_object('id',subject.id,'name',subject.name),internal.school_selection_key(subject.name)from app.subjects subject where resource='subjects'and subject.school_id=school
 ),marked as materialized(select admitted.*,count(*)over(partition by caption)duplicates from admitted)
 select marked.id,marked.record||jsonb_build_object('name',nullif(btrim(marked.record->>'name'),''))
  ||case when marked.record?'academicYearName'then jsonb_build_object('academicYearName',nullif(btrim(marked.record->>'academicYearName'),''))else'{}'::jsonb end
  ||case when marked.record?'yearGroupName'then jsonb_build_object('yearGroupName',nullif(btrim(marked.record->>'yearGroupName'),''))else'{}'::jsonb end
  ||jsonb_build_object('selectionStatus',case when marked.duplicates=1 and nullif(btrim(marked.record->>'name'),'')is not null
   and(not marked.record?'academicYearName'or nullif(btrim(marked.record->>'academicYearName'),'')is not null)
   and(not marked.record?'yearGroupName'or nullif(btrim(marked.record->>'yearGroupName'),'')is not null)then'READY'else'REQUIRES_REVIEW'end)from marked;
end$$;

create function internal.read_school_selection_page(resource text,filters jsonb)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare page_limit integer:=(filters->>'limit')::integer;page_cursor uuid:=(filters->>'cursor')::uuid;target_class uuid:=(filters->>'classId')::uuid;items jsonb;begin
 if page_limit is null or page_limit not between 1 and 100 or resource not in('people','attendance-roster','classes','years','year-groups','terms','subjects')then raise exception 'Bounded School selection required'using errcode='22023';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended("authorization".school_id()::text||':school-access-mutations',0));
 if filters->>'learnerId'is not null and not"authorization".can_view_person("authorization".school_id(),(filters->>'learnerId')::uuid)then raise exception 'Current learner filter scope required'using errcode='42501';end if;
 if target_class is not null and not"authorization".can_view_class("authorization".school_id(),target_class)then raise exception 'Current class filter scope required'using errcode='42501';end if;
 if resource in('people','attendance-roster')then
  if resource='attendance-roster'and target_class is null then raise exception 'Exact attendance class required'using errcode='22023';end if;
  with candidates as materialized(select *from internal.school_person_selection_candidates(case when resource='attendance-roster'then target_class else null end)),bounded as(
   select candidate.id,case when resource='people'then candidate.record else jsonb_build_object('id',candidate.id,'displayName',candidate.record->>'displayName','classId',target_class,'className',candidate.selection_context->'classes'->0->>'className','yearGroupName',candidate.selection_context->'classes'->0->>'yearGroupName','academicYearName',candidate.selection_context->'classes'->0->>'academicYearName')end||jsonb_build_object('selectionContext',candidate.selection_context)record
   from candidates candidate where(page_cursor is null or candidate.id>page_cursor)order by candidate.id limit page_limit+1)
  select coalesce(jsonb_agg(record order by id),'[]'::jsonb)into items from bounded;
 else
  with candidates as materialized(select *from internal.school_record_selection_candidates(resource)),bounded as(select *from candidates where(page_cursor is null or candidates.id>page_cursor)order by candidates.id limit page_limit+1)
  select coalesce(jsonb_agg(record order by id),'[]'::jsonb)into items from bounded;
 end if;
 if octet_length(items::text)>500000 then raise exception 'School selection capacity requires review'using errcode='22023';end if;
 return jsonb_build_object('items',case when jsonb_array_length(items)>page_limit then items-(jsonb_array_length(items)-1)else items end,'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;

alter function internal.named_school_page(text,jsonb)rename to named_school_page_before_selection;
create function internal.named_school_page(resource text,filters jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if resource in('people','attendance-roster','classes','years','year-groups','terms','subjects')then return internal.read_school_selection_page(resource,filters);end if;
 return internal.named_school_page_before_selection(resource,filters);
end$$;

create function internal.require_school_person_selection(target_person uuid,target_class uuid default null)returns void
language plpgsql stable security definer set search_path=''as $$begin
 if not exists(select 1 from app.memberships member join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id join auth.users account on account.id=member.actor_id where member.school_id="authorization".school_id()and member.actor_id=target_person and account.deleted_at is null)then raise exception 'Exact current School person required'using errcode='42501';end if;
 if internal.school_person_selection_context(target_person,target_class)->>'status'is distinct from'READY'then raise exception 'Review current person identity before this action'using errcode='22023';end if;
end$$;
create function internal.require_school_record_selection(resource text,target_id uuid)returns void language plpgsql stable security definer set search_path=''as $$begin
 if not exists(select 1 from internal.school_record_selection_candidates(resource)candidate where candidate.id=target_id)then raise exception 'Exact current School record required'using errcode='42501';end if;
 if not exists(select 1 from internal.school_record_selection_candidates(resource)candidate where candidate.id=target_id and candidate.record->>'selectionStatus'='READY')then raise exception 'Review current School record context before this action'using errcode='22023';end if;
end$$;

alter function internal.school_command(text,uuid,jsonb,text,text,text)rename to school_command_before_selection;
create function internal.school_command(command_name text,target_id uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb
language plpgsql security definer set search_path=''as $$begin
 perform internal.validate_school_payload(command_name,payload);
 perform pg_advisory_xact_lock(hashtextextended("authorization".school_id()::text||':school-access-mutations',0));
 if command_name='attendance.record'then
  if not"authorization".can_record_attendance("authorization".school_id(),(payload->>'classId')::uuid,(payload->>'studentId')::uuid)then raise exception 'Current attendance scope required'using errcode='42501';end if;
  perform internal.require_school_person_selection((payload->>'studentId')::uuid,(payload->>'classId')::uuid);
 else
  perform internal.require_school_admin();
  if command_name in('enrollment.configure','assignment.configure','guardian.configure')then
   if not exists(select 1 from app.memberships member join auth.users account on account.id=member.actor_id where member.school_id="authorization".school_id()and member.actor_id=case when command_name='enrollment.configure'then(payload->>'studentId')::uuid when command_name='assignment.configure'then(payload->>'teacherId')::uuid else(payload->>'parentId')::uuid end and member.role=case when command_name='enrollment.configure'then'student'when command_name='assignment.configure'then'teacher'else'parent'end and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and account.deleted_at is null)then raise exception 'Current provisioned role required'using errcode='42501';end if;
   if command_name='guardian.configure'and not exists(select 1 from app.memberships member join auth.users account on account.id=member.actor_id where member.school_id="authorization".school_id()and member.actor_id=(payload->>'studentId')::uuid and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and account.deleted_at is null)then raise exception 'Current learner required'using errcode='42501';end if;
  end if;
  if command_name in('enrollment.configure','assignment.configure','timetable.create')or(command_name='calendar.create'and payload->>'classId'is not null)then
   if not exists(select 1 from app.classes class where class.school_id="authorization".school_id()and class.id=(payload->>'classId')::uuid and class.status='active')then raise exception 'Current class required'using errcode='42501';end if;
  end if;
  if command_name in('assignment.configure','timetable.create')and not exists(select 1 from app.subjects subject where subject.school_id="authorization".school_id()and subject.id=(payload->>'subjectId')::uuid)then raise exception 'Current subject required'using errcode='42501';end if;
  if command_name='timetable.create'and not exists(select 1 from app.teacher_assignments assignment join app.memberships member on member.school_id=assignment.school_id and member.actor_id=assignment.teacher_actor_id join app.classes class on class.school_id=assignment.school_id and class.id=assignment.class_id where assignment.school_id="authorization".school_id()and assignment.class_id=(payload->>'classId')::uuid and assignment.subject_id=(payload->>'subjectId')::uuid and assignment.teacher_actor_id=(payload->>'teacherId')::uuid and assignment.status='active'and assignment.effective_from<=now()and(assignment.effective_to is null or assignment.effective_to>now())and member.role='teacher'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())and class.status='active')then raise exception 'Teacher timetable scope denied'using errcode='42501';end if;
  if command_name='person.configure'then perform internal.require_school_person_selection(target_id);
  elsif command_name='enrollment.configure'then perform internal.require_school_person_selection((payload->>'studentId')::uuid);
  elsif command_name='assignment.configure'then perform internal.require_school_person_selection((payload->>'teacherId')::uuid);
  elsif command_name='guardian.configure'then perform internal.require_school_person_selection((payload->>'parentId')::uuid);perform internal.require_school_person_selection((payload->>'studentId')::uuid);
  elsif command_name='timetable.create'then perform internal.require_school_person_selection((payload->>'teacherId')::uuid);
  end if;
 end if;
 if command_name in('enrollment.configure','assignment.configure','attendance.record','timetable.create')or(command_name='calendar.create'and payload->>'classId'is not null)then perform internal.require_school_record_selection('classes',(payload->>'classId')::uuid);end if;
 if command_name in('assignment.configure','timetable.create')then perform internal.require_school_record_selection('subjects',(payload->>'subjectId')::uuid);end if;
 if command_name in('term.create','class.create')then perform internal.require_school_record_selection('years',(payload->>'academicYearId')::uuid);end if;
 if command_name='class.create'then perform internal.require_school_record_selection('year-groups',(payload->>'yearGroupId')::uuid);end if;
 if command_name='reportperiod.create'then perform internal.require_school_record_selection('terms',(payload->>'termId')::uuid);end if;
 return internal.school_command_before_selection(command_name,target_id,payload,command_key,fingerprint,request_id);
end$$;

alter function internal.create_school_account_recovery(uuid,jsonb,text,text,text)rename to create_school_account_recovery_before_selection;
-- Insert identity review after every canonical recipient/runtime/payload check and before begin/replay.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.create_school_account_recovery_before_selection(uuid,jsonb,text,text,text)'::regprocedure);
 anchor:='reservation:=internal.begin_command(v_key,''school.account.recovery.request'',v_fingerprint);';
 if position(anchor in definition)=0 then raise exception 'Canonical recovery command boundary changed';end if;
 definition:=replace(definition,'internal.create_school_account_recovery_before_selection','internal.create_school_account_recovery');
 definition:=replace(definition,anchor,'perform internal.require_school_person_selection(v_user);'||chr(10)||anchor);
 execute definition;
end$$;

-- Name/class maintenance shares admission serialization; existing maintenance/replay authority is unchanged.
alter function internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)rename to maintain_school_record_before_selection;
create function internal.maintain_school_record(target_id uuid,payload jsonb,cancel boolean,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$begin
 perform internal.require_school_admin();perform pg_advisory_xact_lock(hashtextextended("authorization".school_id()::text||':school-access-mutations',0));
 return internal.maintain_school_record_before_selection(target_id,payload,cancel,command_key,fingerprint,request_id);
end$$;

revoke execute on function internal.school_selection_key(text),internal.school_person_selection_candidates(uuid),internal.school_person_selection_context(uuid,uuid),internal.school_record_selection_candidates(text),internal.read_school_selection_page(text,jsonb),internal.require_school_person_selection(uuid,uuid),internal.require_school_record_selection(text,uuid),internal.named_school_page_before_selection(text,jsonb),internal.school_command_before_selection(text,uuid,jsonb,text,text,text),internal.create_school_account_recovery_before_selection(uuid,jsonb,text,text,text),internal.named_school_page(text,jsonb),internal.school_command(text,uuid,jsonb,text,text,text),internal.create_school_account_recovery(uuid,jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.named_school_page(text,jsonb),internal.school_command(text,uuid,jsonb,text,text,text),internal.create_school_account_recovery(uuid,jsonb,text,text,text)to cuevo_api;
revoke execute on function internal.maintain_school_record_before_selection(uuid,jsonb,boolean,text,text,text),internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)to cuevo_api;
commit;
