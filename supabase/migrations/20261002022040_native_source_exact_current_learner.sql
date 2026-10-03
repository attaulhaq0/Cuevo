begin;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.native_academic_source_allowed(uuid,uuid,boolean)'::regprocedure);
 anchor:='and(not require_current or(';if position(anchor in definition)=0 then raise exception 'Native current source predicate changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'and(not require_current or "authorization".current_learner_course(target_school,assessment.course_id,source.learner_id)) '||anchor);execute definition;
end$$;
revoke execute on function internal.native_academic_source_allowed(uuid,uuid,boolean)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
