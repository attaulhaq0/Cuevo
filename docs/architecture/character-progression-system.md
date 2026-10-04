# Character Progression System

Date: 3 October 2026, Asia/Riyadh. Company: E Deviser. Product: Cuevo. Status: founder-authorized foundation to implement; current XP/achievements/streaks exist, while the levels, durable progression/cosmetic grants and saved presentation contracts below are not yet implemented. Paid shop/payment functionality remains future scope.

## Purpose and scope

Create one modular school-controlled progression foundation for the Student Trail journey. Extend existing Development ownership and immutable recognition sources; do not create a second XP engine, currency wallet, duplicate learner profile, separate junior application or new runtime service. Recognition, numbered progress levels, character appearance and academic attainment are different concepts. A character is an optional product guide, not a personality classification or a psychological assessment.

The founder authorized numbered XP levels/next-level progress, character growth, earned cosmetic unlock foundation, school-specific point values, a modular architecture, documentation/AGENTS updates and a coordinated request to the active backend chat. The existing [MVP gates](../product/overview/01-MVP-SCOPE-AND-GATES.md) and [recognition specification](../product/domains/15-SOCIAL-COMMUNITY-AND-GAMIFICATION.md) remain authoritative. This adds a bounded progression/presentation foundation, not a full reward marketplace. The approved [student experience strategy](../superpowers/specs/2026-10-03-student-companion-growth.md) remains the provenance for Trail visual intent; the current-checkout [backend implementation plan](../superpowers/plans/2026-10-03-character-progression-foundation.md) defines the queued backend contract and acceptance work. Final Trail assets/UI remain owned by the design chat.

## Source of truth and ownership

| Owner | Responsibility |
|---|---|
| `apps/api/src/modules/development` | School policy/track authorization, source-backed progression calculation, earned grants and presentation selections. Extend the existing controller/service public surface. |
| `packages/contracts` | Strict browser-safe progression/presentation request and response schemas. Export through existing `@cuevo/contracts` surfaces. |
| `supabase/migrations` | Append-only private policy, track, projection/grant/preference sources and authorized functions. No raw Data API/runtime grants. |
| Existing worker domain processor | Constrained source-authorized recognition/progression processing, idempotent transitions, audit/outbox and recovery. No provider/model call. |
| `apps/web/features/development` | Policy/progress/grant/presentation read and confirmed selection workflows; never computes authoritative levels or grants from frontend totals. |
| `apps/web/shared/characters` when consumed | One decorative registry/renderer for permitted character/pose/costume state. No feature imports, API policy or reward calculation. |
| `packages/ui` | Canonical Trail tokens/icons/controls/materials/motion. No school grading or progression defaults. |

Reuse current membership/enrollment, recognition policy/period, verified practice/revision/reflection, immutable XP ledger and achievements. Do not use grades, attendance, goals alone, purchases, inferred emotion or unrelated community telemetry as XP sources. Existing level-like leaderboard ranks remain optional class-period placement, not progression levels. Current native numeric/rubric values are unchanged.

## Versioned school configuration

Separate three policies with explicit approval/version identities:

1. **Recognition policy** continues to define practice/revision/reflection point values and named milestone thresholds. Existing class periods remain pinned to their approved policy. Different schools can choose different values through the same code. Zero-point rules are valid when approved. New policy versions do not reprice old ledger rows or existing periods.
2. **Progression policy** defines bounded ordered numbered levels, localized human titles, strictly increasing nonnegative thresholds and optional earned evolution/cosmetic mappings. It contains no academic thresholds or globally hard-coded 100-XP rule. Each level threshold has one owner: the progression policy may pin an existing approved milestone threshold or own a separately approved level threshold, but cannot keep two mutable values for the same rule. Existing recognition achievements remain unchanged. The first zero-threshold level, if configured, is a starter presentation—not evidence of earned achievement. A school may disable progression or leave it unconfigured. Policy inputs require current expected revision, explicit human confirmation and effective context.
3. **Presentation policy** defines permitted approved asset packs/versions, default/compact/quiet/no-character choices and explicit mapping of actual year-group records to allowed presentation variants. No ordinal-to-age guess, birthday inference, trait classification or automatic maturity label. The same Student role and learning powers apply across variants.

The Foundation exposes administrator configuration and current-policy readback for these values with existing authority patterns. Policy mutations remain administrator-owned unless a later separately approved role policy delegates them. Teachers/coordinators may only read the permitted current learner/class purpose; neither can edit policy or grant/equip another student's cosmetic merely because their screen can display it. Parents do not gain private XP/progression projections from this feature; any future parent summary requires its own explicit approved projection.

## Long-term progression without changing period recognition

Use an explicit **school-scoped learner progression track** pinned to a progression policy version and activation/enrollment boundary. Progression is cumulative recorded-action progress within that school track, separate from class/recognition-period totals and the optional board. It is not a global lifetime child score and does not transfer across schools automatically.

Every progression contribution references the existing authorized recognition source and exact recorded XP ledger row/awarded points. Admit at most one canonical row per source observation across the learner's continuous school-track lineage, including when another period/backfill or policy transition sees that observation. For multiple otherwise eligible rows, choose the first immutable award by awarded-at then ledger identity; freeze that selected row and its points in the contribution record. A later award never replaces/reprices it. This tie-break identity is private, not a customer label. Track transitions inherit the lineage's consumed-source set/baseline rather than admitting old observations again. Historical imports must use the same deduplication boundary.

Do not blindly sum an unfiltered legacy summary: old/current source availability, policy, complete coverage, point basis and current actor scope must be validated. Partial history or unresolved eligibility returns review/unknown rather than an inflated level. The default activation cutoff is inclusive against the verified source observation's UTC occurred-at timestamp, not processing/awarded-at time. A delayed pre-activation observation or its later backfill is therefore excluded unless a separately reviewed bounded historical import explicitly admits it. Pin the cutoff and source-validation policy in the track.

Serialize concurrent learner-track updates. Source validation, recorded contribution, derived level/evolution/grant transitions, audit and outbox completion must commit coherently through the existing transaction/worker mechanism. Duplicate or stale events cannot award twice. GET/read operations are read-only and never issue grants or alter equipped state. Processing/pending status must distinguish an accepted learning action from recorded XP and derived progression.

Current level is the greatest approved threshold not exceeding the verified track total. Next level is the smallest higher threshold. Return its human title/number, threshold, remaining points and bounded progress derived from the current approved interval. Crossing several thresholds in one processed batch records each earned transition once; the client may summarize them in one nonblocking celebration. At the highest configured level, next level/remaining/progress-to-next are absent, not a false zero-percent next level.

When the recognition period ends or its leaderboard resets, the track and valid previously earned cosmetic grants do not regress. A new threshold policy does not silently relevel existing tracks: keep their pinned version. An explicit administrator track transition previews the old/new policy and baseline, requires current expected revision and confirmation, then appends the new binding/transition while preserving prior earned history. Do not offer a bulk migration/repricing engine until this bounded operation and its scale requirements are reviewed.

## State, truth and privacy contract

The proposed strict progression projection exposes a status such as ready, unconfigured, disabled, unobserved, processing or requires review; an explicit basis/coverage; track/current-policy context; an as-of time; verified points; current level; optional next-level interval; recorded achievements/evolution; current permitted cosmetic choices and source provenance behind deliberate detail.

Unknown, disabled, truncated or source-invalid values remain nullable. A complete configured empty track can return verified zero and its explicit starter state; unknown history cannot become zero or Level 1. Unobserved means no verified eligible contribution in a complete scope, not no effort. No field describes intelligence, personality, emotional health, total student quality or accreditation.

Current school/actor/role/entitlement/enrollment/object checks apply to read, selection, replay, transition and grant correction. Staff reads are purpose-limited and cannot reveal former schools/classes, sensitive notes or unrestricted history. Revoked access denies reads/equip/replay and clears protected browser presentation while preserving valid stored history. No raw identifiers as primary labels; English/Arabic names, class/course/period context, meaningful source dates and missing-context recovery remain necessary.

Disabling recognition stops new contributions, levels and earned grants. Its numeric progress projection is disabled/null; stored awards remain intact. Presentation availability is a separate policy decision: disabling rewards must not silently confiscate a valid equipped appearance or learning access. With missing/revoked presentation eligibility, show a neutral free/default or hidden appearance without implying punishment or invalid earning.

## Character stages and earned cosmetic foundation

Asset/catalog versions carry readable English/Arabic display names, character identity, supported poses, optional evolution/costume variants, compatible anchors, intrinsic dimensions, static/reduced-motion alternatives, provenance/rights state and publication availability. Approved identities are presentation content, not domain branches. Do not name a child after source adjectives such as smart/worried/wise.

School-approved level/milestone mappings can create immutable earned cosmetic/evolution grants referencing the exact source contribution or milestone, progression/asset policy versions and processing receipt. Selecting/equipping only chooses a currently allowed grant or free base variant; it cannot grant ownership, compute a level or award XP. Base Foxi/Owl/Hide support the same learning/help/rewards. Add more identities by catalog assets and approved policy, not copied UI.

Separate **earned validity** from **current availability**. School restrictions, rights withdrawal or temporary access loss can make a valid asset unavailable without rewriting earned history. Invalid underlying earning requires an authorized explicit reviewed annulment/replacement with reason and exact provenance; append it rather than editing/deleting the original XP, achievement, grant or level receipt. The correction transaction records the affected contribution and excludes an annulled contribution from the effective current eligible total, preserving its original recorded history. Dependent disputed level/grant eligibility is marked review-required and cannot create new/equipped advantages until the authorized correction decision; unaffected valid grants remain intact. Current effective progression may be lower after an actual source correction, but the UI uses neutral reviewed-correction language, never punitive companion demotion. GET reads only the recorded effective state and performs no correction/grant mutation. Purchase cancellation/refunds are not part of this increment.

Implement a narrow current learner presentation selection with expected revision and current policy/catalog versions, including character, compatible allowed costume/evolution, standard/compact density and system/quiet effects. Persist it server-side for authorized cross-device continuity; fallback on stale/unavailable asset or school change. A delayed prior-actor response cannot equip another actor's character. Cache only public versioned art, not protected progress/grants/choices. Selection never controls assessment/help/grade or social rights.

This foundation has no wallet, shop, pricing, checkout, subscription, advertising, paid currency or real payment integration. Later adult/institution commerce can contribute a separate cosmetic entitlement source after contracts/privacy/refunds/rights approval. It must not increase XP or academic privileges. Do not create empty future commerce modules now.

## Event and runtime behavior

Read the current [scalable event-processing foundation](scalable-event-processing.md) and [event-triggered worker decision](../decisions/2026-10-02-event-triggered-worker.md) before adding handlers. This integration reconciles the older design proposal with those current documents. Keep the worker-owned processor and private source authority.

Source mutations, audit and durable outbox commit together. Post-commit coalesced wakes only request bounded execution; recovery handles due/abandoned work. Define exact event schema/version compatibility, owner/source validation, deterministic idempotency, completion/review semantics, privacy and latency limits. A wake is not a grant and does not authorize an AI call. If another event stage is necessary, it must retain stable source identity and explicit completion rather than another authoritative task ledger.

Learning save/submission confirmation does not wait for derived levels. The UI shows confirmed work, then processing recognition/progression, and celebrates only a newly confirmed current-scope transition. Deduplicate by actual receipt and cancel on scope loss. Re-reading historical milestones cannot replay rewards on every page load. Quiet/reduced-motion retains static text/art; no guilt, hunger/health meter, missed-day punishment or purchased affection.

## Proposed API groups and implementation acceptance

The backend owner finalizes exact paths and schema names in existing Development public surfaces. Required groups are policy approval/readback; current track activation/preview/transition; learner progression/source reads; approved character/cosmetic catalog reads; earned/current-availability projection; own revision-aware presentation selection; and purpose-limited grant correction. Preserve existing `/v1/development` behavior and do not duplicate existing XP endpoints. Share published strict schemas with frontend before integration.

Required verification:

1. Verified practice/revision/reflection awards preserve configured values; retries/concurrent processing/backfill cannot double-count a track source or duplicate a level/grant.
2. Different school policies and new policy versions produce correct future awards; previous period rows and earned history are byte/meaning stable.
3. Verified zero/starter, below/exact threshold, multiple crossed thresholds, maximum level, unconfigured, disabled, unobserved, pending and source-incomplete cases return consistent typed values.
4. Recognition-period reset does not regress track progression or valid cosmetics; historical import/track transition is reviewed, revision-aware and preserves source identity.
5. Wrong learner/school/class/year-group/asset version, revoked access, unauthorized policy edit/equip/replay and unearned costume deny without writes.
6. Temporary availability loss does not annul earning; invalid-source correction appends provenance and does not mutate grades/XP/history.
7. Two-device expected-revision selection conflicts, stale policy, catalog withdrawal and delayed prior-actor responses remain recoverable and scoped.
8. Native numeric/rubric truth, goals, recorded streaks, optional class board, current parent publication and privacy remain unchanged.
9. Private/FORCE RLS/grants, idempotency/audit/outbox, worker failure/recovery, source-locked packing and no secrets/raw pupil payloads are tested.
10. Connected learner actions → worker XP/progression → current readback/equip and administrator policy readback pass API/SQL/browser tests; English/Arabic/mobile/keyboard/reduced-motion/no-character presentation passes without duplicate UI.

Run required architecture/docs/repository guards and meaningful unit/API/database/deny/recovery/browser checks on the current source. No image, metadata registry or green isolated unit test is feature acceptance. Report model assets, contract implementation, frontend integration, local verification and hosted/customer readiness separately.

## Sora asset production boundary

The design chat recorded the following offline source evidence; the backend documentation integration did not inspect credentials or run a model. The Website project has `G:/E Deviser Website/scripts/foundry-sora.mjs` and `docs/animation/foundry-sora.md`, with completed hero/future/toolkit job records and optimized MP4 files. Offline inspection on 3 October confirmed `AZURE_SORA_ENDPOINT`, `AZURE_SORA_DEPLOYMENT` and `AZURE_SORA_API_KEY` configured in its `.env.local`; no value was printed/copied and no live request was made. This is a dedicated Sora credential, not implicit permission to reuse an image/LLM key.

The founder authorizes reuse of that setup for reviewed character asset production. Read only the authorized variables into the private design-tool process when generating; never commit/copy the secret into app/browser/public configuration or import Website runtime code into Cuevo. No API/configuration change is required for deterministic progression. Use explicit generation, saved job identity and no blind duplicate creation on timeout. Ship only reviewed optimized public art/video with posters/static fallbacks and current rights/provenance. Model availability can change; do not make learner progress depend on Sora or any provider's availability.

## Coordinated implementation

The active backend chat owns mutable `G:/Cuevo`, current runtime verification and domain source. Send this build request at a coherent checkpoint; do not interrupt an existing source-frozen run or start a competing implementation here. The design chat owns Trail assets/UI and its isolated planning branch. Backend integration must merge this bounded extension into its current docs/AGENTS/registry/context map without replacing newer event/analytics instructions from an old root file.

Current point configuration is implemented. The new progression/presentation foundation is requested work, not a completed MVP claim. Initial school level thresholds/costume mappings remain unconfigured until explicitly approved; no invented default is inserted into school policy.

## Current-checkout integration checkpoint

Integrated additively from design worktree commit `fc90804c9787aeffad5a2f35f8aa4fcb2509de84`. Current event, analytics, tenant/source, TLS and repository instructions retain their existing authority. The backend has queued [explicit contract, SQL authority, event and acceptance tasks](../superpowers/plans/2026-10-03-character-progression-foundation.md); no level policy, track, cosmetic grant or saved selection is implemented by this documentation change. The current QA/profiler/browser-volume verification checkpoint must finish before app/SQL/migration work starts. Initial school levels and asset mappings remain unconfigured until explicitly approved. Design tooling and the final Trail frontend remain in the design chat.

## Reconciled Trail preparation

The design branch prepares the one authenticated `packages/ui` foundation, all five pure Home compositions, `WorkspaceChrome` and the shared static `CompanionView` with a bounded accepted still registry. These presentation components and source-reviewed assets do not implement levels, progression tracks, earned grants or saved selection, and do not change existing Development authority. The [approved migration plan](../superpowers/plans/2026-10-03-cuevo-trail-implementation.md) keeps exact current API/source/receipt binding, auth preservation and all-role acceptance pending. The coherent backend checkpoint is integrated for review, not a new frozen verification or customer/hosted readiness claim.
