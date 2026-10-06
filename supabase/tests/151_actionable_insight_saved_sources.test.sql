begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to cuevo_api;
set local search_path=extensions,pg_catalog;
select no_plan();
create temporary table insight_recovery_sources(name text primary key,result_id uuid,reservation jsonb,proposal_id uuid,intervention_id uuid);
grant select,insert,update on insight_recovery_sources to cuevo_api;
create function pg_temp.complete_recovery_analysis(reservation jsonb,selected uuid)returns jsonb language plpgsql as $$
declare context jsonb:=(reservation->'context')-'insight';output jsonb;begin
 output:=jsonb_build_object('evidenceIds',jsonb_build_array(context->'evidenceId'),'facts',jsonb_build_array(context||'{"kind":"NUMERIC_RESULT"}'::jsonb),'action','GUIDED_PRACTICE','reason','REVIEW_RECORDED_RESULT','limitation','SINGLE_RESULT_NOT_CAUSAL');
 if selected is not null then output:=output||jsonb_build_object('selectedActivityId',selected);end if;
 return internal.complete_intelligence_run((reservation->>'runId')::uuid,(reservation->>'leaseToken')::uuid,output,'{"outputTokens":0,"inputTokens":0,"cost":0,"costBasis":"DETERMINISTIC_FIXTURE","latencyMs":1}','insight-recovery-golden');
end$$;
grant execute on function pg_temp.complete_recovery_analysis(jsonb,uuid)to cuevo_api;
insert into app.intelligence_policies(school_id,version,fixture_enabled,approved_by)values('10000000-0000-4000-8000-000000000001',1,true,'20000000-0000-4000-8000-000000000001')on conflict(school_id)do update set version=1,fixture_enabled=true,data_classification='SCHOOL_CUSTOM_NUMERIC',allowed_actions=array['GUIDED_PRACTICE','REVIEW_FEEDBACK']::text[];
insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values('10000000-0000-4000-8000-000000000001','9b100000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Reviewed explanation sources','Synthetic','PUBLISHED');
insert into app.units(school_id,id,course_id,title,sequence)values('10000000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001','9b100000-0000-4000-8000-000000000001','Teacher plan',1);
insert into app.lessons(school_id,id,unit_id,title,sequence,body)values('10000000-0000-4000-8000-000000000001','9b120000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001','Teacher explanation',1,'Approved school example');
insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)values('10000000-0000-4000-8000-000000000001','9b130000-0000-4000-8000-000000000001','9b120000-0000-4000-8000-000000000001','Original teacher practice','practice','Explain the original checking step.',1);
insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id,policy_version)select'10000000-0000-4000-8000-000000000001',('9b140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'9b100000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Explanation source '||n,'School task',10,'61000000-0000-4000-8000-000000000001',2 from generate_series(1,4)n;
insert into app.submissions(school_id,id,assessment_id,learner_id,content)select'10000000-0000-4000-8000-000000000001',('9b150000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('9b140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000012','Immutable learner explanation '||n from generate_series(1,4)n;
set local role cuevo_api;
select set_config('app.school_id','10000000-0000-4000-8000-000000000001',true);
select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true);
insert into insight_recovery_sources(name,result_id)values('old',internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000001',2,'Reviewed earlier source',2,0,true),1,false));
update insight_recovery_sources set reservation=internal.begin_teacher_insight_run('insight-recovery-old',repeat('a',64),result_id,'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":1,"timeoutMs":30000,"maxTokens":1000,"maxCost":1,"costBasis":"DETERMINISTIC_FIXTURE"}','insight-recovery-old')where name='old';
update insight_recovery_sources set proposal_id=(pg_temp.complete_recovery_analysis(reservation,'9b130000-0000-4000-8000-000000000001')->>'id')::uuid where name='old';
select internal.decide_recommendation((select proposal_id from insight_recovery_sources where name='old'),'APPROVE','Teacher approved earlier practice.',null,null);
update insight_recovery_sources set intervention_id=(select id from app.interventions where recommendation_id=insight_recovery_sources.proposal_id)where name='old';
select internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000001',4,'Corrected earlier native mark',2,1,true),2,false);
insert into insight_recovery_sources(name,result_id)values('fresh',internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000002',5,'New current explanation',2,0,true),1,false));
update insight_recovery_sources set reservation=internal.begin_teacher_insight_run('insight-recovery-fresh',repeat('b',64),result_id,'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":1,"timeoutMs":30000,"maxTokens":1000,"maxCost":1,"costBasis":"DETERMINISTIC_FIXTURE"}','insight-recovery-fresh')where name='fresh';
select ok(not exists(select 1 from jsonb_array_elements((select reservation->'context'->'insight'->'recentResults'from insight_recovery_sources where name='fresh'))source where source->>'resultId'=(select result_id::text from insight_recovery_sources where name='old')),'IG15 fresh context excludes the superseded prior result');
select ok(not exists(select 1 from jsonb_array_elements((select reservation->'context'->'insight'->'priorInterventions'from insight_recovery_sources where name='fresh'))source where source->>'id'=(select intervention_id::text from insight_recovery_sources where name='old')),'IG15 stale prior support is omitted from actionable context');
select is((select count(*)from app.interventions where id=(select intervention_id from insight_recovery_sources where name='old')),1::bigint,'IG15 separate authorized historical support remains readable');
select lives_ok($$update insight_recovery_sources set proposal_id=(pg_temp.complete_recovery_analysis(reservation,'9b130000-0000-4000-8000-000000000001')->>'id')::uuid where name='fresh'$$,'IG15 valid fresh source completes after earlier correction');
select lives_ok($$select internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='fresh'))$$,'IG15 newly generated context is usable immediately');
select lives_ok($$select internal.decide_recommendation((select proposal_id from insight_recovery_sources where name='fresh'),'APPROVE','Teacher reviewed valid fresh context.',null,null)$$,'IG15 valid fresh proposal remains human-approvable');
select throws_ok($$select internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='old'))$$,'42501',null,'IG15 old corrected proposal still fails current-source authority');

-- Reserve a different current source, then add an option not present or used in its immutable context.
insert into insight_recovery_sources(name,result_id)values('addition',internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000003',3,'Current saved source',2,0,true),1,false));
update insight_recovery_sources set reservation=internal.begin_teacher_insight_run('insight-recovery-addition',repeat('c',64),result_id,'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":1,"timeoutMs":30000,"maxTokens":1000,"maxCost":1,"costBasis":"DETERMINISTIC_FIXTURE"}','insight-recovery-addition')where name='addition';
reset role;
insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)values('10000000-0000-4000-8000-000000000001','9b130000-0000-4000-8000-000000000002','9b120000-0000-4000-8000-000000000001','Unused new practice','practice','A new option the saved proposal did not use.',2);
set local role cuevo_api;
select lives_ok($$select internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='addition'))$$,'IG16 all exact saved sources remain authorized after an unused addition');
select lives_ok($$update insight_recovery_sources set proposal_id=(pg_temp.complete_recovery_analysis(reservation,'9b130000-0000-4000-8000-000000000001')->>'id')::uuid where name='addition'$$,'IG16 completion accepts unchanged saved sources despite a new unused option');
select ok(not exists(select 1 from jsonb_array_elements((internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='addition'))->'context'->'learningOptions'))source where source->>'activityId'='9b130000-0000-4000-8000-000000000002'),'IG16 completion retains the original context without inventing retrieval of the new option');

-- The instructional source snapshot, not just its UUID, must still match.
reset role;
set local role cuevo_api;
select internal.learning_content_command('draft','activity','9b130000-0000-4000-8000-000000000001',jsonb_build_object('resource','activity','title','Original teacher practice','content','Changed instructional meaning.','kind','practice','assessmentId',null,'expectedRevision',(internal.learning_content_view('activity','9b130000-0000-4000-8000-000000000001')->>'revision')::integer,'reason','Teacher intentionally changes the saved source.'),'saved-option-draft',repeat('e',64),'saved-option-change');
select internal.learning_content_command('publish','activity','9b130000-0000-4000-8000-000000000001',jsonb_build_object('expectedRevision',(internal.learning_content_view('activity','9b130000-0000-4000-8000-000000000001')->>'revision')::integer,'confirmPublication',true),'saved-option-publish',repeat('f',64),'saved-option-change');
select throws_ok($$select internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='addition'))$$,'42501',null,'IG16 changed saved option instructions invalidate source disclosure');
select internal.learning_content_command('draft','activity','9b130000-0000-4000-8000-000000000001',jsonb_build_object('resource','activity','title','Original teacher practice','content','Explain the original checking step.','kind','practice','assessmentId',null,'expectedRevision',(internal.learning_content_view('activity','9b130000-0000-4000-8000-000000000001')->>'revision')::integer,'reason','Teacher restores the authored text in a new revision.'),'saved-option-restore-draft',repeat('1',64),'saved-option-restore');
select internal.learning_content_command('publish','activity','9b130000-0000-4000-8000-000000000001',jsonb_build_object('expectedRevision',(internal.learning_content_view('activity','9b130000-0000-4000-8000-000000000001')->>'revision')::integer,'confirmPublication',true),'saved-option-restore-publish',repeat('2',64),'saved-option-restore');
select throws_ok($$select internal.read_teacher_insight_context((select(reservation->>'runId')::uuid from insight_recovery_sources where name='addition'))$$,'42501',null,'IG16 a different published revision cannot impersonate the original saved source');

-- A cited current result correction is a genuine source change and cannot produce an intervention.
insert into insight_recovery_sources(name,result_id)values('changed',internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000004',6,'Other current saved evidence',2,0,true),1,false));
update insight_recovery_sources set reservation=internal.begin_teacher_insight_run('insight-recovery-changed',repeat('d',64),result_id,'{"mode":"FIXTURE","provider":"deterministic-fixture","model":"source-locked-v1","promptId":"next-learning-action","promptVersion":"1","policyVersion":1,"timeoutMs":30000,"maxTokens":1000,"maxCost":1,"costBasis":"DETERMINISTIC_FIXTURE"}','insight-recovery-changed')where name='changed';
select internal.release_marking(internal.mark_submission('9b150000-0000-4000-8000-000000000004',7,'Correction to the cited source',2,1,true),2,false);
select throws_ok($$select pg_temp.complete_recovery_analysis((select reservation from insight_recovery_sources where name='changed'),'9b130000-0000-4000-8000-000000000001')$$,'42501',null,'IG16 a corrected cited result still denies completion');
select is((select count(*)from app.recommendations where intelligence_run_id=(select(reservation->>'runId')::uuid from insight_recovery_sources where name='changed')),0::bigint,'IG16 denied changed source writes no proposal');
reset role;
select ok(not has_function_privilege('cuevo_api','internal.teacher_insight_context(uuid)','EXECUTE'),'Raw teacher context reader remains private');
select ok(not has_function_privilege('cuevo_api','internal.require_stored_insight_scope(uuid)','EXECUTE'),'Raw saved-scope verifier remains private');
select ok(not has_function_privilege('authenticated','internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'Browser role cannot complete a run directly');
select ok(not has_function_privilege('cuevo_worker','internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'Worker cannot impersonate teacher completion');
select ok(has_function_privilege('cuevo_api','internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'Only the API owns the guarded completion surface');
select*from finish();
rollback;
