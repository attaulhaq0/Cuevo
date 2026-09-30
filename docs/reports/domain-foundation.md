# Cuevo domain foundation verification

Company: E Deviser. Product: Cuevo. Date: 1 October 2026.

Task 3 implements pure domain authorization and curriculum readiness validation. It does not claim an MVP gate, live authorization integration or official curriculum readiness.

## Changed files

- `packages/domain/src/index.ts`: public domain exports.
- `packages/domain/src/errors.ts`: safe `DomainError(code, status, message)` contract.
- `packages/domain/src/authorization.ts`: runtime actor validation, exact capability/role/tenant policy, learner object scope and current membership/relationship windows.
- `packages/domain/src/curriculum.ts`: separate lifecycle, fact status, source rights and coverage readiness; trusted pack metadata validation; verified-rule use and immutable/pinned-version guards.
- `packages/domain/test/authorization.test.ts`: 51 positive, denial and time-boundary cases.
- `packages/domain/test/curriculum.test.ts`: 54 synthetic pack acceptance, rejection, provenance, approval and historical-version cases.

The root integrator owns package manifests and dependency installation. No root manifests, migrations, application code or official source artifacts were changed by this task.

## Verification evidence

The first targeted run used a no-op interface scaffold and produced **93 failing tests in two files**, confirming missing authorization and curriculum policies. Implementation then passed those 93 tests.

Review identified additional policy gaps. Seven new cases failed before adding academic approval and superseded/retired-use guards. Five further cases failed before adding source-restricted/deferred-use and example placeholder-version guards. Each regression was observed red before its implementation.

Final commands, all exit 0:

```text
node node_modules/vitest/vitest.mjs run packages/domain/test
  2 files passed; 105 tests passed (51 authorization, 54 curriculum)

node node_modules/typescript/bin/tsc --noEmit --strict --module ESNext --moduleResolution Bundler --target ES2023 --skipLibCheck packages/domain/src/index.ts packages/domain/test/authorization.test.ts packages/domain/test/curriculum.test.ts
  no diagnostics

node node_modules/eslint/bin/eslint.js packages/domain
  no diagnostics
```

The final targeted run emitted no warnings. Full workspace, API, database, RLS and browser integration verification belongs to the foundation integration work and is not established by these pure tests.

## Authorization decisions and integration contracts

`ActorContext` has the agreed fields: `userId`, `schoolId`, lowercase `role`, `membershipId` and `entitlements: string[]`. `validateActorContext` rejects malformed context and returns a detached object. Shape validation cannot distinguish a forged valid role from a server-resolved role. Only the server may build the actor after verified Supabase identity and current stored membership checks.

`requireCapability(actor, schoolId, capability, allowedRoles)` requires the exact tenant, exact entitlement and allowed role. Admins receive no implicit entitlement or cross-tenant bypass. Empty/malformed caller policies fail as server configuration errors. Malformed identity is 401; known access denial is 403. Error messages contain no learner, school or private record details.

`requireLearnerScope(actor, learnerId, scope)` requires a trusted queried scope with matching school and learner identity. Admin/coordinator have ordinary tenant-wide learner scope; teacher needs current assignment; parent needs current approved relationship; student needs their own learner identity and current enrollment. Sensitive pastoral, grade mutations and other operations still require their own capability policy. This object check does not itself grant an operation entitlement.

At this boundary **learnerId is the authentication subject UUID**, as agreed with the API/database integrator. A database learner record with a different ID must be resolved to its auth subject before this helper is called. `scope` must never come from request body flags.

`isActiveMembership` and `isActiveRelationship` receive `{status, validFrom, validUntil}` plus explicit `now: Date`. Status must equal `active`. The interval is `[validFrom, validUntil)`. Explicit null is an open-ended boundary; undefined, invalid dates, reversed/empty intervals, revoked/suspended state and invalid evaluation time return false. The API must apply these checks to current stored values; an ActorContext does not embed expiry.

## Curriculum decisions

The following are separate concepts:

- Lifecycle: `DRAFT` through `ACTIVE`, `SUPERSEDED`, `RETIRED`.
- Per-fact status: `VERIFIED`, `UNKNOWN`, `REQUIRES_REVIEW`, `SOURCE_RESTRICTED`, `SUPERSEDED`, `NOT_APPLICABLE`.
- Source rights: explicit `PERMITTED`, `UNKNOWN`, `REQUIRES_REVIEW`, `SOURCE_RESTRICTED`.
- Coverage readiness: the repository vocabulary, including separate technical validation and academic review.

`ACTIVE` does not imply customer readiness. Technical validation does not imply academic sign-off. Unknown facts may remain in a draft but are never executable verified rules. New use rejects superseded/retired packs; exact version guards still allow their identity to be read for historical records.

Customer-ready metadata requires reviewed structure and terminology, assessment/reporting/golden/browser/API/data verification, named dated academic approval, verified production configuration, nonempty completed required coverage and verified permitted required facts. Official curriculum, jurisdiction and quality sources additionally require authoritative-source designation, recorded publication date/version, local snapshot path and SHA-256 checksum. Placeholder versions from the YAML examples cannot pass official customer promotion.

These are **metadata checks**, not a source-rights decision or academic approval mechanism. The trusted ingestion/research workflow must verify snapshot bytes, permissions, review evidence and customer-required coverage before recording flags. `kind: school_custom` must be assigned through school authoring, never accepted as a client escape hatch for official content. Synthetic fixtures test acceptance logic; their approval metadata certifies no real curriculum.

No official references, grading thresholds, syllabus components, Qatar regulatory applicability or accreditation claims were added. Numeric/rubric assessment execution and complete pack adapters belong to later increments.

## Specification sources and remaining blockers

Behavior follows `05-CURRICULUM-ENGINE.md`, `06-CURRICULUM-PACK-SPEC.md`, `07-SCHOOL-CONFIGURATION-AND-MODULARITY.md`, `17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md`, `34-CURRICULUM-QA-GOLDEN-CASES.md`, `39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md`, `43-TESTING-GOLDEN-CASES.md`, `55-CURRICULUM-DATA-AND-CONTENT-INGESTION.md`, `69-SOURCE-LOCKED-CURRICULUM-PROTOCOL.md`, `76-CURRICULUM-PACK-BUILD-PROTOCOL.md`, `81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md` and `85-ADVERTISED-SUPPORT-AND-CLAIMS-POLICY.md`.

The initial specification-only repository had no local official snapshots, machine-readable packs, executable subject golden cases or academic sign-off. England selected-subject content, Cambridge IGCSE Mathematics 0580 version-specific behavior and Qatar applicable requirements remain `UNKNOWN/REQUIRES_REVIEW` until their locked reviewed artifacts exist. The source index and structural dossiers do not satisfy those requirements. Generic and synthetic School Custom development can continue.
