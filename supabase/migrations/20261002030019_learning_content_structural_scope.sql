begin;
-- Structural insert guards validate same-school FK hierarchy without an actor read permission.
create or replace function internal.learning_content_initial()returns trigger language plpgsql security definer set search_path=''as $$declare resource text;course uuid;title text;content text;kind text;state text;rid uuid;actor uuid;begin
 resource:=case tg_table_name when'courses'then'course'when'units'then'unit'when'lessons'then'lesson'else'activity'end;title:=new.title;kind:=case when resource='activity'then to_jsonb(new)->>'kind'else null end;content:=case resource when'course'then to_jsonb(new)->>'description'when'unit'then''when'lesson'then to_jsonb(new)->>'body'else to_jsonb(new)->>'instructions'end;
 if resource='course'then course:=new.id;elsif resource='unit'then course:=(to_jsonb(new)->>'course_id')::uuid;elsif resource='lesson'then select u.course_id into course from app.units u where u.school_id=new.school_id and u.id=(to_jsonb(new)->>'unit_id')::uuid;else select u.course_id into course from app.lessons l join app.units u on u.school_id=l.school_id and u.id=l.unit_id where l.school_id=new.school_id and l.id=(to_jsonb(new)->>'lesson_id')::uuid;end if;
 actor:=case when resource='course'then(to_jsonb(new)->>'created_by')::uuid else(select c.created_by from app.courses c where c.school_id=new.school_id and c.id=course)end;
 state:=case when resource='course'and to_jsonb(new)->>'status'='DRAFT'or coalesce((to_jsonb(new)->>'content_preparation')::boolean,false)or(resource='activity'and kind in('assignment','quiz'))then'DRAFT'else'PUBLISHED'end;
 insert into app.learning_content_revisions(school_id,resource,source_id,course_id,revision,title,content,kind,state,reason,created_by)values(new.school_id,resource,new.id,course,1,title,content,kind,state,'Original school-authored source registered.',actor)returning id into rid;insert into app.learning_content_current(school_id,resource,source_id,draft_revision_id,published_revision_id)values(new.school_id,resource,new.id,rid,case when state='PUBLISHED'then rid else null end);return new;
end$$;
create or replace function internal.learning_content_source_guard()returns trigger language plpgsql security definer set search_path=''as $$declare source_course uuid;begin
 if new.resource='course'then select c.id into source_course from app.courses c where c.school_id=new.school_id and c.id=new.source_id;
 elsif new.resource='unit'then select u.course_id into source_course from app.units u where u.school_id=new.school_id and u.id=new.source_id;
 elsif new.resource='lesson'then select u.course_id into source_course from app.lessons l join app.units u on u.school_id=l.school_id and u.id=l.unit_id where l.school_id=new.school_id and l.id=new.source_id;
 else select u.course_id into source_course from app.activities a join app.lessons l on l.school_id=a.school_id and l.id=a.lesson_id join app.units u on u.school_id=l.school_id and u.id=l.unit_id where a.school_id=new.school_id and a.id=new.source_id;end if;
 if source_course is null or source_course is distinct from new.course_id then raise exception 'Exact content source course required'using errcode='42501';end if;return new;
end$$;
commit;
