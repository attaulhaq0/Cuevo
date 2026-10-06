begin;
-- INSERT RETURNING policies must inspect the row directly; stable helper self-lookups cannot see a new row.
drop policy courses_read on app.courses;
create policy courses_read on app.courses for select to cuevo_api using(
 "authorization".active_class(school_id,class_id)and"authorization".has_entitlement(school_id,'learning')and"authorization".can_view_class(school_id,class_id)and(
 ("authorization".can_teach_subject(school_id,class_id,subject_id)and(created_by="authorization".actor_id()or"authorization".current_role(school_id)='admin'))
 or"authorization".current_role(school_id)='coordinator'
 or(status='PUBLISHED'and"authorization".current_role(school_id)='student'and"authorization".programme_course_allowed(school_id,id,"authorization".actor_id()))
 or(status='PUBLISHED'and"authorization".current_role(school_id)='parent'and"authorization".can_read_course(school_id,id))
 ));
commit;
