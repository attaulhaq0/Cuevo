-- Keep the current authorization/accounting wrapper as the only API reservation entrypoint.
-- The SECURITY DEFINER wrapper invokes its owner-controlled numeric implementation internally.
begin;
revoke execute on function internal.begin_intelligence_run(text,text,uuid,jsonb,text)
 from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
