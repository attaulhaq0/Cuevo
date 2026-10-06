-- Task-demand metadata only. No learner-level, grade, XP or prerequisite authority.
begin;

create function internal.valid_thinking_focus(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare processes text[]:=array['REMEMBER','UNDERSTAND','APPLY','ANALYZE','EVALUATE','CREATE'];
begin
 return coalesce(value is not null and jsonb_typeof(value)='object' and value-array['taxonomyVersion','primaryProcess','additionalProcesses']='{}'::jsonb
  and value?&array['taxonomyVersion','primaryProcess','additionalProcesses'] and value->>'taxonomyVersion'='revised-bloom-2001-cuevo-v1' and value->>'primaryProcess'=any(processes)
  and jsonb_typeof(value->'additionalProcesses')='array' and jsonb_array_length(value->'additionalProcesses')<=5
  and not exists(select 1 from jsonb_array_elements(value->'additionalProcesses') p where jsonb_typeof(p)<>'string' or not(p#>>'{}'=any(processes)) or p#>>'{}'=value->>'primaryProcess')
  and (select count(distinct p#>>'{}') from jsonb_array_elements(value->'additionalProcesses') p)=jsonb_array_length(value->'additionalProcesses'),false);
exception when others then return false;
end $$;

create table app.thinking_focus_revisions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),kind text not null check(kind in('activity','assessment','criterion')),source_id uuid not null,criterion_key text not null default '',course_id uuid not null,
 revision integer not null check(revision>0),source_version text not null check(length(source_version)between 1 and 2000),source jsonb not null,
 content_revision_id uuid,focus jsonb not null check(internal.valid_thinking_focus(focus)),rationale text not null check(length(btrim(rationale))between 1 and 2000),
 state text not null check(state in('AWAITING_REVIEW','APPROVED','REJECTED','WITHDRAWN')),author_id uuid not null,authored_at timestamptz not null,
 reviewer_id uuid,reviewed_at timestamptz,review_reason text,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),previous_revision_id uuid,
 primary key(school_id,id),unique(school_id,kind,source_id,criterion_key,revision),unique(school_id,id,kind,source_id,criterion_key),
 foreign key(school_id,course_id)references app.courses(school_id,id),foreign key(school_id,content_revision_id)references app.learning_content_revisions(school_id,id),
 foreign key(school_id,author_id)references app.memberships(school_id,actor_id),foreign key(school_id,reviewer_id)references app.memberships(school_id,actor_id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),
 foreign key(school_id,previous_revision_id,kind,source_id,criterion_key)references app.thinking_focus_revisions(school_id,id,kind,source_id,criterion_key),
 check((kind='criterion'and length(btrim(criterion_key))between 1 and 100)or(kind<>'criterion'and criterion_key='')),
 check((kind='activity')=(content_revision_id is not null)),
 check((state='AWAITING_REVIEW'and reviewer_id is null and reviewed_at is null and review_reason is null)or(state<>'AWAITING_REVIEW'and reviewer_id is not null and reviewer_id<>author_id and reviewed_at>=authored_at and length(btrim(review_reason))between 1 and 2000))
);
create table app.thinking_focus_current(
 school_id uuid not null,id uuid not null default gen_random_uuid(),kind text not null,source_id uuid not null,criterion_key text not null default '',course_id uuid not null,revision_id uuid not null,
 primary key(school_id,kind,source_id,criterion_key),unique(school_id,id),foreign key(school_id,course_id)references app.courses(school_id,id),
 foreign key(school_id,revision_id,kind,source_id,criterion_key)references app.thinking_focus_revisions(school_id,id,kind,source_id,criterion_key)
);
create index thinking_focus_course_page on app.thinking_focus_current(school_id,course_id,id);
create index thinking_focus_source_history on app.thinking_focus_revisions(school_id,kind,source_id,criterion_key,revision desc);
create table app.thinking_focus_completion_snapshots(
 school_id uuid not null,completion_id uuid not null,items jsonb not null check(jsonb_typeof(items)='array'and jsonb_array_length(items)<=1031 and octet_length(items::text)<=500000),created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,completion_id),foreign key(school_id,completion_id)references app.activity_completions(school_id,id)
);
create table app.thinking_focus_submission_snapshots(
 school_id uuid not null,submission_id uuid not null,items jsonb not null check(jsonb_typeof(items)='array'and jsonb_array_length(items)<=1031 and octet_length(items::text)<=500000),created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,submission_id),foreign key(school_id,submission_id)references app.submissions(school_id,id)
);

-- This purpose helper reuses current course/object authorization. Explicit revision
-- selection is private and used only to pin unchanged publication and recorded work.
create function internal.thinking_focus_source(target_kind text,target_id uuid,target_key text,target_revision uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();course uuid;staff boolean;content app.learning_content_revisions;assessment app.assessments;rubric app.rubric_versions;criterion jsonb;basis jsonb;resources jsonb;source jsonb;
begin
 if target_kind is null or target_kind not in('activity','assessment','criterion')or target_id is null or(target_kind='criterion'and(target_key is null or length(btrim(target_key))not between 1 and 100))or(target_kind<>'criterion'and target_key is not null)then raise exception 'Exact task focus target required'using errcode='22023';end if;
 if target_kind='activity'then course:=internal.learning_content_course('activity',target_id);else course:="authorization".assessment_course(school,target_id);end if;
 if course is null or not"authorization".can_read_course(school,course)or not"authorization".has_entitlement(school,'learning')or "authorization".current_role(school)not in('admin','teacher','coordinator','student','parent')then raise exception 'Task focus source denied'using errcode='42501';end if;
 staff:="authorization".can_manage_course(school,course)or("authorization".current_role(school)in('admin','coordinator')and"authorization".has_entitlement(school,'curriculum'));
 if target_kind='activity'then
  select r.*into content from app.learning_content_current p join app.learning_content_revisions r on r.school_id=p.school_id and r.id=coalesce(target_revision,case when staff then p.draft_revision_id else p.published_revision_id end) where p.school_id=school and p.resource='activity'and p.source_id=target_id and r.resource='activity'and r.source_id=target_id;
  if content.id is null or content.state='RETIRED'or(not staff and(content.state<>'PUBLISHED'or not internal.learning_content_ancestors_visible('activity',target_id)))then raise exception 'Current task content denied'using errcode='42501';end if;
  source:=jsonb_build_object('title',content.title,'instructions',content.content,'contentRevision',content.revision,'preparationVersion',null,'policyVersion',null,'rubricVersion',null,'criterionTitle',null);
  basis:=jsonb_build_object('contentRevisionId',content.id,'kind',content.kind,'assessmentId',content.assessment_id);
 else
  select a.*into assessment from app.assessments a where a.school_id=school and a.id=target_id and a.course_id=course;
  if assessment.id is null or(assessment.status<>'PUBLISHED'and not staff)then raise exception 'Current assessment source denied'using errcode='42501';end if;
  if assessment.model='rubric'then select r.*into rubric from app.assessment_rubrics a join app.rubric_versions r on r.school_id=a.school_id and r.id=a.rubric_id where a.school_id=school and a.assessment_id=assessment.id and r.course_id=course;end if;
  if target_kind='criterion'then select c into criterion from jsonb_array_elements(rubric.criteria)c where c->>'key'=target_key;if criterion is null and not exists(select 1 from app.thinking_focus_current c where c.school_id=school and c.kind='criterion'and c.source_id=target_id and c.criterion_key=target_key)then raise exception 'Exact current rubric criterion required'using errcode='42501';end if;end if;
  source:=jsonb_build_object('title',assessment.title,'instructions',assessment.instructions,'contentRevision',null,'preparationVersion',assessment.preparation_version,'policyVersion',assessment.policy_version,'rubricVersion',case when rubric.id is not null then rubric.id::text||':'||rubric.version else null end,'criterionTitle',criterion->>'title');
  basis:=jsonb_build_object('assessmentId',assessment.id,'model',assessment.model,'maxScore',assessment.max_score,'referenceId',assessment.academic_reference_id,'rubricId',rubric.id,'rubricVersion',rubric.version,'criterion',criterion);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('resourceId',r.id,'revisionId',v.id,'state',v.state,'assetId',v.asset_id)order by r.id),'[]'::jsonb)into resources from app.learning_resources r join app.learning_resource_current p on p.school_id=r.school_id and p.resource_id=r.id join app.learning_resource_revisions v on v.school_id=p.school_id and v.id=p.revision_id where r.school_id=school and r.course_id=course and r.target_kind=case when target_kind='criterion'then'assessment'else target_kind end and r.target_id=target_id and(v.state='PUBLISHED'or(v.state='ATTACHED'and case when target_kind='activity'then content.state='DRAFT'else assessment.status='DRAFT'end));
 return jsonb_build_object('courseId',course,'targetTitle',coalesce(criterion->>'title',source->>'title'),'source',source,'sourceVersion',encode(sha256(convert_to(jsonb_build_object('kind',target_kind,'id',target_id,'criterionKey',target_key,'basis',basis,'source',source,'materials',resources)::text,'UTF8')),'hex'),'contentRevisionId',content.id,'staff',staff,'basis',basis,'materials',resources);
end $$;

create function internal.thinking_focus_projection(target_revision uuid,current_source jsonb default null,mutable boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();r app.thinking_focus_revisions;source jsonb;status text;review boolean;
begin
 select v.*into r from app.thinking_focus_revisions v where v.school_id=school and v.id=target_revision;if not found then raise exception 'Task focus revision unavailable'using errcode='42501';end if;
 source:=coalesce(current_source,jsonb_build_object('source',r.source,'sourceVersion',r.source_version,'targetTitle',coalesce(r.source->>'criterionTitle',r.source->>'title')));
 status:=case when source->>'sourceVersion'<>r.source_version then'SOURCE_CHANGED'else r.state end;
 review:=mutable and"authorization".current_role(school)in('admin','coordinator')and"authorization".has_entitlement(school,'curriculum')and"authorization".actor_id()<>r.author_id and status in('AWAITING_REVIEW','APPROVED');
 return jsonb_build_object('schemaVersion','1','target',jsonb_build_object('kind',upper(r.kind),'id',r.source_id,'criterionKey',nullif(r.criterion_key,'')),'courseId',r.course_id,'targetTitle',source->>'targetTitle','sourceVersion',source->>'sourceVersion','status',status,'revision',r.revision,
  'classification',jsonb_build_object('id',r.id,'revision',r.revision,'focus',r.focus,'rationale',r.rationale,'authorId',r.author_id,'authoredAt',r.authored_at,'reviewerId',r.reviewer_id,'reviewedAt',r.reviewed_at,'reviewReason',r.review_reason),'source',source->'source','canAuthor',mutable and"authorization".can_manage_course(school,r.course_id),'canReview',review);
end $$;

create function internal.read_thinking_focus(target_kind text,target_id uuid,target_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();source jsonb;rid uuid;staff boolean;r app.thinking_focus_revisions;
begin
 source:=internal.thinking_focus_source(target_kind,target_id,target_key);staff:=(source->>'staff')::boolean;
 select c.revision_id into rid from app.thinking_focus_current c where c.school_id=school and c.kind=target_kind and c.source_id=target_id and c.criterion_key=coalesce(target_key,'');
 if rid is not null and not staff then
  -- Only decisions for this exact published task can affect learner presentation.
  select v.*into r from app.thinking_focus_revisions v where v.school_id=school and v.kind=target_kind and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and v.source_version=source->>'sourceVersion'and v.state<>'AWAITING_REVIEW'order by v.revision desc limit 1;
  rid:=case when r.state='APPROVED'then r.id else null end;
 end if;
 if rid is not null then return internal.thinking_focus_projection(rid,source,staff);end if;
 return jsonb_build_object('schemaVersion','1','target',jsonb_build_object('kind',upper(target_kind),'id',target_id,'criterionKey',target_key),'courseId',source->'courseId','targetTitle',source->>'targetTitle','sourceVersion',source->>'sourceVersion','status','UNCLASSIFIED','revision',0,'classification',null,'source',source->'source','canAuthor',staff and"authorization".can_manage_course(school,(source->>'courseId')::uuid),'canReview',false);
end $$;

create function internal.thinking_focus_command(command_name text,target_kind text,target_id uuid,target_key text,payload jsonb,command_key text,fingerprint text,request_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();source jsonb;course uuid;current app.thinking_focus_revisions;reservation jsonb;rid uuid;receipt jsonb;next_revision integer;state text;decision text;
begin
 source:=internal.thinking_focus_source(target_kind,target_id,target_key);course:=(source->>'courseId')::uuid;
 if target_kind='criterion'and source->'source'->>'criterionTitle'is null then raise exception 'Current criterion must be restored before authoring'using errcode='42501';end if;
 if command_name is null or command_name not in('draft','review')then raise exception 'Task focus command required'using errcode='22023';end if;
 if command_name='draft'then if not"authorization".can_manage_course(school,course)or"authorization".current_role(school)not in('admin','teacher')then raise exception 'Task focus author denied'using errcode='42501';end if;perform internal.require_curriculum_academic_write(course);
 else if "authorization".current_role(school)not in('admin','coordinator')or not"authorization".has_entitlement(school,'curriculum')then raise exception 'Task focus reviewer denied'using errcode='42501';end if;perform internal.lock_academic_course(school,course);end if;
 -- All task/material/preparation writers serialize on the same course boundary.
 if target_kind='activity'then perform 1 from app.learning_content_current c where c.school_id=school and c.resource='activity'and c.source_id=target_id for update;else perform 1 from app.assessments a where a.school_id=school and a.id=target_id for update;end if;
 source:=internal.thinking_focus_source(target_kind,target_id,target_key);
 select v.*into current from app.thinking_focus_current c join app.thinking_focus_revisions v on v.school_id=c.school_id and v.id=c.revision_id where c.school_id=school and c.kind=target_kind and c.source_id=target_id and c.criterion_key=coalesce(target_key,'') for update of c;
 if payload is null or jsonb_typeof(payload)<>'object'or jsonb_typeof(payload->'expectedRevision')is distinct from'number'or(payload->>'expectedRevision')!~'^[0-9]+$'or jsonb_typeof(payload->'expectedSourceVersion')is distinct from'string'or payload->>'expectedSourceVersion'is distinct from source->>'sourceVersion' then raise exception 'Current task focus source required'using errcode='22023';end if;
 if command_name='review'and(current.id is null or current.author_id=actor)then raise exception 'Different original author and reviewer required'using errcode='42501';end if;
 -- Scope/source checks deliberately precede idempotency reconciliation.
 reservation:=internal.begin_command(command_key,'thinking_focus.'||command_name,fingerprint);
 if reservation->>'state'='COMPLETED'then
  select v.id into rid from app.thinking_focus_revisions v where v.school_id=school and v.id=(reservation->'response'->>'id')::uuid and v.kind=target_kind and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and v.source_version=source->>'sourceVersion';
  if rid is null then raise exception 'Original task focus source changed'using errcode='22023';end if;
  receipt:=internal.thinking_focus_projection(rid,source,true);return receipt||jsonb_build_object('id',rid);
 elsif reservation->>'state'<>'NEW'then raise exception 'Task focus command pending'using errcode='22023';end if;
 if coalesce(current.revision,0)<>(payload->>'expectedRevision')::integer then raise exception 'Task focus revision changed'using errcode='22023';end if;
 next_revision:=coalesce(current.revision,0)+1;
 if command_name='draft'then
  if payload-array['expectedRevision','expectedSourceVersion','focus','rationale']<>'{}'::jsonb or not internal.valid_thinking_focus(payload->'focus')or jsonb_typeof(payload->'rationale')is distinct from'string'or length(btrim(payload->>'rationale'))not between 1 and 2000 then raise exception 'Reviewed task demand fields required'using errcode='22023';end if;
  insert into app.thinking_focus_revisions(school_id,kind,source_id,criterion_key,course_id,revision,source_version,source,content_revision_id,focus,rationale,state,author_id,authored_at,created_by,previous_revision_id)
  values(school,target_kind,target_id,coalesce(target_key,''),course,next_revision,source->>'sourceVersion',source->'source',(source->>'contentRevisionId')::uuid,payload->'focus',btrim(payload->>'rationale'),'AWAITING_REVIEW',actor,clock_timestamp(),actor,current.id)returning id into rid;
 else
  decision:=payload->>'decision';
  if payload-array['expectedRevision','expectedSourceVersion','decision','reason','confirmReview']<>'{}'::jsonb or payload->'confirmReview'is distinct from'true'::jsonb or decision is null or decision not in('APPROVE','REJECT','WITHDRAW')or jsonb_typeof(payload->'reason')is distinct from'string'or length(btrim(payload->>'reason'))not between 1 and 2000 or current.source_version<>source->>'sourceVersion'or(decision in('APPROVE','REJECT')and current.state<>'AWAITING_REVIEW')or(decision='WITHDRAW'and current.state<>'APPROVED')then raise exception 'Exact task source and review confirmation required'using errcode='22023';end if;
  state:=case decision when'APPROVE'then'APPROVED'when'REJECT'then'REJECTED'else'WITHDRAWN'end;
  insert into app.thinking_focus_revisions(school_id,kind,source_id,criterion_key,course_id,revision,source_version,source,content_revision_id,focus,rationale,state,author_id,authored_at,reviewer_id,reviewed_at,review_reason,created_by,previous_revision_id)
  values(school,target_kind,target_id,coalesce(target_key,''),course,next_revision,current.source_version,current.source,current.content_revision_id,current.focus,current.rationale,state,current.author_id,current.authored_at,actor,clock_timestamp(),btrim(payload->>'reason'),actor,current.id)returning id into rid;
 end if;
 insert into app.thinking_focus_current(school_id,kind,source_id,criterion_key,course_id,revision_id)values(school,target_kind,target_id,coalesce(target_key,''),course,rid)on conflict(school_id,kind,source_id,criterion_key)do update set revision_id=excluded.revision_id;
 perform internal.append_audit('thinking_focus.'||command_name,'thinking_focus',rid,request_id,'succeeded',jsonb_build_object('kind',target_kind,'sourceId',target_id,'criterionKey',target_key,'revision',next_revision));
 perform internal.enqueue_event(case when command_name='draft'then'thinking_focus.drafted'else'thinking_focus.reviewed'end,'thinking_focus',rid,next_revision,jsonb_build_object('schemaVersion','1','sourceVersion',source->>'sourceVersion'),'thinking-focus:'||rid::text);
 perform internal.finish_command(command_key,'thinking_focus.'||command_name,fingerprint,jsonb_build_object('id',rid));
 receipt:=internal.thinking_focus_projection(rid,source,true);return receipt||jsonb_build_object('id',rid);
end $$;

-- Publication records a new immutable classification lineage only when its exact
-- previous DRAFT bytes and materials were independently approved and unchanged.
create function internal.thinking_focus_content_publication() returns trigger language plpgsql security definer set search_path='' as $$
declare previous app.learning_content_revisions;classification app.thinking_focus_revisions;old_source jsonb;new_source jsonb;rid uuid;
begin
 if new.resource<>'activity'or new.state<>'PUBLISHED'then return new;end if;
 select r.*into previous from app.learning_content_revisions r where r.school_id=new.school_id and r.resource='activity'and r.source_id=new.source_id and r.revision=new.revision-1;
 if previous.state is distinct from'DRAFT'or row(previous.title,previous.content,previous.kind,previous.assessment_id)is distinct from row(new.title,new.content,new.kind,new.assessment_id)then return new;end if;
 select v.*into classification from app.thinking_focus_current c join app.thinking_focus_revisions v on v.school_id=c.school_id and v.id=c.revision_id where c.school_id=new.school_id and c.kind='activity'and c.source_id=new.source_id and c.criterion_key='' for update of c;
 if classification.state is distinct from'APPROVED'or classification.content_revision_id is distinct from previous.id then return new;end if;
 old_source:=internal.thinking_focus_source('activity',new.source_id,null,previous.id);
 if classification.source_version is distinct from old_source->>'sourceVersion'then return new;end if;
 new_source:=internal.thinking_focus_source('activity',new.source_id,null,new.id);
 if new_source->'materials'is distinct from old_source->'materials'then return new;end if;
 insert into app.thinking_focus_revisions(school_id,kind,source_id,criterion_key,course_id,revision,source_version,source,content_revision_id,focus,rationale,state,author_id,authored_at,reviewer_id,reviewed_at,review_reason,created_by,previous_revision_id)
 values(new.school_id,'activity',new.source_id,'',new.course_id,classification.revision+1,new_source->>'sourceVersion',new_source->'source',new.id,classification.focus,classification.rationale,'APPROVED',classification.author_id,classification.authored_at,classification.reviewer_id,classification.reviewed_at,classification.review_reason,"authorization".actor_id(),classification.id)returning id into rid;
 update app.thinking_focus_current c set revision_id=rid where c.school_id=new.school_id and c.kind='activity'and c.source_id=new.source_id and c.criterion_key='';
 perform internal.append_audit('thinking_focus.publication','thinking_focus',rid,'content-publication:'||new.id::text,'succeeded',jsonb_build_object('sourceRevisionId',new.id,'previousClassificationId',classification.id));
 perform internal.enqueue_event('thinking_focus.reviewed','thinking_focus',rid,classification.revision+1,jsonb_build_object('schemaVersion','1','sourceVersion',new_source->>'sourceVersion'),'thinking-focus:'||rid::text);return new;
end $$;
create trigger thinking_focus_publication after insert on app.learning_content_revisions for each row execute function internal.thinking_focus_content_publication();

-- Assessment publication changes preparation identity. Carry only approved exact
-- unchanged title/instructions/policy/rubric/material provenance into that lineage.
create function internal.thinking_focus_assessment_publication()returns trigger language plpgsql security definer set search_path=''as $$
declare classification app.thinking_focus_revisions;new_source jsonb;old_source jsonb;old_version text;rid uuid;
begin
 if old.status<>'DRAFT'or new.status<>'PUBLISHED'or new.preparation_version<>old.preparation_version+1 or(to_jsonb(new)-array['status','assignment_state','availability_version','preparation_version'])is distinct from(to_jsonb(old)-array['status','assignment_state','availability_version','preparation_version'])then return new;end if;
 for classification in select v.*from app.thinking_focus_current c join app.thinking_focus_revisions v on v.school_id=c.school_id and v.id=c.revision_id where c.school_id=new.school_id and c.kind in('assessment','criterion')and c.source_id=new.id and v.state='APPROVED'order by c.criterion_key for update of c loop
  new_source:=internal.thinking_focus_source(classification.kind,new.id,nullif(classification.criterion_key,''));
  old_source:=(new_source->'source')||jsonb_build_object('preparationVersion',old.preparation_version);
  old_version:=encode(sha256(convert_to(jsonb_build_object('kind',classification.kind,'id',new.id,'criterionKey',nullif(classification.criterion_key,''),'basis',new_source->'basis','source',old_source,'materials',new_source->'materials')::text,'UTF8')),'hex');
  if classification.source_version is distinct from old_version then continue;end if;
  insert into app.thinking_focus_revisions(school_id,kind,source_id,criterion_key,course_id,revision,source_version,source,focus,rationale,state,author_id,authored_at,reviewer_id,reviewed_at,review_reason,created_by,previous_revision_id)
  values(new.school_id,classification.kind,new.id,classification.criterion_key,new.course_id,classification.revision+1,new_source->>'sourceVersion',new_source->'source',classification.focus,classification.rationale,'APPROVED',classification.author_id,classification.authored_at,classification.reviewer_id,classification.reviewed_at,classification.review_reason,"authorization".actor_id(),classification.id)returning id into rid;
  update app.thinking_focus_current c set revision_id=rid where c.school_id=new.school_id and c.kind=classification.kind and c.source_id=new.id and c.criterion_key=classification.criterion_key;
  perform internal.append_audit('thinking_focus.publication','thinking_focus',rid,'assessment-publication:'||new.id::text,'succeeded',jsonb_build_object('preparationVersion',new.preparation_version,'previousClassificationId',classification.id));
  perform internal.enqueue_event('thinking_focus.reviewed','thinking_focus',rid,classification.revision+1,jsonb_build_object('schemaVersion','1','sourceVersion',new_source->>'sourceVersion'),'thinking-focus:'||rid::text);
 end loop;return new;
end $$;
create trigger thinking_focus_publication after update on app.assessments for each row execute function internal.thinking_focus_assessment_publication();

create function internal.read_thinking_focus_history(target_kind text,target_id uuid,target_key text,page_limit integer,page_cursor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();source jsonb;items jsonb;cursor_revision integer;
begin
 source:=internal.thinking_focus_source(target_kind,target_id,target_key);
 if not(source->>'staff')::boolean then raise exception 'Task focus staff history denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 25 then raise exception 'Bounded task focus history required'using errcode='22023';end if;
 if page_cursor is not null then select r.revision into cursor_revision from app.thinking_focus_revisions r where r.school_id=school and r.id=page_cursor and r.kind=target_kind and r.source_id=target_id and r.criterion_key=coalesce(target_key,'');if cursor_revision is null then raise exception 'Exact task focus history cursor required'using errcode='22023';end if;end if;
 select coalesce(jsonb_agg(internal.thinking_focus_projection(r.id)order by r.revision desc),'[]'::jsonb)into items from(select v.*from app.thinking_focus_revisions v where v.school_id=school and v.kind=target_kind and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and(cursor_revision is null or v.revision<cursor_revision)order by v.revision desc limit page_limit+1)r;
 if octet_length(items::text)>500000 then raise exception 'Task focus history needs smaller page'using errcode='22023';end if;
 return jsonb_build_object('schemaVersion','1','target',jsonb_build_object('kind',upper(target_kind),'id',target_id,'criterionKey',target_key),'courseId',source->'courseId','targetTitle',source->>'targetTitle','sourceVersion',source->>'sourceVersion','items',case when jsonb_array_length(items)>page_limit then items-page_limit else items end,'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->'classification'->>'id'else null end);
end $$;

create function internal.read_thinking_focus_course(target_course uuid,page_limit integer,page_cursor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();items jsonb;next_id uuid;
begin
 if not"authorization".can_read_course(school,target_course)or not("authorization".can_manage_course(school,target_course)or"authorization".current_role(school)in('admin','coordinator')and"authorization".has_entitlement(school,'curriculum'))then raise exception 'Current task focus review course denied'using errcode='42501';end if;
 if page_limit is null or page_limit not between 1 and 100 or(page_cursor is not null and not exists(select 1 from app.thinking_focus_current c where c.school_id=school and c.course_id=target_course and c.id=page_cursor))then raise exception 'Bounded task focus course cursor required'using errcode='22023';end if;
 select coalesce(jsonb_agg(internal.read_thinking_focus(c.kind,c.source_id,nullif(c.criterion_key,''))order by c.id),'[]'::jsonb)into items from(select p.*from app.thinking_focus_current p where p.school_id=school and p.course_id=target_course and(page_cursor is null or p.id>page_cursor)order by p.id limit page_limit)c;
 select c.id into next_id from app.thinking_focus_current c where c.school_id=school and c.course_id=target_course and(page_cursor is null or c.id>page_cursor)order by c.id offset page_limit-1 limit 1;
 if not exists(select 1 from app.thinking_focus_current c where c.school_id=school and c.course_id=target_course and c.id>next_id)then next_id:=null;end if;
 if octet_length(items::text)>500000 then raise exception 'Task focus review needs smaller page'using errcode='22023';end if;
 return jsonb_build_object('schemaVersion','1','courseId',target_course,'items',items,'nextCursor',next_id);
end $$;

create function internal.read_thinking_focus_set(targets jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if targets is null or jsonb_typeof(targets)<>'array'or jsonb_array_length(targets)>1201 or octet_length(targets::text)>200000 or exists(select 1 from jsonb_array_elements(targets)t where jsonb_typeof(t)<>'object'or t-array['kind','id','criterionKey']<>'{}'::jsonb or not(t?&array['kind','id','criterionKey'])or jsonb_typeof(t->'kind')is distinct from'string'or t->>'kind'not in('activity','assessment','criterion')or jsonb_typeof(t->'id')is distinct from'string'or(t->'criterionKey'<>'null'::jsonb and jsonb_typeof(t->'criterionKey')is distinct from'string'))or(select count(distinct (t->>'kind',t->>'id',t->>'criterionKey'))from jsonb_array_elements(targets)t)<>jsonb_array_length(targets)then raise exception 'Exact bounded task focus targets required'using errcode='22023';end if;
 select coalesce(jsonb_agg(internal.read_thinking_focus(t->>'kind',(t->>'id')::uuid,t->>'criterionKey')order by ord),'[]'::jsonb)into items from jsonb_array_elements(targets)with ordinality as target(t,ord);
 if octet_length(items::text)>500000 then raise exception 'Task focus set needs smaller page'using errcode='22023';end if;return items;
end $$;

-- Snapshot this published revision even when the source actor can see newer drafts.
create function internal.thinking_focus_recorded_item(target_kind text,target_id uuid,target_key text,target_content_revision uuid default null)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source jsonb;r app.thinking_focus_revisions;
begin
 source:=internal.thinking_focus_source(target_kind,target_id,target_key,target_content_revision);
 select v.*into r from app.thinking_focus_revisions v where v.school_id=school and v.kind=target_kind and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and v.source_version=source->>'sourceVersion'and v.state<>'AWAITING_REVIEW'order by v.revision desc limit 1;
 if r.state is distinct from'APPROVED'then return null;end if;return internal.thinking_focus_projection(r.id);
end $$;
create function internal.thinking_focus_snapshot_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;items jsonb:='[]'::jsonb;target record;assessment app.assessments;rubric app.rubric_versions;activity_revision uuid;
begin
 if tg_table_name='activity_completions'then
  select c.activity_revision_id into activity_revision from app.learning_completion_context c where c.school_id=new.school_id and c.completion_id=new.id;
  if activity_revision is null then raise exception 'Recorded activity content required'using errcode='22023';end if;
  item:=internal.thinking_focus_recorded_item('activity',new.activity_id,null,activity_revision);if item is not null then items:=jsonb_build_array(item);end if;
  insert into app.thinking_focus_completion_snapshots(school_id,completion_id,items)values(new.school_id,new.id,items);
 elsif tg_table_name='submissions'then
  item:=internal.thinking_focus_recorded_item('assessment',new.assessment_id,null);if item is not null then items:=items||jsonb_build_array(item);end if;
  select a.*into assessment from app.assessments a where a.school_id=new.school_id and a.id=new.assessment_id;
  if assessment.model='rubric'then select r.*into rubric from app.assessment_rubrics a join app.rubric_versions r on r.school_id=a.school_id and r.id=a.rubric_id where a.school_id=new.school_id and a.assessment_id=new.assessment_id;for target in select c->>'key' as key from jsonb_array_elements(rubric.criteria)c loop item:=internal.thinking_focus_recorded_item('criterion',new.assessment_id,target.key);if item is not null then items:=items||jsonb_build_array(item);end if;end loop;end if;
  for target in select r.source_id,r.id from app.learning_submission_activity_context c join app.learning_content_revisions r on r.school_id=c.school_id and r.id=c.activity_revision_id where c.school_id=new.school_id and c.submission_id=new.id order by r.source_id loop
   item:=internal.thinking_focus_recorded_item('activity',target.source_id,null,target.id);if item is not null then items:=items||jsonb_build_array(item);end if;
  end loop;
  insert into app.thinking_focus_submission_snapshots(school_id,submission_id,items)values(new.school_id,new.id,items);
 else raise exception 'Exact learning snapshot source required'using errcode='22023';end if;
 return new;
end $$;
-- Names sort after existing content snapshots; both commit with the source mutation.
create trigger thinking_focus_snapshot after insert on app.activity_completions for each row execute function internal.thinking_focus_snapshot_capture();
create trigger thinking_focus_snapshot after insert on app.submissions for each row execute function internal.thinking_focus_snapshot_capture();

create function internal.read_thinking_focus_snapshot(target_kind text,target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare school uuid:="authorization".school_id();items jsonb;source_id uuid:=target_id;kind text:=target_kind;native jsonb;result_id uuid;
begin
 if target_kind='result'then native:=internal.read_native_academic_source(target_id);source_id:=(native->>'submissionId')::uuid;kind:='submission';result_id:=target_id;
 elsif target_kind in('completion','submission')then perform internal.read_learning_source_context(target_kind,target_id);
 else raise exception 'Exact learning snapshot context required'using errcode='22023';end if;
 if kind='completion'then select s.items into items from app.thinking_focus_completion_snapshots s where s.school_id=school and s.completion_id=source_id;
 else select s.items into items from app.thinking_focus_submission_snapshots s where s.school_id=school and s.submission_id=source_id;end if;
 return jsonb_build_object('schemaVersion','1','kind',kind,'id',source_id,'recorded',items is not null,'scope','RECORDED_TASK_DEMAND_NOT_ATTAINMENT','items',coalesce(items,'[]'::jsonb))||case when result_id is not null then jsonb_build_object('resultId',result_id)else'{}'::jsonb end;
end $$;

do $$declare tab text;begin
 foreach tab in array array['thinking_focus_revisions','thinking_focus_current','thinking_focus_completion_snapshots','thinking_focus_submission_snapshots']loop
  execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);execute format('revoke all on app.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);
 end loop;
 foreach tab in array array['thinking_focus_revisions','thinking_focus_completion_snapshots','thinking_focus_submission_snapshots']loop execute format('create trigger immutable_history before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);execute format('create trigger immutable_truncate before truncate on app.%I for each statement execute function internal.academic_history_immutable()',tab);end loop;
end $$;
revoke execute on function internal.valid_thinking_focus(jsonb),internal.thinking_focus_source(text,uuid,text,uuid),internal.thinking_focus_projection(uuid,jsonb,boolean),internal.read_thinking_focus(text,uuid,text),internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text),internal.thinking_focus_content_publication(),internal.thinking_focus_assessment_publication(),internal.read_thinking_focus_history(text,uuid,text,integer,uuid),internal.read_thinking_focus_course(uuid,integer,uuid),internal.read_thinking_focus_set(jsonb),internal.thinking_focus_recorded_item(text,uuid,text,uuid),internal.thinking_focus_snapshot_capture(),internal.read_thinking_focus_snapshot(text,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_thinking_focus(text,uuid,text),internal.thinking_focus_command(text,text,uuid,text,jsonb,text,text,text),internal.read_thinking_focus_history(text,uuid,text,integer,uuid),internal.read_thinking_focus_course(uuid,integer,uuid),internal.read_thinking_focus_set(jsonb),internal.read_thinking_focus_snapshot(text,uuid)to cuevo_api;
commit;
