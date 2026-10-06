begin;
-- Realtime authorization probes omit the private field. Private delivery is enforced by
-- client private:true, private-only tenant configuration and realtime.send(...,true).
-- Validate the authenticated topic/session rather than the placeholder's private default.
alter policy cuevo_private_community_receive on realtime.messages
 using(extension='broadcast'and topic=(select realtime.topic())and "authorization".community_realtime_topic((select realtime.topic())));
commit;
