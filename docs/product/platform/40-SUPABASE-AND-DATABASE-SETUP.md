# Supabase Pro and Database Setup

## Project identity

Internal infrastructure codename:
**cuevo**

Use:
- Supabase dev project: `cuevo`
- production: separate project, e.g. `cuevo-prod`, after regional/legal approval
- GitHub repository: `cuevo`
- PostHog project: `cuevo` / Edeviser
- Product brand remains Edeviser

## Recommended Supabase components

Use:
- PostgreSQL
- Auth
- Storage
- Realtime
- pgvector when needed
- pg_cron only when justified

## Data API recommendation

The current Supabase platform separates:
- Data API grants
- RLS policies

For Edeviser, the safest default is:

### Enable Data API
Only when a known application path requires REST/GraphQL/supabase-js data access.

### Automatically expose new tables
**OFF.**

Do not automatically grant new tables to Data API roles.

Expose only intentionally approved tables/functions.

### Automatic RLS
**ON as defense-in-depth**, but still enable/define RLS explicitly in migrations.

Never assume automatic RLS means a table is secure. Policies and grants still need testing.

Official Supabase security guidance:
https://supabase.com/docs/guides/api/securing-your-api
https://supabase.com/docs/guides/database/postgres/row-level-security

## Suggested app data access

Preferred:
```text
Browser
 ↓
NestJS API
 ↓
authorization
 ↓
database
```

Do not make browser direct-table access the default for sensitive academic commands.

Where Data API/direct client access is used, apply explicit grants + RLS.

## Database schemas

Prefer:
- `public` only for intentionally exposed app objects
- private/internal schemas where appropriate for implementation helpers
- do not expose raw audit/event/internal tables

## RLS policy pattern

Policies should use:
- school context
- user identity
- relationship
- role
- entitlement

Test both positive and negative access.

## RLS tests

For each protected table:
- anonymous select denial
- authenticated cross-school denial
- correct student access
- parent relationship access
- teacher class access
- coordinator scope
- admin scope
- mutation denial where applicable

Run:
`supabase test db`

## Storage

Buckets must be private by default.

Storage object path should include:
`school_id/...`

Policy must verify current access.

## Realtime

Use private channels.

Supabase Realtime authorization uses RLS on `realtime.messages`.

Official:
https://supabase.com/docs/guides/realtime/authorization

Disable public access for protected school channels.

## Backups

Paid Supabase plans include database backups/PITR according to current plan terms.

Storage objects are separate; backup/restore planning must explicitly address Storage.

## Migrations

All schema changes are committed.

No dashboard-only production schema changes.

## Local development

Prefer Supabase CLI + Docker for local database/Auth/Storage/Realtime emulation where supported.

Use synthetic data only.

## Production region

As of the current research date, verify the Supabase hosted-region list before production. The product brief's intended Qatar data-residency position must not be treated as settled until the current region, contractual and legal requirements are reviewed.

## References

Supabase Data API:
https://supabase.com/docs/guides/api/securing-your-api

RLS:
https://supabase.com/docs/guides/database/postgres/row-level-security

Tables:
https://supabase.com/docs/guides/database/tables

Realtime:
https://supabase.com/docs/guides/realtime/authorization
