# Provider-owned worker transport prerequisite

The [5 October founder-approved provider trust decision](../decisions/2026-10-05-supabase-edge-provider-trust.md) supersedes the proposed removal of trusted managed `service_role` grants below. The retained metadata and unsent request are historical evidence of the prior strict policy. Current activation requires the expanded untrusted/PUBLIC/custom-role predicate, hosted Data API disabled proof, private Cuevo RPC denial and functional Auth/Storage/Realtime plus signed source/lease recovery. Provider service trust is an explicit residual-risk decision; it does not grant Cuevo transport authority or establish hosted readiness. No request has been sent or key/Cron activated by this amendment.

The hosted synthetic Cuevo release uses the [accepted signed event worker](../architecture/scalable-event-processing.md) and keeps network queues/signing secrets outside application roles. The earlier inspection found project mqxdjvsyckzocokuikmx empty of application schemas/runtime roles. That is historical evidence, not a current inventory or a reason to repeat the old request. Current source includes the protected provisioning/activation workflow; actual hosted execution and fresh permission/configuration evidence remain separate. No application login may weaken RLS or acquire provider/operator authority.

## Historical inspected evidence

The management SQL actor is postgres, not a superuser and not a member of supabase_admin. Vault schema/secrets/decrypted_secrets belong to supabase_admin. service_role has provider-granted Vault USAGE and secret-view/table SELECT/DELETE. postgres has its own grant options, which do not authorize revoking the independent supabase_admin → service_role grant. A transaction-rolled-back REVOKE probe left effective service_role usage true; persistent ACL readback is unchanged. pg_net is not yet installed. No secret values were read and no signing key was stored.

## Superseded unsent support request — do not forward

The following text is retained exactly as historical evidence. It asks to remove trusted managed `service_role` grants and conflicts with the later founder-approved provider trust boundary. No support request was sent. Any future provider communication needs a current observed blocker, an exact reviewed request and separate authorization to send it.

> For Supabase project mqxdjvsyckzocokuikmx (Cuevo), please harden provider-owned Vault/pg_net ACLs for our private signed transactional-outbox worker.

> Current effective service_role access originates from supabase_admin. Our project postgres operator can read/manage its own grants but a rollback-only REVOKE cannot remove those owner-granted privileges. Please perform the correction through the supported owner mechanism rather than grant us privileged role membership.

> As owner/grantor, remove effective Vault schema USAGE and table/column access to vault.decrypted_secrets and vault.secrets from PUBLIC, anon, authenticated, service_role, cuevo_api and cuevo_worker. Preserve narrowly required postgres operator/security-definer access and Supabase-managed services. cuevo_api/cuevo_worker may not exist until application migrations are applied; ensure they inherit no broad provider privileges afterward.

> After pg_net installation, also remove effective net schema USAGE and table/column access to net.http_request_queue and net._http_response from those roles; preserve the postgres dispatcher and provider background worker. Confirm the supported configuration survives managed upgrades. We do not request superuser, supabase_admin membership or raw secret/network privileges for application roles.

## Current activation evidence

Use the current append-only provider trust predicate from [the accepted decision](../decisions/2026-10-05-supabase-edge-provider-trust.md). Inspect current owner/grantor/grantee metadata and effective inherited/PUBLIC/table/column/sequence/callable-routine access. Trusted managed service grants may remain; PUBLIC, anonymous, authenticated, Cuevo runtime and other untrusted/custom roles must satisfy the current denial rules. Preserve only the separately reviewed private Realtime function exception. Do not remove managed grants merely because the historical request listed them.

Before signing-key provisioning or Edge/Cron activation, require `internal.worker_transport_private()` to return true under the current schema, exact-project disabled Data API configuration and negative REST/GraphQL/RPC probes, functional normal Auth, private Storage and protected Realtime. Independently test signed missing/invalid/stale request denial, duplicate admission, real restricted TLS processing and missed-wake/lease/backoff recovery. A local pass or catalogue boolean alone is insufficient.

Unknown or changed exposure, grants, function ownership or provider configuration keeps dispatch inactive and requires current revalidation. The current backend workflow owns the admitted activation and recovery steps; do not activate them manually from this document or automatically resend an uncertain original request. Provider/control-plane and server Storage credential trust remain accepted residual risks. See [CI/CD operations](ci-cd.md) and [internal-team handover](internal-team-access.md) for the current receipt sequence and recovery limits.

References: [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html), [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles), [Vault](https://supabase.com/docs/guides/database/vault) and [current setup evidence](../reports/2026-10-03-github-link-and-deployment-readiness.md).
