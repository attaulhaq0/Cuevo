begin;
-- Bind the task purpose parameter rather than the learning_resources column.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.thinking_focus_source(text,uuid,text,uuid)'::regprocedure);
 anchor:='r.target_kind=case when target_kind=''criterion''then''assessment''else target_kind end and r.target_id=target_id and(v.state=''PUBLISHED''or(v.state=''ATTACHED''and case when target_kind=''activity''then content.state=''DRAFT''else assessment.status=''DRAFT''end))';
 replacement:='r.target_kind=case when thinking_focus_source.target_kind=''criterion''then''assessment''else thinking_focus_source.target_kind end and r.target_id=thinking_focus_source.target_id and(v.state=''PUBLISHED''or(v.state=''ATTACHED''and case when thinking_focus_source.target_kind=''activity''then content.state=''DRAFT''else assessment.status=''DRAFT''end))';
 if position(anchor in definition)=0 then raise exception 'Task source material predicate changed'using errcode='22023';end if;
 execute replace(definition,anchor,replacement);
end $$;
commit;
