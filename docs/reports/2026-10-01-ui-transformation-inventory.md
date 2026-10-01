# Cuevo UI transformation: baseline source inventory

Date: 1 October 2026. E Deviser is the company; Cuevo is the product.

Evidence baseline: `946cca0d9d31a128a950c64ddeb4507d72806ab2` in the isolated `C:\Users\hp\.codex\worktrees\cuevo-design-system\Cuevo` worktree. This discovery read repository specifications, feature/API sources, tests and locked synthetic artifacts. It did not start servers, use the database, capture screenshots or conduct a rendered visual audit. Existing verification reports are historical evidence for their recorded source, not verification of the proposed redesign.

The brief requests a spatial command home, global header, Ctrl+K command menu and contextual navigation without a permanent sidebar, with cyan branding, light/dark themes and all five roles in English/Arabic on mobile and desktop. Sources 36/79 support the hierarchy next action → reason → evidence/context → optional deeper analysis. The redesign must use shared semantic tokens, avoid unsupported metrics and preserve domain authority.

## Current navigation and capabilities

The [shell](../../apps/web/features/shell/components/workspace.tsx) owns twelve local views: Home/overview, School, Community, Portfolio, Development, Curriculum, Learning, Academic, Progress, Next steps, Access details and Account. Features own their contextual tabs and forms. These are local workspace states, not twelve independent Next routes. [Role home](../../apps/web/features/home/README.md) derives bounded current action queues from existing protected APIs.

| Role | Supported destinations and actions when entitled |
|---|---|
| Admin | All destinations. Configure current-school structure, existing verified people and relationship windows, calendar/timetable/report periods, attendance and approved policy. Author/publish learning; configure School Custom references/rubrics; mark/release/correct results; review/approve support and measure compatible follow-up. Configure recognition and permissioned community moderation. |
| Coordinator | All staff destinations, with School and learning authoring/marking read-only. Configure curriculum contexts/programmes/assignments and approve draft School Custom academic references. Review current class/learner evidence, proposals, support and outcomes; no teacher/admin intervention decision or raw submission access. |
| Teacher | All staff destinations. School setup/daily context and assigned-class attendance; no School people/policy tabs. Author learning/assessment/quiz, return/close submissions, mark/release results, run/review Teacher Insight, approve/reject support, link follow-up and measure outcomes. Create/moderate assigned community rooms/groups and review/share exact portfolio revisions. Curriculum read-only; academic reference approval belongs to coordinator/admin. |
| Student | Home, School daily context, Community, Portfolio, Development, Learning, Academic released results, Progress, Next steps, Access and Account. Learn/submit/revise own available published work; complete approved support; select released work and reflect; manage own private files; review recorded actions and opt into an approved alias board. No staff directory/curriculum/marking/proposal controls. |
| Parent/guardian | Home, approved School daily context, approved Community announcements/notifications, approved Portfolio, permitted child Learning, approved Academic results, approved child Progress, Access and Account. No Development, Curriculum, Next steps, raw submissions, rooms, habit/signal/proposal/support/outcome internals, portfolio history/edit or private assets. Current guardian and enrollment/course scope govern every read. |

| Workspace | Existing contextual navigation |
|---|---|
| School | Setup/daily for staff; people/policies additionally admin/coordinator. Student/parent daily only. Admin alone manages setup/access/policy; attendance admin/assigned teacher. |
| Learning | Courses/assessments; submissions only admin/teacher/student. Course detail owns units/lessons/activities and existing author controls. |
| Academic | Staff references/rubrics; teacher/admin marking; all permitted roles released results. |
| Curriculum | Staff versions/references/programmes/jurisdiction and quality overlays; teacher read-only. |
| Community | Rooms/announcements/notifications; parent announcements/notifications only. Room detail provides roster/discussion/reporting and permitted moderation. |
| Next steps | Staff proposals/interventions/outcomes; student interventions/outcomes. Coordinator review-only; student own approved practice completion. |
| Progress | Staff current-class page plus selected learner; student self; parent selected approved child. Portfolio/Development/Account/Access use existing sections. |

Navigation hiding is not authorization. The new catalog should use actual required capabilities: School `school.operations`; Community `community`; Portfolio `portfolio`; Development/Progress `learner.state`; Curriculum `curriculum` plus staff role; Learning `learning` with assessment operations additionally `assessment`; Academic `assessment` and `curriculum`; Next steps `improvement` plus non-parent role. Backend authorization remains authoritative.

Baseline source inspection found shell gates that do not match their API requirements: Progress and Next steps are exposed using `learning`; Academic uses only `assessment`. Several home shortcuts are unconditional for the role. Treat these as source-level implementation observations to address in navigation metadata; no rendered failure was observed in this discovery.

## Brief scope and command behavior

| Brief item | Current basis and implementation limit |
|---|---|
| Spatial home/header/context navigation | Frontend redesign can reuse current queues, released feedback, calendar, announcements and role shortcuts. Counts describe fetched records/pages, never school-wide totals. Exact tab/form commands need explicit public feature destination/action contracts; opening a default tab alone may not satisfy the command label. |
| Cyan and light/dark | New frontend tokens/theme mechanism. Current [tokens](../../packages/ui/src/tokens.css) are green/light-only. Verify complete palettes and all native result/status/form/focus states. |
| Search | No global full-text/person/object search endpoint. Initial Ctrl+K can search localized role/capability-filtered actions and destinations. Filtering already fetched authorized records needs a visible current-page limitation. |
| Notifications/messages | Community provides approved announcement notifications/read receipts and controlled class/group discussion. No universal assignment/grade/support inbox, direct-message UI/API, push/email delivery product or parent/staff inbox. School policy UI writes `studentMessagingEnabled:false`. |
| Reports | Selected-learner fresh native result HTML export exists, with `CURRENT_RELEASED_PAGE` and `NOT_ESTABLISHED` coverage; staff class evidence page exists. No official transcript, full coverage report, inferred overall percentage or general report builder. |
| Settings/school switching | Account is read-only with contact-admin recovery. Actual School/Curriculum/Development/attention controls exist. No general profile/preferences product; multiple school memberships explicitly require an unavailable school-selection workflow. |
| Audit/automation/AI governance | Domain audit/outbox/worker and governed Teacher Insight exist. Independent customer audit browser, generic automation builder and governance workspace are absent. Full school quality/CQI/accreditation and finance/HR remain post-MVP. |

Safe commands navigate to permitted workspaces or open existing review/forms: continue learning, revise returned work, review marking, record attendance, review programme/class evidence, read approved feedback/announcements, select meaningful work, review recorded actions and approved support. Shared commands may return Home, open Account/Access, refresh access, change language/theme and sign out.

Consequential commands open current object-aware review/forms. Menu selection must not directly release a grade, approve support, change access, share a portfolio revision, moderate a person or approve policy. Preserve source versions, explicit unchecked confirmations/reasons and original-key uncertain retries.

`/v1/people` is a bounded learning-purpose list of `userId`, `displayName`, `role`; RLS permits same-school admin/coordinator, assigned active teacher learners, parent current children and student self. `/v1/school/people` is the admin/coordinator school configuration directory. Neither is a broad learner profile/search endpoint. Progress already declares its first 100 authorized people selector; class evidence bounds 100 learners plus a sentinel and up to 10 native records per learner. A full search needs an authorized, purpose-limited, schema-validated and paginated backend contract with revocation/tenant/relationship tests. Do not crawl every collection to manufacture a global index.

Clear protected command query/results/recent-object state when access changes, sign-out, offline presentation or failed membership validation occurs. Keep memory-only sessions and disabled protected offline caching. “No match in current permitted records” cannot mean “No learner exists.”

## Invariants, identity and unknown states

- Use authorized person/course/assessment/objective names, class/year, dates and meaningful status/revision context as primary labels. Keep UUID/hash/enum/source/run/fixture identifiers in explicitly opened provenance/support detail. Duplicate names need real authorized context; missing context needs a localized unavailable state and recovery, never an invented suffix or fact.
- Distinguish loading, empty, partial, denied, expired, unavailable, offline, unknown and stale. Missing is not zero; incomplete is not absent; stale is not current. Revalidate membership before restoring protected content.
- Preserve native numeric and complete rubric criterion results, including actual numeric zero. Rubric has no fabricated maximum/normalization. Reports preserve explicit unknown coverage.
- Separate academic evidence, practice/revision/reflection, recognition and attendance. No child-quality/intelligence/effort/character score, psychological inference or punitive ranking. Measured change retains compatible baseline/follow-up/source/time/threshold and never claims causation.
- AI proposals retain origin, synthetic/live mode, evidence, interpretation, uncertainty and human approval. Detailed Teacher Insight context is current authorized teacher/admin-only; absent legacy context is unknown. AI cannot mutate authoritative grades, permissions, curriculum mappings or claims.
- Parent sharing is exact reviewed revision plus current relationship/source access; a new reflection never inherits approval. Student community remains school/class/group-scoped, moderated, private and auditable.
- All copy uses EN/AR keys; logical CSS, bidi-safe human content, Arabic typography and meaningful icon direction are required.

Locked artifacts: [synthetic-primary-v1](../../supabase/seed/curriculum/synthetic-primary-v1/README.md) and [synthetic-pathway-v1](../../supabase/seed/curriculum/synthetic-pathway-v1/README.md), both `synthetic-1`, School Custom numeric/rubric, no normalization. Their manifests pin exact bytes; golden cases cover zero/missing, complete rubric, version mismatch, tenant denial, parent approval and immutable history. `unknowns.json` keeps customer/production readiness false. The alternate pathway is qualification-shaped synthetic data, not Cambridge content. [official-contexts.json](../../supabase/seed/curriculum/official-contexts.json) retains England selected subject/Cambridge 0580/Qatar as requires-review with unknown rights. Source 77 A–G are technical scenario identifiers, never learner traits or customer labels.

## Governing sources and verification

Numbered identities/current paths resolve through [registry](../product/registry.json), source-pack version `FINAL-2026-10-01`, and [context map](../product/context-map.md). Read root entrypoints, [codebase map](../codebase-map.md), [binding layout](../architecture/repository-layout.md), [web instructions](../../apps/web/AGENTS.md) and affected feature README before implementation.

| Source bundle | Exact IDs and representative current paths |
|---|---|
| Foundation/scope | 00/01/03/54/83 in `docs/product/overview`; 02/68 in `docs/product/platform`; 87 `docs/product/delivery/87-IMPLEMENTATION-ORDER-FINAL.md`. |
| Design | [36](../product/design/36-DESIGN-CONSTITUTION.md), [37](../product/design/37-UI-SCREEN-INVENTORY.md), [62](../product/design/62-FRONTEND-ARCHITECTURE.md), [63](../product/design/63-ACCESSIBILITY-RTL-I18N.md), [79](../product/design/79-UI-UX-MOTION-AND-INTERACTION-SYSTEM.md). |
| Roles/domain | 04/07/08/09/10/11/12/13/14/15/16/17/18/19/21/58/80 in `docs/product/domains`: evidence/state/development/intelligence/learning/school/assessment/reporting/community/portfolio/closed improvement. |
| Contract/privacy/security | [38](../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md), [39](../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [61](../product/verification/61-SECURITY-THREAT-TEST-MATRIX.md), [81](../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md). |
| Fixtures/verification | 34/43/64/77/78 in `docs/product/verification`: curriculum golden cases, testing, demo, synthetic reference school and AI harness. |
| Curriculum/claims | 05/06/26/50/69/76/85 in `docs/product/curriculum`; pending artifact references point to 66/70/74. Dossiers/technical fixtures do not grant official or customer acceptance. |

Existing browser coverage includes [role home](../../tests/e2e/role-home.spec.ts), [all-role accessibility](../../tests/e2e/role-accessibility.spec.ts), [foundation](../../tests/e2e/foundation.spec.ts), School operations/learning/lifecycle, academic numeric/rubric truth/report, learner state/attention/class summary, improvement, community safety and portfolio/recognition. Feature tests live beside owners; real API/SQL scope-denial remains separate from presentation fault injection.

Redesign acceptance should retain every permitted workspace/tab/action; test command filtering and precise destinations; Ctrl+K/visible mobile trigger, Arrow/Enter/Escape, modal focus containment/return and destination heading focus; EN/AR RTL in both themes at 1440×900, 1280×800, 1024×768, 768×1024, 390×844 plus feasible 320px and 200% reflow; touch targets, focus/contrast/non-color statuses, reduced motion, labels/landmarks and axe. Include duplicate/missing names, pagination/unknown/stale/denied/offline, fresh native export and protected-menu clearing. Adapt navigation locators without dropping domain coverage.

Implementation must run architecture/repository guards for structural changes, docs guards for authored documentation changes and applicable typecheck/lint/build/Storybook/web/browser checks. These do not replace domain/security acceptance or establish official/live/customer/production readiness.

Report validation: `npm run check:docs` passed for all 89 unique product sources/current links; `npm run test:docs` passed all 6 cases. No runtime/product tests were executed for this source-only discovery.

## Pending rendered audit and reconciliation

Before declaring visual findings, inspect browser/tool availability, render the current authorized roles, capture screenshots and assess representative surfaces in EN/AR/mobile/theme context. No absent screenshot/render defect is confirmed by this inventory. Concept/image generation and deployment choices remain pending in the parent task; this report does not claim a selected design.

The other active chat is changing customer-readiness work in `G:\Cuevo`. Do not operate its runtime, reset its database or overwrite its authored changes. Before integration, compare this isolated baseline with current root changes and reconcile affected feature/API contracts, customer-language/provenance rules, source paths, tests and synthetic demonstration restoration requirements. Preserve both coherent changes; do not replace root wholesale with this worktree. The parent task will link this report from the docs index.
