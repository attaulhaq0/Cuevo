begin;
update storage.buckets set file_size_limit=524288 where id='learner-private';
-- Preserve existing metadata history while refusing new oversized staged objects.
create function internal.asset_metadata_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='INSERT'and new.byte_size>524288 then raise exception 'Bounded private asset required'using errcode='22023';end if;
 if tg_op='UPDATE'and(row(new.school_id,new.owner_id,new.created_by,new.name,new.content_type,new.byte_size,new.sha256,new.object_path,new.created_at)is distinct from row(old.school_id,old.owner_id,old.created_by,old.name,old.content_type,old.byte_size,old.sha256,old.object_path,old.created_at)or old.state='RETIRED'and new.state<>'RETIRED')then raise exception 'Private asset metadata immutable'using errcode='55000';end if;
 return new;
end$$;
create trigger private_asset_metadata_guard before insert or update on app.private_assets for each row execute function internal.asset_metadata_guard();
revoke execute on function internal.asset_metadata_guard()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.asset_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'reservation:=internal.begin_command',
  'if command_name<>''stage''and asset.state=''RETIRED''and command_name<>''retire''then raise exception ''Retired private source unavailable''using errcode=''22023'';end if;reservation:=internal.begin_command');
 definition:=replace(definition,'perform internal.append_audit(''asset.''||command_name,''asset'',rid,request_id,''succeeded'',''{}'');perform internal.enqueue_event(''asset.updated'',''asset'',rid,1,''{}'',''asset:''||command_name||'':''||command_key);',
  'if not exists(select 1 from internal.outbox_events e where e.school_id=school and e.deduplication_key=''asset:''||command_name||'':''||rid::text)then perform internal.append_audit(''asset.''||command_name,''asset'',rid,request_id,''succeeded'',''{}'');perform internal.enqueue_event(''asset.updated'',''asset'',rid,1,''{}'',''asset:''||command_name||'':''||rid::text);end if;');
 execute definition;
end$$;
commit;
