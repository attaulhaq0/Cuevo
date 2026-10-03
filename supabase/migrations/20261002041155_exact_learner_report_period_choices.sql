begin;
create function internal.read_learner_report_periods(target_learner uuid,page_limit integer,page_cursor uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());items jsonb;
begin
 if not"authorization".academic_access(school)or not"authorization".school_operations_access(school)or not"authorization".can_view_person(school,target_learner)then raise exception 'Current learner report period choices denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 25 then raise exception 'Bounded period choices required'using errcode='22023';end if;
 with candidates as materialized(select period.id,internal.school_record_current('report-periods',period.id)source from app.report_periods period where period.school_id=school and(page_cursor is null or period.id>page_cursor)),permitted as materialized(select id,source from candidates where source->>'recordState'='CURRENT'and(role_name<>'parent'or source->'parentVisible'='true'::jsonb)and exists(select 1 from app.terms term join app.classes class on class.school_id=term.school_id and class.academic_year_id=term.academic_year_id join app.enrollments enrollment on enrollment.school_id=class.school_id and enrollment.class_id=class.id where term.school_id=school and term.id=(source->>'termId')::uuid and class.status='active'and enrollment.student_actor_id=target_learner and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and"authorization".can_view_class(school,class.id))order by id limit page_limit+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',source->>'name','startsOn',source->>'startsOn','endsOn',source->>'endsOn','revision',(source->>'revision')::integer)order by id),'[]'::jsonb)into items from permitted;
 return jsonb_build_object('items',case when jsonb_array_length(items)>page_limit then items-page_limit else items end,'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;
revoke execute on function internal.read_learner_report_periods(uuid,integer,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_learner_report_periods(uuid,integer,uuid)to cuevo_api;
commit;
