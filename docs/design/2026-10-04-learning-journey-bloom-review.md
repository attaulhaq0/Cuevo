# Learning journey and Bloom review

Status: founder-requested audit and visual proposal, 4 October 2026. Bloom implementation and these new Student compositions have not been approved. This document records findings and a proposed boundary; it does not replace numbered product specifications or authorize a new adaptive engine.

## Current verdict

The inspected MVP has no Bloom taxonomy definition, task mapping, reviewed cognitive-demand tag, learner Bloom-stage projection or taxonomy test suite. This was checked in the design worktree at `332c85b` and read-only in the backend checkout at `8ede801`, including its existing observation-policy candidate. Searches were corroborated by contracts, services, SQL, locked curriculum artifacts, owner READMEs and representative tests; absence is not inferred solely from a missing screen.

The learning-improvement loop already supplies useful foundations:

| Capability | Implemented source | Limit |
|---|---|---|
| Course → Unit → Lesson → Activity | [Learning contracts](../../packages/contracts/src/school-learning.ts), [versioned content](../../packages/contracts/src/learning-content.ts), [Learning API owner](../../apps/api/src/modules/school-learning/README.md) | Published sequence and five current activity kinds; no cognitive-demand or prerequisite graph |
| Completion and submissions | Existing completion receipts, source-linked submission lifecycle and private quiz checking | Completion is not assessed mastery; quiz checking is not grading |
| Released assessment/evidence | [Academic contracts](../../packages/contracts/src/academic.ts) and existing immutable release/correction | Preserve native numeric/rubric meaning and exact evidence/policy context |
| Current learner context | [Learner State contracts](../../packages/contracts/src/learner-state.ts) | Separate academic, observed-action, support and outcome projections, with unknown/freshness/coverage |
| Approved differentiated practice | [Improvement contracts](../../packages/contracts/src/improvement.ts), current source-authorized orchestrator and human decisions | Bounded approved choices/help/reassessment; no unrestricted student coach |
| XP, milestones and streak | [Development owner](../../apps/api/src/modules/development/README.md) and approved observed-action ledger | Practice/revision/reflection recognition, separate from attainment; numbered levels and cosmetics remain queued |

The current Home keys `lesson`, `feedback`, `practice`, `reflect`, `grow` are workflow destinations. They do not express Remember/Understand/Apply/Analyze/Evaluate/Create, a fixed learner ability, or mandatory academic progression. Source [12](../product/domains/12-PERSONALIZED-LEARNING.md) explicitly limits MVP to one targeted intervention, differentiated practice path and reassessment, excluding a full adaptive engine. Source [13](../product/domains/13-LMS-LXP-FUNCTIONAL-SPEC.md) separates completion, assessed progress, outcomes and goals; sources [17](../product/domains/17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md) and [58](../product/domains/58-BEHAVIOR-AND-LEARNING-SCIENCE.md) preserve native academic truth and non-diagnostic learning lenses.

## What the supplied reference can contribute

Keep its connected route, one expanded selected activity, adjacent useful context and direct next action. Its software-database topics are design inspiration, not K–12 curriculum authority.

Do not connect its mastered checks, “Level 3 student,” 65% mastery, 2/5 concepts, +18% improvement, 3–5 hour duration, automatic assignment +25 XP, locked later stages or automatic AI Coach Tip. Those exact meanings have no current approved source, formula, denominator or access policy. An activity's thinking demand, task difficulty, completion, native attainment, access eligibility and XP level are separate concepts.

Use Bloom, if later approved, as reviewed metadata describing the thinking an activity asks for. Do not require every objective or student to climb all six categories in order. Teachers may need mixed-demand activities and scaffolding; returning to a category is ordinary learning, not demotion. A companion explains the current approved task and supports choice without assigning intelligence or emotional traits.

## Current UI audit and achievable improvements

Three intercepted fictional journeys at EN1536, EN390 and AR390 traversed Home → course → lesson → practice → linked quiz. Fifteen state captures had no observed page/console warning, axe violation or horizontal overflow. These are layout/interaction observations with fictional intercepted sources, not a new real-backend, database or Gate 5 verification run.

| Finding | Observed consequence | Composition using current owners |
|---|---|---|
| Desktop lesson reading flex alignment and narrow child sizing | Content occupies a narrow left plane with large unused canvas | Give source reading a comfortable main width; reserve a compact rail only for actual activity/source context |
| Repeated mobile shell/course/unit/back headings | Lesson directory begins beyond 1000px in the captured phone journey | Compact course context and an immediate current unit/lesson navigator |
| Empty resource panel precedes practice action | Completion action begins around 1190px in AR390 | Put instructions and the existing completion form first; collapse optional empty resources/source maintenance |
| Linked activity and assessment repeat nested preambles | Quiz questions begin around 2067px in AR390 | Compose the exact selected quiz through its single current owner, with supporting context disclosed compactly |
| Home next task competes with lower context | Current action is available but its context is spread across panels | One dominant task, quieter workflow trail, released feedback from distinct earlier work and source-backed recognition separately |

Do not add cards to fill whitespace or force all learning content into a non-scrolling viewport. Make the first action easy to reach; long lessons, records and phone journeys still need natural scrolling. Existing query, authorization, command journal/idempotency key, publication, private documents and confirmed receipts remain with their owners. Preserve approved authentication/mobile and the existing global header/catalogue. Current unavailable teacher/unit/material/recognition context stays explicit.

## Proposed engineering sequence

1. **Academic definition and scope.** Obtain an approved taxonomy source/version, rights and EN/AR terms. Confirm exact author/reviewer roles and the first course/objective. The six labels in the image are proposed vocabulary until this artifact exists. Define multi-focus versus primary focus and unmapped/requires-review states without inventing official curriculum mappings.
2. **Versioned metadata through existing owners.** Curriculum owns taxonomy vocabulary/context; Learning owns exact immutable activity/content-revision mappings; Academic owns assessment/criterion-revision linkage. Use strict `@cuevo/contracts`, expected-revision checks and private append-only migration history. A content/taxonomy change does not silently retag historical evidence. Audit and durable outbox commit with consequential mapping/review commands. No parallel learning application or generic catch-all taxonomy service.
3. **Truthful first read view.** Group one authorized course/objective's reviewed activities and native evidence by thinking focus. Show available activity, awaiting review, released evidence, unclassified and unknown distinctly. Category browsing never grants task access. Student sees “This activity uses Apply,” rather than “You are an Apply-level learner.” Parent receives only an independently authorized current-child/publication projection. Retain current approved practice actions.
4. **Evidence policy only by separate decision.** If mastery is wanted later, the Academic owner must define versioned qualifying evidence, objective/criterion scope, recency, sufficiency, comparisons and uncertainty. This proposal defines no percentage or threshold. Completion and a taxonomy tag do not establish mastery; incomplete coverage never produces a zero or misleading denominator.
5. **Bounded personalization, then explicit prerequisites if needed.** Reuse current authorized options and human decision, adding reviewed tag context and a source explanation. Any enforced prerequisite requires its own school policy, versioned dependencies, cycle checks, accessibility exceptions and server eligibility verification. Whole-curriculum automatic routing would exceed source12's current MVP and needs a separate product decision.
6. **Existing asynchronous foundation and measured scale.** Follow the [accepted event plan](../architecture/scalable-event-processing.md) and [worker decision](../decisions/2026-10-02-event-triggered-worker.md): one source/audit/outbox transaction, source-validated idempotent worker, bounded objective/learner refresh, authenticated coalesced wake and recovery. Index tenant/course/objective/category/version/source lookups and use bounded pages with coverage. Measure backlog and latency before claiming scale. No model call per click, full-school recompute, second event ledger or speculative microservice.
7. **Optional AI assistance after deterministic foundation.** Reuse current orchestration mechanisms only after adding a separately approved purpose, output schema, policy/prompt binding and evaluation for taxonomy/activity drafts. The existing workflow permits next-learning-action proposals for guided practice or feedback review; it is not a shipped Bloom classifier or activity generator. Drafts cite allowed source material. Declare purpose, actor, data class, context, provider/model, schema, provenance, approval, audit, failure and cost/latency limits. Approval by the authorized academic reviewer is required; exact author/reviewer roles must be defined in step1. AI cannot publish authoritative mappings, grades, mastery or access. Existing XP awards and the separately queued character foundation remain independent.

First-slice acceptance must cover draft/rejected/approved mappings, wrong taxonomy/content revision, source retirement/correction, tenant/role/course/enrollment/entitlement/object scope, Parent child/publication limits, explicit unknown/unclassified/partial coverage, native zero/full rubric without scalar conversion, idempotent review/retry, worker stale-source/recovery, stale UI/403 clearing, EN/AR/RTL, mobile/native zoom, keyboard/axe/reduced motion and actual API/SQL/grants/browser journeys. Later mastery/prerequisite policies require separate acceptance. Run architecture/docs/repository guards with implementation. A picture, unit test or vocabulary enum alone is not customer acceptance.

## Review artifacts and checkpoint

External review folder: `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-bloom-review`. It contains the supplied-image grounding, `backend-audit.md`, `journey-audit.md`, actual fictional-source captures, independent `image-review.md`, individual prompts and generated image files. Images are reference-only, never runtime assets. The current set compares:

- Current Trail: proposed composition using existing MVP fields/actions.
- Thinking Path: proposed Student experience requiring reviewed Bloom metadata.
- Teacher Design Workbench: proposed exact-source tag drafting and human review.

Desktop and mobile are separate images, not combined workflow collages. Selected replacement paths and dimensions are recorded in external `review-manifest.json`; discarded first renders remain separate evidence. Generations used the founder-authorized Foundry deployment and bundled Image Gen CLI, with real reference/current captures/logo and the Student Foxi asset attached. No backend, database, application UI or authentication changes were made for this audit/visual work. Await founder selection before implementing the new learning/Bloom proposal; the previously approved all-role redesign remains a separate active goal.
