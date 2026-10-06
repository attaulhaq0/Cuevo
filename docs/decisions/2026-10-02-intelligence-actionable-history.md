# Teacher Insight actionable context and historical support

Date:2 October2026. Status: implemented and focused verification passed. Product: Cuevo by E Deviser. Sources10/12/39/78/81/83 and the [expanded lifecycle review](../product/qa/MVP-EXPANDED-LIFECYCLE-REVIEW.md) govern this decision.

## Problem

Fresh Teacher Insight could retrieve a prior intervention whose baseline had been corrected. Later saved-context checks correctly denied that old baseline, making a proposal on valid new evidence immediately unusable. Completion also rebuilt the entire top-N context and rejected an unrelated new allowed option while the provider was running. Both defects were reproduced with deterministic real-Auth/API fixtures.

## Decision

Actionable context selects only sources that the existing private saved-source verifier can authorize. Stale prior interventions/results/outcomes are omitted before bounded selection. Authorized observation assembly uses the existing exact source/event helper. Separately permitted historical support remains in its original history reader with requires-review semantics; omission from new actionable context does not erase records or claim no prior support existed.

Completion reauthorizes the exact immutable saved context rather than demanding that later top-N queries return identical bytes. The exact baseline, latest submission, tenant/course/programme, policy, lease, provider output, cost/token and human-approval guards remain. Saved option kind/title/instructions must still match the authorized source. Unrelated additions are accepted; corrected/revoked/changed saved sources remain denied.

## Tradeoff and limits

The new analysis does not reason over stale historical support. It uses the existing bounded current schema, so missing history is a capability limit, not negative evidence about the learner. A future history-safe model envelope must explicitly distinguish historical review state and have its own authorized predicate. This decision does not add richer model transport, prompt registry, policy propagation, selected-ID persistence, rubric insight or autonomous reconciliation.

Migration `20261001205816_actionable_insight_saved_source_authority.sql` is append-only. SQL151 and the customer intelligence recovery integration cases exercise valid fresh evidence, unused additions, historical source preservation, exact source changes and private grants. Existing current-source/approval/history tests remain required. No new live model call is needed.
