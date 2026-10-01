begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('learner-private','learner-private',false,2097152,array['text/plain','image/png','image/jpeg','application/pdf'])on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table app.private_assets(
 school_id uuid not null,id uuid not null default gen_random_uuid(),owner_id uuid not null,created_by uuid not null,name text not null,content_type text not null,byte_size integer not null check(byte_size between 1 and 2097152),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),state text not null default'STAGED'check(state in('STAGED','AVAILABLE','RETIRED')),object_path text not null,created_at timestamptz not null default clock_timestamp(),available_at timestamptz,retired_at timestamptz,
 primary key(school_id,id),unique(object_path),foreign key(school_id,owner_id)references app.memberships(school_id,actor_id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),check(content_type in('text/plain','image/png','image/jpeg','application/pdf')),check(name~'^[A-Za-z0-9_. -]{1,120}$')
);
create function "authorization".can_manage_asset(target_school uuid,target_owner uuid)returns boolean language sql stable security definer set search_path=''as $$select coalesce("authorization".can_access_school(target_school)and"authorization".has_entitlement(target_school,'portfolio')and("authorization".current_role(target_school)in('admin','teacher')or("authorization".current_role(target_school)='student'and target_owner="authorization".actor_id()))and"authorization".can_view_person(target_school,target_owner),false)$$;
create function "authorization".can_read_asset(target_school uuid,target_owner uuid)returns boolean language sql stable security definer set search_path=''as $$select coalesce("authorization".can_manage_asset(target_school,target_owner)or("authorization".can_access_school(target_school)and"authorization".has_entitlement(target_school,'portfolio')and"authorization".current_role(target_school)='coordinator'and"authorization".can_view_person(target_school,target_owner)),false)$$;
create function internal.asset_command(command_name text,target_id uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();asset app.private_assets;rid uuid;receipt jsonb;reservation jsonb;owner uuid;
begin
 if command_name='stage'then owner:=(payload->>'ownerId')::uuid;else select*into asset from app.private_assets where school_id=school and id=target_id for update;owner:=asset.owner_id;end if;
 if owner is null or not"authorization".can_manage_asset(school,owner)then raise exception 'Asset denied'using errcode='42501';end if;
 reservation:=internal.begin_command(command_key,'asset.'||command_name,fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';end if;if reservation->>'state'<>'NEW'then raise exception 'Asset command pending'using errcode='22023';end if;
 if command_name='stage'then
  rid:=gen_random_uuid();insert into app.private_assets(school_id,id,owner_id,created_by,name,content_type,byte_size,sha256,object_path)values(school,rid,owner,actor,payload->>'name',payload->>'contentType',(payload->>'byteSize')::integer,payload->>'sha256',school::text||'/'||owner::text||'/'||rid::text);
 elsif command_name='finalize'then
  if asset.state not in('STAGED','AVAILABLE')or(payload->>'sha256')is distinct from asset.sha256 or(payload->>'byteSize')::integer<>asset.byte_size then raise exception 'Asset integrity mismatch'using errcode='22023';end if;
  update app.private_assets set state='AVAILABLE',available_at=coalesce(available_at,clock_timestamp())where school_id=school and id=asset.id;rid:=asset.id;
 elsif command_name='retire'then
  if(payload->>'confirmRetirement')::boolean is distinct from true or length(btrim(payload->>'reason'))not between 1 and 1000 then raise exception 'Asset retirement review required'using errcode='22023';end if;
  update app.private_assets set state='RETIRED',retired_at=coalesce(retired_at,clock_timestamp())where school_id=school and id=asset.id;rid:=asset.id;
 else raise exception 'Unknown asset command'using errcode='22023';end if;
 select jsonb_build_object('id',id,'ownerId',owner_id,'name',name,'contentType',content_type,'byteSize',byte_size,'sha256',sha256,'state',state,'objectPath',object_path,'createdAt',created_at)into receipt from app.private_assets where school_id=school and id=rid;
 perform internal.append_audit('asset.'||command_name,'asset',rid,request_id,'succeeded','{}');perform internal.enqueue_event('asset.updated','asset',rid,1,'{}','asset:'||command_name||':'||command_key);
 perform internal.finish_command(command_key,'asset.'||command_name,fingerprint,receipt);return receipt;
end$$;
alter table app.private_assets enable row level security;alter table app.private_assets force row level security;
create policy asset_read on app.private_assets for select to cuevo_api using("authorization".can_read_asset(school_id,owner_id));
revoke all on app.private_assets from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;grant select on app.private_assets to cuevo_api;
revoke execute on function "authorization".can_manage_asset(uuid,uuid),"authorization".can_read_asset(uuid,uuid),internal.asset_command(text,uuid,jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function "authorization".can_manage_asset(uuid,uuid),"authorization".can_read_asset(uuid,uuid),internal.asset_command(text,uuid,jsonb,text,text,text)to cuevo_api;
-- No direct browser upload/download policy. Every byte goes through the authenticated API and current source scope.
commit;
