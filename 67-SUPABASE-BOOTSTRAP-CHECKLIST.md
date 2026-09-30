# Supabase Bootstrap Checklist for Cuevo

## Create

- Supabase project: `cuevo`
- region: choose only after data-residency review
- production: separate project

## Dashboard settings

### Data API
Keep enabled only if an application path uses it.

For Edeviser API-first architecture, do not depend on it for raw browser access to business tables.

### Automatically expose new tables
**OFF**

Reason:
new tables should require deliberate exposure/grants.

### Automatic RLS
**ON** for defense-in-depth, but do not rely on it alone.

Every protected table still needs:
- explicit RLS policies
- explicit grants
- tests

## Auth

Configure:
- email/password
- password reset
- verified email if school policy requires
- session lifetime
- redirect allowlist
- MFA later for staff/admin

## Storage

Create private buckets:
- learner-private
- school-private
- staff-private
- quality-private

Keep public bucket limited to truly public assets.

## Realtime

Enable only required features.

Use private channels for:
- class discussions
- group chat
- notifications
- presence where appropriate

## Database

Use migrations.

Never rely on manual Dashboard schema edits in production.

## Extensions

Enable only when needed:
- pgvector
- pg_cron

## API boundary

Primary business access:
Browser → NestJS API → database.

## Production checklist

- region approved
- legal/data processing reviewed
- backups/PITR reviewed
- restore drill completed
- RLS tests passed
- no auto-exposure
- service secrets stored securely
- audit enabled
