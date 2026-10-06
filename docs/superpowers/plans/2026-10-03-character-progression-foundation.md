# Character Progression Foundation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans when this queued plan is released. Steps use checkbox syntax. The current QA/profiler/browser-volume checkpoint owns the shared runtime first; this document does not authorize concurrent migration or application work.

**Goal:** Extend current Development recognition with school-approved numbered levels, next-level progress, earned character/cosmetic receipts and own saved permitted presentation, using the existing immutable XP award engine.

**Architecture:** Existing Development API/controllers and private SQL own policy, school-track lineage, source contributions, transitions, grants, correction and selection. The existing Node/Edge worker calls the same source-authorized recognition processor; one transaction records a valid existing XP contribution and its deterministic progression effects before lease acknowledgment. Trail frontend/assets remain design-chat owned and consume published strict contracts.

**Tech Stack:** Current Next.js 16, NestJS/Fastify, PostgreSQL/Supabase, Zod, transactional outbox and bounded Node/Edge worker; no new dependency, service, model or payment integration.

**Spec:** [Character Progression System](../../architecture/character-progression-system.md), [foundation decision](../../decisions/2026-10-03-character-progression-foundation.md), source [15](../../product/domains/15-SOCIAL-COMMUNITY-AND-GAMIFICATION.md), and current [event foundation](../../architecture/scalable-event-processing.md). Design provenance: `fc90804c9787aeffad5a2f35f8aa4fcb2509de84`.

**Status:** Documentation and proposed interfaces only. Levels/tracks/grants/preferences are not implemented. Finish the current source-aware QA/profiler/browser-volume checkpoint, restore the guarded reference school, then have the root owner admit the next coherent implementation unit. No app/SQL/migration/runtime action is part of this document integration.

## Global constraints

- Existing `app.xp_ledger` and `internal.award_recognition_observation` remain the only XP award authority: practice, returned-work revision and reflection from verified recorded sources.
- Source09/12/15/39/58/63/79/80 govern the bounded feature; sources38/43/61/81/82/83 and current API/worker instructions govern contracts, privacy, tests and release.
- No grades, attendance, goals alone, inferred traits/emotion, purchases or unrelated community telemetry produce progression points. No academic normalization, composite child score, global cross-school track or parent private progression access.
- Recognition point policy, progression threshold policy and presentation availability policy are separate immutable approved versions. Existing periods/ledger rows are never repriced; existing tracks are never silently rebound/relevelled.
- Initial school levels, thresholds, stage mapping and cosmetic mappings remain unconfigured. Technical test fixtures use explicitly approved synthetic values; no example becomes a seeded customer default.
- At most one canonical existing ledger contribution per observation across a continuous school-track lineage. Earliest immutable eligible award wins by `awarded_at,id`; selected row/points remain frozen.
- Inclusive activation cutoff uses verified observation UTC `occurred_at`, not award/processing time. No historical import or automatic backfill into a track before the explicit cutoff.
- GET has no award/grant/equip/correction side effects. Unknown/incomplete/disabled values are nullable; complete configured zero is an explicit starter state.
- Only current school administrators approve policies, activate/transition tracks or review earning corrections. Students choose their own eligible presentation. Teachers/coordinators have current selected-learner/class purpose reads only; no staff equip/grant authority.
- Every protected read, command, original-key replay and worker source recheck repeats current school/entitlement/member/relationship/object authority. Hosted synthetic admission and verified TLS remain unchanged.
- Every mutation has strict schema, current expected revision/version, command-scoped idempotency, audit and durable outbox. All new private tables use FORCE RLS and explicit raw-role/Data API denial; migration history stays append-only.
- Valid earned history and current asset availability are independent. Temporary rights/policy/access loss never annuls earning or disables learning. Explicit reviewed invalid-source correction appends provenance and may reduce effective progress without punitive UI.
- Base/quiet/compact/no-character choices preserve equivalent work, help and recognition. English/Arabic human labels, unknown recovery, reduced motion, mobile, keyboard and confirmed-receipt feedback are required.
- No shop/wallet/paid currency/checkout, open-ended student AI, runtime asset generation, new capture event or privileged browser secret. Model/asset generation remains a separate design-tool responsibility.

## Current inspected foundation

`apps/api/src/modules/development/development.controller.ts` exposes GET resources summary/policies/periods/ledger/achievements/leaderboard and POST policies/periods/leaderboard-participation/periods-backfill. `DevelopmentService` verifies capability, strict contracts and key/fingerprint then calls private `development_read`/`development_command` in `Database.actorTransaction`.

`20261001094301_portfolio_recognition_sources.sql` creates immutable approved point policies, class periods, `xp_ledger` unique on school/observation/period, achievements and opt-in aliases. `20261001095314_recognition_actor_class_source_guard.sql` binds observation actor and actual source course class. `process_recognition_event` validates persisted habit source and lease, awards approved periods and requires final acknowledgment. The current streak expansion `20261002073820_bounded_recorded_streak_sources.sql` demonstrates candidate-first source validation, complete bounded scope, current course authority and UTC semantics. Reuse its invariants; do not copy a second award implementation.

Regression entrypoints read: API unit portfolio-development-contract/service; API journey portfolio-recognition-api; SQL090; web Development model tests. Source-locked synthetic-primary manifest/golden cases remain technical fixtures with native zero/missing/version/tenant/parent/immutability cases, not official curriculum or progression defaults.

## Files and ownership

| File or owner | Planned responsibility |
|---|---|
| `packages/contracts/src/character-progression.ts`, existing `src/index.ts` | Strict browser-safe groups below; no filesystem, model, config or authority |
| `apps/api/src/modules/development/progression.controller.ts` | Nested routes under existing Development owner, verified identity, no-store and safe errors |
| `apps/api/src/modules/development/progression.service.ts` | Capability/schema/key/fingerprint parsing and private transactional calls |
| Existing `development.controller.ts` and `apps/api/src/app.ts` | Compose the new same-owner factory once; preserve existing route behavior |
| `supabase/migrations/<CLI-generated-next-version>_character_progression_foundation.sql` | Actual private schema/functions/constraints/grants; allocate version only at execution checkpoint |
| Same-owner follow-up migration if a reviewer separates correction/selection | Additive reviewed work only, no edit to applied function history |
| Existing recognition processor/private dispatcher | Invoke the one progression consumer and complete source atomically; no TS award engine |
| `apps/api/test/unit/character-progression-contract.test.ts`, `character-progression-service.test.ts` | Contract/refusal/idempotency routing |
| `apps/api/test/integration/character-progression-api.test.ts` | Actual current Auth/controller/SQL source flow and deny/replay cases |
| `supabase/tests/<next-free-number>_character_progression.test.sql` | SQL source/dedup/threshold/correction/selection/FORCE RLS/grant tests |
| Design-chat `apps/web/features/development`, `packages/ui`; shared character renderer only when consumed | One Trail implementation, public art and private state clearing; backend publishes schema first |
| Owner READMEs, root/scoped AGENTS, codebase/context/index/registry, ADR/status | Update in the same implementation unit with actual implemented/verified state |

Do not create the planned code files, empty folders, migrations or catalog during this documentation increment.

## Proposed contract groups and exact routes

All paths use the existing verified Bearer session, X-School-Id, no-store response and private API functions. Every POST requires Idempotency-Key. IDs are routing/provenance fields; primary labels use authorized human context. Existing point/period/board routes are preserved.

| Group/schema exports | Route | Current actor/purpose |
|---|---|---|
| `progressionPolicyInputSchema`, `progressionPolicyStatusSchema` | GET/POST `/v1/development/progression/policies` | Admin current school configuration; no student/parent policy edit or staff delegate |
| `presentationPolicyInputSchema`, `presentationPolicyStatusSchema` | GET/POST `/v1/development/presentation/policies` | Admin explicit catalog/year-group/density/effects availability |
| `progressionTrackActivateSchema`, `progressionTrackReceiptSchema` | POST `/v1/development/progression/tracks` | Admin exact current learner/enrollment and approved version; no bulk/historical import |
| `progressionTrackPreviewSchema`, `progressionTrackPreviewResponseSchema` | POST `/v1/development/progression/tracks/:id/preview` | Admin current revision + proposed exact approved policy; deterministic read-only preview, no command ledger mutation |
| `progressionTrackTransitionSchema` | POST `/v1/development/progression/tracks/:id/transition` | Admin exact preview fingerprint/current revision/confirmation; append new binding |
| `learnerProgressionQuerySchema`, `learnerProgressionSchema` | GET `/v1/development/progression` | Student self; admin/teacher/coordinator explicitly selected current learner/class; parent denied |
| `progressionSourceQuerySchema`, `progressionSourcePageSchema` | GET `/v1/development/progression/sources` | Same selected learner purpose; bounded deliberate provenance detail, current accessible sources only |
| `characterCatalogQuerySchema`, `characterCatalogPageSchema` | GET `/v1/development/presentation/catalog` | Current learner context; reviewed published asset metadata and allowed choices, no inferred stage |
| `learnerCosmeticQuerySchema`, `learnerCosmeticPageSchema` | GET `/v1/development/cosmetics` | Student self/current scoped staff selected learner; validity and availability distinct; parent denied |
| `learnerPresentationSchema` | GET `/v1/development/presentation/me` | Student self only, current allowed stored choice/fallback |
| `learnerPresentationSelectionSchema`, `learnerPresentationReceiptSchema` | POST `/v1/development/presentation/me` | Student self; expected preference revision/current exact policy/catalog, compatible base/granted choice |
| `progressionCorrectionPreviewSchema`, `progressionCorrectionPreviewResponseSchema` | POST `/v1/development/progression/corrections/preview` | Admin exact contribution/track and factual invalid-source review; read-only preview |
| `progressionCorrectionSchema`, `progressionCorrectionReceiptSchema` | POST `/v1/development/progression/corrections` | Admin expected track revision/preview fingerprint/confirmed reason; append annulment or exact eligible replacement |
| `progressionCorrectionQuerySchema`, `progressionCorrectionPageSchema` | GET `/v1/development/progression/corrections` | Admin exact selected learner/source review; private review reasons excluded from learner/staff general projection |

POST preview routes use strict bounded request bodies and current authorization but are read-only; they do not reserve a mutation key, audit as a mutation or enqueue grants. Commit routes revalidate preview source/version state rather than trust a submitted fingerprint.

Proposed strict data shapes:

```ts
type LocalizedTitle = { en: string; ar: string };
type LevelRule = {
  number: number; title: LocalizedTitle;
  threshold:
    | { basis: 'OWNED'; minimumPoints: number }
    | { basis: 'RECOGNITION_MILESTONE'; recognitionPolicyId: string; milestoneKey: string };
  rewards: { catalogId: string; catalogVersion: string; variantKey: string }[];
};
type ProgressionPolicyInput = {
  expectedVersion: number; enabled: boolean; effectiveFrom: string;
  levels: LevelRule[]; reason: string; confirmApproval: true;
};
// Do not accept minimumPoints beside a milestone reference: SQL resolves/fixes one threshold owner.
type TrackActivate = {
  learnerId: string; progressionPolicyId: string;
  startsAt: string; expectedRevision: 0; reason: string; confirmActivation: true;
};
type TrackTransition = {
  progressionPolicyId: string; expectedRevision: number;
  previewFingerprint: string; reason: string; confirmTransition: true;
};
type LearnerProgression = {
  learnerId: string; learnerName: string; schoolName: string;
  status: 'READY'|'UNCONFIGURED'|'DISABLED'|'UNOBSERVED'|'PROCESSING'|'REQUIRES_REVIEW';
  basis: 'VERIFIED_RECOGNITION_LEDGER'; coverage: 'COMPLETE'|'REQUIRES_REVIEW';
  asOf: string; track: { id: string; revision: number; policyVersion: number; startsAt: string } | null;
  verifiedPoints: number | null;
  currentLevel: { number: number; title: LocalizedTitle; minimumPoints: number; starter: boolean } | null;
  nextLevel: { number: number; title: LocalizedTitle; minimumPoints: number;
    remainingPoints: number; progress: number } | null;
  transitions: { id: string; levelNumber: number; title: LocalizedTitle; earnedAt: string }[];
  nextCursor: string | null;
};
type PresentationSelection = {
  expectedRevision: number; presentationPolicyId: string; presentationPolicyVersion: number;
  catalogId: string | null; catalogVersion: string | null;
  characterKey: string | null; variantKey: string | null; grantId: string | null;
  density: 'STANDARD'|'COMPACT'; effects: 'SYSTEM'|'QUIET'; confirmSelection: true;
};
// All art fields null means Hide. It remains permitted even when optional art is unavailable.
type CosmeticChoice = {
  id: string; title: LocalizedTitle; catalogVersion: string;
  earning: 'FREE_BASE'|'EARNED'|'REVIEW_REQUIRED'|'ANNULLED';
  availability: 'AVAILABLE'|'POLICY_UNAVAILABLE'|'SOURCE_UNAVAILABLE'|'REQUIRES_REVIEW';
  grantId: string | null; earnedAt: string | null;
};
type ProgressionCorrection = {
  contributionId: string; expectedTrackRevision: number; previewFingerprint: string;
  decision: 'ANNUL'|'REPLACE'; replacementLedgerId: string | null;
  reason: string; confirmCorrection: true;
};
```

Implement Zod strict objects, valid UUID/date/hash shapes, safe nonnegative integer points and paired null fields. Proposed technical envelopes are at most100 ordered unique level rules,20 mappings per level,100 asset variants and25 rows per source/grant/correction page; these are reviewable API safety caps, never school earning defaults. Enabled policy requires nonempty ordered unique numbers and strictly increasing resolved nonnegative thresholds; disabled policy may contain no levels. No starter earned transition/grant is issued from an unobserved zero-threshold rule. Only a complete configured scope can report verified zero. For unknown/disabled/source-incomplete states numeric and level interval fields are null; PROCESSING may report the last confirmed complete state with explicit pending status, never pending points. At maximum level nextLevel is null; below the first threshold currentLevel is null and progress is measured from verified zero to the first configured threshold. Ratio is finite0..1 and remainingPoints is positive when nextLevel exists.

Presentation policy pins published catalog/version, allowed variants, density/effects and exact yearGroupId mappings from existing current school records; use no birthday/ordinal/age rule. Resolve current learner enrollment in SQL. Staff catalog reads require exact selected learner context; an administrator policy read contains metadata only. Public static art is independent from private allowed-choice/grant/preference data.

`presentationPolicyInputSchema` accepts `expectedVersion`, `effectiveFrom`, `catalogs` (exact catalogId/version and allowed variant keys), `yearGroups` (actual yearGroupId and allowed catalog variants/density/effects), `defaultSelection` (an explicitly approved base or Hide), `reason` and `confirmApproval:true`. Keep Hide/quiet available without a catalog. `progressionPolicyStatusSchema` and `presentationPolicyStatusSchema` return nullable current approved policy with readable approval date/name and actual version; absence is not version zero after a failed/partial read. `learnerProgressionQuerySchema` requires a staff-selected learnerId or derives student self; it must reject parent and student peer selection in private SQL even if frontend parsing accepts the UUID.

`progressionTrackPreviewResponseSchema` returns current binding/revision, exact old/new approved rule versions, confirmed effective baseline, consumed-source count, eligibility/coverage and a server-derived source fingerprint. Transition/correction commits re-read these values under the same lock; changing source, correction, policy availability or revision invalidates the preview. Read-only previews never create tracks, command receipts or grants. The latest approved enable/disable gate controls new contributions/projections independently of the pinned rule version: disabling progression pauses/nulls it without rewriting old rules, contributions or earning. Re-enabling does not silently bind a newer threshold version.

## Private schema, authority and source algorithm

Proposed private tables, all school-qualified and with explicit foreign keys: `progression_policies`, `progression_policy_levels`, `presentation_policy_versions`, `progression_track_lineages`, `progression_track_bindings`, `progression_contributions`, `progression_transitions`, `cosmetic_grants`, `progression_corrections`, `learner_presentation_revisions`, `learner_presentation_current` and `progression_current`. Only current projection/pointer tables can change through their owning functions; immutable history tables reject update/delete/truncate. `character_catalog_versions` holds reviewed source-controlled metadata/provenance; publish catalog bytes only after design owner delivers a reviewed canonical manifest and rights/static compatibility evidence. Do not create a browser catalog-publish endpoint or assume Website generation grants publication rights.

Core uniqueness/lock requirements:

```sql
-- Shape to encode in the new migration, not SQL applied by this plan:
unique (school_id, lineage_id, observation_id)         -- canonical contribution across tracks/periods
unique (school_id, track_binding_id, level_number)     -- earned threshold transition once
unique (school_id, learner_id, earning_source_id, catalog_version_id, variant_key)
unique (school_id, learner_id, revision)               -- saved presentation history
-- One active binding per lineage and one current pointer per school/learner.
-- Lock ordering: school policy/current school maintenance → lineage/track → contribution → choice.
```

An annulled observation remains consumed; replay or policy transition cannot re-earn it. Exact replacement points/source must be validated and stored in the correction receipt, cannot be arbitrary admin point entry, and cannot violate another observation's consumed set. Existing XP row is never changed. Corrections mark dependent eligibility review-required and record the exact reviewed dependent transition/grant decisions; unaffected grants remain valid. Neutral effective progress may decrease only from this append-only invalid-source decision.

Planned private public-to-API functions:

```text
internal.progression_policy_command(name,payload,key,fingerprint,request_id) → receipt
internal.progression_track_preview(track_id,payload) → preview
internal.progression_track_command(name,track_id,payload,key,fingerprint,request_id) → receipt
internal.progression_read(resource,filters) → projection/page
internal.presentation_command(payload,key,fingerprint,request_id) → receipt
internal.progression_correction_preview(payload) → preview
internal.progression_correction_command(payload,key,fingerprint,request_id) → receipt
internal.record_progression_observation(school,observation,source_event) → deterministic result
```

Only `cuevo_api` receives reviewed API command/read/preview functions. The raw contribution helper is owner/private-only and is invoked by existing worker processor or the explicitly authorized same-domain backfill path after their source checks. `cuevo_worker` retains only existing constrained process functions; no raw new table/helper/grade/policy/grant authority. Revoke PUBLIC/anon/authenticated/service_role/API/worker table and internal-helper grants explicitly; preserve private provider-owned transport protections.

Processing sequence inside current recognition transaction:

```text
lock claimed habit.observed event; verify version1, exact observation actor/type/entity/current lease
validate canonical persisted completion or returned submission revision + original processed source
evaluate current school recognition approval/entitlement/student/enrollment and approved award period
run the existing award helper for eligible period(s), without changing award values or old rows
lock current school learner lineage/binding
require enabled pinned track + observation.UTC occurred_at >= startsAt + complete source eligibility
choose existing eligible XP row ordered awarded_at,id; validate exact policy/kind/points/source
insert canonical lineage contribution ON CONFLICT DO NOTHING; freeze row and points
derive effective confirmed total; record each newly crossed positive earned level once
create only mapped reviewed compatible catalog grants from actual earned transitions/milestones
persist effective current state + audit + minimized development.updated outbox in this transaction
acknowledge the original lease; failed final ACK rolls back contributions/transitions/grants
```

Only a new recorded contribution, transition/grant, correction or presentation/policy binding creates its deduplicated audit/outbox effect. A repeated consumed observation returns the existing deterministic receipt and performs no new award, transition, grant or notification enqueue. A zero-point source can be recorded once as an observed eligible contribution but cannot create a zero-threshold earned transition or cosmetic grant.

If no eligible XP award exists, no progression contribution is invented. Existing admin recognition backfill invokes the same consumer for observations after the pinned activation cutoff; it does not import earlier history. Track activation/transition queues bounded source work for existing eligible post-cutoff ledger observations rather than mutating during GET. Use the existing outbox to hold this durable work; at most1000 candidates per explicit operation, with source overflow a reviewed refusal and no partial “complete” claim. No bulk migration or unrestricted historical import API is included. Preserve source complete/unknown semantics across currently unavailable former-class records without disclosing them to staff. An unavailable source is review/unknown, not automatic annulment.

## Event schema, completion and recovery

Reuse `habit.observed` envelope version1 and exact observation entity; add the deterministic progression consumer before its existing lease ACK. `development.updated` version1 remains a derived-notification event with no XP amounts, title, answers, private note or secret in metadata. When activation/transition requires source catch-up, add only `development.progression_requested` version1 with entity_type `progression_track`, exact binding entity ID and empty metadata; its source row contains the approved cutoff/policy/revision. Dedup key derives from school/learner/binding command receipt, never from a wake. No new analytical event/remote capture is enabled.

The new request processor validates stored command/binding/current approval/eligibility, claims only the bounded candidate envelope, calls the same contribution consumer, records complete/requires-review receipt and acknowledges atomically. Unknown event versions fail closed to existing review/retry semantics; old v1 habit/development events remain compatible. A policy-disabled source acknowledges a truthful disabled state without award; invalid source/capacity/lease failure cannot create an earned receipt.

Use current5second statement,30second event lease,10-event/20second bounded Edge processing and15second reserve without relaxation. No per-event model/provider cost, no per-click new invocation, no immediate level latency promise. Existing coalesced post-commit wake and due/abandoned recovery remain the only executor; no second task ledger, periodic whole-school recompute or independently scheduling TS worker. Alert/review through existing sanitized failures and explicit source catch-up state. Temporary pending UI polls only its existing authorized query/refetch pattern.

## Task 1: Publish contracts and current-scope API surfaces

- [ ] After root releases the checkpoint, re-read changed Development/SQL/source documents and current branch; preserve all concurrent source.
- [ ] Create strict contract schemas/export and failing contract cases for unexpected learner/points/grade authority, invalid ordered thresholds, duplicate numbers/mappings, milestone threshold dual ownership, null/zero/status inconsistency, maximum-level null interval and paired presentation/grant identities.
- [ ] Use explicit synthetic policy numbers only in tests:

```ts
const levels = [
  { number: 1, title: { en: 'Start', ar: 'البداية' },
    threshold: { basis: 'OWNED', minimumPoints: 0 }, rewards: [] },
  { number: 2, title: { en: 'Practice chapter', ar: 'مرحلة الممارسة' },
    threshold: { basis: 'OWNED', minimumPoints: 10 }, rewards: [] },
  { number: 3, title: { en: 'Next chapter', ar: 'المرحلة التالية' },
    threshold: { basis: 'OWNED', minimumPoints: 30 }, rewards: [] },
]; // Authorized synthetic fixture; never installed as school defaults.
expect(progressionPolicyInputSchema.safeParse({
  expectedVersion: 0, enabled: true, effectiveFrom: '2026-10-03T00:00:00Z',
  levels, reason: 'Synthetic school review', confirmApproval: true,
}).success).toBe(true);
expect(progressionPolicyInputSchema.safeParse({
  expectedVersion: 0, enabled: true, effectiveFrom: '2026-10-03T00:00:00Z',
  levels: [levels[1], levels[0]], reason: 'Synthetic review', confirmApproval: true,
}).success).toBe(false);
```

- [ ] Run `node node_modules/vitest/vitest.mjs run apps/api/test/unit/character-progression-contract.test.ts`; prove cases fail before schemas and pass after strict validation.
- [ ] Implement controller/service proposal routes with explicit role sets, actorTransaction, no-store, safe unavailable/conflict errors and command-scoped key fingerprints. Verify parent/staff equip/admin policy denial before DB callback; missing receipt stays unavailable with original request retry.
- [ ] Add same-owner composition once, update owner README/map/API scoped rules/export discovery. Run existing portfolio-development unit regressions plus architecture/typecheck/lint.
- [ ] Review published contract with design owner before frontend consumes it; do not enable empty route/data placeholders as a feature.

## Task 2: Implement private policy, track and deterministic contribution authority

- [ ] Allocate an actual new CLI migration version at the execution checkpoint; add failing SQL tests using real restricted roles and rollback synthetic context.
- [ ] Implement immutable policy/level/track/contribution/transition/current tables with school-qualified constraints, source foreign keys, exact lineage uniqueness and fixed lock order.
- [ ] Implement policy approval and readback, track activation/preview/transition and current/provenance reads; no silent current-policy rebind, no read mutation, no historical import.
- [ ] Extend existing recognition processor before ACK and reviewed backfill path with one private contribution consumer; add the one bounded durable catch-up event when needed. Verify rollback of contribution/grant when ACK expires.
- [ ] Run targeted SQL through the existing guarded database test owner, not a source-only unit assertion. Confirm below/exact threshold10, multiple threshold crossing30, starter zero, highest null next, source cutoff equality, delayed pre-cutoff exclusion, zero-point approved contribution, disabled/unconfigured/incomplete and overflow outcomes.
- [ ] Test duplicate/concurrent/backfill/track-transition observation across periods chooses earliest immutable eligible XP row exactly once; later point policy/award cannot reprice it. Fingerprint original XP/period/achievement bytes before and after transition/reset.
- [ ] Test wrong actor/tenant/current class/source timestamp/version, stale lease, private helper grants and new FORCE RLS/raw Data API denials. Review migrations before owner execution; no application test auto-escalates.
- [ ] Run existing SQL090/streak and native numeric/rubric/parent publication regressions, required architecture/docs/repository guards and meaningful API/worker tests before marking this unit ready.

## Task 3: Implement reviewed asset availability, own selection and append-only correction

- [ ] Obtain the design owner's canonical reviewed catalog manifest: exact asset/version names in English/Arabic, finite compatible character/pose/variant anchors, dimensions, static/reduced-motion art, rights/provenance and published availability. Missing catalog stays unconfigured; do not generate or invent art during backend work.
- [ ] Add failing SQL/API cases separating FREE_BASE/EARNED validity from policy/source availability, unearned equip denial, incompatible costume/evolution, withdrawn asset, actual yearGroupId mapping, Hide fallback and no effect on learning/help/grade.
- [ ] Implement presentation policy, immutable earned grants from mapped earned receipts, current catalog/choice reads and own expected-revision selection history/current pointer. Two concurrent devices: one receipt wins, the stale expected revision conflicts; original-key replay reauthorizes current actor/policy/grant before returning.
- [ ] Implement read-only correction preview and admin confirmed append-only annul/replacement. Validate exact contribution/eligible replacement, preserve original XP/history, reduce only effective corrected total, mark affected eligibility review-required, preserve unrelated valid grants. Policy/rights loss must leave earning valid.
- [ ] Test correction races against processing/equip, changed preview/current policy, stale binding/source and unauthorized teacher/coordinator/parent correction. A denied mutation leaves audit/outbox/source counts unchanged except explicit sanitized denied-operation audit where current policy records it.
- [ ] Verify source/privacy pages expose no former-school/class/private correction notes, no raw asset local path or credentials; exact selected authorized human context and bounded pagination remain required.

## Task 4: Connected API/worker acceptance and Trail handoff

- [ ] Author real API journey using current verified synthetic Auth and isolated tenant: administrator enables policies, activates learner track, teacher publishes actual practice, student completes, bounded worker processes, learner sees confirmed points/level/grant, equips allowed art and second device reads it.
- [ ] Assert source save succeeds independently of worker pending; no optimistic XP/grant, repeated GET/refresh cannot mutate or replay celebrations, duplicate process/retry/backfill cannot earn twice. Simulate worker crash/lease expiry/catch-up recovery and current revocation before replay/equip.
- [ ] Run `node --env-file=.env.local --import tsx scripts/test-integration.ts` through root's guarded serialized verification window; required case must execute, not skip. No live model or remote analytics activation.
- [ ] Publish strict schemas/route examples and explicit implemented/verified status to design owner. Design owner implements the one Trail Development experience using existing session/query/form mechanisms; root coordinates shared browser acceptance.
- [ ] Browser cases cover English/Arabic mobile,320/390/768/desktop, keyboard/axe/reflow/reduced-motion/quiet/Hide, actual source reason, two-device conflict, delayed old-actor response, unavailable asset and neutral reviewed correction. Staff reads/admin approvals and parent exclusion remain tested.
- [ ] Complete required architecture/docs/repository checks, relevant typecheck/lint/unit/API/SQL/grant/worker/recovery/build/browser checks. Restore guarded reference data after tests; do not leak test titles into demonstration.
- [ ] Update ADR/status/source15 registry only for actual accepted changes. Report backend contracts, catalog assets, frontend integration, local verification and hosted/customer readiness separately; passing local synthetic flow does not certify official curriculum, real pupils or production scale.

## Acceptance matrix and release blockers

| Case | Required outcome |
|---|---|
| Approved points5 then later policy9, same old observation/period | Old XP5 unchanged; lineage selects original5 once; new eligible observations use their pinned award policy |
| Observation at cutoff versus delayed observation before cutoff | Equality admitted; earlier occurrence excluded despite later award/backfill |
| Two eligible period rows for one observation, transition/new binding/backfill | Earliest valid awarded-at/id canonical row remains frozen; no duplicate contribution/grant |
| Zero/unobserved/unknown | Complete configured zero may show starter; zero never earned achievement; unknown/incomplete numeric fields null |
| Below/exact/multiple/highest threshold | Deterministic ordered interval, each actual earned crossing once, top next null |
| School recognition disabled versus asset policy withdrawn | New earning disabled/null; valid history remains; availability/fallback separate |
| Period end, new policy, school change | Track version/history stable until confirmed transition; no automatic cross-school grant |
| Invalid earning correction versus temporary access loss | Append reviewed correction only for invalid earning; no XP delete/reprice; temporary loss does not annul |
| Wrong tenant/learner/class/year-group, parent, staff equip, stale revision/key | Denied/current conflict; no private projection or authority bypass |
| Catch-up overflow/unknown source/version/expired lease | Explicit review/retry/no partial complete; atomic rollback prevents false transition |
| Catalog absent/rights unclear | Unconfigured/source unavailable; no invented school defaults, grant or model call |
| Current QA checkpoint or frozen source run active | Queue work; no concurrent migration/runtime/source mutation by this plan |

No threshold/costume default is pending invention. The remaining prerequisites are operational checkpoint release, actual reviewed catalog bytes/rights, implementation and connected acceptance evidence. The founder scope is already authorized; additional unrequested commerce, bulk historic migration or general AI requires its own future design rather than extending this plan silently.
