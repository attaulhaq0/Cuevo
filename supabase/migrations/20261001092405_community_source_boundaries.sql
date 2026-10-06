begin;
-- Preserve the applied source while removing local/column ambiguity in current commands.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.community_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'room_id uuid;reservation','v_room_id uuid;reservation');
 definition:=replace(definition,'room_id:=','v_room_id:=');
 definition:=replace(definition,'id=room_id','id=v_room_id');
 definition:=replace(definition,'p.room_id=room_id','p.room_id=v_room_id');
 definition:=replace(definition,'(school,room_id,','(school,v_room_id,');
 definition:=replace(definition,'values(school,room_id,','values(school,v_room_id,');
 definition:=replace(definition,'''roomId'',room_id','''roomId'',v_room_id');
 execute definition;
end$$;
alter table internal.community_broadcast_receipts enable row level security;
alter table internal.community_broadcast_receipts force row level security;
revoke all on internal.community_broadcast_receipts from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
