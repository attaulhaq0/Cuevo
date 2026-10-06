begin;
-- Human choice context uses actual saved dates; version tokens are not dates.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_course_academic_references(uuid,integer,uuid)'::regprocedure);
 anchor:='reference.created_by,reference.approved_by,';
 if position(anchor in definition)=0 then raise exception 'Academic reference source context changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'reference.created_by,reference.approved_by,reference.created_at,reference.approved_at,version.created_at as version_created_at,');
 anchor:='''approvedBy'',approved_by,''parentTitle'',parent_title';
 if position(anchor in definition)=0 then raise exception 'Academic reference response context changed'using errcode='22023';end if;
 execute replace(definition,anchor,'''approvedBy'',approved_by,''createdAt'',created_at,''approvedAt'',approved_at,''versionCreatedAt'',version_created_at,''parentTitle'',parent_title');
end$$;
commit;
