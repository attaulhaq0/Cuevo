begin;
-- Retained history permission is distinct from authoring a new exact source.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.thinking_focus_projection(uuid,jsonb,boolean)'::regprocedure);
 anchor:='''canAuthor'',mutable and"authorization".can_manage_course(school,r.course_id)';
 replacement:='''canAuthor'',mutable and"authorization".can_manage_course(school,r.course_id)and not(r.kind=''criterion''and source->''source''->>''criterionTitle''is null)and not(r.kind=''activity''and exists(select 1 from app.learning_content_revisions v where v.school_id=school and v.id=(source->>''contentRevisionId'')::uuid and v.state=''RETIRED''))';
 if position(anchor in definition)=0 then raise exception 'Task focus permission projection changed'using errcode='22023';end if;
 execute replace(definition,anchor,replacement);
end $$;
commit;
