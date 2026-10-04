-- Optional thinking metadata must not introduce a source-authorization read for
-- unchanged unclassified records. Protected commands still authorize the source;
-- approved mappings retain the existing exact current-source validation.
begin;
create or replace function internal.thinking_focus_recorded_item(target_kind text,target_id uuid,target_key text,target_content_revision uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid:="authorization".school_id();source_value jsonb;r app.thinking_focus_revisions;
begin
 if not exists(select 1 from app.thinking_focus_revisions v where v.school_id=school and v.kind=target_kind
 and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and v.state='APPROVED')then return null;end if;
 source_value:=internal.thinking_focus_source(target_kind,target_id,target_key,target_content_revision);
 select v.*into r from app.thinking_focus_revisions v where v.school_id=school and v.kind=target_kind
 and v.source_id=target_id and v.criterion_key=coalesce(target_key,'')and v.source_version=source_value->>'sourceVersion'
 and v.state<>'AWAITING_REVIEW'order by v.revision desc limit 1;
 if r.state is distinct from'APPROVED'then return null;end if;
 return internal.thinking_focus_projection(r.id);
end$$;
revoke execute on function internal.thinking_focus_recorded_item(text,uuid,text,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
