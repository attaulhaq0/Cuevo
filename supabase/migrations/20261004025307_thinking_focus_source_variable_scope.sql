begin;
-- Revision rows have a source column. Qualify each purpose helper's local source.
do $$declare signature text;definition text;name text;begin
 foreach signature in array array['internal.read_thinking_focus(text,uuid,text)','internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text)','internal.thinking_focus_recorded_item(text,uuid,text,uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);name:=split_part(split_part(signature,'.',2),'(',1);
  if position('v.source_version=source->>' in definition)=0 and position('v.source_version=source->>' in replace(definition,' ',''))=0 then raise exception 'Task focus exact source guard changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,'v.source_version=source->>','v.source_version='||name||'.source->>');execute definition;
 end loop;
end $$;
commit;
