begin;
-- Complete target receipts make authorized absence distinguishable from a lost row.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.read_thinking_focus_set(jsonb)'::regprocedure);
 anchor:='continue;end if;';
 replacement:='items:=items||jsonb_build_array(jsonb_build_object(''target'',jsonb_build_object(''kind'',''ACTIVITY'',''id'',target->>''id'',''criterionKey'',null),''courseId'',internal.learning_content_course(''activity'',(target->>''id'')::uuid),''classification'',null));continue;end if;';
 if position(anchor in definition)=0 then raise exception 'Absent activity receipt loop changed'using errcode='22023';end if;definition:=replace(definition,anchor,replacement);
 anchor:='if item->>''status''<>''UNCLASSIFIED''then items:=items||jsonb_build_array(jsonb_set(item,''{source,instructions}'',''""''::jsonb));end if;';
 replacement:='if item->>''status''=''UNCLASSIFIED''then items:=items||jsonb_build_array(jsonb_build_object(''target'',item->''target'',''courseId'',item->''courseId'',''classification'',null));else items:=items||jsonb_build_array(jsonb_set(item,''{source,instructions}'',''""''::jsonb));end if;';
 if position(anchor in definition)=0 then raise exception 'Absent source receipt loop changed'using errcode='22023';end if;execute replace(definition,anchor,replacement);
end $$;
commit;
