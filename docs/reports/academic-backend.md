# Numeric academic truth backend

Date: 1 October 2026. Company E Deviser; product Cuevo.

Teacher marking and explicit release now persist native numeric results, school-authored approved reference context, immutable source evidence, revision history, current released projection, audit and outbox in the existing private PostgreSQL/Nest path. No official curriculum, grade conversion or normalized attainment is inferred. Rubric marking remains an MVP requirement outside this numeric increment.

## Records and contract

`createAcademicController(identity,database)` is exported from `apps/api/src/academic/controller.ts` and registered by root. Strict bodies live in `packages/contracts/src/academic.ts`. Every command uses verified current identity, current SQL object/entitlement checks before replay, a SHA-256 fingerprint, existing idempotency storage, audit and outbox in the same transaction. Academic queries use private RLS and bounded UUID list pagination.

School Custom versions and references are tenant-owned, sourceType `SCHOOL_AUTHORED`, nullable code, permitted school-authored rights and named actors. Teacher/admin creates DRAFT; coordinator/admin approves. Approved references and version sources are immutable. Used assessment maxScore/model/reference/policy context is frozen. Synthetic seed includes an explicitly synthetic approved school objective; it certifies no external curriculum.

Marking revisions remain separate from released result revisions. A new mark uses expectedRevision 0 initially and the latest marking revision on correction. It snapshots score/maxScore/policy/reference and the actual immutable submission ID. Zero is legitimate; missing, stale, out-of-bounds or source-unconfirmed input is rejected. Student/parent cannot read draft grades.

Release requires a current authorized teacher/admin, active enrollment, latest mark, unchanged assessment context and approved same-school source reference. It creates immutable result + evidence + current pointer. The source evidence describes `SUBMISSION`, teacher-entered quality, actual submission ID, learner, actor, reference/version, policy, timestamp and result revision. Evidence API responses contain provenance only, never raw submitted content.

`GET /v1/results` returns the current released projection only. Historical released revisions/evidence remain immutable in storage; prior authorized evidence can still be retrieved. `GET /v1/marking` returns the latest marking as currentResult with its marking ID; status is REVIEW until that revision is released, then RELEASED. Release endpoint IDs refer to marking revisions; the returned released result ID is separate.

Parent access defaults false. Release body supports `{expectedRevision,parentVisible?:boolean}` with false default; the explicit teacher flag approves that released parent projection. Current parent relationship is also required on every result/evidence read. Parent receives no raw submission through academic APIs.

Same-key replay returns the stored response after current scope checks. New-key release of an already released marking returns that same result without another canonical event. A transaction advisory lock serializes semantic release attempts without granting UPDATE on immutable submissions. `result.released` event metadata contains learnerId, referenceId, resultId, evidenceId, revision and policyVersion; envelope retains school/actor. Corrections produce distinct result IDs and preserve prior evidence.

## Migrations

CLI-generated and applied locally through `migration up --local --network-id cuevo-local`:

- `20261001001036_academic_truth.sql`: reference/version, marking, released result, evidence/current projection records; constrained SQL command functions, RLS and private grants.
- `20261001001421_academic_context_immutability.sql`: approved-reference and used-assessment native-context freeze, after red tests demonstrated missing protections.

No local reset, remote schema mutation or git commit was performed. Existing Auth was preserved. Current local synthetic schools received curriculum entitlement through a verified loopback/56322 update; deterministic seed contains the same entitlement for clean replay.

## Verification

Four strict body tests failed before implementation. Four schema existence assertions failed before migration. Two SQL cases failed before approved-reference and used-assessment-context immutable guards were added. The local real Auth/API/DB scenario passed after resolving a lock privilege issue by using a transaction advisory lock instead of weakening immutable-source grants.

Final targeted commands:

```text
node node_modules/supabase/dist/supabase.js test db supabase/tests/040_academic_truth.test.sql --network-id cuevo-local
  27 SQL checks passed

node node_modules/vitest/vitest.mjs run apps/api/test/academic --reporter=dot
  2 files, 5 tests passed; local integration was executed, not skipped

node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js apps/api/src/academic apps/api/test/academic* packages/contracts/src/academic.ts
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json
git diff --check -- [academic changed paths]
  all exit 0, no diagnostics
```

The full SQL suite passed 157 checks before four additional academic rollback/source tests were added; the final academic suite above passes 27. Root will run the final combined suite after review.

The real integration journey proves teacher reference authoring, forbidden self-approval, coordinator approval, policy link, immutable learner submission, numeric zero marking, draft privacy, release/evidence, same/new-key deduplication, score-bound rejection, revision correction, latest current projection, approved parent projection, unrelated learner denial, source privacy and context freeze. It queries actual storage to confirm two correction history rows/evidence rows and one canonical initial-release event. Authoritative teacher assignment revocation blocks stored release replay; parent relationship revocation removes approved evidence access, and fixtures restore in `finally`.

SQL golden cases additionally prove missing reference blocks release, missing score never becomes zero, optimistic revision and source checks, private grants, owner immutable history, failed transaction rollback of result/evidence/current reservation/audit/outbox and absent draft current projection.

Integration runs require the configured Cuevo local environment and synthetic credentials; `CUEVO_REQUIRE_INTEGRATION=1` rejects missing configuration instead of skipping. Run SQL and Auth integration sequentially because revocation fixtures briefly change current relationships.

## Limits

Root owns clean reset/seed replay, browser numeric marking/release/parent verification and independent review. No Gate 2 or MVP-complete claim follows from this backend report. Rubrics, official source-locked curricula, native qualification-specific grading, learner-state processing and the intelligence/intervention loop remain outstanding.

## Review remediation: recoverable reference configuration

Review found that an unmapped assessment could receive an immutable REVIEW mark, after which reference linking was frozen and release was impossible. Four SQL regressions reproduced the rejected-mark/persisted-mark/link/recovery sequence before remediation. CLI migration `20261001002127_academic_mark_reference_required.sql` now requires an approved same-school objective before inserting any marking revision. The API returns `ACADEMIC_REFERENCE_REQUIRED`/409 with an actionable instruction before reservation/writes. The source helper also enforces the rule. A rejected unmapped mark leaves no revision, so an authorized teacher can link the approved objective and then mark. Historical released/draft protections remain intact.

Post-remediation verification ran sequentially after synthetic Auth seed completion: six academic API tests passed, including the actual Auth/API/database journey and missing-objective pre-write check; the full database suite passed 164 checks across six files; typecheck, scoped lint and API build passed. No integration case was skipped in that full academic run. OpenAPI input boundaries and primary lists/results/marking responses are described; approve/link/evidence response schemas remain coarse metadata and are not claimed as complete generated-client coverage.
