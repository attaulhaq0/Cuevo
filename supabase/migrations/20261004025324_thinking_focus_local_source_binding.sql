begin;
-- Local variables require an explicit block label (function qualification is for parameters).
do $$declare signature text;definition text;name text;begin
 foreach signature in array array['internal.read_thinking_focus(text,uuid,text)','internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text)','internal.thinking_focus_recorded_item(text,uuid,text,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);name:=split_part(split_part(signature,'.',2),'(',1);
  if position(name||'.source->>'in definition)=0 or position('declare school uuid:'in definition)=0 then raise exception 'Task focus local source guard changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,'declare school uuid:','<<focus_context>>'||chr(10)||'declare school uuid:');
  definition:=replace(definition,name||'.source->>','focus_context.source->>');execute definition;
 end loop;
end $$;
commit;
