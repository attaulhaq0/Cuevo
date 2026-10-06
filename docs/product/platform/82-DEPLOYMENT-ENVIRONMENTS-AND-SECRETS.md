# Deployment Environments and Secrets

## Environments

### Local

Docker + local services + Supabase CLI where applicable.

Synthetic data only.

### Development

Supabase project: `cuevo`

GitHub repository: `cuevo`

PostHog project: `cuevo` / Edeviser

Synthetic data only.

### Staging

Separate credentials and Supabase project/isolated environment.

No production pupil data.

### Production

Separate Supabase project, for example `cuevo-prod`.

Production deployment is conditional on regional/data-residency, contractual, privacy and school requirements.

Supabase currently lists specific regions including Singapore, Frankfurt, London, Paris, Mumbai, Tokyo, Sydney and others; its current available-region page does not list Qatar. This must be rechecked before production for any school requiring in-country storage. A region choice is a data-location control, not itself proof of regulatory compliance.

Source:
https://supabase.com/docs/guides/platform/regions

## Secrets

Never commit:

- Supabase secret/service keys
- database passwords
- AI provider keys
- PostHog private keys
- signing secrets
- OAuth client secrets

Browser-safe publishable keys are not equivalent to server secrets, but access policies must still be correct.

## CI/CD

Pipeline should run:

- typecheck
- lint
- unit tests
- API tests
- database migration verification
- RLS tests
- build
- Playwright smoke tests
- security scans

## Database migrations

The migration directory is the source of truth.

Dashboard-only production edits are prohibited.

## Deployment verification

After deployment verify:

- deployed commit
- database migration version
- environment variables
- auth flow
- RLS behavior
- API health
- worker health
- frontend smoke
- critical AI workflow
