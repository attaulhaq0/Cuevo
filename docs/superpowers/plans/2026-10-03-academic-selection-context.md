# Academic and curriculum selection context implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Track execution with the checkboxes below. Root owns shared database, Auth, runtime and browser windows.

**Goal:** Let staff identify the intended approved objective, immutable rubric and programme learner from authorized human context, and reject unresolved selections before new commands or original-key replay without changing academic history.

**Architecture:** Keep Academic responsible for objective/rubric candidates and exact source review, Curriculum responsible for programme/hierarchy scope and assignment decisions, and School responsible for registered identity and current class/year context. Private SQL supplies complete source facts and ambiguity flags before cursor pagination; strict portable contracts and feature-owned presentation consume those facts. Existing NestJS/Fastify actor transactions, domain commands, RLS, native results and outbox remain the authority.

**Tech stack:** Next.js 16, React, existing Trail design primitives, NestJS/Fastify, PostgreSQL/Supabase, Zod, Vitest/node:test, Playwright/axe. No new runtime dependency, external API, AI call, microservice or second identity/academic engine.

**Specification:** Read [root constitution](../../../AGENTS.md), [context map](../../product/context-map.md), sources [05 curriculum](../../product/curriculum/05-CURRICULUM-ENGINE.md), [06 packs](../../product/curriculum/06-CURRICULUM-PACK-SPEC.md), [13 learning](../../product/domains/13-LMS-LXP-FUNCTIONAL-SPEC.md), [14 School identity](../../product/domains/14-SIS-MIS-FUNCTIONAL-SPEC.md), [17 assessment](../../product/domains/17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md), [36 design](../../product/design/36-DESIGN-CONSTITUTION.md), [38 contracts](../../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md), [39 governance](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [61 denies](../../product/verification/61-SECURITY-THREAT-TEST-MATRIX.md), [63 accessibility](../../product/design/63-ACCESSIBILITY-RTL-I18N.md), [69 source lock](../../product/curriculum/69-SOURCE-LOCKED-CURRICULUM-PROTOCOL.md), [81 grants](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), [83 exit](../../product/overview/83-MVP-EXIT-CRITERIA.md) and [85 claims](../../product/curriculum/85-ADVERTISED-SUPPORT-AND-CLAIMS-POLICY.md). The [School selection decision](../../decisions/2026-10-03-school-selection-context.md) is implemented evidence and an identity boundary, not permission to expose the School directory to another role. Read Academic, Curriculum and School owner READMEs, scoped AGENTS and the tests named in each task.

## Status and global constraints

This is a researched implementation plan, authored during root's frozen browser verification on 3 October 2026. No task below is implemented or accepted by this document. It must not become a competing product source. Add its link to the codebase map when execution begins, and record the final boundaries in an ADR before the change is accepted.

- Academic evidence, source identity, native grades, immutable rubric definitions and existing curriculum/programme mappings stay unchanged.
- “Evidence is not inference. Inference is not fact.” “Missing is not zero. Unknown is not false.”
- “Never invent curriculum facts, standards, syllabus codes, grading rules or accreditation requirements.” Use only locked repository artifacts and existing school-authored records.
- “Never trust frontend hiding as authorization.” Repeat tenant, entitlement, actor, relationship and exact object/source checks before mutation and original-key replay.
- “Every important mutation is idempotent.” “Every important academic mutation is auditable.” “Use a transactional outbox for reliable asynchronous events.”
- “Database migrations are the source of truth.” Applied migrations are immutable; create new files with the installed CLI and never edit historical SQL to make tests green.
- “English and Arabic/RTL are first-class.” Human-authored text stays escaped and uses automatic bidi direction. Do not machine-translate source descriptions into invented academic facts.
- “New tables must not be automatically exposed to the Data API.” Private helpers and decision history receive explicit grants/RLS/deny tests. Only purpose-specific read/command wrappers are callable by `cuevo_api`.
- READY is a source-specific new-selection verdict, not a grade, curriculum acceptance, general identity verdict or historical source validity.
- No raw UUID, hash, opaque version token, timestamp fraction or ordinal invented from an ID may distinguish customer choices. Actual dates may support review, but dates alone do not make two otherwise indistinguishable sources selectable.
- Do not claim a full-source view or rendered screen is evidence of command acceptance. Final verification covers browser → API → private source/audit/outbox → current read and denials.

## Findings and existing recovery truth

`apps/web/features/academic/model.ts:academicReferenceChoice` currently joins title, optional parent title and actual approval/creation time rounded to the minute. Root's saved browser snapshots contain two enabled identical “Explain the school example · Oct 3, 2026, 7:14 AM UTC” choices. `internal.read_course_academic_references` scopes an authorized course and approved mappings, but limits/cursors its candidate CTE before any ambiguity calculation. Learning preparation, Academic marking and Curriculum period planning all reuse that formatter. `prepare_assessment` skips linking when the selected reference already matches, so adding a guard only to `link_assessment_reference` would leave an unchanged-reference path and original-key replay unprotected.

Rubric preparation uses a bare rubric title. Academic rubric configuration uses title plus a minute-level creation date. The rubric list is paged globally and filtered by course in the browser; a peer on another page cannot be used as the ambiguity denominator. `rubric_versions` is immutable and uniquely constrained by course/title/version, but different opaque version tokens can still create indistinguishable customer choices. Criterion keys and level keys are technical addressing; criterion titles, level labels and source descriptions are the meaningful review content.

`CurriculumWorkspace` reads `/v1/school/people`, filters `role === 'student'` and puts bare `displayName` into the programme learner select. It ignores current `selectionContext`. Current programme readback shows learner names but does not provide a source selection verdict. The assignment command checks current programme/class/enrollment authority, but does not reject two authorized learners with identical visible identity. Reusing the School directory's flag without rechecking the selected programme would also be too broad: the relevant candidate denominator is that programme's currently eligible class, not every person in the school.

Academic `ReferenceList` currently offers create and approve only. `school_custom_references` has DRAFT/APPROVED states; no supported individual correction/withdrawal endpoint exists. Curriculum source hierarchy and course approvals are immutable. Existing pack lifecycle supports explicit whole-pack supersession/retirement; retirement rejects open work, and an already bound course is not silently rebound. Rubric definitions likewise have no supported retirement command. Therefore this plan must add a bounded future-selection withdrawal where needed; it must not tell customers an existing checkbox can repair duplicate academic records. Whole-pack retirement is too broad for an isolated duplicate and never justifies deleting evidence or switching authoritative references.

## Ownership and contract design

Keep one small `packages/contracts/src/academic-selection.ts` for source-selection responses. Keep formatting/parsing in `apps/web/features/academic/selection.ts`, re-exported from Academic `model.ts`. Add `apps/api/src/modules/academic/selection.service.ts` for the bounded wrapper reads/guards, with a documented `public.ts` server surface consumed by Learning. Curriculum calls private SQL directly for its planning/assignment transactions rather than importing Academic application internals. Do not create a general selection service, catch-all utilities or a registry of unrelated domains.

Each Academic choice is addressed by its existing academic UUID; a curriculum hierarchy reference UUID remains separate and is only present in a source-review response where the established approval maps it. A rubric UUID remains the original immutable definition. A programme learner UUID remains the existing registered actor. These identities never become customer labels.

Use the following common verdict inside three distinct contracts:

```ts
type SelectionVerdict =
  | { status: 'READY'; reason: null }
  | { status: 'REQUIRES_REVIEW'; reason:
      'CONTEXT_UNAVAILABLE' | 'INDISTINGUISHABLE_CONTEXT' | 'WITHDRAWN_FROM_NEW_SELECTION' };
```

Objective context adds `courseId`, nullable actual course/class/subject/year-group/academic-year names, explicit origin `SCHOOL_AUTHORED` or `APPROVED_CURRICULUM_MAPPING`, nullable actual programme/parent titles, `descriptionExcerpt` and `selectionRevision`. Rubric context adds the same course axes, `criterionTitles` in the definition's saved order, a deterministic description excerpt drawn from the saved criterion/level wording and `selectionRevision`. Review responses contain the complete escaped source description or validated rubric definition; dates and source version stay in secondary source details. Programme learner choices extend the existing portable School person selection fields with `programmeId` and the exact selected programme's class/year context. They contain no email, guardians, pastoral fields, grades or inference.

Description excerpts are deterministic visible text, not AI summaries: normalize display whitespace, retain source language, take at most 320 Unicode code points and append a visible ellipsis when truncated. A shorter excerpt is not a claim that the whole source was reviewed. Compute collision keys from the actual visible academic caption axes plus this exact excerpt and rubric criterion-title summary. Different hidden suffixes, internal versions and approval timestamps do not resolve a visible collision. `READY` requires a nonempty registered title, complete required course axes, complete description/criterion source, an authorized current candidate, no future-selection withdrawal and no identical normalized visible peer anywhere in the full eligible set. An unbound School Custom objective has a truthful School-authored origin with `parentTitle`/`programmeName` null; null is permissible only for those explicitly inapplicable axes. Missing parent/programme for a mapped objective remains review-required.

Use NFKC/whitespace normalization consistently in SQL and the bounded browser duplicate check. Never assume language case conversion alone establishes identity. Browser flags may additionally block malformed/duplicate loaded rows, but cannot upgrade a server review verdict or treat an absent flag as READY.

## Task 1 — Pin portable source-choice contracts and failing tests

**Files:** create `packages/contracts/src/academic-selection.ts`; update its `index.ts` exports and README; add `packages/contracts/test/academic-selection.test.ts`. Modify Academic `model.ts`/new `selection.ts` and tests, Curriculum `model.ts` tests, and scoped owner READMEs. Do not change current source responses until the producing SQL/API task is ready in the same execution branch.

**Interfaces:** export `academicReferenceSelectionSchema`, `academicRubricSelectionSchema`, bounded page schemas, exact review schemas and `SelectionVerdict`. Add `programmeLearnerSelectionPageSchema` to `packages/contracts/src/curriculum.ts`, based on `schoolPersonSelectionSchema` with exact `programmeId` checks. New page contracts require `schemaVersion: '1'`, `courseId`/`programmeId`, `items` ≤100 and a UUID/null cursor.

- [ ] Write strict contract cases for complete READY, explicit unbound School Custom origin, mapped missing parent, blank title/description, absent verdict, unknown date/enum, unexpected email/guardian/prompt fields, duplicated IDs and foreign course/programme IDs. Write the meaningful same-title/different-description case and equal-visible-excerpt collision case.
- [ ] Observe the contract/model tests fail for the missing exports/functions before implementation. Run the exact new package test with Vitest and the new feature test with the existing node:test web runner.
- [ ] Implement the strict discriminated contracts and pure formatter. Preserve `parseReference` for authoritative existing/legacy source responses; add `parseReferenceSelection` for new choice pages rather than silently accepting legacy missing flags.

```ts
// Test-owned examples, never assembled from the runtime product dictionary.
assert.equal(referenceSelectionLabel(first, 'en').includes('Explain a checking step'), true);
assert.equal(referenceSelectionLabel(first, 'en').includes('Show a calculation and explain the check'), true);
assert.equal(referenceSelectionLabel(first, 'en').includes(first.version), false);
assert.equal(referenceSelectionChoices([first, equalVisiblePeer], 'en').every(x => x.requiresReview), true);
assert.throws(() => parseReferenceSelection({ ...first, selectionContext: undefined }), LearningApiError);
```

- [ ] Verify empty/unavailable/mapped-null semantics, complete rubric descriptors and English/Arabic bidi cases. No timestamp precision experiment or unique-ID suffix is an acceptable implementation.

## Task 2 — Build one full-scope Academic candidate owner before pagination

**Files:** create an additive migration through `supabase migration new academic_selection_context`; add a new numbered SQL test using the actual next repository test number; create `selection.service.ts`/`public.ts`; update `academic.service.ts`, `academic.controller.ts`, contracts, Academic/Learning server READMEs and codebase map in the same coherent change.

**Interfaces:** private `internal.course_reference_selection_candidates(target_course uuid)` and `internal.course_rubric_selection_candidates(target_course uuid)` return existing source ID, source row and `selection_context`. Granted wrappers are `internal.read_course_reference_selection(uuid,integer,uuid)`, `internal.read_course_rubric_selection(uuid,integer,uuid)` and exact bounded `internal.read_academic_selection_source(uuid,text,uuid)`. Public server helper `requireAcademicSelection(client, courseId, kind, sourceId)` calls a purpose-specific private guard, not a JavaScript page-count check.

- [ ] Add failing SQL/API cases for two same-caption sources on opposite `limit=1` pages, same title but meaningfully different descriptions, same visible 320-character excerpt with different hidden endings, mapped parent/subject/year mismatches, archived class, retired pack, unapproved objective, foreign school, unavailable source and duplicate rubric meaning with different version tokens.
- [ ] Scope reference candidates through the existing `require_course_objective_access`, academic entitlement, actual approved reference/version and exact current course mapping predicates. Reuse current source/pack checks; a matching parent title does not authorize a mapping. Scope rubrics to the exact managed course and immutable valid definition. Preserve the existing role boundary; no new student/parent directory read.
- [ ] Materialize **all authorized eligible candidates**, calculate normalized visible identities/duplicate counts, attach source-specific verdicts, then apply `id > cursor`, ordering and `limit+1`. The following shape is required; substituting the old bounded candidate CTE is a failed implementation:

```sql
with eligible as materialized ( /* exact existing source authorization, no cursor or limit */ ),
marked as materialized (
 select eligible.*,count(*)over(partition by visible_identity_key)as peer_count
 from eligible
),page as materialized (
 select *from marked where page_cursor is null or id>page_cursor order by id limit page_limit+1
)
select /* bounded contract projection, explicit READY/REQUIRES_REVIEW */ from page;
```

- [ ] Expose `GET /v1/courses/:id/academic-reference-selections`, assessment-alias equivalent, `GET /v1/courses/:id/rubric-selections` and `GET /v1/courses/:id/academic-selection/:kind/:sourceId`. Require current actor/course and validate exact envelope identities and byte limits. Existing source/evidence routes remain unchanged. Exact review reauthorizes the target independently of whether it appeared on a loaded page and returns no unrelated source catalogue.
- [ ] Revoke raw helpers/tables from PUBLIC/anon/authenticated/service_role/worker. Test allowed wrapper execution and independent raw/direct-role denies. Enforce ≤250KiB page/review response or request a smaller page; do not suppress malformed rows by pretending the catalogue is empty.

## Task 3 — Guard preparation, objective/rubric links and plans before replay

**Files:** modify Learning `learning.service.ts`, Academic `academic.service.ts`, Curriculum planning SQL, the new Academic additive migration and SQL/API tests. Do not modify applied `prepare_assessment`, `link_assessment_reference` or planning migrations; replace/delegate functions in the new migration while preserving canonical body checks.

**Interfaces:** `internal.require_academic_selection(target_course uuid,kind text,target_source uuid)` has a granted purpose-bound wrapper available to authorized API transactions; the underlying candidates stay ungranted. It rejects unknown kinds/IDs, missing/current-unauthorized sources with 42501 and unresolved/withdrawn choice with 22023. No new request caption, browser-generated signature or reusable approval token is authority.

- [ ] Add a failing original-key test: successfully prepare/link/plan a unique source, then add a currently eligible equal-visible peer through approved source commands; replay must require review before `begin_command` can return its stored receipt. A distinct new eligible source must leave replay valid. Verify no extra command/audit/outbox rows on denial.
- [ ] Acquire locks in the current established order: School maintenance/access lock where already required, then Academic course lock, then exact source rows. Define a school-level academic catalogue lock shared by reference creation/approval/selection withdrawal so inserting a peer cannot race the guard; preserve existing lock order in curriculum approval/configuration and rubric creation. Add independent race tests rather than relying on a read-only snapshot outside the mutation transaction.
- [ ] Call the current guard before `begin_command` in Learning `assessment.preparation` and Academic `assessment.reference`/`assessment.rubric`. Revalidate the actual requested source and exact course, even if it equals the current linked source. Repeat inside private SQL entrypoints; `prepare_assessment` must guard an unchanged reference/rubric before its existing no-op-link branch.
- [ ] Call the same source guard before `record_objective_plan` reaches `begin_command` for `plan.create` and `plan.revalidate`, using the plan's stored reference for revalidation. Preserve current period revision, exact taught lesson/date, same-objective assessment and source/evidence checks. Do not block existing historical plan/evidence reads merely because that reference is unavailable for new selection.
- [ ] Preserve current authoritative linked-source reads and native marking/release semantics. Selection ambiguity is not permission to erase valid grades or make existing evidence UNKNOWN. Publication of a newly prepared task revalidates its selections, while a used/published legacy source keeps its immutable linked objective. Test this distinction explicitly.

## Task 4 — Connect one meaningful Academic source review to all consumers

**Files:** Academic `selection.ts`, `components/selection-review.tsx`, `components/marking.tsx`, `components/rubrics.tsx`, `model.ts`, `ui.tsx`, messages/tests/README; Learning `components/assessment-preparation.tsx`/README; Curriculum `components/period-planning.tsx`/README; browser cases for preparation/course approval/rubric/planning and the customer loop.

**Interfaces:** Academic public UI `AcademicSelectionReview({courseId,kind,sourceId,onClose})` and public model formatter/choice functions. Learning and Curriculum import only documented Academic public model/UI surfaces. Reuse existing shared query cancellation, original-key journal, fields, buttons and `LoadMore`.

- [ ] Replace global rubric filtering in preparation with exact course rubric-selection pages. Replace objective choice pages with the strict new selection parser. Preserve assigned source IDs/default values but prevent a newly unavailable selection from being submitted.
- [ ] Display title, named context axes and the saved description/criterion wording. Offer one deliberate source-review drawer; show complete escaped description/criterion levels, actual recorded approval/origin and technical source version only in opened details. An opaque “version” field is not promoted to a primary differentiator.
- [ ] Show disabled/review-required rows and localized actionable guidance. Unknown choices cannot mount a successful form/default, and an unconfirmed catalogue cannot be reported as “no objectives.” A browser dropdown cannot enable a record whose server verdict is review-required. Keep exact source-detail access for staff review even when it is unavailable for new selection.
- [ ] Reuse meaningful exact course/class/year labels, but retain domain distinctions: Academic objective ID, curriculum hierarchy reference ID and rubric ID are separate. Course names/classes themselves must be distinguishable under existing authorized course choices; do not create a second School class formatter or fix course ambiguity by selecting the first UUID.
- [ ] Add real component and browser cases for duplicate title/different content, unresolved equal visible excerpt, missing context, denied exact source, same-scope refresh retaining input, new-scope/lost-access clearing input, English/Arabic mobile, keyboard opening/closing review and heading-order/axe. Preserve existing closed-loop native/evidence receipt checks and human approval.

## Task 5 — Give programme learner selection its own current scope

**Files:** Curriculum `curriculum.controller.ts`, portable contracts/model, `components/curriculum-workspace.tsx`/`programme-learners.tsx`, additive SQL and directory/API/browser tests. Reuse School public model/label surfaces only where documented; do not grant access to ungranted School helpers or require teacher directory access.

**Interfaces:** `internal.programme_learner_selection_candidates(target_programme uuid)` and `internal.read_programme_learner_selection(uuid,integer,uuid)` plus `internal.require_programme_learner_selection(uuid,uuid)` before mutation/replay. API `GET /v1/curriculum/programmes/:id/learner-selections` is admin/coordinator only. `programmeLearnerSelectionPageSchema` pins each row to the exact selected programme and exposes the current class/year axes through existing School selection semantics.

- [ ] Add failing cases for identical enrolled names on different pages in the same programme class, same names in different classes, revoked/expired enrollment, withdrawn member, missing class/year/person, foreign programme and a stale original-key assignment after eligibility changes. Current archived/retired programme source checks remain.
- [ ] First prove the exact programme is currently configurable/readable under existing Curriculum authority. Enumerate only current eligible student members enrolled in that programme's exact class; include current person/known class/year context, then count visible collisions before cursor. Never use all school people, guardian details or a sibling programme as the denominator.
- [ ] Pin the selected programme before loading choices. Clear the prior learner selection on programme/access change and wait for strict current-source reads. The UI displays human name with explicit programme class/year context and uses exact UUID only as the request value.
- [ ] Before `configure_curriculum` begins/replays `learner.configure`, repeat the exact current programme/learner source and unresolved identity check inside the existing access/course lock boundaries. Preserve confirmed active/revoked assignment intent and no automatic enrollment/account/guardian creation. The rule applies to both new assignments and explicit revocation; unresolved target identity requires the School remediation path, not a privileged name guess.
- [ ] Extend current programme readback with truthful context/review guidance where needed; an existing approved assignment may remain readable with its current source even when new selection is unresolved. Add current teacher subject-scoped read parity and parent/student directory denies.

## Task 6 — Implement safe future-selection withdrawal without rewriting academic truth

**Files:** the additive Academic migration, private decision tables/functions/SQL tests, Academic `selection.service.ts`/controller/contracts, the exact source-review drawer, messages/owner READMEs and an ADR. This is bounded repair of school-authored choices, not curriculum content editing or pack acceptance.

**Interfaces:** private append-only `internal.academic_selection_decisions(school_id,kind,source_id,revision,state,reason,reviewed_by,created_at)` where kind is OBJECTIVE/RUBRIC and state is AVAILABLE/WITHDRAWN. Zero history means the existing source is eligible subject to normal authority; it never means approved or READY. Command `POST /v1/courses/:id/academic-selection/:kind/:sourceId/withdraw` requires exact source review, current selection revision, reason, unchecked human confirmation and an original key. Coordinator/admin can withdraw objectives; only current authorized teacher/admin source owner can withdraw a rubric. Define `scripts/runtime/academic-selection-review.ts`, following the existing reviewed `initial-school.ts` port pattern, and owner-only `internal.withdraw_reviewed_academic_selection(jsonb,text,text,text)` for genuinely indistinguishable records instead of bypassing this review boundary.

The operator input contains `schoolId`, `courseId`, `kind`, `sourceId`, `expectedSelectionRevision`, `administratorId`, `sourceReviewerId`, `sourceBasis` (exact current title/description or complete immutable rubric definition, original version/source mapping and creator/approver UUIDs), `reason` and `confirmSourceReview: true`. The runner verifies current nonanonymous confirmed operator, current school administrator and required objective/rubric reviewer sessions through the existing Auth verifier; the owner function repeats SQL current-session/membership/source checks. Technical identities are permitted only in this deliberately opened operator provenance, never in a school-facing primary caption. The server derives a fingerprint from the validated exact intent and rechecks it, source bytes/mapping and current decision revision before original-key replay. It updates only new-selection history and emits the same minimized withdrawal event as the customer route. The runner stays local synthetic until a separately approved hosted operator mechanism exists; it never reads provider credentials from Storage or writes a replacement academic source.

- [ ] Verify that the normal user can identify the exact target from authorized meaningful content. Different title/parent/description/criterion facts allow deliberate exact source review. If complete human source facts still cannot distinguish the records, keep both choices review-required and direct school support to the reviewed operator path. Opening one of two identical cards is not identity confirmation.
- [ ] Implement the operator runner with exact local target checks and sanitized receipts, plus a protected support instruction in the review drawer. Exercise reviewed exact source withdrawal with both current human actors and current sessions, original-key same-intent replay, changed source/revision/current actor rejection and exact-owned cleanup. A script exists only for unresolved technical identity review; it is not an API permission bypass or a route for routine direct SQL.
- [ ] Create append-only decisions with explicit private RLS, no raw runtime writes, immutable/no-truncate triggers and exact unique keys. Use the existing source/catalogue lock, current actor/course/approval checks before original-key replay, fingerprinted intent and transactional audit/outbox. The event is a deterministic acknowledgement owned by the existing worker; it must never authorize AI or recalculate attainment.
- [ ] Withdrawal removes only future-selection eligibility. Never delete or alter references, versions, rubric criteria, mappings, results, evidence, used assessment links, proposals or plans. Current source/history reads still reauthorize their existing canonical record. Reinstatement is excluded from this slice; a corrected definition uses the current create/approve/new-source workflow and explicit new use.
- [ ] For mapped sources, do not interpret an individual selection decision as retiring an official pack or revoking a curriculum mapping. Whole-pack lifecycle remains the existing reviewed process with open-work and replacement guards; create/approve a genuinely corrected new source context rather than mutating the locked artifact. An immutable existing bound course is not rebound automatically.
- [ ] Test withdrawal/replay after scope loss or changed decision revision, denied foreign source, exact declared duplicate operator review, no new-selection use, retained native/evidence/parent publication and no phantom source deletion. Avoid a recovery dead end: the operator-assisted path is a prerequisite for declaring indistinguishable dirty source handling customer-ready, not an optional manual SQL note.

## Task 7 — Run the complete accepted-source and customer matrix

**Files:** relevant owner tests and browser cases, scoped READMEs, ADR, codebase map, implementation status and source-scoped reports. Update only implementation documents; numbered academic facts are not changed by this repair.

- [ ] Run root typecheck/lint, affected pure package/feature tests, architecture/docs/repository checks and their tests. Verify no cross-feature deep imports, mixed browser/server barrel, generated output or secrets.
- [ ] In an exclusive root-owned local window, replay the new additive migrations on the guarded clean synthetic database; run explicit SQL/grants/RLS/deny, API candidate/command/replay/race tests and current curricular/native-source regression suites. Never run a concurrent reset/worker/provider suite or treat skipped SQL/API cases as acceptance.
- [ ] Rebuild the configured production web app and run the actual staff objective/rubric/planning/programme flows in English/Arabic, desktop/mobile, keyboard/axe, empty/loading/denied/offline/current-source-change states. Include a peer beyond the first page and realistic bounded response sizes. Check both console errors and hydration warnings.
- [ ] Demonstrate the normal customer chain: coordinator approves an exact source → teacher reviews/selects it → prepares/publishes task → student submits → teacher marks/releases native result → evidence/intelligence/approval/practice/reassessment/outcome remains connected. Prove exact programme learner assignment changes are visible only under current authority.
- [ ] Demonstrate meaningful duplicate resolution through source review/withdrawal or explicit operator-assisted remediation, plus retained source history. A readable dropdown, API unit test or renamed fixture cannot substitute for this recovery journey.
- [ ] Restore the reference school after owned mutation tests and record separate attempted/passed/skipped denominators, exact source snapshot and remaining gates. Root's current frozen browser evidence stays unchanged; this plan cannot retroactively claim its future features were tested.

## Self-review and completion boundary

The plan covers the observed objective/rubric/page-collision defect, pre-replay guards, meaningful academic source disclosure, programme learner scope, and the missing individual source recovery path. It preserves curriculum/source/academic/identity ownership and all native historical truth. Paid features, unrestricted student AI, new official curriculum support, bulk admissions, SSO and general catalogue redesign are outside scope.

Do not mark this plan complete while the exact academic candidate guards or operator-assisted indistinguishable-source remediation remain unimplemented, while API/SQL or rendered deny/RTL/axe cases are skipped, or while a new selection withdrawal changes historical source authority. Root schedules execution after the active frozen verification terminal; only reviewed source plus current acceptance evidence establishes delivery.
