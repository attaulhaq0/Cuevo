-- DRAFT ONLY. Root must create a new CLI-scaffolded append-only migration after the frozen run.
-- Analytics revocation invalidates the operator activation, so reapproval cannot reuse an old cutoff.
begin;
create function internal.revoke_posthog_activation_on_policy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- School policy commands use this same lock before inserting their newest version.
 -- Direct privileged policy inserts also serialize before inspecting current policy.
 perform pg_advisory_xact_lock(hashtextextended(new.school_id::text||':policy',0));
 if new.analytics_enabled is false and new.version=(
  select max(policy.version) from app.school_policy_versions policy where policy.school_id=new.school_id
 ) then
  -- Retain the reviewed environment/key and historical cutoff. Only fresh operator configuration
  -- can reactivate and establish a new cutoff; confirmed in-flight acceptance remains untouched.
  update internal.posthog_school_activation activation
  set enabled=false,configured_at=clock_timestamp()
  where activation.school_id=new.school_id and activation.enabled;
 end if;
 return new;
end $$;
create trigger posthog_policy_revocation after insert on app.school_policy_versions
for each row execute function internal.revoke_posthog_activation_on_policy();
revoke execute on function internal.revoke_posthog_activation_on_policy()
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;

-- Keep the applied owner function bytes and operator-only grants intact while making
-- configuration's policy check/upsert atomic with policy revocation.
alter function internal.configure_posthog_school(uuid,boolean,text,integer)
rename to configure_posthog_before_policy_epoch;
create function internal.configure_posthog_school(target_school uuid,target_enabled boolean,target_environment text,target_key_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(target_school::text||':policy',0));
 return internal.configure_posthog_before_policy_epoch(target_school,target_enabled,target_environment,target_key_version);
end $$;
revoke execute on function internal.configure_posthog_before_policy_epoch(uuid,boolean,text,integer),
 internal.configure_posthog_school(uuid,boolean,text,integer)
from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
