-- CLI-created append-only purpose-limited API staging admission.
-- No policy, school, provider, Data API, worker or hosted target is activated here.
begin;
create function internal.synthetic_school_runtime_allowed(target_school uuid)returns boolean
language plpgsql stable security definer set search_path=''as $$begin
 if target_school is null or not exists(
  select 1 from "authorization".current_memberships() member
  where member.school_id=target_school and member.actor_id="authorization".actor_id()
  and 'school.context'=any(member.entitlement_codes)
 )then return false;end if;
 perform internal.require_synthetic_intelligence_school(target_school);
 return true;
exception when insufficient_privilege then return false;
end$$;
revoke execute on function internal.synthetic_school_runtime_allowed(uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.synthetic_school_runtime_allowed(uuid)to cuevo_api;
commit;
