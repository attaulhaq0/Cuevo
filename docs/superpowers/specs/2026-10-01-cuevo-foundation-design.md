# Cuevo foundation design

E Deviser is the company. Cuevo is the product. The original numbered specification pack is retained as a source record; its references to the former product name do not override the founder's naming instruction.

The existing workspace contains specifications only. The connected GitHub repository is empty; Supabase development project Cuevo is healthy but has no business tables or migration history. PostHog project Cuevo exists. Docker and the Node toolchain are available. No database application credentials, PostHog SDK configuration or AI provider credentials are configured locally.

## Architecture and boundaries

Implement the mandated TypeScript modular monolith: Next.js 16 web, NestJS with Fastify API, private PostgreSQL schemas through Supabase, transactional outbox and worker. One npm workspace contains apps/web, apps/api, apps/worker, packages/domain, packages/contracts, packages/ui and packages/config. Sensitive domain writes do not live in Next.js routes or browser Supabase CRUD. Docker Node 24 LTS images provide the reproducible runtime.

The first independently reviewable increment establishes local infrastructure, identity, tenant context, explicit database authorization, immutable audit events, outbox storage and a bilingual accessible application shell. Later increments complete school operations, learning, academic release, learner state, intelligence, intervention, community and the exit suite in 87-IMPLEMENTATION-ORDER-FINAL.md order.

## Authorization and persistence

Validate Supabase sessions on the server and resolve current active school membership from stored records. A client-provided school or role is never proof of authorization. Resolve entitlement, role, relationship and object scope in domain/API services; database row policies provide additional enforcement under transaction-local actor and school context. Use a dedicated non-owner, non-BYPASSRLS database role, parameterized queries, composite tenant foreign keys, explicit grants and FORCE ROW LEVEL SECURITY where appropriate. Authentication and worker infrastructure have separate, constrained roles. Public Data API roles receive no business schema grants.

All important commands require an idempotency key and a request fingerprint. A replay of the same command returns its existing outcome; reuse with different input is rejected. Academic writes eventually create immutable revisions, evidence links, projection, audit and outbox records in one transaction. Audit/internal outbox tables are private. Worker processing has bounded retries, leases and deduplication.

## Sources and unknowns

The dossiers and URL index are not curriculum source snapshots. Official England selected-subject, Cambridge Mathematics 0580 and Qatar requirements remain REQUIRES_REVIEW until approved locked artifacts exist. Implement generic pack and native assessment behavior using explicitly synthetic School Custom fixtures. Separate lifecycle, fact status and readiness. No automated academic sign-off, official grade threshold, curriculum code or compliance claim is introduced.

Live AI is unavailable without configured credentials and approved provider/data policy. Provider interfaces, authorized retrieval, proposal validation, human approval and deterministic/failure fixtures can be built and tested independently; synthetic provider evaluation never counts as live-model validation. A new secret is not fabricated or provisioned unattended.

## Experience and verification

Use shared semantic tokens, warm neutral surfaces, readable deep text and one restrained action accent. Every role's home derives from real actions and evidence. English and Arabic use translation keys, logical CSS and bidi isolation. Protected offline caching is disabled. Shells cover loading, empty, error, denied and unavailable states and respect reduced motion. Mark the foundation accurately; a rendered screen does not prove an MVP gate.

Verify migrations on a fresh local Supabase instance at distinct 5632x ports, deterministic synthetic seed, positive and denied database access, server authentication, five-role scope, revocation, idempotency and rollback. Run lint, typecheck, unit/API/database tests and build. Add Playwright viewport, RTL, keyboard and accessibility coverage as actual journeys become available. Record per-gate evidence and blockers in docs/implementation-status.md.

## Process decisions

The founder explicitly authorized unattended execution without questions. This supersedes skill approval and visual-selection gates. Preserve their useful design, test and review workflows. The fixed architecture supersedes plugin templates and Supabase skill instructions to edit schema ad hoc: committed migrations are the source of truth. No unrelated existing local stack is stopped or reset. Nothing is published to the public GitHub repository until a reviewed coherent commit is available.
