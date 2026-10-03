begin;
alter table internal.intervention_approved_options add column content_revision_id uuid;
alter table internal.intervention_approved_options add column content_revision integer;
alter table internal.intervention_approved_options add foreign key(school_id,content_revision_id)references app.learning_content_revisions(school_id,id);
alter table internal.intervention_approved_options add check((content_revision_id is null and content_revision is null)or(content_revision_id is not null and content_revision is not null and content_revision>0));
create function internal.insight_published_option(target_school uuid,target_activity uuid,saved jsonb)returns boolean language plpgsql stable security definer set search_path=''as $$declare published jsonb;begin
 if target_school is distinct from"authorization".school_id()then return false;end if;
 published:=internal.learning_published_content(target_school,'activity',target_activity);
 if published is null or saved is null or published->>'kind'is distinct from saved->>'kind'or published->>'title'is distinct from saved->>'title'or published->>'content'is distinct from saved->>'instructions'then return false;end if;
 if(saved?'contentRevisionId')is distinct from(saved?'contentRevision')then return false;end if;
 if saved?'contentRevisionId'and(published->>'revisionId'is distinct from saved->>'contentRevisionId'or published->>'revision'is distinct from saved->>'contentRevision')then return false;end if;return true;
end$$;
create function internal.insight_published_options(target_school uuid,target_course uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select coalesce(jsonb_agg(source order by sequence,id),'[]'::jsonb)from(select activity.id,activity.sequence,jsonb_build_object('activityId',activity.id,'title',published.content->>'title','instructions',published.content->>'content','kind',published.content->>'kind','contentRevisionId',published.content->>'revisionId','contentRevision',(published.content->>'revision')::integer)source
 from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id cross join lateral(select internal.learning_published_content(target_school,'activity',activity.id)content)published
 where activity.school_id=target_school and unit.course_id=target_course and target_school="authorization".school_id()and"authorization".can_read_course(target_school,target_course)and published.content is not null and published.content->>'kind'in('practice','reflection','reading')and length(published.content->>'content')<=4000 order by activity.sequence,activity.id limit 10)bounded
$$;
do $$declare signature text;definition text;anchor text;begin
 foreach signature in array array['internal.teacher_insight_context(uuid)','internal.teacher_native_insight_context(uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);anchor:='answer:=jsonb_build_object(';if position(anchor in definition)=0 then raise exception 'Published context output shape changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,anchor,'options:=internal.insight_published_options(school,course.id);'||anchor);execute definition;
 end loop;
end$$;
-- Exact revision checks replace only the old activity-row copy test; current
-- course/programme/learner source scope continues to be checked independently.
do $$declare definition text;signature text;anchor text;begin
 foreach signature in array array['internal.require_stored_insight_scope(uuid)','internal.require_native_insight_scope(uuid)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='for source in select*from jsonb_array_elements(stored->''learningOptions'')loop';if position(anchor in definition)=0 then raise exception 'Published saved option loop changed: %',signature using errcode='22023';end if;
  definition:=replace(definition,anchor,anchor||chr(10)||'if not internal.insight_published_option(run.school_id,(source->>''activityId'')::uuid,source)then raise exception ''Published insight option changed''using errcode=''42501'';end if;'||chr(10));
  definition:=replace(definition,'and activity.title=source->>''title''and activity.instructions=source->>''instructions''','');
  execute definition;
 end loop;
end$$;
-- Newly approved alternatives retain their exact published content identity.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.decide_recommendation(uuid,text,text,text,text,text,uuid[])'::regprocedure);
 anchor:='and source.title=activity->>''title''and source.instructions=activity->>''instructions''';if position(anchor in definition)=0 then raise exception 'Approval option source copy changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'and internal.insight_published_option(school,source.id,activity)');
 anchor:='decision_id,title,instructions,sequence)values(school,task.id,activity_id,decision.id,activity->>''title'',activity->>''instructions'',ordinal)';if position(anchor in definition)=0 then raise exception 'Approval option persistence changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'decision_id,title,instructions,sequence,content_revision_id,content_revision)values(school,task.id,activity_id,decision.id,activity->>''title'',activity->>''instructions'',ordinal,(activity->>''contentRevisionId'')::uuid,(activity->>''contentRevision'')::integer)');execute definition;
 definition:=pg_get_functiondef('internal.intervention_option_current(uuid,uuid)'::regprocedure);
 anchor:='and source.title=option.title and source.instructions=option.instructions';if position(anchor in definition)=0 then raise exception 'Chosen option source copy changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'and internal.insight_published_option(option.school_id,source.id,jsonb_build_object(''kind'',source.kind,''title'',option.title,''instructions'',option.instructions)||case when option.content_revision_id is null then''{}''::jsonb else jsonb_build_object(''contentRevisionId'',option.content_revision_id,''contentRevision'',option.content_revision)end)');execute definition;
end$$;
revoke execute on function internal.insight_published_option(uuid,uuid,jsonb),internal.insight_published_options(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
