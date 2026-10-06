-- Source-only candidate. Root reviews, creates the additive migration, applies and measures.
-- Preserve current admission before paging; expand exact display sources only after the global bound.
begin;
create or replace function internal.read_community_notifications(page_limit integer,page_cursor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 school uuid := "authorization".school_id();
 actor uuid := "authorization".actor_id();
 actor_role text := "authorization".community_member(school,actor);
 items jsonb;
begin
 if not "authorization".can_access_school(school) or actor_role is null
    or page_limit is null or page_limit not between 1 and 100 then
  raise exception 'Current bounded notifications required' using errcode='42501';
 end if;
 with announcement_candidates as materialized (
  select a.id,a.class_id,
         coalesce(revision.parent_visible,a.parent_visible) as parent_visible,
         coalesce(revision.state,'PUBLISHED') as current_state
  from app.community_announcements a
  left join lateral (
   select r.parent_visible,r.state
   from app.community_announcement_revisions r
   where r.school_id=a.school_id and r.announcement_id=a.id
   order by r.revision desc limit 1
  ) revision on true
  where a.school_id=school and (page_cursor is null or a.id>page_cursor)
 ), announcement_contexts as materialized (
  select distinct a.class_id,a.parent_visible
  from announcement_candidates a where a.current_state='PUBLISHED'
 ), announcement_authority as materialized (
  select context.class_id,context.parent_visible,
         "authorization".community_announcement(school,context.class_id,context.parent_visible,actor) as allowed
  from announcement_contexts context
 ), announcement_ids as materialized (
  select a.id,'ANNOUNCEMENT'::text as kind
  from announcement_candidates a
  join announcement_authority permitted
    on permitted.class_id is not distinct from a.class_id
   and permitted.parent_visible=a.parent_visible
  where a.current_state='PUBLISHED' and permitted.allowed
  order by a.id limit page_limit+1
 ), mention_ids as materialized (
  select m.id,'MENTION'::text as kind
  from app.community_post_mentions m
  where actor_role in ('teacher','student') and m.school_id=school and m.recipient_id=actor
    and (page_cursor is null or m.id>page_cursor)
    and internal.community_mention_allowed(m.id)
  order by m.id limit page_limit+1
 ), bounded as materialized (
  select candidate.id,candidate.kind
  from (select * from announcement_ids union all select * from mention_ids) candidate
  order by candidate.id limit page_limit+1
 ), announcement_sources as materialized (
  select selected.id,internal.read_community_announcement(selected.id) as source
  from bounded selected where selected.kind='ANNOUNCEMENT'
 ), expanded as (
  select current.id,
         jsonb_build_object('id',current.id,'announcementId',current.id,
          'title',current.source->>'title','revision',(current.source->>'revision')::integer,
          'kind','ANNOUNCEMENT','createdAt',current.source->'createdAt','readAt',current.source->'readAt') as item
  from announcement_sources current
  union all
  select selected.id,
         jsonb_build_object('id',m.id,'postId',p.id,'roomId',p.room_id,
          'title',internal.community_group_current(school,p.room_id)->>'name',
          'kind','MENTION','createdAt',m.created_at,'readAt',receipt.read_at) as item
  from bounded selected
  join app.community_post_mentions m on m.school_id=school and m.id=selected.id
  join app.community_posts p on p.school_id=m.school_id and p.id=m.post_id
  left join app.community_mention_reads receipt
    on receipt.school_id=m.school_id and receipt.mention_id=m.id and receipt.actor_id=actor
  where selected.kind='MENTION'
 )
 select coalesce(jsonb_agg(item order by id),'[]'::jsonb) into items from expanded;
 if octet_length(items::text)>500000 then
  raise exception 'Notification page requires smaller view' using errcode='22023';
 end if;
 return jsonb_build_object(
  'items',case when jsonb_array_length(items)>page_limit then items-page_limit else items end,
  'nextCursor',case when jsonb_array_length(items)>page_limit then items->(page_limit-1)->>'id' else null end);
end $$;
revoke execute on function internal.read_community_notifications(integer,uuid)
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
