begin;
create function internal.read_community_announcement(target uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();source app.community_announcements;answer jsonb;
begin
 if not"authorization".can_access_school(school)or"authorization".community_member(school,actor)is null then raise exception 'Announcement denied'using errcode='42501';end if;
 select a.*into source from app.community_announcements a where a.school_id=school and a.id=target;
 if not found or not"authorization".community_announcement(school,source.class_id,source.parent_visible,actor)then raise exception 'Current announcement source denied'using errcode='42501';end if;
 select jsonb_build_object('id',source.id,'classId',source.class_id,'title',source.title,'body',source.body,'parentVisible',source.parent_visible,'createdAt',source.created_at,'readAt',(select n.read_at from app.community_notification_reads n where n.school_id=school and n.announcement_id=source.id and n.actor_id=actor))into answer;
 return answer;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.community_list(text,uuid,jsonb)'::regprocedure);
 anchor:='''''announcementId'''',a.id,''''kind'''',''''ANNOUNCEMENT''''';
 if position(anchor in definition)=0 then raise exception 'Notification source projection changed'using errcode='22023';end if;
 execute replace(definition,anchor,anchor||',''''title'''',a.title');
end$$;
revoke execute on function internal.read_community_announcement(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_community_announcement(uuid)to cuevo_api;
commit;
