begin;
create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','94700000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Parent projection fixture','Synthetic','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)values
 ('10000000-0000-4000-8000-000000000001','94710000-0000-4000-8000-000000000001','94700000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Approved numeric','Synthetic',10,'61000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','94710000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Private numeric','Synthetic',10,'61000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','94710000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Approved rubric','Synthetic',10,'61000000-0000-4000-8000-000000000001');
insert into app.submissions(school_id,id,assessment_id,learner_id,content)values
 ('10000000-0000-4000-8000-000000000001','94720000-0000-4000-8000-000000000001','94710000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012','Synthetic numeric'),
 ('10000000-0000-4000-8000-000000000001','94720000-0000-4000-8000-000000000002','94710000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012','Synthetic private');
create temporary table parent_projection_ids(numeric_id uuid,private_id uuid,rubric_id uuid,rubric_result uuid);grant select,insert,update on parent_projection_ids to cuevo_api;
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
create function pg_temp.current_projection_contains(target uuid)returns boolean language plpgsql as $$declare page jsonb;cursor_id uuid;begin
 loop page:=internal.list_current_native_results(100,cursor_id);if exists(select 1 from jsonb_array_elements(page->'items')item where item->>'id'=target::text)then return true;end if;cursor_id:=(page->>'nextCursor')::uuid;exit when cursor_id is null;end loop;return false;
end$$;
insert into parent_projection_ids(numeric_id,private_id)select internal.release_marking(internal.mark_submission('94720000-0000-4000-8000-000000000001',0,'Reviewed zero',1,0,true),1,true),internal.release_marking(internal.mark_submission('94720000-0000-4000-8000-000000000002',5,'Private feedback',1,0,true),1,false);
update parent_projection_ids set rubric_id=internal.create_rubric('94700000-0000-4000-8000-000000000001','Parent native','school-1','[{"key":"explanation","title":"Explanation","levels":[{"key":"developing","label":"Developing","description":"Explain a step."}]}]');
select internal.configure_assessment_rubric('94710000-0000-4000-8000-000000000003',(select rubric_id from parent_projection_ids),1);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);select internal.create_learning_submission('94710000-0000-4000-8000-000000000003','Synthetic rubric');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update parent_projection_ids set rubric_result=internal.release_rubric_marking(internal.mark_rubric_submission((select id from app.submissions where assessment_id='94710000-0000-4000-8000-000000000003'),rubric_id,'[{"criterionKey":"explanation","levelKey":"developing"}]','Reviewed criterion',2,0,true),1,true);
select throws_ok('select internal.list_parent_current_results(25,null)','42501',null,'staff cannot invoke parent-only projection');
select ok(pg_temp.current_projection_contains((select numeric_id from parent_projection_ids)),'assigned teacher reads current native source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select ok(pg_temp.current_projection_contains((select private_id from parent_projection_ids)),'student sees own private-to-parent released source');
select ok(not exists(select 1 from jsonb_array_elements(internal.list_current_native_results(100,null)->'items')item where item->>'learnerId'<>'20000000-0000-4000-8000-000000000012'),'student current projection is self only');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000013',true);
select ok(not pg_temp.current_projection_contains((select numeric_id from parent_projection_ids)),'peer cannot read another learner native source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000002',true);
select ok(pg_temp.current_projection_contains((select numeric_id from parent_projection_ids)),'coordinator reads permitted school native source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select ok(pg_temp.current_projection_contains((select rubric_result from parent_projection_ids)),'admin reads current rubric without scalar conversion');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select ok(exists(select 1 from jsonb_array_elements(internal.list_parent_current_results(100,null)->'items')item where item->>'id'=(select numeric_id::text from parent_projection_ids)and item->'nativeResult'->>'score'='0'),'approved parent numeric zero retained');
select ok(not exists(select 1 from jsonb_array_elements(internal.list_parent_current_results(100,null)->'items')item where item->>'id'=(select private_id::text from parent_projection_ids)),'private release never enters parent projection');
select ok(exists(select 1 from jsonb_array_elements(internal.list_parent_current_results(100,null)->'items')item where item->>'id'=(select rubric_result::text from parent_projection_ids)and item->'nativeResult'->>'type'='rubric'and not(item?'score')),'parent rubric remains native without scalar');
select is(jsonb_array_length(internal.list_parent_current_results(1,null)->'items'),1,'page sentinel emits bounded records');
select ok(internal.list_parent_current_results(1,null)->>'nextCursor'is not null,'page sentinel exposes next cursor');
select throws_ok('select internal.list_parent_current_results(101,null)','22023',null,'unbounded parent read denied');
reset role;update app.parent_relationships set status='revoked'where school_id='10000000-0000-4000-8000-000000000001'and parent_actor_id='20000000-0000-4000-8000-000000000072';
set local role cuevo_api;select is(jsonb_array_length(internal.list_parent_current_results(100,null)->'items'),0,'revoked guardian has no parent projection');
select set_config('app.school_id','10000000-0000-4000-8000-000000000002',true);select throws_ok('select internal.list_parent_current_results(25,null)','42501',null,'parent cannot change to foreign tenant');
reset role;
select ok(not has_function_privilege('anon','internal.list_parent_current_results(integer,uuid)','EXECUTE')and not has_function_privilege('authenticated','internal.list_parent_current_results(integer,uuid)','EXECUTE')and not has_function_privilege('cuevo_worker','internal.list_parent_current_results(integer,uuid)','EXECUTE'),'parent projection callable only through API role');
select ok(not has_function_privilege('anon','internal.list_current_native_results(integer,uuid)','EXECUTE')and not has_function_privilege('authenticated','internal.list_current_native_results(integer,uuid)','EXECUTE')and not has_function_privilege('cuevo_worker','internal.list_current_native_results(integer,uuid)','EXECUTE'),'all-role projection callable only through API role');
select*from finish();rollback;
