begin;
-- Retired task identity remains available to its authorized reviewer/history queue.
-- Current learner presentation and every new mapping command remain fail-closed.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.thinking_focus_source(text,uuid,text,uuid)'::regprocedure);
 anchor:='if content.id is null or content.state=''RETIRED''or(not staff and(content.state<>''PUBLISHED''or not internal.learning_content_ancestors_visible(''activity'',target_id)))';
 if position(anchor in definition)=0 then raise exception 'Task retirement source guard changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if content.id is null or(not staff and(content.state<>''PUBLISHED''or not internal.learning_content_ancestors_visible(''activity'',target_id)))');
 definition:=pg_get_functiondef('internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text)'::regprocedure);
 anchor:='if command_name is null or command_name not in(''draft'',''review'')';
 if position(anchor in definition)=0 then raise exception 'Task classification command entry changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if target_kind=''activity''and exists(select 1 from app.learning_content_revisions r where r.school_id=school and r.id=(source->>''contentRevisionId'')::uuid and r.state=''RETIRED'')then raise exception ''Retired task metadata is read only''using errcode=''22023'';end if;'||chr(10)||' '||anchor);
end $$;
commit;
