begin;
-- Reviewed CLOSED ledger history never reopens a previously archived original room.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.community_room_readable(uuid,uuid,uuid)'::regprocedure);anchor:='r.id=target_room and"authorization".community_class';if position(anchor in definition)=0 then raise exception 'Historical room identity guard changed'using errcode='22023';end if;execute replace(definition,anchor,'r.id=target_room and r.status=''ACTIVE'' and"authorization".community_class');
 definition:=pg_get_functiondef('internal.community_room_staff_read(uuid,uuid,uuid)'::regprocedure);anchor:='r.id=target_room and"authorization".community_class';if position(anchor in definition)=0 then raise exception 'Historical staff room identity guard changed'using errcode='22023';end if;execute replace(definition,anchor,'r.id=target_room and r.status=''ACTIVE'' and"authorization".community_class');
 definition:=pg_get_functiondef('internal.community_group_staff(uuid,uuid)'::regprocedure);anchor:='r.type=''GROUP''and';if position(anchor in definition)=0 then raise exception 'Group source identity guard changed'using errcode='22023';end if;execute replace(definition,anchor,'r.type=''GROUP''and r.status=''ACTIVE'' and');
end$$;
commit;
