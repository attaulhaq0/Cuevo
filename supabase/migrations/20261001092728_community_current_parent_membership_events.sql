begin;
create table app.community_member_changes(
 school_id uuid not null,id uuid not null default gen_random_uuid(),room_id uuid not null,target_actor_id uuid not null,status text not null check(status in('active','revoked')),configured_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,room_id)references app.community_rooms(school_id,id),foreign key(school_id,target_actor_id)references app.memberships(school_id,actor_id),foreign key(school_id,configured_by)references app.memberships(school_id,actor_id));
alter table app.community_member_changes enable row level security;
alter table app.community_member_changes force row level security;
revoke all on app.community_member_changes from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger immutable_history before update or delete on app.community_member_changes for each row execute function internal.academic_history_immutable();
create trigger immutable_truncate before truncate on app.community_member_changes for each statement execute function internal.academic_history_immutable();
do $$declare definition text;begin
 definition:=pg_get_functiondef('"authorization".community_announcement(uuid,uuid,boolean,uuid)'::regprocedure);
 definition:=replace(definition,'then parent_allowed and exists',
  'then parent_allowed and(target_class is null or exists(select 1 from app.classes c where c.school_id=target_school and c.id=target_class and c.status=''active''))and exists');
 execute definition;
 definition:=pg_get_functiondef('internal.community_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'rid:=(payload->>''actorId'')::uuid;',
  'insert into app.community_member_changes(school_id,room_id,target_actor_id,status,configured_by)values(school,v_room_id,(payload->>''actorId'')::uuid,payload->>''status'',actor)returning id into rid;');
 execute definition;
 definition:=pg_get_functiondef('internal.process_community_event(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'if v_room_id is null then select m.room_id into v_room_id from app.community_members m where m.school_id=e.school_id and m.actor_id=e.entity_id and m.configured_by=e.actor_id and m.room_id=(e.metadata->>''roomId'')::uuid;end if;',
  'if v_room_id is null then select m.room_id into v_room_id from app.community_member_changes m where m.school_id=e.school_id and m.id=e.entity_id and m.configured_by=e.actor_id;end if;'
  ||'if v_room_id is null then select m.room_id into v_room_id from app.community_members m where m.school_id=e.school_id and m.actor_id=e.entity_id and m.room_id=(e.metadata->>''roomId'')::uuid and exists(select 1 from internal.audit_events a where a.school_id=e.school_id and a.actor_id=e.actor_id and a.entity_id=e.entity_id and a.action=''community.member.configure''and a.outcome=''succeeded'');end if;');
 execute definition;
end$$;
commit;
