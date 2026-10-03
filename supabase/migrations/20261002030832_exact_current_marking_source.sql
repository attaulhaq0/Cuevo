begin;
-- One projection serves list and exact-current-source reads. Existing callers
-- retain the two-argument wrapper; the owner implementation accepts an optional
-- exact source filter independently of continuation order.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_current_marking_page(integer,uuid)'::regprocedure);
 if position('page_cursor uuid)'in definition)=0 then raise exception 'Current marking source signature changed'using errcode='22023';end if;
 anchor:='and(page_cursor is null or submission.id>page_cursor)';if position(anchor in definition)=0 then raise exception 'Current marking source filter changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'and(target_submission is null or submission.id=target_submission)');
 definition:=replace(definition,'page_cursor uuid)','page_cursor uuid, target_submission uuid)');
 definition:=replace(definition,'internal.read_current_marking_page(','internal.read_current_marking_sources(');execute definition;
end$$;
create or replace function internal.read_current_marking_page(page_limit integer,page_cursor uuid)returns jsonb language sql security definer set search_path=''as $$select internal.read_current_marking_sources(page_limit,page_cursor,null)$$;
create function internal.read_exact_current_marking(target_submission uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();answer jsonb;begin
 perform internal.read_gradebook_source(target_submission);
 select item into answer from jsonb_array_elements(internal.read_current_marking_sources(1,null,target_submission)->'items')item where item->>'id'=target_submission::text;
 if answer is null then raise exception 'Exact current marking source unavailable'using errcode='42501';end if;return answer;
end$$;
revoke execute on function internal.read_current_marking_sources(integer,uuid,uuid),internal.read_exact_current_marking(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_exact_current_marking(uuid)to cuevo_api;
commit;
