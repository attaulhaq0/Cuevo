begin;
-- Availability is a purpose-limited administrator read, never runtime approval.
create function internal.read_school_account_availability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare school uuid := "authorization".school_id(); begin
 perform internal.require_school_admin();
 begin
  perform internal.require_school_account_runtime(school);
 exception when insufficient_privilege then
  return jsonb_build_object('state','SETUP_REQUIRED','reason','OPERATOR_APPROVAL_REQUIRED');
 end;
 return jsonb_build_object('state','AVAILABLE','reason',null);
end$$;
revoke execute on function internal.read_school_account_availability() from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_school_account_availability() to cuevo_api;
commit;
