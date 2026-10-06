begin;
create table app.school_record_revisions(
 school_id uuid not null,resource text not null check(resource in('calendar','timetable','report-periods')),source_id uuid not null,revision integer not null check(revision>1),state text not null check(state in('CURRENT','CANCELLED')),record jsonb not null,reason text not null check(length(btrim(reason))between 1 and 1000),actor_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,resource,source_id,revision),foreign key(school_id,actor_id)references app.memberships(school_id,actor_id),check(jsonb_typeof(record)='object'and octet_length(record::text)<=16384)
);
alter table app.school_record_revisions enable row level security;alter table app.school_record_revisions force row level security;
revoke all on app.school_record_revisions from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger maintenance_immutable before update or delete on app.school_record_revisions for each row execute function internal.academic_history_immutable();
create trigger maintenance_no_truncate before truncate on app.school_record_revisions for each statement execute function internal.academic_history_immutable();
create function internal.school_record_current(target_resource text,target_source uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();answer jsonb;begin
 select record||jsonb_build_object('id',source_id,'revision',revision,'recordState',state)into answer from app.school_record_revisions where school_id=school and resource=target_resource and source_id=target_source order by revision desc limit 1;
 if answer is not null then return answer;end if;
 if target_resource='calendar'then select jsonb_build_object('id',id,'classId',class_id,'title',title,'description',description,'startsAt',starts_at,'endsAt',ends_at,'parentVisible',parent_visible,'revision',1,'recordState','CURRENT')into answer from app.calendar_events where school_id=school and id=target_source;
 elsif target_resource='timetable'then select jsonb_build_object('id',id,'classId',class_id,'subjectId',subject_id,'teacherId',teacher_id,'dayOfWeek',day_of_week,'startsAt',to_char(starts_at,'HH24:MI'),'endsAt',to_char(ends_at,'HH24:MI'),'effectiveFrom',effective_from,'effectiveTo',effective_to,'location',location,'revision',1,'recordState','CURRENT')into answer from app.timetable_entries where school_id=school and id=target_source;
 elsif target_resource='report-periods'then select jsonb_build_object('id',id,'termId',term_id,'name',name,'startsOn',starts_on,'endsOn',ends_on,'parentVisible',parent_visible,'revision',1,'recordState','CURRENT')into answer from app.report_periods where school_id=school and id=target_source;end if;
 return answer;
end$$;
create function internal.maintain_school_record(target_source uuid,payload jsonb,cancel boolean,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();resource_name text:=payload->>'resource';previous jsonb;next_record jsonb;revision_value integer;reservation jsonb;class uuid;term app.terms;slot record;other jsonb;
begin
 perform internal.require_school_admin();
 if resource_name not in('calendar','timetable','report-periods')or payload->'confirmChange'is distinct from'true'::jsonb or payload->>'reason'is null or length(btrim(payload->>'reason'))not between 1 and 1000 then raise exception 'Explicit maintenance approval required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(school::text||':school-record-maintenance',0));
 previous:=internal.school_record_current(resource_name,target_source);
 if previous is null then raise exception 'Current school source denied'using errcode='42501';end if;
 reservation:=internal.begin_command(command_key,'school.record.'||case when cancel then'cancel'else'edit'end,fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';end if;
 if reservation->>'state'<>'NEW'or(previous->>'revision')::integer is distinct from(payload->>'expectedRevision')::integer or previous->>'recordState'='CANCELLED'then raise exception 'School source version changed'using errcode='22023';end if;
 next_record:=case when cancel then previous-'id'-'revision'-'recordState'else payload->'record'end;
 if next_record is null or jsonb_typeof(next_record)<>'object'then raise exception 'Current record required'using errcode='22023';end if;
 class:=(next_record->>'classId')::uuid;
 if class is not null and not exists(select 1 from app.classes where school_id=school and id=class and status='active')then raise exception 'Current class required'using errcode='42501';end if;
 if not cancel then
  if resource_name='calendar'then
   if next_record->>'title'is null or length(btrim(next_record->>'title'))not between 1 and 200 or length(next_record->>'description')>2000 or(next_record->>'endsAt')::timestamptz<=(next_record->>'startsAt')::timestamptz or jsonb_typeof(next_record->'parentVisible')is distinct from'boolean'then raise exception 'Calendar fields invalid'using errcode='22023';end if;
  elsif resource_name='report-periods'then
   select*into term from app.terms where school_id=school and id=(next_record->>'termId')::uuid;
   if term.id is null or next_record->>'name'is null or length(btrim(next_record->>'name'))not between 1 and 200 or(next_record->>'endsOn')::date<=(next_record->>'startsOn')::date or(next_record->>'startsOn')::date<term.starts_on or(next_record->>'endsOn')::date>term.ends_on then raise exception 'Report period outside current term'using errcode='22023';end if;
  else
   if class is null or not exists(select 1 from app.teacher_assignments assignment join app.memberships member on member.school_id=assignment.school_id and member.actor_id=assignment.teacher_actor_id where assignment.school_id=school and assignment.class_id=class and assignment.subject_id=(next_record->>'subjectId')::uuid and assignment.teacher_actor_id=(next_record->>'teacherId')::uuid and assignment.status='active'and member.role='teacher'and member.status='active'and assignment.effective_from<=now()and(assignment.effective_to is null or assignment.effective_to>now()))or(next_record->>'dayOfWeek')::integer not between 0 and 6 or(next_record->>'endsAt')::time<=(next_record->>'startsAt')::time or(next_record->>'effectiveTo')::date<(next_record->>'effectiveFrom')::date then raise exception 'Timetable scope invalid'using errcode='22023';end if;
   for slot in select id from app.timetable_entries where school_id=school and id<>target_source loop
    other:=internal.school_record_current('timetable',slot.id);
    if other->>'recordState'<>'CANCELLED'and(other->>'classId'=next_record->>'classId'or other->>'teacherId'=next_record->>'teacherId')and other->>'dayOfWeek'=next_record->>'dayOfWeek'and(other->>'effectiveFrom')::date<=(next_record->>'effectiveTo')::date and(other->>'effectiveTo')::date>=(next_record->>'effectiveFrom')::date and(other->>'startsAt')::time<(next_record->>'endsAt')::time and(other->>'endsAt')::time>(next_record->>'startsAt')::time then raise exception 'Current timetable conflict'using errcode='22023';end if;
   end loop;
  end if;
 end if;
 revision_value:=(previous->>'revision')::integer+1;
 insert into app.school_record_revisions(school_id,resource,source_id,revision,state,record,reason,actor_id)values(school,resource_name,target_source,revision_value,case when cancel then'CANCELLED'else'CURRENT'end,next_record,payload->>'reason',"authorization".actor_id());
 perform internal.append_audit('school.record.'||case when cancel then'cancel'else'edit'end,resource_name,target_source,request_id,'succeeded',jsonb_build_object('revision',revision_value));
 perform internal.enqueue_event('school.updated','school_operation',target_source,revision_value,jsonb_build_object('command','record.'||case when cancel then'cancel'else'edit'end),'school-maintenance:'||command_key);
 next_record:=next_record||jsonb_build_object('id',target_source,'revision',revision_value,'recordState',case when cancel then'CANCELLED'else'CURRENT'end);
 perform internal.finish_command(command_key,'school.record.'||case when cancel then'cancel'else'edit'end,fingerprint,next_record);return next_record;
end$$;
-- Substitute only already-authorized sources, then recheck their current class and publication.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.named_school_page(text,jsonb)'::regprocedure);
 anchor:='context:=''{}''::jsonb;';
 if position(anchor in definition)=0 then raise exception 'Named source maintenance shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if resource in(''calendar'',''timetable'',''report-periods'')then item:=internal.school_record_current(resource,(item->>''id'')::uuid);if item->>''recordState''=''CANCELLED''then continue;end if;if resource in(''calendar'',''timetable'')and not"authorization".can_read_school_schedule(school,(item->>''classId'')::uuid)then continue;end if;if role_name=''parent''and resource=''calendar''and(item->>''parentVisible'')::boolean is distinct from true then continue;end if;end if;'||anchor);
 execute definition;
end$$;
revoke execute on function internal.school_record_current(text,uuid),internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.maintain_school_record(uuid,jsonb,boolean,text,text,text)to cuevo_api;
commit;
