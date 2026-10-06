begin;
-- An administrator can review action provenance without receiving audit metadata or pupil work.
create function internal.read_school_audit(filters jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();lim integer:=(filters->>'limit')::integer;cursor_id uuid:=(filters->>'cursor')::uuid;rows jsonb;items jsonb;
begin
 if not"authorization".school_operations_access(school)or"authorization".current_role(school)<>'admin'then raise exception 'School audit denied'using errcode='42501';end if;
 if lim is null or lim not between 1 and 100 then raise exception 'Bounded audit review required'using errcode='22023';end if;
 with bounded as materialized(select audit.*from internal.audit_events audit where audit.school_id=school and(cursor_id is null or audit.id>cursor_id)order by audit.id limit lim+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',audit.id,'actorName',person.display_name,'action',audit.action,'objectType',audit.entity_type,'objectId',audit.entity_id,
 'objectName',case when audit.entity_type='school'then(select name from app.schools where id=school)when audit.entity_type in('course','learning')then(select title from app.courses where school_id=school and id=audit.entity_id)when audit.entity_type='attendance'then(select 'Attendance · '||to_char(occurred_on,'YYYY-MM-DD')from app.attendance_revisions where school_id=school and id=audit.entity_id)else null end,
 'outcome',audit.outcome,'occurredAt',audit.occurred_at,'requestId',audit.request_id)order by audit.id),'[]'::jsonb)into rows from bounded audit left join app.people person on person.school_id=audit.school_id and person.actor_id=audit.actor_id;
 if octet_length(rows::text)>250000 then raise exception 'Audit review requires a smaller page'using errcode='22023';end if;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)into items from jsonb_array_elements(rows)with ordinality entries(item,ordinal)where ordinal<=lim;
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(rows)>lim then items->(lim-1)->>'id'else null end);
end$$;
revoke execute on function internal.read_school_audit(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_school_audit(jsonb)to cuevo_api;
commit;
