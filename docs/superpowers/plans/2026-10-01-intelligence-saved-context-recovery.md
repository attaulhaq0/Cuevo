# Intelligence saved-context recovery implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Root owns the database/runtime verification window.

**Goal:** A valid new analysis remains reviewable after an earlier source correction, and an unused new option cannot invalidate still-authorized saved context during generation.

**Architecture:** Keep the existing single Teacher Insight orchestration, provider outside transaction, immutable context/run and human decision. Add an append-only migration aligning actionable retrieval with the existing private saved-source predicates and reauthorize that saved context at completion. Historical support continues through its separate reviewed history projection.

**Tech Stack:** PostgreSQL/Supabase migrations, NestJS/Fastify, TypeScript and deterministic provider integration fixtures.

**Spec:** Sources [10](../../product/domains/10-INTELLIGENCE-ORCHESTRATOR.md), [12](../../product/domains/12-PERSONALIZED-LEARNING.md), [39](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [78](../../product/verification/78-AGENTIC-AI-EVALUATION-HARNESS.md), [81](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), [83](../../product/overview/83-MVP-EXIT-CRITERIA.md); IG15/IG16 in the [expanded review](../../product/qa/MVP-EXPANDED-LIFECYCLE-REVIEW.md).

## Global constraints

- Existing current baseline, latest submission, course/programme, policy, session, tenant and approval predicates must not be weakened.
- No live provider calls, new autonomous tools, raw answers or PII are needed.
- Keep applied migration history append-only, private helpers/grants and important command audit/outbox/idempotency intact.
- Missing/stale history must not be represented as current evidence; the explicit historical support reader remains separate.
- Exact selected source content/policy and lease must remain valid at completion.

## Task 1: Prove both supported-path failures

**Files:** `apps/api/test/integration/customer-intelligence-recovery-gap-api.test.ts`; existing `customer-test-context.ts` fixture is reused without changes.

**Interfaces:** Real synthetic Auth, current membership and restricted actor SQL, isolated rollback tenant, injected deterministic provider. No transaction remains open across external model I/O; the test holds only an in-memory fixture promise.

- [x] Create A→approve intervention→correct A to A2→create fresh assessment/result B; assert old A command authority denies but fresh B disclosure/replay/approval succeeds.
- [x] Hold fixture generation on a current baseline, add an unused same-course option, assert saved disclosure still contains the original options, release the provider, require singular successful proposal/replay/approval. Then correct the cited source and require denial.
- [x] Run with `CUEVO_REQUIRE_INTEGRATION=1` and the focused Vitest file. Both failed at intended assertions: fresh disclosure403 and completion409. No live call occurred.

## Task 2: Align actionable source assembly and consumption

**Files:** New CLI-generated migration under `supabase/migrations`; new owned SQL test under `supabase/tests`.

**Interfaces:** Existing `internal.insight_result_allowed`, `internal.insight_outcome_allowed`, `internal.observation_source_allowed`, `internal.require_stored_insight_scope` remain private authority. `teacher_insight_context` returns the existing bounded JSON schema.

- [x] Filter recent result candidates with the exact current authorized result predicate before the top10 selection.
- [x] Filter prior intervention baselines/outcomes with the same existing predicates before bounded actionable context. Omit a stale prior source; retain separately permitted history with existing requires-review projection.
- [x] Apply the existing source authorization predicate to observed sources, retaining exact processed event identity checks at consumption.
- [x] At completion call `internal.require_stored_insight_scope(target_run)` instead of rebuilding a top-N context and demanding byte equality. Keep the numeric helper's exact baseline, lease, policy, output and source validation.
- [x] Revalidate saved learning-option kind/title/instructions against its current authorized source so a changed used option still requires review. An unrelated new option does not change the saved manifest.
- [x] Use guarded migration shape assertions and no broader grants; record all changed private functions and preserve current runtime grants explicitly.

## Task 3: Verify authority and recovery

- [x] SQL golden cases: private/Data API/worker execute denial, stale prior omitted, valid fresh context, unused option accepted, changed saved option rejected, corrected cited result rejected.
- [x] Run the two new integration regressions plus existing intelligence/current-source/history journeys and relevant SQL golden cases in the exclusive root window.
- [x] Confirm original-key replay is one provider call/one proposal and genuine source/policy/relationship revocation still denies.
- [x] Run typecheck/lint/structural/docs checks, update owner README and gap evidence. Do not claim this closes richer context, prompt provenance, policy propagation, rubric insight, run status, budget or usefulness evaluation gaps.
