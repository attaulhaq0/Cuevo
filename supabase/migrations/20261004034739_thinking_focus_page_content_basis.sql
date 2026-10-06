begin;
-- Course-page metadata follows the same canonical visible content revision as
-- its page. Direct reviewer reads continue to resolve the current review draft.
create function internal.thinking_focus_activity_page(target_activity uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();content jsonb;source jsonb;approved jsonb;revision_id uuid;manager boolean;
begin
 content:=internal.learning_content_view('activity',target_activity);
 if content is null then raise exception 'Current page activity source denied'using errcode='42501';end if;
 source:=internal.thinking_focus_source('activity',target_activity,null,(content->>'id')::uuid);manager:="authorization".can_manage_course(school,(content->>'courseId')::uuid);
 if not manager then
  approved:=internal.thinking_focus_recorded_item('activity',target_activity,null,(content->>'id')::uuid);
  if approved is not null then return approved;end if;
  if "authorization".current_role(school)not in('admin','coordinator')then return jsonb_build_object('target',jsonb_build_object('kind','ACTIVITY','id',target_activity,'criterionKey',null),'courseId',content->'courseId','classification',null);end if;
 end if;
 select c.revision_id into revision_id from app.thinking_focus_current c where c.school_id=school and c.kind='activity'and c.source_id=target_activity and c.criterion_key='';
 if revision_id is null then return jsonb_build_object('target',jsonb_build_object('kind','ACTIVITY','id',target_activity,'criterionKey',null),'courseId',content->'courseId','classification',null);end if;
 return internal.thinking_focus_projection(revision_id,source,false);
end $$;
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('internal.read_thinking_focus_set(jsonb)'::regprocedure);
 anchor:='item:=internal.read_thinking_focus(target->>''kind'',(target->>''id'')::uuid,target->>''criterionKey'');';
 replacement:='if target->>''kind''=''activity''then item:=internal.thinking_focus_activity_page((target->>''id'')::uuid);else item:=internal.read_thinking_focus(target->>''kind'',(target->>''id'')::uuid,target->>''criterionKey'');end if;'||chr(10)||'  if not(item?''status'')then items:=items||jsonb_build_array(item);continue;end if;';
 if position(anchor in definition)=0 then raise exception 'Page exact source dispatch changed'using errcode='22023';end if;execute replace(definition,anchor,replacement);
end $$;
revoke execute on function internal.thinking_focus_activity_page(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
