-- Read the row being checked directly; stable self-lookups cannot see INSERT ... RETURNING rows.
begin;
drop policy courses_read on app.courses;
create policy courses_read on app.courses for select to cuevo_api using(
 "authorization".has_entitlement(school_id,'learning') and "authorization".can_view_class(school_id,class_id) and (
 ("authorization".can_teach_subject(school_id,class_id,subject_id) and (created_by="authorization".actor_id() or "authorization".current_role(school_id)='admin'))
 or "authorization".current_role(school_id)='coordinator'
 or (status='PUBLISHED' and "authorization".current_role(school_id) in ('student','parent')))
);
commit;
