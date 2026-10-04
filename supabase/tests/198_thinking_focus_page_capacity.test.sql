begin;
create extension if not exists pgtap with schema extensions;grant usage on schema extensions to cuevo_api;set local search_path=extensions,pg_catalog;select no_plan();
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','99680000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Bounded source course','Synthetic capacity only','PUBLISHED');
insert into app.units(school_id,id,course_id,title,sequence)values('10000000-0000-4000-8000-000000000001','99690000-0000-4000-8000-000000000001','99680000-0000-4000-8000-000000000001','Bounded source unit',1);
insert into app.lessons(school_id,id,unit_id,title,sequence,body)values('10000000-0000-4000-8000-000000000001','996a0000-0000-4000-8000-000000000001','99690000-0000-4000-8000-000000000001','Bounded source lesson',1,'One exact source lesson.');
insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)select'10000000-0000-4000-8000-000000000001',('996b0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'996a0000-0000-4000-8000-000000000001','Procedure '||n,'practice',repeat('Use the procedure. ',500),n from generate_series(1,1000)n;
create temporary table focus_capacity(targets jsonb,started timestamptz,items jsonb);grant select,insert,update on focus_capacity to cuevo_api;
insert into focus_capacity(targets)select jsonb_agg(jsonb_build_object('kind','activity','id',a.id,'criterionKey',null)order by a.id)from app.activities a where a.school_id='10000000-0000-4000-8000-000000000001'and a.lesson_id='996a0000-0000-4000-8000-000000000001';
set local role cuevo_api;select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);select set_config('app.actor_id','20000000-0000-4000-8000-000000000012',true);
-- The API issues at most 100 targets per statement in one actor transaction.
-- Keep each real statement below its timeout rather than changing source authority.
set local statement_timeout='5s';update focus_capacity set started=clock_timestamp(),items='[]'::jsonb;
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 1 and 100));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 101 and 200));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 201 and 300));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 301 and 400));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 401 and 500));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 501 and 600));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 601 and 700));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 701 and 800));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 801 and 900));
update focus_capacity set items=items||internal.read_thinking_focus_set((select jsonb_agg(t)from jsonb_array_elements(targets)with ordinality as rows(t,n)where n between 901 and 1000));
select is(jsonb_array_length((select items from focus_capacity)),1000,'1000 authorized unclassified long tasks have complete exact absence receipts');
select ok(not exists(select 1 from focus_capacity f,jsonb_array_elements(f.items)t where t->'classification'is distinct from'null'::jsonb or t->>'courseId'<>'99680000-0000-4000-8000-000000000001'or t->'target'->>'kind'<>'ACTIVITY'),'absence receipts preserve exact course/target without copying content');
select ok(octet_length((select items::text from focus_capacity))<=500000,'metadata page respects the response bound');
select diag('10 canonical statements of 100 unclassified sources total_elapsed_ms='||round(extract(epoch from(clock_timestamp()-(select started from focus_capacity)))*1000)::text);
select throws_ok($$select internal.read_thinking_focus_set((select jsonb_agg(t)from focus_capacity f,jsonb_array_elements(f.targets)with ordinality as rows(t,n)where n between 1 and 99)||jsonb_build_array(jsonb_build_object('kind','activity','id','ffffffff-ffff-4fff-8fff-ffffffffffff','criterionKey',null)))$$,'42501',null,'absent metadata cannot skip object authorization among valid page targets');
select*from finish();rollback;
