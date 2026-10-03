begin;
-- Apply current record ownership/publication before paging. Original records and
-- their RLS remain historical; the private projection has its own current checks.
create function internal.current_school_schedule_page(resource text,filters jsonb)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());lim integer;cursor_id uuid;learner uuid;class_filter uuid;items jsonb;
begin
 if not"authorization".school_operations_access(school)then raise exception 'School schedule denied'using errcode='42501';end if;
 if resource is null or resource not in('calendar','timetable','report-periods')or filters is null or jsonb_typeof(filters)<>'object'or filters-array['limit','cursor','learnerId','classId']<>'{}'::jsonb then raise exception 'Current schedule filter invalid'using errcode='22023';end if;
 lim:=(filters->>'limit')::integer;cursor_id:=(filters->>'cursor')::uuid;learner:=(filters->>'learnerId')::uuid;class_filter:=(filters->>'classId')::uuid;
 if lim is null or lim not between 1 and 100 then raise exception 'Bounded schedule required'using errcode='22023';end if;
 if resource='report-periods'and role_name not in('admin','coordinator','teacher')then raise exception 'Reporting period staff scope required'using errcode='42501';end if;
 if learner is not null and not"authorization".can_view_person(school,learner)then raise exception 'Schedule learner denied'using errcode='42501';end if;
 if class_filter is not null and not"authorization".can_view_class(school,class_filter)then raise exception 'Schedule class denied'using errcode='42501';end if;
 with source_ids as materialized(
  select id from app.calendar_events where school_id=school and resource='calendar'
  union all select id from app.timetable_entries where school_id=school and resource='timetable'
  union all select id from app.report_periods where school_id=school and resource='report-periods'
 ),current_records as materialized(
  select id,internal.school_record_current(resource,id)row from source_ids where cursor_id is null or id>cursor_id
 ),permitted as(
  select id,row from current_records where row is not null and row->>'recordState'='CURRENT'
   and(resource='report-periods'or((class_filter is null or(row->>'classId')::uuid=class_filter)
    and"authorization".can_read_school_schedule(school,(row->>'classId')::uuid)
    and(role_name<>'parent'or resource<>'calendar'or row->'parentVisible'='true'::jsonb)
    and(learner is null or row->>'classId'is null or exists(select 1 from app.enrollments enrollment join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
     where enrollment.school_id=school and enrollment.class_id=(row->>'classId')::uuid and enrollment.student_actor_id=learner and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())))))
  order by id limit lim+1
 )select coalesce(jsonb_agg(row order by id),'[]'::jsonb)into items from permitted;
 if octet_length(items::text)>500000 then raise exception 'Current schedule requires bounded review'using errcode='22023';end if;
 return jsonb_build_object('items',case when jsonb_array_length(items)>lim then items-lim else items end,'nextCursor',case when jsonb_array_length(items)>lim then items->(lim-1)->>'id'else null end);
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.named_school_page(text,jsonb)'::regprocedure);anchor:='page:=internal.school_list(resource,filters);';
 if position(anchor in definition)=0 then raise exception 'Named school source selection changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if resource in(''calendar'',''timetable'',''report-periods'')then page:=internal.current_school_schedule_page(resource,filters);else '||anchor||'end if;');
 definition:=pg_get_functiondef('internal.school_context()'::regprocedure);
 anchor:='internal.school_list(''attendance'',''{"limit":25}'')';if position(anchor in definition)=0 then raise exception 'School context attendance source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'internal.named_school_page(''attendance'',''{"limit":25}'')');
 anchor:='internal.school_list(''timetable'',''{"limit":25}'')';if position(anchor in definition)=0 then raise exception 'School context timetable source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'internal.named_school_page(''timetable'',''{"limit":25}'')');
 anchor:='internal.school_list(''calendar'',''{"limit":25}'')';if position(anchor in definition)=0 then raise exception 'School context calendar source changed'using errcode='22023';end if;
 execute replace(definition,anchor,'internal.named_school_page(''calendar'',''{"limit":25}'')');
end$$;
revoke execute on function internal.current_school_schedule_page(text,jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
