begin;
-- Supabase owns default table grants; enforce receive-only at RLS even if INSERT remains granted.
create policy cuevo_clients_cannot_send on realtime.messages as restrictive for insert to authenticated with check(false);
create policy cuevo_anonymous_cannot_send on realtime.messages as restrictive for insert to anon with check(false);
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.community_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'if reservation->>''state''=''COMPLETED''then return reservation->''response'';',
  'if reservation->>''state''=''COMPLETED''then if command_name=''post.create''and internal.community_post_hidden(school,(reservation->''response''->>''id'')::uuid)then raise exception ''Hidden post replay denied''using errcode=''42501'';end if;return reservation->''response'';');
 execute definition;
end$$;
commit;
