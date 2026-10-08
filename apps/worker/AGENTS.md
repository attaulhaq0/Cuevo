# Worker contributor instructions

- Preserve the private fixed outbox event-owner classifier in every generic claim/exhaustion/complete/fail/process/due/health path. School account Auth effects belong to their exact API executor, never generic worker retries. Metadata cannot select ownership. Keep worker metrics explicitly scoped and independent PostHog due-work; fixture drain must refuse or expose unresolved other-owner work. No Auth admin key enters Node/Edge worker.

Inherit root AGENTS.md. Read this app README and relevant source specs/tests before adding a job.

- Hosted release admission uses the exact positive int8 string `CUEVO_WORKER_RELEASE_GENERATION`. Preserve its value through SQL parameters without Number conversion. Admission pause blocks new wake/begin/domain/analytics claims; held event completion/failure and invocation finish retain original lease authority. Legacy entrypoints remain fenced after generation bootstrap. Read the [incremental release decision](../../docs/decisions/2026-10-08-incremental-release-lifecycle.md); runtime health alone does not establish current generation or hosted operating acceptance.

- Keep src/main.ts for local/persistent lifecycle and src/edge.ts for bounded hosted composition; processors live under src/jobs/<job> and pool/provider adapters under src/platform. Both use the same domain processor and private outbox functions.
- Jobs consume shared packages or local platform, never another application's implementation. Platform cannot depend on jobs.
- Authorize purpose and retrieve tenant-matched immutable source records through constrained private functions. Validate lease, dedup and acknowledgment atomically; preserve bounded retry/failure behavior.
- No raw authoritative grade/access writes or unapproved live AI context. Source facts, observations and inference remain separate.
- Edge may import only the exact portable @cuevo/config/synthetic-runtime guard; never the server config entrypoint or an application implementation. Hosted synthetic targets require matching explicit staging modes/project/ref/origin and verified TLS. Synthetic analytics keeps STAGING plus current private school/source/policy/lease authority; environment configuration cannot activate it.
- Add actual source/restart/duplicate/deny cases and update the codebase map. Run architecture checks, worker build, tests and database/integration verification sequentially when fixtures mutate shared state.
