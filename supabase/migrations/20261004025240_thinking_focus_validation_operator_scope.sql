begin;
-- jsonb_array_elements has an output column named value; bind the input exactly.
create or replace function internal.valid_thinking_focus(value jsonb)returns boolean language plpgsql immutable set search_path=''as $$
declare processes text[]:=array['REMEMBER','UNDERSTAND','APPLY','ANALYZE','EVALUATE','CREATE'];focus jsonb:=valid_thinking_focus.value;
begin
 if focus is null or jsonb_typeof(focus)<>'object'or focus-array['taxonomyVersion','primaryProcess','additionalProcesses']<>'{}'::jsonb or not(focus?&array['taxonomyVersion','primaryProcess','additionalProcesses'])or focus->>'taxonomyVersion'is distinct from'revised-bloom-2001-cuevo-v1'or jsonb_typeof(focus->'primaryProcess')is distinct from'string'or not(focus->>'primaryProcess'=any(processes))or jsonb_typeof(focus->'additionalProcesses')is distinct from'array'then return false;end if;
 return jsonb_array_length(focus->'additionalProcesses')<=5
  and not exists(select 1 from jsonb_array_elements(focus->'additionalProcesses')as element(process)where jsonb_typeof(process)<>'string'or not((process#>>'{}')=any(processes))or(process#>>'{}')=(focus->>'primaryProcess'))
  and(select count(distinct process#>>'{}')from jsonb_array_elements(focus->'additionalProcesses')as element(process))=jsonb_array_length(focus->'additionalProcesses');
exception when others then return false;
end $$;
revoke execute on function internal.valid_thinking_focus(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
