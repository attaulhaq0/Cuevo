begin;
create function "authorization".programme_course_allowed(target_school uuid,target_course uuid,target_actor uuid)returns boolean language sql stable security definer set search_path=''as $$
select not exists(select 1 from app.programme_course_contexts where school_id=target_school and course_id=target_course)or exists(
 select 1 from app.programme_course_contexts context join app.programme_instances programme on programme.school_id=context.school_id and programme.id=context.programme_id join app.curriculum_versions pack on pack.school_id=programme.school_id and pack.id=programme.pack_version_id
 join app.programme_learners learner on learner.school_id=programme.school_id and learner.programme_id=programme.id where context.school_id=target_school and context.course_id=target_course and learner.learner_id=target_actor and learner.status='active'and pack.synthetic and pack.source_status='VERIFIED'and pack.rights_status='PERMITTED')
$$;
-- The established enrollment authorization stays in front of programme configuration.
do $$declare definition text;begin
 definition:=pg_get_functiondef('"authorization".can_learn_course(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'c.status=''PUBLISHED''','c.status=''PUBLISHED''and"authorization".programme_course_allowed(target_school,target_course,"authorization".actor_id())');
 execute definition;
end$$;
create function internal.programme_assessment_context()returns trigger language plpgsql security definer set search_path=''as $$
declare context app.programme_course_contexts;
begin
 select*into context from app.programme_course_contexts where school_id=new.school_id and course_id=new.course_id;
 if found and new.academic_reference_id is not null and new.academic_reference_id<>context.academic_reference_id then raise exception 'Assessment objective does not match the pinned programme'using errcode='22023';end if;
 return new;
end$$;
create trigger programme_assessment_context before insert or update on app.assessments for each row execute function internal.programme_assessment_context();
-- Prevent binding an already-used course to new semantics without rewriting its historical records.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.configure_curriculum(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'-- This explicitly approved synthetic school configuration is its academic owner;',
  'if exists(select 1 from app.assessments where school_id=school and course_id=course.id and academic_reference_id is not null)then raise exception ''Existing academic contexts prevent programme rebinding''using errcode=''22023'';end if;'||chr(10)||'-- This explicitly approved synthetic school configuration is its academic owner;');
 execute definition;
end$$;
revoke execute on function "authorization".programme_course_allowed(uuid,uuid,uuid),internal.programme_assessment_context()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function "authorization".programme_course_allowed(uuid,uuid,uuid)to cuevo_api;
commit;
