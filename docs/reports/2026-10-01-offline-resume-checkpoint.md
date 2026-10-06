# Offline resume checkpoint — Cuevo

The founder asked to finish the current repair, save progress and pause before shutting down the laptop. The current marking-query repair is finished and verified. **Technical MVP Complete is still unverified**: run the final clean, frozen exit sequence when work resumes.

## Saved state

- Workspace: `G:\Cuevo`; branch: `feat/technical-mvp-completion`.
- All source, documentation moves and feature changes are saved locally. Extensive inherited uncommitted work is preserved. Nothing in this completion increment has been committed or pushed; do not reset, stash or discard it.
- Read root README/AGENTS/START-HERE, [implementation status](../implementation-status.md), [technical plan](../superpowers/plans/2026-10-01-technical-mvp-completion.md) and this checkpoint before continuing. The full product pack was reviewed; load the affected domain context rather than repeating the entire audit.
- Local Supabase is the Cuevo project on 56321/56322 and network `cuevo-local`. Preserve unrelated Kiro services on 5432x. Keep ignored `.env.local`, `.local` credentials and verification snapshots private.

## Current repair evidence

Teacher marking previously timed out at 5005ms (PostgreSQL 57014). Nested RLS joins and repeated source authorization caused the failure. Additive migrations `20261001104439_bounded_current_marking_page.sql` and `20261001104844_marking_candidate_current_scope.sql` now resolve current managed/readable course authority, exact enrollment, student membership and programme scope before bounded native detail. Original grade/release authorization and five-second timeout remain unchanged. The API has one marking read implementation; browser/worker have no added raw access.

- Actual marking page: 34 current records in 121ms after correction.
- Full SQL: **450 assertions / 23 files passed**.
- Production numeric academic browser: **passed, 5.0s**.
- Production rubric release/parent/correction/progress browser: **passed, 12.6s**.
- Community draft retention/private update regression: **passed, 10.9s**.
- Independent learner revision/source/Arabic journey: **passed, 3.3s**.
- Configured Next/API/worker build, final typecheck/lint, six verification-rule tests and seven marking/rubric service cases passed.

The production test harness now starts the API and worker and verifies readiness before exposing the web URL. This fixes a startup race that caused a transport failure before the numeric test reached the product. Failed transport output in ignored test artifacts is private; do not print raw headers/tokens. Current numeric test sanitizes its transport error.

## Broader completed work and evidence

Persisted labeled fixture intelligence, human approvals/interventions/outcomes, native rubric and numeric truth, genuine draft/return/resubmission/quiz lifecycle, standalone school operations, protected community/Realtime, private checksummed files, exact parent portfolio revisions, observed recognition/opt-in controls, role homes, source-locked synthetic A–G programmes, factual attention and fresh native report export are implemented. The architecture remains Next.js → NestJS/Fastify → private PostgreSQL/Supabase → outbox → restricted worker.

The latest aggregate clean run before these final repairs passed **287 unit**, **82 web**, **433 SQL** and **25 integration** cases, configured build/secret scan, and all six recovery checks. Production browser passed 12/16, exposing the four causes repaired above. Evidence: ignored `.local/verification/2026-10-01T10-29-24-112Z`; recovery `.local/verification/cuevo_recovery_1790850739830/recovery.json`. These historical results do not establish a passing final aggregate for the latest source.

Docker images and Storybook build passed. Local Supabase security/error and performance/warning advisors reported no issues; production dependency audit reported zero known vulnerabilities. OpenAPI currently registers 102 paths. Repository, architecture and documentation checks pass and enforce root Markdown placement, one authored implementation, ownership, progressive agent context and dependency boundaries.

## Resume in this order

1. Preserve the working tree. Start local Cuevo with `npm run db:start` if needed. Do not inspect or print secret files.
2. Confirm no Cuevo web/API/worker process is active. Ensure source/tests/docs are frozen before `npm run verify:technical`. It performs the authorized guarded local synthetic reset, builds with public configuration, SQL, integration, recovery and all 16 production browser tests; it now requires initial/final authored hashes to match.
3. Fix any actual remaining failure without increasing timeouts or weakening authorization. Mutation verification is sequential; workers must be stopped during rollback SQL fixtures. Latest migrations are applied and must remain append-only.
4. Verify final source-83 exits 1–15, inspect actual screenshots/RTL/mobile/keyboard/axe/reduced-motion, and update the technical exit matrix/status with exact evidence.
5. Independently review the coherent patch and save reviewed commits, preserving inherited moves. Do not claim Technical MVP Complete until the final aggregate and exit mapping pass.

Official England/Cambridge 0580/Qatar source/rights/academic acceptance remains REQUIRES_REVIEW. Fixture intelligence is authorized for local technical acceptance and forbidden in production. Live AI/PostHog, production infrastructure, residency/legal/customer acceptance are separately unverified; do not infer them from synthetic tests.

No automatic work is scheduled while the laptop is offline. Resume this same chat when the founder returns.
