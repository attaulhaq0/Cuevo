# Edeviser Final Technology Stack and Architecture Decision Record

Date: 2026-10-01
Status: DECIDED for MVP and long-term default

## Decision

Use a TypeScript monorepo with:

- Next.js 16 App Router for the web application and experience layer.
- NestJS + Fastify for the application API/domain layer.
- PostgreSQL managed by Supabase Pro as the primary relational database.
- Supabase Auth for identity.
- Supabase Storage for private assets/files.
- Supabase Realtime for protected live collaboration/chat where needed.
- A dedicated background worker for asynchronous jobs.
- Transactional outbox for reliable event publication.
- OpenAPI as the API contract.
- Docker for local development and reproducibility.
- PostHog for product analytics/feature usage, configured to avoid unnecessary child PII.

## Why Next.js + NestJS instead of Next.js alone

Next.js is the web/application framework. NestJS is the long-lived domain API boundary.

Edeviser has complex domain behavior: curriculum packs, assessment commands, atomic academic result release, authorization, interventions, workflow automation, intelligence orchestration and integrations. Keeping those responsibilities in a dedicated NestJS API makes the business layer explicit and independently testable.

Next.js remains responsible for route-level UX, rendering, layouts, loading/error boundaries, progressive navigation and browser-facing experience.

NestJS modules provide clear internal domain boundaries. Fastify is selected as the Nest HTTP adapter because performance matters for a growing multi-tenant API and Nest officially supports the adapter.

## Why Supabase is infrastructure, not the product architecture

Supabase provides managed Postgres, Auth, Storage and Realtime. Edeviser domain rules remain in the application/domain layer and database transactions. Do not allow the Supabase product shape to determine Edeviser domain boundaries.

## MVP architecture

```text
Browser
  ↓
Next.js 16
  ↓
NestJS/Fastify API
  ↓
Authentication + Authorization + Tenant checks
  ↓
Domain command/query
  ↓
PostgreSQL / Supabase
  ↓
Transactional Outbox
  ↓
Worker
  ├─ learner-state refresh
  ├─ deterministic signal processing
  ├─ automation
  ├─ report generation
  └─ AI/orchestrator jobs
```

## Data access policy

For sensitive academic commands, default to Browser → NestJS API → Postgres.

Do not default to direct browser CRUD against arbitrary Supabase tables.

A direct Supabase client may be used only for explicitly documented low-risk read paths or features such as Auth. Any directly exposed object must have explicit grants and RLS policies.

## Agent-assisted development

Use the official Next.js DevTools MCP where compatible with the coding agent. Next.js 16 documentation provides an MCP integration intended specifically for AI-assisted development and runtime inspection.

Reference: https://nextjs.org/docs/app/guides/mcp

## Scalability rule

Start as a modular monolith. Do not introduce microservices until:

- a module has measured operational scaling needs;
- team ownership requires independent deployment;
- data or workload characteristics justify isolation;
- an ADR documents the split and migration plan.

The internal module boundaries are the future extraction boundaries.

## Sources

Next.js App Router: https://nextjs.org/docs/app
Next.js production guidance: https://nextjs.org/docs/app/guides/production-checklist
Next.js MCP: https://nextjs.org/docs/app/guides/mcp
NestJS modules: https://docs.nestjs.com/modules
NestJS Fastify: https://docs.nestjs.com/techniques/performance
Supabase database: https://supabase.com/docs/guides/database/overview
Supabase API security: https://supabase.com/docs/guides/api/securing-your-api
