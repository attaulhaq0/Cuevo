begin;
-- Marking IDs remain the release-command target. A separate field resolves history/correction identity.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.read_current_marking_page(integer,uuid)'::regprocedure);
 anchor:='jsonb_build_object(''id'',mark.id,''revision'',mark.revision,''model'',''numeric''';
 if position(anchor in definition)=0 then raise exception 'Numeric marking page identity shape changed'using errcode='22023';end if;
 replacement:='jsonb_build_object(''id'',mark.id,''resultId'',(select released.id from app.result_revisions released where released.school_id=mark.school_id and released.marking_id=mark.id),''revision'',mark.revision,''model'',''numeric''';
 definition:=replace(definition,anchor,replacement);
 anchor:='jsonb_build_object(''id'',mark.id,''revision'',mark.revision,''model'',''rubric''';
 if position(anchor in definition)=0 then raise exception 'Rubric marking page identity shape changed'using errcode='22023';end if;
 replacement:='jsonb_build_object(''id'',mark.id,''resultId'',(select released.id from app.rubric_result_revisions released where released.school_id=mark.school_id and released.marking_id=mark.id),''revision'',mark.revision,''model'',''rubric''';
 execute replace(definition,anchor,replacement);
end$$;
commit;
