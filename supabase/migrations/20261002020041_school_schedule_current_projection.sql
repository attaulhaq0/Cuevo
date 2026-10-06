begin;
-- Current timetable conflicts use maintained slots rather than cancelled historical rows.
create function internal.current_timetable_conflict(input jsonb,excluded uuid)returns boolean language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source record;slot jsonb;begin
 for source in select id from app.timetable_entries where school_id=school and(excluded is null or id<>excluded)loop
  slot:=internal.school_record_current('timetable',source.id);
  if slot->>'recordState'<>'CANCELLED'and(slot->>'classId'=input->>'classId'or slot->>'teacherId'=input->>'teacherId')and slot->>'dayOfWeek'=input->>'dayOfWeek'
  and(slot->>'effectiveFrom')::date<=(input->>'effectiveTo')::date and(slot->>'effectiveTo')::date>=(input->>'effectiveFrom')::date and(slot->>'startsAt')::time<(input->>'endsAt')::time and(slot->>'endsAt')::time>(input->>'startsAt')::time then return true;end if;
 end loop;return false;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.school_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 anchor:='perform pg_advisory_xact_lock(hashtextextended(school::text||'':timetable'',0));';
 if position(anchor in definition)=0 then raise exception 'Timetable creation lock changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'perform pg_advisory_xact_lock(hashtextextended(school::text||'':school-record-maintenance'',0));'||anchor);
 anchor:='exists(select 1 from app.timetable_entries t where t.school_id=school and(t.class_id=(payload->>''classId'')::uuid or t.teacher_id=(payload->>''teacherId'')::uuid)and t.day_of_week=(payload->>''dayOfWeek'')::integer and t.effective_from<=(payload->>''effectiveTo'')::date and t.effective_to>=(payload->>''effectiveFrom'')::date and t.starts_at<(payload->>''endsAt'')::time and t.ends_at>(payload->>''startsAt'')::time)';
 if position(anchor in definition)=0 then raise exception 'Timetable creation source conflict changed'using errcode='22023';end if;
 execute replace(definition,anchor,'internal.current_timetable_conflict(payload,null)');
end$$;
-- A selected child's current schedule must be authorized after applying the current revision too.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.named_school_page(text,jsonb)'::regprocedure);
 anchor:='context:=''{}''::jsonb;';if position(anchor in definition)=0 then raise exception 'Named schedule revision shape changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if resource in(''calendar'',''timetable'')and learner is not null and item->>''classId''is not null and not exists(select 1 from app.enrollments enrollment join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id where enrollment.school_id=school and enrollment.class_id=(item->>''classId'')::uuid and enrollment.student_actor_id=learner and enrollment.status=''active''and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and member.role=''student''and member.status=''active''and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now()))then continue;end if;'||anchor);
end$$;
revoke execute on function internal.current_timetable_conflict(jsonb,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
