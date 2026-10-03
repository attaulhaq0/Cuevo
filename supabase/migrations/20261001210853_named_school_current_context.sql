begin;
-- Names enrich only rows already admitted by the existing source authority. No directory grant.
create function internal.named_school_page(resource text,filters jsonb)returns jsonb
language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());page jsonb;items jsonb;item jsonb;context jsonb;learner uuid:=(filters->>'learnerId')::uuid;class_filter uuid:=(filters->>'classId')::uuid;lim integer:=(filters->>'limit')::integer;cursor_id uuid:=(filters->>'cursor')::uuid;
begin
 if not"authorization".school_operations_access(school)then raise exception 'School operations denied'using errcode='42501';end if;
 if resource='attendance-roster'then
  if role_name not in('admin','teacher')or class_filter is null or not"authorization".can_view_class(school,class_filter)then raise exception 'Current attendance class required'using errcode='42501';end if;
  if lim is null or lim not between 1 and 100 then raise exception 'Bounded school roster required'using errcode='22023';end if;
  select coalesce(jsonb_agg(source order by id),'[]'::jsonb)into items from(
   select person.actor_id id,jsonb_build_object('id',person.actor_id,'displayName',person.display_name,'classId',class.id,'className',class.name,'academicYearName',year.name)source
   from app.enrollments enrollment join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
   join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id join app.classes class on class.school_id=enrollment.school_id and class.id=enrollment.class_id join app.academic_years year on year.school_id=class.school_id and year.id=class.academic_year_id
   where enrollment.school_id=school and enrollment.class_id=class_filter and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())
   and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and class.status='active'
   and"authorization".can_record_attendance(school,class.id,person.actor_id)and(cursor_id is null or person.actor_id>cursor_id)order by person.actor_id limit lim+1
  )bounded;
  return jsonb_build_object('items',case when jsonb_array_length(items)>lim then items-(jsonb_array_length(items)-1)else items end,'nextCursor',case when jsonb_array_length(items)>lim then items->(lim-1)->>'id'else null end);
 end if;
 if learner is not null and not"authorization".can_view_person(school,learner)then raise exception 'Learner filter denied'using errcode='42501';end if;
 page:=internal.school_list(resource,filters);items:='[]'::jsonb;
 for item in select*from jsonb_array_elements(page->'items')loop
  -- A selected guardian child never inherits another child's class schedule.
  if resource in('timetable','calendar')and learner is not null and item->>'classId'is not null and not exists(
   select 1 from app.enrollments enrollment join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
   where enrollment.school_id=school and enrollment.class_id=(item->>'classId')::uuid and enrollment.student_actor_id=learner
   and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())
   and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))then continue;end if;
  context:='{}'::jsonb;
  if resource in('attendance','timetable','calendar')and item->>'classId'is not null then
   select jsonb_build_object('className',class.name,'academicYearName',year.name)into context from app.classes class join app.academic_years year on year.school_id=class.school_id and year.id=class.academic_year_id where class.school_id=school and class.id=(item->>'classId')::uuid;
  end if;
  if resource='attendance'then
   context:=coalesce(context,'{}'::jsonb)||jsonb_build_object('learnerName',(select display_name from app.people where school_id=school and actor_id=(item->>'learnerId')::uuid));
  elsif resource='timetable'then
   context:=coalesce(context,'{}'::jsonb)||jsonb_build_object('subjectName',(select name from app.subjects where school_id=school and id=(item->>'subjectId')::uuid),'teacherName',(select display_name from app.people where school_id=school and actor_id=(item->>'teacherId')::uuid));
  end if;
  items:=items||jsonb_build_array(item||coalesce(context,'{}'::jsonb));
 end loop;
 if octet_length(items::text)>500000 then raise exception 'School view requires bounded review'using errcode='22023';end if;
 return jsonb_set(page,'{items}',items);
end$$;
revoke execute on function internal.named_school_page(text,jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.named_school_page(text,jsonb)to cuevo_api;
commit;
