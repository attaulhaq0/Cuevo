begin;
-- Existing approvals do not retrospectively approve disclosure of submitted answer text.
alter table app.portfolio_reviews add column source_review_confirmed boolean not null default false;
create function internal.read_portfolio_source_work(target_item uuid,target_revision uuid)returns jsonb
language plpgsql security definer set search_path=''set jit='off'as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();role_name text:="authorization".current_role(school);
 item app.portfolio_items;revision app.portfolio_revisions;pointer app.portfolio_current;review app.portfolio_reviews;source jsonb;submitted app.submissions;assessment app.assessments;learner_name text;response jsonb;
begin
 if not"authorization".can_access_school(school)or not"authorization".has_entitlement(school,'portfolio')or role_name not in('admin','coordinator','teacher','student','parent')then raise exception 'Portfolio source work denied'using errcode='42501';end if;
 select*into item from app.portfolio_items where school_id=school and id=target_item;
 select*into revision from app.portfolio_revisions where school_id=school and id=target_revision and item_id=target_item;
 if item.id is null or revision.id is null or not"authorization".can_view_person(school,item.learner_id)then raise exception 'Selected portfolio revision denied'using errcode='42501';end if;
 if role_name='student'and item.learner_id<>actor then raise exception 'Own portfolio source required'using errcode='42501';end if;
 if role_name='parent'then
  select*into pointer from app.portfolio_current where school_id=school and item_id=item.id;
  select*into review from app.portfolio_reviews where school_id=school and item_id=item.id and revision_id=revision.id;
  if pointer.parent_revision_id is distinct from revision.id or review.id is null or not review.parent_visible or not review.source_review_confirmed then raise exception 'Exact source review and parent publication required'using errcode='42501';end if;
 end if;
 source:=internal.portfolio_source(item.source_model,item.evidence_id,role_name='parent');
 select*into submitted from app.submissions where school_id=school and id=(source->>'submissionId')::uuid and learner_id=item.learner_id;
 select*into assessment from app.assessments where school_id=school and id=submitted.assessment_id;
 if submitted.id is null or assessment.id is null or assessment.submission_kind<>'TEXT'then raise exception 'Selected source is not text work'using errcode='22023';end if;
 if not"authorization".can_read_academic_source(school,item.learner_id,(source->>'parentVisible')::boolean,assessment.id)then raise exception 'Current academic source denied'using errcode='42501';end if;
 if role_name='parent'and not"authorization".current_learner_course(school,assessment.course_id,item.learner_id)then raise exception 'Current selected child course denied'using errcode='42501';end if;
 if role_name in('admin','teacher')and not"authorization".can_mark_submission(school,submitted.id)then raise exception 'Current staff source denied'using errcode='42501';end if;
 select display_name into learner_name from app.people where school_id=school and actor_id=item.learner_id;
 response:=jsonb_build_object('itemId',item.id,'revisionId',revision.id,'portfolioRevision',revision.revision,'learnerId',item.learner_id,'learnerName',learner_name,'evidenceId',item.evidence_id,'resultId',source->>'resultId','referenceId',source->>'referenceId','referenceVersion',source->>'referenceVersion','policyVersion',(source->>'policyVersion')::integer,
  'source',jsonb_build_object('kind','TEXT','submissionId',submitted.id,'submissionRevision',submitted.revision,'assessmentId',assessment.id,'assessmentTitle',assessment.title,'submittedAt',submitted.submitted_at,'content',submitted.content));
 if octet_length(response::text)>250000 then raise exception 'Selected source exceeds review bound'using errcode='22023';end if;
 return response;
end$$;
-- Current list metadata identifies the source without placing every answer in its page.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.portfolio_source(text,uuid,boolean)'::regprocedure);previous:=definition;
 definition:=replace(definition,'''assessmentTitle'',a.title','''assessmentTitle'',a.title,''submissionKind'',a.submission_kind');
 if definition=previous then raise exception 'Portfolio source metadata shape changed'using errcode='22023';end if;execute definition;
 definition:=pg_get_functiondef('internal.portfolio_command(text,uuid,jsonb,text,text,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'elsif command_name=''review''then'||chr(10),
  'elsif command_name=''review''then'||chr(10)||'   if source->>''submissionKind''=''TEXT''then if(payload->>''confirmSourceReview'')::boolean is distinct from true then raise exception ''Review the exact submitted text before approval''using errcode=''22023'';end if;perform internal.read_portfolio_source_work(iid,revision.id);end if;'||chr(10));
 definition:=replace(definition,'revision_id,feedback,featured,parent_visible,reviewed_by)values(school,iid,revision.id,payload->>''feedback'',(payload->>''featured'')::boolean,(payload->>''parentVisible'')::boolean,actor)',
  'revision_id,feedback,featured,parent_visible,reviewed_by,source_review_confirmed)values(school,iid,revision.id,payload->>''feedback'',(payload->>''featured'')::boolean,(payload->>''parentVisible'')::boolean,actor,coalesce((payload->>''confirmSourceReview'')::boolean,false))');
 if definition=previous or position('source_review_confirmed)values'in definition)=0 or position('Review the exact submitted text before approval'in definition)=0 then raise exception 'Portfolio review source shape changed'using errcode='22023';end if;execute definition;
end$$;
revoke execute on function internal.read_portfolio_source_work(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_portfolio_source_work(uuid,uuid)to cuevo_api;
commit;
