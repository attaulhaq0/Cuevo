# System Architecture

## Chosen architecture

**Modular monolith + background worker**

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- accessible Radix/React Aria primitives
- Motion
- Lucide
- React Hook Form + Zod
- TanStack Query
- Zustand only for UI/client state that truly needs it
- Storybook
- Playwright

### API
- NestJS
- Fastify adapter
- OpenAPI-generated contracts
- domain modules
- request correlation ID
- structured logging
- authorization middleware/guards

### Data
- PostgreSQL via Supabase Pro
- Supabase Auth
- Supabase Storage
- Supabase Realtime
- pgvector only for approved retrieval/search needs
- pg_cron only for database-native scheduled jobs; prefer worker for complex workflows

### Async
- transactional outbox
- worker
- retry with bounded attempts
- idempotency keys
- dead-letter/error state

### Product flow

```text
Browser
  ↓
Next.js
  ↓
NestJS API
  ↓
Authorization
  ↓
Domain command/query
  ↓
Postgres
  ↓
Outbox event
  ↓
Worker
  ├─ learner-state refresh
  ├─ deterministic signal calculation
  ├─ workflow automation
  └─ AI job
```

## AI flow

```text
Event / user request
  ↓
purpose + authorization check
  ↓
minimum context retrieval
  ↓
policy filter
  ↓
orchestrator
  ↓
model call
  ↓
structured proposal
  ↓
citation/provenance validation
  ↓
human decision when required
  ↓
domain command
```

## Domain modules

- identity
- tenancy
- school
- people
- relationships
- academic structure
- curriculum
- learning
- assessment
- gradebook
- evidence
- portfolio
- learner-state
- development
- community
- messaging
- attendance
- timetable
- reporting
- intervention
- automation
- intelligence
- quality
- accreditation
- integrations
- audit

## Why not microservices

The first team is small and agent-driven.

Microservices would create:
- deployment complexity
- distributed transactions
- duplicated contracts
- more failure modes
- harder local development

Use internal module boundaries now. Split a module later only when scale/team ownership/operational evidence justifies it.

## Scalability

Use:
- connection pooling
- indexed tenant keys
- composite indexes on school_id + common filters
- pagination everywhere
- cursor pagination for feeds/messages
- asynchronous AI/report jobs
- read models/materialized views only when measurement shows need
- object storage for files
- CDN for non-sensitive static assets
- database partitioning only when actual data volume requires it
- background aggregation for school-level analytics
- rate limits by tenant/user/IP/action

## Reliability

Important academic commands are transactional.

Example:

```text
release_result()
  ├─ authenticate actor
  ├─ verify tenant
  ├─ verify enrolment
  ├─ verify assessment status
  ├─ verify policy version
  ├─ verify evidence references
  ├─ check idempotency key
  ├─ write immutable result revision
  ├─ update projection
  ├─ write audit event
  └─ write outbox event
```

Either the required database changes commit together or they do not.

Storage object bytes are not part of the database transaction; use staged objects with verification and cleanup.

## Deployment

Dev:
- local Docker services
- Supabase development project
- synthetic data only

Staging:
- isolated environment
- staging Supabase project/branch
- test data only

Production:
- separate Supabase project
- approved region/data-residency/legal review
- production secrets
- backups/PITR review
- restore drill
- deployment attestation

## Repository structure

```text
apps/
  web/
  api/
  worker/

packages/
  domain/
  contracts/
  ui/
  config/
  testing/

docs/

supabase/
  migrations/
  seed/
  tests/

docker/

.github/
```
