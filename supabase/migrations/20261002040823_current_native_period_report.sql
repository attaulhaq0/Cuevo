begin;
create function internal.report_period_context(target_period uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();period jsonb;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended(school::text||':school-record-maintenance',0));
 if not"authorization".academic_access(school)or not"authorization".school_operations_access(school)then raise exception 'Current period report denied'using errcode='42501';end if;
 period:=internal.school_record_current('report-periods',target_period);
 if period is null or period->>'recordState'='CANCELLED'then raise exception 'Current report period requires review'using errcode='22023';end if;
 if"authorization".current_role(school)='parent'and(period->>'parentVisible')::boolean is distinct from true then raise exception 'Current parent report period denied'using errcode='42501';end if;
 return jsonb_build_object('id',target_period,'name',period->>'name','revision',(period->>'revision')::integer,'startsOn',period->>'startsOn','endsOn',period->>'endsOn','basis','SOURCE_SUBMITTED_DATE_UTC');
end$$;
do $$declare definition text;source_name text;new_name text;anchor text;begin
 foreach source_name in array array['list_current_native_results_scoped','list_parent_current_results_scoped']loop
  new_name:=replace(source_name,'_scoped','_period');definition:=pg_get_functiondef(to_regprocedure('internal.'||source_name||'(integer,uuid,uuid)'));
  anchor:=source_name||'(page_limit integer, page_cursor uuid, target_learner uuid)';
  if position(anchor in definition)=0 then raise exception 'Current report source signature changed';end if;
  definition:=replace(definition,anchor,new_name||'(page_limit integer, page_cursor uuid, target_learner uuid, target_period uuid)');
  definition:=replace(definition,'rows jsonb;items jsonb;','rows jsonb;items jsonb;period jsonb;');
  anchor:=chr(10)||'begin'||chr(10);if position(anchor in definition)=0 then raise exception 'Current report source entry changed';end if;
  definition:=replace(definition,anchor,anchor||' period:=internal.report_period_context(target_period);'||chr(10));
  definition:=replace(definition,'internal.list_parent_current_results_scoped(page_limit,page_cursor,target_learner)','internal.list_parent_current_results_period(page_limit,page_cursor,target_learner,target_period)');
  anchor:='and(page_cursor is null or r.id>page_cursor)';if position(anchor in definition)=0 then raise exception 'Current report candidate filter changed';end if;
  definition:=replace(definition,anchor,'and exists(select 1 from app.submissions period_submission join app.courses period_course on period_course.school_id=period_submission.school_id and period_course.id=assessment.course_id join app.classes period_class on period_class.school_id=period_course.school_id and period_class.id=period_course.class_id join app.terms period_term on period_term.school_id=period_class.school_id and period_term.academic_year_id=period_class.academic_year_id where period_submission.school_id=r.school_id and period_submission.id=r.submission_id and period_term.id=(internal.school_record_current(''report-periods'',target_period)->>''termId'')::uuid and(period_submission.submitted_at at time zone''UTC'')::date between(period->>''startsOn'')::date and(period->>''endsOn'')::date)'||anchor);
  definition:=replace(definition,'''items'',items,''nextCursor''','''period'',period,''items'',items,''nextCursor''');
  execute definition;
 end loop;
end$$;
alter function internal.list_current_native_results_period(integer,uuid,uuid,uuid)set jit='off';
alter function internal.list_parent_current_results_period(integer,uuid,uuid,uuid)set jit='off';
revoke execute on function internal.report_period_context(uuid),internal.list_current_native_results_period(integer,uuid,uuid,uuid),internal.list_parent_current_results_period(integer,uuid,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.list_current_native_results_period(integer,uuid,uuid,uuid)to cuevo_api;
commit;
