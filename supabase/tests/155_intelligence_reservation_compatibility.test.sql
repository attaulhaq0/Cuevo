begin;
create extension if not exists pgtap with schema extensions;set local search_path=extensions,pg_catalog;select no_plan();
with guarded_branch as (
 select substring(pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure)
  from 'if reservation->>''state''=''NEW''and settings\?''promptDigest''then(.*)end if;return reservation;') as body
)
select ok(body is not null
 and position('return jsonb_set(reservation,''{context}''' in body)>0
 and position('''allowedActions''' in body)>0,
 'New prompt callers explicitly opt into frozen action metadata') from guarded_branch;
select ok(not has_function_privilege('cuevo_api','internal.begin_authorized_teacher_insight_run(text,text,uuid,jsonb,text)','EXECUTE'),'Legacy implementation is not a callable bypass');
select ok(not has_function_privilege('cuevo_api','internal.begin_intelligence_run(text,text,uuid,jsonb,text)','EXECUTE'),'Original numeric implementation stays private');
select*from finish();rollback;
