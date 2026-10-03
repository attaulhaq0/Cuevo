# Document continuity for the teaching MVP

Date:2 October2026. Status: scoped design for implementation; not completed behavior. Company E Deviser, product Cuevo. Governing sources [01](../../product/overview/01-MVP-SCOPE-AND-GATES.md), [04](../../product/domains/04-EVIDENCE-AND-LEARNER-GRAPH.md), [13](../../product/domains/13-LMS-LXP-FUNCTIONAL-SPEC.md), [16](../../product/domains/16-PORTFOLIO-FUNCTIONAL-SPEC.md), [17](../../product/domains/17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md), [39](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [81](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), [83](../../product/overview/83-MVP-EXIT-CRITERIA.md). The [functional](../../product/qa/MVP-FUNCTIONAL-GAP-REVIEW.md) and [expanded](../../product/qa/MVP-EXPANDED-LIFECYCLE-REVIEW.md) reviews establish the gap.

## Required user outcome

Teacher prepares a worksheet/resource for an exact lesson/activity/assessment; learner opens the published source, submits a response with the actual work artifact, and teacher reviews that exact immutable submission revision. Released evidence points to the work. Learner selects work for portfolio; teacher explicitly approves the exact selected revision/artifact set; parent can read only that approved work under current relationship/source authority. Return/resubmission, source correction and sharing revocation retain history and remove invalid future access.

This extends the existing modular monolith and one private asset registry. It does not create another file subsystem, public bucket or broad parent submission/file access.

## Ownership and boundaries

| Owner | Responsibility and intended files |
|---|---|
| Assets API | One staged/finalized byte registry, immutable checksum/path/type/size and server-only storage adapter. Add a narrow `apps/api/src/modules/assets/public.ts` for the documented byte service/validation interface; no cross-domain imports of internal service implementation. |
| School learning API | Course/resource associations and exact submission revision artifact manifests, current domain authority and atomic link commands. Keep command/source SQL in append-only migrations. Resource commands belong with the resource owner rather than academic grade mutation. |
| Portfolio API | Selected source projection and immutable per-revision artifact subset; exact teacher review/current parent pointer. Parent byte delivery belongs to an exact portfolio item/revision/artifact route. |
| Contracts | Browser-safe purpose-specific payload/response schemas, bounded unique artifact IDs and explicit source/unknown states. No storage path/credential in browser responses. |
| Learning UI | Teacher resource preparation, learner exact download and draft/submission/resubmission source selection; teacher source review. |
| Portfolio UI | Actual selected text/artifact and review controls, approved parent source presentation; keep personal locker separate from academic submission intent. |

The current asset API requires portfolio capability and authorizes by asset owner. Course resources and academic submission assets must use their own purpose/context authority; widening that generic owner predicate is insufficient. Server composition supplies the same storage adapter through the documented assets surface. Browser primitives may be shared only where multiple features actually need the same mechanism.

## Data design

1. Preserve `app.private_assets` as the single physical byte registry. Existing records have their current personal learner purpose. New resource/submission assets declare immutable purpose/context at staging through a server-owned command; generated storage keys remain separate from Unicode display filenames.
2. Add immutable school-owned resource revisions with exact course/lesson/activity/assessment association, sequence, available asset ID/checksum and attach/remove/replacement audit. An active pointer identifies published current resources; earlier submission context retains the source it used.
3. Add an immutable submission artifact manifest keyed by school/submission revision and sequence. All IDs must belong to the actor's verified AVAILABLE assets of the permitted academic purpose. The new submission/current pointer, manifest, audit and outbox commit together; upload/readback occurs before the academic transaction.
4. Preserve text submission compatibility with optional bounded attachments, default empty. File-only submissions require an explicit source kind and changes to content constraints/parsers; never fake text such as “file attached” as the authoritative response. Quizzes retain their native answers/source behavior.
5. Portfolio revision stores a frozen selected subset from the evidence-linked submission manifest, plus the actual immutable text response. New reflection/source selection creates an unreviewed revision. Parent approval names the exact revision and manifest; a later unreviewed selection never inherits it.
6. Retiring a linked artifact removes future byte delivery and retains source/manifest history with an explicit unavailable/requires-review status. Do not hard-delete academically linked bytes/history as part of this feature. Production deletion/retention policies require separate approved operations.

## Authorization and delivery

Every protected operation resolves current session, school, entitlement, role, relationship, programme and exact object scope. Asset ownership alone cannot authorize a domain link.

| Purpose | Permitted access |
|---|---|
| Course resource preparation | Current staff who manage the exact course and permitted resource purpose. |
| Published learner resource | Current enrolled learner in the exact published course/programme, permitted scope; staff retains managed-source authority. |
| Academic artifact | Own learner source, or staff managing the exact assessment/submission with its current source policy. Parent cannot use this route. Historical staff review needs a purpose-specific history policy, distinct from permission to mark stale work. |
| Parent selected portfolio artifact | Current exact guardian/child/course/programme authority, underlying source visibility and current approved portfolio revision/manifest; no generic file listing. |

Before fetching bytes, authorize the domain link and AVAILABLE checksum/path. After fetching bytes, re-resolve current session and the same link/source/revision authority, verify checksum/size and reject retirement/revocation before sending an attachment with no-store. Browser delivery also uses existing current-scope cancellation. No durable protected offline caching.

## Document policy and customer states

Keep the current validated TXT/PNG/JPEG/PDF512KiB boundary for the first integration unless an approved measured transfer/scanning design changes it. Disclose limits before upload. Unicode filenames need safe normalization/control/path/header validation and correctly encoded Content-Disposition; internal storage path never depends on the name. Signature/active-content checks are not malware certification. DOCX/OCR/video/transcoding/inline Office viewing are separate features.

Show staging/verification/available/attached/submitted/reviewed/shared/unavailable/requires-review with meaningful filenames and exact task/revision context in English/Arabic. Unconfirmed finalize/link outcomes keep original request keys and cannot show success. A retired source preserves its filename/provenance with a clear unavailable state; no silent disappearance or placeholder work. Failed protected reads clear only their owned drafts; lost session removes protected input/context.

## Acceptance chain

- Visible teacher upload→verify→attach→publish→learner download correct bytes/checksum, then learner upload→draft→submit→teacher exact review→release/evidence.
- Teacher return→learner replacement/resubmission keeps both source manifests and exact return/current pointer. Staged, wrong owner/course/purpose, duplicate IDs, retired source, stale return and peer/tenant bypass reject before academic writes.
- Learner selects actual text/artifact→teacher reviews source and approves exact subset→parent sees that subset→new unreviewed revision remains hidden→revoke denies subsequent and held byte delivery.
- Original-key replay yields singular stage/finalize/link/submission/review/audit/outbox transitions; lost storage/commit receipt reconciles rather than inventing success.
- Wrong teacher assignment, enrollment/programme/guardian withdrawal, source correction and current-policy changes deny appropriately without broadening raw asset grants.
- SQL/RLS/grants, real Auth/API/private Storage, source history, browser English/Arabic390px/desktop/keyboard/axe and recovery checks accompany the feature. Test-created sources are synthetic and never establish official curriculum, malware scanning or real-school rights approval.

## Implementation order

First expose exact approved text work in the current portfolio to close a supported-path omission. Then add course resource staging/association/download, academic artifact staging/manifests/draft/submission and portfolio selected artifact review/delivery. Introduce each slice with its source-backed negative tests and actual user flow. Safe assessment draft/publication must prevent document/configuration races; its separate lifecycle work remains a dependency before full teaching acceptance.
