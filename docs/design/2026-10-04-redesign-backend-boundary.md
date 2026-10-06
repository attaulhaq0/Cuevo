# Trail redesign: backend scope and verified limits

4 October 2026. This is an implementation scope record, not a replacement product specification. The founder asked whether the redesign changes backend behavior or departs from the MVP documents. Sources01/04/10/12/15/17/18/21/39/63/81 and the approved role compositions remain authoritative.

## What this redesign changes

Existing feature owners compose current work, source context and the next permitted action through the one Trail design system. Navigation, reading order, responsive density, human labels, selected-record views, current-source validation and original-command recovery change. The frontend continues to use the existing authenticated API and private source readers. No second application, independent grade engine, message engine, calendar store or reward ledger is introduced.

Examples: Teacher marking retains submitted work, native numeric/rubric values, review/release/correction and separate Parent publication. Parent Home/Portfolio/report/conversation/calendar retain current child, relationship and publication authority. Coordinator review remains limited to its current permitted source/actions. Empty, unknown, partial, denied and unverified remain distinct.

## Actual backend-source changes and their purpose

It would be inaccurate to describe the complete design branch history as frontend-only. The earlier `2abe927` checkpoint selectively reconciled stable canonical backend commits `da45359` and `fe04cab`; it did not copy the backend chat's mutable working tree.

| Change | Purpose | Behavior and verification limit |
|---|---|---|
| Strict optional outcome display contract, outcomes GET and authorized learner-state projection | Show the current permitted learner/course/class/year and immutable practice/assessment context beside a measured outcome | Native numeric/rubric measurement, POST measure and original-key receipt semantics stay with their existing owners. Missing or ambiguous labels remain review/unavailable. |
| Private read helpers in three canonical append-only migration sources | Authorize the display context and compose it through the existing protected read projection | Imported source bytes match the backend's committed files. This chat did not apply them or reset the shared database. Read-only metadata and isolated real API tests corroborated current helpers/grants; clean replay and complete frozen all-role acceptance remain separate. |
| Exact retained-baseline candidate in the existing intervention-history function | Avoid an expensive repeated source scan | This is a backend query implementation change. Frozen original-predicate parity cases checked numeric/rubric/current/revoked/retained/null behavior. It is intended to preserve the same read authority, not create a new permission. |
| Shared page/list parser invokes each owner parser with only its source item | Prevent array index/page contents being mistaken for explicit source context | No new endpoint or domain rule. Owner parsers retain learner/source checks. |
| Two positive School integration-fixture setups in `e1828f5` | Give isolated test classes/people distinguishable school-authored names so existing selection guards admit the positive journey | Shared duplicate fixtures, denial cases, API and SQL were unchanged. Original duplicate cases returned409; corrected positive fixtures passed8/8 in rollback tenants. |

The three imported migration sources are `20261003043730_human_outcome_read_context.sql`, `20261003045152_outcome_context_authorized_projection.sql` and `20261003045559_intervention_history_exact_candidate.sql`. Their implementation history is recorded in the [human outcome context plan](../superpowers/plans/2026-10-03-human-outcome-context.md). That plan contains historical canonical-backend application evidence; it must not be attributed to this chat as a new database application.

After Teacher checkpoint `4a78948`, the saved Teacher/Parent continuation through `e1828f5` changed frontend owners, tests and documentation. Runtime API, worker, domain/contracts and migration sources were unchanged by that continuation, apart from the two explicitly identified API test files.

## MVP alignment and separate approved extension

The redesign preserves the MVP learning-improvement loop and the current role/security rules. It does not add a full CQI/quality/accreditation workspace, official curriculum claims, payroll/admissions, unrestricted student chat, autonomous AI grading, model marketplace, shop/payments or invented report/analytics metrics from an image. A reference does not establish backend capability or permission.

Existing XP, streaks and achievements are part of the MVP documentation. Numbered levels, growing companions and earned costumes are a separate founder-authorized extension recorded in the [Character Progression System](../architecture/character-progression-system.md) and its [queued implementation plan](../superpowers/plans/2026-10-03-character-progression-foundation.md). At this checkpoint they are documented, not implemented. They must extend the existing Development authority in a separately reviewed unit; visual artwork cannot grant rewards or imply those mechanics are live. Runtime image/video generation and unrestricted Student AI are not added by this role redesign.

## Runtime isolation and acceptance

Design work lives in `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`. The separate backend chat owns `G:/Cuevo`. This chat has not reset its database, rotated credentials, stopped its services or edited its mutable source. The connected preview serves the design frontend through53121/upstream53120 and a dedicated API53122 using the existing local backend runtime. A connected preview is not evidence that all source differences have been merged or every feature is accepted.

Teacher and Parent have saved scoped implementation/browser evidence. The Parent checkpoint includes current source denial, native/publication/report/file/communication cases and isolated actual Auth/API/database/Storage verification. Coordinator and Admin work remains in progress, and Student lower-panel/progression/full asset-kit acceptance is still outstanding. This record does not certify Gate5, official curriculum, hosted production, customer/legal or complete all-role acceptance.

For every remaining change, keep a current capability/source map, preserve API payload/receipt/revision ownership, run role/source/deny/original-key tests and show unknown when a required contract is absent. A backend gap requires a specific source-backed proposal; it must not be silently filled with a new frontend fact or an expanded endpoint.
