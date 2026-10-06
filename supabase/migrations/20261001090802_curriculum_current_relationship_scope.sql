begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.configure_curriculum(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'join app.memberships m on m.school_id=e.school_id and m.actor_id=e.student_actor_id where e.school_id=school',
  'join app.memberships m on m.school_id=e.school_id and m.actor_id=e.student_actor_id join app.classes cls on cls.school_id=e.school_id and cls.id=e.class_id where m.effective_from<=now()and(m.effective_to is null or m.effective_to>now())and cls.status=''active''and e.school_id=school');
 execute definition;
end$$;
drop policy curriculum_read on app.programme_learners;
create policy curriculum_read on app.programme_learners for select to cuevo_api using("authorization".has_entitlement(school_id,'curriculum')and"authorization".can_access_school(school_id)and("authorization".current_role(school_id)in('admin','coordinator')or("authorization".current_role(school_id)='teacher'and"authorization".can_view_person(school_id,learner_id)and exists(select 1 from app.programme_instances p where p.school_id=programme_learners.school_id and p.id=programme_learners.programme_id and"authorization".can_view_class(p.school_id,p.class_id)))));
commit;
