# Provider-owned worker transport prerequisite

The hosted synthetic Cuevo release uses the [accepted signed event worker](../architecture/scalable-event-processing.md) and keeps network queues/signing secrets outside application roles. Current Cuevo project mqxdjvsyckzocokuikmx is empty of application schemas/runtime roles; the existing Vault provider-owned grants need correction before worker activation. This is an operator/provider task, not permission to weaken RLS or escalate an application login.

## Inspected evidence

The management SQL actor is postgres, not a superuser and not a member of supabase_admin. Vault schema/secrets/decrypted_secrets belong to supabase_admin. service_role has provider-granted Vault USAGE and secret-view/table SELECT/DELETE. postgres has its own grant options, which do not authorize revoking the independent supabase_admin → service_role grant. A transaction-rolled-back REVOKE probe left effective service_role usage true; persistent ACL readback is unchanged. pg_net is not yet installed. No secret values were read and no signing key was stored.

## Ready-to-send support request

For Supabase project mqxdjvsyckzocokuikmx (Cuevo), please harden provider-owned Vault/pg_net ACLs for our private signed transactional-outbox worker.

Current effective service_role access originates from supabase_admin. Our project postgres operator can read/manage its own grants but a rollback-only REVOKE cannot remove those owner-granted privileges. Please perform the correction through the supported owner mechanism rather than grant us privileged role membership.

As owner/grantor, remove effective Vault schema USAGE and table/column access to vault.decrypted_secrets and vault.secrets from PUBLIC, anon, authenticated, service_role, cuevo_api and cuevo_worker. Preserve narrowly required postgres operator/security-definer access and Supabase-managed services. cuevo_api/cuevo_worker may not exist until application migrations are applied; ensure they inherit no broad provider privileges afterward.

After pg_net installation, also remove effective net schema USAGE and table/column access to net.http_request_queue and net._http_response from those roles; preserve the postgres dispatcher and provider background worker. Confirm the supported configuration survives managed upgrades. We do not request superuser, supabase_admin membership or raw secret/network privileges for application roles.

## Acceptance after owner changes

Inspect owner/grantor/grantee ACL metadata and effective has_schema_privilege/has_table_privilege/has_any_column_privilege denial for all named roles, including inherited/PUBLIC/column grants. Once the application migration and runtime roles exist, internal.worker_transport_private() must return true. Then independently test signed missing/invalid/stale request denial, duplicate admission, real restricted TLS processing and missed-wake/lease/backoff recovery. Do not infer hosted acceptance from a local pass or grant boolean alone.

Keep dispatch disabled and do not store its reusable Vault signing key, activate recovery Cron, or attest transport readiness until effective denial passes. Source review, exact-source CI, separate Vercel web/API packaging, synthetic-runtime guards and read-only [hosted planning](../../scripts/database/README.md) can proceed. No support message was sent by this preparation.

References: [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html), [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles), [Vault](https://supabase.com/docs/guides/database/vault) and [current setup evidence](../reports/2026-10-03-github-link-and-deployment-readiness.md).
