begin;
do $$declare definition text;source_name text;anchor text;begin
 foreach source_name in array array['list_current_native_results_period','list_parent_current_results_period']loop
  definition:=pg_get_functiondef(to_regprocedure('internal.'||source_name||'(integer,uuid,uuid,uuid)'));
  anchor:=' period:=internal.report_period_context(target_period);';if position(anchor in definition)=0 then raise exception 'Expected period report source guard missing';end if;
  definition:=replace(definition,anchor,' if target_learner is null or not"authorization".can_view_person(school,target_learner)then raise exception ''Selected period learner denied''using errcode=''42501'';end if;'||chr(10)||anchor);
  definition:=replace(definition,'jsonb_build_object(''items'',''[]''::jsonb,''nextCursor'',null)','jsonb_build_object(''period'',period,''items'',''[]''::jsonb,''nextCursor'',null)');
  execute definition;
 end loop;
end$$;
commit;
