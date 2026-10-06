begin;
-- Approval requires a complete currently inspectable exact-source material basis.
-- Original-key reconciliation remains before this NEW-command preflight.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text)'::regprocedure);
 anchor:='state:=case decision when''APPROVE''then''APPROVED''when''REJECT''then''REJECTED''else''WITHDRAWN''end;';
 if position(anchor in definition)=0 then raise exception 'Thinking review transition changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if decision=''APPROVE''then perform internal.read_thinking_focus_materials(target_kind,target_id,target_key,source->>''sourceVersion'');end if;'||chr(10)||'  '||anchor);
end $$;
commit;
