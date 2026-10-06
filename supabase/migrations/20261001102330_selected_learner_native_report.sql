begin;
-- Extend the established current native projections. The selected learner predicate
-- enters both numeric and rubric candidate sources before their bounded pagination.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.list_parent_current_results(integer,uuid)'::regprocedure);
 definition:=replace(definition,'internal.list_parent_current_results(page_limit integer, page_cursor uuid)',
  'internal.list_parent_current_results_scoped(page_limit integer, page_cursor uuid, target_learner uuid)');
 definition:=replace(definition,'if cardinality(children)=0 then',
  'if target_learner is not null then if not"authorization".can_view_person(school,target_learner)or not target_learner=any(children)then raise exception ''Selected parent report denied''using errcode=''42501'';end if;children:=array[target_learner];end if;if cardinality(children)=0 then');
 if position('internal.list_parent_current_results_scoped'in definition)=0 or position('Selected parent report denied'in definition)=0 then raise exception 'Parent native report source shape changed'using errcode='22023';end if;execute definition;
 definition:=pg_get_functiondef('internal.list_current_native_results(integer,uuid)'::regprocedure);
 definition:=replace(definition,'internal.list_current_native_results(page_limit integer, page_cursor uuid)',
  'internal.list_current_native_results_scoped(page_limit integer, page_cursor uuid, target_learner uuid)');
 definition:=replace(definition,'internal.list_parent_current_results(page_limit,page_cursor)',
  'internal.list_parent_current_results_scoped(page_limit,page_cursor,target_learner)');
 definition:=replace(definition,'if cardinality(learners)=0 then',
  'if target_learner is not null then if not"authorization".can_view_person(school,target_learner)or not target_learner=any(learners)then raise exception ''Selected native report denied''using errcode=''42501'';end if;learners:=array[target_learner];end if;if cardinality(learners)=0 then');
 if position('internal.list_current_native_results_scoped'in definition)=0 or position('Selected native report denied'in definition)=0 then raise exception 'Current native report source shape changed'using errcode='22023';end if;execute definition;
end$$;
create or replace function internal.list_parent_current_results(page_limit integer,page_cursor uuid)returns jsonb language sql security definer set search_path=''as $$select internal.list_parent_current_results_scoped(page_limit,page_cursor,null)$$;
create or replace function internal.list_current_native_results(page_limit integer,page_cursor uuid)returns jsonb language sql security definer set search_path=''as $$select internal.list_current_native_results_scoped(page_limit,page_cursor,null)$$;
revoke execute on function internal.list_parent_current_results_scoped(integer,uuid,uuid),internal.list_current_native_results_scoped(integer,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.list_current_native_results_scoped(integer,uuid,uuid)to cuevo_api;
commit;
