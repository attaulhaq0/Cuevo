# Cuevo student companion, recognition and growth strategy

Date: 3 October 2026, Asia/Riyadh. Status: proposed strategy for founder review. Scope: a modular companion in the selected single Trail experience; MVP presentation first, durable cosmetic/commerce capabilities later.

This strategy forms part of the [Trail MVP migration proposal](2026-10-03-cuevo-trail-mvp-redesign.md). It refines the [original character plan](../../design/2026-character-mvp-and-growth.md) using the founder's selected Foxi sitting-at-task reference and explicit permission to propose additional characters, expressions and motion. Earlier restrictions against any new student pose no longer apply to the newly requested asset work. Existing product rules, known source/rights limits and approval before implementation remain intact.

## Product thesis

The student should feel that Cuevo recognizes their chosen path, helps them start, makes feedback understandable and lets them see their own work develop. The familiar companion creates continuity through art, useful context, warm authored language and meaningful acknowledgment. It is an optional product character, not a simulated exclusive friend, clinician or source of emotional authority.

The daily rhythm is: see my goal and available work → choose an approved next step → read/attempt → save/submit my own work → read released teacher feedback → use approved practice/help → revise/reflect → see confirmed recognition → select portfolio work and connect with the permitted class. The companion follows the current authorized task; it does not replace the teacher or decide a curriculum path.

## Four independent dimensions

| Dimension | Input and ownership | Effect |
|---|---|---|
| Learning path | Current course/task, own submission, teacher feedback, approved support and source availability; existing learning/academic/improvement owners. | Decides the meaningful current action. No cosmetic choice changes this. |
| Presentation stage | School-reviewed year-group/stage mapping when accepted, with an explicit learner choice among permitted styles. | Changes copy density, illustration prominence and effect level; no maturity diagnosis or new academic role. |
| Companion identity/appearance | Approved character pack, pose and optional costume; learner selection. | Changes art and expression, with the same controls/help/rewards. |
| Recognition/growth | Existing school-approved current milestones and verified recorded practice/revision/reflection; Development authority. | Displays an earned milestone/celebration now; a durable cosmetic chapter belongs to later phase C. It does not grant grades, work access, intelligence or peer standing. |

No model assigns maturity from grades, attendance, click duration, streak gaps or protected traits. Year groups, curriculum stage and actual age are different data; existing ordinals alone do not justify an age threshold. Staff and student are authorization roles, while younger/older presentation is configuration. Do not create separate junior and adult applications.

## MVP experience

Start with Foxi, Owl and Hide using reviewed supplied or newly approved assets. Foxi sits at the task pedestal as requested. Keep this slot modular so Owl or another later character can occupy it without a new page implementation. The pedestal, current action, progress route, reward shelf and glyph family remain Trail components.

The first asset review can include two additional character candidates alongside Foxi/Owl, each with the same ready/working/confirmation vocabulary and a static fallback. Select their identities and localized names through founder/design review rather than inventing approved school defaults. Integrate only the accepted small starter pack; expand the registry with more characters after the first connected Student review. Additional artwork is presentation content, not another backend feature or per-character code branch.

Provide standard, compact and quiet presentation within the same system. Without an accepted school-stage policy, offer explicit choices and a neutral default rather than guessing an age. Current-session choices are scoped to school/actor and clear on sign-out, actor/school change and protected-access loss. Durable cross-device choices and school policy editing do not already exist; they require a narrowly approved future contract. Do not disguise a new settings service as an existing MVP feature.

Existing learner goals use the current course, planned step and explicit review/closure contract. Current profile supplies authorized school/class/year-group/course labels. Existing recognition supplies immutable ledger, approved period/policy and achievements. Current task help is the implemented human question/response and frozen teacher-approved choices. These current capabilities are used directly; no duplicate planner, reward engine, learner profile or chat endpoint is introduced.

| Real state | Companion treatment | Primary meaning |
|---|---|---|
| Available lesson/task | Seated/ready pose; current task named. | Continue the available work. |
| Reading/working | Attentive pose, optional short authored prompt. | Keep the student's work and controls primary. |
| Saving/submitting | Static waiting state. | The request is pending; no earned reward yet. |
| Confirmed work receipt | Brief acknowledgment once. | Your work was saved/submitted; a grade is not implied. |
| Teacher feedback released | Reading/explanation pose beside attributed feedback. | Read what the teacher released and the permitted next step. |
| Approved practice | Practice pose; exact approved option/context. | Try an available school-approved activity or ask current human help. |
| Reflection saved | Gentle confirmation. | Your reflection is recorded; goals alone do not award points. |
| New recognized ledger/milestone readback | Short optional celebration and named reason. | The school-approved action or milestone is actually recorded. |
| Unknown, offline, denied or uncertain write | Neutral/static art or no art; normal localized recovery. | Verification is unavailable; retain the exact supported retry/access behavior. |

Celebrations are deduplicated by a confirmed record in the active session, canceled on scope loss and never triggered simply by a click or by replaying old history at startup. A submission receipt and later worker recognition receipt are separate: show work complete while recognition is processing, then display awarded points only after the current authoritative readback. Disabling recognition never disables learning or companion navigation.

## Growth that can last across K–12

Use three forms of continuity rather than one escalating score:

1. The **work trail** shows current tasks and exact submitted/released/approved states.
2. The **milestone shelf** shows meaningful recorded practice, revision and reflection achievements with their school policy context and reason.
3. The **companion collection** changes appearance through approved chapters and costumes, while the character remains recognizable.

Proposed art chapters such as Explorer, Builder and Guide are names for visual collections, not descriptions of the child's intelligence or personality. Character growth does not depend on age alone and does not make an older learner inherit childish art. A compact mature style can retain the same familiar character with quieter materials and smaller placement. Students can keep an earlier appearance or switch companion without losing recognized work.

For MVP, display current approved achievements and select an appropriate authored celebration from those facts. Do not add unapproved thresholds or claim lifetime accumulated growth when only a selected-period summary exists. School policy owns points/milestone rules; no hard-coded 12 points or 5/3/2 policy comes from the image. Numeric/rubric attainment stays native and separate.

Later durable collection growth needs its own cosmetic grant/history projection. Recognition period resets must not shrink, demote or erase a previously granted costume. Earned cosmetics may use approved milestone receipts as one grant source; this layer never rewrites the XP ledger. Source correction/withdrawal affects grant eligibility through an explicit reviewed rule, not a silent punitive animation.

## Emotional connection and motivation

Offer meaningful agency: choose the companion, decide among permitted practices, set a goal, show the work and choose quiet/compact mode. Encourage process with specific, truthful language: “Your revision is recorded,” “You can read your teacher's feedback,” or “Ready for the next step.” Let the student inspect why recognition appeared. Reward signals are non-comparative by default; the existing opt-in class alias board remains optional.

Do not use hunger/health meters, disappointed poses after a grade, missed-day punishment, secret-friend language, “I missed you” obligation, exclusive affection, spending pressure or compulsive timers. The character does not infer or diagnose the student's mood. An expressive smile is an animation of a product character, not a claim about the learner's emotion. Personal reflection remains the existing purposeful learner record; no mood surveillance, wellbeing score or new psychological profile is introduced.

Use playful stickers/expressions only as optional feedback, backed by the same localized text. Every learner has equivalent help, recognition and encouragement with any free or paid appearance. A paid costume must not receive more affectionate or privileged responses.

## Modular technical design

One shared decorative registry/renderer receives permitted presentation state from existing feature owners. It does not fetch learner data, choose a curriculum objective, call an AI provider, award points or send academic commands. Generic controls/materials/motion live in `packages/ui`; feature-specific policies stay beside Learning/Development/Home/Improvement. Shared code never imports feature implementations.

The pack manifest records identity, version, approved display label/localization, compatible poses/anchors, intrinsic dimensions, static fallback, optional animation, motion/byte policy and provenance/rights evidence. Each character supports the same finite state vocabulary. Missing art falls back to the base pose and ordinary semantic text/actions, preserving all workflow capability.

Keep character, costume, pose, stage and density independent. Layers are allowed only where accepted source artwork actually supports them; otherwise use a curated compatible variant pack. Do not assume every generative pose can wear every costume without review. Do not generate per-student art at runtime or duplicate screens for individual schools/characters.

Load only the active optimized public art, reserve layout dimensions, defer secondary poses and use versioned static caching. Do not put protected goals, task bodies, recognition or chosen-child data into a service-worker cache. Browser preferences must not reuse the protected form-draft store. Static art works offline while protected presentation follows existing access/offline clearing.

Motion ordinarily lasts 120–280ms for interaction/confirmation. A milestone celebration is short, nonblocking and optional, with no sound/autoplay default. Quiet/reduced-motion gives the same static art, text and action. Review actual desktop/mobile placement and 200% reflow; art cannot float over labels, steal keyboard focus or cover evidence. English and Arabic choice names/feedback share meaning and accessible semantics.

## Controlled rollout beyond MVP

| Phase | Deliverable | Boundary |
|---|---|---|
| A. MVP Trail companion | Foxi/Owl/Hide; current-session standard/compact/quiet choice; actual task-state poses; existing goals and confirmed recognition shelf. | UI/assets only around current contracts. No store, saved cosmetic ownership or new AI endpoint. |
| B. School presentation policy and continuity | Exact approved year-group/stage choices, versioned school policy, authorized cross-device preference and current allowed-assets projection. | New narrow configuration/preference contract with privacy, revision/idempotency and access tests. |
| C. Collections and durable earned cosmetics | Versioned character/costume catalog, compatible appearances and immutable cosmetic grants from an approved source. | Separate cosmetic history/entitlement; no grade/XP/learning permission mutation. |
| D. Business model | Institution-licensed collections first; optional adult-purchased fixed-price packs later. | Adult purchaser and school policy, transparent offer/receipt/refund, commercial rights and payment integration acceptance. |
| E. Richer assistance/media | Reviewed authored story/media or separately governed student help if it serves a demonstrated task. | Purpose/context/tools/provider/schema/provenance/approval/audit/failure/cost/evaluation contract, never an implicit tutoring launch. |

These phases define future extension boundaries; no empty folders/tables/wallet/payment services are created now. Adding a current persisted stage policy is a scope decision, not a styling shortcut. Future asynchronous handlers follow the accepted durable outbox, bounded worker and recovery foundation.

## Cosmetic business model

Recommend institution licensing as the first offer: schools enable reviewed collections for a cohort, so family spending is not visible as class status. Optional adult/guardian purchases can later acquire fixed-price cosmetics for an eligible learner subject to school policy. Purchases never happen through child-pressure prompts, hidden prices, randomized loot boxes, artificial scarcity, streak rescue, competitive boosts or ads targeted from pupil activity.

Separate concepts for the later accepted commerce design: asset/catalog version; school presentation policy; learner selection; cosmetic grant with institution/adult-purchase/approved-milestone source; adult order/payment receipt; equip selection. Server verification checks grant, policy and asset compatibility. Payment settlement/refund is idempotent/auditable and outbox-backed. Only a minimal allowed-cosmetics read projection reaches the student; no card/key/purchaser details enter the learner UI.

Do not make recognized XP spendable currency silently. Costs, earn rules and commercial content require their own founder review. Refund or license expiry changes appearance availability, with a neutral free fallback; it never removes learning, grades, help, historical milestones or ordinary encouragement. Public spender rankings or premium-ownership badges are excluded.

## Evidence and success measures

Assess the experience through school-approved usability tasks and explicit feedback: can a learner find the current action, understand pending versus confirmed work, choose/hide the companion, explain a milestone reason, distinguish points from grades, use mobile/Arabic/keyboard/quiet mode and resume after a permitted source refresh? Designers review recognition clarity, warmth, art consistency, visual density and mature styles. Teachers/parents review source/control clarity in the complete loop.

Measure task success, error recovery, voluntary preference and participant feedback at its actual approved research scope. Do not claim emotional attachment, confidence, mental health, intelligence or improved attainment from session duration, return frequency or event totals. Existing diagnostics and PostHog remain minimized, environment-separated and policy-gated; no new replay/raw-content ingestion is enabled for this design.

Verification covers exact task/source/actor context, unknown/disabled recognition, no optimistic awards, duplicate receipts, offline/revocation cancellation, period change, all appearance choices, missing/unsupported assets, reduced effects, resize/native zoom/RTL, bundle/asset budgets and actual backend-connected Student → Teacher → Parent work. Commercial and cross-device phases need additional explicit contracts/tests and do not inherit MVP image acceptance.

## Decisions requested with the plan

Approve Foxi/Owl/Hide with standard/compact/quiet as the first MVP expression; retain free equivalent learning and rewards. Approve phase boundaries: no school-stage editor, durable costume grants, store or open-ended student AI in the initial UI migration. Review small character asset sheets and Student desktop/mobile/Arabic previews before the next role starts. After observing this MVP, use actual research and a separate scope decision to prioritize phases B–E.
