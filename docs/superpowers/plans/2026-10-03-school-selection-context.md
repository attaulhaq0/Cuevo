# School Selection Context Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for the bounded tasks below. Coordinate all database, provider and browser execution with the root-owned exclusive verification window. This document is a plan, not implementation or acceptance evidence.

**Goal:** Let school staff distinguish the exact person, class or school-period record before access, recovery and attendance actions, and stop at review when existing authorized facts cannot distinguish it.

**Architecture:** Extend the current School private read projections and commands. Compute human context and ambiguity over authorized candidates before paging; repeat the same current context check before mutation and original-key replay. Keep Next.js → NestJS/Fastify → private PostgreSQL, existing membership/relationship revisions, audit and outbox.

**Tech Stack:** Existing TypeScript, Zod/@cuevo/contracts, React/Next.js, NestJS/Fastify, private SQL, Node/Vitest, Playwright and current fixture cleanup. No service, identity system, directory permission or persistent context cache is added.

**Spec:** Source pack `FINAL-2026-10-01`: [07 configuration](../../product/domains/07-SCHOOL-CONFIGURATION-AND-MODULARITY.md), [14 SIS](../../product/domains/14-SIS-MIS-FUNCTIONAL-SPEC.md), [38 contracts](../../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md), [39 governance](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [43 tests](../../product/verification/43-TESTING-GOLDEN-CASES.md), [61 security](../../product/verification/61-SECURITY-THREAT-TEST-MATRIX.md), [63 accessibility/RTL](../../product/design/63-ACCESSIBILITY-RTL-I18N.md), [81 grants](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), root AGENTS and the current [repository layout](../../architecture/repository-layout.md). No curriculum artifact or academic rule is changed.

## Current source and confirmed gaps

| Existing surface | Current facts and gap |
|---|---|
| `apps/web/features/school/components/access.tsx` | `SchoolAccess` uses `displayName` alone for person/student/teacher/parent choices and names assembled from separately paged records. `schoolAccessRevision`, `schoolAccessBasis` and `schoolAccessSourceKey` retain exact current relationship tuples and original revision; preserve these mechanisms. |
| `apps/web/features/school/components/account-recovery.tsx` | `SchoolAccountRecovery` selects active rows by `displayName + role`, then mounts approval before all people pages are loaded. Same-name, same-role members can collide across pages. |
| `apps/web/features/school/components/daily.tsx` | Attendance roster choices use `displayName`; `learners.loaded` admits the form even with a remaining cursor. Correction captions show name/date/status without class/year. Timetable teacher choices also use names alone. |
| `apps/web/features/school/components/setup.tsx` and `labels.ts` | Year/group/term choices use only names. `schoolClassName` concatenates class/group/year from separate arrays. Same-name years have existing dates; groups have existing ordinal; terms have year and dates. Identical factual captions remain ambiguous. |
| `apps/web/features/school/components/school-workspace.tsx` | People-tab loading/error prerequisites omit years/groups while class labels depend on them. `nextCursor`, `moreError` and incomplete prerequisites do not stop new commands. |
| `apps/api/src/modules/school/school.service.ts` | `SchoolService.list` calls `internal.named_school_page(text,jsonb)`. `SchoolService.command` calls `internal.school_command(text,uuid,jsonb,text,text,text)`. These are the existing ownership and request boundaries. |
| `internal.school_list(text,jsonb)` | People are current-school membership/person rows with name, role, status, windows and revision, but no enrollment identity context. Classes contain year/group IDs rather than joined names. The source selects `limit+1` after cursor. |
| `internal.named_school_page(text,jsonb)` | `attendance-roster` already checks selected class, current enrollment/member and `can_record_attendance`, then applies cursor/limit. It supplies class/year names but no full-set ambiguity flag. General named rows are enriched after the underlying page is selected. |
| `/v1/people`, `SchoolLearningService.list` | A learning-owned SQL subquery supplies class labels capped at20 without an overflow state. Do not require the learning entitlement or adopt its truncated result as School mutation authority. |
| `internal.read_learner_profile(uuid)` | Already uses exact current member/enrollment/class/year/group predicates, shared School access locking and explicit25-enrollment capacity refusal. Reuse these source joins/predicates; do not call the complete course-bearing profile per directory row. |
| `internal.create_school_account_recovery(uuid,jsonb,text,text,text)` | Already locks School access/admin memberships and requires current recipient/member/provider/control. It checks `expectedMembershipRevision` before `internal.begin_command`, but not whether the person was distinguishable from other authorized candidates. |
| Portfolio identity precedent | `internal.portfolio_record_identity(text,uuid)` / ungranted `identity_from_validated_source(jsonb)` return `READY` or `REQUIRES_REVIEW`; `internal.portfolio_command` repeats readiness before `begin_command`, including replay. Follow this pattern without importing Portfolio implementation. |

## Fixed constraints and minimal contract delta

- Keep existing routes, resource names, record UUIDs, cursor ordering, request fields, command keys and native revisions. UUIDs remain transport identities only, never primary captions.
- Do not add caller-selected scope, arbitrary purpose strings, school identifiers, a new identity registry or speculative consent fields. Do not expose Auth email, birth date, private guardian links, pupil notes, aggregate attainment or duplicate counts to solve a label collision.
- Context is a live projection of already-authorized records, not authority granted by a label. Missing context stays `REQUIRES_REVIEW`; server flags are required even after client paging completes.
- Return one strict additive person/roster read extension named `selectionContext`: `{status: READY|REQUIRES_REVIEW,enrollmentState: CURRENT|NONE|UNAVAILABLE,classes: [{className,yearGroupName,academicYearName}]}` with at most25 admitted class contexts. Person name/role/status stays in the existing row. For class/year/group/term choices add only `selectionStatus: READY|REQUIRES_REVIEW` and the already-needed joined source names; retain their existing dates/ordinal. Do not attach enrollment semantics to non-person records, add another command schema or change command fingerprints in this increment.
- `NONE` means the exact admitted School person has no current enrollment source, confirmed by the owner. It is not derived from a missing browser array. A unique newly invited classless learner must remain enrollable; applying `currentLearnerChoices` unchanged would incorrectly block this journey. Overflow, incomplete names or unavailable source is `UNAVAILABLE`, not `NONE`.
- For staff/parents, a unique registered name plus role/status may be distinguishable without class context. If two share the complete safe caption, require school-record review. No invented employee/student identifier or private child relationship is introduced.
- Compare normalized names/caption facts over the full current authorized candidate set, never only the current page. Normalize comparison only; preserve the school-provided name in display. Do not strip parts of names because they resemble class/year words.
- Preserve suspended/revoked person visibility and existing revocation support. This repair must not create access, reactivate membership, erase history or let a display-name repair bypass high-impact approval.
- This increment rechecks current distinguishability but does not pin the exact historical caption viewed by a human. `expectedRevision` continues to bind its existing source only. Do not claim that it detects every enrollment/name change outside that revision; a new reviewed selection-basis protocol would require its own bounded design and tests.

## Task 1: Private projection before page selection

**Files:** Create one CLI-allocated additive migration and its next available SQL test in `supabase/tests`; modify `packages/contracts/src/school.ts`, `apps/api/src/modules/school/school.service.ts` and School parsers only as required for the read extension. Update their owner READMEs with the implementation. Allocate real migration/test filenames at execution, never edit applied migration bytes.

**Interfaces:** Add owner-only `internal.school_person_selection_context(target_person uuid,target_class uuid)` returning the strict context JSON. `target_class` is null for the administrator/coordinator current-school directory and exact/non-null for the existing teacher/admin attendance roster. Delegate only affected branches of current `internal.named_school_page(text,jsonb)` / `internal.school_list(text,jsonb)`; the existing granted read entry remains `named_school_page`.

- [ ] Write SQL cases first for same-name learners in different classes, identical same-class learners and an identical learner beyond the first100 rows. Assert both matching visible rows receive review status regardless of cursor. Add a unique newly invited classless learner and assert `NONE` remains distinguishable.
- [ ] Build a materialized authorized candidate source before paging. Directory retains current `school_operations_access` and admin/coordinator restriction. Roster retains `can_view_class`, `can_view_person`, `can_record_attendance`, current active membership/enrollment and selected-class restriction. Join class/year/group with exact same-school keys. Check capacity before truncation; use the established25-enrollment bound, with the26th source producing review rather than an incomplete caption.
- [ ] Calculate person context and collision status against that entire admitted source using a deterministic normalized tuple of registered name, role and sorted safe class axes. Use the same normalization for page and command helpers; do not include UUIDs, array order, revision or technical status as invented identity distinctions. Only then apply the existing UUID cursor and `limit+1`, return the first `limit` and its continuation. Do not filter unsafe rows out before paging: return their review state so the customer receives a recovery explanation.
- [ ] Add class/year/group/term display facts directly to their authorized School source before paging: explicit class/year-group/academic-year axes; years include existing start/end dates; groups use existing ordinal; terms include their authorized year and start/end dates. Identical captions are review-required. Do not invent calendar semantics from the dates.
- [ ] Keep projection helpers ungranted to `PUBLIC`, `anon`, `authenticated`, `service_role`, `cuevo_api` and `cuevo_worker`. Test their denies independently, plus current read-entry permission and identical current-source outcomes under a restricted API login.
- [ ] Add strict Zod read-extension/parser cases: unknown/missing extension remains unavailable, malformed `NONE` with class rows is rejected, overflow never becomes zero and raw/private fields are rejected. `SchoolRow` currently admits scalar fields only; parse the structured extension explicitly in its owning shape instead of weakening that general guard.

## Task 2: Current distinguishability before commands and replay

**Files:** The same new additive migration; existing `packages/contracts/src/school.ts` and `school-accounts.ts` request schemas stay unchanged. Extend SQL and existing API command tests. Reuse current School access lock order.

| Existing command | Exact selection inputs to recheck before `internal.begin_command` |
|---|---|
| `person.configure` | Route `target_id`; current registered identity, `expectedRevision`, role/status/windows. Check old current source, never use proposed `displayName` to manufacture a distinguishable old actor. |
| `enrollment.configure` | `studentId`, `classId`; preserve current tuple and `expectedRevision`, including0 for a genuinely absent tuple. `NONE` uniquely named learner is allowed. |
| `assignment.configure` | `teacherId`, `classId`, `subjectId`; exact current teacher and safe class/subject caption, existing tuple revision and windows. |
| `guardian.configure` | `parentId`, `studentId`; current independently authorized identities and original tuple revision. Do not use private guardian links as a disambiguation field. |
| `attendance.record` | `studentId`, `classId`, exact `occurredOn` and correction `expectedRevision`; current selected roster must be distinguishable. Preserve factual correction source and reason. |
| `timetable.create` | `teacherId`, `classId`, `subjectId`; current assignment remains authoritative. Caption checks cannot replace that assignment predicate. |
| `term.create`, `class.create`, `reportperiod.create` | Existing `academicYearId`, `yearGroupId`, `termId` selections must refer to currently distinguishable prerequisite records; retain ordinary source/date checks. |
| `school.account.recovery.request` | Route target user, `expectedMembershipRevision`, current approved recipient/provider/control and person context. Recovery never resolves an ambiguous person by email or restores access. |

- [ ] Write deny/replay cases using a valid existing record UUID whose current caption is ambiguous. A direct API request must fail review with no audit/event/mutation, despite valid role and membership revision.
- [ ] Add an owner-only readiness check around the existing target/source validation before `begin_command` and before stored response return in `internal.school_command(...)` and `internal.create_school_account_recovery(...)`. Use current School access serialization; verify class/subject source changes cannot race the guarded admission where they are affected.
- [ ] Preserve original-key behavior: same source/current identity returns its original receipt; ambiguous current context, lost authority or expired/revoked source denies replay. Never reprice/relevel, rewrite old receipts, silently change keys or return another record's receipt.
- [ ] Keep review failures sanitized with the current conflict/error mechanism. Record no names, email, full context or secrets in new audit/outbox fields merely for display. Existing important mutations still commit domain state, audit, outbox and receipt together.
- [ ] Verify access revocation is not accidentally disabled by the new readiness rule. If the permitted current facts cannot identify an ambiguous record even for revocation or registered-name correction, retain `REQUIRES_REVIEW` and document the separate school support review; do not make a blanket exception that reopens wrong-person changes.

## Task 3: Use current source flags in School screens

**Files:** `apps/web/features/school/model.ts`, `labels.ts`, `messages.ts`, components `access.tsx`, `account-recovery.tsx`, `daily.tsx`, `setup.tsx`, `school-workspace.tsx`, and owning tests/README. Reuse shared `currentLearnerChoices` comparison/presentation where its `CURRENT` enrollment assumption applies; add only the bounded School-owned `NONE` handling instead of changing its existing learner-progress semantics.

- [ ] Write failing pure tests for explicit Class / Year group / Academic year labels, names containing year words, duplicate captions, Arabic, unique `NONE` and unknown/overflow. Caption text must never contain UUID or shortened-key suffixes.
- [ ] Consume source-projected axes without joining partial browser pages. Keep full prerequisite paging/error checks for fields still resolved from separate lists: `loaded && !nextCursor && !error && !moreError`. People/access and recovery approval must not infer uniqueness from first-page success.
- [ ] Native selectors display review-required options disabled and a localized next step. `CommandForm` currently has no disabled-option contract: supply only safe choices and revalidate the selected value in the body before a new command is prepared. Do not rewrite an already retained uncertain command or replace its key.
- [ ] Remount/disable a selected edit when refresh supplies missing/ambiguous context or a different tuple. Keep `schoolAccessRevision`, `schoolAccessBasis`, `schoolAccessSourceKey` and existing expected revision retention; changing the displayed label never resets source authority.
- [ ] Attendance correction captions and accessible action names show the exact authorized learner/class/year/date/status context. A selected-class roster with remaining pages or `moreError` supplies recovery/loading instructions, not an empty-roster or unique-choice claim.
- [ ] Year/group/term selectors use actual dates/ordinal and source axes. Class labels use explicit axes; same-caption records remain unavailable. Expose remaining prerequisite Load more actions and service failures adjacent to the affected form.

## Task 4: Integrated evidence and handoff

**Tests:** Extend current `supabase/tests` School/RLS coverage and `apps/api/test/integration/school-access-concurrency-api.test.ts`, `customer-school-context-api.test.ts`, `school-operations-api.test.ts` and school-account recovery cases; add `tests/e2e/school-selection-context.spec.ts`. Keep fixture cleanup exact and restore the guarded synthetic reference school after the exclusive window.

- [ ] Exercise real admin/teacher API requests for two same-name learners in different classes; correct target readback must agree with source context. Same-class same-name, duplicate staff/guardian captions and duplicate records split across pages must deny new mutation and stale replay.
- [ ] Exercise unique invited learner `NONE` → authorized enrollment → current class context, and recovery on a uniquely identified active person. Suspended/revoked and wrong-school subjects keep their existing denial. Parent/teacher requests cannot obtain administrator directory or private guardian context.
- [ ] Exercise a lost later page, enrollment-context overflow, name/class/year change after selection, inactive enrollment and stale revision. Verify incomplete capture is not counted as zero errors and failed fixture cleanup remains a failure.
- [ ] Run actual English/Arabic390px browser choices, keyboard selection, disabled ambiguous options, current refresh clearing, same-name safe target readback, console/hydration capture and WCAG2.2 axe. Include setup prerequisite paging, attendance creation/correction and school-assisted recovery approval.
- [ ] Run `npm run typecheck`, lint, relevant unit/API/SQL/RLS tests and build; run architecture/docs/repository checks and their tests. Update owner READMEs/codebase map/decision evidence together with implementation, without changing numbered product facts or registry hashes for this implementation plan.
- [ ] Report exact source hashes, exercised rows/roles, mutation/replay outcomes, restoration and remaining indistinguishable school-record blockers. Passing captions or pure tests alone does not establish customer-ready access/recovery/attendance.

## Plan-only checkpoint

The source audit was read-only. This document adds no function, contract, migration, role grant, browser behavior or acceptance claim. Database/runtime/network execution was not performed. The current broad verification wrapper remains root-owned; implement this increment only in its next coordinated source/runtime window.
