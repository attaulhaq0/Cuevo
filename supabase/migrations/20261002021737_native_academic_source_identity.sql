begin;
create table internal.academic_result_sources(
 school_id uuid not null,id uuid not null,learner_id uuid not null,model text not null check(model in('numeric','rubric')),
 numeric_result_id uuid,rubric_result_id uuid,primary key(school_id,id),unique(school_id,id,learner_id),
 foreign key(school_id,numeric_result_id,learner_id)references app.result_revisions(school_id,id,learner_id),foreign key(school_id,rubric_result_id,learner_id)references app.rubric_result_revisions(school_id,id,learner_id),
 check((model='numeric'and numeric_result_id is not null and numeric_result_id=id and rubric_result_id is null)or(model='rubric'and rubric_result_id is not null and rubric_result_id=id and numeric_result_id is null)));
alter table internal.academic_result_sources enable row level security;alter table internal.academic_result_sources force row level security;
create trigger academic_source_immutable before update or delete on internal.academic_result_sources for each row execute function internal.academic_history_immutable();create trigger academic_source_no_truncate before truncate on internal.academic_result_sources for each statement execute function internal.academic_history_immutable();
revoke all on internal.academic_result_sources from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
insert into internal.academic_result_sources(school_id,id,learner_id,model,numeric_result_id)select school_id,id,learner_id,'numeric',id from app.result_revisions;
insert into internal.academic_result_sources(school_id,id,learner_id,model,rubric_result_id)select school_id,id,learner_id,'rubric',id from app.rubric_result_revisions;
create function internal.register_native_academic_source()returns trigger language plpgsql security definer set search_path=''as $$begin
 if tg_table_name='result_revisions'then insert into internal.academic_result_sources(school_id,id,learner_id,model,numeric_result_id)values(new.school_id,new.id,new.learner_id,'numeric',new.id);
 elsif tg_table_name='rubric_result_revisions'then insert into internal.academic_result_sources(school_id,id,learner_id,model,rubric_result_id)values(new.school_id,new.id,new.learner_id,'rubric',new.id);
 else raise exception 'Native academic source table invalid'using errcode='22023';end if;return new;
end$$;
create trigger register_native_academic_source after insert on app.result_revisions for each row execute function internal.register_native_academic_source();
create trigger register_native_academic_source after insert on app.rubric_result_revisions for each row execute function internal.register_native_academic_source();
create function internal.native_academic_source(target_school uuid,target_result uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',source.id,'learnerId',source.learner_id,'submissionId',coalesce(numeric.submission_id,rubric.submission_id),'assessmentId',coalesce(numeric.assessment_id,rubric.assessment_id),'courseId',assessment.course_id,'referenceId',coalesce(numeric.reference_id,rubric.reference_id),'referenceVersion',coalesce(numeric.reference_version,rubric.reference_version),'evidenceId',coalesce(numeric.evidence_id,rubric.evidence_id),'revision',coalesce(numeric.revision,rubric.revision),'policyVersion',coalesce(numeric.policy_version,rubric.policy_version),'createdAt',coalesce(numeric.created_at,rubric.created_at),'model',source.model,'nativeResult',case when source.model='numeric'then jsonb_build_object('type','numeric','score',numeric.score,'maxScore',numeric.max_score,'policyVersion',numeric.policy_version,'normalized',null)else rubric.native_result end)
 from internal.academic_result_sources source left join app.result_revisions numeric on numeric.school_id=source.school_id and numeric.id=source.numeric_result_id left join app.rubric_result_revisions rubric on rubric.school_id=source.school_id and rubric.id=source.rubric_result_id join app.assessments assessment on assessment.school_id=source.school_id and assessment.id=coalesce(numeric.assessment_id,rubric.assessment_id)
 where source.school_id=target_school and source.id=target_result
$$;
create function internal.native_academic_source_allowed(target_school uuid,target_result uuid,require_current boolean)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(exists(select 1 from internal.academic_result_sources source left join app.result_revisions numeric on numeric.school_id=source.school_id and numeric.id=source.numeric_result_id left join app.rubric_result_revisions rubric on rubric.school_id=source.school_id and rubric.id=source.rubric_result_id
 join app.assessments assessment on assessment.school_id=source.school_id and assessment.id=coalesce(numeric.assessment_id,rubric.assessment_id)
 join app.school_custom_references reference on reference.school_id=source.school_id and reference.id=coalesce(numeric.reference_id,rubric.reference_id)join app.school_custom_versions version on version.school_id=reference.school_id and version.id=reference.version_id
 where source.school_id=target_school and source.id=target_result and require_current is not null
 and"authorization".can_read_academic_source(target_school,source.learner_id,coalesce(numeric.parent_visible,rubric.parent_visible),assessment.id)
 and reference.status='APPROVED'and version.version=coalesce(numeric.reference_version,rubric.reference_version)
 and((source.model='numeric'and exists(select 1 from app.academic_evidence evidence where evidence.school_id=target_school and evidence.id=numeric.evidence_id and evidence.result_id=numeric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=numeric.submission_id and evidence.reference_id=numeric.reference_id and evidence.reference_version=numeric.reference_version and evidence.policy_version=numeric.policy_version))or(source.model='rubric'and exists(select 1 from app.rubric_evidence evidence where evidence.school_id=target_school and evidence.id=rubric.evidence_id and evidence.result_id=rubric.id and evidence.learner_id=source.learner_id and evidence.source_object_id=rubric.submission_id and evidence.reference_id=rubric.reference_id and evidence.reference_version=rubric.reference_version and evidence.policy_version=rubric.policy_version)))
 and(not require_current or(exists(select 1 from app.current_submissions current_submission where current_submission.school_id=target_school and current_submission.submission_id=coalesce(numeric.submission_id,rubric.submission_id))and((source.model='numeric'and exists(select 1 from app.current_results current_result where current_result.school_id=target_school and current_result.result_id=numeric.id))or(source.model='rubric'and exists(select 1 from app.current_rubric_results current_result where current_result.school_id=target_school and current_result.result_id=rubric.id)))))
 ),false)
$$;
create function internal.read_native_academic_source(target_result uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();source jsonb;begin
 if not internal.native_academic_source_allowed(school,target_result,true)then raise exception 'Current native academic source denied'using errcode='42501';end if;
 source:=internal.native_academic_source(school,target_result);if source is null then raise exception 'Native source missing'using errcode='42501';end if;return source;
end$$;
revoke execute on function internal.register_native_academic_source(),internal.native_academic_source(uuid,uuid),internal.native_academic_source_allowed(uuid,uuid,boolean),internal.read_native_academic_source(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_native_academic_source(uuid)to cuevo_api;
commit;
