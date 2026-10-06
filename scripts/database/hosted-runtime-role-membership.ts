/** Initial roles retain only the canonical migration-owner SET grants and the
 * managed Supabase creator's non-SET administration grants to postgres.
 * Restricted runtime roles must not themselves join any role. */
export const initialRuntimeRolesSql = `/* CUEVO_RUNTIME_INITIAL_ROLES */
select
  (select count(*) from pg_roles where rolname in ('cuevo_api','cuevo_worker')
    and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole
    and not rolcreatedb and not rolreplication and not rolinherit) = 2
  and (select count(*) from pg_auth_members membership
    join pg_roles runtime on runtime.oid = membership.roleid
    join pg_roles recipient on recipient.oid = membership.member
    join pg_roles grantor on grantor.oid = membership.grantor
    where runtime.rolname in ('cuevo_api','cuevo_worker')
      and recipient.rolname = 'postgres' and grantor.rolname = 'postgres'
      and not membership.admin_option and not membership.inherit_option
      and membership.set_option) = 2
  and not exists (
    select 1 from pg_auth_members membership
    join pg_roles granted on granted.oid = membership.roleid
    join pg_roles recipient on recipient.oid = membership.member
    join pg_roles grantor on grantor.oid = membership.grantor
    where recipient.rolname in ('cuevo_api','cuevo_worker')
      or (granted.rolname in ('cuevo_api','cuevo_worker') and not (
        recipient.rolname = 'postgres' and not membership.inherit_option and (
          (grantor.rolname = 'postgres' and not membership.admin_option and membership.set_option)
          or (grantor.rolname = 'supabase_admin' and membership.admin_option and not membership.set_option)
        )
      ))
  ) as allowed`;
