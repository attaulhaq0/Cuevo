-- Current person context enriches admitted native rows; no result or authority is rewritten.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select no_plan();

insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values
('10000000-0000-4000-8000-000000000001','98700000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Current native name source','Synthetic source only','PUBLISHED');
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id)
select'10000000-0000-4000-8000-000000000001',('98710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'98700000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',case n when 1 then'Current numeric zero'when 2 then'Current native criterion'else'Private parent source'end,'School-authored source',10,'61000000-0000-4000-8000-000000000001'from generate_series(1,3)n;
create temporary table native_name_ids(numeric_id uuid,rubric_id uuid,rubric_result_id uuid,private_id uuid,period_id uuid);
create temporary table native_name_baseline(id uuid primary key,record jsonb);
grant select,insert,update on native_name_ids to cuevo_api;
grant select,insert on native_name_baseline to cuevo_api;

set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
insert into native_name_ids(rubric_id)select internal.create_rubric('98700000-0000-4000-8000-000000000001','Current named native rubric','school-name-v1','[{"key":"explain","title":"Explain the source","levels":[{"key":"shown","label":"Shown","description":"Show one source check."}]}]'::jsonb);
select internal.configure_assessment_rubric('98710000-0000-4000-8000-000000000002',(select rubric_id from native_name_ids),1);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select internal.create_learning_submission('98710000-0000-4000-8000-000000000001','Synthetic numeric source');
select internal.create_learning_submission('98710000-0000-4000-8000-000000000002','Synthetic rubric source');
select internal.create_learning_submission('98710000-0000-4000-8000-000000000003','Synthetic private source');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
update native_name_ids set numeric_id=internal.release_marking(internal.mark_submission((select id from app.submissions where school_id='10000000-0000-4000-8000-000000000001'and assessment_id='98710000-0000-4000-8000-000000000001'),0,'Native zero feedback',1,0,true),1,true),
 rubric_result_id=internal.release_rubric_marking(internal.mark_rubric_submission((select id from app.submissions where school_id='10000000-0000-4000-8000-000000000001'and assessment_id='98710000-0000-4000-8000-000000000002'),rubric_id,'[{"criterionKey":"explain","levelKey":"shown"}]'::jsonb,'Native criterion feedback',2,0,true),1,true),
 private_id=internal.release_marking(internal.mark_submission((select id from app.submissions where school_id='10000000-0000-4000-8000-000000000001'and assessment_id='98710000-0000-4000-8000-000000000003'),5,'Private parent feedback',1,0,true),1,false);
reset role;
insert into app.report_periods(school_id,id,term_id,name,starts_on,ends_on,parent_visible,created_by)values
('10000000-0000-4000-8000-000000000001','98730000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Current submitted-source period',current_date-1,current_date+1,true,'20000000-0000-4000-8000-000000000001');
update native_name_ids set period_id='98730000-0000-4000-8000-000000000001';

-- Read all real cursor pages so random release UUID order cannot omit the test source.
create function pg_temp.native_name_page(kind text,target_learner uuid,target_period uuid default null)returns jsonb language plpgsql as $$
declare page jsonb;cursor_id uuid;prior_cursor uuid;rows jsonb:='[]';begin
 for part in 1..30 loop
  page:=case kind when'ordinary'then internal.list_current_native_results(100,cursor_id)when'scoped'then internal.list_current_native_results_scoped(100,cursor_id,target_learner)when'period'then internal.list_current_native_results_period(100,cursor_id,target_learner,target_period)else null end;
  if page is null then raise exception 'Known native page kind required';end if;
  rows:=rows||(page->'items');prior_cursor:=cursor_id;cursor_id:=(page->>'nextCursor')::uuid;
  if cursor_id is null then return rows;end if;if cursor_id is not distinct from prior_cursor then raise exception 'Current native cursor did not advance';end if;
 end loop;raise exception 'Current native source capacity requires review';end$$;
grant execute on function pg_temp.native_name_page(text,uuid,uuid)to cuevo_api;

set local role cuevo_api;
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
insert into native_name_baseline select(item->>'id')::uuid,item-'learnerName'from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where(item->>'id')::uuid in(select numeric_id from native_name_ids union select rubric_result_id from native_name_ids union select private_id from native_name_ids);
select is((select count(*)from native_name_baseline),3::bigint,'all three current native source rows admitted before name changes');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('ordinary',null))item where item->>'id'=(select numeric_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'and item->'nativeResult'->>'score'='0'),'Teacher ordinary page returns current learner name with native zero');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where item->>'id'=(select rubric_result_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'and item->'nativeResult'->>'type'='rubric'and not(item?'score')and item->'nativeResult'->'criteria'->0->>'levelDescription'='Show one source check.'),'Teacher selected learner page preserves native rubric descriptor and current name');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('period','20000000-0000-4000-8000-000000000012',(select period_id from native_name_ids)))item where item->>'id'=(select numeric_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'),'Teacher period page retains authorized current learner name');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true);
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('ordinary',null))item where item->>'id'=(select rubric_result_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'),'Administrator ordinary native page has current permitted person name');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where item->>'id'=(select numeric_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'),'Student self page has current permitted name');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000013',true);
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('ordinary',null))item where(item->>'id')::uuid in(select numeric_id from native_name_ids union select rubric_result_id from native_name_ids)),'Peer ordinary page reveals neither source nor name');
select throws_ok($$select internal.list_current_native_results_scoped(25,null,'20000000-0000-4000-8000-000000000012')$$,'42501',null,'Peer selected learner name read remains denied');
select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('ordinary',null))item where item->>'id'=(select numeric_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'),'Parent ordinary wrapper returns exact approved child current name');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where item->>'id'=(select rubric_result_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'and item->'nativeResult'->>'type'='rubric'),'Parent selected wrapper preserves child rubric and name');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('period','20000000-0000-4000-8000-000000000012',(select period_id from native_name_ids)))item where item->>'id'=(select rubric_result_id::text from native_name_ids)and item->>'learnerName'='Lina Al-Kuwari'),'Parent period wrapper returns current authorized child name');
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.native_name_page('ordinary',null))item where item->>'id'=(select private_id::text from native_name_ids)),'Unapproved parent source and its name stay absent');
select throws_ok($$select internal.list_current_native_results_scoped(25,null,'20000000-0000-4000-8000-000000000013')$$,'42501',null,'Parent cannot request unrelated learner name');

reset role;savepoint name_changed;
update app.people set display_name='Current learner name · الاسم الحالي'where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select ok(not exists(select 1 from native_name_baseline baseline left join lateral(select item from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where item->>'id'=baseline.id::text)current on true where current.item is null or current.item-'learnerName'<>baseline.record or current.item->>'learnerName'<>'Current learner name · الاسم الحالي'),'Current person rename changes only name; IDs native values feedback provenance and source rows remain identical');
reset role;rollback to name_changed;savepoint name_unknown;
update app.people set display_name='   'where school_id='10000000-0000-4000-8000-000000000001'and actor_id='20000000-0000-4000-8000-000000000012';
set local role cuevo_api;select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
select ok(not exists(select 1 from native_name_baseline baseline left join lateral(select item from jsonb_array_elements(pg_temp.native_name_page('scoped','20000000-0000-4000-8000-000000000012'))item where item->>'id'=baseline.id::text)current on true where current.item is null or current.item-'learnerName'<>baseline.record or current.item->'learnerName' is distinct from'null'::jsonb),'Whitespace current name stays null unknown without losing any valid native record');
reset role;rollback to name_unknown;savepoint relationship_revoked;
update app.parent_relationships set status='revoked'where school_id='10000000-0000-4000-8000-000000000001'and parent_actor_id='20000000-0000-4000-8000-000000000072';
set local role cuevo_api;select set_config('app.actor_id','20000000-0000-4000-8000-000000000072',true);
select throws_ok($$select internal.list_current_native_results_scoped(25,null,'20000000-0000-4000-8000-000000000012')$$,'42501',null,'Revoked relationship cannot expose selected child name');
select is(jsonb_array_length(pg_temp.native_name_page('ordinary',null)),0,'Revoked Parent ordinary page has no learner rows or names');
reset role;rollback to relationship_revoked;
select ok(not exists(select 1 from pg_roles role cross join(values('internal.list_current_native_results_scoped(integer,uuid,uuid)'),('internal.list_current_native_results_period(integer,uuid,uuid,uuid)'))entrypoint(signature)where role.rolname in('anon','authenticated','service_role','cuevo_worker')and has_function_privilege(role.oid,entrypoint.signature,'EXECUTE')),'No Data API service or worker grant added to native name projection');
select ok(not has_function_privilege('cuevo_api','internal.list_parent_current_results_scoped(integer,uuid,uuid)','EXECUTE')and not has_function_privilege('cuevo_api','internal.list_parent_current_results_period(integer,uuid,uuid,uuid)','EXECUTE'),'Parent name helpers remain private delegates without direct API grants');
select*from finish();
rollback;
