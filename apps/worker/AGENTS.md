# Worker contributor instructions

Inherit root AGENTS.md. Read this app README and relevant source specs/tests before adding a job.

- Keep src/main.ts for lifecycle/health; processors live under src/jobs/<job> and pool/provider adapters under src/platform.
- Jobs consume shared packages or local platform, never another application's implementation. Platform cannot depend on jobs.
- Authorize purpose and retrieve tenant-matched immutable source records through constrained private functions. Validate lease, dedup and acknowledgment atomically; preserve bounded retry/failure behavior.
- No raw authoritative grade/access writes or unapproved live AI context. Source facts, observations and inference remain separate.
- Add actual source/restart/duplicate/deny cases and update the codebase map. Run architecture checks, worker build, tests and database/integration verification sequentially when fixtures mutate shared state.
