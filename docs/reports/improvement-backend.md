# Governed improvement backend

Date: 1 October 2026. E Deviser company, Cuevo product.

The backend connects a released baseline result to a teacher-authored proposal, immutable human decision, assigned intervention, learner completion, manually released follow-up assessment and native-score outcome comparison. Teacher proposals are labeled TEACHER_AUTHORED. Live AI remains unavailable: authorized analyze requests retrieve minimum numeric/source context and return INTELLIGENCE_UNAVAILABLE/503 without fabricating generated output.

## Authority and records

`createImprovementController(identity,database)` exports the module for root registration. Strict schemas prohibit client origin/learner/grade authority fields. Baseline learner, reference and evidence IDs derive from the immutable result. Current tenant/entitlement/class/enrollment/source scope is checked before all mutations and stored replay responses.

Human approval locks a proposal and creates exactly one intervention/decision. Rejection creates no intervention. Changed reason/edited instructions on a subsequent decision conflict. Completion is student self only with current enrollment, and changed source reflection cannot overwrite the immutable completion. Parents have no intervention or outcome access in this increment.

Reassessment links once after completion and must match the baseline course, reference and teacher-defined native scale. Measurement requires the linked released follow-up for the same learner/reference version/scale, with immutable submission and release after completion. Absence/incompatibility rejects for review; missing values never become zero. Positive raw change meeting a teacher-selected positive threshold yields improved; smaller absolute change yields no_meaningful_change; a lower score meeting the threshold yields inconclusive/FOLLOW_UP_LOWER with the factual negative difference. Every outcome carries OBSERVED_CHANGE_NOT_CAUSAL_PROOF.

Decisions, completions and outcomes use append-only history with composite tenant/learner/source keys, private grants and RLS. Generic SQL tools are callable only by the trusted API role; workers/models have no raw mutation privileges. Semantic replay is serialized by transaction advisory locks. Canonical event keys depend on event/entity identity, so new-key no-op repetitions do not duplicate audit/domain events. Request-level stored responses remain idempotent.

Canonical events include recommendation.created/approved/rejected, intervention.completed, reassessment.linked and outcome.measured. The current worker explicitly acknowledges these known events without changing support/impact projections; source-driven intervention state refresh is a separate follow-up requirement. No empty support/impact snapshot is claimed to represent these new outcomes yet.

## Provider-independent scaffold

The isolated orchestrator accepts a minimum evidence context and injected AIProvider. It applies approved policy, timeout/token/cost limits, strict proposal output, allowed evidence IDs and a limited high-impact text check. Deterministic providers exist only in tests; there is no public fake-AI toggle and no live adapter or credentials were provisioned.

These tests prove citation membership, structured output, limit/timeout behavior and rejection of tested unsafe instructions. They do **not** prove semantic grounding, hallucination resistance, prompt injection robustness or real-model usefulness. Those production AI evaluations remain mandatory and blocked by configured provider/data approval. No AI completion claim is made.

## Verification

Initial strict command tests failed three cases before schemas. The persisted local Auth/API/Postgres scenario creates baseline and follow-up evidence through the existing learning/academic endpoints, then executes proposal → approval → completion → reassessment → comparison. It covers rejection without action, duplicate approval/replay, changed edit/reflection conflict, unrelated learner and parent denial, significant lower follow-up, revoked teacher replay and revoked student enrollment. Actual SQL counts verify one approved action and one canonical approval event after a different-key replay.

Final sequential checks:

```text
node node_modules/supabase/dist/supabase.js test db --network-id cuevo-local
  8 files passed; 197 checks passed

node node_modules/vitest/vitest.mjs run apps/api/test/improvement --reporter=dot
  3 files passed; 9 tests passed; actual local integration executed

node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js apps/api/src/improvement apps/api/test/improvement* packages/contracts/src/improvement.ts
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json
git diff --check -- [improvement changed paths]
  exit 0; no diagnostics
```

The new SQL suite contributes eight schema/grant/source-denial checks. Full functional loop behavior is currently covered by the actual API/database scenario rather than an independent complete SQL golden fixture. Root clean replay, browser evidence and independent review remain outstanding.

CLI-generated additive migrations persist improvement records/functions and refine current student enrollment, reflection/decision integrity, immutable follow-up source timing and canonical event acknowledgement. All were applied locally preserving Auth; no remote mutation, reset or git commit occurred. Synthetic seed adds improvement entitlement; running local synthetic tenants received the same explicit loopback/56322 checked update.

## Remaining requirements

OpenAPI input schemas are present but complete output/error/pagination coverage remains partial. Native numeric outcome comparison is implemented; rubric results, revision-after-feedback, community/engagement scope, official curricula, production provider evaluation and complete learner support/impact event refresh remain required before MVP exit.
