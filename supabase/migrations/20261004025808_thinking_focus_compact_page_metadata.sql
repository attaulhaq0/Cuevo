begin;
-- A page consumes metadata only; direct source/editor reads retain instructions.
-- Every target is authorized, including absent mappings. Missing remains nullable.
create or replace function internal.read_thinking_focus_set(targets jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare items jsonb:='[]'::jsonb;target jsonb;item jsonb;
begin
 if targets is null or jsonb_typeof(targets)<>'array'or jsonb_array_length(targets)>1201 or octet_length(targets::text)>200000 or exists(select 1 from jsonb_array_elements(targets)t where jsonb_typeof(t)<>'object'or t-array['kind','id','criterionKey']<>'{}'::jsonb or not(t?&array['kind','id','criterionKey'])or jsonb_typeof(t->'kind')is distinct from'string'or t->>'kind'not in('activity','assessment','criterion')or jsonb_typeof(t->'id')is distinct from'string'or(t->'criterionKey'<>'null'::jsonb and jsonb_typeof(t->'criterionKey')is distinct from'string'))or(select count(distinct (t->>'kind',t->>'id',t->>'criterionKey'))from jsonb_array_elements(targets)t)<>jsonb_array_length(targets)then raise exception 'Exact bounded task focus targets required'using errcode='22023';end if;
 for target in select t from jsonb_array_elements(targets)t loop
  item:=internal.read_thinking_focus(target->>'kind',(target->>'id')::uuid,target->>'criterionKey');
  if item->>'status'<>'UNCLASSIFIED'then items:=items||jsonb_build_array(jsonb_set(item,'{source,instructions}','""'::jsonb));end if;
 end loop;
 if octet_length(items::text)>500000 then raise exception 'Task focus set needs smaller page'using errcode='22023';end if;return items;
end $$;
revoke execute on function internal.read_thinking_focus_set(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_thinking_focus_set(jsonb)to cuevo_api;
commit;
