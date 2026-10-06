# Supabase RLS, Grants and Data API Architecture

## Default decision for Edeviser

The core sensitive application path is:

```text
Browser → NestJS API → Postgres
```

Therefore the Data API does not need to be the primary application data path.

### Recommended project settings

- Data API: OFF if no approved direct Data API path is required.
- Automatically expose new tables: OFF.
- Automatic RLS: ON as defense-in-depth if offered during project setup.
- Explicit grants: REQUIRED for every exposed object.
- Explicit RLS policies: REQUIRED.
- RLS tests: REQUIRED.
- Public storage buckets for student data: NEVER.
- Public Realtime channels for school data: NEVER.

Supabase's current security documentation describes two distinct Data API controls: Postgres grants decide whether a role can reach an object; RLS decides which rows can be accessed. Both should be considered when objects are exposed through the Data API.

Sources:
https://supabase.com/docs/guides/api/securing-your-api
https://supabase.com/docs/guides/database/row-level-security
https://supabase.com/docs/guides/database/tables

## Why automatic exposure is off

New tables should not silently become API-accessible.

Supabase changed project behavior in 2026 so new public-schema tables can be opt-in to the Data API rather than automatically exposed.

Source:
https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## RLS model

Every protected row should ultimately be attributable to:

- school/tenant
- actor/user
- role
- relationship
- entitlement where relevant
- object-specific scope

Do not write policies such as:

```sql
using (true)
```

for sensitive tables.

## Defense in depth

RLS does not replace NestJS authorization.

NestJS checks:

```text
identity
→ tenant
→ entitlement
→ role
→ relationship
→ object authorization
```

Postgres constraints and RLS provide additional protection where the connection architecture permits it.

## Storage

Private buckets:

- school-private
- learner-private
- sensitive-staff-quality

Object paths include school scope.

Use authorized streaming or short-lived signed URLs depending on revocation requirements.

## Realtime

Use private channels and RLS authorization on `realtime.messages`.

## Production principle

Schema changes only through migrations committed to Git.
