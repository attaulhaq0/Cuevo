begin;
create or replace function "authorization".can_record_attendance(target_school uuid,target_class uuid,target_student uuid)returns boolean language sql stable security definer set search_path=''as $$
select coalesce("authorization".school_operations_access(target_school)and"authorization".current_role(target_school)in('admin','teacher')and"authorization".can_view_class(target_school,target_class)and"authorization".can_view_person(target_school,target_student)and exists(
 select 1 from app.enrollments e join app.classes c on c.school_id=e.school_id and c.id=e.class_id join app.memberships m on m.school_id=e.school_id and m.actor_id=e.student_actor_id
 where e.school_id=target_school and e.class_id=target_class and e.student_actor_id=target_student and c.status='active'and m.role='student'and m.status='active'and m.effective_from<=now()and(m.effective_to is null or m.effective_to>now())and e.status='active'and e.effective_from<=now()and(e.effective_to is null or e.effective_to>now())),false)
$$;
revoke execute on function "authorization".can_record_attendance(uuid,uuid,uuid)from public,anon,authenticated,service_role,cuevo_worker;
grant execute on function "authorization".can_record_attendance(uuid,uuid,uuid)to cuevo_api;
commit;
