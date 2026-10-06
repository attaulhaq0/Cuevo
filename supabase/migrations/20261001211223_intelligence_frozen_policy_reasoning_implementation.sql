begin;
alter table app.intelligence_runs add column allowed_actions text[];
alter table app.intelligence_runs add column prompt_digest text check(prompt_digest~'^[a-f0-9]{64}$');
alter table app.intelligence_runs add column selected_activity_id uuid;
alter table app.intelligence_runs add column analysis jsonb check(analysis is null or octet_length(analysis::text)<=4096);
alter table app.intelligence_runs add foreign key(school_id,selected_activity_id)references app.activities(school_id,id);
alter table app.recommendations add column selected_activity_id uuid;
alter table app.recommendations add column analysis jsonb;
alter table app.recommendations add column prompt_digest text;
alter table app.recommendations add foreign key(school_id,selected_activity_id)references app.activities(school_id,id);
alter table app.interventions add column selected_activity_id uuid;
alter table app.interventions add column analysis jsonb;
alter table app.interventions add column prompt_digest text;
alter table app.interventions add foreign key(school_id,selected_activity_id)references app.activities(school_id,id);

do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.intelligence_run_immutable()'::regprocedure);
 anchor:='if tg_op<>''UPDATE''or old.state<>''REASONING''';
 if position(anchor in definition)=0 then raise exception 'Run immutability source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'or(old.allowed_actions is not null and new.allowed_actions is distinct from old.allowed_actions)or(old.prompt_digest is not null and new.prompt_digest is distinct from old.prompt_digest)');
 definition:=replace(definition,'''state''-''grounded_output''','''allowed_actions''-''prompt_digest''-''selected_activity_id''-''analysis''-''state''-''grounded_output''');execute definition;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 anchor:='context:=internal.intelligence_context(baseline_id);';
 if position(anchor in definition)=0 or position('settings-''syntheticOnly''-''costBasis'''in definition)=0 then raise exception 'Run reservation source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'
 if settings?''promptDigest''and(settings->>''promptId''is distinct from''next-learning-action''or case settings->>''promptVersion''when''1''then settings->>''promptDigest''is distinct from''a54af580544321d5cd3d9b212f423dd01bb4599a2ce3ec7a2bf9d3c32dfe5077''when''2''then settings->>''promptDigest''is distinct from''1f892110e486d0f8117e53ef9d9cf0a884b7c155821dd8eb1284cef22b9f0de4''else true end)then raise exception ''Approved prompt digest required''using errcode=''22023'';end if;');
 definition:=replace(definition,'settings-''syntheticOnly''-''costBasis''','settings-''syntheticOnly''-''costBasis''-''promptDigest''');
 definition:=replace(definition,'update app.intelligence_runs set cost_basis=basis,','update app.intelligence_runs set allowed_actions=(select policy.allowed_actions from app.intelligence_policies policy where policy.school_id=school),prompt_digest=settings->>''promptDigest'',cost_basis=basis,');
 definition:=replace(definition,'return reservation;',
 'if reservation->>''state''=''NEW''then return jsonb_set(reservation,''{context}'',(reservation->''context'')||jsonb_build_object(''allowedActions'',(select to_jsonb(run.allowed_actions)from app.intelligence_runs run where run.school_id=school and run.id=(reservation->>''runId'')::uuid)));end if;return reservation;');
 execute definition;
end$$;
create function internal.validate_intelligence_analysis(target_run uuid,target_analysis jsonb)returns void language plpgsql security definer set search_path=''as $$
declare run app.intelligence_runs;stored jsonb;basis text;ids jsonb;begin
 select*into run from app.intelligence_runs where school_id="authorization".school_id()and id=target_run;select context into stored from app.intelligence_context_details where school_id=run.school_id and run_id=run.id;
 if run.id is null or target_analysis is null or jsonb_typeof(target_analysis)<>'object'or target_analysis-'basis'-'resultIds'-'observationIds'-'priorInterventionIds'-'interpretation'-'uncertainty'<>'{}'::jsonb
 or target_analysis->>'interpretation'is distinct from'TEACHER_REVIEW_RECORDED_EVIDENCE'or target_analysis->>'uncertainty'is distinct from'EVIDENCE_NOT_CAUSAL'then raise exception 'Reasoning schema denied'using errcode='22023';end if;
 foreach basis in array array['resultIds','observationIds','priorInterventionIds']loop ids:=target_analysis->basis;if jsonb_typeof(ids)is distinct from'array'or jsonb_array_length(ids)>(case basis when'resultIds'then 10 when'observationIds'then 20 else 10 end) or exists(select 1 from jsonb_array_elements(ids)item where jsonb_typeof(item)<>'string')or(select count(*)from jsonb_array_elements(ids))<>(select count(distinct item)from jsonb_array_elements(ids)item)then raise exception 'Reasoning citations invalid'using errcode='22023';end if;end loop;
 if jsonb_array_length(target_analysis->'resultIds')=0 or not(target_analysis->'resultIds'?run.baseline_result_id::text)
 or exists(select 1 from jsonb_array_elements_text(target_analysis->'resultIds')id where id<>run.baseline_result_id::text and not exists(select 1 from jsonb_array_elements(stored->'recentResults')source where source->>'resultId'=id))
 or exists(select 1 from jsonb_array_elements_text(target_analysis->'observationIds')id where not exists(select 1 from jsonb_array_elements(stored->'observations')source where source->>'id'=id))
 or exists(select 1 from jsonb_array_elements_text(target_analysis->'priorInterventionIds')id where not exists(select 1 from jsonb_array_elements(stored->'priorInterventions')source where source->>'id'=id))then raise exception 'Reasoning citation denied'using errcode='22023';end if;
 basis:=target_analysis->>'basis';
 if basis='SINGLE_RESULT'then if jsonb_array_length(target_analysis->'resultIds')<>1 or jsonb_array_length(target_analysis->'observationIds')<>0 or jsonb_array_length(target_analysis->'priorInterventionIds')<>0 then raise exception 'Single source reasoning denied'using errcode='22023';end if;
 elsif basis='NATIVE_RESULT_DECLINE'then if not exists(select 1 from jsonb_array_elements(stored->'recentResults')source where target_analysis->'resultIds'?(source->>'resultId')and(source->>'score')::numeric>(run.context_references->>'score')::numeric and(source->>'maxScore')::numeric=(run.context_references->>'maxScore')::numeric)or jsonb_array_length(target_analysis->'observationIds')<>0 or jsonb_array_length(target_analysis->'priorInterventionIds')<>0 then raise exception 'Native comparison reasoning denied'using errcode='22023';end if;
 elsif basis in('RECORDED_PRACTICE','RECORDED_REFLECTION')then if jsonb_array_length(target_analysis->'observationIds')=0 or jsonb_array_length(target_analysis->'priorInterventionIds')<>0 or exists(select 1 from jsonb_array_elements_text(target_analysis->'observationIds')id where not exists(select 1 from jsonb_array_elements(stored->'observations')source where source->>'id'=id and source->>'kind'=case basis when'RECORDED_PRACTICE'then'practice'else'reflection'end))then raise exception 'Recorded action reasoning denied'using errcode='22023';end if;
 elsif basis='PRIOR_NO_MEANINGFUL_CHANGE'then if jsonb_array_length(target_analysis->'priorInterventionIds')=0 or jsonb_array_length(target_analysis->'observationIds')<>0 or exists(select 1 from jsonb_array_elements_text(target_analysis->'priorInterventionIds')id where not exists(select 1 from jsonb_array_elements(stored->'priorInterventions')source where source->>'id'=id and source->>'status'='MEASURED'and source->'outcome'->>'status'='no_meaningful_change'))then raise exception 'Prior outcome reasoning denied'using errcode='22023';end if;
 else raise exception 'Reasoning basis denied'using errcode='22023';end if;
end$$;
-- Mutations preserve immutable selection and reasoning; public completion validates extensions
-- before delegating the original numeric fact/lease/policy/usage path.
do $$declare definition text;signature text;anchor text;begin
 foreach signature in array array['internal.complete_numeric_intelligence_run(uuid,uuid,jsonb,jsonb,text)','internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid)']loop
 definition:=pg_get_functiondef(signature::regprocedure);anchor:='action:=output->>''action'';';if position(anchor in definition)=0 then raise exception 'Action validation source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'if run.allowed_actions is not null and not(action=any(run.allowed_actions))then raise exception ''Frozen action policy denied''using errcode=''22023'';end if;');execute definition;end loop;
 definition:=pg_get_functiondef('internal.complete_intelligence_run(uuid,uuid,jsonb,jsonb,text)'::regprocedure);
 anchor:='if output?''selectedActivityId''then';if position(anchor in definition)=0 then raise exception 'Selected source guard changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if run.prompt_version=''2''and run.prompt_digest is not null and not(output?''analysis'')then raise exception ''Reasoning citations required''using errcode=''22023'';end if;if output?''analysis''then perform internal.validate_intelligence_analysis(target_run,output->''analysis'');end if;'||anchor);
 definition:=replace(definition,'if activity is null then','if activity is null or output->>''action''<>''GUIDED_PRACTICE''or activity->>''kind''<>''practice''then');
 definition:=replace(definition,'output-''selectedActivityId'',usage','output-''selectedActivityId''-''analysis'',usage');
 definition:=replace(definition,'else(activity->>''activityId'')::uuid end);','else(activity->>''activityId'')::uuid end,output->''analysis'');');execute definition;
end$$;
-- Add a private completion overload with explicitly passed checked metadata. No mutable
-- session variable or post-completion rewrite can change source provenance.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
 anchor:='selected_activity uuid)';if position(anchor in definition)=0 or position('evidence_ids,created_by)'in definition)=0 or position('grounded_output=output,'in definition)=0 then raise exception 'Private insight completion metadata shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'selected_activity uuid, validated_analysis jsonb)');
 definition:=replace(definition,'evidence_ids,created_by)','evidence_ids,created_by,selected_activity_id,analysis,prompt_digest)');
 definition:=replace(definition,'array[r.evidence_id],"authorization".actor_id())returning id into rid;','array[r.evidence_id],"authorization".actor_id(),selected_activity,validated_analysis,run.prompt_digest)returning id into rid;');
 definition:=replace(definition,'grounded_output=output,','grounded_output=output||case when selected_activity is null then''{}''::jsonb else jsonb_build_object(''selectedActivityId'',selected_activity)end||case when validated_analysis is null then''{}''::jsonb else jsonb_build_object(''analysis'',validated_analysis)end,selected_activity_id=selected_activity,analysis=validated_analysis,');
 definition:=replace(definition,'''createdAt'',q.created_at)', '''createdAt'',q.created_at,''selectedActivityId'',q.selected_activity_id,''analysis'',q.analysis,''promptDigest'',q.prompt_digest)');
 execute definition;
end$$;
create function internal.intervention_intelligence_metadata()returns trigger language plpgsql security definer set search_path=''as $$begin
 select selected_activity_id,analysis,prompt_digest into new.selected_activity_id,new.analysis,new.prompt_digest from app.recommendations where school_id=new.school_id and id=new.recommendation_id;return new;end$$;
create trigger intervention_intelligence_metadata before insert on app.interventions for each row execute function internal.intervention_intelligence_metadata();
revoke execute on function internal.validate_intelligence_analysis(uuid,jsonb),internal.complete_insight_numeric_run(uuid,uuid,jsonb,jsonb,text,uuid,jsonb),internal.intervention_intelligence_metadata()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
