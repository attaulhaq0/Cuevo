begin;
-- Review-purpose material inspection is separate from authoring/delivery authority.
-- It resolves only the same bounded material revisions in the canonical source digest.
create function internal.read_thinking_focus_materials(target_kind text,target_id uuid,target_key text,expected_source text)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();source jsonb;items jsonb;course uuid;expected_count integer;
begin
 source:=internal.thinking_focus_source(target_kind,target_id,target_key);course:=(source->>'courseId')::uuid;
 if not("authorization".current_role(school)in('admin','teacher')and"authorization".can_manage_course(school,course)or"authorization".current_role(school)='coordinator'and"authorization".has_entitlement(school,'curriculum')and"authorization".can_read_course(school,course))then raise exception 'Task material review purpose denied'using errcode='42501';end if;
 if expected_source is null or expected_source is distinct from source->>'sourceVersion'then raise exception 'Task material source changed'using errcode='22023';end if;
 expected_count:=jsonb_array_length(source->'materials');if expected_count>100 then raise exception 'Complete task material manifest needs review'using errcode='22023';end if;
 select coalesce(jsonb_agg(internal.resource_projection((material->>'resourceId')::uuid,(material->>'revisionId')::uuid)order by material->>'resourceId'),'[]'::jsonb)into items from jsonb_array_elements(source->'materials')as basis(material);
 if jsonb_array_length(items)<>expected_count or exists(select 1 from jsonb_array_elements(items)item where item is null or item='null'::jsonb or item->>'courseId'<>course::text or item->>'targetId'<>target_id::text or item->>'targetKind'<>case when target_kind='criterion'then'assessment'else target_kind end or item->>'state'not in('ATTACHED','PUBLISHED')or item->>'assetState'<>'AVAILABLE')then raise exception 'Exact available review material required'using errcode='22023';end if;
 if octet_length(items::text)>500000 then raise exception 'Complete task material manifest exceeds capacity'using errcode='22023';end if;
 return jsonb_build_object('schemaVersion','1','target',jsonb_build_object('kind',upper(target_kind),'id',target_id,'criterionKey',target_key),'courseId',course,'sourceVersion',expected_source,'items',items);
end $$;
create function internal.read_thinking_focus_material_delivery(target_kind text,target_id uuid,target_key text,expected_source text,target_resource uuid,target_revision uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();manifest jsonb;resource jsonb;asset app.private_assets;
begin
 manifest:=internal.read_thinking_focus_materials(target_kind,target_id,target_key,expected_source);
 select item into resource from jsonb_array_elements(manifest->'items')item where item->>'id'=target_resource::text and item->>'revisionId'=target_revision::text;
 if resource is null then raise exception 'Exact task review material revision denied'using errcode='42501';end if;
 select a.*into asset from app.private_assets a where a.school_id=school and a.id=(resource->>'assetId')::uuid and a.purpose='COURSE_RESOURCE'and a.course_id=(manifest->>'courseId')::uuid and a.state='AVAILABLE';
 if asset.id is null then raise exception 'Task review material unavailable'using errcode='42501';end if;
 return jsonb_build_object('manifest',manifest,'resource',resource,'asset',jsonb_build_object('id',asset.id,'ownerId',asset.owner_id,'name',asset.name,'contentType',asset.content_type,'byteSize',asset.byte_size,'sha256',asset.sha256,'state',asset.state,'objectPath',asset.object_path));
end $$;
revoke execute on function internal.read_thinking_focus_materials(text,uuid,text,text),internal.read_thinking_focus_material_delivery(text,uuid,text,text,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_thinking_focus_materials(text,uuid,text,text),internal.read_thinking_focus_material_delivery(text,uuid,text,text,uuid,uuid)to cuevo_api;
commit;
