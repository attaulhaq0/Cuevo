begin;
-- Absent activity metadata delegates to the existing canonical content visibility
-- predicate. Classified sources and assessments still use exact source resolution.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_thinking_focus_set(jsonb)'::regprocedure);
 anchor:='for target in select t from jsonb_array_elements(targets)t loop';
 if position(anchor in definition)=0 then raise exception 'Task focus page loop changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if not"authorization".has_entitlement("authorization".school_id(),''learning'')or"authorization".current_role("authorization".school_id())is null or"authorization".current_role("authorization".school_id())not in(''admin'',''teacher'',''coordinator'',''student'',''parent'')then raise exception ''Task metadata page denied''using errcode=''42501'';end if;'||chr(10)||' '||anchor||chr(10)||'  if target->>''kind''=''activity''and not exists(select 1 from app.thinking_focus_current c where c.school_id="authorization".school_id()and c.kind=''activity''and c.source_id=(target->>''id'')::uuid and c.criterion_key='''')then if not internal.learning_content_visible(''activity'',(target->>''id'')::uuid)then raise exception ''Current activity metadata source denied''using errcode=''42501'';end if;continue;end if;');
end $$;
commit;
